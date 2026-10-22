import { Link } from 'react-router-dom';
import type { Job } from '../lib/types';
import { CONTRACTS, PAY_TYPES, WORK_MODES } from '../lib/constants';
import { money } from '../lib/format';
import { onSpotMove } from './Reveal';

export function salaryText(j: Pick<Job, 'pay_type' | 'salary_min' | 'salary_max'>) {
  if (j.pay_type === 'faixa' && j.salary_min && j.salary_max) return `${money(j.salary_min)} – ${money(j.salary_max)}`;
  if ((j.pay_type === 'fixo' || j.pay_type === 'hora') && (j.salary_min || j.salary_max))
    return `${money(j.salary_min ?? j.salary_max)}${j.pay_type === 'hora' ? '/h' : ''}`;
  return PAY_TYPES[j.pay_type] ?? 'A combinar';
}

export function JobCard({ job }: { job: Job }) {
  return (
    <Link to={`/vagas/${job.id}`} onMouseMove={onSpotMove}
      className="card spot group flex flex-col gap-4 p-6 transition duration-500 hover:-translate-y-1 hover:border-silver/40">
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{job.area}</span>
        <span className="badge tone-silver">{WORK_MODES[job.work_mode]}</span>
      </div>
      <h3 className="font-display text-2xl leading-tight text-white group-hover:text-silver-light">{job.title}</h3>
      <p className="text-sm text-white/50">{job.company_name ?? 'Empresa confidencial'} · {[job.city, job.state].filter(Boolean).join(' / ') || 'Remoto'}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-4 text-xs text-white/60">
        <span>{CONTRACTS[job.contract_type]}</span>
        <span className="text-silver-light">{salaryText(job)}</span>
      </div>
    </Link>
  );
}
