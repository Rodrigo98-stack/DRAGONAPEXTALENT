-- DRAGON APEX TALENT — endurecimento apontado pelo Security Advisor do Supabase.

-- 1) Vitrine pública sem view SECURITY DEFINER.
--    O nome/setor da empresa é copiado para a vaga apenas quando a empresa autoriza (show_name_publicly),
--    e a view passa a respeitar o RLS de quem consulta.
alter table public.jobs add column company_display_name text, add column company_display_sector text;

create or replace function public.jobs_company_display() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select case when c.show_name_publicly then c.name end, case when c.show_name_publicly then c.sector end
    into new.company_display_name, new.company_display_sector
    from public.companies c where c.id = new.company_id;
  if new.company_id is null then new.company_display_name := null; new.company_display_sector := null; end if;
  return new;
end; $$;
create trigger t_jobs_company_display before insert or update on public.jobs
  for each row execute function public.jobs_company_display();

create or replace function public.companies_sync_display() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.name, new.sector, new.show_name_publicly) is distinct from (old.name, old.sector, old.show_name_publicly) then
    update public.jobs set company_display_name = null where company_id = new.id;   -- o gatilho da vaga recalcula
  end if;
  return new;
end; $$;
create trigger t_companies_sync_display after update on public.companies
  for each row execute function public.companies_sync_display();

drop view public.public_jobs;
create view public.public_jobs with (security_invoker = true) as
  select id, area, title, requirements_required, requirements_desired, openings, start_type, start_date,
         pay_type, salary_min, salary_max, pay_notes, benefits, work_mode, city, state,
         contract_type, schedule, hire_deadline, notes, published_at, expires_at,
         company_display_name as company_name, company_display_sector as company_sector
    from public.jobs
   where status = 'published';
grant select on public.public_jobs to anon, authenticated;

-- Visitantes só leem as colunas públicas das vagas (nada de e-mail de recebimento, notas de revisão etc.).
revoke select on public.jobs from anon;
grant select (id, area, title, requirements_required, requirements_desired, openings, start_type, start_date,
              pay_type, salary_min, salary_max, pay_notes, benefits, work_mode, city, state, contract_type,
              schedule, hire_deadline, notes, published_at, expires_at, status, company_id,
              company_display_name, company_display_sector) on public.jobs to anon;

-- 2) Funções SECURITY DEFINER: visitantes anônimos só alcançam o que é público.
--    is_admin / my_company_id / applied_to_my_company continuam executáveis porque são avaliadas dentro das políticas RLS
--    (para anônimos retornam falso/nulo). course_outline e public_stats são públicas por definição.
revoke execute on function public.create_charge(public.charge_kind, uuid, numeric) from public, anon;
revoke execute on function public.attach_payment_proof(uuid, text) from public, anon;
revoke execute on function public.admin_confirm_transaction(uuid, text) from public, anon;
revoke execute on function public.admin_cancel_transaction(uuid, text) from public, anon;
revoke execute on function public.admin_adjust_wallet(uuid, numeric, text) from public, anon;
revoke execute on function public.admin_review_job(uuid, text, text) from public, anon;
revoke execute on function public.admin_set_job_exempt(uuid, boolean) from public, anon;
revoke execute on function public.admin_kpis() from public, anon;
revoke execute on function public.publish_job(uuid, int) from public, anon;
revoke execute on function public.pause_job(uuid) from public, anon;
revoke execute on function public.close_job(uuid) from public, anon;
revoke execute on function public.move_application(uuid, public.application_stage, text) from public, anon;
revoke execute on function public.enroll_free_course(uuid) from public, anon;
revoke execute on function public.complete_lesson(uuid) from public, anon;
revoke execute on function public.request_account_deletion(text) from public, anon;
-- uso interno apenas
revoke execute on function public.setting_num(text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rate_limit_contact() from public, anon, authenticated;
revoke execute on function public.jobs_company_display() from public, anon, authenticated;
revoke execute on function public.companies_sync_display() from public, anon, authenticated;
-- O Auth do Supabase dispara o cadastro como supabase_auth_admin: garante o acesso explícito.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;
