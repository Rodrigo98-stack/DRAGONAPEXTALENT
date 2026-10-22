-- Registra na auditoria quando um usuário troca a própria senha (a senha em si nunca é gravada).
create or replace function public.log_password_change() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  perform public._audit('password_change', 'auth.users', auth.uid()::text, null);
end; $$;
revoke execute on function public.log_password_change() from public, anon;
grant execute on function public.log_password_change() to authenticated;
