import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { date, dateTime, humanError, money } from '../../lib/format';
import { normalize as normalizeSearch } from '../../lib/matching';
import { AREAS, LEVELS, TALENT_STATUS, UFS, WORK_MODES, stageLabel } from '../../lib/constants';
import type { Job, Profile, ProfessionalProfile, Stage } from '../../lib/types';
import { Badge, EmptyState, Field, Modal, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { SetPasswordButton } from '../../components/SetPasswordButton';
import { CreateAccountButton } from '../../components/CreateAccountButton';
import { completion } from '../pro/ProfileWizard';
import { openResume } from '../pro/ResumeManager';

type TalentRow = { status: string; tags: string[]; future_flag: boolean; last_contact_at: string | null; review_due_at: string | null; update_requested_at: string | null };
type Row = ProfessionalProfile & { profiles: Pick<Profile, 'full_name' | 'email' | 'phone' | 'created_at'>; talent?: TalentRow; resume?: string; applications: number };

const PAGE = 25;

export function AdminTalent() {
  const [f, setF] = useState({ q: '', area: '', uf: '', mode: '', level: '', status: '', active: '', incomplete: false });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Row | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    const [pros, talent, resumes, apps] = await Promise.all([
      db().from('professional_profiles').select('*, profiles!inner(full_name,email,phone,created_at)').order('updated_at', { ascending: false }).limit(2000),
      db().from('talent_bank').select('*'),
      db().from('resumes').select('user_id,storage_path').eq('is_current', true),
      db().from('applications').select('professional_id'),
    ]);
    const t = new Map((talent.data ?? []).map((x: TalentRow & { professional_id: string }) => [x.professional_id, x]));
    const r = new Map((resumes.data ?? []).map((x: { user_id: string; storage_path: string }) => [x.user_id, x.storage_path]));
    const counts = new Map<string, number>();
    (apps.data ?? []).forEach((a: { professional_id: string }) => counts.set(a.professional_id, (counts.get(a.professional_id) ?? 0) + 1));
    return ((pros.data ?? []) as Row[]).map((p) => ({ ...p, talent: t.get(p.user_id), resume: r.get(p.user_id), applications: counts.get(p.user_id) ?? 0 }));
  });

  const list = useMemo(() => (data ?? []).filter((p) => {
    if (f.area && p.area !== f.area) return false;
    if (f.uf && p.state !== f.uf) return false;
    if (f.mode && p.work_mode !== f.mode) return false;
    if (f.level && p.experience_level !== f.level) return false;
    if (f.status && p.talent?.status !== f.status) return false;
    if (f.active && p.activation_status !== f.active) return false;
    if (f.incomplete && completion(p, !!p.resume) >= 80) return false;
    if (f.q) {
      const hay = normalizeSearch([p.profiles.full_name, p.desired_role, p.area, p.city, p.hard_skills.join(' '), p.soft_skills.join(' '), p.certifications,
        p.languages.join(' '), p.experiences.map((e) => `${e.cargo} ${e.empresa}`).join(' '), p.education.map((e) => e.curso).join(' '), p.talent?.tags.join(' ')].join(' '));
      return normalizeSearch(f.q).split(' ').every((w) => hay.includes(w));
    }
    return true;
  }), [data, f]);

  const set = (k: keyof typeof f, v: string | boolean) => { setF({ ...f, [k]: v }); setPage(0); };

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><CreateAccountButton role="professional" onCreated={reload} /></div>
      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input className="input lg:col-span-2" placeholder="Palavras-chave: cargo, competência, curso, cidade…" value={f.q} onChange={(e) => set('q', e.target.value)} />
        <select className="input" value={f.area} onChange={(e) => set('area', e.target.value)} aria-label="Área"><option value="">Área</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select>
        <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)} aria-label="Status no banco"><option value="">Status no banco</option>{Object.entries(TALENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input" value={f.uf} onChange={(e) => set('uf', e.target.value)} aria-label="Estado"><option value="">Estado</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
        <select className="input" value={f.mode} onChange={(e) => set('mode', e.target.value)} aria-label="Modalidade"><option value="">Modalidade</option>{Object.entries(WORK_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input" value={f.level} onChange={(e) => set('level', e.target.value)} aria-label="Experiência"><option value="">Experiência</option>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input" value={f.active} onChange={(e) => set('active', e.target.value)} aria-label="Ativação"><option value="">Ativação</option><option value="active">Ativos</option><option value="pending">Pendentes</option></select>
        <label className="flex items-center gap-2 text-sm text-white/60"><input type="checkbox" className="accent-[#B9BEC5]" checked={f.incomplete} onChange={(e) => set('incomplete', e.target.checked)} />Perfis incompletos</label>
      </div>
      {loading ? <Spinner /> : list.length ? (
        <>
          <p className="text-xs text-white/40">{list.length} profissional(is)</p>
          <div className="card overflow-x-auto p-2"><table className="table">
            <thead><tr><th>Profissional</th><th>Área / cargo</th><th>Local</th><th>Perfil</th><th>Banco</th><th>Atualizado</th></tr></thead>
            <tbody>{list.slice(page * PAGE, page * PAGE + PAGE).map((p) => {
              const pct = completion(p, !!p.resume);
              return (
                <tr key={p.user_id} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => setOpen(p)}>
                  <td><div className="font-medium">{p.profiles.full_name}</div><div className="text-xs text-white/40">{p.profiles.email}</div></td>
                  <td>{p.area ?? '—'}<div className="text-xs text-white/40">{p.desired_role}</div></td>
                  <td>{[p.city, p.state].filter(Boolean).join('/') || '—'}</td>
                  <td><Badge tone={p.activation_status === 'active' ? 'ok' : 'warn'}>{p.activation_status === 'active' ? 'Ativo' : 'Pendente'}</Badge>
                    <div className={`mt-1 text-[11px] ${pct < 80 ? 'text-amber-200/80' : 'text-white/40'}`}>{pct}% preenchido</div></td>
                  <td>{p.talent ? <Badge tone="silver">{TALENT_STATUS[p.talent.status]}</Badge> : <span className="text-xs text-white/30">—</span>}
                    {p.applications > 0 && <div className="mt-1 text-[11px] text-white/40">{p.applications} candidatura(s)</div>}</td>
                  <td className="text-xs">{date(p.updated_at)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {list.length > PAGE && (
            <div className="flex items-center justify-center gap-3">
              <button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
              <span className="text-sm text-white/50">{page + 1} / {Math.ceil(list.length / PAGE)}</span>
              <button className="btn-ghost btn-sm" disabled={(page + 1) * PAGE >= list.length} onClick={() => setPage(page + 1)}>→</button>
            </div>
          )}
        </>
      ) : <EmptyState title="Nenhum profissional encontrado">Ajuste os filtros ou aguarde novos cadastros.</EmptyState>}
      {open && <TalentDrawer row={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function TalentDrawer({ row: p, onClose }: { row: Row; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState(p.talent?.status ?? 'novo');
  const [tags, setTags] = useState((p.talent?.tags ?? []).join(', '));
  const [future, setFuture] = useState(p.talent?.future_flag ?? false);
  const [note, setNote] = useState('');
  const [contact, setContact] = useState({ channel: 'whatsapp', summary: '' });
  const [inviteJob, setInviteJob] = useState('');

  const { data, reload } = useAsync(async () => {
    const [notes, contacts, apps, jobs] = await Promise.all([
      db().from('internal_notes').select('*, profiles!internal_notes_author_id_fkey(full_name)').eq('subject_type', 'professional').eq('subject_id', p.user_id).order('created_at', { ascending: false }),
      db().from('talent_contacts').select('*').eq('professional_id', p.user_id).order('created_at', { ascending: false }),
      db().from('applications').select('stage, created_at, jobs(title)').eq('professional_id', p.user_id),
      db().from('jobs').select('id,title,company_id').eq('status', 'published').order('created_at', { ascending: false }),
    ]);
    return { notes: notes.data ?? [], contacts: contacts.data ?? [], apps: apps.data ?? [], jobs: (jobs.data ?? []) as Pick<Job, 'id' | 'title' | 'company_id'>[] };
  }, [p.user_id]);

  const saveTalent = async () => {
    const { error } = await db().from('talent_bank').upsert({
      professional_id: p.user_id, status, future_flag: future, tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      update_requested_at: status === 'aguardando_atualizacao' ? new Date().toISOString() : p.talent?.update_requested_at ?? null,
    });
    if (error) return toast('error', humanError(error));
    if (status === 'aguardando_atualizacao' && p.talent?.status !== status) {
      await db().from('notifications').insert({ user_id: p.user_id, title: 'Atualize seu perfil', body: 'A equipe DRAGON APEX TALENT pediu que você revise e atualize seus dados.', link: '/painel/profissional?aba=perfil' });
    }
    toast('ok', 'Banco de talentos atualizado.');
  };
  const addNote = async () => {
    if (!note.trim()) return;
    const { error } = await db().from('internal_notes').insert({ subject_type: 'professional', subject_id: p.user_id, author_id: profile!.id, body: note.trim() });
    if (error) return toast('error', humanError(error));
    setNote(''); reload();
  };
  const addContact = async () => {
    if (!contact.summary.trim()) return;
    const { error } = await db().from('talent_contacts').insert({ professional_id: p.user_id, channel: contact.channel, summary: contact.summary.trim(), author_id: profile!.id });
    if (error) return toast('error', humanError(error));
    await db().from('talent_bank').upsert({ professional_id: p.user_id, last_contact_at: new Date().toISOString(), status });
    setContact({ ...contact, summary: '' }); reload();
  };
  const invite = async () => {
    if (!inviteJob) return;
    const { error } = await db().from('invitations').insert({ job_id: inviteJob, professional_id: p.user_id, created_by: profile!.id, message: 'Seu perfil foi selecionado pela equipe DRAGON APEX TALENT.' });
    if (error) return toast('error', humanError(error));
    toast('ok', 'Convite enviado ao profissional.');
  };

  return (
    <Modal open onClose={onClose} title={p.profiles.full_name} wide>
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge tone={p.activation_status === 'active' ? 'ok' : 'warn'}>{p.activation_status === 'active' ? 'Ativo' : 'Pendente de ativação'}</Badge>
            {!p.visible_to_companies && <Badge tone="bad">Não autoriza apresentação a empresas</Badge>}
            {!p.allow_contact && <Badge tone="muted">Não aceita contato</Badge>}
          </div>
          <div className="text-white/60">{p.profiles.email} · {p.whatsapp ?? p.profiles.phone}<br />{p.area} · {p.desired_role} · {p.experience_level ? LEVELS[p.experience_level] : '—'} · {p.work_mode ? WORK_MODES[p.work_mode] : '—'}<br />
            {[p.city, p.state].filter(Boolean).join('/')} · Pretensão: {p.salary_negotiable ? 'A combinar' : p.salary_expectation ? money(p.salary_expectation) : '—'} · Disponibilidade: {p.availability ?? '—'}</div>
          <span className="mr-2 inline-block"><SetPasswordButton userId={p.user_id} name={p.profiles.full_name} email={p.profiles.email} /></span>
          {p.resume && <button className="btn-silver btn-sm" onClick={() => openResume(p.resume!).catch((e) => toast('error', humanError(e)))}>📄 Abrir currículo</button>}
          {p.linkedin_url && <a className="ml-2 text-xs text-silver-light underline" href={p.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn / portfólio</a>}
          <div className="text-xs text-white/60"><b className="text-white/80">Técnicas:</b> {p.hard_skills.join(', ') || '—'}<br /><b className="text-white/80">Comportamentais:</b> {p.soft_skills.join(', ') || '—'}<br /><b className="text-white/80">Idiomas:</b> {p.languages.join(', ') || '—'}<br /><b className="text-white/80">Certificações:</b> {p.certifications || '—'}</div>
          {p.education.length > 0 && <div className="text-xs"><div className="eyebrow mb-1">Formação</div>{p.education.map((e, i) => <div key={i}>{e.curso} — {e.instituicao} {e.conclusao && `(${e.conclusao})`}</div>)}</div>}
          {p.experiences.length > 0 && <div className="text-xs"><div className="eyebrow mb-1">Experiências</div>{p.experiences.map((e, i) => <div key={i} className="mb-1"><b>{e.cargo}</b> · {e.empresa} ({e.inicio}–{e.fim})<div className="text-white/50">{e.descricao}</div></div>)}</div>}
          {[['Perfil profissional', p.about_profile], ['Qualidades', p.qualities], ['Por que contratar', p.why_hire]].map(([q, a]) => a && <div key={q}><div className="eyebrow mb-1">{q}</div><p className="whitespace-pre-line text-white/70">{a}</p></div>)}
          {data?.apps.length ? <div className="text-xs"><div className="eyebrow mb-1">Já considerado em</div>{(data.apps as unknown as { stage: string; created_at: string; jobs: { title: string } | null }[]).map((a, i) => <div key={i}>{a.jobs?.title} · {stageLabel(a.stage as Stage)} · {date(a.created_at)}</div>)}</div> : null}
        </div>
        <div className="space-y-5">
          <div className="space-y-3 rounded-xl border border-silver/25 p-4">
            <div className="eyebrow">Banco de talentos</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(TALENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input className="input" placeholder="Etiquetas (vírgula)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" className="accent-[#B9BEC5]" checked={future} onChange={(e) => setFuture(e.target.checked)} />Marcar para futuras oportunidades</label>
            {p.talent?.review_due_at && <div className="text-[11px] text-white/40">Revisão de retenção (LGPD): {date(p.talent.review_due_at)}</div>}
            <button className="btn-silver btn-sm" onClick={saveTalent}>Salvar</button>
          </div>
          <div className="space-y-2">
            <div className="eyebrow">Encaminhar / convidar para vaga</div>
            <div className="flex gap-2"><select className="input" value={inviteJob} onChange={(e) => setInviteJob(e.target.value)}><option value="">Vaga publicada…</option>{data?.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select>
              <button className="btn-ghost btn-sm" disabled={!inviteJob || p.activation_status !== 'active'} onClick={invite}>Convidar</button></div>
            {p.activation_status !== 'active' && <p className="text-[11px] text-white/40">Convites exigem perfil ativo.</p>}
          </div>
          <div className="space-y-2">
            <div className="eyebrow">Histórico de contatos</div>
            <div className="flex gap-2"><select className="input w-32" value={contact.channel} onChange={(e) => setContact({ ...contact, channel: e.target.value })}>
              {['whatsapp', 'email', 'telefone', 'encaminhamento'].map((c) => <option key={c}>{c}</option>)}</select>
              <input className="input" placeholder="Resumo do contato" value={contact.summary} onChange={(e) => setContact({ ...contact, summary: e.target.value })} /></div>
            <button className="btn-ghost btn-sm" onClick={addContact} disabled={!p.allow_contact && contact.channel !== 'encaminhamento'}>Registrar</button>
            <ul className="space-y-1 text-xs text-white/50">{data?.contacts.map((c: { id: string; channel: string; summary: string; created_at: string }) => <li key={c.id}>{dateTime(c.created_at)} · {c.channel} — {c.summary}</li>)}</ul>
          </div>
          <Field label="Observações internas"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <button className="btn-ghost btn-sm" onClick={addNote}>Adicionar</button>
          <ul className="space-y-1 text-xs">{data?.notes.map((n: { id: string; body: string; created_at: string; profiles?: { full_name: string } }) => <li key={n.id} className="rounded bg-white/[0.03] p-2">{n.body}<div className="text-white/35">{n.profiles?.full_name} · {dateTime(n.created_at)}</div></li>)}</ul>
        </div>
      </div>
    </Modal>
  );
}
