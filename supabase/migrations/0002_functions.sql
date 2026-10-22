-- DRAGON APEX TALENT — funções, gatilhos e regras de negócio no servidor.
-- Toda regra de cobrança e de liberação roda aqui: o frontend nunca decide valor, status ou ativação.

-- ───────────────────────── Auxiliares ─────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.companies where owner_id = auth.uid();
$$;

create or replace function public.setting_num(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select (value #>> '{}')::numeric from public.settings where key = p_key;
$$;

-- Marca a transação atual como operação interna (RPCs confiáveis), liberando os gatilhos de proteção.
create or replace function public._internal() returns void
language sql set search_path = public as $$ select set_config('dat.internal', '1', true); $$;

-- Interno = RPC confiável (flag acima) ou execução fora dos papéis da API (SQL Editor, service_role, funções
-- security definer). Requisições do site rodam como anon/authenticated e passam pelos gatilhos de proteção.
create or replace function public._is_internal() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('dat.internal', true), '') = '1' or current_user not in ('anon', 'authenticated');
$$;

create or replace function public._audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details);
$$;

create or replace function public._notify(p_user uuid, p_title text, p_body text, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link) values (p_user, p_title, p_body, p_link);
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;

create trigger t_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_pro_touch before update on public.professional_profiles for each row execute function public.touch_updated_at();
create trigger t_jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();
create trigger t_apps_touch before update on public.applications for each row execute function public.touch_updated_at();
create trigger t_courses_touch before update on public.courses for each row execute function public.touch_updated_at();
create trigger t_talent_touch before update on public.talent_bank for each row execute function public.touch_updated_at();

-- ───────────────────────── Cadastro (auth.users → perfis) ─────────────────────────
-- O papel vem do metadata do signUp, mas "admin" nunca é aceito por aqui.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role public.user_role;
  c jsonb;
begin
  v_role := case meta->>'role' when 'company' then 'company'::public.user_role else 'professional'::public.user_role end;

  insert into public.profiles (id, role, full_name, email, phone)
  values (new.id, v_role, coalesce(nullif(meta->>'full_name',''), split_part(new.email,'@',1)), new.email, meta->>'phone');

  if v_role = 'professional' then
    insert into public.professional_profiles (user_id, whatsapp) values (new.id, meta->>'phone');
    if (meta->>'lgpd_consent')::boolean then
      insert into public.consents (user_id, kind, granted) values (new.id, 'lgpd_tratamento', true), (new.id, 'termos_uso', true);
    end if;
  else
    c := coalesce(meta->'company', '{}'::jsonb);
    if coalesce((c->>'terms_accepted')::boolean, false) is not true then
      raise exception 'termos_nao_aceitos';
    end if;
    insert into public.companies (owner_id, name, cnpj, responsible_name, responsible_role, corporate_email,
                                  phone, whatsapp, city, state, sector, website, description, terms_accepted_at)
    values (new.id, c->>'name', nullif(c->>'cnpj',''), coalesce(meta->>'full_name',''), c->>'responsible_role',
            new.email, meta->>'phone', c->>'whatsapp', c->>'city', nullif(c->>'state',''), c->>'sector',
            nullif(c->>'website',''), c->>'description', now());
    insert into public.consents (user_id, kind, granted) values (new.id, 'termos_uso', true), (new.id, 'politica_privacidade', true);
  end if;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Gatilhos de proteção ─────────────────────────
create or replace function public.guard_profiles() returns trigger language plpgsql set search_path = public as $$
begin
  if not public._is_internal() and not public.is_admin() then
    new.role := old.role;
    new.email := old.email;
  end if;
  return new;
end; $$;
create trigger t_guard_profiles before update on public.profiles for each row execute function public.guard_profiles();

create or replace function public.guard_professional() returns trigger language plpgsql set search_path = public as $$
begin
  if not public._is_internal() and not public.is_admin() then
    new.activation_status := old.activation_status;
    new.activated_at := old.activated_at;
  end if;
  return new;
