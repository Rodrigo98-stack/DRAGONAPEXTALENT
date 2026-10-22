import { describe, expect, it } from 'vitest';
import { computeMatch, meets, normalize } from './matching';
import type { Job, ProfessionalProfile } from './types';

const job = {
  area: 'Tecnologia', title: 'Desenvolvedor Front-end', requirements_required: ['React', 'TypeScript'],
  requirements_desired: ['Tailwind'], work_mode: 'remoto', city: 'Recife', state: 'PE', salary_max: 8000,
} as Job;

const pro = {
  area: 'Tecnologia', desired_role: 'Desenvolvedor Front-end', hard_skills: ['React', 'TypeScript', 'Tailwind'],
  soft_skills: [], languages: [], experiences: [], education: [], work_mode: 'remoto', state: 'PE', city: 'Recife',
  salary_expectation: 7000, salary_negotiable: false,
} as unknown as ProfessionalProfile;

describe('matching', () => {
  it('normaliza acentos', () => expect(normalize('Gestão Ágil')).toBe('gestao agil'));
  it('verifica requisito por palavras', () => expect(meets('Inglês avançado', normalize('ingles avancado e espanhol'))).toBe(true));

  it('perfil aderente pontua 100', () => {
    const r = computeMatch(job, pro);
    expect(r.score).toBe(100);
    expect(r.missingRequired).toEqual([]);
  });

  it('destaca requisitos obrigatórios não atendidos', () => {
    const r = computeMatch(job, { ...pro, hard_skills: ['React'] });
    expect(r.missingRequired).toEqual(['TypeScript']);
    expect(r.score).toBeLessThan(100);
  });

  it('ignora critérios sem dados (não penaliza)', () => {
    const r = computeMatch({ ...job, salary_max: null } as Job, pro);
    expect(r.parts.find((p) => p.key === 'salario')).toBeUndefined();
  });
});
