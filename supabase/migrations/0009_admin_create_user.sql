-- O administrador cria contas (profissional ou empresa) com senha provisória, sem depender de e-mail.
-- O e-mail da conta é marcado como confirmado pela administração; no primeiro acesso a pessoa é obrigada a
-- trocar a senha E aceitar os Termos/Política de Privacidade (o consentimento nunca é registrado em nome dela).

-- Empresa criada pela administração só tem "termos aceitos" depois do primeiro acesso.
alter table public.companies alter column terms_accepted_at drop not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role public.user_role;
  v_admin_created boolean := coalesce((new.raw_app_meta_data->>'admin_created')::boolean, false);
  c jsonb;
begin
  v_role := case meta->>'role' when 'company' then 'company'::public.user_role else 'professional'::public.user_role end;

  insert into public.profiles (id, role, full_name, email, phone)
  values (new.id, v_role, coalesce(nullif(meta->>'full_name',''), split_part(new.email,'@',1)), new.email, meta->>'phone');

  if v_role = 'professional' then
    insert into public.professional_profiles (user_id, whatsapp) values (new.id, meta->>'phone');
    if (meta->>'lgpd_consent')::boolean and not v_admin_created then
      insert into public.consents (user_id, kind, granted) values (new.id, 'lgpd_tratamento', true), (new.id, 'termos_uso', true);
    end if;
  else
    c := coalesce(meta->'company', '{}'::jsonb);
    if not v_admin_created and coalesce((c->>'terms_accepted')::boolean, false) is not true then
      raise exception 'termos_nao_aceitos';
    end if;
    insert into public.companies (owner_id, name, cnpj, responsible_name, responsible_role, corporate_email,
                                  phone, whatsapp, city, state, sector, website, description, terms_accepted_at)
    values (new.id, c->>'name', nullif(c->>'cnpj',''), coalesce(meta->>'full_name',''), c->>'responsible_role',
            new.email, meta->>'phone', c->>'whatsapp', c->>'city', nullif(c->>'state',''), c->>'sector',
            nullif(c->>'website',''), c->>'description', case when v_admin_created then null else now() end);
    if not v_admin_created then
      insert into public.consents (user_id, kind, granted) values (new.id, 'termos_uso', true), (new.id, 'politica_privacidade', true);
    end if;
  end if;
  return new;
end; $$;

create or replace function public.admin_create_user(
  p_email text, p_full_name text, p_phone text, p_role text, p_password text, p_company jsonb default null
) returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'acesso_negado'; end if;
  if p_role not in ('professional', 'company') then raise exception 'papel_invalido'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 3 then raise exception 'nome_invalido'; end if;
  if p_password is null or length(p_password) < 8 or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception 'senha_fraca';
  end if;
  if p_role = 'company' and length(trim(coalesce(p_company->>'name', ''))) < 2 then raise exception 'empresa_sem_nome'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'email_ja_cadastrado'; end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"must_change_password":true,"admin_created":true}'::jsonb,
    jsonb_build_object('role', p_role, 'full_name', trim(p_full_name), 'phone', nullif(trim(coalesce(p_phone, '')), ''),
                       'email_verified', true, 'company', coalesce(p_company, '{}'::jsonb)),
    now(), now(), '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, 'email', v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          null, now(), now());

  perform public._audit('admin_create_user', 'auth.users', v_id::text, jsonb_build_object('role', p_role, 'email', v_email));
  return v_id;
end; $$;
revoke execute on function public.admin_create_user(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text, text, jsonb) to authenticated;

-- Primeiro acesso de uma conta criada pela administração: registra o aceite dos termos e libera o acesso.
create or replace function public.complete_first_access() returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_role public.user_role;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if not exists (select 1 from public.consents where user_id = auth.uid() and kind = 'termos_uso') then
    insert into public.consents (user_id, kind, granted) values (auth.uid(), 'termos_uso', true), (auth.uid(), 'politica_privacidade', true);
    if v_role = 'professional' then
      insert into public.consents (user_id, kind, granted) values (auth.uid(), 'lgpd_tratamento', true);
    end if;
  end if;
  update public.companies set terms_accepted_at = coalesce(terms_accepted_at, now()) where owner_id = auth.uid();
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'must_change_password' where id = auth.uid();
  perform public._audit('first_access_completed', 'auth.users', auth.uid()::text, null);
end; $$;
revoke execute on function public.complete_first_access() from public, anon;
grant execute on function public.complete_first_access() to authenticated;

-- Trocar a própria senha só encerra a troca obrigatória se os termos já foram aceitos.
create or replace function public.log_password_change() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if exists (select 1 from public.consents where user_id = auth.uid() and kind = 'termos_uso') then
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'must_change_password' where id = auth.uid();
  end if;
  perform public._audit('password_change', 'auth.users', auth.uid()::text, null);
end; $$;
