import { useState } from 'react';
import { db } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { useSettings } from '../lib/useSettings';
import { computeMatch } from '../lib/matching';
import { STAGES, stageLabel, LEVELS, WORK_MODES } from '../lib/constants';
import { dateTime, humanError, money } from '../lib/format';
import type { Application, Job, Profile, ProfessionalProfile, Stage } from '../lib/types';
import { Badge, EmptyState, Field, Modal, Spinner } from './ui';
import { useToast } from './Toast';
import { openResume } from '../pages/pro/ResumeManager';

type Card = Application & { profiles: Pick<Profile, 'full_name' | 'email' | 'phone'>; pro?: ProfessionalProfile };

/** Quadro do processo seletivo de uma vaga. Mudanças de etapa passam pela RPC move_application (histórico + responsável). */
export function Kanban({ job, companyId }: { job: Job; companyId: string | null }) {
  const toast = useToast();
  const s = useSettings();
  const [drag, setDrag] = useState<string | null>(null);
  const [open, setOpen] = useState<Card | null>(null);
  const [confirmHire, setConfirmHire] = useState<Card | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    const apps = ((await db().from('applications').select('*, profiles!applications_professional_id_fkey(full_name,email,phone)')
      .eq('job_id', job.id).order('created_at')).data ?? []) as Card[];
    const ids = apps.map((a) => a.professional_id);
    const pros = ids.length ? ((await db().from('professional_profiles').select('*').in('user_id', ids)).data ?? []) as ProfessionalProfile[] : [];
    return apps.map((a) => ({ ...a, pro: pros.find((p) => p.user_id === a.professional_id) }));
  }, [job.id]);

  const move = async (card: Card, to: Stage, note?: string) => {
    if (card.stage === to) return;
    if (to === 'hired' && !note) return setConfirmHire(card);
    const { error } = await db().rpc('move_application', { p_app: card.id, p_stage: to, p_note: note ?? null });
    if (error) return toast('error', humanError(error));
    toast('ok', `Movido para “${stageLabel(to)}”.`); reload();
  };

  if (loading) return <Spinner />;
  if (!data?.length) return <EmptyState title="Nenhum candidato ainda">As candidaturas desta vaga aparecerão aqui, organizadas por etapa.</EmptyState>;

  return (
    <>
      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {STAGES.map((st) => {
          const cards = data.filter((c) => c.stage === st.id);
          return (
            <div key={st.id} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { const c = data.find((x) => x.id === drag); if (c) move(c, st.id); setDrag(null); }}
              className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-ink-800 ${st.id === 'hired' ? 'border-emerald-400/20' : st.id === 'rejected' ? 'border-red-400/15' : 'border-white/[0.06]'}`}>
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/60">
                {st.label}<span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{cards.length}</span>
              </div>
              <div className="flex min-h-[120px] flex-col gap-2 p-3">
                {cards.map((c) => {
                  const m = c.pro ? computeMatch(job, c.pro, s.matching_weights) : null;
                  return (
                    <div key={c.id} draggable onDragStart={() => setDrag(c.id)}
                      className="card cursor-grab p-3 transition hover:border-silver/40 active:cursor-grabbing">
                      <button className="w-full text-left" onClick={() => setOpen(c)}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold">{c.favorite && <span className="text-silver">★ </span>}{c.profiles?.full_name}</span>
                          {m && <span className="text-xs font-bold text-silver-light">{m.score}%</span>}
                        </div>
                        <div className="mt-1 text-xs text-white/45">{c.pro?.desired_role ?? '—'}</div>
                        {m && m.missingRequired.length > 0 && <div className="mt-2 text-[11px] text-red-300">✕ {m.missingRequired.length} requisito(s) obrigatório(s)</div>}
                        {c.interview_at && <div className="mt-1 text-[11px] text-sky-200">Entrevista {dateTime(c.interview_at)}</div>}
                      </button>
                      <select aria-label="Mover para etapa" className="input mt-2 !py-1.5 text-xs" value={c.stage} onChange={(e) => move(c, e.target.value as Stage)}>
                        {STAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {open && <CandidateDrawer card={open} job={job} companyId={companyId} onClose={() => { setOpen(null); reload(); }} />}
      <Modal open={!!confirmHire} onClose={() => setConfirmHire(null)} title="Confirmar contratação">
        <p className="text-sm text-white/60">Registrar a contratação de <strong>{confirmHire?.profiles?.full_name}</strong> como concluída? Esta confirmação fica registrada com seu usuário e data.</p>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={() => setConfirmHire(null)}>Cancelar</button>
          <button className="btn-silver" onClick={() => { const c = confirmHire!; setConfirmHire(null); move(c, 'hired', 'Contratação confirmada'); }}>Confirmar contratação</button>
        </div>
      </Modal>
    </>
  );
}

function CandidateDrawer({ card, job, companyId, onClose }: { card: Card; job: Job; companyId: string | null; onClose: () => void }) {
  const toast = useToast();
  const s = useSettings();
  const p = card.pro;
  const m = p ? computeMatch(job, p, s.matching_weights) : null;
  const [note, setNote] = useState('');
  const [interview, setInterview] = useState(card.interview_at?.slice(0, 16) ?? '');

  const { data, reload } = useAsync(async () => {
    const [notes, events, resume] = await Promise.all([
      db().from('internal_notes').select('*, profiles!internal_notes_author_id_fkey(full_name)').eq('subject_type', 'application').eq('subject_id', card.id).order('created_at', { ascending: false }),
      db().from('application_events').select('*').eq('application_id', card.id).order('created_at', { ascending: false }),
      db().from('resumes').select('storage_path,file_name').eq('user_id', card.professional_id).eq('is_current', true).maybeSingle(),
    ]);
    return { notes: notes.data ?? [], events: events.data ?? [], resume: resume.data as { storage_path: string; file_name: string } | null };
  }, [card.id]);

  const patch = async (v: Partial<Application>) => {
    const { error } = await db().from('applications').update(v).eq('id', card.id);
    if (error) return toast('error', humanError(error));
    toast('ok', 'Salvo.');
  };
  const addNote = async () => {
    if (!note.trim()) return;
    const { data: u } = await db().auth.getUser();
    const { error } = await db().from('internal_notes').insert({ subject_type: 'application', subject_id: card.id, company_id: companyId, author_id: u.user!.id, body: note.trim() });
    if (error) return toast('error', humanError(error));
    setNote(''); reload();
  };

  return (
    <Modal open onClose={onClose} title={card.profiles?.full_name ?? 'Candidato'} wide>
      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge tone="silver">{stageLabel(card.stage)}</Badge>
            {p?.experience_level && <Badge>{LEVELS[p.experience_level]}</Badge>}
            {p?.work_mode && <Badge>{WORK_MODES[p.work_mode]}</Badge>}
            {p && <Badge>{[p.city, p.state].filter(Boolean).join('/')}</Badge>}
          </div>
          <div className="text-white/60">{card.profiles?.email} · {card.profiles?.phone ?? p?.whatsapp}</div>
          {m && (
            <div className="rounded-xl border border-white/10 p-4">
              <div className="mb-2 flex justify-between"><span className="text-white/60">Compatibilidade estimada</span><span className="font-display text-2xl text-silver-light">{m.score}%</span></div>
              <ul className="space-y-1 text-xs text-white/50">{m.parts.map((x) => <li key={x.key} className="flex justify-between"><span>{x.label}</span><span>{Math.round(x.value * 100)}%</span></li>)}</ul>
              {m.missingRequired.length > 0 && <div className="mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">Obrigatórios não identificados no perfil: {m.missingRequired.join(', ')}</div>}
              <p className="mt-2 text-[10px] text-white/35">Estimativa por regras — revise o perfil antes de decidir.</p>
            </div>
          )}
          {p?.about_profile && <Q q="Perfil profissional" a={p.about_profile} />}
          {p?.qualities && <Q q="Principais qualidades" a={p.qualities} />}
          {p?.why_hire && <Q q="Por que contratar" a={p.why_hire} />}
          {p && <div className="text-xs text-white/55"><strong className="text-white/80">Competências:</strong> {p.hard_skills.join(', ') || '—'}<br /><strong className="text-white/80">Idiomas:</strong> {p.languages.join(', ') || '—'}<br />
            <strong className="text-white/80">Pretensão:</strong> {p.salary_negotiable ? 'A combinar' : p.salary_expectation ? money(p.salary_expectation) : '—'}</div>}
          {p?.experiences?.length ? <div><div className="eyebrow mb-2">Experiências</div>{p.experiences.map((e, i) => <div key={i} className="mb-2 text-xs"><strong>{e.cargo}</strong> · {e.empresa} <span className="text-white/40">({e.inicio} – {e.fim})</span><div className="text-white/50">{e.descricao}</div></div>)}</div> : null}
          {card.cover_note && <Q q="Mensagem do candidato" a={card.cover_note} />}
        </div>
        <div className="space-y-5">
          {data?.resume ? <button className="btn-silver btn-sm w-full" onClick={() => openResume(data.resume!.storage_path).catch((e) => toast('error', humanError(e)))}>📄 Abrir currículo (link temporário)</button>
            : <p className="text-xs text-white/40">Sem currículo anexado.</p>}
          <button className="btn-ghost btn-sm w-full" onClick={() => patch({ favorite: !card.favorite }).then(() => (card.favorite = !card.favorite))}>{card.favorite ? '★ Remover dos favoritos' : '☆ Marcar como favorito'}</button>
          <Field label="Agendar entrevista">
            <div className="flex gap-2"><input type="datetime-local" className="input" value={interview} onChange={(e) => setInterview(e.target.value)} />
              <button className="btn-ghost btn-sm" onClick={() => patch({ interview_at: interview ? new Date(interview).toISOString() : null })}>Salvar</button></div>
          </Field>
          <div>
            <span className="label">Observações internas (não visíveis ao candidato)</span>
            <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-ghost btn-sm mt-2" onClick={addNote}>Adicionar observação</button>
            <ul className="mt-3 space-y-2">{(data?.notes ?? []).map((n: { id: string; body: string; created_at: string; profiles?: { full_name: string } }) => (
              <li key={n.id} className="rounded-lg bg-white/[0.03] p-2 text-xs"><div>{n.body}</div><div className="mt-1 text-white/35">{n.profiles?.full_name} · {dateTime(n.created_at)}</div></li>
            ))}</ul>
          </div>
          <div>
            <span className="label">Histórico</span>
            <ul className="space-y-1 text-xs text-white/50">{(data?.events ?? []).map((e: { id: string; from_stage: Stage | null; to_stage: Stage; created_at: string; note: string | null }) => (
              <li key={e.id}>{dateTime(e.created_at)} — {e.from_stage ? `${stageLabel(e.from_stage)} → ` : ''}{stageLabel(e.to_stage)}{e.note ? ` (${e.note})` : ''}</li>
            ))}<li>{dateTime(card.created_at)} — Candidatura recebida</li></ul>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Q({ q, a }: { q: string; a: string }) {
  return <div><div className="eyebrow mb-1">{q}</div><p className="whitespace-pre-line leading-relaxed text-white/70">{a}</p></div>;
}
