import { useState } from 'react';
import { Field } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { db } from '../../lib/supabase';
import { humanError, splitList } from '../../lib/format';
import { AREAS, CONTRACTS, PAY_TYPES, UFS, WORK_MODES } from '../../lib/constants';
import type { Job } from '../../lib/types';

/** Questionário completo de abertura de vaga (13 pontos). Usado pela empresa e pela administração. */
export function JobForm({ companyId, createdBy, job, onSaved, admin }: {
  companyId: string | null; createdBy: string; job?: Job | null; onSaved: (j: Job) => void; admin?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [startType, setStartType] = useState(job?.start_type ?? 'a_combinar');
  const [payType, setPayType] = useState(job?.pay_type ?? 'a_combinar');
  const [areaOther, setAreaOther] = useState(job ? !AREAS.includes(job.area) : false);
  const [receiveVia, setReceiveVia] = useState(job?.receive_via ?? 'painel');

  const submit = async (form: HTMLFormElement, status: 'draft' | 'in_review') => {
    if (status === 'in_review' && !form.reportValidity()) return;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const num = (v: string) => (v ? Number(v) : null);
    const row = {
      company_id: companyId, created_by: createdBy,
      area: areaOther ? f.area_other : f.area,
      title: f.title, requirements_required: splitList(f.req), requirements_desired: splitList(f.des),
      openings: Number(f.openings || 1), start_type: startType, start_date: startType === 'data' ? f.start_date || null : null,
      pay_type: payType, salary_min: num(f.salary_min), salary_max: num(f.salary_max), pay_notes: f.pay_notes || null, benefits: f.benefits || null,
      work_mode: f.work_mode, city: f.city || null, state: f.state || null, address: f.address || null, contract_type: f.contract_type,
      schedule: f.schedule || null, hire_deadline: f.no_deadline ? null : f.hire_deadline || null, notes: f.notes || null,
      receive_via: receiveVia, receive_email: receiveVia === 'email' ? f.receive_email : null,
      status: admin && status === 'in_review' ? 'approved' : status,
    };
    if (!row.title || !row.area) return toast('error', 'Informe ao menos área e cargo.');
    if (row.salary_min && row.salary_max && row.salary_min > row.salary_max) return toast('error', 'Faixa salarial inválida.');
    setBusy(true);
    const q = job ? db().from('jobs').update(row).eq('id', job.id) : db().from('jobs').insert(row);
    const { data, error } = await q.select().single();
    setBusy(false);
    if (error) return toast('error', humanError(error));
    toast('ok', status === 'draft' ? 'Rascunho salvo.' : admin ? 'Vaga aprovada — pronta para publicar.' : 'Vaga enviada para revisão da equipe.');
    onSaved(data as Job);
  };

  const n = (i: number) => <span className="mr-2 font-display text-lg text-silver/70">{i}.</span>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget, 'in_review'); }} className="card space-y-8 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="" className="sm:col-span-1">
          <span className="label">{n(1)}Área de atuação da contratação *</span>
          <select name="area" className="input" required={!areaOther} defaultValue={job && !areaOther ? job.area : ''} onChange={(e) => setAreaOther(e.target.value === 'Outras')}>
            <option value="" disabled>Selecione</option>{AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
          {areaOther && <input name="area_other" required placeholder="Qual área?" defaultValue={job?.area} className="input mt-2" />}
        </Field>
        <Field label=""><span className="label">{n(2)}Cargo ou função *</span><input name="title" required maxLength={140} defaultValue={job?.title} className="input" /></Field>
      </div>

      <div>
        <span className="label">{n(3)}Principais requisitos (formação, experiência, competências, certificações)</span>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Obrigatórios *" hint="Um por linha"><textarea name="req" required rows={5} defaultValue={job?.requirements_required.join('\n')} className="input" /></Field>
          <Field label="Desejáveis" hint="Um por linha"><textarea name="des" rows={5} defaultValue={job?.requirements_desired.join('\n')} className="input" /></Field>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label=""><span className="label">{n(4)}Quantidade de vagas *</span><input name="openings" type="number" min={1} step={1} required defaultValue={job?.openings ?? 1} className="input" /></Field>
        <Field label="" className="sm:col-span-2">
          <span className="label">{n(5)}Início</span>
          <div className="flex flex-wrap gap-2">
            {(['imediato', 'data', 'a_combinar'] as const).map((t) => (
              <button type="button" key={t} onClick={() => setStartType(t)} className={`tab border border-white/10 ${startType === t ? 'tab-active' : ''}`}>{t === 'imediato' ? 'Imediato' : t === 'data' ? 'Data prevista' : 'A combinar'}</button>
            ))}
            {startType === 'data' && <input type="date" name="start_date" required defaultValue={job?.start_date ?? ''} className="input w-auto" />}
          </div>
        </Field>
      </div>

      <div>
        <span className="label">{n(6)}Remuneração e benefícios</span>
        <div className="grid gap-4 sm:grid-cols-4">
          <select className="input" value={payType} onChange={(e) => setPayType(e.target.value)} aria-label="Modalidade de remuneração">
            {Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {payType !== 'a_combinar' && <>
            <input name="salary_min" type="number" min={0} step="0.01" placeholder={payType === 'faixa' ? 'De (R$)' : 'Valor (R$)'} defaultValue={job?.salary_min ?? ''} className="input" />
            {payType === 'faixa' && <input name="salary_max" type="number" min={0} step="0.01" placeholder="Até (R$)" defaultValue={job?.salary_max ?? ''} className="input" />}
            <input name="pay_notes" placeholder="Observações (comissão, etc.)" defaultValue={job?.pay_notes ?? ''} className="input" />
          </>}
        </div>
        <textarea name="benefits" rows={2} placeholder="Benefícios (VT, VR, plano de saúde…)" defaultValue={job?.benefits ?? ''} className="input mt-3" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label=""><span className="label">{n(7)}Modalidade de trabalho *</span>
          <select name="work_mode" required defaultValue={job?.work_mode ?? ''} className="input"><option value="" disabled>Selecione</option>{Object.entries(WORK_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label=""><span className="label">{n(9)}Tipo de contratação *</span>
          <select name="contract_type" required defaultValue={job?.contract_type ?? ''} className="input"><option value="" disabled>Selecione</option>{Object.entries(CONTRACTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>

      <div>
        <span className="label">{n(8)}Local de trabalho</span>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px_1.5fr]">
          <input name="city" placeholder="Cidade" defaultValue={job?.city ?? ''} className="input" />
          <select name="state" defaultValue={job?.state ?? ''} className="input" aria-label="Estado"><option value="">UF</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
          <input name="address" placeholder="Endereço ou região (opcional)" defaultValue={job?.address ?? ''} className="input" />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label=""><span className="label">{n(10)}Jornada de trabalho</span><input name="schedule" placeholder="Seg–Sex, 8h–17h, 44h semanais" defaultValue={job?.schedule ?? ''} className="input" /></Field>
        <Field label=""><span className="label">{n(11)}Prazo desejado para contratação</span>
          <div className="flex items-center gap-3"><input name="hire_deadline" type="date" defaultValue={job?.hire_deadline ?? ''} className="input" />
            <label className="flex shrink-0 items-center gap-2 text-xs text-white/60"><input type="checkbox" name="no_deadline" defaultChecked={!!job && !job.hire_deadline} className="accent-[#B9BEC5]" />Sem prazo</label></div></Field>
      </div>

      <Field label=""><span className="label">{n(12)}Informações adicionais / observações</span><textarea name="notes" rows={3} defaultValue={job?.notes ?? ''} className="input" /></Field>

      <div>
        <span className="label">{n(13)}Como deseja receber os candidatos</span>
        <div className="flex flex-wrap gap-2">
          {[['painel', 'Painel da plataforma'], ['email', 'E-mail autorizado'], ['outro', 'Outro canal (definido pela administração)']].map(([k, v]) => (
            <button type="button" key={k} onClick={() => setReceiveVia(k)} className={`tab border border-white/10 ${receiveVia === k ? 'tab-active' : ''}`}>{v}</button>
          ))}
        </div>
        {receiveVia === 'email' && <input name="receive_email" type="email" required placeholder="E-mail autorizado" defaultValue={job?.receive_email ?? ''} className="input mt-3 max-w-md" />}
        <p className="hint">Currículos nunca são enviados automaticamente a canais externos sem autorização explícita e proteção dos dados dos candidatos.</p>
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-white/5 pt-6">
        <button type="button" disabled={busy} className="btn-ghost" onClick={(e) => submit(e.currentTarget.form!, 'draft')}>Salvar rascunho</button>
        <button disabled={busy} className="btn-silver">{admin ? 'Salvar e aprovar' : 'Enviar para revisão'}</button>
      </div>
    </form>
  );
}
