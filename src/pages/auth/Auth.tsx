import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Field } from '../../components/ui';
import { LogoImage } from '../../components/Logo';
import { ConfigNotice } from '../../components/ConfigNotice';
import { useToast } from '../../components/Toast';
import { db, isConfigured } from '../../lib/supabase';
import { humanError } from '../../lib/format';
import { AREAS, UFS } from '../../lib/constants';
import { dashboardPath, useAuth } from '../../auth/AuthProvider';

function Shell({ title, subtitle, children, wide }: { title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className="relative min-h-screen overflow-hidden pb-20 pt-32">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-silver/10 blur-[140px]" />
      <div className={`container-x relative ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="mb-8 text-center">
          <LogoImage alt="" className="mx-auto w-24 [mask-image:radial-gradient(closest-side,#000_75%,transparent)]" />
          <h1 className="mt-4 font-display text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-white/55">{subtitle}</p>}
        </div>
        <div className="card-silver p-6 sm:p-8">{isConfigured ? children : <ConfigNotice />}</div>
      </div>
    </section>
  );
}

/** Cadastro público sem depender de e-mail: a Edge Function cria a conta já confirmada e o site entra em seguida. */
async function registerAccount(body: Record<string, unknown>, email: string, password: string) {
  const { error } = await db().functions.invoke('signup', { body });
  if (error) {
    let code = '';
    try { code = (await (error as unknown as { context: Response }).context.json()).error; } catch { /* sem corpo */ }
    throw new Error(code || 'falha_cadastro');
  }
  const { error: loginError } = await db().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (loginError) throw loginError;
}

const passwordRule = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/* ───────────────────────── Login (profissional, empresa ou admin) ───────────────────────── */
export function Login() {
  const [params] = useSearchParams();
  const tipo = params.get('tipo');
  const { profile } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (profile) return <Navigate to={params.get('voltar') || dashboardPath(profile.role)} replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { data, error } = await db().auth.signInWithPassword({ email: String(f.get('email')), password: String(f.get('password')) });
    setBusy(false);
    if (error) return toast('error', humanError(error));
    const { data: p } = await db().from('profiles').select('role').eq('id', data.user.id).single();
    nav(params.get('voltar') || dashboardPath(p?.role), { replace: true });
  };

  return (
    <Shell title={tipo === 'empresa' ? 'Login empresarial' : tipo === 'profissional' ? 'Login profissional' : 'Entrar'}
      subtitle={<>Ainda não tem conta? <Link to="/cadastro" className="text-silver-light underline-offset-4 hover:underline">Cadastre-se</Link></>}>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-full border border-white/10 p-1 text-center text-xs">
        <Link to="/entrar?tipo=profissional" className={`rounded-full py-2 ${tipo !== 'empresa' ? 'bg-silver/15 text-silver-light' : 'text-white/50'}`}>Profissional</Link>
        <Link to="/entrar?tipo=empresa" className={`rounded-full py-2 ${tipo === 'empresa' ? 'bg-silver/15 text-silver-light' : 'text-white/50'}`}>Empresa</Link>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail"><input name="email" type="email" required autoComplete="email" className="input" /></Field>
        <Field label="Senha"><input name="password" type="password" required autoComplete="current-password" className="input" /></Field>
        <button disabled={busy} className="btn-silver w-full">{busy ? 'Entrando…' : 'Entrar'}</button>
        <Link to="/recuperar-senha" className="block text-center text-xs text-white/50 hover:text-silver-light">Esqueci minha senha</Link>
      </form>
    </Shell>
  );
}

export function SignupChoice() {
  return (
    <section className="container-x grid min-h-screen place-items-center pb-20 pt-32">
      <div className="w-full max-w-4xl text-center">
        <p className="eyebrow">Cadastro</p>
        <h1 className="mt-3 font-display text-5xl">Como você quer começar?</h1>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {[
            ['/cadastro/profissional', 'Sou profissional', 'Crie seu perfil, envie seu currículo e candidate-se às vagas.', 'duotone', '/media/selecao.png'],
            ['/cadastro/empresa', 'Sou empresa', 'Abra vagas, receba candidatos e acompanhe o processo seletivo.', 'duotone', '/media/talentos-mundo.webp'],
          ].map(([to, t, d, cls, img]) => (
            <Link key={to} to={to} className="card group overflow-hidden text-left transition hover:-translate-y-1 hover:border-silver/50">
              <div className={`${cls} aspect-[16/8] overflow-hidden`}><img src={img} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></div>
              <div className="p-7">
                <h2 className="font-display text-3xl group-hover:text-silver-light">{t} →</h2>
                <p className="mt-2 text-sm text-white/55">{d}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Cadastro de profissional (etapa 1: conta) ───────────────────────── */
export function SignupProfessional() {
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const errors: Record<string, string> = {};
    if (f.full_name.trim().split(' ').length < 2) errors.full_name = 'Informe nome e sobrenome.';
    if (f.phone.replace(/\D/g, '').length < 10) errors.phone = 'Telefone com DDD.';
    if (!passwordRule(f.password)) errors.password = 'Mínimo 8 caracteres, com letras e números.';
    if (f.password !== f.confirm) errors.confirm = 'As senhas não coincidem.';
    setErr(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      await registerAccount({ role: 'professional', email: f.email, full_name: f.full_name, phone: f.phone, password: f.password, terms: true, website_hp: f.website_hp }, f.email, f.password);
      nav('/painel/profissional?aba=perfil');
    } catch (e) { toast('error', humanError(e)); } finally { setBusy(false); }
  };

  return (
    <Shell title="Cadastro de profissional" subtitle="Etapa 1 de 6 — sua conta. O restante do perfil é salvo por etapas no seu painel.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nome completo *" error={err.full_name}><input name="full_name" required autoComplete="name" className="input" aria-invalid={!!err.full_name} /></Field>
        <Field label="E-mail *"><input name="email" type="email" required autoComplete="email" className="input" /></Field>
        <Field label="Telefone com WhatsApp *" error={err.phone}><input name="phone" required inputMode="tel" placeholder="(81) 90000-0000" className="input" aria-invalid={!!err.phone} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Senha *" error={err.password}><input name="password" type="password" required autoComplete="new-password" className="input" aria-invalid={!!err.password} /></Field>
          <Field label="Confirmar senha *" error={err.confirm}><input name="confirm" type="password" required autoComplete="new-password" className="input" aria-invalid={!!err.confirm} /></Field>
        </div>
        <input name="website_hp" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />
        <label className="flex gap-3 text-xs leading-relaxed text-white/60">
          <input type="checkbox" required className="mt-0.5 accent-[#B9BEC5]" />
          <span>Li e aceito os <Link to="/termos" target="_blank" className="text-silver-light underline">Termos de Uso</Link> e autorizo o tratamento dos meus dados conforme a <Link to="/privacidade" target="_blank" className="text-silver-light underline">Política de Privacidade</Link> (LGPD).</span>
        </label>
        <button disabled={busy} className="btn-silver w-full">{busy ? 'Criando conta…' : 'Criar conta gratuita'}</button>
      </form>
    </Shell>
  );
}

/* ───────────────────────── Cadastro de empresa ───────────────────────── */
export function SignupCompany() {
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const errors: Record<string, string> = {};
    const cnpj = f.cnpj.replace(/\D/g, '');
    if (cnpj && cnpj.length !== 14) errors.cnpj = 'CNPJ deve ter 14 dígitos.';
    if (!passwordRule(f.password)) errors.password = 'Mínimo 8 caracteres, com letras e números.';
    setErr(errors);
    if (errors.cnpj || errors.password) return;
    setBusy(true);
    if (f.terms !== 'on') return toast('error', 'É preciso aceitar os Termos de Uso e a Política de Privacidade.');
    try {
      await registerAccount({
        role: 'company', email: f.email, full_name: f.responsible_name, phone: f.phone, password: f.password, terms: true, website_hp: f.website_hp,
        company: { name: f.name, cnpj, responsible_role: f.responsible_role, whatsapp: f.whatsapp, city: f.city, state: f.state, sector: f.sector, website: f.website, description: f.description },
      }, f.email, f.password);
      nav('/painel/empresa');
    } catch (e) { toast('error', humanError(e)); } finally { setBusy(false); }
  };

  return (
    <Shell wide title="Cadastro de empresa" subtitle="Dados usados para verificação e para o seu painel. Nada é exibido publicamente sem autorização.">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Nome da empresa *"><input name="name" required className="input" autoComplete="organization" /></Field>
        <Field label="CNPJ (quando aplicável)" error={err.cnpj}><input name="cnpj" inputMode="numeric" className="input" aria-invalid={!!err.cnpj} /></Field>
        <Field label="Responsável pelo recrutamento *"><input name="responsible_name" required className="input" autoComplete="name" /></Field>
        <Field label="Cargo do responsável"><input name="responsible_role" className="input" /></Field>
        <Field label="E-mail corporativo *" error={err.email}><input name="email" type="email" required className="input" autoComplete="email" /></Field>
        <Field label="Senha *" error={err.password}><input name="password" type="password" required autoComplete="new-password" className="input" /></Field>
        <Field label="Telefone *"><input name="phone" required inputMode="tel" className="input" /></Field>
        <Field label="WhatsApp"><input name="whatsapp" inputMode="tel" className="input" /></Field>
        <Field label="Cidade *"><input name="city" required className="input" /></Field>
        <Field label="Estado *"><select name="state" required className="input" defaultValue=""><option value="" disabled>UF</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Setor de atuação *"><select name="sector" required className="input" defaultValue=""><option value="" disabled>Selecione</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
        <Field label="Site (opcional)"><input name="website" type="url" placeholder="https://" className="input" /></Field>
        <Field label="Descrição da organização" className="sm:col-span-2"><textarea name="description" rows={3} className="input" /></Field>
        <input name="website_hp" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />
        <label className="flex gap-3 text-xs leading-relaxed text-white/60 sm:col-span-2">
          <input type="checkbox" name="terms" required className="mt-0.5 accent-[#B9BEC5]" />
          <span>Aceito os <Link to="/termos" target="_blank" className="text-silver-light underline">Termos de Uso</Link> e a <Link to="/privacidade" target="_blank" className="text-silver-light underline">Política de Privacidade</Link>. *</span>
        </label>
        <button disabled={busy} className="btn-silver sm:col-span-2">{busy ? 'Cadastrando…' : 'Criar conta empresarial'}</button>
      </form>
    </Shell>
  );
}

/* ───────────────────────── Recuperação de senha ───────────────────────── */
export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email'));
    const { error } = await db().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/nova-senha` });
    if (error) return toast('error', humanError(error));
    setSent(true);
  };
  return (
    <Shell title="Recuperar senha">
      {sent ? <p className="text-center text-sm text-white/65">Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.</p> : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail da conta"><input name="email" type="email" required className="input" /></Field>
          <button className="btn-silver w-full">Enviar link</button>
        </form>
      )}
    </Shell>
  );
}

