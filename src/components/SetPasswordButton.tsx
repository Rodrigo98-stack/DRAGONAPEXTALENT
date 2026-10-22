import { useState } from 'react';
import { db } from '../lib/supabase';
import { humanError } from '../lib/format';
import { generatePassword } from '../lib/password';
import { Field, Modal } from './ui';
import { useToast } from './Toast';

/** O administrador define uma senha provisória para um profissional ou empresa e a repassa por conta própria. */
export function SetPasswordButton({ userId, name, email }: { userId: string; name: string; email: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const valid = pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);
  const close = () => { setOpen(false); setPwd(''); setDone(null); };

  const apply = async () => {
    if (!confirm(`Definir uma nova senha para ${name}? A senha atual deixa de valer e as sessões abertas serão encerradas.`)) return;
    setBusy(true);
    const { error } = await db().rpc('admin_set_user_password', { p_user: userId, p_password: pwd });
    setBusy(false);
    if (error) return toast('error', humanError(error));
    setDone(pwd);
  };

  const message = done
    ? `Olá, ${name.split(' ')[0]}! Sua senha de acesso à DRAGON APEX TALENT foi redefinida.\n\nSite: ${location.origin}/entrar\nE-mail: ${email}\nSenha provisória: ${done}\n\nPor segurança, você será solicitado a criar uma nova senha no primeiro acesso.`
    : '';

  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => { setPwd(generatePassword()); setOpen(true); }}>Definir nova senha</button>
      <Modal open={open} onClose={close} title={`Nova senha — ${name}`}>
        {!done ? (
          <div className="space-y-4">
            <p className="text-sm text-white/60">Conta: {email}. Gere uma senha provisória (ou digite a sua) e envie por um canal seguro. No primeiro acesso a pessoa será obrigada a trocá-la.</p>
            <Field label="Senha provisória" hint="Mínimo 8 caracteres, com letras e números.">
              <div className="flex gap-2">
                <input value={pwd} onChange={(e) => setPwd(e.target.value)} className="input font-mono" autoComplete="off" />
                <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setPwd(generatePassword())}>Gerar outra</button>
              </div>
            </Field>
            <div className="flex justify-end gap-3">
              <button className="btn-ghost" onClick={close}>Cancelar</button>
              <button className="btn-silver" disabled={!valid || busy} onClick={apply}>{busy ? 'Salvando…' : 'Definir senha'}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-emerald-200">✓ Senha definida. Copie a mensagem abaixo e envie para {name}. Ela não será exibida de novo.</p>
            <textarea readOnly value={message} rows={8} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <div className="flex flex-wrap justify-end gap-3">
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(message).then(() => toast('ok', 'Mensagem copiada.'))}>Copiar mensagem</button>
              <a className="btn-ghost" target="_blank" rel="noopener noreferrer" href={`mailto:${email}?subject=${encodeURIComponent('Sua nova senha — DRAGON APEX TALENT')}&body=${encodeURIComponent(message)}`}>Abrir no e-mail</a>
              <button className="btn-silver" onClick={close}>Concluir</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