end; $$;
create trigger t_guard_professional before update on public.professional_profiles
  for each row execute function public.guard_professional();

create or replace function public.guard_companies() returns trigger language plpgsql set search_path = public as $$
begin
  if not public._is_internal() and not public.is_admin() then
    new.verified := old.verified;
    new.suspended := old.suspended;
    new.credit_balance := old.credit_balance;
    new.owner_id := old.owner_id;
    new.terms_accepted_at := old.terms_accepted_at;
  end if;
  return new;
end; $$;
create trigger t_guard_companies before update on public.companies for each row execute function public.guard_companies();

-- Empresas só movem a vaga entre rascunho e revisão; publicação, pausa e encerramento passam pelas RPCs.
create or replace function public.guard_jobs() returns trigger language plpgsql set search_path = public as $$
begin
  if public._is_internal() or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft','in_review') then raise exception 'status_invalido'; end if;
    new.billing_exempt := false; new.published_at := null; new.expires_at := null;
    new.created_by := auth.uid();
    return new;
  end if;
  if old.status not in ('draft','in_review','rejected') then
    raise exception 'vaga_bloqueada_para_edicao';
  end if;
  if new.status not in ('draft','in_review') then raise exception 'status_invalido'; end if;
  new.billing_exempt := old.billing_exempt; new.published_at := old.published_at;
  new.expires_at := old.expires_at; new.company_id := old.company_id; new.review_note := old.review_note;
  return new;
end; $$;
create trigger t_guard_jobs before insert or update on public.jobs for each row execute function public.guard_jobs();

create or replace function public.guard_applications() returns trigger language plpgsql set search_path = public as $$
begin
  if public._is_internal() then return new; end if;
  if tg_op = 'INSERT' then
    new.stage := 'received'; new.favorite := false; new.hired_confirmed_by := null; new.hired_confirmed_at := null;
    return new;
  end if;
  -- mudanças de etapa só via move_application (registra histórico e responsável)
  new.stage := old.stage; new.hired_confirmed_by := old.hired_confirmed_by; new.hired_confirmed_at := old.hired_confirmed_at;
  new.job_id := old.job_id; new.professional_id := old.professional_id;
  return new;
end; $$;
create trigger t_guard_applications before insert or update on public.applications
  for each row execute function public.guard_applications();

create or replace function public.guard_transactions() returns trigger language plpgsql set search_path = public as $$
begin
  if not public._is_internal() then raise exception 'use_as_rpcs_de_pagamento'; end if;
  return new;
end; $$;
create trigger t_guard_transactions before insert or update on public.transactions
  for each row execute function public.guard_transactions();

create or replace function public.guard_ledger() returns trigger language plpgsql set search_path = public as $$
begin
  if not public._is_internal() then raise exception 'livro_razao_imutavel'; end if;
  return new;
end; $$;
create trigger t_guard_ledger before insert or update or delete on public.wallet_ledger
  for each row execute function public.guard_ledger();

-- Limite simples anti-abuso para o formulário de contato.
create or replace function public.rate_limit_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.contact_messages
      where lower(email) = lower(new.email) and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'muitas_mensagens_aguarde';
  end if;
  new.handled := false;
  return new;
end; $$;
create trigger t_rate_contact before insert on public.contact_messages for each row execute function public.rate_limit_contact();

-- ───────────────────────── Cobranças PIX ─────────────────────────
create or replace function public._new_txid() returns text language sql set search_path = public as $$
  select 'DAT' || upper(substr(md5(gen_random_uuid()::text), 1, 22));
$$;

