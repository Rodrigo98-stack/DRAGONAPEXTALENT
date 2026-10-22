import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../lib/supabase';
import { useAsync, must } from '../../lib/useAsync';
import { useSettings } from '../../lib/useSettings';
import { date, dateTime, daysLeft, humanError, money } from '../../lib/format';
import { AREAS, CHARGE_STATUS, JOB_STATUS, UFS } from '../../lib/constants';
import type { Company, Job, Transaction } from '../../lib/types';
import { DashboardShell, Notifications } from '../../components/DashboardShell';
import { Badge, EmptyState, Field, Modal, Spinner, Stat, Tabs } from '../../components/ui';
import { PixPayment } from '../../components/PixPayment';
import { Kanban } from '../../components/Kanban';
import { useToast } from '../../components/Toast';
import { JobForm } from './JobForm';

type Tab = 'vagas' | 'nova' | 'candidatos' | 'carteira' | 'empresa';

export default function CompanyDashboard() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) || 'vagas';
  const go = (t: Tab, extra: Record<string, string> = {}) => setParams({ aba: t, ...extra });
  const [editing, setEditing] = useState<Job | null>(null);
  const settings = useSettings();

  const { data, loading, reload } = useAsync(async () => {
    const company = must(await db().from('companies').select('*').eq('owner_id', profile!.id).single()) as Company;
    const jobs = ((await db().from('jobs').select('*').eq('company_id', company.id).order('created_at', { ascending: false })).data ?? []) as Job[];
    return { company, jobs };
  }, [profile?.id]);

  if (loading || !data) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  const { company, jobs } = data;
  const published = jobs.filter((j) => j.status === 'published');

  return (
    <DashboardShell eyebrow="Painel da empresa" title={company.name}
      aside={<div className="flex flex-wrap gap-2">
        {company.suspended && <Badge tone="bad">Conta suspensa</Badge>}
        {company.verified ? <Badge tone="ok">✓ Verificada</Badge> : <Badge tone="warn">Verificação pendente</Badge>}
        <button className="badge tone-silver" onClick={() => go('carteira')}>Saldo {money(company.credit_balance)}</button>
      </div>}>
      <Tabs<Tab> value={tab} onChange={(t) => { setEditing(null); go(t); }} tabs={[
        { id: 'vagas', label: 'Minhas vagas' }, { id: 'nova', label: editing ? 'Editar vaga' : 'Nova vaga' },
        { id: 'candidatos', label: 'Candidatos' }, { id: 'carteira', label: 'Créditos e faturas' }, { id: 'empresa', label: 'Dados da empresa' },
      ]} />
      <div className="mt-8">
        {tab === 'vagas' && (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Vagas ativas" value={published.length} />
              <Stat label="Custo diário atual" value={money(published.filter((j) => !j.billing_exempt).length * settings.job_daily_rate)} hint="Vagas ativas × diária" />
              <Stat label="Em revisão" value={jobs.filter((j) => j.status === 'in_review').length} />
              <Stat label="Saldo em créditos" value={money(company.credit_balance)} />
            </div>
            <JobsTable jobs={jobs} company={company} onChanged={reload}
              onEdit={(j) => { setEditing(j); go('nova'); }} onCandidates={(j) => go('candidatos', { vaga: j.id })} />
            <div className="card p-6"><h2 className="mb-3 font-display text-2xl">Notificações</h2><Notifications userId={profile!.id} /></div>
          </div>
        )}
        {tab === 'nova' && (company.suspended ? <EmptyState title="Conta suspensa">Fale com a equipe DRAGON APEX TALENT.</EmptyState> :
          <JobForm companyId={company.id} createdBy={profile!.id} job={editing} onSaved={() => { setEditing(null); reload(); go('vagas'); }} />)}
        {tab === 'candidatos' && <Candidates jobs={jobs} companyId={company.id} selected={params.get('vaga')} onSelect={(id) => go('candidatos', { vaga: id })} />}
        {tab === 'carteira' && <Wallet company={company} onChanged={reload} />}
        {tab === 'empresa' && <CompanyProfile company={company} onSaved={reload} />}
      </div>
    </DashboardShell>
  );
}

