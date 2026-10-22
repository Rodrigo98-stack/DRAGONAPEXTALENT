-- DRAGON APEX TALENT — esquema principal
-- Rode as migrações em ordem (0001 → 0004) no SQL Editor do Supabase ou com `supabase db push`.

-- gen_random_uuid() é nativo do PostgreSQL 13+ (nenhuma extensão necessária).

-- ───────────────────────── Usuários e papéis ─────────────────────────
create type public.user_role as enum ('professional', 'company', 'admin');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null,
  full_name   text not null,
  email       text not null,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ───────────────────────── Profissionais ─────────────────────────
create type public.activation_status as enum ('pending', 'active');

create table public.professional_profiles (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  whatsapp              text,
  city                  text,
  state                 char(2),
  area                  text,
  desired_role          text,
  experience_level      text check (experience_level in ('estagio','junior','pleno','senior','especialista','gestao')),
  education             jsonb not null default '[]'::jsonb,   -- [{curso, instituicao, conclusao}]
  certifications        text,
  hard_skills           text[] not null default '{}',
  soft_skills           text[] not null default '{}',
  languages             text[] not null default '{}',
  experiences           jsonb not null default '[]'::jsonb,   -- [{cargo, empresa, inicio, fim, descricao}]
  availability          text,
  work_mode             text check (work_mode in ('presencial','hibrido','remoto')),
  salary_expectation    numeric(12,2),
  salary_negotiable     boolean not null default false,
  linkedin_url          text,
  additional_info       text,
  about_profile         text,   -- "Me mostre seu perfil profissional"
  qualities             text,   -- "Quais são suas principais qualidades?"
  why_hire              text,   -- "Por que uma empresa deveria contratar você?"
  visible_to_companies  boolean not null default true,
  allow_contact         boolean not null default true,
  activation_status     public.activation_status not null default 'pending',
  activated_at          timestamptz,
  wizard_step           int not null default 1,
  updated_at            timestamptz not null default now()
);
create index on public.professional_profiles (area);
create index on public.professional_profiles (state, city);
create index on public.professional_profiles (activation_status);

