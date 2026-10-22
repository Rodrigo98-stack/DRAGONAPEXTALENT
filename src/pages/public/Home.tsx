import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoImage } from '../../components/Logo';
import { Reveal, onSpotMove } from '../../components/Reveal';
import { JobCard } from '../../components/JobCard';
import { EmptyState } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { useSettings } from '../../lib/useSettings';
import { AREAS, COURSE_LEVELS } from '../../lib/constants';
import { money } from '../../lib/format';
import type { Course, Job } from '../../lib/types';

export default function Home() {
  return (
    <>
      <Intro />
      <Hero />
      <AreasMarquee />
      <Precision />
      <HowItWorks />
      <ForCompaniesSection />
      <ForProfessionalsSection />
      <Opportunities />
      <Training />
      <RealNumbers />
      <Testimonials />
      <FinalCta />
    </>
  );
}

/* ───────────────────────── Abertura: vídeo + logo ───────────────────────── */
function Hero() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { video.current?.pause(); setPlaying(false); }
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  return (
    <section className="grain relative isolate flex min-h-[100svh] items-center overflow-hidden bg-ink">

      {/* Vídeo de abertura com tratamento prateado (mesma linguagem das fotos) */}
      <div className={`absolute inset-0 -z-20 transition-opacity duration-[1.8s] ${ready ? 'opacity-100' : 'opacity-0'}`}>
        <video ref={video} className="h-full w-full object-cover object-[68%_center] [filter:grayscale(1)_contrast(1.18)_brightness(.82)]"
          src="/media/hero.mp4" autoPlay muted loop playsInline preload="auto" aria-hidden="true"
          onCanPlay={() => setReady(true)} />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#CFD5DC,#8D96A1_45%,#2A2F35)] opacity-25 mix-blend-color" />
      </div>
      {/* camadas de leitura */}
      <div className="absolute inset-0 -z-10 bg-ink/55 lg:bg-[linear-gradient(90deg,#0A0A0A_0%,#0A0A0Af2_30%,#0A0A0A99_52%,transparent_78%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-ink to-transparent" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-56 bg-gradient-to-t from-ink via-ink/70 to-transparent" />
      <div className="absolute -left-20 top-1/3 -z-10 h-[460px] w-[460px] rounded-full bg-silver/15 blur-[130px] animate-breathe" />

      <div id="conteudo" className="container-x relative flex flex-col items-center pb-24 pt-28 text-center lg:items-start lg:text-left">
        <div className="relative animate-rise [animation-delay:.2s] mix-blend-screen">
          <img src="/media/logo.jpg" alt="DRAGON APEX TALENT" draggable={false}
            className="w-[min(62vw,300px)] select-none [mask-image:radial-gradient(closest-side,#000_78%,transparent)] lg:-ml-8" />
          {/* brilho que atravessa a logo */}
          <div aria-hidden className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(closest-side,#000_60%,transparent)] lg:-ml-8"
            style={{ background: 'linear-gradient(110deg,transparent 40%,rgba(255,255,255,.35) 50%,transparent 60%)', backgroundSize: '250% 100%', animation: 'shimmer 6s ease-in-out infinite' }} />
        </div>

        <h1 className="mt-4 max-w-3xl font-display text-[2.35rem] font-medium leading-[1.04] sm:text-6xl xl:text-7xl animate-rise [animation-delay:.45s]">
          Encontramos os <em className="silver-text animate-shimmer not-italic">talentos</em> que impulsionam o futuro das empresas.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg animate-rise [animation-delay:.6s]">
          Conectamos profissionais de excelência às oportunidades certas, utilizando uma abordagem estratégica de
          recrutamento, seleção e desenvolvimento profissional.
        </p>

        <div className="mt-10 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2 animate-rise [animation-delay:.75s]">
          <Link to="/cadastro/profissional" className="btn-silver">Sou profissional</Link>
          <Link to="/cadastro/empresa" className="btn-ghost backdrop-blur">Sou empresa</Link>
          <Link to="/cursos" className="btn-ghost backdrop-blur">Conheça nossos cursos</Link>
          <Link to="/vagas" className="btn-ghost backdrop-blur">Explorar oportunidades</Link>
        </div>
      </div>

      <a href="#precisao" className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] uppercase tracking-widest2 text-white/40 transition hover:text-silver sm:flex">
        Descubra
        <span className="relative h-10 w-px overflow-hidden bg-white/15">
          <span className="absolute left-0 top-0 h-4 w-px animate-[rise_1.8s_ease-in-out_infinite] bg-silver" />
        </span>
      </a>
      <button onClick={toggle} className="absolute bottom-6 right-5 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-ink/50 text-xs text-white/70 backdrop-blur hover:border-silver/60 hover:text-silver"
        aria-label={playing ? 'Pausar vídeo de fundo' : 'Reproduzir vídeo de fundo'}>
        {playing ? '❚❚' : '▶'}
      </button>
    </section>
  );
}

