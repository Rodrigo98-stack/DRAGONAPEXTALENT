import { useState, type FormEvent } from 'react';
import { db } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { humanError, money } from '../../lib/format';
import { AREAS, COURSE_LEVELS } from '../../lib/constants';
import type { Course, Lesson, Module } from '../../lib/types';
import { Badge, EmptyState, Field, Modal, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';

const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function AdminCourses() {
  const toast = useToast();
  const [editing, setEditing] = useState<Course | 'new' | null>(null);
  const [content, setContent] = useState<Course | null>(null);
  const { data, loading, reload } = useAsync(async () => {
    const [c, e] = await Promise.all([
      db().from('courses').select('*').order('created_at', { ascending: false }),
      db().from('enrollments').select('course_id,status'),
    ]);
    const counts = new Map<string, { total: number; done: number }>();
    (e.data ?? []).forEach((x: { course_id: string; status: string }) => {
      const v = counts.get(x.course_id) ?? { total: 0, done: 0 };
      if (x.status !== 'pending_payment') v.total++;
      if (x.status === 'completed') v.done++;
      counts.set(x.course_id, v);
    });
    return { courses: (c.data ?? []) as Course[], counts };
  });

  const setStatus = async (c: Course, status: Course['status']) => {
    const { error } = await db().from('courses').update({ status }).eq('id', c.id);
    if (error) return toast('error', humanError(error));
    reload();
  };

  if (content) return <CourseContent course={content} onBack={() => setContent(null)} />;
  if (loading || !data) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><button className="btn-silver btn-sm" onClick={() => setEditing('new')}>+ Novo curso</button></div>
      {data.courses.length ? (
        <div className="card overflow-x-auto p-2"><table className="table">
          <thead><tr><th>Curso</th><th>Preço</th><th>Alunos</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
          <tbody>{data.courses.map((c) => (
            <tr key={c.id}>
              <td><div className="font-medium">{c.title}</div><div className="text-xs text-white/40">{c.area} · {COURSE_LEVELS[c.level]} · {c.workload_hours}h</div></td>
              <td>{c.price > 0 ? money(c.price) : 'Gratuito'}</td>
              <td className="text-xs">{data.counts.get(c.id)?.total ?? 0} inscritos · {data.counts.get(c.id)?.done ?? 0} concluíram</td>
              <td><Badge tone={c.status === 'published' ? 'ok' : c.status === 'paused' ? 'warn' : 'muted'}>{c.status === 'published' ? 'Publicado' : c.status === 'paused' ? 'Pausado' : 'Rascunho'}</Badge></td>
              <td><div className="flex flex-wrap justify-end gap-2">
                <button className="btn-ghost btn-sm" onClick={() => setEditing(c)}>Editar</button>
                <button className="btn-ghost btn-sm" onClick={() => setContent(c)}>Módulos e aulas</button>
                {c.status !== 'published' ? <button className="btn-silver btn-sm" onClick={() => setStatus(c, 'published')}>Publicar</button>
                  : <button className="btn-ghost btn-sm" onClick={() => setStatus(c, 'paused')}>Pausar</button>}
                {c.status === 'published' && <button className="btn-danger btn-sm" onClick={() => confirm('Retirar do catálogo?') && setStatus(c, 'draft')}>Retirar</button>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <EmptyState icon="✦" title="Nenhum curso cadastrado" action={<button className="btn-silver btn-sm" onClick={() => setEditing('new')}>Criar o primeiro curso</button>} />}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Novo curso' : 'Editar curso'} wide>
        {editing && <CourseForm course={editing === 'new' ? null : editing} onSaved={() => { setEditing(null); reload(); }} />}
      </Modal>
    </div>
  );
}

function CourseForm({ course, onSaved }: { course: Course | null; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setBusy(true);
    try {
      let cover = course?.cover_url ?? null;
      const file = (form.elements.namedItem('cover') as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > 3 * 1024 * 1024) throw new Error('Capa acima de 3 MB.');
        const path = `${crypto.randomUUID()}.${file.name.split('.').pop()}`;
        const up = await db().storage.from('course-covers').upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        cover = db().storage.from('course-covers').getPublicUrl(path).data.publicUrl;
      }
      const row = {
        title: f.title, slug: course?.slug ?? `${slugify(f.title)}-${Math.random().toString(36).slice(2, 6)}`, cover_url: cover,
        description: f.description, area: f.area, instructor: f.instructor, syllabus: f.syllabus || null,
        workload_hours: Number(f.workload_hours), level: f.level, price: f.free === 'on' ? 0 : Number(f.price || 0), prerequisites: f.prerequisites || null,
      };
      const r = course ? await db().from('courses').update(row).eq('id', course.id) : await db().from('courses').insert(row);
      if (r.error) throw r.error;
      toast('ok', 'Curso salvo.'); onSaved();
    } catch (err) { toast('error', humanError(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome *" className="sm:col-span-2"><input name="title" required defaultValue={course?.title} className="input" /></Field>
      <Field label="Descrição *" className="sm:col-span-2"><textarea name="description" required rows={3} defaultValue={course?.description} className="input" /></Field>
      <Field label="Área *"><select name="area" required defaultValue={course?.area ?? ''} className="input"><option value="" disabled>Selecione</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
      <Field label="Instrutor *"><input name="instructor" required defaultValue={course?.instructor} className="input" /></Field>
      <Field label="Nível *"><select name="level" required defaultValue={course?.level ?? 'iniciante'} className="input">{Object.entries(COURSE_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Carga horária (h) *"><input name="workload_hours" type="number" min={1} required defaultValue={course?.workload_hours ?? 4} className="input" /></Field>
      <Field label="Preço (R$)"><input name="price" type="number" min={0} step="0.01" defaultValue={course?.price ?? ''} className="input" /></Field>
      <label className="flex items-end gap-2 pb-3 text-sm text-white/60"><input type="checkbox" name="free" defaultChecked={course?.price === 0} className="accent-[#B9BEC5]" />Curso gratuito</label>
      <Field label="Conteúdo programático" className="sm:col-span-2"><textarea name="syllabus" rows={3} defaultValue={course?.syllabus ?? ''} className="input" /></Field>
      <Field label="Pré-requisitos"><input name="prerequisites" defaultValue={course?.prerequisites ?? ''} className="input" /></Field>
      <Field label="Imagem de capa" hint="PNG/JPG/WebP até 3 MB"><input name="cover" type="file" accept="image/png,image/jpeg,image/webp" className="input" /></Field>
      <div className="sm:col-span-2"><button disabled={busy} className="btn-silver">{busy ? 'Salvando…' : 'Salvar curso'}</button></div>
    </form>
  );
}

function CourseContent({ course, onBack }: { course: Course; onBack: () => void }) {
  const toast = useToast();
  const [lessonEdit, setLessonEdit] = useState<{ module: Module; lesson: Lesson | null } | null>(null);
  const { data, reload } = useAsync(async () => {
    const mods = ((await db().from('course_modules').select('*').eq('course_id', course.id).order('position')).data ?? []) as Module[];
    const lessons = mods.length ? ((await db().from('lessons').select('*').in('module_id', mods.map((m) => m.id)).order('position')).data ?? []) as Lesson[] : [];
    return { mods, lessons };
  }, [course.id]);

  const addModule = async () => {
    const title = prompt('Título do módulo:');
    if (!title) return;
    const { error } = await db().from('course_modules').insert({ course_id: course.id, title, position: (data?.mods.length ?? 0) + 1 });
    if (error) return toast('error', humanError(error));
    reload();
  };
  const del = async (table: 'course_modules' | 'lessons', id: string) => {
    if (!confirm('Excluir? Esta ação não pode ser desfeita.')) return;
    const { error } = await db().from(table).delete().eq('id', id);
    if (error) return toast('error', humanError(error));
    reload();
  };
  const saveLesson = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const { module, lesson } = lessonEdit!;
    const row = { module_id: module.id, title: f.title, content: f.content || null, video_url: f.video_url || null, material_url: f.material_url || null,
      duration_min: f.duration_min ? Number(f.duration_min) : null,
      position: lesson?.position ?? (data!.lessons.filter((l) => l.module_id === module.id).length + 1) };
    const r = lesson ? await db().from('lessons').update(row).eq('id', lesson.id) : await db().from('lessons').insert(row);
    if (r.error) return toast('error', humanError(r.error));
    setLessonEdit(null); reload();
  };

  return (
    <div className="space-y-5">
      <button className="btn-ghost btn-sm" onClick={onBack}>← Cursos</button>
      <div className="flex items-center justify-between"><h2 className="font-display text-3xl">{course.title}</h2><button className="btn-silver btn-sm" onClick={addModule}>+ Módulo</button></div>
      {!data ? <Spinner /> : data.mods.length ? data.mods.map((m) => (
        <div key={m.id} className="card p-5">
          <div className="flex items-center justify-between"><h3 className="font-semibold">{m.position}. {m.title}</h3>
            <div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={() => setLessonEdit({ module: m, lesson: null })}>+ Aula</button><button className="btn-danger btn-sm" onClick={() => del('course_modules', m.id)}>Excluir</button></div></div>
          <ul className="mt-3 space-y-1">{data.lessons.filter((l) => l.module_id === m.id).map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-white/[0.03]">
              <span>◇ {l.title}{l.duration_min ? <span className="text-white/40"> · {l.duration_min} min</span> : null}</span>
              <span className="flex gap-3 text-xs"><button className="text-silver-light hover:underline" onClick={() => setLessonEdit({ module: m, lesson: l })}>editar</button><button className="text-red-300/80 hover:underline" onClick={() => del('lessons', l.id)}>excluir</button></span>
            </li>
          ))}</ul>
        </div>
      )) : <EmptyState title="Nenhum módulo">Crie módulos e adicione aulas (texto, vídeo incorporado e material complementar).</EmptyState>}
      <Modal open={!!lessonEdit} onClose={() => setLessonEdit(null)} title={lessonEdit?.lesson ? 'Editar aula' : 'Nova aula'} wide>
        {lessonEdit && (
          <form onSubmit={saveLesson} className="grid gap-4">
            <Field label="Título *"><input name="title" required defaultValue={lessonEdit.lesson?.title} className="input" /></Field>
            <Field label="URL de vídeo incorporável" hint="Ex.: https://www.youtube.com/embed/…"><input name="video_url" type="url" defaultValue={lessonEdit.lesson?.video_url ?? ''} className="input" /></Field>
            <Field label="Conteúdo da aula"><textarea name="content" rows={8} defaultValue={lessonEdit.lesson?.content ?? ''} className="input" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Material complementar (URL)"><input name="material_url" type="url" defaultValue={lessonEdit.lesson?.material_url ?? ''} className="input" /></Field>
              <Field label="Duração (min)"><input name="duration_min" type="number" min={1} defaultValue={lessonEdit.lesson?.duration_min ?? ''} className="input" /></Field>
            </div>
            <div><button className="btn-silver">Salvar aula</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
