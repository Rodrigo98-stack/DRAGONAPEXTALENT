import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';

/** Revela o conteúdo ao entrar na tela (uma vez). */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children }: {
  as?: ElementType; delay?: number; className?: string; style?: CSSProperties; children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect(); }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms`, ...style }}>{children}</Tag>;
}

/** Acompanha o cursor para o brilho prateado dos cartões `.spot`. */
export function onSpotMove(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}
