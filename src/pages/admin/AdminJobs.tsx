import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { date, humanError } from '../../lib/format';
import { JOB_STATUS, WORK_MODES, CONTRACTS } from '../../lib/constants';
import type { Job, JobStatus } from '../../lib/types';
import { Badge, EmptyState, Field, Modal, Spinner } from '../../components/ui';
import { Kanban } from '../../components/Kanban';
import { useToast } from '../../components/Toast';
import { JobForm } from '../company/JobForm';
import { salaryText } from '../../components/JobCard';

type Row = Job & { companies: { name: string } | null };

export function AdminJobs({ onChange }: { onChange: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<JobStatus | ''>('in_review');
  const [q, setQ] = useState('');
  const [review, setReview] = useState<Row | null>(null);
  const [note, setNote] = useState('');
  const [board, setBoard] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<Row | null>(null);
  const [days, setDays] = useState(30);

  const { data, loading, reload } = useAsync(async () => {
    let query = db().from('jobs').select('*, companies(name)').order('created_at', { ascending: false }).limit(300);
    if (status) query = query.eq('status', status);
    return ((await query).data ?? []) as Row[];
  }, [status]);

  const rpc = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const { error } = await db().rpc(fn, args);
    if (error) return toast('error', humanError(error));
    toast('ok', ok); reload(); onChange();
  };

  const list = (data ?? []).filter((j) => !q || `${j.title} ${j.area} ${j.companies?.name}`.toLowerCase().includes(q.toLowerCase()));

  if (board) return (
    <div className="space-y-5">
      <button className="btn-ghost btn-sm" onClick={() => setBoard(null)}>← Voltar às vagas</button>
      <h2 className="font-display text-3xl">{board.title} <span className="text-base text-white/40">· {board.companies?.name ?? 'Vaga da administração'}</span></h2>
      <Kanban job={board} companyId={null} />
    </div>
  );

  if (creating) return (
    <div className="space-y-5">
      <button className="btn-ghost btn-sm" onClick={() => setCreating(false)}>← Voltar</button>
      <h2 className="font-display text-3xl">Nova vaga (administração)</h2>
      <p className="text-sm text-white/50">Vagas criadas pela administração não pertencem a uma empresa e não geram cobrança diária.</p>
      <JobForm admin companyId={null} createdBy={profile!.id} onSaved={() => { setCreating(false); setStatus('approved'); reload(); }} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as JobStatus | '')} aria-label="Status">
          <option value="">Todos os status</option>{Object.entries(JOB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input className="input max-w-xs" placeholder="Buscar vaga ou empresa…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-silver btn-sm ml-auto" onClick={() => setCreating(true)}>+ Criar vaga</button>
      </div>
      {loading ? <Spinner /> : list.length ? (
        <div className="card overflow-x-auto p-2"><table className="table">
          <thead><tr><th>Vaga</th><th>Empresa</th><th>Status</th><th>Criada</th><th className="text-right">Ações</th></tr></thead>
          <tbody>{list.map((j) => (
            <tr key={j.id}>
              <td><div className="font-medium">{j.title}</div><div className="text-xs text-white/40">{j.area} · {WORK_MODES[j.work_mode]}</div></td>
              <td>{j.companies?.name ?? <span className="text-white/40">Administração</span>}</td>
              <td><Badge tone={JOB_STATUS[j.status].tone}>{JOB_STATUS[j.status].label}</Badge>{j.billing_exempt && <div className="mt-1 text-[11px] text-silver-light">Isenta</div>}</td>
              <td>{date(j.created_at)}</td>
              <td><div className="flex flex-wrap justify-end gap-2">
                {['in_review', 'draft', 'rejected'].includes(j.status) && <button className="btn-silver btn-sm" onClick={() => { setNote(j.review_note ?? ''); setReview(j); }}>Revisar</button>}
                {['approved', 'paused'].includes(j.status) && <button className="btn-silver btn-sm" onClick={() => { setDays(30); setPublishing(j); }}>Publicar</button>}
                {j.status === 'published' && <button className="btn-ghost btn-sm" onClick={() => rpc('pause_job', { p_job: j.id }, 'Vaga pausada.')}>Pausar</button>}
                {j.company_id && <button className="btn-ghost btn-sm" onClick={() => rpc('admin_set_job_exempt', { p_job: j.id, p_exempt: !j.billing_exempt }, j.billing_exempt ? 'Cobrança reativada.' : 'Vaga isenta de cobrança.')}>{j.billing_exempt ? 'Remover isenção' : 'Isentar'}</button>}
                {!['draft', 'in_review', 'rejected'].includes(j.status) && <button className="btn-ghost btn-sm" onClick={() => setBoard(j)}>Processo</button>}
                {!['closed', 'draft', 'in_review', 'rejected'].includes(j.status) && <button className="btn-danger btn-sm" onClick={() => confirm('Encerrar vaga?') && rpc('close_job', { p_job: j.id }, 'Vaga encerrada.')}>Encerrar</button>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <EmptyState title="Nenhuma vaga neste filtro" />}

      <Modal open={!!review} onClose={() => setReview(null)} title="Revisão da vaga" wide>
        {review && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div><span className="text-white/50">Cargo:</span> {review.title}</div><div><span className="text-white/50">Área:</span> {review.area}</div>
              <div><span className="text-white/50">Contratação:</span> {CONTRACTS[review.contract_type]}</div><div><span className="text-white/50">Remuneração:</span> {salaryText(review)}</div>
              <div><span className="text-white/50">Local:</span> {[review.city, review.state].filter(Boolean).join('/') || '—'} · {WORK_MODES[review.work_mode]}</div>
              <div><span className="text-white/50">Vagas:</span> {review.openings}</div>
            </div>
            <div><div className="eyebrow mb-1">Obrigatórios</div><ul className="list-disc pl-5 text-white/70">{review.requirements_required.map((r) => <li key={r}>{r}</li>)}</ul></div>
            {review.requirements_desired.length > 0 && <div><div className="eyebrow mb-1">Desejáveis</div><ul className="list-disc pl-5 text-white/70">{review.requirements_desired.map((r) => <li key={r}>{r}</li>)}</ul></div>}
            {review.notes && <p className="text-white/60">{review.notes}</p>}
            <p className="rounded-lg bg-white/[0.03] p-3 text-xs text-white/50">Verifique se a vaga não contém critérios discriminatórios, informações enganosas ou exigências ilegais.</p>
            <Field label="Observação para a empresa"><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-ghost" onClick={() => { rpc('admin_review_job', { p_job: review.id, p_decision: 'adjust', p_note: note || 'Ajustes solicitados' }, 'Ajustes solicitados.'); setReview(null); }}>Solicitar ajustes</button>
              <button className="btn-danger" onClick={() => { rpc('admin_review_job', { p_job: review.id, p_decision: 'reject', p_note: note || null }, 'Vaga rejeitada.'); setReview(null); }}>Rejeitar</button>
              <button className="btn-silver" onClick={() => { rpc('admin_review_job', { p_job: review.id, p_decision: 'approve', p_note: note || null }, 'Vaga aprovada.'); setReview(null); }}>Aprovar</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!publishing} onClose={() => setPublishing(null)} title="Publicar vaga">
        {publishing && (
          <div className="space-y-4">
            <Field label={`Duração: ${days} dia(s)`}><input type="range" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-[#B9BEC5]" /></Field>
            <p className="text-xs text-white/50">{publishing.company_id && !publishing.billing_exempt ? 'O valor será debitado da carteira da empresa. Se não houver saldo, isente a vaga ou peça créditos à empresa.' : 'Sem cobrança (vaga isenta ou da administração).'}</p>
            <div className="flex justify-end gap-3"><button className="btn-ghost" onClick={() => setPublishing(null)}>Cancelar</button>
              <button className="btn-silver" onClick={() => { rpc('publish_job', { p_job: publishing.id, p_days: days }, 'Vaga publicada.'); setPublishing(null); }}>Publicar</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