-- Cria (ou reaproveita) a cobrança. O valor é sempre calculado aqui, a partir das configurações.
create or replace function public.create_charge(p_kind public.charge_kind, p_reference uuid default null, p_amount numeric default null)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_tx public.transactions;
  v_amount numeric;
  v_company uuid;
  v_course public.courses;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  select role into v_role from public.profiles where id = v_uid;
  perform public._internal();

  if p_kind = 'activation' then
    if v_role <> 'professional' then raise exception 'somente_profissionais'; end if;
    if (select activation_status from public.professional_profiles where user_id = v_uid) = 'active' then
      raise exception 'perfil_ja_ativo';
    end if;
    select * into v_tx from public.transactions
      where user_id = v_uid and kind = 'activation' and status = 'awaiting' order by created_at desc limit 1;
    if found then return v_tx; end if;
    v_amount := public.setting_num('activation_fee');

  elsif p_kind = 'job_credit' then
    v_company := public.my_company_id();
    if v_company is null then raise exception 'somente_empresas'; end if;
    if (select suspended from public.companies where id = v_company) then raise exception 'empresa_suspensa'; end if;
    v_amount := round(coalesce(p_amount, 0), 2);
    if v_amount < public.setting_num('job_daily_rate') or v_amount > 10000 then raise exception 'valor_invalido'; end if;

  elsif p_kind = 'course' then
    select * into v_course from public.courses where id = p_reference and status = 'published';
    if not found then raise exception 'curso_indisponivel'; end if;
    if v_course.price = 0 then raise exception 'curso_gratuito_use_inscricao'; end if;
    if exists (select 1 from public.enrollments where course_id = v_course.id and user_id = v_uid and status in ('active','completed')) then
      raise exception 'ja_inscrito';
    end if;
    insert into public.enrollments (course_id, user_id) values (v_course.id, v_uid) on conflict (course_id, user_id) do nothing;
    select * into v_tx from public.transactions
      where user_id = v_uid and kind = 'course' and reference_id = v_course.id and status = 'awaiting' limit 1;
    if found then return v_tx; end if;
    v_amount := v_course.price;
  end if;

  insert into public.transactions (user_id, company_id, kind, reference_id, amount, txid)
  values (v_uid, v_company, p_kind, p_reference, v_amount, public._new_txid())
  returning * into v_tx;
  return v_tx;
end; $$;

