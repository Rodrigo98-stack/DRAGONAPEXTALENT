-- DRAGON APEX TALENT — Row Level Security, armazenamento e permissões.
-- Princípio: cada empresa vê apenas os próprios dados; profissionais veem só o que é seu;
-- a administração vê tudo. Nada de currículo em link público.

revoke execute on function public._internal() from public, anon, authenticated;
revoke execute on function public._audit(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public._notify(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public._job_access(uuid) from public, anon, authenticated;
revoke execute on function public.pause_expired_jobs() from public, anon, authenticated;

alter table public.profiles              enable row level security;
alter table public.professional_profiles enable row level security;
alter table public.resumes               enable row level security;
alter table public.consents              enable row level security;
alter table public.companies             enable row level security;
alter table public.jobs                  enable row level security;
alter table public.job_billing           enable row level security;
alter table public.applications          enable row level security;
alter table public.application_events    enable row level security;
alter table public.invitations           enable row level security;
alter table public.internal_notes        enable row level security;
alter table public.talent_bank           enable row level security;
alter table public.talent_contacts       enable row level security;
alter table public.courses               enable row level security;
alter table public.course_modules        enable row level security;
alter table public.lessons               enable row level security;
alter table public.enrollments           enable row level security;
alter table public.lesson_progress       enable row level security;
alter table public.certificates          enable row level security;
alter table public.transactions          enable row level security;
alter table public.wallet_ledger         enable row level security;
alter table public.notifications         enable row level security;
alter table public.settings              enable row level security;
alter table public.audit_log             enable row level security;
alter table public.testimonials          enable row level security;
alter table public.contact_messages      enable row level security;
alter table public.deletion_requests     enable row level security;

-- Profissional candidato a alguma vaga da empresa logada?
create or replace function public.applied_to_my_company(p_professional uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
     where a.professional_id = p_professional and j.company_id = public.my_company_id()
  );
$$;

-- profiles
create policy profiles_self   on public.profiles for select using (id = auth.uid() or public.is_admin() or public.applied_to_my_company(id));
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.is_admin());

-- professional_profiles
create policy pro_select on public.professional_profiles for select
  using (user_id = auth.uid() or public.is_admin() or public.applied_to_my_company(user_id));
create policy pro_update on public.professional_profiles for update using (user_id = auth.uid() or public.is_admin());

-- resumes (metadados)
create policy resumes_select on public.resumes for select
  using (user_id = auth.uid() or public.is_admin() or public.applied_to_my_company(user_id));
create policy resumes_insert on public.resumes for insert with check (user_id = auth.uid());
create policy resumes_update on public.resumes for update using (user_id = auth.uid());
create policy resumes_delete on public.resumes for delete using (user_id = auth.uid() or public.is_admin());

-- consents
create policy consents_select on public.consents for select using (user_id = auth.uid() or public.is_admin());
create policy consents_insert on public.consents for insert with check (user_id = auth.uid());

-- companies
create policy companies_select on public.companies for select using (owner_id = auth.uid() or public.is_admin());
create policy companies_update on public.companies for update using (owner_id = auth.uid() or public.is_admin());

-- jobs: publicadas são públicas; o resto só para a dona e a administração
create policy jobs_public on public.jobs for select
  using (status = 'published' or public.is_admin() or (company_id is not null and company_id = public.my_company_id()));
create policy jobs_insert on public.jobs for insert
  with check (public.is_admin() or (company_id = public.my_company_id()
              and not (select suspended from public.companies where id = company_id)));
create policy jobs_update on public.jobs for update
  using (public.is_admin() or company_id = public.my_company_id());
create policy jobs_delete on public.jobs for delete
  using (public.is_admin() or (company_id = public.my_company_id() and status = 'draft'));

-- Vitrine pública: nome da empresa só se ela autorizar.
alter table public.companies add column show_name_publicly boolean not null default false;
create view public.public_jobs with (security_invoker = false) as
  select j.id, j.area, j.title, j.requirements_required, j.requirements_desired, j.openings, j.start_type, j.start_date,
         j.pay_type, j.salary_min, j.salary_max, j.pay_notes, j.benefits, j.work_mode, j.city, j.state,
         j.contract_type, j.schedule, j.hire_deadline, j.notes, j.published_at, j.expires_at,
         case when c.show_name_publicly then c.name end as company_name,
         case when c.show_name_publicly then c.sector end as company_sector
    from public.jobs j left join public.companies c on c.id = j.company_id
   where j.status = 'published';
grant select on public.public_jobs to anon, authenticated;

-- job_billing / wallet_ledger: leitura da própria empresa
create policy billing_select on public.job_billing for select using (public.is_admin() or company_id = public.my_company_id());
create policy ledger_select  on public.wallet_ledger for select using (public.is_admin() or company_id = public.my_company_id());

-- applications
create policy apps_select on public.applications for select using (
  professional_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.my_company_id()));
