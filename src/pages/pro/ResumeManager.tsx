import { useState } from 'react';
import { db } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { date, humanError } from '../../lib/format';
import { useToast } from '../../components/Toast';
import type { Resume } from '../../lib/types';

export const RESUME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const MAX = 5 * 1024 * 1024;

/** Abre o currículo por signed URL de 60 s (nunca link público permanente). */
export async function openResume(path: string) {
  const { data, error } = await db().storage.from('resumes').createSignedUrl(path, 60);
  if (error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener');
}

export function ResumeManager({ userId, onChange }: { userId: string; onChange?: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data, reload } = useAsync(async () =>
    ((await db().from('resumes').select('*').eq('user_id', userId).order('created_at', { ascending: false })).data ?? []) as Resume[], [userId]);
  const current = data?.find((r) => r.is_current);

  const upload = async (file: File) => {
    const ext = RESUME_TYPES[file.type];
    if (!ext) return toast('error', 'Formato inválido. Envie PDF, DOC ou DOCX.');
    if (file.size > MAX) return toast('error', 'Arquivo acima de 5 MB.');
    setBusy(true);
    try {
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const up = await db().storage.from('resumes').upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      await db().from('resumes').update({ is_current: false }).eq('user_id', userId).eq('is_current', true);
      const ins = await db().from('resumes').insert({ user_id: userId, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size });
      if (ins.error) throw ins.error;
      toast('ok', 'Currículo atualizado.');
      reload(); onChange?.();
    } catch (e) { toast('error', humanError(e)); } finally { setBusy(false); }
  };

  const remove = async (r: Resume) => {
    if (!confirm(`Excluir "${r.file_name}"? Esta ação não pode ser desfeita.`)) return;
    await db().storage.from('resumes').remove([r.storage_path]);
    const { error } = await db().from('resumes').delete().eq('id', r.id);
    if (error) return toast('error', humanError(error));
    toast('ok', 'Currículo excluído.');
    reload(); onChange?.();
  };

  return (
    <div className="rounded-2xl border border-white/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="label !mb-0">Currículo</div>
          {current ? (
            <button className="mt-1 text-left text-sm text-silver-light hover:underline" onClick={() => openResume(current.storage_path).catch((e) => toast('error', humanError(e)))}>
              📄 {current.file_name} <span className="text-white/40">· {(current.size_bytes / 1024).toFixed(0)} KB · {date(current.created_at)}</span>
            </button>
          ) : <div className="mt-1 text-sm text-white/45">Nenhum arquivo enviado.</div>}
        </div>
        <div className="flex gap-2">
          <label className="btn-silver btn-sm cursor-pointer">
            {busy ? 'Enviando…' : current ? 'Substituir' : 'Enviar currículo'}
            <input type="file" className="sr-only" disabled={busy} accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
          </label>
          {current && <button className="btn-danger btn-sm" onClick={() => remove(current)}>Excluir</button>}
        </div>
      </div>
      <p className="hint">PDF, DOC ou DOCX até 5 MB. Armazenamento privado: apenas você, a equipe e empresas das vagas em que se candidatou podem abrir.</p>
      {data && data.length > 1 && (
        <details className="mt-3 text-xs text-white/50">
          <summary className="cursor-pointer">Versões anteriores ({data.length - 1})</summary>
          <ul className="mt-2 space-y-1">{data.filter((r) => !r.is_current).map((r) => (
            <li key={r.id} className="flex justify-between gap-2"><span>{r.file_name} · {date(r.created_at)}</span>
              <button className="text-red-300/80 hover:text-red-300" onClick={() => remove(r)}>excluir</button></li>
          ))}</ul>
        </details>
      )}
    </div>
  );
}
