import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { loadSettings } from '../../lib/useSettings';
import { isValidPixPayload } from '../../lib/pix';
import { DEFAULT_WEIGHTS } from '../../lib/matching';
import { dateTime, humanError, money } from '../../lib/format';
import { CHARGE_KIND, CHARGE_STATUS } from '../../lib/constants';
import type { Transaction } from '../../lib/types';
import { DashboardShell } from '../../components/DashboardShell';
import { Badge, EmptyState, Field, Spinner, Stat, Tabs } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../auth/AuthProvider';
import { AdminJobs } from './AdminJobs';
import { AdminTalent } from './AdminTalent';
import { AdminCompanies } from './AdminCompanies';
import { AdminCourses } from './AdminCourses';

type Tab = 'painel' | 'pagamentos' | 'vagas' | 'talentos' | 'empresas' | 'cursos' | 'mensagens' | 'config';

export default function AdminDashboard() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) || 'painel';
  const { data: k, reload } = useAsync(async () => (await db().rpc('admin_kpis')).data as Record<string, number>);

  return (
    <DashboardShell eyebrow="Administração · DRAGON APEX TALENT" title="Centro de controle">
      <Tabs<Tab> value={tab} onChange={(t) => setParams({ aba: t })} tabs={[
        { id: 'painel', label: 'Indicadores' }, { id: 'pagamentos', label: 'Pagamentos PIX', badge: k?.pagamentos_pendentes },
        { id: 'vagas', label: 'Vagas e processos', badge: k?.vagas_em_revisao }, { id: 'talentos', label: 'Profissionais e banco de talentos' },
        { id: 'empresas', label: 'Empresas' }, { id: 'cursos', label: 'Cursos' }, { id: 'mensagens', label: 'Mensagens e LGPD' }, { id: 'config', label: 'Configurações' },
      ]} />
      <div className="mt-8">
        {tab === 'painel' && (k ? <Kpis k={k} /> : <Spinner />)}
        {tab === 'pagamentos' && <Payments onChange={reload} />}
        {tab === 'vagas' && <AdminJobs onChange={reload} />}
        {tab === 'talentos' && <AdminTalent />}
        {tab === 'empresas' && <AdminCompanies />}
        {tab === 'cursos' && <AdminCourses />}
        {tab === 'mensagens' && <Messages />}
        {tab === 'config' && <Settings />}
      </div>
    </DashboardShell>
  );
}

