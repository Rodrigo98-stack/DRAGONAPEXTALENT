import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../lib/supabase';
import { useAsync, must } from '../../lib/useAsync';
import { useSettings } from '../../lib/useSettings';
import { computeMatch } from '../../lib/matching';
import { date, dateTime, humanError, money } from '../../lib/format';
import { CHARGE_KIND, CHARGE_STATUS, stageLabel } from '../../lib/constants';
import type { Application, Enrollment, Job, ProfessionalProfile, Transaction } from '../../lib/types';
import { DashboardShell, Notifications } from '../../components/DashboardShell';
import { Badge, EmptyState, Progress, Spinner, Tabs, Modal } from '../../components/ui';
import { PixPayment } from '../../components/PixPayment';
import { JobCard } from '../../components/JobCard';
import { useToast } from '../../components/Toast';
import { ProfileWizard, completion } from './ProfileWizard';

type Tab = 'inicio' | 'perfil' | 'ativacao' | 'vagas' | 'candidaturas' | 'cursos' | 'privacidade';

export default function ProfessionalDashboard() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) || 'inicio';
  const go = (t: Tab) => setParams({ aba: t });

  const { data, loading, reload, setData } = useAsync(async () => {
    const [pro, resume] = await Promise.all([
      db().from('professional_profiles').select('*').eq('user_id', profile!.id).single(),
      db().from('resumes').select('id').eq('user_id', profile!.id).eq('is_current', true).maybeSingle(),
    ]);
    return { pro: must(pro) as ProfessionalProfile, hasResume: !!resume.data };
  }, [profile?.id]);

  if (loading || !data) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  const { pro, hasResume } = data;
  const active = pro.activation_status === 'active';
  const pct = completion(pro, hasResume);

  return (
    <DashboardShell eyebrow="Painel do profissional" title={<>Olá, {profile!.full_name.split(' ')[0]}.</>}
      aside={active ? <Badge tone="ok">● Perfil ativo</Badge> : <button onClick={() => go('ativacao')} className="badge tone-warn">● Pendente de ativação</button>}>
      <Tabs<Tab> value={tab} onChange={go} tabs={[
        { id: 'inicio', label: 'Visão geral' }, { id: 'perfil', label: 'Meu perfil' }, { id: 'ativacao', label: 'Ativação e pagamentos' },
        { id: 'vagas', label: 'Vagas compatíveis' }, { id: 'candidaturas', label: 'Candidaturas e convites' },
        { id: 'cursos', label: 'Cursos' }, { id: 'privacidade', label: 'Privacidade' },
      ]} />
      <div className="mt-8">
        {tab === 'inicio' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card p-6 lg:col-span-2">
              <div className="flex items-center justify-between"><h2 className="font-display text-2xl">Seu perfil</h2><span className="font-display text-3xl text-silver-light">{pct}%</span></div>
              <div className="mt-4"><Progress value={pct} /></div>
              <p className="mt-3 text-sm text-white/55">{pct < 100 ? 'Complete as etapas para aumentar suas chances de pré-seleção.' : 'Perfil completo. Excelente!'}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="btn-silver btn-sm" onClick={() => go('perfil')}>{pct < 100 ? 'Continuar preenchendo' : 'Editar perfil'}</button>
                {!active && <button className="btn-ghost btn-sm" onClick={() => go('ativacao')}>Ativar perfil</button>}
              </div>
            </div>
            <div className="card p-6"><h2 className="mb-3 font-display text-2xl">Notificações</h2><Notifications userId={profile!.id} /></div>
            {!active && (
              <div className="card-silver p-6 lg:col-span-3">
                <h3 className="font-display text-2xl">Ative seu perfil para se candidatar</h3>
                <p className="mt-2 max-w-3xl text-sm text-white/60">Candidaturas, vagas compatíveis e a visibilidade no banco de talentos são liberadas após a confirmação da taxa única de ativação via PIX.</p>
                <button className="btn-silver btn-sm mt-4" onClick={() => go('ativacao')}>Ver como ativar</button>
              </div>
            )}
          </div>
        )}
        {tab === 'perfil' && <ProfileWizard pro={pro} hasResume={hasResume} onResumeChange={reload} onSaved={(p) => setData({ pro: p, hasResume })} />}
        {tab === 'ativacao' && <Activation pro={pro} onActivated={reload} />}
        {tab === 'vagas' && (active ? <MatchingJobs pro={pro} /> : <Locked onGo={() => go('ativacao')} />)}
        {tab === 'candidaturas' && (active ? <MyApplications userId={profile!.id} /> : <Locked onGo={() => go('ativacao')} />)}
        {tab === 'cursos' && <MyCourses userId={profile!.id} />}
        {tab === 'privacidade' && <Privacy pro={pro} onSaved={(p) => setData({ pro: p, hasResume })} />}
      </div>
    </DashboardShell>
  );
}