function JobsTable({ jobs, company, onChanged, onEdit, onCandidates }: {
  jobs: Job[]; company: Company; onChanged: () => void; onEdit: (j: Job) => void; onCandidates: (j: Job) => void;
}) {
  const toast = useToast();
  const s = useSettings();
  const [publishing, setPublishing] = useState<Job | null>(null);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  const rpc = async (fn: string, args: Record<string, unknown>, ok: string, ask?: string) => {
    if (ask && !confirm(ask)) return;
    setBusy(true);
    const { error } = await db().rpc(fn, args);
    setBusy(false);
    if (error) return toast('error', humanError(error));
    toast('ok', ok); onChanged();
  };
  const submitReview = async (j: Job) => {
    const { error } = await db().from('jobs').update({ status: 'in_review' }).eq('id', j.id);
    if (error) return toast('error', humanError(error));
    toast('ok', 'Enviada para revisão.'); onChanged();
  };

  if (!jobs.length) return <EmptyState title="Nenhuma vaga criada">Use “Nova vaga” para preencher o questionário de abertura.</EmptyState>;
  const cost = days * s.job_daily_rate;

  return (
    <>
      <div className="card overflow-x-auto p-2">
        <table className="table">
          <thead><tr><th>Vaga</th><th>Status</th><th>Período</th><th className="text-right">Ações</th></tr></thead>
          <tbody>{jobs.map((j) => (
            <tr key={j.id}>
              <td><div className="font-medium">{j.title}</div><div className="text-xs text-white/40">{j.area} · criada {date(j.created_at)}</div>
                {j.review_note && ['rejected', 'draft'].includes(j.status) && <div className="mt-1 text-xs text-amber-200/80">Equipe: {j.review_note}</div>}</td>
              <td><Badge tone={JOB_STATUS[j.status].tone}>{JOB_STATUS[j.status].label}</Badge>
                {j.paused_reason && j.status === 'paused' && <div className="mt-1 max-w-[220px] text-[11px] text-white/40">{j.paused_reason}</div>}
                {j.billing_exempt && <div className="mt-1 text-[11px] text-silver-light">Isenta de cobrança</div>}</td>
              <td className="text-xs text-white/60">{j.status === 'published' ? <>até {date(j.expires_at)}<br /><span className="text-silver-light">{daysLeft(j.expires_at)} dia(s) restante(s)</span></> : '—'}</td>
              <td><div className="flex flex-wrap justify-end gap-2">
                {['draft', 'rejected'].includes(j.status) && <><button className="btn-ghost btn-sm" onClick={() => onEdit(j)}>Editar</button><button className="btn-silver btn-sm" onClick={() => submitReview(j)}>Enviar p/ revisão</button></>}
                {['approved', 'paused'].includes(j.status) && <button className="btn-silver btn-sm" onClick={() => { setDays(30); setPublishing(j); }}>{j.status === 'paused' ? 'Renovar' : 'Publicar'}</button>}
                {j.status === 'published' && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => rpc('pause_job', { p_job: j.id }, 'Vaga pausada. Dias não usados voltaram para a carteira.', 'Pausar a vaga? Os dias inteiros não usados serão devolvidos como créditos.')}>Pausar</button>}
                {['published', 'paused', 'approved'].includes(j.status) && <button className="btn-ghost btn-sm" onClick={() => onCandidates(j)}>Candidatos</button>}
                {!['closed', 'draft', 'rejected', 'in_review'].includes(j.status) && <button className="btn-danger btn-sm" disabled={busy} onClick={() => rpc('close_job', { p_job: j.id }, 'Vaga encerrada.', 'Encerrar esta vaga? Ela deixará de receber candidaturas.')}>Encerrar</button>}
                {j.status === 'draft' && <button className="btn-danger btn-sm" onClick={async () => { if (confirm('Excluir rascunho?')) { await db().from('jobs').delete().eq('id', j.id); onChanged(); } }}>Excluir</button>}
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Modal open={!!publishing} onClose={() => setPublishing(null)} title={publishing?.status === 'paused' ? 'Renovar publicação' : 'Publicar vaga'}>
        {publishing && (
          <div className="space-y-5">
            <p className="text-sm text-white/60">{publishing.title}</p>
            <Field label={`Duração da publicação: ${days} dia(s)`}>
              <input type="range" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-[#B9BEC5]" />
            </Field>
            <div className="rounded-2xl border border-silver/30 bg-silver/5 p-5">
              <div className="flex justify-between text-sm"><span className="text-white/60">{days} dia(s) × {money(s.job_daily_rate)}</span>
                <span className="font-display text-3xl text-silver-light">{publishing.billing_exempt ? 'Isenta' : money(cost)}</span></div>
              <div className="mt-2 flex justify-between text-xs text-white/50"><span>Saldo atual</span><span>{money(company.credit_balance)}</span></div>
              {!publishing.billing_exempt && company.credit_balance < cost && <p className="mt-3 text-xs text-amber-200">Saldo insuficiente. Adicione {money(cost - company.credit_balance)} em créditos via PIX na aba “Créditos e faturas”.</p>}
            </div>
            <p className="text-xs text-white/45">Ao fim do período a vaga é pausada automaticamente (não excluída). Encerrar antes devolve os dias inteiros não usados.</p>
            <div className="flex justify-end gap-3">
              <button className="btn-ghost" onClick={() => setPublishing(null)}>Cancelar</button>
              <button className="btn-silver" disabled={busy || (!publishing.billing_exempt && company.credit_balance < cost)}
                onClick={async () => { await rpc('publish_job', { p_job: publishing.id, p_days: days }, 'Vaga publicada!'); setPublishing(null); }}>
                Confirmar e publicar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Candidates({ jobs, companyId, selected, onSelect }: { jobs: Job[]; companyId: string; selected: string | null; onSelect: (id: string) => void }) {
  const eligible = jobs.filter((j) => ['published', 'paused', 'approved', 'closed'].includes(j.status));
  const job = eligible.find((j) => j.id === selected) ?? eligible[0];
  if (!job) return <EmptyState title="Nenhuma vaga com candidatos">Publique uma vaga para começar a receber candidaturas.</EmptyState>;
  return (
    <div className="space-y-5">
      <select className="input max-w-md" value={job.id} onChange={(e) => onSelect(e.target.value)} aria-label="Vaga">
        {eligible.map((j) => <option key={j.id} value={j.id}>{j.title} — {JOB_STATUS[j.status].label}</option>)}
      </select>
      <Kanban job={job} companyId={companyId} />
    </div>
  );
}

function Wallet({ company, onChanged }: { company: Company; onChanged: () => void }) {
  const toast = useToast();
  const s = useSettings();
  const [amount, setAmount] = useState(30);
  const [tx, setTx] = useState<Transaction | null>(null);
  const { data, reload } = useAsync(async () => {
    const [ledger, bills, txs] = await Promise.all([
      db().from('wallet_ledger').select('*, jobs(title)').eq('company_id', company.id).order('created_at', { ascending: false }).limit(50),
      db().from('job_billing').select('*, jobs(title)').eq('company_id', company.id).order('created_at', { ascending: false }).limit(50),
      db().from('transactions').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).limit(20),
    ]);
    return { ledger: ledger.data ?? [], bills: bills.data ?? [], txs: (txs.data ?? []) as Transaction[] };
  }, [company.id]);

  const buy = async () => {
    const { data: t, error } = await db().rpc('create_charge', { p_kind: 'job_credit', p_amount: amount });
    if (error) return toast('error', humanError(error));
    setTx(t as Transaction); reload();
  };

  const LEDGER: Record<string, string> = { pix_credit: 'Crédito via PIX', job_publication: 'Publicação de vaga', job_refund: 'Devolução de dias não usados', admin_adjustment: 'Ajuste administrativo' };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="card-silver h-fit space-y-5 p-6">
        <div><div className="text-xs text-white/50">Saldo disponível</div><div className="font-display text-5xl text-silver-light">{money(company.credit_balance)}</div>
          <div className="text-xs text-white/40">≈ {Math.floor(company.credit_balance / s.job_daily_rate)} dia(s) de vaga</div></div>
        <Field label="Adicionar créditos (R$)">
          <div className="flex gap-2"><input type="number" min={s.job_daily_rate} max={10000} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" />
            <button className="btn-silver btn-sm shrink-0" onClick={buy} disabled={company.suspended}>Gerar PIX</button></div>
        </Field>
        <div className="flex flex-wrap gap-2">{[10, 30, 60, 90].map((v) => <button key={v} className="tab border border-white/10" onClick={() => setAmount(v)}>{money(v)}</button>)}</div>
        <p className="text-xs text-white/45">Créditos são liberados após a confirmação do PIX e debitados conforme os dias de publicação ({money(s.job_daily_rate)}/dia/vaga).</p>
      </div>
      <div className="space-y-6">
        <Section title="Faturas de publicação por vaga">
          {data?.bills.length ? <table className="table"><thead><tr><th>Vaga</th><th>Início</th><th>Fim</th><th>Dias</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody>{data.bills.map((b: { id: string; jobs: { title: string }; start_at: string; end_at: string; days: number; amount: number; refunded_amount: number; status: string }) => (
              <tr key={b.id}><td>{b.jobs?.title}</td><td>{date(b.start_at)}</td><td>{date(b.end_at)}</td><td>{b.days}</td>
                <td>{money(b.amount)}{b.refunded_amount > 0 && <div className="text-[11px] text-emerald-300">− {money(b.refunded_amount)} devolvido</div>}</td>
                <td><Badge tone={b.status === 'exempt' ? 'silver' : 'ok'}>{b.status === 'exempt' ? 'Isenta' : b.status === 'partially_refunded' ? 'Encerrada antes' : 'Paga'}</Badge></td></tr>
            ))}</tbody></table> : <p className="p-4 text-sm text-white/40">Nenhuma publicação ainda.</p>}
        </Section>
        <Section title="Movimentações da carteira">
          {data?.ledger.length ? <table className="table"><thead><tr><th>Data</th><th>Descrição</th><th className="text-right">Valor</th></tr></thead>
            <tbody>{data.ledger.map((l: { id: string; created_at: string; kind: string; amount: number; jobs?: { title: string } }) => (
              <tr key={l.id}><td>{dateTime(l.created_at)}</td><td>{LEDGER[l.kind]}{l.jobs?.title ? ` — ${l.jobs.title}` : ''}</td>
                <td className={`text-right ${l.amount < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{l.amount < 0 ? '−' : '+'} {money(Math.abs(l.amount))}</td></tr>
            ))}</tbody></table> : <p className="p-4 text-sm text-white/40">Sem movimentações.</p>}
        </Section>
        <Section title="Cobranças PIX">
          {data?.txs.length ? <table className="table"><thead><tr><th>Data</th><th>Valor</th><th>Status</th><th /></tr></thead>
            <tbody>{data.txs.map((t) => (
              <tr key={t.id}><td>{dateTime(t.created_at)}</td><td>{money(t.amount)}</td>
                <td><Badge tone={t.status === 'confirmed' ? 'ok' : t.status === 'awaiting' ? 'warn' : 'bad'}>{CHARGE_STATUS[t.status]}</Badge></td>
                <td>{t.status === 'awaiting' && <button className="text-xs text-silver-light hover:underline" onClick={() => setTx(t)}>Ver PIX</button>}</td></tr>
            ))}</tbody></table> : <p className="p-4 text-sm text-white/40">Nenhuma cobrança.</p>}
        </Section>
      </div>
      <Modal open={!!tx} onClose={() => { setTx(null); reload(); }} title="Créditos via PIX" wide>
        {tx && <PixPayment tx={tx} onConfirmed={() => { setTx(null); reload(); onChanged(); }} />}
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card overflow-x-auto p-2"><h3 className="px-3 pb-1 pt-3 font-display text-xl">{title}</h3>{children}</div>;
}

function CompanyProfile({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const toast = useToast();
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const { error } = await db().from('companies').update({
      name: f.name, responsible_name: f.responsible_name, responsible_role: f.responsible_role || null, phone: f.phone || null,
      whatsapp: f.whatsapp || null, city: f.city || null, state: f.state || null, sector: f.sector || null, website: f.website || null,
      description: f.description || null, show_name_publicly: f.show_name_publicly === 'on',
    }).eq('id', company.id);
    if (error) return toast('error', humanError(error));
    toast('ok', 'Dados atualizados.'); onSaved();
  };
  return (
    <form onSubmit={save} className="card grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
      <Field label="Nome da empresa"><input name="name" required defaultValue={company.name} className="input" /></Field>
      <Field label="CNPJ" hint="Para alterar, fale com a equipe."><input disabled value={company.cnpj ?? '—'} className="input" /></Field>
      <Field label="Responsável"><input name="responsible_name" required defaultValue={company.responsible_name} className="input" /></Field>
      <Field label="Cargo do responsável"><input name="responsible_role" defaultValue={company.responsible_role ?? ''} className="input" /></Field>
      <Field label="Telefone"><input name="phone" defaultValue={company.phone ?? ''} className="input" /></Field>
      <Field label="WhatsApp"><input name="whatsapp" defaultValue={company.whatsapp ?? ''} className="input" /></Field>
      <Field label="Cidade"><input name="city" defaultValue={company.city ?? ''} className="input" /></Field>
      <Field label="Estado"><select name="state" defaultValue={company.state ?? ''} className="input"><option value="">UF</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Field>
      <Field label="Setor"><select name="sector" defaultValue={company.sector ?? ''} className="input"><option value="">Selecione</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
      <Field label="Site"><input name="website" type="url" defaultValue={company.website ?? ''} className="input" /></Field>
      <Field label="Descrição" className="sm:col-span-2"><textarea name="description" rows={3} defaultValue={company.description ?? ''} className="input" /></Field>
      <label className="flex items-start gap-3 text-sm text-white/70 sm:col-span-2">
        <input type="checkbox" name="show_name_publicly" defaultChecked={company.show_name_publicly} className="mt-1 accent-[#B9BEC5]" />
        Autorizo exibir o nome e o setor da empresa nas vagas públicas. (Sem autorização, as vagas aparecem como “Empresa confidencial”.)
      </label>
      <div className="sm:col-span-2"><button className="btn-silver">Salvar</button></div>
    </form>
  );
}