function Kpis({ k }: { k: Record<string, number> }) {
  const n = (v: number) => Number(v ?? 0).toLocaleString('pt-BR');
  return (
    <div className="space-y-8">
      <p className="text-xs text-white/40">Todos os números são calculados em tempo real a partir do banco de dados.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Profissionais" value={n(k.profissionais)} hint={`${n(k.profissionais_ativos)} ativos`} />
        <Stat label="Empresas cadastradas" value={n(k.empresas)} />
        <Stat label="Vagas abertas" value={n(k.vagas_abertas)} hint={`${n(k.vagas_encerradas)} encerradas · ${n(k.vagas_em_revisao)} em revisão`} />
        <Stat label="Candidatos em análise" value={n(k.candidatos_em_analise)} />
        <Stat label="Processos em andamento" value={n(k.processos_em_andamento)} />
        <Stat label="Talentos no banco" value={n(k.talentos_no_banco)} />
        <Stat label="Cursos publicados" value={n(k.cursos_publicados)} hint={`${n(k.alunos_inscritos)} alunos inscritos`} />
        <Stat label="Contratações registradas" value={n(k.contratacoes)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Receita · taxas de ativação" value={money(k.receita_ativacao)} />
        <Stat label="Receita · publicação de vagas" value={money(k.receita_vagas)} hint={`${money(k.creditos_vendidos)} em créditos vendidos`} />
        <Stat label="Receita · cursos" value={money(k.receita_cursos)} />
        <Stat label="Pagamentos aguardando" value={n(k.pagamentos_pendentes)} />
      </div>
    </div>
  );
}

/* ───────────────────────── Conferência de PIX ───────────────────────── */
function Payments({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<'awaiting' | 'all'>('awaiting');
  const { data, loading, reload } = useAsync(async () => {
    let q = db().from('transactions').select('*, profiles!transactions_user_id_fkey(full_name,email)').order('created_at', { ascending: false }).limit(200);
    if (filter === 'awaiting') q = q.eq('status', 'awaiting');
    return ((await q).data ?? []) as (Transaction & { profiles: { full_name: string; email: string } })[];
  }, [filter]);

  const act = async (fn: 'admin_confirm_transaction' | 'admin_cancel_transaction', t: Transaction) => {
    const note = prompt(fn === 'admin_confirm_transaction'
      ? `Confirmar o recebimento de ${money(t.amount)} (ref. ${t.txid})? Informe uma observação (ex.: ID do PIX no extrato):`
      : 'Motivo do cancelamento:');
    if (note === null) return;
    const { error } = await db().rpc(fn, { p_tx: t.id, p_note: note || null });
    if (error) return toast('error', humanError(error));
    toast('ok', fn === 'admin_confirm_transaction' ? 'Pagamento confirmado e liberação aplicada.' : 'Cobrança cancelada.');
    reload(); onChange();
  };
  const proof = async (path: string) => {
    const { data: s, error } = await db().storage.from('payment-proofs').createSignedUrl(path, 60);
    if (error) return toast('error', humanError(error));
    window.open(s.signedUrl, '_blank', 'noopener');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button className={`tab ${filter === 'awaiting' ? 'tab-active' : ''}`} onClick={() => setFilter('awaiting')}>Aguardando</button>
          <button className={`tab ${filter === 'all' ? 'tab-active' : ''}`} onClick={() => setFilter('all')}>Todos</button>
        </div>
        <p className="max-w-xl text-xs text-white/45">Confira o valor e a referência (txid) no extrato PagBank antes de confirmar. Com o webhook configurado, a confirmação é automática.</p>
      </div>
      {loading ? <Spinner /> : data?.length ? (
        <div className="card overflow-x-auto p-2"><table className="table">
          <thead><tr><th>Data</th><th>Pagador</th><th>Tipo</th><th>Valor</th><th>Referência</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
          <tbody>{data.map((t) => (
            <tr key={t.id}>
              <td>{dateTime(t.created_at)}</td>
              <td>{t.profiles?.full_name}<div className="text-xs text-white/40">{t.profiles?.email}</div></td>
              <td>{CHARGE_KIND[t.kind]}</td><td className="font-semibold text-silver-light">{money(t.amount)}</td>
              <td className="font-mono text-[11px]">{t.txid}</td>
              <td><Badge tone={t.status === 'confirmed' ? 'ok' : t.status === 'awaiting' ? 'warn' : 'bad'}>{CHARGE_STATUS[t.status]}</Badge>
                {t.admin_note && <div className="mt-1 text-[11px] text-white/40">{t.admin_note}</div>}</td>
              <td><div className="flex justify-end gap-2">
                {t.proof_path && <button className="btn-ghost btn-sm" onClick={() => proof(t.proof_path!)}>Comprovante</button>}
                {t.status === 'awaiting' && <>
                  <button className="btn-silver btn-sm" onClick={() => act('admin_confirm_transaction', t)}>Confirmar</button>
                  <button className="btn-danger btn-sm" onClick={() => act('admin_cancel_transaction', t)}>Cancelar</button>
                </>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <EmptyState title="Nada pendente">Nenhuma cobrança aguardando conferência.</EmptyState>}
    </div>
  );
}

/* ───────────────────────── Mensagens, LGPD e auditoria ───────────────────────── */
function Messages() {
  const toast = useToast();
  const { data, reload } = useAsync(async () => {
    const [m, d, a] = await Promise.all([
      db().from('contact_messages').select('*').order('created_at', { ascending: false }).limit(100),
      db().from('deletion_requests').select('*, profiles!deletion_requests_user_id_fkey(full_name,email,role)').order('created_at', { ascending: false }),
      db().from('audit_log').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(60),
    ]);
    return { msgs: m.data ?? [], dels: d.data ?? [], audit: a.data ?? [] };
  });
  const handle = async (table: string, id: string, patch: Record<string, unknown>) => {
    const { error } = await db().from(table).update(patch).eq('id', id);
    if (error) return toast('error', humanError(error));
    reload();
  };
  if (!data) return <Spinner />;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="card p-5">
        <h3 className="mb-4 font-display text-2xl">Mensagens de contato</h3>
        {data.msgs.length ? data.msgs.map((m: { id: string; name: string; email: string; phone: string | null; subject: string; message: string; handled: boolean; created_at: string }) => (
          <div key={m.id} className={`mb-3 rounded-xl border p-4 text-sm ${m.handled ? 'border-white/5 opacity-60' : 'border-silver/30'}`}>
            <div className="flex justify-between gap-2"><strong>{m.subject}</strong><span className="text-xs text-white/40">{dateTime(m.created_at)}</span></div>
            <div className="text-xs text-white/50">{m.name} · {m.email}{m.phone ? ` · ${m.phone}` : ''}</div>
            <p className="mt-2 whitespace-pre-line text-white/70">{m.message}</p>
            {!m.handled && <button className="mt-2 text-xs text-silver-light hover:underline" onClick={() => handle('contact_messages', m.id, { handled: true })}>Marcar como respondida</button>}
          </div>
        )) : <p className="text-sm text-white/40">Nenhuma mensagem.</p>}
      </div>
      <div className="space-y-6">
        <div className="card p-5">
          <h3 className="mb-4 font-display text-2xl">Solicitações de exclusão (LGPD)</h3>
          {data.dels.length ? data.dels.map((d: { id: string; status: string; reason: string | null; created_at: string; profiles: { full_name: string; email: string; role: string } }) => (
            <div key={d.id} className="mb-3 rounded-xl border border-white/10 p-4 text-sm">
              <div className="flex justify-between"><strong>{d.profiles?.full_name}</strong><Badge tone={d.status === 'open' ? 'warn' : 'muted'}>{d.status === 'open' ? 'Aberta' : d.status === 'done' ? 'Concluída' : 'Recusada'}</Badge></div>
              <div className="text-xs text-white/50">{d.profiles?.email} · {dateTime(d.created_at)}</div>
              {d.reason && <p className="mt-1 text-white/60">{d.reason}</p>}
              {d.status === 'open' && <p className="mt-2 text-[11px] text-white/40">Para concluir: remova o usuário em Authentication → Users no Supabase (os dados e currículos são apagados em cascata) e marque como concluída.</p>}
              {d.status === 'open' && <button className="mt-2 text-xs text-silver-light hover:underline" onClick={() => handle('deletion_requests', d.id, { status: 'done', handled_at: new Date().toISOString() })}>Marcar como concluída</button>}
            </div>
          )) : <p className="text-sm text-white/40">Nenhuma solicitação.</p>}
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-display text-2xl">Registro de auditoria</h3>
          <ul className="max-h-96 space-y-1 overflow-y-auto text-xs text-white/55">{data.audit.map((a: { id: number; action: string; entity: string; created_at: string; details: unknown; profiles?: { full_name: string } }) => (
            <li key={a.id} className="border-b border-white/5 py-1.5">{dateTime(a.created_at)} · <strong className="text-white/80">{a.action}</strong> · {a.entity} · {a.profiles?.full_name ?? 'sistema'}
              {a.details ? <span className="text-white/35"> {JSON.stringify(a.details)}</span> : null}</li>
          ))}</ul>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Configurações ───────────────────────── */
function Settings() {
  const toast = useToast();
  const { data, reload } = useAsync(async () => Object.fromEntries(((await db().from('settings').select('key,value')).data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])));
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const payload = f.pix_base_payload.trim();
    if (!isValidPixPayload(payload)) return toast('error', 'Payload PIX inválido (CRC não confere). Copie o código “Copia e Cola” exatamente como o PagBank fornece.');
    const weights = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, Number(f[`w_${k}`] || 0)]));
    const rows = [
      { key: 'activation_fee', value: Number(f.activation_fee) },
      { key: 'job_daily_rate', value: Number(f.job_daily_rate) },
      { key: 'pix_base_payload', value: payload },
      { key: 'pix_receiver_name', value: f.pix_receiver_name },
      { key: 'talent_retention_months', value: Number(f.talent_retention_months) },
      { key: 'matching_weights', value: weights },
    ];
    if (!(rows[0].value as number > 0) || !(rows[1].value as number > 0)) return toast('error', 'Valores devem ser maiores que zero.');
    const { error } = await db().from('settings').upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) return toast('error', humanError(error));
    await loadSettings(true);
    toast('ok', 'Configurações salvas.'); reload();
  };
  if (!data) return <Spinner />;
  const w = { ...DEFAULT_WEIGHTS, ...(data.matching_weights as object) } as Record<string, number>;
  return (
    <div>
      <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4 p-6">
        <h3 className="font-display text-2xl">Preços</h3>
        <Field label="Taxa de ativação do profissional (R$)"><input name="activation_fee" type="number" step="0.01" min="0.01" defaultValue={Number(data.activation_fee)} className="input" /></Field>
        <Field label="Diária de publicação de vaga (R$)"><input name="job_daily_rate" type="number" step="0.01" min="0.01" defaultValue={Number(data.job_daily_rate)} className="input" /></Field>
        <Field label="Retenção do banco de talentos (meses)" hint="Prazo para revisão/descarte (LGPD)"><input name="talent_retention_months" type="number" min="1" defaultValue={Number(data.talent_retention_months ?? 24)} className="input" /></Field>
      </div>
      <div className="card space-y-4 p-6">
        <h3 className="font-display text-2xl">PIX (PagBank)</h3>
        <Field label="Payload base (Pix Copia e Cola sem valor)" hint="O sistema injeta o valor exato e a referência de cada cobrança e recalcula o CRC.">
          <textarea name="pix_base_payload" rows={5} defaultValue={String(data.pix_base_payload ?? '')} className="input font-mono text-[11px]" />
        </Field>
        <Field label="Nome do recebedor exibido ao pagador"><input name="pix_receiver_name" defaultValue={String(data.pix_receiver_name ?? '')} className="input" /></Field>
      </div>
      <div className="card space-y-4 p-6 lg:col-span-2">
        <h3 className="font-display text-2xl">Pesos do índice de compatibilidade</h3>
        <p className="text-xs text-white/45">Índice = Σ(critério × peso) ÷ Σ(pesos dos critérios com dados). É uma estimativa por regras para apoiar o recrutador.</p>
        <div className="grid gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {Object.keys(DEFAULT_WEIGHTS).map((key) => <Field key={key} label={key}><input name={`w_${key}`} type="number" min="0" max="100" defaultValue={w[key]} className="input" /></Field>)}
        </div>
      </div>
      <div className="lg:col-span-2"><button className="btn-silver">Salvar configurações</button></div>
      </form>
      <MyAccount />
    </div>
  );
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%&*?';

/** Senha forte gerada no navegador com o gerador criptográfico (sempre com letras e números). */
function generatePassword(length = 16): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint32Array(length));
    const pwd = Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\d/.test(pwd) && /[@#$%&*?]/.test(pwd)) return pwd;
  }
}

/* ───────────────────────── Minha conta: trocar ou gerar nova senha ───────────────────────── */
function MyAccount() {
  const toast = useToast();
  const { profile } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const valid = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return toast('error', 'A nova senha precisa ter 8+ caracteres, com letras e números.');
    if (next === current) return toast('error', 'A nova senha deve ser diferente da atual.');
    setBusy(true);
    // Reautentica com a senha atual antes de trocar (protege contra sessão esquecida aberta).
    const check = await db().auth.signInWithPassword({ email: profile!.email, password: current });
    if (check.error) { setBusy(false); return toast('error', 'Senha atual incorreta.'); }
    const { error } = await db().auth.updateUser({ password: next });
    setBusy(false);
    if (error) return toast('error', humanError(error));
    await db().rpc('log_password_change');
    setDone(show ? next : null);
    setCurrent(''); setNext('');
    toast('ok', 'Senha alterada com sucesso.');
  };

  const sendLink = async () => {
    const { error } = await db().auth.resetPasswordForEmail(profile!.email, { redirectTo: `${location.origin}/nova-senha` });
    if (error) return toast('error', humanError(error));
    toast('ok', `Enviamos um link de redefinição para ${profile!.email}.`);
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <form onSubmit={change} className="card space-y-4 p-6">
        <h3 className="font-display text-2xl">Minha conta: trocar senha</h3>
        <p className="text-xs text-white/45">Conta: {profile?.email}</p>
        <Field label="Senha atual"><input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className="input" /></Field>
        <Field label="Nova senha" hint="Mínimo 8 caracteres, com letras e números.">
          <div className="flex gap-2">
            <input type={show ? 'text' : 'password'} autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className="input" />
            <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => { setNext(generatePassword()); setShow(true); }}>Gerar senha forte</button>
          </div>
        </Field>
        <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-[#B9BEC5]" />Mostrar a senha</label>
        <button disabled={busy || !valid || !current} className="btn-silver">{busy ? 'Salvando…' : 'Alterar senha'}</button>
        {done && (
          <div className="rounded-xl border border-silver/30 bg-silver/5 p-3 text-xs">
            Nova senha (guarde agora, ela não será mostrada de novo):
            <div className="mt-1 flex items-center gap-2"><code className="select-all break-all font-mono text-sm text-silver-light">{done}</code>
              <button type="button" className="btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(done).then(() => toast('ok', 'Senha copiada.'))}>Copiar</button></div>
          </div>
        )}
      </form>
      <div className="card space-y-4 p-6">
        <h3 className="font-display text-2xl">Esqueci minha senha atual</h3>
        <p className="text-sm text-white/55">Se você não lembra da senha, enviamos um link seguro de redefinição para o e-mail da sua conta. Ao abrir o link você cria uma nova senha.</p>
        <button type="button" className="btn-ghost" onClick={sendLink}>Enviar link de redefinição por e-mail</button>
        <p className="text-[11px] text-white/35">O envio depende do serviço de e-mail do Supabase (veja a seção de SMTP no README).</p>
      </div>
    </div>
  );
}