create table public.resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null check (mime_type in (
                  'application/pdf','application/msword',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes    int not null check (size_bytes > 0 and size_bytes <= 5242880),
  is_current    boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on public.resumes (user_id, is_current);

create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,      -- 'lgpd_tratamento', 'termos_uso', 'visibilidade_empresas', ...
  granted     boolean not null,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── Empresas ─────────────────────────
create table public.companies (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null unique references public.profiles (id) on delete cascade,
  name               text not null,
  cnpj               text,
  responsible_name   text not null,
  responsible_role   text,
  corporate_email    text not null,
  phone              text,
  whatsapp           text,
  city               text,
  state              char(2),
  sector             text,
  website            text,
  description        text,
  terms_accepted_at  timestamptz not null,
  verified           boolean not null default false,
  suspended          boolean not null default false,
  credit_balance     numeric(12,2) not null default 0 check (credit_balance >= 0),
  created_at         timestamptz not null default now()
);

-- ───────────────────────── Vagas ─────────────────────────
create type public.job_status as enum ('draft','in_review','approved','published','paused','closed','rejected');

create table public.jobs (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid references public.companies (id) on delete cascade, -- null = vaga criada pela administração
  created_by             uuid not null references public.profiles (id),
  area                   text not null,
  title                  text not null,
  requirements_required  text[] not null default '{}',
  requirements_desired   text[] not null default '{}',
  openings               int not null default 1 check (openings > 0),
  start_type             text not null default 'a_combinar' check (start_type in ('imediato','data','a_combinar')),
  start_date             date,
  pay_type               text not null default 'a_combinar'
                         check (pay_type in ('a_combinar','faixa','fixo','hora','comissao','outra')),
  salary_min             numeric(12,2),
  salary_max             numeric(12,2),
  pay_notes              text,
  benefits               text,
  work_mode              text not null check (work_mode in ('presencial','hibrido','remoto')),
  city                   text,
  state                  char(2),
  address                text,
  contract_type          text not null
                         check (contract_type in ('clt','pj','freelancer','estagio','jovem_aprendiz','temporario','prazo_determinado','outra')),
  schedule               text,
  hire_deadline          date,
  notes                  text,
  receive_via            text not null default 'painel' check (receive_via in ('painel','email','outro')),
  receive_email          text,
  status                 public.job_status not null default 'draft',
  review_note            text,
  billing_exempt         boolean not null default false,
  published_at           timestamptz,
  expires_at             timestamptz,
  paused_reason          text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on public.jobs (status, expires_at);
create index on public.jobs (company_id);
create index on public.jobs (area);

-- Cada janela de publicação paga gera um registro (dias × diária).
create table public.job_billing (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs (id) on delete cascade,
  company_id      uuid references public.companies (id) on delete cascade,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  days            int not null check (days > 0),
  daily_rate      numeric(12,2) not null,
  amount          numeric(12,2) not null,
  refunded_amount numeric(12,2) not null default 0,
  status          text not null default 'paid' check (status in ('paid','exempt','partially_refunded')),
  created_at      timestamptz not null default now()
);
create index on public.job_billing (company_id, created_at desc);

-- ───────────────────────── Candidaturas e processo seletivo ─────────────────────────
create type public.application_stage as enum (
  'received',          -- candidatura recebida
  'pre_selected',      -- candidatos pré-selecionados
  'sent_to_company',   -- currículos enviados à empresa
  'interview',         -- entrevista agendada
  'company_review',    -- em avaliação pela empresa
  'approved',          -- aprovado
  'rejected',          -- reprovado / processo encerrado
  'hired'              -- contratação confirmada (somente por usuário autorizado)
);

create table public.applications (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.jobs (id) on delete cascade,
  professional_id  uuid not null references public.profiles (id) on delete cascade,
  stage            public.application_stage not null default 'received',
  cover_note       text,
  favorite         boolean not null default false,
  interview_at     timestamptz,
  hired_confirmed_by uuid references public.profiles (id),
  hired_confirmed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (job_id, professional_id)
);
create index on public.applications (job_id, stage);
create index on public.applications (professional_id);

create table public.application_events (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  from_stage      public.application_stage,
  to_stage        public.application_stage not null,
  actor_id        uuid references public.profiles (id),
  note            text,
  created_at      timestamptz not null default now()
);

create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.jobs (id) on delete cascade,
  professional_id  uuid not null references public.profiles (id) on delete cascade,
  message          text,
  status           text not null default 'sent' check (status in ('sent','accepted','declined')),
  created_by       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  unique (job_id, professional_id)
);

-- Observações internas: nunca visíveis ao profissional.
create table public.internal_notes (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in ('professional','application','company','job')),
  subject_id    uuid not null,
  company_id    uuid references public.companies (id) on delete cascade, -- null = nota da administração
  author_id     uuid not null references public.profiles (id),
  body          text not null,
  created_at    timestamptz not null default now()
);
create index on public.internal_notes (subject_type, subject_id);

-- ───────────────────────── Banco de talentos ─────────────────────────
create type public.talent_status as enum (
  'novo','em_analise','aprovado_banco','compativel_futuro','encaminhado',
  'em_processo','contratado','arquivado','aguardando_atualizacao'
);

create table public.talent_bank (
  professional_id   uuid primary key references public.profiles (id) on delete cascade,
  status            public.talent_status not null default 'novo',
  tags              text[] not null default '{}',
  future_flag       boolean not null default false,
  update_requested_at timestamptz,
  last_contact_at   timestamptz,
  review_due_at     date,                 -- revisão de retenção (LGPD)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.talent_contacts (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid not null references public.profiles (id) on delete cascade,
  channel          text not null,         -- whatsapp, email, telefone, encaminhamento
  summary          text not null,
  job_id           uuid references public.jobs (id) on delete set null,
  author_id        uuid not null references public.profiles (id),
  created_at       timestamptz not null default now()
);

-- ───────────────────────── Capacitação ─────────────────────────
create table public.courses (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  cover_url      text,
  description    text not null,
  area           text not null,
  instructor     text not null,
  syllabus       text,
  workload_hours int not null check (workload_hours > 0),
  level          text not null check (level in ('iniciante','intermediario','avancado')),
  price          numeric(12,2) not null default 0 check (price >= 0),
  prerequisites  text,
  status         text not null default 'draft' check (status in ('draft','published','paused')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.course_modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,
  position   int not null default 1
);

create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.course_modules (id) on delete cascade,
  title         text not null,
  content       text,            -- texto / markdown da aula
  video_url     text,
  material_url  text,
  position      int not null default 1,
  duration_min  int
);

create table public.enrollments (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending_payment' check (status in ('pending_payment','active','completed','cancelled')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (course_id, user_id)
);

create table public.lesson_progress (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.certificates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  course_id   uuid not null references public.courses (id) on delete cascade,
  code        text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  issued_at   timestamptz not null default now(),
  unique (user_id, course_id)
);

-- ───────────────────────── Pagamentos (somente PIX) ─────────────────────────
create type public.charge_kind as enum ('activation','job_credit','course');
create type public.charge_status as enum ('awaiting','confirmed','cancelled','failed');

create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  company_id    uuid references public.companies (id) on delete cascade,
  kind          public.charge_kind not null,
  reference_id  uuid,                         -- course_id quando kind = course
  amount        numeric(12,2) not null check (amount > 0),
  method        text not null default 'pix' check (method = 'pix'),
  status        public.charge_status not null default 'awaiting',
  txid          text not null unique,         -- identificador enviado no BR Code (campo 62.05)
  external_id   text,                         -- id PagBank, quando houver webhook
  proof_path    text,                         -- comprovante enviado pelo pagador
  admin_note    text,
  confirmed_by  uuid references public.profiles (id),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index on public.transactions (status, created_at desc);
create index on public.transactions (user_id, created_at desc);

-- Carteira de créditos da empresa (livro-razão imutável).
create table public.wallet_ledger (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  amount          numeric(12,2) not null,      -- positivo = crédito, negativo = débito
  kind            text not null check (kind in ('pix_credit','job_publication','job_refund','admin_adjustment')),
  transaction_id  uuid references public.transactions (id),
  job_id          uuid references public.jobs (id) on delete set null,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index on public.wallet_ledger (company_id, created_at desc);

-- ───────────────────────── Comunicação, configurações, auditoria ─────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id),
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create table public.testimonials (
  id            uuid primary key default gen_random_uuid(),
  author_name   text not null,
  author_role   text,
  body          text not null,
  authorized    boolean not null default false,   -- só aparece no site com autorização registrada
  authorized_at timestamptz,
  created_at    timestamptz not null default now()
);

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text,
  subject     text not null check (char_length(subject) <= 160),
  message     text not null check (char_length(message) between 10 and 4000),
  handled     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  reason       text,
  status       text not null default 'open' check (status in ('open','done','rejected')),
  handled_by   uuid references public.profiles (id),
  handled_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- Preços e PIX configuráveis no painel administrativo.
insert into public.settings (key, value) values
  ('activation_fee',  '0.15'::jsonb),
  ('job_daily_rate',  '1.00'::jsonb),
  ('pix_base_payload', to_jsonb('00020126360014br.gov.bcb.pix01146880890400018127600016BR.COM.PAGSEGURO013629C47361-ACA6-4184-9F67-A9BFC61895205204731153039865802BR592568.808.904 RODRIGO CARNEI6006Recife62290525PAGS0000000002610220145856304BEAB'::text)),
  ('pix_receiver_name', to_jsonb('68.808.904 RODRIGO CARNEIRO DA CUNHA (PagBank) — Recife'::text)),
  ('talent_retention_months', '24'::jsonb),
  ('matching_weights', '{"area":20,"cargo":15,"obrigatorios":30,"desejaveis":10,"modalidade":10,"localizacao":10,"salario":5}'::jsonb);
