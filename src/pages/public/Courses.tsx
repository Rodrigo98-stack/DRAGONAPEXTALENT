import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, EmptyState, Spinner, Modal, Badge } from '../../components/ui';
import { ConfigNotice } from '../../components/ConfigNotice';
import { PixPayment } from '../../components/PixPayment';
import { useToast } from '../../components/Toast';
import { db, supabase, isConfigured } from '../../lib/supabase';
import { useAsync, must } from '../../lib/useAsync';
import { useAuth } from '../../auth/AuthProvider';
import { COURSE_LEVELS } from '../../lib/constants';
import { humanError, money } from '../../lib/format';
import type { Course, Enrollment, Transaction } from '../../lib/types';

export function Courses() {
  const [area, setArea] = useState('');
  const { data, loading } = useAsync(async () => {
    if (!supabase) return null;
    return must(await supabase.from('courses').select('*').eq('status', 'published').order('created_at', { ascending: false })) as Course[];
  });
  const areas = [...new Set((data ?? []).map((c) => c.area))];
  const list = (data ?? []).filter((c) => !area || c.area === area);
  return (
    <>
      <PageHeader eyebrow="Área de capacitação" title={<>Aprenda o que o mercado <span className="silver-text">procura</span>.</>}>
        Cursos objetivos e de baixo custo, com progresso salvo e certificado de conclusão.
      </PageHeader>
      <section className="container-x py-12">
        {areas.length > 1 && (
          <div className="mb-8 flex flex-wrap gap-2">
            <button className={`tab ${!area ? 'tab-active' : ''}`} onClick={() => setArea('')}>Todos</button>
            {areas.map((a) => <button key={a} className={`tab ${area === a ? 'tab-active' : ''}`} onClick={() => setArea(a)}>{a}</button>)}
          </div>
        )}
        {!isConfigured ? <ConfigNotice /> : loading ? <Spinner /> : list.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <Link key={c.id} to={`/cursos/${c.slug}`} className="card group overflow-hidden transition hover:-translate-y-1 hover:border-silver/40">
                <div className="aspect-[16/10] bg-gradient-to-br from-ink-600 to-ink-800">
                  {c.cover_url && <img src={c.cover_url} alt="" className="h-full w-full object-cover opacity-85 transition group-hover:opacity-100" loading="lazy" />}
                </div>
                <div className="p-6">
                  <div className="eyebrow">{c.area}</div>
                  <h3 className="mt-2 font-display text-2xl">{c.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-white/55">{c.description}</p>
                  <div className="mt-5 flex items-center justify-between text-sm">
                    <span className="text-white/50">{COURSE_LEVELS[c.level]} · {c.workload_hours}h</span>
                    <span className="font-semibold text-silver-light">{c.price > 0 ? money(c.price) : 'Gratuito'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon="✦" title="Catálogo em preparação">Os cursos aparecerão aqui assim que forem publicados pela equipe.</EmptyState>
        )}
      </section>
    </>
  );
}

type Outline = { module_title: string; module_position: number; lesson_title: string | null; lesson_position: number | null; duration_min: number | null };

export function CourseDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, reload } = useAsync(async () => {
    if (!supabase) return null;
    const course = must(await supabase.from('courses').select('*').eq('slug', slug).maybeSingle()) as Course | null;
    if (!course) return { course: null, outline: [] as Outline[], enrollment: null };
    const [o, e] = await Promise.all([
      supabase.rpc('course_outline', { p_course: course.id }),
      profile ? supabase.from('enrollments').select('*').eq('course_id', course.id).eq('user_id', profile.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { course, outline: (o.data ?? []) as Outline[], enrollment: e.data as Enrollment | null };
  }, [slug, profile?.id]);

  const enroll = async () => {
    if (!profile) return nav(`/entrar?voltar=/cursos/${slug}`);
    const c = data!.course!;
    setBusy(true);
    try {
      if (c.price > 0) {
        setTx(must(await db().rpc('create_charge', { p_kind: 'course', p_reference: c.id })) as Transaction);
      } else {
        must(await db().rpc('enroll_free_course', { p_course: c.id }));
        toast('ok', 'Inscrição confirmada!'); nav(`/aluno/${c.id}`);
      }
    } catch (e) { toast('error', humanError(e)); } finally { setBusy(false); }
  };

  if (!isConfigured) return <div className="container-x py-40"><ConfigNotice /></div>;
  if (loading) return <div className="grid min-h-[70vh] place-items-center"><Spinner /></div>;
  const c = data?.course;
  if (!c) return <div className="container-x py-40"><EmptyState title="Curso não encontrado" action={<Link to="/cursos" className="btn-silver btn-sm">Ver catálogo</Link>} /></div>;

  const modules = [...new Map(data!.outline.map((o) => [o.module_title + o.module_position, o])).values()];
  const access = data!.enrollment && ['active', 'completed'].includes(data!.enrollment.status);

  return (
    <>
      <PageHeader eyebrow={`${c.area} · ${COURSE_LEVELS[c.level]}`} title={c.title}>{c.description}</PageHeader>
      <section className="container-x grid gap-10 py-14 lg:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          {c.syllabus && <div><h2 className="eyebrow mb-3">Conteúdo programático</h2><p className="whitespace-pre-line text-white/70">{c.syllabus}</p></div>}
          <div>
            <h2 className="eyebrow mb-4">Módulos e aulas</h2>
            {modules.length ? (
              <ol className="space-y-3">
                {modules.map((m, i) => (
                  <li key={i} className="card p-5">
                    <div className="font-semibold">{i + 1}. {m.module_title}</div>
                    <ul className="mt-2 space-y-1 text-sm text-white/55">
                      {data!.outline.filter((o) => o.module_title === m.module_title && o.lesson_title).map((o) => (
                        <li key={o.lesson_title! + o.lesson_position}>◇ {o.lesson_title}{o.duration_min ? ` · ${o.duration_min} min` : ''}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-white/45">Aulas em produção.</p>}
          </div>
          {c.prerequisites && <div><h2 className="eyebrow mb-3">Pré-requisitos</h2><p className="text-white/70">{c.prerequisites}</p></div>}
        </div>
        <aside className="card-silver h-fit space-y-4 p-6 lg:sticky lg:top-28">
          <div className="font-display text-4xl text-silver-light">{c.price > 0 ? money(c.price) : 'Gratuito'}</div>
          <div className="text-sm text-white/55">Instrutor: {c.instructor}<br />Carga horária: {c.workload_hours}h</div>
          {access ? (
            <Link to={`/aluno/${c.id}`} className="btn-silver w-full">Acessar o curso</Link>
          ) : data!.enrollment?.status === 'pending_payment' && c.price > 0 ? (
            <><Badge tone="warn">Aguardando pagamento</Badge><button className="btn-silver w-full" disabled={busy} onClick={enroll}>Ver PIX da inscrição</button></>
          ) : (
            <button className="btn-silver w-full" disabled={busy} onClick={enroll}>{c.price > 0 ? 'Comprar via PIX' : 'Inscrever-me grátis'}</button>
          )}
          <p className="text-[11px] text-white/40">Conteúdo pago é liberado somente após a confirmação do PIX.</p>
        </aside>
      </section>
      <Modal open={!!tx} onClose={() => { setTx(null); reload(); }} title="Pagamento do curso" wide>
        {tx && <PixPayment tx={tx} onConfirmed={() => { setTx(null); reload(); }} />}
      </Modal>
    </>
  );
}