-- só perfil ATIVO (taxa paga) e vaga publicada aceitam candidatura
create policy apps_insert on public.applications for insert with check (
  professional_id = auth.uid()
  and exists (select 1 from public.professional_profiles p where p.user_id = auth.uid() and p.activation_status = 'active')
  and exists (select 1 from public.jobs j where j.id = job_id and j.status = 'published'));
create policy apps_update on public.applications for update using (
  public.is_admin() or exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.my_company_id()));
create policy apps_delete_own on public.applications for delete using (professional_id = auth.uid() and stage = 'received');

create policy events_select on public.application_events for select using (
  exists (select 1 from public.applications a where a.id = application_id));   -- herda a visibilidade da candidatura

-- invitations
create policy inv_select on public.invitations for select using (
  professional_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.my_company_id()));
create policy inv_insert on public.invitations for insert with check (
  created_by = auth.uid() and (public.is_admin()
  or exists (select 1 from public.jobs j where j.id = job_id and j.company_id = public.my_company_id())));
create policy inv_answer on public.invitations for update using (professional_id = auth.uid() or public.is_admin());

-- internal_notes: administração, ou empresa (apenas as notas dela)
create policy notes_select on public.internal_notes for select using (
  public.is_admin() or (company_id is not null and company_id = public.my_company_id()));
create policy notes_insert on public.internal_notes for insert with check (
  author_id = auth.uid() and (public.is_admin() or (company_id = public.my_company_id())));

-- banco de talentos: somente administração
create policy talent_admin   on public.talent_bank     for all using (public.is_admin()) with check (public.is_admin());
create policy contacts_admin on public.talent_contacts for all using (public.is_admin()) with check (public.is_admin());

-- cursos
create policy courses_select on public.courses for select using (status = 'published' or public.is_admin());
create policy courses_admin  on public.courses for all using (public.is_admin()) with check (public.is_admin());
create policy modules_select on public.course_modules for select using (
  public.is_admin() or exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'));
create policy modules_admin  on public.course_modules for all using (public.is_admin()) with check (public.is_admin());
-- conteúdo da aula: somente com inscrição ativa (pagamento confirmado) ou administração
create policy lessons_select on public.lessons for select using (
  public.is_admin() or exists (
    select 1 from public.course_modules m join public.enrollments e on e.course_id = m.course_id
     where m.id = module_id and e.user_id = auth.uid() and e.status in ('active','completed')));
create policy lessons_admin  on public.lessons for all using (public.is_admin()) with check (public.is_admin());

create policy enroll_select on public.enrollments for select using (user_id = auth.uid() or public.is_admin());
create policy progress_select on public.lesson_progress for select using (user_id = auth.uid() or public.is_admin());
create policy certs_select on public.certificates for select using (user_id = auth.uid() or public.is_admin());

-- transações: leitura do pagador e da administração; escrita só pelas RPCs
create policy tx_select on public.transactions for select using (user_id = auth.uid() or public.is_admin());

-- notificações
create policy notif_select on public.notifications for select using (user_id = auth.uid());
create policy notif_update on public.notifications for update using (user_id = auth.uid());
create policy notif_admin_insert on public.notifications for insert with check (public.is_admin());

-- configurações: leitura pública (preços e chave PIX são exibidos ao pagador); escrita só admin
create policy settings_read  on public.settings for select using (true);
create policy settings_admin on public.settings for all using (public.is_admin()) with check (public.is_admin());

create policy audit_admin on public.audit_log for select using (public.is_admin());

-- depoimentos: só os autorizados aparecem no site
create policy testimonials_public on public.testimonials for select using (authorized or public.is_admin());
create policy testimonials_admin  on public.testimonials for all using (public.is_admin()) with check (public.is_admin());

-- contato: qualquer visitante envia; só admin lê
create policy contact_insert on public.contact_messages for insert with check (true);
create policy contact_admin  on public.contact_messages for select using (public.is_admin());
create policy contact_admin_update on public.contact_messages for update using (public.is_admin());

create policy deletion_select on public.deletion_requests for select using (user_id = auth.uid() or public.is_admin());
create policy deletion_admin  on public.deletion_requests for update using (public.is_admin());

-- ───────────────────────── Storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('resumes', 'resumes', false, 5242880, array['application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['application/pdf','image/png','image/jpeg','image/webp']),
  ('course-covers', 'course-covers', true, 3145728, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Currículos: pasta = id do usuário. Download só por signed URL de curta duração.
create policy resumes_owner_rw on storage.objects for all
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy resumes_admin_read on storage.objects for select
  using (bucket_id = 'resumes' and public.is_admin());
create policy resumes_company_read on storage.objects for select
  using (bucket_id = 'resumes' and public.applied_to_my_company(((storage.foldername(name))[1])::uuid));

create policy proofs_owner_rw on storage.objects for all
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy proofs_admin_read on storage.objects for select
  using (bucket_id = 'payment-proofs' and public.is_admin());

create policy covers_public_read on storage.objects for select using (bucket_id = 'course-covers');
create policy covers_admin_write on storage.objects for all
  using (bucket_id = 'course-covers' and public.is_admin())
  with check (bucket_id = 'course-covers' and public.is_admin());
