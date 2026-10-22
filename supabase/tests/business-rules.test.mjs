// npm run test:db — executa as migrações num Postgres embutido (PGlite) com stubs mínimos do Supabase
// e percorre os fluxos críticos de negócio e de segurança (RLS).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = process.argv[2] ?? fileURLToPath(new URL('../migrations', import.meta.url));
const db = new PGlite();
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) fails++; };

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage; create schema extensions;
  create function extensions.gen_salt(t text) returns text language sql as $$ select 'salt' $$;
  create function extensions.crypt(p text, s text) returns text language sql as $$ select 'h:' || p $$;
  create table auth.sessions (id uuid primary key, user_id uuid); create table auth.refresh_tokens (id bigserial primary key, user_id text);
  create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb default '{}', encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz,
    confirmation_token text, recovery_token text, email_change_token_new text, email_change text, email_change_token_current text, phone_change text, phone_change_token text, reauthentication_token text);
  create table auth.identities (id uuid primary key, user_id uuid, provider text, provider_id text, identity_data jsonb, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  grant all on storage.objects to authenticated;
`);

for (const f of readdirSync(MIG).sort()) {
  try { await db.exec(readFileSync(join(MIG, f), 'utf8')); ok(`migração ${f}`, true); }
  catch (e) { ok(`migração ${f}`, false, e.message); process.exit(1); }
}

// helpers
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
};
const fails_ = async (name, uid, sql, params, match) => {
  try { await as(uid, sql, params); ok(name, false, 'não falhou'); }
  catch (e) { ok(name, !match || e.message.includes(match), e.message); }
};
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0];
const signup = async (email, meta) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])).rows[0].id;

// usuários -------------------------------------------------------------
const pro = await signup('pro@x.com', { role: 'professional', full_name: 'Ana Souza', phone: '81999990000', lgpd_consent: true });
const comp = await signup('rh@empresa.com', { role: 'company', full_name: 'Carlos RH', company: { name: 'Empresa X', terms_accepted: true, state: 'PE', city: 'Recife' } });
const comp2 = await signup('rh@outra.com', { role: 'company', full_name: 'Bia', company: { name: 'Outra', terms_accepted: true } });
const hacker = await signup('h@x.com', { role: 'admin', full_name: 'Hacker Tentando' });
const admin = await signup('admin@dat.com', { role: 'professional', full_name: 'Admin DAT' });
await db.query(`update profiles set role = 'admin' where id = $1`, [admin]);

ok('metadata role=admin é rebaixado para professional', (await db.query(`select role from profiles where id=$1`, [hacker])).rows[0].role === 'professional');
try { await signup('semtermo@x.com', { role: 'company', full_name: 'X', company: { name: 'Y' } }); ok('empresa sem termos bloqueada', false); }
catch (e) { ok('empresa sem termos bloqueada', e.message.includes('termos_nao_aceitos')); }

// profissional não se auto-ativa nem vira admin
await as(pro, `update professional_profiles set activation_status='active', city='Recife', state='PE', area='Tecnologia', hard_skills='{React,TypeScript}' where user_id=$1`, [pro]);
ok('profissional não consegue se ativar sozinho', (await one(pro, `select activation_status from professional_profiles where user_id=$1`, [pro])).activation_status === 'pending');
await as(pro, `update profiles set role='admin' where id=$1`, [pro]);
ok('profissional não consegue virar admin', (await db.query(`select role from profiles where id=$1`, [pro])).rows[0].role === 'professional');
await fails_('inserir transação direto é bloqueado', pro, `insert into transactions (user_id, kind, amount, txid) values ($1,'activation',0.15,'X')`, [pro]);

// cobrança de ativação
const txA = await one(pro, `select * from create_charge('activation')`);
ok('taxa de ativação = 0,15 calculada no servidor', Number(txA.amount) === 0.15, `txid ${txA.txid} (${txA.txid.length} chars)`);
const txA2 = await one(pro, `select * from create_charge('activation')`);
ok('reaproveita cobrança pendente', txA2.id === txA.id);
await fails_('profissional não confirma o próprio PIX', pro, `select admin_confirm_transaction($1)`, [txA.id], 'acesso_negado');

// empresa cria vaga
const company = (await one(comp, `select id, credit_balance from companies where owner_id=$1`, [comp]));
ok('empresa criada pelo cadastro', !!company?.id);
await as(comp, `update companies set credit_balance = 999, verified = true where id=$1`, [company.id]);
ok('empresa não altera o próprio saldo/verificação', Number((await one(comp, `select credit_balance from companies where id=$1`, [company.id])).credit_balance) === 0);
const job = await one(comp, `insert into jobs (company_id, created_by, area, title, requirements_required, work_mode, contract_type, state, city)
  values ($1,$2,'Tecnologia','Dev Front-end','{React}','remoto','clt','PE','Recife') returning *`, [company.id, comp]);
ok('vaga nasce como rascunho', job.status === 'draft');
await fails_('empresa não publica sem passar pela RPC', comp, `update jobs set status='published' where id=$1`, [job.id], 'status_invalido');
await as(comp, `update jobs set status='in_review' where id=$1`, [job.id]);
await fails_('empresa não aprova a própria vaga', comp, `select admin_review_job($1,'approve')`, [job.id], 'acesso_negado');
await as(admin, `select admin_review_job($1,'approve','ok')`, [job.id]);
ok('admin aprova vaga', (await db.query(`select status from jobs where id=$1`, [job.id])).rows[0].status === 'approved');
await fails_('publicar sem saldo falha', comp, `select publish_job($1, 10)`, [job.id], 'saldo_insuficiente');

const txC = await one(comp, `select * from create_charge('job_credit', null, 15)`);
ok('recarga de créditos via PIX', Number(txC.amount) === 15);
await fails_('recarga abaixo da diária é recusada', comp, `select create_charge('job_credit', null, 0.5)`, [], 'valor_invalido');

// admin confirma os dois PIX
await as(admin, `select admin_confirm_transaction($1,'extrato 123')`, [txA.id]);
await as(admin, `select admin_confirm_transaction($1,'extrato 456')`, [txC.id]);
ok('ativação liberada após confirmação', (await db.query(`select activation_status from professional_profiles where user_id=$1`, [pro])).rows[0].activation_status === 'active');
ok('profissional entra no banco de talentos', (await db.query(`select count(*)::int c from talent_bank where professional_id=$1`, [pro])).rows[0].c === 1);
ok('créditos somados à carteira', Number((await db.query(`select credit_balance from companies where id=$1`, [company.id])).rows[0].credit_balance) === 15);
await fails_('confirmar duas vezes é bloqueado', admin, `select admin_confirm_transaction($1)`, [txA.id], 'transacao_nao_pendente');

// publicação: 10 dias × R$ 1,00
const pub = await one(comp, `select * from publish_job($1, 10)`, [job.id]);
ok('vaga publicada', pub.status === 'published');
ok('debitou 10 × R$ 1,00', Number((await db.query(`select credit_balance from companies where id=$1`, [company.id])).rows[0].credit_balance) === 5);
ok('fatura registrada', Number((await db.query(`select amount from job_billing where job_id=$1`, [job.id])).rows[0].amount) === 10);
ok('vitrine pública mostra a vaga sem o nome da empresa', (await as(null, `select company_name from public_jobs where id=$1`, [job.id])).rows[0]?.company_name === null);

await fails_('visitante não lê e-mail de recebimento da vaga', null, 'select receive_email from jobs', [], 'permission denied');
await fails_('visitante não chama RPC de cobrança', null, "select create_charge('activation')", [], 'permission denied');
await as(comp, 'update companies set show_name_publicly = true where id=$1', [company.id]);
ok('nome aparece na vitrine só com autorização', (await as(null, 'select company_name from public_jobs where id=$1', [job.id])).rows[0]?.company_name === 'Empresa X');

// candidatura e isolamento entre empresas
const app = await one(pro, `insert into applications (job_id, professional_id) values ($1,$2) returning *`, [job.id, pro]);
ok('profissional ativo se candidata', app.stage === 'received');
const proB = await signup('b@x.com', { role: 'professional', full_name: 'Bruno Lima' });
await fails_('profissional pendente não se candidata', proB, `insert into applications (job_id, professional_id) values ($1,$2)`, [job.id, proB], 'row-level security');
ok('empresa vê a candidatura', (await as(comp, `select count(*)::int c from applications where job_id=$1`, [job.id])).rows[0].c === 1);
ok('empresa vê perfil do candidato', (await as(comp, `select count(*)::int c from professional_profiles where user_id=$1`, [pro])).rows[0].c === 1);
ok('outra empresa NÃO vê a candidatura', (await as(comp2, `select count(*)::int c from applications`)).rows[0].c === 0);
ok('outra empresa NÃO vê o candidato', (await as(comp2, `select count(*)::int c from professional_profiles`)).rows[0].c === 0);
ok('outra empresa NÃO vê dados da empresa X', (await as(comp2, `select count(*)::int c from companies where id=$1`, [company.id])).rows[0].c === 0);
ok('banco de talentos invisível para empresas', (await as(comp, `select count(*)::int c from talent_bank`)).rows[0].c === 0);
await as(comp, `update applications set stage='hired' where id=$1`, [app.id]);
ok('etapa não muda por update direto', (await db.query(`select stage from applications where id=$1`, [app.id])).rows[0].stage === 'received');
await fails_('outra empresa não move candidato', comp2, `select move_application($1,'pre_selected')`, [app.id], 'acesso_negado');
await as(comp, `select move_application($1,'pre_selected','triagem')`, [app.id]);
await as(comp, `select move_application($1,'hired')`, [app.id]);
const ev = (await db.query(`select from_stage, to_stage from application_events where application_id=$1 order by created_at`, [app.id])).rows;
ok('histórico registra de→para', ev.length === 2 && ev[0].from_stage === 'received' && ev[1].from_stage === 'pre_selected', JSON.stringify(ev));
ok('contratação registra responsável', !!(await db.query(`select hired_confirmed_by from applications where id=$1`, [app.id])).rows[0].hired_confirmed_by);
ok('candidato é notificado', (await as(pro, `select count(*)::int c from notifications`)).rows[0].c >= 2);

// encerrar antes devolve dias inteiros não usados
await as(comp, `select close_job($1)`, [job.id]);
const bal = Number((await db.query(`select credit_balance from companies where id=$1`, [company.id])).rows[0].credit_balance);
ok('encerrar devolve 9 dias inteiros (5 + 9 = 14)', bal === 14, `saldo ${bal}`);

// pausa automática ao fim do período
const job2 = await one(comp, `insert into jobs (company_id, created_by, area, title, work_mode, contract_type, status) values ($1,$2,'Vendas','Vendedor','presencial','clt','in_review') returning id`, [company.id, comp]);
await as(admin, `select admin_review_job($1,'approve')`, [job2.id]);
await as(comp, `select publish_job($1, 2)`, [job2.id]);
await db.query(`update jobs set expires_at = now() - interval '1 minute' where id=$1`, [job2.id]);
const paused = (await db.query(`select pause_expired_jobs() n`)).rows[0].n;
ok('pausa automática ao fim do período', paused === 1 && (await db.query(`select status from jobs where id=$1`, [job2.id])).rows[0].status === 'paused');

// cursos: conteúdo pago bloqueado até o PIX
const course = (await db.query(`insert into courses (slug,title,description,area,instructor,workload_hours,level,price,status) values ('excel','Excel','d','Administrativo','Prof',4,'iniciante',19.9,'published') returning id`)).rows[0];
const mod = (await db.query(`insert into course_modules (course_id,title) values ($1,'M1') returning id`, [course.id])).rows[0];
const les = (await db.query(`insert into lessons (module_id,title,content) values ($1,'Aula 1','segredo') returning id`, [mod.id])).rows[0];
ok('aula invisível antes da compra', (await as(pro, `select count(*)::int c from lessons`)).rows[0].c === 0);
ok('ementa pública mostra títulos', (await as(null, `select count(*)::int c from course_outline($1)`, [course.id])).rows[0].c === 1);
const txK = await one(pro, `select * from create_charge('course', $1)`, [course.id]);
ok('preço do curso vem do banco', Number(txK.amount) === 19.9);
ok('aula ainda bloqueada com pagamento pendente', (await as(pro, `select count(*)::int c from lessons`)).rows[0].c === 0);
await fails_('não conclui aula sem pagar', pro, `select complete_lesson($1)`, [les.id], 'curso_bloqueado');
await as(admin, `select admin_confirm_transaction($1)`, [txK.id]);
ok('aula liberada após o PIX', (await as(pro, `select count(*)::int c from lessons`)).rows[0].c === 1);
const done = await one(pro, `select complete_lesson($1) r`, [les.id]);
ok('certificado emitido ao concluir', !!done.r.certificate, JSON.stringify(done.r));

// indicadores reais
const k = (await one(admin, `select admin_kpis() k`)).k;
ok('KPIs: receita de ativação 0,15', Number(k.receita_ativacao) === 0.15);
ok('KPIs: receita de vagas = 10 + 2 − 9 devolvidos = 3', Number(k.receita_vagas) === 3, String(k.receita_vagas));
ok('KPIs: receita de cursos 19,90', Number(k.receita_cursos) === 19.9);
await fails_('KPIs bloqueados para não-admin', comp, `select admin_kpis()`, [], 'acesso_negado');
const ps = (await one(null, `select public_stats() s`)).s;
ok('estatística pública reflete dados reais', ps.contratacoes === 1 && ps.profissionais_ativos === 1, JSON.stringify(ps));

// contato e anti-abuso
for (let i = 0; i < 3; i++) await as(null, `insert into contact_messages (name,email,subject,message) values ('Zé','z@x.com','Oi','mensagem de teste ok')`);
await fails_('4ª mensagem em 10 min é bloqueada', null, `insert into contact_messages (name,email,subject,message) values ('Zé','z@x.com','Oi','mensagem de teste ok')`, [], 'muitas_mensagens');
ok('visitante não lê mensagens', (await as(null, `select count(*)::int c from contact_messages`)).rows[0].c === 0);

// admin define senha provisória
await db.query('insert into auth.sessions (id, user_id) values (gen_random_uuid(), $1)', [pro]);
await fails_('usuário comum não define senha de ninguém', pro, "select admin_set_user_password($1, 'Nova12345')", [comp], 'acesso_negado');
await fails_('admin não redefine a si mesmo por aqui', admin, "select admin_set_user_password($1, 'Nova12345')", [admin], 'use_minha_conta');
await fails_('senha fraca é recusada', admin, "select admin_set_user_password($1, 'curta')", [pro], 'senha_fraca');
await as(admin, "select admin_set_user_password($1, 'Nova12345')", [pro]);
const au = (await db.query('select encrypted_password, raw_app_meta_data from auth.users where id=$1', [pro])).rows[0];
ok('senha provisória gravada e troca obrigatória marcada', au.encrypted_password === 'h:Nova12345' && au.raw_app_meta_data.must_change_password === true);
ok('sessões do usuário derrubadas', (await db.query('select count(*)::int c from auth.sessions where user_id=$1', [pro])).rows[0].c === 0);
await as(pro, 'select log_password_change()');
ok('usuário encerra a troca obrigatória ao criar senha própria', (await db.query('select raw_app_meta_data from auth.users where id=$1', [pro])).rows[0].raw_app_meta_data.must_change_password === undefined);

// admin cria conta (sem e-mail)
await fails_('usuário comum não cria contas', pro, "select admin_create_user('x@y.com','Fulano de Tal','8199','professional','Senha12345')", [], 'acesso_negado');
await fails_('senha fraca na criação é recusada', admin, "select admin_create_user('x@y.com','Fulano de Tal','8199','professional','curta')", [], 'senha_fraca');
await fails_('e-mail já cadastrado é recusado', admin, "select admin_create_user('PRO@x.com','Fulano de Tal','8199','professional','Senha12345')", [], 'email_ja_cadastrado');
await fails_('papel admin não pode ser criado por aqui', admin, "select admin_create_user('x@y.com','Fulano de Tal','8199','admin','Senha12345')", [], 'papel_invalido');
const newPro = (await as(admin, "select admin_create_user('ana@teste.com','Ana Letícia','81999990000','professional','Senha12345') id")).rows[0].id;
const nu = (await db.query('select email_confirmed_at, raw_app_meta_data, confirmation_token from auth.users where id=$1', [newPro])).rows[0];
ok('conta criada já confirmada, com troca obrigatória', !!nu.email_confirmed_at && nu.raw_app_meta_data.must_change_password === true && nu.confirmation_token === '');
ok('identidade de e-mail criada para o login', (await db.query('select count(*)::int c from auth.identities where user_id=$1 and provider=$2', [newPro, 'email'])).rows[0].c === 1);
ok('perfil e perfil profissional criados pelo gatilho', (await db.query('select count(*)::int c from professional_profiles where user_id=$1', [newPro])).rows[0].c === 1);
ok('nenhum consentimento é registrado em nome da pessoa', (await db.query('select count(*)::int c from consents where user_id=$1', [newPro])).rows[0].c === 0);
await as(newPro, 'select log_password_change()');
ok('trocar a senha sem aceitar os termos NÃO libera o acesso', (await db.query('select raw_app_meta_data from auth.users where id=$1', [newPro])).rows[0].raw_app_meta_data.must_change_password === true);
await as(newPro, 'select complete_first_access()');
ok('aceitar os termos libera o acesso e registra o consentimento', (await db.query('select raw_app_meta_data from auth.users where id=$1', [newPro])).rows[0].raw_app_meta_data.must_change_password === undefined
  && (await db.query("select count(*)::int c from consents where user_id=$1 and kind='termos_uso'", [newPro])).rows[0].c === 1);
const newComp = (await as(admin, "select admin_create_user('rh@nova.com','Maria RH','8133','company','Senha12345','{\"name\":\"Nova LTDA\",\"state\":\"PE\"}'::jsonb) id")).rows[0].id;
ok('empresa criada pela administração fica sem termos aceitos', (await db.query('select name, terms_accepted_at from companies where owner_id=$1', [newComp])).rows[0].terms_accepted_at === null);
await as(newComp, 'select complete_first_access()');
ok('empresa registra o aceite no primeiro acesso', (await db.query('select terms_accepted_at from companies where owner_id=$1', [newComp])).rows[0].terms_accepted_at !== null);

// webhook só via service_role
await fails_('usuário comum não chama o webhook', pro, `select webhook_confirm_pix('X','Y',1)`, [], 'permission denied');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
process.exit(fails ? 1 : 0);
