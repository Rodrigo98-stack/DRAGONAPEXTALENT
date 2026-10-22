-- O administrador define uma senha provisória para profissional ou empresa (sem depender de e-mail).
-- Regras: só admin; nunca para outro admin nem para si mesmo (use "Minha conta"); derruba as sessões abertas
-- do usuário; marca "must_change_password" para forçar a troca no primeiro acesso; registra na auditoria
-- (a senha nunca é gravada em log).
create or replace function public.admin_set_user_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_role public.user_role;
begin
  if not public.is_admin() then raise exception 'acesso_negado'; end if;
  if p_user = auth.uid() then raise exception 'use_minha_conta'; end if;
  if p_password is null or length(p_password) < 8 or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception 'senha_fraca';
  end if;
  select role into v_role from public.profiles where id = p_user;
  if v_role is null then raise exception 'usuario_nao_encontrado'; end if;
  if v_role = 'admin' then raise exception 'nao_permitido_para_admin'; end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb,
         updated_at = now()
   where id = p_user;

  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;

  perform public._audit('admin_set_password', 'auth.users', p_user::text, jsonb_build_object('role', v_role));
  perform public._notify(p_user, 'Sua senha foi redefinida', 'A equipe definiu uma senha provisória para você. Troque-a no primeiro acesso.', null);
end; $$;
revoke execute on function public.admin_set_user_password(uuid, text) from public, anon;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;

-- Trocar a própria senha também encerra a obrigação de troca.
create or replace function public.log_password_change() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'must_change_password'
   where id = auth.uid();
  perform public._audit('password_change', 'auth.users', auth.uid()::text, null);
end; $$;
