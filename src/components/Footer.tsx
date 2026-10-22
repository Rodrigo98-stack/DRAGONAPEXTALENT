import { Link } from 'react-router-dom';
import { LogoImage } from './Logo';
import { CONTACT } from '../lib/constants';

export function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-white/[0.06] bg-ink-800">
      <div className="hairline absolute inset-x-0 top-0" />
      <div className="container-x grid gap-12 py-16 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <LogoImage className="w-44" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
            Recrutamento estratégico, banco de talentos e capacitação profissional. Conectando excelência a oportunidade.
          </p>
        </div>
        <FooterCol title="Plataforma" links={[
          ['/vagas', 'Vagas disponíveis'], ['/cursos', 'Capacitação'], ['/profissionais', 'Para profissionais'], ['/empresas', 'Para empresas'],
        ]} />
        <FooterCol title="Institucional" links={[
          ['/sobre', 'Sobre nós'], ['/faq', 'Perguntas frequentes'], ['/contato', 'Contato'],
        ]} />
        <FooterCol title="Legal" links={[
          ['/privacidade', 'Política de Privacidade'], ['/termos', 'Termos de Uso'],
        ]} />
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-xs text-white/40 sm:flex-row">
          <span>© {new Date().getFullYear()} DRAGON APEX TALENT · {CONTACT.city}</span>
          <span>Pagamentos exclusivamente via PIX · Dados tratados conforme a LGPD</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="eyebrow mb-4">{title}</h3>
      <ul className="space-y-2.5">
        {links.map(([to, label]) => (
          <li key={to}><Link to={to} className="text-sm text-white/60 transition hover:text-silver-light">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