create or replace function public.attach_payment_proof(p_tx uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._internal();
  update public.transactions set proof_path = p_path
   where id = p_tx and user_id = auth.uid() and status = 'awaiting'
     and p_path like auth.uid()::text || '/%';
  if not found then raise exception 'transacao_invalida'; end if;
end; $$;

-- Confirmação manual pelo administrador (até o webhook PagBank estar configurado).
create or replace function public.admin_confirm_transaction(p_tx uuid, p_note text default null)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare v_tx public.transactions;
begin
  if not public.is_admin() then raise exception 'acesso_negado'; end if;
  perform public._internal();
  select * into v_tx from public.transactions where id = p_tx for update;
  if not found or v_tx.status <> 'awaiting' then raise exception 'transacao_nao_pendente'; end if;
  perform public._apply_confirmed(v_tx, auth.uid(), p_note, null);
  select * into v_tx from public.transactions where id = p_tx;
  return v_tx;
end; $$;

-- Usada pela confirmação manual e pelo webhook (Edge Function com service_role).
create or replace function public._apply_confirmed(v_tx public.transactions, p_actor uuid, p_note text, p_external text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._internal();
  update public.transactions
     set status = 'confirmed', confirmed_by = p_actor, confirmed_at = now(),
         admin_note = coalesce(p_note, admin_note), external_id = coalesce(p_external, external_id)
   where id = v_tx.id;

  if v_tx.kind = 'activation' then
    update public.professional_profiles set activation_status = 'active', activated_at = now() where user_id = v_tx.user_id;
    insert into public.talent_bank (professional_id, review_due_at)
      values (v_tx.user_id, (now() + make_interval(months => public.setting_num('talent_retention_months')::int))::date)
      on conflict do nothing;
    perform public._notify(v_tx.user_id, 'Perfil ativado', 'Pagamento da taxa de ativação confirmado. Você já pode se candidatar às vagas.', '/painel/profissional');
  elsif v_tx.kind = 'job_credit' then
    insert into public.wallet_ledger (company_id, amount, kind, transaction_id, created_by)
      values (v_tx.company_id, v_tx.amount, 'pix_credit', v_tx.id, p_actor);
    update public.companies set credit_balance = credit_balance + v_tx.amount where id = v_tx.company_id;
    perform public._notify(v_tx.user_id, 'Créditos adicionados', format('R$ %s foram adicionados à sua carteira.', to_char(v_tx.amount, 'FM999G990D00')), '/painel/empresa');
  elsif v_tx.kind = 'course' then
    update public.enrollments set status = 'active' where course_id = v_tx.reference_id and user_id = v_tx.user_id;
    perform public._notify(v_tx.user_id, 'Curso liberado', 'Pagamento confirmado. Bons estudos!', '/aluno');
  end if;

  perform public._audit('confirm_payment', 'transactions', v_tx.id::text,
    jsonb_build_object('kind', v_tx.kind, 'amount', v_tx.amount, 'note', p_note, 'external_id', p_external));
end; $$;
revoke execute on function public._apply_confirmed(public.transactions, uuid, text, text) from public, anon, authenticated;

create or replace function public.admin_cancel_transaction(p_tx uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_tx public.transactions;
begin
  if not public.is_admin() then raise exception 'acesso_negado'; end if;
  perform public._internal();
  update public.transactions set status = 'cancelled', admin_note = p_note
   where id = p_tx and status = 'awaiting' returning * into v_tx;
  if not found then raise exception 'transacao_nao_pendente'; end if;
  perform public._notify(v_tx.user_id, 'Pagamento não confirmado', coalesce(p_note, 'Não identificamos o PIX. Gere uma nova cobrança ou fale conosco.'), null);
  perform public._audit('cancel_payment', 'transactions', p_tx::text, jsonb_build_object('note', p_note));
end; $$;

create or replace function public.admin_adjust_wallet(p_company uuid, p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'acesso_negado'; end if;
  perform public._internal();
  insert into public.wallet_ledger (company_id, amount, kind, created_by) values (p_company, p_amount, 'admin_adjustment', auth.uid());
  update public.companies set credit_balance = credit_balance + p_amount where id = p_company;
  perform public._audit('adjust_wallet', 'companies', p_company::text, jsonb_build_object('amount', p_amount, 'note', p_note));
end; $$;

-- ───────────────────────── Publicação de vagas (R$ 1,00/dia) ─────────────────────────
create or replace function public._job_access(p_job uuid) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'vaga_nao_encontrada'; end if;
  if not public.is_admin() and (v_job.company_id is null or v_job.company_id <> public.my_company_id()) then
    raise exception 'acesso_negado';
  end if;
  return v_job;
end; $$;

create or replace function public.publish_job(p_job uuid, p_days int) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_rate numeric := public.setting_num('job_daily_rate');
  v_cost numeric;
  v_balance numeric;
  v_exempt boolean;
begin
  v_job := public._job_access(p_job);
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'dias_invalidos'; end if;
  if v_job.status not in ('approved','paused') then raise exception 'vaga_precisa_estar_aprovada'; end if;
  perform public._internal();

  v_exempt := v_job.billing_exempt or v_job.company_id is null;
  v_cost := round(p_days * v_rate, 2);

  if not v_exempt then
    select credit_balance into v_balance from public.companies where id = v_job.company_id for update;
    if (select suspended from public.companies where id = v_job.company_id) then raise exception 'empresa_suspensa'; end if;
    if v_balance < v_cost then raise exception 'saldo_insuficiente'; end if;
    update public.companies set credit_balance = credit_balance - v_cost where id = v_job.company_id;
    insert into public.wallet_ledger (company_id, amount, kind, job_id, created_by)
      values (v_job.company_id, -v_cost, 'job_publication', v_job.id, auth.uid());
  end if;

  insert into public.job_billing (job_id, company_id, start_at, end_at, days, daily_rate, amount, status)
    values (v_job.id, v_job.company_id, now(), now() + make_interval(days => p_days), p_days, v_rate,
            case when v_exempt then 0 else v_cost end, case when v_exempt then 'exempt' else 'paid' end);

  update public.jobs set status = 'published', published_at = coalesce(published_at, now()),
         expires_at = now() + make_interval(days => p_days), paused_reason = null
   where id = v_job.id returning * into v_job;
  perform public._audit('publish_job', 'jobs', v_job.id::text, jsonb_build_object('days', p_days, 'cost', v_cost, 'exempt', v_exempt));
  return v_job;
end; $$;

-- Encerra o período pago e devolve os dias inteiros não usados (cobrança proporcional).
create or replace function public._stop_job(p_job uuid, p_status public.job_status, p_reason text) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_bill public.job_billing;
  v_unused int;
  v_refund numeric;
begin
  v_job := public._job_access(p_job);
  perform public._internal();
  if v_job.status = 'published' then
    select * into v_bill from public.job_billing where job_id = v_job.id order by created_at desc limit 1;
    if found and v_bill.status = 'paid' then
      v_unused := greatest(0, floor(extract(epoch from (v_bill.end_at - now())) / 86400)::int);
      v_refund := round(v_unused * v_bill.daily_rate, 2);
      if v_refund > 0 then
        update public.job_billing set refunded_amount = v_refund, status = 'partially_refunded', end_at = now() where id = v_bill.id;
        update public.companies set credit_balance = credit_balance + v_refund where id = v_job.company_id;
        insert into public.wallet_ledger (company_id, amount, kind, job_id, created_by)
          values (v_job.company_id, v_refund, 'job_refund', v_job.id, auth.uid());
      end if;
    end if;
  end if;
  update public.jobs set status = p_status, paused_reason = p_reason, expires_at = least(expires_at, now())
   where id = v_job.id returning * into v_job;
  perform public._audit(p_status::text || '_job', 'jobs', v_job.id::text, jsonb_build_object('refund', v_refund));
  return v_job;
end; $$;
revoke execute on function public._stop_job(uuid, public.job_status, text) from public, anon, authenticated;

create or replace function public.pause_job(p_job uuid) returns public.jobs
language sql security definer set search_path = public as $$
  select public._stop_job(p_job, 'paused', 'Pausada manualmente');
$$;

create or replace function public.close_job(p_job uuid) returns public.jobs
language sql security definer set search_path = public as $$
  select public._stop_job(p_job, 'closed', 'Encerrada');
$$;

-- Revisão administrativa da vaga.
create or replace function public.admin_review_job(p_job uuid, p_decision text, p_note text default null) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs; v_owner uuid;
begin
  if not public.is_admin() then raise exception 'acesso_negado'; end if;
  perform public._internal();
  update public.jobs set
    status = case p_decision when 'approve' then 'approved'::public.job_status
                             when 'reject' then 'rejected'::public.job_status
                             else 'draft'::public.job_status end,
    review_note = p_note
  where id = p_job and status in ('in_review','draft','rejected') returning * into v_job;
  if not found then raise exception 'vaga_nao_esta_em_revisao'; end if;
  select owner_id into v_owner from public.companies where id = v_job.company_id;
  if v_owner is not null then
    perform public._notify(v_owner,
      case p_decision when 'approve' then 'Vaga aprovada — publique quando quiser'
                      when 'reject' then 'Vaga não aprovada' else 'Ajustes solicitados na vaga' end,
      coalesce(p_note, v_job.title), '/painel/empresa');
  end if;
  perform public._audit('review_job', 'jobs', p_job::text, jsonb_build_object('decision', p_decision, 'note', p_note));
  return v_job;
end; $$;

create or replace function public.admin_set_job_exempt(p_job uuid, p_exempt boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'acesso_negado'; end if;
  perform public._internal();
  update public.jobs set billing_exempt = p_exempt where id = p_job;
  perform public._audit('job_exempt', 'jobs', p_job::text, jsonb_build_object('exempt', p_exempt));
end; $$;

-- Pausa automática ao fim do período pago. Agende de hora em hora (ver README / migração 0005).
create or replace function public.pause_expired_jobs() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform public._internal();
  for r in update public.jobs set status = 'paused', paused_reason = 'Período pago encerrado — adicione créditos e renove'
           where status = 'published' and expires_at <= now() returning id, company_id, title loop
    n := n + 1;
    perform public._notify((select owner_id from public.companies where id = r.company_id),
      'Vaga pausada', format('"%s" foi pausada ao fim do período pago. Renove para voltar a receber candidatos.', r.title), '/painel/empresa')
      where r.company_id is not null;
  end loop;
  return n;
end; $$;

-- ───────────────────────── Candidaturas e processo seletivo ─────────────────────────
create or replace function public.move_application(p_app uuid, p_stage public.application_stage, p_note text default null)
returns public.applications
language plpgsql security definer set search_path = public as $$
declare v_app public.applications; v_job public.jobs; v_prev public.application_stage;
begin
  select * into v_app from public.applications where id = p_app for update;
  if not found then raise exception 'candidatura_nao_encontrada'; end if;
  v_prev := v_app.stage;
  select * into v_job from public.jobs where id = v_app.job_id;
  if not public.is_admin() and (v_job.company_id is null or v_job.company_id <> public.my_company_id()) then
    raise exception 'acesso_negado';
  end if;
  perform public._internal();
  update public.applications set stage = p_stage,
    hired_confirmed_by = case when p_stage = 'hired' then auth.uid() else null end,
    hired_confirmed_at = case when p_stage = 'hired' then now() else null end
  where id = p_app returning * into v_app;
  insert into public.application_events (application_id, from_stage, to_stage, actor_id, note)
    values (p_app, v_prev, p_stage, auth.uid(), p_note);
  if p_stage = 'hired' then
    update public.talent_bank set status = 'contratado' where professional_id = v_app.professional_id;
  elsif p_stage in ('pre_selected','sent_to_company','interview','company_review') then
    update public.talent_bank set status = 'em_processo' where professional_id = v_app.professional_id;
  end if;
  perform public._notify(v_app.professional_id, 'Atualização na sua candidatura',
    format('Sua candidatura para "%s" mudou de etapa.', v_job.title), '/painel/profissional');
  return v_app;
end; $$;

-- ───────────────────────── Cursos ─────────────────────────
create or replace function public.enroll_free_course(p_course uuid) returns public.enrollments
language plpgsql security definer set search_path = public as $$
declare v_en public.enrollments;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if not exists (select 1 from public.courses where id = p_course and status = 'published' and price = 0) then
    raise exception 'curso_nao_gratuito';
  end if;
  insert into public.enrollments (course_id, user_id, status) values (p_course, auth.uid(), 'active')
    on conflict (course_id, user_id) do update set status = 'active' where public.enrollments.status = 'pending_payment'
    returning * into v_en;
  if v_en.id is null then select * into v_en from public.enrollments where course_id = p_course and user_id = auth.uid(); end if;
  return v_en;
end; $$;

create or replace function public.complete_lesson(p_lesson uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_course uuid; v_total int; v_done int; v_cert public.certificates;
begin
  select m.course_id into v_course from public.lessons l join public.course_modules m on m.id = l.module_id where l.id = p_lesson;
  if not exists (select 1 from public.enrollments where course_id = v_course and user_id = auth.uid() and status in ('active','completed')) then
    raise exception 'curso_bloqueado';
  end if;
  insert into public.lesson_progress (user_id, lesson_id) values (auth.uid(), p_lesson) on conflict do nothing;
  select count(*) into v_total from public.lessons l join public.course_modules m on m.id = l.module_id where m.course_id = v_course;
  select count(*) into v_done from public.lesson_progress p join public.lessons l on l.id = p.lesson_id
    join public.course_modules m on m.id = l.module_id where m.course_id = v_course and p.user_id = auth.uid();
  if v_total > 0 and v_done >= v_total then
    update public.enrollments set status = 'completed', completed_at = coalesce(completed_at, now())
     where course_id = v_course and user_id = auth.uid();
    insert into public.certificates (user_id, course_id) values (auth.uid(), v_course) on conflict do nothing;
    select * into v_cert from public.certificates where user_id = auth.uid() and course_id = v_course;
  end if;
  return jsonb_build_object('total', v_total, 'done', v_done, 'certificate', v_cert.code);
end; $$;

-- Ementa pública (títulos), sem expor o conteúdo das aulas.
create or replace function public.course_outline(p_course uuid)
returns table (module_title text, module_position int, lesson_title text, lesson_position int, duration_min int)
language sql stable security definer set search_path = public as $$
  select m.title, m.position, l.title, l.position, l.duration_min
    from public.course_modules m
    join public.courses c on c.id = m.course_id and (c.status = 'published' or public.is_admin())
    left join public.lessons l on l.module_id = m.id
   where m.course_id = p_course
   order by m.position, l.position;
$$;

-- ───────────────────────── Indicadores (sempre dados reais) ─────────────────────────
create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profissionais_ativos', (select count(*) from public.professional_profiles where activation_status = 'active'),
    'empresas',             (select count(*) from public.companies where not suspended),
    'vagas_abertas',        (select count(*) from public.jobs where status = 'published'),
    'contratacoes',         (select count(*) from public.applications where stage = 'hired' and hired_confirmed_at is not null),
    'cursos',               (select count(*) from public.courses where status = 'published')
  );
$$;

create or replace function public.admin_kpis() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'acesso_negado'; end if;
  return jsonb_build_object(
    'profissionais',          (select count(*) from public.profiles where role = 'professional'),
    'profissionais_ativos',   (select count(*) from public.professional_profiles where activation_status = 'active'),
    'empresas',               (select count(*) from public.companies),
    'vagas_abertas',          (select count(*) from public.jobs where status = 'published'),
    'vagas_encerradas',       (select count(*) from public.jobs where status = 'closed'),
    'vagas_em_revisao',       (select count(*) from public.jobs where status = 'in_review'),
    'candidatos_em_analise',  (select count(*) from public.applications where stage in ('received','pre_selected','company_review')),
    'processos_em_andamento', (select count(distinct job_id) from public.applications where stage not in ('rejected','hired')),
    'talentos_no_banco',      (select count(*) from public.talent_bank where status <> 'arquivado'),
    'cursos_publicados',      (select count(*) from public.courses where status = 'published'),
    'alunos_inscritos',       (select count(distinct user_id) from public.enrollments where status in ('active','completed')),
    'receita_cursos',         (select coalesce(sum(amount),0) from public.transactions where kind = 'course' and status = 'confirmed'),
    'receita_ativacao',       (select coalesce(sum(amount),0) from public.transactions where kind = 'activation' and status = 'confirmed'),
    'receita_vagas',          (select coalesce(sum(amount - refunded_amount),0) from public.job_billing where status <> 'exempt'),
    'creditos_vendidos',      (select coalesce(sum(amount),0) from public.transactions where kind = 'job_credit' and status = 'confirmed'),
    'pagamentos_pendentes',   (select count(*) from public.transactions where status = 'awaiting'),
    'contratacoes',           (select count(*) from public.applications where stage = 'hired')
  );
end; $$;

-- ───────────────────────── LGPD ─────────────────────────
create or replace function public.request_account_deletion(p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  insert into public.deletion_requests (user_id, reason) values (auth.uid(), p_reason);
  update public.professional_profiles set visible_to_companies = false where user_id = auth.uid();
  perform public._audit('deletion_request', 'profiles', auth.uid()::text, null);
end; $$;
