import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LogoMark } from './Logo';
import { dashboardPath, useAuth } from '../auth/AuthProvider';

const NAV = [
  { to: '/sobre', label: 'Sobre' },
  { to: '/profissionais', label: 'Para Profissionais' },
  { to: '/empresas', label: 'Para Empresas' },
  { to: '/vagas', label: 'Vagas' },
  { to: '/cursos', label: 'Cursos' },
  { to: '/contato', label: 'Contato' },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const loc = useLocation();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
      scrolled || open ? 'border-b border-white/[0.06] bg-ink/85 py-3 backdrop-blur-xl' : 'bg-transparent py-5'}`}>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 btn-silver btn-sm">Pular para o conteúdo</a>
      <div className="container-x flex items-center justify-between gap-6">
        <LogoMark />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) =>
              `relative whitespace-nowrap rounded-full px-2.5 py-2 text-[13px] xl:px-3.5 font-medium transition ${isActive ? 'text-silver-light' : 'text-white/70 hover:text-white'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {profile ? (
            <>
              <Link to={dashboardPath(profile.role)} className="btn-silver btn-sm">Meu painel</Link>
              <button onClick={signOut} className="btn-ghost btn-sm">Sair</button>
            </>
          ) : (
            <>
              <Link to="/entrar" className="btn-ghost btn-sm">Login</Link>
              <Link to="/cadastro" className="btn-silver btn-sm">Cadastre-se</Link>
            </>
          )}
        </div>
        <button className="grid h-11 w-11 place-items-center rounded-full border border-white/15 lg:hidden"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="relative block h-3 w-5">
            <span className={`absolute left-0 h-px w-5 bg-white transition ${open ? 'top-1.5 rotate-45' : 'top-0'}`} />
            <span className={`absolute left-0 top-1.5 h-px w-5 bg-white transition ${open ? 'opacity-0' : ''}`} />
            <span className={`absolute left-0 h-px w-5 bg-white transition ${open ? 'top-1.5 -rotate-45' : 'top-3'}`} />
          </span>
        </button>
      </div>
      {open && (
        <nav className="container-x mt-3 flex flex-col gap-1 pb-4 lg:hidden" aria-label="Menu móvel">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className="rounded-xl px-3 py-3 text-base text-white/80 hover:bg-white/5">{n.label}</NavLink>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {profile ? (
              <>
                <Link to={dashboardPath(profile.role)} className="btn-silver">Meu painel</Link>
                <button onClick={signOut} className="btn-ghost">Sair</button>
              </>
            ) : (
              <>
                <Link to="/entrar" className="btn-ghost">Login</Link>
                <Link to="/cadastro" className="btn-silver">Cadastre-se</Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
