import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { Reveal, onSpotMove } from '../../components/Reveal';
import { useSettings } from '../../lib/useSettings';
import { money } from '../../lib/format';

/* ───────────────────────── Sobre ───────────────────────── */
export function About() {
  return (
    <>
      <PageHeader eyebrow="Sobre a DRAGON APEX TALENT" title={<>Força, precisão e estratégia a serviço do <span className="silver-text">talento</span>.</>}>
        Somos uma empresa de caça-talentos, recrutamento e seleção que conecta profissionais qualificados a empresas que
        buscam contratar com qualidade — em diversas áreas do mercado.
      </PageHeader>
      <section className="container-x grid gap-12 py-24 lg:grid-cols-2">
        <Reveal className="duotone overflow-hidden rounded-[28px] border border-white/10">
          <img src="/media/selecao.png" alt="Seleção de um profissional em destaque" className="aspect-[4/3] w-full object-cover" />
        </Reveal>
        <Reveal delay={120} className="space-y-6 text-white/65 leading-relaxed">
          <h2 className="font-display text-4xl text-white">Uma consultoria, não um portal de classificados.</h2>
          <p>
            O dragão da nossa marca representa o que entregamos: visão ampla para enxergar o mercado, precisão para identificar o
            profissional certo e força para conduzir o processo até a contratação.
          </p>
          <p>
            Unimos curadoria humana e tecnologia: um banco de talentos organizado, um índice de compatibilidade transparente que
            apoia — e nunca substitui — o recrutador, e uma área de capacitação para que profissionais evoluam continuamente.
          </p>
        </Reveal>
      </section>
      <section className="container-x grid gap-5 pb-8 md:grid-cols-3">
        {[
          ['Excelência profissional', 'Processos estruturados, vagas revisadas e candidatos avaliados com critério.'],
          ['Inteligência na identificação', 'Requisitos obrigatórios e desejáveis cruzados com cada perfil, sem critérios discriminatórios.'],
          ['Conexão estratégica', 'Relações de longo prazo entre profissionais e empresas, apoiadas por um banco de talentos vivo.'],
        ].map(([t, d], i) => (
          <Reveal key={t} delay={i * 100}>
            <div onMouseMove={onSpotMove} className="card spot h-full p-7">
              <div className="font-display text-3xl text-silver/50">0{i + 1}</div>
              <h3 className="mt-3 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-white/55">{d}</p>
            </div>
          </Reveal>
        ))}
      </section>
    </>
  );
}

/* ───────────────────────── Para profissionais ───────────────────────── */
export function ForProfessionals() {
  const s = useSettings();
  const steps = [
    ['Crie sua conta', 'Gratuito. Nome, e-mail, WhatsApp e consentimento LGPD.'],
    ['Monte seu perfil em etapas', 'Formação, experiências, competências, as três perguntas-chave e o currículo em PDF/DOC/DOCX.'],
    [`Ative por ${money(s.activation_fee)}`, 'Taxa única via PIX. Após a confirmação, seu perfil fica visível e apto a candidaturas.'],
    ['Candidate-se e acompanhe', 'Veja vagas compatíveis, convites e o status de cada processo no seu painel.'],
  ];
  return (
    <>
      <PageHeader eyebrow="Para profissionais" title={<>Seu próximo passo de carreira começa com um <span className="silver-text">perfil completo</span>.</>}>
        Construa um perfil que as empresas querem ler, entre para o nosso banco de talentos e acompanhe cada processo seletivo em tempo real.
      </PageHeader>
      <section className="container-x py-20">
        <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 100} className="card p-6">
              <div className="font-display text-4xl text-silver/60">{i + 1}</div>
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-white/55">{d}</p>
            </Reveal>
          ))}
        </ol>
        <Reveal className="card-silver mt-12 grid gap-8 p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="font-display text-3xl">Por que existe a taxa de {money(s.activation_fee)}?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
              É um valor simbólico e único (não recorrente), pago via PIX, que confirma a identidade do titular, reduz cadastros
              falsos e mantém o banco de talentos confiável para as empresas. O cadastro pode ser iniciado e salvo gratuitamente;
              a taxa só é cobrada para ativar o perfil. Se o pagamento não for concluído, o perfil fica como “pendente de ativação”.
            </p>
          </div>
          <Link to="/cadastro/profissional" className="btn-silver">Criar meu perfil</Link>
        </Reveal>
      </section>
    </>
  );
}

