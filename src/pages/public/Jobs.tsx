import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader, EmptyState, Spinner, Badge, Modal, Field } from '../../components/ui';
import { JobCard, salaryText } from '../../components/JobCard';
import { ConfigNotice } from '../../components/ConfigNotice';
import { useToast } from '../../components/Toast';
import { db, supabase, isConfigured } from '../../lib/supabase';
import { useAsync, must } from '../../lib/useAsync';
import { useAuth } from '../../auth/AuthProvider';
import { AREAS, CONTRACTS, UFS, WORK_MODES } from '../../lib/constants';
import { date, humanError } from '../../lib/format';
import { computeMatch } from '../../lib/matching';
import { useSettings } from '../../lib/useSettings';
import type { Job, ProfessionalProfile } from '../../lib/types';

const PAGE = 12;

export function Jobs() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const q = params.get('q') ?? '', area = params.get('area') ?? '', mode = params.get('modo') ?? '',
    uf = params.get('uf') ?? '', contract = params.get('contrato') ?? '';

  const { data, loading } = useAsync(async () => {
    if (!supabase) return null;
    let query = supabase.from('public_jobs').select('*', { count: 'exact' }).order('published_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, ' ')}%,area.ilike.%${q.replace(/[%,()]/g, ' ')}%`);
    if (area) query = query.eq('area', area);
    if (mode) query = query.eq('work_mode', mode);
    if (uf) query = query.eq('state', uf);
    if (contract) query = query.eq('contract_type', contract);
    const r = await query;
    return { rows: must(r) as Job[], count: r.count ?? 0 };
  }, [q, area, mode, uf, contract, page]);

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p); setPage(0); };
  const pages = Math.ceil((data?.count ?? 0) / PAGE);

  return (
    <>
      <PageHeader eyebrow="Oportunidades" title={<>Vagas <span className="silver-text">disponíveis</span></>}>
        Somente vagas reais, revisadas pela nossa equipe e publicadas pelas empresas contratantes.
      </PageHeader>
      <section className="container-x py-12">
        <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <input className="input lg:col-span-1" placeholder="Buscar cargo ou área…" defaultValue={q} aria-label="Buscar"
            onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value)} onBlur={(e) => set('q', e.currentTarget.value)} />
          <select className="input" value={area} onChange={(e) => set('area', e.target.value)} aria-label="Área">
            <option value="">Todas as áreas</option>{AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
          <select className="input" value={mode} onChange={(e) => set('modo', e.target.value)} aria-label="Modalidade">
            <option value="">Qualquer modalidade</option>{Object.entries(WORK_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input" value={uf} onChange={(e) => set('uf', e.target.value)} aria-label="Estado">
            <option value="">Todos os estados</option>{UFS.map((u) => <option key={u}>{u}</option>)}
          </select>
          <select className="input" value={contract} onChange={(e) => set('contrato', e.target.value)} aria-label="Contratação">
            <option value="">Tipo de contratação</option>{Object.entries(CONTRACTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="mt-10">
          {!isConfigured ? <ConfigNotice /> : loading ? <Spinner /> : data && data.rows.length ? (
            <>
              <p className="mb-5 text-sm text-white/45">{data.count} vaga{data.count === 1 ? '' : 's'} encontrada{data.count === 1 ? '' : 's'}</p>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.rows.map((j) => <JobCard key={j.id} job={j} />)}</div>
              {pages > 1 && (
                <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Paginação">
                  <button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Anterior</button>
                  <span className="text-sm text-white/50">{page + 1} de {pages}</span>
                  <button className="btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima →</button>
                </nav>
              )}
            </>
          ) : (
            <EmptyState title="Nenhuma vaga encontrada" action={<Link to="/cadastro/profissional" className="btn-silver btn-sm">Entrar no banco de talentos</Link>}>
              {q || area || mode || uf || contract ? 'Tente remover alguns filtros.' : 'Ainda não há vagas publicadas. Cadastre-se para ser encontrado quando surgirem oportunidades.'}
            </EmptyState>
          )}
        </div>
      </section>
    </>
  );
}

export function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();
  const settings = useSettings();
  const [applyOpen, setApplyOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: job, loading } = useAsync(async () => {
    if (!supabase) return null;
    return must(await supabase.from('public_jobs').select('*').eq('id', id).maybeSingle()) as Job | null;
  }, [id]);

  const { data: mine, reload } = useAsync(async () => {
    if (!supabase || profile?.role !== 'professional') return null;
    const [p, a] = await Promise.all([
      supabase.from('professional_profiles').select('*').eq('user_id', profile.id).single(),
      supabase.from('applications').select('id,stage').eq('job_id', id).eq('professional_id', profile.id).maybeSingle(),
    ]);
    return { pro: p.data as ProfessionalProfile, applied: a.data };
  }, [profile?.id, id]);

  const match = useMemo(() => (job && mine?.pro ? computeMatch(job, mine.pro, settings.matching_weights) : null), [job, mine, settings]);

  useEffect(() => { document.title = job ? `${job.title} — DRAGON APEX TALENT` : document.title; }, [job]);

  const apply = async () => {
    setBusy(true);
    const { error } = await db().from('applications').insert({ job_id: id, professional_id: profile!.id, cover_note: note || null });
    setBusy(false);
    if (error) return toast('error', humanError(error));
    toast('ok', 'Candidatura enviada! Acompanhe pelo seu painel.');
    setApplyOpen(false); reload();
  };

  if (!isConfigured) return <div className="container-x py-40"><ConfigNotice /></div>;
  if (loading) return <div className="grid min-h-[70vh] place-items-center"><Spinner /></div>;
  if (!job) return (
    <div className="container-x py-40"><EmptyState title="Vaga indisponível" action={<Link to="/vagas" className="btn-silver btn-sm">Ver outras vagas</Link>}>
      Esta vaga foi encerrada, pausada ou não existe.</EmptyState></div>
  );

  const active = mine?.pro?.activation_status === 'active';

  return (
    <>
      <PageHeader eyebrow={job.area} title={job.title}>
        {job.company_name ?? 'Empresa confidencial'} · {[job.city, job.state].filter(Boolean).join(' / ') || 'Remoto'} · publicada em {date(job.published_at)}
      </PageHeader>
      <section className="container-x grid gap-10 py-14 lg:grid-cols-[1fr_360px]">
        <div className="space-y-10">
          <Block title="Requisitos obrigatórios">
            <ul className="space-y-2">{job.requirements_required.map((r) => (
              <li key={r} className="flex gap-3"><span className={match?.missingRequired.includes(r) ? 'text-red-300' : 'text-silver'}>{match?.missingRequired.includes(r) ? '✕' : '◆'}</span>{r}</li>
            ))}</ul>
          </Block>
          {job.requirements_desired.length > 0 && <Block title="Desejáveis"><ul className="space-y-2">{job.requirements_desired.map((r) => <li key={r} className="flex gap-3"><span className="text-white/40">◇</span>{r}</li>)}</ul></Block>}
          {job.benefits && <Block title="Benefícios"><p className="whitespace-pre-line">{job.benefits}</p></Block>}
          {job.schedule && <Block title="Jornada"><p>{job.schedule}</p></Block>}
          {job.notes && <Block title="Informações adicionais"><p className="whitespace-pre-line">{job.notes}</p></Block>}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <div className="card-silver space-y-4 p-6">
            <Row k="Remuneração" v={salaryText(job)} />
            <Row k="Modalidade" v={WORK_MODES[job.work_mode]} />
            <Row k="Contratação" v={CONTRACTS[job.contract_type]} />
            <Row k="Vagas" v={String(job.openings)} />
            <Row k="Início" v={job.start_type === 'imediato' ? 'Imediato' : job.start_type === 'data' ? date(job.start_date) : 'A combinar'} />
            {match && (
              <div className="rounded-xl border border-white/10 bg-ink/60 p-4">
                <div className="flex items-center justify-between text-sm"><span className="text-white/60">Compatibilidade estimada</span><span className="font-display text-2xl text-silver-light">{match.score}%</span></div>
                <p className="mt-2 text-[11px] leading-relaxed text-white/40">Estimativa por regras, apenas de apoio. A decisão é do recrutador.</p>
              </div>
            )}
            {!profile ? (
              <button className="btn-silver w-full" onClick={() => nav(`/entrar?voltar=/vagas/${job.id}`)}>Entrar para se candidatar</button>
            ) : profile.role !== 'professional' ? (
              <p className="text-xs text-white/45">Candidaturas são exclusivas para contas de profissionais.</p>
            ) : mine?.applied ? (
              <Badge tone="ok">✓ Você já se candidatou</Badge>
            ) : !active ? (
              <>
                <button className="btn-silver w-full" onClick={() => nav('/painel/profissional?aba=ativacao')}>Ativar perfil para se candidatar</button>
                <p className="text-xs text-white/45">Candidaturas são liberadas após a confirmação da taxa de ativação.</p>
              </>
            ) : (
              <button className="btn-silver w-full" onClick={() => setApplyOpen(true)}>Candidatar-me</button>
            )}
          </div>
        </aside>
      </section>
      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Confirmar candidatura">
        <p className="text-sm text-white/60">Seu perfil e currículo atual ficarão visíveis para a empresa desta vaga e para a equipe DRAGON APEX TALENT.</p>
        <Field label="Mensagem para o recrutador (opcional)" className="mt-5">
          <textarea className="input" rows={4} maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={() => setApplyOpen(false)}>Cancelar</button>
          <button className="btn-silver" disabled={busy} onClick={apply}>{busy ? 'Enviando…' : 'Confirmar candidatura'}</button>
        </div>
      </Modal>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h2 className="eyebrow mb-4">{title}</h2><div className="text-white/75 leading-relaxed">{children}</div></div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 text-sm"><span className="text-white/50">{k}</span><span className="text-right">{v}</span></div>;
}
