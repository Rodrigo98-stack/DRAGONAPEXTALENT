import { useState } from 'react';
import { Field, Progress } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { db } from '../../lib/supabase';
import { humanError, splitList } from '../../lib/format';
import { AREAS, LEVELS, UFS, WORK_MODES } from '../../lib/constants';
import type { Education, Experience, ProfessionalProfile } from '../../lib/types';
import { ResumeManager } from './ResumeManager';

const STEPS = ['Conta', 'Interesse e contato', 'Formação e competências', 'Experiências', 'Apresentação', 'Currículo e privacidade'];

/** Percentual de preenchimento do perfil (campos relevantes para as empresas). */
export function completion(p: ProfessionalProfile, hasResume: boolean): number {
  const checks = [
    p.whatsapp, p.city, p.state, p.area, p.desired_role, p.experience_level, p.work_mode, p.availability,
    p.education?.length, p.hard_skills?.length, p.soft_skills?.length, p.languages?.length, p.experiences?.length,
    p.about_profile, p.qualities, p.why_hire, p.salary_expectation || p.salary_negotiable, hasResume,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function ProfileWizard({ pro, onSaved, hasResume, onResumeChange }: {
  pro: ProfessionalProfile; onSaved: (p: ProfessionalProfile) => void; hasResume: boolean; onResumeChange: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(Math.min(Math.max(pro.wizard_step, 2), 6));
  const [draft, setDraft] = useState<ProfessionalProfile>(pro);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ProfessionalProfile>(k: K, v: ProfessionalProfile[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (next: number) => {
    setSaving(true);
    const { user_id, activation_status, activated_at, updated_at, ...fields } = draft;
    void activation_status; void activated_at; void updated_at;
    const { data, error } = await db().from('professional_profiles')
      .update({ ...fields, wizard_step: Math.max(pro.wizard_step, next) }).eq('user_id', user_id).select().single();
    setSaving(false);
    if (error) return toast('error', humanError(error));
    onSaved(data as ProfessionalProfile);
    toast('ok', 'Progresso salvo.');
    setStep(Math.min(next, 6));
  };

  return (
    <div className="card p-6 sm:p-8">
      <ol className="no-scrollbar mb-8 flex gap-2 overflow-x-auto">
        {STEPS.map((s, i) => {
          const n = i + 1;
          return (
            <li key={s}>
              <button disabled={n === 1} onClick={() => setStep(n)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${
                  n === step ? 'border-silver bg-silver/15 text-silver-light' : n < Math.max(pro.wizard_step, 2) ? 'border-silver/30 text-white/70' : 'border-white/10 text-white/40'}`}>
                <span className="font-semibold">{n < Math.max(pro.wizard_step, 2) ? '✓' : n}</span>{s}
              </button>
            </li>
          );
        })}
      </ol>
      <Progress value={Math.round(((step - 1) / 5) * 100)} />

      <div className="mt-8">
        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp *"><input className="input" value={draft.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
            <Field label="LinkedIn ou portfólio"><input type="url" className="input" placeholder="https://" value={draft.linkedin_url ?? ''} onChange={(e) => set('linkedin_url', e.target.value)} /></Field>
            <Field label="Cidade *"><input className="input" value={draft.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="Estado *"><select className="input" value={draft.state ?? ''} onChange={(e) => set('state', e.target.value)}><option value="">UF</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Field>
            <Field label="Área profissional de interesse *"><select className="input" value={draft.area ?? ''} onChange={(e) => set('area', e.target.value)}><option value="">Selecione</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label="Cargo desejado *"><input className="input" value={draft.desired_role ?? ''} onChange={(e) => set('desired_role', e.target.value)} /></Field>
            <Field label="Nível de experiência *"><select className="input" value={draft.experience_level ?? ''} onChange={(e) => set('experience_level', e.target.value)}><option value="">Selecione</option>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Modalidade desejada *"><select className="input" value={draft.work_mode ?? ''} onChange={(e) => set('work_mode', (e.target.value || null) as ProfessionalProfile['work_mode'])}><option value="">Selecione</option>{Object.entries(WORK_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Disponibilidade para início"><input className="input" placeholder="Imediata, 15 dias, 30 dias…" value={draft.availability ?? ''} onChange={(e) => set('availability', e.target.value)} /></Field>
            <Field label="Pretensão salarial (R$)">
              <div className="flex items-center gap-3">
                <input type="number" min={0} step={50} className="input" disabled={draft.salary_negotiable} value={draft.salary_expectation ?? ''} onChange={(e) => set('salary_expectation', e.target.value ? Number(e.target.value) : null)} />
                <label className="flex shrink-0 items-center gap-2 text-xs text-white/60"><input type="checkbox" className="accent-[#B9BEC5]" checked={draft.salary_negotiable} onChange={(e) => set('salary_negotiable', e.target.checked)} />A combinar</label>
              </div>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <ListEditor<Education> title="Formação acadêmica" items={draft.education} onChange={(v) => set('education', v)}
              empty={{ curso: '', instituicao: '', conclusao: '' }}
              fields={[['curso', 'Curso'], ['instituicao', 'Instituição'], ['conclusao', 'Conclusão (ano ou "cursando")']]} />
            <Field label="Cursos e certificações"><textarea rows={3} className="input" value={draft.certifications ?? ''} onChange={(e) => set('certifications', e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <TagField label="Competências técnicas" value={draft.hard_skills} onChange={(v) => set('hard_skills', v)} />
              <TagField label="Habilidades comportamentais" value={draft.soft_skills} onChange={(v) => set('soft_skills', v)} />
              <TagField label="Idiomas (com nível)" value={draft.languages} onChange={(v) => set('languages', v)} />
            </div>
          </div>
        )}

        {step === 4 && (
          <ListEditor<Experience> title="Experiências profissionais" items={draft.experiences} onChange={(v) => set('experiences', v)}
            empty={{ cargo: '', empresa: '', inicio: '', fim: '', descricao: '' }}
            fields={[['cargo', 'Cargo'], ['empresa', 'Empresa'], ['inicio', 'Início (mês/ano)'], ['fim', 'Fim (ou "atual")'], ['descricao', 'Principais atividades e resultados', true]]} />
        )}

        {step === 5 && (
          <div className="space-y-5">
            {([
              ['about_profile', '1. Me mostre seu perfil profissional', 'Trajetória, experiências, formação, objetivos e o tipo de oportunidade que você busca.'],
              ['qualities', '2. Quais são suas principais qualidades?', 'Habilidades técnicas, competências comportamentais, diferenciais e pontos fortes.'],
              ['why_hire', '3. Por que uma empresa deveria contratar você?', 'O valor que você entrega, seus diferenciais e como contribui para resultados.'],
            ] as const).map(([k, q, h]) => (
              <div key={k} className="rounded-2xl border border-silver/25 bg-silver/[0.04] p-5">
                <label htmlFor={k} className="font-display text-2xl text-silver-light">{q}</label>
                <p className="mb-3 mt-1 text-xs text-white/50">{h}</p>
                <textarea id={k} rows={5} maxLength={3000} className="input" value={draft[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
                <div className="mt-1 text-right text-[11px] text-white/30">{(draft[k] ?? '').length}/3000</div>
              </div>
            ))}
            <Field label="Informações adicionais"><textarea rows={3} className="input" value={draft.additional_info ?? ''} onChange={(e) => set('additional_info', e.target.value)} /></Field>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-6">
            <ResumeManager userId={pro.user_id} onChange={onResumeChange} />
            <div className="space-y-3 rounded-2xl border border-white/10 p-5 text-sm">
              <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 accent-[#B9BEC5]" checked={draft.visible_to_companies} onChange={(e) => set('visible_to_companies', e.target.checked)} />
                <span>Autorizo que meu perfil integre o banco de talentos e seja apresentado a empresas pela equipe DRAGON APEX TALENT.</span></label>
              <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 accent-[#B9BEC5]" checked={draft.allow_contact} onChange={(e) => set('allow_contact', e.target.checked)} />
                <span>Aceito ser contatado por WhatsApp e e-mail sobre oportunidades compatíveis.</span></label>
            </div>
            {!hasResume && <p className="text-xs text-amber-200/80">Dica: perfis com currículo anexado têm mais chances de pré-seleção.</p>}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/5 pt-6">
        <button className="btn-ghost" disabled={step <= 2} onClick={() => setStep(step - 1)}>← Voltar</button>
        <div className="flex gap-3">
          <button className="btn-ghost" disabled={saving} onClick={() => save(step)}>Salvar rascunho</button>
          <button className="btn-silver" disabled={saving} onClick={() => save(step + 1)}>{step === 6 ? 'Concluir perfil' : 'Salvar e continuar →'}</button>
        </div>
      </div>
    </div>
  );
}

function TagField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <Field label={label} hint="Separe por vírgula">
      <textarea rows={3} className="input" value={text} onChange={(e) => { setText(e.target.value); onChange(splitList(e.target.value)); }} />
    </Field>
  );
}

function ListEditor<T extends object>({ title, items, onChange, empty, fields }: {
  title: string; items: T[]; onChange: (v: T[]) => void; empty: T; fields: ([keyof T & string, string] | [keyof T & string, string, boolean])[];
}) {
  const update = (i: number, k: keyof T, v: string) => onChange(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><span className="label !mb-0">{title}</span>
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...items, { ...empty }])}>+ Adicionar</button></div>
      {!items.length && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/40">Nenhum item. Clique em “Adicionar”.</p>}
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="grid gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-2">
            {fields.map(([k, l, long]) => (
              <Field key={k} label={l} className={long ? 'sm:col-span-2' : ''}>
                {long ? <textarea rows={3} className="input" value={String((it as Record<string, unknown>)[k] ?? '')} onChange={(e) => update(i, k, e.target.value)} />
                  : <input className="input" value={String((it as Record<string, unknown>)[k] ?? '')} onChange={(e) => update(i, k, e.target.value)} />}
              </Field>
            ))}
            <button type="button" className="text-left text-xs text-red-300/80 hover:text-red-300" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remover</button>
          </div>
        ))}
      </div>
    </div>
  );
}