function Locked({ onGo }: { onGo: () => void }) {
  return <EmptyState icon="🔒" title="Disponível após a ativação" action={<button className="btn-silver btn-sm" onClick={onGo}>Ativar perfil</button>}>
    Esta área é liberada quando o pagamento da taxa de ativação é confirmado.</EmptyState>;
}

/* ───────────────────────── Ativação (R$ 0,15) e histórico ───────────────────────── */
function Activation({ pro, onActivated }: { pro: ProfessionalProfile; onActivated: () => void }) {
  const s = useSettings();
  const toast = useToast();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: history, reload } = useAsync(async () =>
    ((await db().from('transactions').select('*').eq('user_id', pro.user_id).order('created_at', { ascending: false })).data ?? []) as Transaction[], [pro.user_id]);

  const start = async () => {
    setBusy(true);
    try { setTx(must(await db().rpc('create_charge', { p_kind: 'activation' })) as Transaction); reload(); }
    catch (e) { toast('error', humanError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="card-silver p-7">
        {pro.activation_status === 'active' ? (
          <>
            <Badge tone="ok">✓ Perfil ativo desde {date(pro.activated_at)}</Badge>
            <p className="mt-4 text-sm text-white/60">Seu perfil está visível para as empresas (conforme suas preferências) e apto a candidaturas.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">Taxa única de ativação</p>
            <div className="mt-3 font-display text-6xl text-silver-light">{money(s.activation_fee)}</div>
            <ul className="mt-5 space-y-2 text-sm text-white/65">
              <li>◆ Cobrada uma única vez por conta (não recorrente).</li>
              <li>◆ Libera candidaturas, vagas compatíveis e o banco de talentos.</li>
              <li>◆ Confirma a titularidade e reduz perfis falsos.</li>
              <li>◆ Pagamento somente via PIX. Sem confirmação, o perfil segue “pendente de ativação”.</li>
            </ul>
            <button className="btn-silver mt-6 w-full" disabled={busy} onClick={start}>{busy ? 'Gerando PIX…' : `Pagar ${money(s.activation_fee)} via PIX`}</button>
          </>
        )}
      </div>
      <div className="card p-6">
        <h3 className="mb-4 font-display text-2xl">Histórico de pagamentos</h3>
        {history?.length ? (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Status</th><th /></tr></thead>
            <tbody>{history.map((t) => (
              <tr key={t.id}>
                <td>{dateTime(t.created_at)}</td><td>{CHARGE_KIND[t.kind]}</td><td>{money(t.amount)}</td>
                <td><Badge tone={t.status === 'confirmed' ? 'ok' : t.status === 'awaiting' ? 'warn' : 'bad'}>{CHARGE_STATUS[t.status]}</Badge></td>
                <td>{t.status === 'awaiting' && <button className="text-xs text-silver-light hover:underline" onClick={() => setTx(t)}>Ver PIX</button>}
                  {t.status === 'confirmed' && <span className="text-[11px] text-white/40">Comprovante: {t.txid}</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="text-sm text-white/40">Nenhum pagamento registrado.</p>}
      </div>
      <Modal open={!!tx} onClose={() => { setTx(null); reload(); }} title="Pagamento via PIX" wide>
        {tx && <PixPayment tx={tx} onConfirmed={() => { setTx(null); onActivated(); }} />}
      </Modal>
    </div>
  );
}

/* ───────────────────────── Vagas compatíveis ───────────────────────── */
function MatchingJobs({ pro }: { pro: ProfessionalProfile }) {
  const s = useSettings();
  const { data, loading } = useAsync(async () =>
    must(await db().from('public_jobs').select('*').order('published_at', { ascending: false }).limit(200)) as Job[]);
  const ranked = useMemo(() => (data ?? []).map((j) => ({ j, m: computeMatch(j, pro, s.matching_weights) }))
    .filter((x) => x.m.score >= 40).sort((a, b) => b.m.score - a.m.score), [data, pro, s]);
  if (loading) return <Spinner />;
  if (!ranked.length) return <EmptyState title="Nenhuma vaga compatível no momento">Mantenha seu perfil atualizado — avisaremos quando surgirem oportunidades.</EmptyState>;
  return (
    <>
      <p className="mb-5 text-xs text-white/40">Ordenadas pela compatibilidade estimada (regras documentadas, apenas apoio — não é avaliação definitiva).</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ranked.map(({ j, m }) => (
          <div key={j.id} className="relative">
            <span className="absolute -right-2 -top-2 z-10 rounded-full bg-silver px-2.5 py-1 text-xs font-bold text-ink">{m.score}%</span>
            <JobCard job={j} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── Candidaturas e convites ───────────────────────── */
function MyApplications({ userId }: { userId: string }) {
  const toast = useToast();
  const { data, loading, reload } = useAsync(async () => {
    const [apps, inv] = await Promise.all([
      db().from('applications').select('*, jobs(title, area, status)').eq('professional_id', userId).order('created_at', { ascending: false }),
      db().from('invitations').select('*, jobs(id, title, area)').eq('professional_id', userId).order('created_at', { ascending: false }),
    ]);
    return {
      apps: (apps.data ?? []) as (Application & { jobs: Pick<Job, 'title' | 'area' | 'status'> })[],
      invites: (inv.data ?? []) as { id: string; status: string; message: string | null; created_at: string; jobs: Pick<Job, 'id' | 'title' | 'area'> }[],
    };
  }, [userId]);
  const answer = async (id: string, status: 'accepted' | 'declined') => {
    const { error } = await db().from('invitations').update({ status }).eq('id', id);
    if (error) return toast('error', humanError(error));
    toast('ok', status === 'accepted' ? 'Convite aceito.' : 'Convite recusado.'); reload();
  };
  const withdraw = async (id: string) => {
    if (!confirm('Retirar esta candidatura?')) return;
    const { error } = await db().from('applications').delete().eq('id', id);
    if (error) return toast('error', humanError(error));
    reload();
  };
  if (loading || !data) return <Spinner />;
  return (
    <div className="space-y-8">
      {data.invites.length > 0 && (
        <div className="card-silver p-6">
          <h3 className="mb-4 font-display text-2xl">Convites para processos seletivos</h3>
          <ul className="space-y-3">{data.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
              <div><Link to={`/vagas/${i.jobs.id}`} className="font-semibold hover:text-silver-light">{i.jobs.title}</Link>
                {i.message && <p className="text-xs text-white/50">{i.message}</p>}</div>
              {i.status === 'sent' ? (
                <div className="flex gap-2">
                  <Link to={`/vagas/${i.jobs.id}`} onClick={() => answer(i.id, 'accepted')} className="btn-silver btn-sm">Aceitar e ver vaga</Link>
                  <button className="btn-ghost btn-sm" onClick={() => answer(i.id, 'declined')}>Recusar</button>
                </div>
              ) : <Badge tone={i.status === 'accepted' ? 'ok' : 'muted'}>{i.status === 'accepted' ? 'Aceito' : 'Recusado'}</Badge>}
            </li>
          ))}</ul>
        </div>
      )}
      {data.apps.length ? (
        <div className="card overflow-x-auto p-2">
          <table className="table">
            <thead><tr><th>Vaga</th><th>Enviada em</th><th>Etapa</th><th /></tr></thead>
            <tbody>{data.apps.map((a) => (
              <tr key={a.id}>
                <td><Link to={`/vagas/${a.job_id}`} className="font-medium hover:text-silver-light">{a.jobs?.title}</Link><div className="text-xs text-white/40">{a.jobs?.area}</div></td>
                <td>{date(a.created_at)}</td>
                <td><Badge tone={a.stage === 'hired' ? 'ok' : a.stage === 'rejected' ? 'bad' : 'silver'}>{stageLabel(a.stage)}</Badge>
                  {a.interview_at && <div className="mt-1 text-xs text-white/50">Entrevista: {dateTime(a.interview_at)}</div>}</td>
                <td>{a.stage === 'received' && <button className="text-xs text-white/50 hover:text-red-300" onClick={() => withdraw(a.id)}>Retirar</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <EmptyState title="Nenhuma candidatura ainda" action={<Link to="/vagas" className="btn-silver btn-sm">Explorar vagas</Link>} />}
    </div>
  );
}

/* ───────────────────────── Cursos ───────────────────────── */
function MyCourses({ userId }: { userId: string }) {
  const { data, loading } = useAsync(async () => {
    const [en, certs] = await Promise.all([
      db().from('enrollments').select('*, courses(id, title, slug, area)').eq('user_id', userId),
      db().from('certificates').select('*, courses(title)').eq('user_id', userId),
    ]);
    return {
      en: (en.data ?? []) as (Enrollment & { courses: { id: string; title: string; slug: string; area: string } })[],
      certs: (certs.data ?? []) as { id: string; code: string; issued_at: string; courses: { title: string } }[],
    };
  }, [userId]);
  if (loading || !data) return <Spinner />;
  if (!data.en.length) return <EmptyState icon="✦" title="Nenhum curso ainda" action={<Link to="/cursos" className="btn-silver btn-sm">Ver catálogo</Link>} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">{data.en.map((e) => (
        <div key={e.id} className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div><div className="eyebrow">{e.courses.area}</div><div className="font-semibold">{e.courses.title}</div></div>
          {e.status === 'pending_payment' ? <Link to={`/cursos/${e.courses.slug}`} className="badge tone-warn">Aguardando pagamento</Link>
            : <Link to={`/aluno/${e.course_id}`} className="btn-silver btn-sm">{e.status === 'completed' ? 'Revisar' : 'Continuar'}</Link>}
        </div>
      ))}</div>
      <div className="card p-6">
        <h3 className="mb-3 font-display text-2xl">Certificados</h3>
        {data.certs.length ? data.certs.map((c) => (
          <div key={c.id} className="border-b border-white/5 py-3 text-sm"><div>{c.courses.title}</div><div className="text-xs text-white/40">Código {c.code} · {date(c.issued_at)}</div></div>
        )) : <p className="text-sm text-white/40">Conclua um curso para obter o certificado.</p>}
      </div>
    </div>
  );
}

/* ───────────────────────── Privacidade e LGPD ───────────────────────── */
function Privacy({ pro, onSaved }: { pro: ProfessionalProfile; onSaved: (p: ProfessionalProfile) => void }) {
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const save = async (patch: Partial<ProfessionalProfile>) => {
    const { data, error } = await db().from('professional_profiles').update(patch).eq('user_id', pro.user_id).select().single();
    if (error) return toast('error', humanError(error));
    await db().from('consents').insert({ user_id: pro.user_id, kind: Object.keys(patch)[0], granted: Object.values(patch)[0] as boolean });
    onSaved(data as ProfessionalProfile); toast('ok', 'Preferência salva.');
  };
  const requestDeletion = async () => {
    const { error } = await db().rpc('request_account_deletion', { p_reason: reason || null });
    if (error) return toast('error', humanError(error));
    setAsk(false); toast('ok', 'Solicitação registrada. A equipe concluirá a exclusão conforme a LGPD.');
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-5 p-6">
        <h3 className="font-display text-2xl">Visibilidade e contato</h3>
        <Toggle label="Perfil visível no banco de talentos / para empresas" checked={pro.visible_to_companies} onChange={(v) => save({ visible_to_companies: v })} />
        <Toggle label="Aceito contato sobre oportunidades (WhatsApp/e-mail)" checked={pro.allow_contact} onChange={(v) => save({ allow_contact: v })} />
        <p className="text-xs text-white/40">Empresas das vagas em que você se candidatou continuam vendo sua candidatura.</p>
      </div>
      <div className="card space-y-4 border-red-400/20 p-6">
        <h3 className="font-display text-2xl">Excluir conta e dados</h3>
        <p className="text-sm text-white/55">Você pode solicitar a exclusão da conta, do currículo e dos dados pessoais (LGPD, art. 18). Seu perfil fica oculto imediatamente.</p>
        <button className="btn-danger btn-sm" onClick={() => setAsk(true)}>Solicitar exclusão</button>
      </div>
      <Modal open={ask} onClose={() => setAsk(false)} title="Confirmar solicitação de exclusão">
        <p className="text-sm text-white/60">Esta ação oculta seu perfil e encaminha a exclusão definitiva para a equipe. Deseja continuar?</p>
        <textarea className="input mt-4" rows={3} placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-5 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setAsk(false)}>Cancelar</button><button className="btn-danger" onClick={requestDeletion}>Confirmar</button></div>
      </Modal>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
      <span>{label}</span>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-silver' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

