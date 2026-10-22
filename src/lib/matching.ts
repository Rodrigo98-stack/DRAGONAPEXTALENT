// Índice de compatibilidade vaga × profissional.
// É uma ESTIMATIVA baseada em regras, para apoiar o recrutador — não é avaliação científica
// nem decisão automática. Não usa idade, gênero, raça, religião, estado civil ou foto.
//
// Fórmula: soma ponderada de critérios (0..1) × peso, dividida pela soma dos pesos aplicáveis.
// Pesos padrão (configuráveis em settings.matching_weights):
//   área 20 · cargo 15 · requisitos obrigatórios 30 · desejáveis 10 · modalidade 10 · localização 10 · salário 5
// Critérios sem informação dos dois lados são ignorados (não penalizam).

import type { Job, ProfessionalProfile } from './types';

export type MatchWeights = Record<'area' | 'cargo' | 'obrigatorios' | 'desejaveis' | 'modalidade' | 'localizacao' | 'salario', number>;

export const DEFAULT_WEIGHTS: MatchWeights = {
  area: 20, cargo: 15, obrigatorios: 30, desejaveis: 10, modalidade: 10, localizacao: 10, salario: 5,
};

export type MatchResult = {
  score: number;                       // 0..100
  parts: { key: keyof MatchWeights; label: string; value: number }[];
  missingRequired: string[];           // destacar visualmente
};

const LABELS: Record<keyof MatchWeights, string> = {
  area: 'Área', cargo: 'Cargo', obrigatorios: 'Requisitos obrigatórios', desejaveis: 'Requisitos desejáveis',
  modalidade: 'Modalidade', localizacao: 'Localização', salario: 'Faixa salarial',
};

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+#. ]/g, ' ').replace(/\s+/g, ' ').trim();

function profileCorpus(p: ProfessionalProfile): string {
  const exp = (p.experiences ?? []).map((e) => `${e.cargo} ${e.empresa} ${e.descricao ?? ''}`).join(' ');
  const edu = (p.education ?? []).map((e) => `${e.curso} ${e.instituicao}`).join(' ');
  return normalize([
    p.area, p.desired_role, p.certifications, p.hard_skills?.join(' '), p.soft_skills?.join(' '),
    p.languages?.join(' '), exp, edu, p.about_profile, p.qualities,
  ].filter(Boolean).join(' '));
}

/** Um requisito é atendido se todas as palavras significativas (≥3 letras) aparecem no perfil. */
export function meets(requirement: string, corpus: string): boolean {
  const words = normalize(requirement).split(' ').filter((w) => w.length >= 3);
  if (!words.length) return true;
  return words.every((w) => corpus.includes(w));
}

export function computeMatch(job: Job, p: ProfessionalProfile, w: MatchWeights = DEFAULT_WEIGHTS): MatchResult {
  const corpus = profileCorpus(p);
  const parts: MatchResult['parts'] = [];
  const add = (key: keyof MatchWeights, value: number | null) => {
    if (value !== null) parts.push({ key, label: LABELS[key], value: Math.max(0, Math.min(1, value)) });
  };

  add('area', p.area && job.area ? (normalize(p.area) === normalize(job.area) ? 1 : 0) : null);
  add('cargo', p.desired_role && job.title ? (meets(job.title, normalize(p.desired_role) + ' ' + corpus) ? 1 : 0) : null);

  const missingRequired = (job.requirements_required ?? []).filter((r) => !meets(r, corpus));
  add('obrigatorios', job.requirements_required?.length
    ? 1 - missingRequired.length / job.requirements_required.length : null);
  add('desejaveis', job.requirements_desired?.length
    ? job.requirements_desired.filter((r) => meets(r, corpus)).length / job.requirements_desired.length : null);

  add('modalidade', p.work_mode && job.work_mode
    ? p.work_mode === job.work_mode ? 1 : p.work_mode === 'hibrido' || job.work_mode === 'hibrido' ? 0.5 : 0 : null);

  add('localizacao', job.work_mode === 'remoto' ? 1
    : p.state && job.state ? (p.state === job.state ? (p.city && job.city && normalize(p.city) === normalize(job.city) ? 1 : 0.6) : 0) : null);

  add('salario', p.salary_expectation && job.salary_max && !p.salary_negotiable
    ? p.salary_expectation <= job.salary_max ? 1 : Math.max(0, 1 - (p.salary_expectation - job.salary_max) / job.salary_max) : null);

  const total = parts.reduce((s, x) => s + w[x.key], 0);
  const score = total ? Math.round((parts.reduce((s, x) => s + x.value * w[x.key], 0) / total) * 100) : 0;
  return { score, parts, missingRequired };
}
