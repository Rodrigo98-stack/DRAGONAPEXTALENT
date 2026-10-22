-- Cadastro público sem depender de e-mail (Edge Function `signup`): registro de tentativas para limitar abuso por IP.
-- RLS ligado e nenhuma política: só a Edge Function (service_role) lê e escreve.
create table public.signup_attempts (
  id          bigint generated always as identity primary key,
  ip          text not null,
  created_at  timestamptz not null default now()
);
create index on public.signup_attempts (ip, created_at desc);
alter table public.signup_attempts enable row level security;
revoke all on public.signup_attempts from anon, authenticated;
