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
  const [done, setDone] = useState(false);

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
    const { data, error } = await db().auth.signUp({
      email: f.email.trim(), password: f.password,
      options: {
        emailRedirectTo: `${location.origin}/painel/profissional`,
        data: { role: 'professional', full_name: f.full_name.trim(), phone: f.phone, lgpd_consent: true },
      },
    });
    setBusy(false);
    if (error) return toast('error', humanError(error));
    if (data.session) nav('/painel/profissional?aba=perfil'); else setDone(true);
  };

  if (done) return <Shell title="Confirme seu e-mail"><p className="text-center text-sm text-white/65">Enviamos um link de confirmação. Depois de confirmar, entre e continue o perfil de onde parou.</p></Shell>;

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
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const errors: Record<string, string> = {};
    const cnpj = f.cnpj.replace(/\D/g, '');
    if (cnpj && cnpj.length !== 14) errors.cnpj = 'CNPJ deve ter 14 dígitos.';
    if (/@(gmail|hotmail|outlook|yahoo|live|icloud)\./i.test(f.email)) errors.email = 'Use preferencialmente um e-mail corporativo (domínio da empresa).';
    if (!passwordRule(f.password)) errors.password = 'Mínimo 8 caracteres, com letras e números.';
    setErr(errors);
    if (errors.cnpj || errors.password) return;
    setBusy(true);
    const { data, error } = await db().auth.signUp({
      email: f.email.trim(), password: f.password,
      options: {
        emailRedirectTo: `${location.origin}/painel/empresa`,
        data: {
          role: 'company', full_name: f.responsible_name.trim(), phone: f.phone,
          company: {
            name: f.name.trim(), cnpj, responsible_role: f.responsible_role, whatsapp: f.whatsapp, city: f.city, state: f.state,
            sector: f.sector, website: f.website, description: f.description, terms_accepted: f.terms === 'on',
          },
        },
      },
    });
    setBusy(false);
    if (error) return toast('error', humanError(error));
    if (data.session) nav('/painel/empresa'); else setDone(true);
  };

  if (done) return <Shell title="Confirme seu e-mail"><p className="text-center text-sm text-white/65">Enviamos um link de verificação para o e-mail corporativo. Após confirmar, entre no painel da empresa.</p></Shell>;

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
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const p = String(new FormData(e.currentTarget).get('password'));
    if (!passwordRule(p)) return toast('error', 'Mínimo 8 caracteres, com letras e números.');
    const { error } = await db().auth.updateUser({ password: p });
    if (error) return toast('error', humanError(error));
    await db().rpc('log_password_change');       // registra e encerra a obrigação de troca
    await db().auth.refreshSession();            // renova o token sem a marca de troca obrigatória
    toast('ok', 'Senha atualizada.');
    nav(dashboardPath(profile?.role));
  };
  const forced = new URLSearchParams(location.search).has('obrigatorio');
  return (
    <Shell title="Nova senha" subtitle={forced ? 'Você entrou com uma senha provisória definida pela equipe. Crie uma senha só sua para continuar.' : undefined}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha" hint="Mínimo 8 caracteres, com letras e números."><input name="password" type="password" required autoComplete="new-password" className="input" /></Field>
        <button className="btn-silver w-full">Salvar nova senha</button>
      </form>
    </Shell>
  );
}
