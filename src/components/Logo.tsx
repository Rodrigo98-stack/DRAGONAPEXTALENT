import { Link } from 'react-router-dom';

/** Logo oficial. O fundo preto da arte some com mix-blend "screen" sobre fundos escuros. */
export function LogoImage({ className = '', alt = 'DRAGON APEX TALENT' }: { className?: string; alt?: string }) {
  return <img src="/media/logo.jpg" alt={alt} className={`select-none mix-blend-screen ${className}`} draggable={false} />;
}

/** Versão reduzida para o cabeçalho: recorte do dragão + nome em texto. */
export function LogoMark({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-3" aria-label="DRAGON APEX TALENT — início">
      <span className="relative block h-10 w-10 overflow-hidden rounded-full ring-1 ring-silver/30 transition group-hover:ring-silver/70">
        <img src="/media/logo.jpg" alt="" className="absolute left-1/2 top-[-6%] h-[175%] w-auto max-w-none -translate-x-1/2 mix-blend-screen" />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[19px] font-semibold tracking-[0.18em] text-white">DRAGON APEX</span>
          <span className="mt-1 block text-[9px] font-medium tracking-[0.55em] text-silver">TALENT</span>
        </span>
      )}
    </Link>
  );
}
