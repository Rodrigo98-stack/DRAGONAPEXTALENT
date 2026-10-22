import { useState } from 'react';
import { db } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { date, humanError, money } from '../../lib/format';
import type { Company } from '../../lib/types';
import { Badge, EmptyState, Modal, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { SetPasswordButton } from '../../components/SetPasswordButton';
import { CreateAccountButton } from '../../components/CreateAccountButton';

type Row = Company & { jobs: { status: string }[] };

export function AdminCompanies() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const { data, loading, reload } = useAsync(async () =>
    ((await db().from('companies').select('*, jobs(status)').order('created_at', { ascending: false })).data ?? []) as Row[]);

  const patch = async (c: Row, v: Partial<Company>, ok: string) => {
    const { error } = await db().from('companies').update(v).eq('id', c.id);
    if (error) return toast('error', humanError(error));
    toast('ok', ok); reload();
  };
  const adjust = async (c: Row) => {
    const raw = prompt(`Ajuste de créditos para ${c.name} (use negativo para debitar):`);
    if (!raw) return;
    const amount = Number(raw.replace(',', '.'));
    if (!amount) return toast('error', 'Valor inválido.');
    const note = prompt('Motivo do ajuste:') ?? '';
    const { error } = await db().rpc('admin_adjust_wallet', { p_company: c.id, p_amount: amount, p_note: note });
    if (error) return toast('error', humanError(error));
    toast('ok', 'Carteira ajustada.'); reload();
  };

  const list = (data ?? []).filter((c) => !q || `${c.name} ${c.cnpj} ${c.corporate_email} ${c.city}`.toLowerCase().includes(q.toLowerCase()));
  if (loading) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input className="input max-w-sm" placeholder="Buscar empresa, CNPJ, e-mail…" value={q} onChange={(e) => setQ(e.target.value)} />
        <CreateAccountButton role="company" onCreated={reload} />
      </div>
      {list.length ? (
        <div className="card overflow-x-auto p-2"><table className="table">
          <thead><tr><th>Empresa</th><th>Responsável</th><th>Vagas</th><th>Saldo</th><th>Situação</th><th className="text-right">Ações</th></tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id}>
              <td><button className="text-left font-medium hover:text-silver-light" onClick={() => setOpen(c)}>{c.name}</button><div className="text-xs text-white/40">{c.cnpj ?? 'sem CNPJ'} · {date(c.created_at)}</div></td>
              <td>{c.responsible_name}<div className="text-xs text-white/40">{c.corporate_email}</div></td>
              <td className="text-xs">{c.jobs.filter((j) => j.status === 'published').length} ativas / {c.jobs.length}</td>
              <td>{money(c.credit_balance)}</td>
              <td className="space-x-1">{c.verified ? <Badge tone="ok">Verificada</Badge> : <Badge tone="warn">Não verificada</Badge>}{c.suspended && <Badge tone="bad">Suspensa</Badge>}</td>
              <td><div className="flex flex-wrap justify-end gap-2">
                <button className="btn-ghost btn-sm" onClick={() => patch(c, { verified: !c.verified }, c.verified ? 'Verificação removida.' : 'Empresa verificada.')}>{c.verified ? 'Desverificar' : 'Verificar'}</button>
                <button className="btn-ghost btn-sm" onClick={() => adjust(c)}>Créditos</button>
                <SetPasswordButton userId={c.owner_id} name={c.responsible_name} email={c.corporate_email} />
                <button className={c.suspended ? 'btn-silver btn-sm' : 'btn-danger btn-sm'} onClick={() => confirm(c.suspended ? 'Reativar conta?' : 'Suspender conta? A empresa não poderá criar nem publicar vagas.') && patch(c, { suspended: !c.suspended }, c.suspended ? 'Conta reativada.' : 'Conta suspensa.')}>{c.suspended ? 'Reativar' : 'Suspender'}</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <EmptyState title="Nenhuma empresa cadastrada" />}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open && <dl className="grid grid-cols-[140px_1fr] gap-2 text-sm">
          {([['CNPJ', open.cnpj], ['Responsável', `${open.responsible_name}${open.responsible_role ? ` (${open.responsible_role})` : ''}`], ['E-mail', open.corporate_email],
            ['Telefone', open.phone], ['WhatsApp', open.whatsapp], ['Local', [open.city, open.state].filter(Boolean).join('/')], ['Setor', open.sector], ['Site', open.website],
            ['Nome público', open.show_name_publicly ? 'Autorizado' : 'Confidencial'], ['Descrição', open.description]] as [string, string | null][]).map(([k, v]) => (
            <div key={k} className="contents"><dt className="text-white/45">{k}</dt><dd>{v || "—"}</dd></div>
          ))}
        </dl>}
      </Modal>
    </div>
  );
}
