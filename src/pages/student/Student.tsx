import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { humanError } from '../../lib/format';
import type { Course, Enrollment, Lesson, Module } from '../../lib/types';
import { DashboardShell } from '../../components/DashboardShell';
import { EmptyState, Progress, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';

export function StudentArea() {
  const { profile } = useAuth();
  const { data, loading } = useAsync(async () =>
    ((await db().from('enrollments').select('*, courses(*)').eq('user_id', profile!.id).order('created_at', { ascending: false })).data ?? []) as (Enrollment & { courses: Course })[], [profile?.id]);
  return (
    <DashboardShell eyebrow="Área do aluno" title="Meus cursos">
      {loading ? <Spinner /> : data?.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.map((e) => (
          <div key={e.id} className="card overflow-hidden">
            <div className="aspect-[16/9] bg-ink-600">{e.courses.cover_url && <img src={e.courses.cover_url} alt="" className="h-full w-full object-cover" />}</div>
            <div className="p-5">
              <div className="eyebrow">{e.courses.area}</div>
              <h3 className="mt-1 font-semibold">{e.courses.title}</h3>
              <div className="mt-4">
                {e.status === 'pending_payment' ? <Link to={`/cursos/${e.courses.slug}`} className="btn-ghost btn-sm">Aguardando pagamento — ver PIX</Link>
                  : <Link to={`/aluno/${e.course_id}`} className="btn-silver btn-sm">{e.status === 'completed' ? 'Concluído ✓ — revisar' : 'Continuar'}</Link>}
              </div>
            </div>
          </div>
        ))}</div>
      ) : <EmptyState icon="✦" title="Você ainda não tem cursos" action={<Link to="/cursos" className="btn-silver btn-sm">Ver catálogo</Link>} />}
    </DashboardShell>
  );
}

export function CoursePlayer() {
  const { courseId } = useParams();
  const { profile } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState<string | null>(null);
  const [cert, setCert] = useState<string | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    const [c, mods, en, prog, ct] = await Promise.all([
      db().from('courses').select('*').eq('id', courseId).single(),
      db().from('course_modules').select('*').eq('course_id', courseId).order('position'),
      db().from('enrollments').select('*').eq('course_id', courseId).eq('user_id', profile!.id).maybeSingle(),
      db().from('lesson_progress').select('lesson_id').eq('user_id', profile!.id),
      db().from('certificates').select('code').eq('course_id', courseId).eq('user_id', profile!.id).maybeSingle(),
    ]);
    const modules = (mods.data ?? []) as Module[];
    // RLS: as aulas só retornam com inscrição ativa (pagamento confirmado)
    const lessons = modules.length ? ((await db().from('lessons').select('*').in('module_id', modules.map((m) => m.id)).order('position')).data ?? []) as Lesson[] : [];
    return {
      course: c.data as Course, modules, lessons, enrollment: en.data as Enrollment | null,
      done: new Set((prog.data ?? []).map((p: { lesson_id: string }) => p.lesson_id)), cert: (ct.data as { code: string } | null)?.code ?? null,
    };
  }, [courseId, profile?.id]);

  const ordered = useMemo(() => data ? data.modules.flatMap((m) => data.lessons.filter((l) => l.module_id === m.id)) : [], [data]);
  const lesson = ordered.find((l) => l.id === current) ?? ordered.find((l) => !data?.done.has(l.id)) ?? ordered[0];

  if (loading || !data) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  const allowed = data.enrollment && ['active', 'completed'].includes(data.enrollment.status);
  if (!allowed) return (
    <DashboardShell eyebrow="Área do aluno" title={data.course?.title ?? 'Curso'}>
      <EmptyState icon="🔒" title="Conteúdo bloqueado" action={<Link to={`/cursos/${data.course?.slug}`} className="btn-silver btn-sm">Ver inscrição</Link>}>
        O conteúdo é liberado após a confirmação do pagamento via PIX.
      </EmptyState>
    </DashboardShell>
  );

  const pct = ordered.length ? Math.round((ordered.filter((l) => data.done.has(l.id)).length / ordered.length) * 100) : 0;

  const complete = async () => {
    if (!lesson) return;
    const { data: r, error } = await db().rpc('complete_lesson', { p_lesson: lesson.id });
    if (error) return toast('error', humanError(error));
    if (r?.certificate) { setCert(r.certificate); toast('ok', 'Curso concluído! Certificado emitido.'); }
    const idx = ordered.findIndex((l) => l.id === lesson.id);
    if (ordered[idx + 1]) setCurrent(ordered[idx + 1].id);
    reload();
  };

  return (
    <DashboardShell eyebrow="Área do aluno" title={data.course.title} aside={<div className="w-56"><div className="mb-1 text-right text-xs text-white/50">{pct}% concluído</div><Progress value={pct} /></div>}>
      {(cert || data.cert) && (
        <div className="card-silver mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <div><div className="font-display text-2xl text-silver-light">Certificado de conclusão</div><div className="text-xs text-white/55">Código de verificação: {cert || data.cert}</div></div>
          <button className="btn-silver btn-sm" onClick={() => window.print()}>Imprimir / salvar PDF</button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <nav className="card h-fit p-3" aria-label="Aulas">
          {data.modules.map((m) => (
            <div key={m.id} className="mb-3">
              <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-white/50">{m.title}</div>
              {data.lessons.filter((l) => l.module_id === m.id).map((l) => (
                <button key={l.id} onClick={() => setCurrent(l.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${lesson?.id === l.id ? 'bg-silver/15 text-silver-light' : 'text-white/70 hover:bg-white/5'}`}>
                  <span className={data.done.has(l.id) ? 'text-emerald-300' : 'text-white/30'}>{data.done.has(l.id) ? '✓' : '○'}</span>{l.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
        {lesson ? (
          <article className="card p-6 sm:p-8">
            <h2 className="font-display text-3xl">{lesson.title}</h2>
            {lesson.video_url && (
              <div className="mt-6 aspect-video overflow-hidden rounded-xl bg-black">
                <iframe src={lesson.video_url} title={lesson.title} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen />
              </div>
            )}
            {lesson.content && <div className="mt-6 whitespace-pre-line leading-relaxed text-white/75">{lesson.content}</div>}
            {lesson.material_url && <a href={lesson.material_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm mt-6">📎 Material complementar</a>}
            <div className="mt-8 border-t border-white/5 pt-6">
              {data.done.has(lesson.id) ? <span className="badge tone-ok">✓ Aula concluída</span> : <button className="btn-silver" onClick={complete}>Marcar como concluída</button>}
            </div>
          </article>
        ) : <EmptyState title="Aulas em produção">O conteúdo deste curso será publicado em breve.</EmptyState>}
      </div>
    </DashboardShell>
  );
}