/** Vinheta de abertura: a logo em tela cheia por um instante, uma vez por visita. Clique ou Esc pula. */
function Intro() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>(() => {
    try {
      if (sessionStorage.getItem('dat_intro') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'gone';
    } catch { /* sem storage: mostra mesmo assim */ }
    return 'show';
  });

  useEffect(() => {
    if (phase === 'gone') return;
    try { sessionStorage.setItem('dat_intro', '1'); } catch { /* ignore */ }
    const t1 = setTimeout(() => setPhase('leave'), 2300);
    const t2 = setTimeout(() => setPhase('gone'), 3300);
    const skip = () => { setPhase('leave'); setTimeout(() => setPhase('gone'), 700); };
    window.addEventListener('keydown', skip, { once: true });
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('keydown', skip); };
  }, [phase === 'gone']); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'gone') return null;
  return (
    <div role="presentation" onClick={() => { setPhase('leave'); setTimeout(() => setPhase('gone'), 700); }}
      className={`fixed inset-0 z-[100] grid cursor-pointer place-items-center bg-ink transition-opacity duration-1000 ${phase === 'leave' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      <div className="relative mix-blend-screen">
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-silver/25 blur-[90px] animate-breathe" />
        <img src="/media/logo.jpg" alt="DRAGON APEX TALENT"
          className={`relative w-[min(78vw,440px)] transition-all duration-[1.4s] ease-out [mask-image:radial-gradient(closest-side,#000_80%,transparent)] ${phase === 'leave' ? 'scale-110 opacity-0 blur-sm' : 'animate-[introLogo_1.6s_cubic-bezier(.2,.7,.2,1)_both]'}`} />
        <div aria-hidden className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(closest-side,#000_70%,transparent)]"
          style={{ background: 'linear-gradient(110deg,transparent 40%,rgba(255,255,255,.5) 50%,transparent 60%)', backgroundSize: '250% 100%', animation: 'shimmer 2.2s ease-in-out .5s both' }} />
      </div>
      <span className="absolute bottom-8 text-[10px] uppercase tracking-widest2 text-white/30">clique para pular</span>
      <style>{'@keyframes introLogo{0%{opacity:0;transform:scale(.92);filter:blur(10px)}100%{opacity:1;transform:none;filter:none}}'}</style>
    </div>
  );
}

function AreasMarquee() {
  const items = AREAS.filter((a) => a !== 'Outras');
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-ink-800 py-5" aria-label="Áreas de atuação">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink-800 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink-800 to-transparent" />
      <div className="flex w-max animate-[marquee_60s_linear_infinite] gap-10 whitespace-nowrap">
        {[...items, ...items].map((a, i) => (
          <span key={i} className="flex items-center gap-10 font-display text-xl text-white/45">
            {a}<span className="text-xs text-silver">◆</span>
          </span>
        ))}
      </div>
      <style>{'@keyframes marquee{to{transform:translateX(-50%)}}'}</style>
    </div>
  );
}

/* ───────────────────────── Precisão (foto: seleção) ───────────────────────── */
function Precision() {
  return (
    <section id="precisao" className="container-x grid items-center gap-14 py-28 lg:grid-cols-2">
      <Reveal className="relative">
        <div className="duotone overflow-hidden rounded-[28px] border border-white/10">
          <img src="/media/selecao.png" alt="Mão selecionando um profissional em destaque entre vários perfis" className="aspect-[4/3] w-full object-cover" loading="lazy" />
        </div>
        {/* cantos de mira prateados — o mesmo gesto de seleção da foto */}
        {['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2', 'left-0 bottom-0 border-l-2 border-b-2', 'right-0 bottom-0 border-r-2 border-b-2'].map((c) => (
          <span key={c} className={`absolute h-10 w-10 -m-3 border-silver ${c}`} />
        ))}
        <div className="card-silver absolute -bottom-8 right-6 hidden max-w-[240px] p-5 sm:block">
          <div className="font-display text-3xl text-silver-light">1 escolha</div>
          <p className="mt-1 text-xs leading-relaxed text-white/55">A certa. É para isso que existe a curadoria humana por trás de cada indicação.</p>
        </div>
      </Reveal>
      <Reveal delay={150}>
        <p className="eyebrow">Recrutamento com precisão</p>
        <h2 className="mt-4 font-display text-4xl leading-[1.08] sm:text-5xl">
          Não somos um mural de classificados. Somos uma <span className="silver-text">consultoria</span> de talentos.
        </h2>
        <p className="mt-6 text-white/60 leading-relaxed">
          Cada vaga passa por revisão, cada perfil é analisado e cada indicação é feita por pessoas. Nossa tecnologia organiza
          o banco de talentos e sugere compatibilidades — mas a decisão final é sempre do recrutador.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            ['Força', 'Processos firmes, do briefing à contratação confirmada.'],
            ['Precisão', 'Requisitos obrigatórios e desejáveis avaliados um a um.'],
            ['Estratégia', 'Banco de talentos vivo, pronto para a próxima vaga.'],
            ['Confiança', 'Dados protegidos e tratados conforme a LGPD.'],
          ].map(([t, d]) => (
            <li key={t} className="border-l border-silver/40 pl-4">
              <div className="font-semibold text-white">{t}</div>
              <div className="mt-1 text-sm text-white/55">{d}</div>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

/* ───────────────────────── Como funciona ───────────────────────── */
function HowItWorks() {
  const steps = [
    ['01', 'Briefing da vaga', 'A empresa responde um questionário estruturado com 13 pontos — do perfil técnico à jornada de trabalho.'],
    ['02', 'Curadoria e busca', 'Nossa equipe revisa a vaga, publica e cruza requisitos com o banco de talentos.'],
    ['03', 'Pré-seleção', 'Candidatos compatíveis são avaliados e apenas os mais aderentes seguem para a empresa.'],
    ['04', 'Entrevista e contratação', 'Acompanhamos entrevistas e avaliações até a contratação ser confirmada.'],
  ];
  return (
    <section className="relative overflow-hidden border-y border-white/[0.06] bg-ink-800 py-28">
      <div className="pointer-events-none absolute -right-40 top-10 h-96 w-96 rounded-full bg-silver/10 blur-[120px]" />
      <div className="container-x">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Como funciona o recrutamento</p>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl">Quatro etapas. Nenhuma improvisada.</h2>
        </Reveal>
        <ol className="relative mt-16 grid gap-6 md:grid-cols-4">
          <div className="hairline absolute left-0 right-0 top-8 hidden md:block" />
          {steps.map(([n, t, d], i) => (
            <Reveal as="li" key={n} delay={i * 120} className="relative">
              <div className="relative z-10 grid h-16 w-16 place-items-center rounded-full border border-silver/50 bg-ink font-display text-2xl text-silver-light shadow-[0_0_30px_-8px_#B9BEC5]">{n}</div>
              <h3 className="mt-6 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{d}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────────────────── Empresas (foto: mapa de talentos) ───────────────────────── */
function ForCompaniesSection() {
  const s = useSettings();
  return (
    <section className="container-x py-28">
      <div className="card-silver relative overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr_1fr]">
          <div className="duotone relative min-h-[320px] lg:min-h-full">
            <img src="/media/talentos-mundo.webp" alt="Executiva destacando um talento entre profissionais distribuídos pelo mapa-múndi" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#141414] lg:block hidden" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141414] to-transparent lg:hidden" />
          </div>
          <Reveal className="relative p-8 sm:p-12">
            <p className="eyebrow">Para empresas</p>
            <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Do mundo de candidatos, o talento que a sua empresa precisa.</h2>
            <ul className="mt-8 space-y-3 text-sm text-white/70">
              {['Questionário completo de abertura de vaga', 'Painel com candidatos, favoritos, entrevistas e observações internas',
                'Kanban do processo seletivo com histórico de cada etapa', 'Isolamento total: sua empresa só enxerga os próprios dados'].map((x) => (
                <li key={x} className="flex gap-3"><span className="mt-1 text-silver">◆</span>{x}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-end gap-x-8 gap-y-4 rounded-2xl border border-silver/20 bg-ink/50 p-5">
              <div>
                <div className="text-xs text-white/50">Publicação de vaga</div>
                <div className="font-display text-4xl text-silver-light">{money(s.job_daily_rate)}<span className="text-base text-white/50"> /dia</span></div>
              </div>
              <p className="max-w-[260px] text-xs leading-relaxed text-white/50">Você escolhe quantos dias a vaga fica no ar e vê o custo total antes de confirmar. Pagamento via PIX.</p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/cadastro/empresa" className="btn-silver">Cadastrar minha empresa</Link>
              <Link to="/empresas" className="btn-ghost">Saiba mais</Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Profissionais ───────────────────────── */
function ForProfessionalsSection() {
  const s = useSettings();
  const qs = [
    ['Me mostre seu perfil profissional', 'Trajetória, formação, objetivos e o tipo de oportunidade que você busca.'],
    ['Quais são suas principais qualidades?', 'Habilidades técnicas, competências comportamentais e diferenciais.'],
    ['Por que uma empresa deveria contratar você?', 'O valor que você entrega e como contribui para resultados.'],
  ];
  return (
    <section className="container-x pb-28">
      <div className="grid gap-14 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <Reveal>
          <p className="eyebrow">Para profissionais</p>
          <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Seu perfil, contado do jeito que as empresas querem ler.</h2>
          <p className="mt-6 leading-relaxed text-white/60">
            Cadastro em etapas, com salvamento automático. Envie seu currículo em PDF ou Word, responda às três perguntas que
            fazem diferença e acompanhe cada candidatura em tempo real.
          </p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-4xl text-silver-light">{money(s.activation_fee)}</span>
              <span className="text-sm text-white/50">taxa única de ativação</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/50">
              O cadastro é gratuito. A taxa simbólica é cobrada uma única vez, via PIX, para ativar o perfil, liberar candidaturas
              e a entrada no banco de talentos — e afasta perfis falsos.
            </p>
          </div>
          <Link to="/cadastro/profissional" className="btn-silver mt-8">Criar meu perfil</Link>
        </Reveal>
        <div className="grid gap-4">
          {qs.map(([q, d], i) => (
            <Reveal key={q} delay={i * 120}>
              <div onMouseMove={onSpotMove} className="card spot flex gap-5 p-6 transition hover:border-silver/40">
                <span className="font-display text-5xl leading-none text-silver/40">{i + 1}</span>
                <div>
                  <h3 className="font-display text-2xl text-white">“{q}”</h3>
                  <p className="mt-2 text-sm text-white/55">{d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Vagas reais ───────────────────────── */
function Opportunities() {
  const { data, loading } = useAsync(async () => {
    if (!supabase) return null;
    const { data } = await supabase.from('public_jobs').select('*').order('published_at', { ascending: false }).limit(6);
    return (data ?? []) as Job[];
  });
  return (
    <section className="border-y border-white/[0.06] bg-ink-800 py-28">
      <div className="container-x">
        <Reveal className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Oportunidades</p>
            <h2 className="mt-4 font-display text-4xl sm:text-5xl">Vagas abertas agora</h2>
          </div>
          <Link to="/vagas" className="btn-ghost w-fit">Ver todas as vagas →</Link>
        </Reveal>
        <div className="mt-12">
          {loading ? null : data && data.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((j, i) => <Reveal key={j.id} delay={i * 80}><JobCard job={j} /></Reveal>)}
            </div>
          ) : (
            <EmptyState icon="◆" title="Novas vagas em breve"
              action={<Link to="/cadastro/profissional" className="btn-silver btn-sm mt-2">Entrar para o banco de talentos</Link>}>
              Ainda não há vagas publicadas. Cadastre seu perfil para ser encontrado assim que surgirem oportunidades compatíveis.
            </EmptyState>
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Capacitação ───────────────────────── */
function Training() {
  const { data, loading } = useAsync(async () => {
    if (!supabase) return null;
    const { data } = await supabase.from('courses').select('*').eq('status', 'published').order('created_at', { ascending: false }).limit(3);
    return (data ?? []) as Course[];
  });
  return (
    <section className="container-x py-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
        <Reveal>
          <p className="eyebrow">Capacitação profissional</p>
          <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Cursos de baixo custo para subir de nível.</h2>
          <p className="mt-6 leading-relaxed text-white/60">Aulas organizadas em módulos, progresso salvo, materiais complementares e certificado ao concluir.</p>
          <Link to="/cursos" className="btn-ghost mt-8">Ver catálogo</Link>
        </Reveal>
        {loading ? null : data && data.length ? (
          <div className="grid gap-5 sm:grid-cols-3">
            {data.map((c, i) => (
              <Reveal key={c.id} delay={i * 100}>
                <Link to={`/cursos/${c.slug}`} className="card group block overflow-hidden transition hover:border-silver/40">
                  <div className="aspect-[4/3] bg-ink-600">
                    {c.cover_url && <img src={c.cover_url} alt="" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" loading="lazy" />}
                  </div>
                  <div className="p-5">
                    <div className="eyebrow">{c.area} · {COURSE_LEVELS[c.level]}</div>
                    <h3 className="mt-2 font-semibold">{c.title}</h3>
                    <div className="mt-3 text-sm text-silver-light">{c.price > 0 ? money(c.price) : 'Gratuito'} · {c.workload_hours}h</div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState icon="✦" title="Catálogo em preparação">
            Os primeiros cursos estão sendo produzidos e aparecerão aqui assim que forem publicados.
          </EmptyState>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── Indicadores: só com dados reais ───────────────────────── */
function RealNumbers() {
  const { data } = useAsync(async () => {
    if (!supabase) return null;
    const { data } = await supabase.rpc('public_stats');
    return data as Record<string, number> | null;
  });
  const labels: Record<string, string> = {
    profissionais_ativos: 'Profissionais ativos', empresas: 'Empresas parceiras', vagas_abertas: 'Vagas abertas',
    contratacoes: 'Contratações confirmadas', cursos: 'Cursos publicados',
  };
  const items = Object.entries(data ?? {}).filter(([, v]) => Number(v) > 0);
  if (!items.length) return null;     // regra: nada de números inventados
  return (
    <section className="container-x pb-28">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map(([k, v], i) => (
          <Reveal key={k} delay={i * 80} className="card p-6 text-center">
            <div className="font-display text-5xl text-silver-light">{Number(v).toLocaleString('pt-BR')}</div>
            <div className="mt-2 text-xs uppercase tracking-wider text-white/50">{labels[k] ?? k}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── Depoimentos: só os autorizados ───────────────────────── */
function Testimonials() {
  const { data } = useAsync(async () => {
    if (!supabase) return null;
    const { data } = await supabase.from('testimonials').select('id,author_name,author_role,body').eq('authorized', true).limit(6);
    return data as { id: string; author_name: string; author_role: string | null; body: string }[] | null;
  });
  if (!data?.length) return null;
  return (
    <section className="container-x pb-28">
      <Reveal><p className="eyebrow">Depoimentos</p><h2 className="mt-4 font-display text-4xl sm:text-5xl">Quem já passou por aqui</h2></Reveal>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {data.map((t, i) => (
          <Reveal key={t.id} delay={i * 100} className="card p-7">
            <div className="font-display text-5xl leading-none text-silver/50">“</div>
            <p className="mt-2 leading-relaxed text-white/75">{t.body}</p>
            <div className="mt-6 text-sm font-semibold">{t.author_name}</div>
            {t.author_role && <div className="text-xs text-white/45">{t.author_role}</div>}
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="container-x">
      <Reveal className="card-silver relative overflow-hidden px-6 py-20 text-center sm:px-16">
        <LogoImage alt="" className="pointer-events-none absolute -right-20 -top-10 w-[420px] opacity-[0.07]" />
        <p className="eyebrow">O próximo passo</p>
        <h2 className="mx-auto mt-4 max-w-3xl font-display text-4xl leading-tight sm:text-6xl">
          Talento encontra <span className="silver-text">oportunidade</span>. Aqui.
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/cadastro/profissional" className="btn-silver">Sou profissional</Link>
          <Link to="/cadastro/empresa" className="btn-ghost">Quero contratar</Link>
        </div>
      </Reveal>
    </section>
  );
}