/* ───────────────────────── Para empresas ───────────────────────── */
export function ForCompanies() {
  const s = useSettings();
  const [days, setDays] = useState(30);
  return (
    <>
      <PageHeader eyebrow="Para empresas" title={<>Contrate com a precisão de quem <span className="silver-text">conhece talento</span>.</>}>
        Abra vagas com um briefing completo, acompanhe candidatos em um Kanban e conte com a curadoria da nossa equipe.
      </PageHeader>
      <section className="container-x grid gap-12 py-20 lg:grid-cols-2">
        <Reveal className="duotone overflow-hidden rounded-[28px] border border-white/10">
          <img src="/media/talentos-mundo.webp" alt="Seleção de um talento entre profissionais pelo mundo" className="aspect-[16/10] w-full object-cover" />
        </Reveal>
        <Reveal delay={120}>
          <h2 className="font-display text-4xl">O que sua empresa recebe</h2>
          <ul className="mt-6 space-y-3 text-sm text-white/70">
            {['Painel exclusivo, com isolamento total de dados entre empresas', 'Questionário estruturado de 13 pontos para abrir cada vaga',
              'Revisão da vaga pela nossa equipe antes da publicação', 'Candidatos com índice de compatibilidade e requisitos obrigatórios destacados',
              'Favoritos, entrevistas agendadas, observações internas e histórico', 'Carteira de créditos com histórico de cobranças por vaga'].map((x) => (
              <li key={x} className="flex gap-3"><span className="text-silver">◆</span>{x}</li>
            ))}
          </ul>
        </Reveal>
      </section>
      <section className="container-x pb-12">
        <Reveal className="card-silver grid gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">Investimento transparente</p>
            <h2 className="mt-3 font-display text-4xl">{money(s.job_daily_rate)} por dia, por vaga ativa.</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              Você define por quantos dias a vaga fica publicada e vê o custo antes de confirmar. Os créditos são comprados via PIX.
              Ao fim do período, a vaga é pausada automaticamente — nunca excluída — e pode ser renovada. Encerrou antes? Os dias
              inteiros não usados voltam para sua carteira.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink/60 p-6">
            <label htmlFor="sim-days" className="label">Simule: dias de publicação</label>
            <input id="sim-days" type="range" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-[#B9BEC5]" />
            <div className="mt-4 flex items-end justify-between">
              <span className="text-sm text-white/60">{days} dia{days > 1 ? 's' : ''} × {money(s.job_daily_rate)}</span>
              <span className="font-display text-4xl text-silver-light">{money(days * s.job_daily_rate)}</span>
            </div>
            <Link to="/cadastro/empresa" className="btn-silver mt-6 w-full">Cadastrar minha empresa</Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}

/* ───────────────────────── FAQ ───────────────────────── */
export function Faq() {
  const s = useSettings();
  const items: [string, string][] = [
    ['O cadastro de profissional é pago?', `Criar a conta e preencher o perfil é gratuito. Para ativar o perfil — ficar visível às empresas, se candidatar e entrar no banco de talentos — há uma taxa única de ${money(s.activation_fee)} via PIX.`],
    ['Quais formas de pagamento são aceitas?', 'Somente PIX, por QR Code ou código Copia e Cola, com o valor exato da cobrança. Não aceitamos cartão nesta versão.'],
    ['Quanto custa publicar uma vaga?', `${money(s.job_daily_rate)} por dia, por vaga ativa. A empresa escolhe a duração e vê o custo total antes de confirmar. Sem saldo, a vaga é pausada automaticamente, não excluída.`],
    ['Quem pode ver meu currículo?', 'Você, a equipe autorizada da DRAGON APEX TALENT e as empresas das vagas às quais você se candidatou. Os arquivos ficam em armazenamento privado e são acessados apenas por links temporários.'],
    ['Como funciona o índice de compatibilidade?', 'É uma estimativa baseada em regras (área, cargo, requisitos, modalidade, localização e faixa salarial), com fórmula documentada. Serve de apoio: a decisão é sempre do recrutador.'],
    ['Posso excluir minha conta e meus dados?', 'Sim. No seu painel há a opção de solicitar a exclusão da conta e dos dados, conforme a LGPD.'],
    ['Quando o pagamento é confirmado?', 'Após a identificação do PIX pela nossa equipe ou automaticamente pela integração com o PagBank. Nada é liberado antes da confirmação.'],
  ];
  return (
    <>
      <PageHeader eyebrow="Perguntas frequentes" title="Tudo o que você precisa saber." />
      <section className="container-x max-w-3xl py-16">
        <div className="divide-y divide-white/10 border-y border-white/10">
          {items.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
                {q}<span className="text-silver transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-white/60">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

export function NotFound() {
  return (
    <section className="container-x grid min-h-[70vh] place-items-center pt-24 text-center">
      <div>
        <div className="font-display text-8xl silver-text">404</div>
        <p className="mt-4 text-white/60">Esta página não existe ou foi movida.</p>
        <Link to="/" className="btn-silver mt-8">Voltar ao início</Link>
      </div>
    </section>
  );
}