export function UpdatePassword() {
  const toast = useToast();
  const nav = useNavigate();
  const { profile } = useAuth();
  const forced = new URLSearchParams(location.search).has('obrigatorio');
  const [accepted, setAccepted] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const p = String(new FormData(e.currentTarget).get('password'));
    if (!passwordRule(p)) return toast('error', 'Mínimo 8 caracteres, com letras e números.');
    const { error } = await db().auth.updateUser({ password: p });
    if (error) return toast('error', humanError(error));
    if (forced) {
      if (!accepted) return toast('error', 'Aceite os Termos de Uso e a Política de Privacidade para continuar.');
      const r = await db().rpc('complete_first_access');   // registra o aceite e libera o acesso
      if (r.error) return toast('error', humanError(r.error));
    } else {
      await db().rpc('log_password_change');
    }
    await db().auth.refreshSession();            // renova o token sem a marca de troca obrigatória
    toast('ok', 'Senha atualizada.');
    nav(dashboardPath(profile?.role));
  };
  return (
    <Shell title="Nova senha" subtitle={forced ? 'Você entrou com uma senha provisória definida pela equipe. Crie uma senha só sua para continuar.' : undefined}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha" hint="Mínimo 8 caracteres, com letras e números."><input name="password" type="password" required autoComplete="new-password" className="input" /></Field>
        {forced && (
          <label className="flex gap-3 text-xs leading-relaxed text-white/60">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 accent-[#B9BEC5]" />
            <span>Li e aceito os <Link to="/termos" target="_blank" className="text-silver-light underline">Termos de Uso</Link> e autorizo o tratamento dos meus dados conforme a <Link to="/privacidade" target="_blank" className="text-silver-light underline">Política de Privacidade</Link> (LGPD).</span>
          </label>
        )}
        <button className="btn-silver w-full">Salvar nova senha</button>
      </form>
    </Shell>
  );
}
