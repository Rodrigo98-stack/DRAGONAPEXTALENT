import { useState, type FormEvent } from 'react';
import { db } from '../lib/supabase';
import { humanError } from '../lib/format';
import { generatePassword } from '../lib/password';
import { AREAS, UFS } from '../lib/constants';
import { Field, Modal } from './ui';
import { useToast } from './Toast';

/** O administrador cria a conta de um profissional ou de uma empresa com senha provisória (sem e-mail). */
export function CreateAccountButton({ role, onCreated }: { role: 'professional' | 'company'; onCreated?: () => void }) {
  const toast = useToast();
  const company = role === 'company';
  const label = company ? 'Criar conta de empresa' : 'Criar conta de profissional';
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; email: string; pwd: string } | null>(null);

  const close = () => { setOpen(false); setDone(null); };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    const { error } = await db().rpc('admin_create_user', {
      p_email: f.email, p_full_name: f.full_name, p_phone: f.phone, p_role: role, p_password: pwd,
      p_company: company ? { name: f.company_name, cnpj: (f.cnpj ?? '').replace(/\D/g, ''), sector: f.sector, city: f.city, state: f.state, responsible_role: f.responsible_role } : null,
    });
    setBusy(false);
    if (error) return toast('error', humanError(error));
    setDone({ name: f.full_name, email: f.email.trim().toLowerCase(), pwd });
    onCreated?.();
  };

  const message = done
    ? `Olá, ${done.name.split(' ')[0]}! Sua conta na DRAGON APEX TALENT foi criada.\n\nSite: ${location.origin}/entrar\nE-mail: ${done.email}\nSenha provisória: ${done.pwd}\n\nNo primeiro acesso você vai criar uma senha só sua e aceitar os Termos de Uso e a Política de Privacidade.`
    : '';

  return (
    <>
      <button type="button" className="btn-silver btn-sm" onClick={() => { setPwd(generatePassword()); setOpen(true); }}>+ {label}</button>
      <Modal open={open} onClose={close} title={label} wide>
        {!done ? (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <p className="text-xs text-white/50 sm:col-span-2">A conta nasce com o e-mail confirmado pela administração e senha provisória. No primeiro acesso a pessoa troca a senha e aceita os Termos e a Política de Privacidade (o aceite nunca é registrado em nome dela).</p>
            {company && <>
              <Field label="Nome da empresa *"><input name="company_name" required className="input" /></Field>
              <Field label="CNPJ"><input name="cnpj" inputMode="numeric" className="input" /></Field>
            </>}
            <Field label={company ? 'Responsável *' : 'Nome completo *'}><input name="full_name" required minLength={3} className="input" /></Field>
            <Field label="E-mail *"><input name="email" type="email" required className="input" /></Field>
            <Field label="Telefone / WhatsApp"><input name="phone" inputMode="tel" className="input" /></Field>
            {company && <>
              <Field label="Cargo do responsável"><input name="responsible_role" className="input" /></Field>
              <Field label="Setor"><select name="sector" className="input" defaultValue=""><option value="">Selecione</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
              <Field label="Cidade"><input name="city" className="input" /></Field>
              <Field label="Estado"><select name="state" className="input" defaultValue=""><option value="">UF</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Field>
            </>}
            <Field label="Senha provisória *" hint="Mínimo 8 caracteres, com letras e números." className="sm:col-span-2">
              <div className="flex gap-2">
                <input value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} className="input font-mono" autoComplete="off" />
                <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setPwd(generatePassword())}>Gerar outra</button>
              </div>
            </Field>
            <div className="flex justify-end gap-3 sm:col-span-2">
              <button type="button" className="btn-ghost" onClick={close}>Cancelar</button>
              <button className="btn-silver" disabled={busy}>{busy ? 'Criando…' : 'Criar conta'}</button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-emerald-200">✓ Conta criada. Envie a mensagem abaixo para {done.name}. A senha não será exibida de novo.</p>
            <textarea readOnly value={message} rows={9} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <div className="flex flex-wrap justify-end gap-3">
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(message).then(() => toast('ok', 'Mensagem copiada.'))}>Copiar mensagem</button>
              <a className="btn-ghost" target="_blank" rel="noopener noreferrer" href={`mailto:${done.email}?subject=${encodeURIComponent('Sua conta — DRAGON APEX TALENT')}&body=${encodeURIComponent(message)}`}>Abrir no e-mail</a>
              <button className="btn-silver" onClick={close}>Concluir</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
