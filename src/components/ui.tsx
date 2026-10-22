import { useEffect, type ReactNode } from 'react';

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-3 text-sm text-white/60">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-silver/25 border-t-silver" />
      {label}…
    </span>
  );
}

export function Field({ label, hint, error, children, className = '' }: {
  label: string; hint?: string; error?: string | null; children: ReactNode; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

export function EmptyState({ icon = '◇', title, children, action }: {
  icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full border border-silver/30 bg-silver/5 text-xl text-silver">{icon}</div>
      <h3 className="font-display text-2xl text-white">{title}</h3>
      {children && <div className="max-w-md text-sm leading-relaxed text-white/55">{children}</div>}
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={`card-silver max-h-[90vh] w-full overflow-y-auto p-6 sm:p-8 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl">{title}</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (t: T) => void;
}) {
  return (
    <div role="tablist" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`tab ${value === t.id ? 'tab-active' : ''}`}>
          {t.label}
          {t.badge ? <span className="ml-1.5 rounded-full bg-silver px-1.5 text-[10px] font-bold text-ink">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card spot p-5">
      <div className="text-xs uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-2 font-display text-3xl text-silver-light">{value}</div>
      {hint && <div className="mt-1 text-xs text-white/40">{hint}</div>}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-silver-deep via-silver to-silver-light transition-all duration-700" style={{ width: `${value}%` }} />
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-white/5 pb-14 pt-36">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-silver/10 blur-[120px]" />
      <div className="container-x relative">
        <p className="eyebrow animate-rise">{eyebrow}</p>
        <h1 className="mt-4 max-w-4xl font-display text-4xl leading-[1.05] sm:text-6xl animate-rise [animation-delay:.1s]">{title}</h1>
        {children && <div className="mt-6 max-w-2xl text-base leading-relaxed text-white/65 animate-rise [animation-delay:.2s]">{children}</div>}
      </div>
    </section>
  );
}
