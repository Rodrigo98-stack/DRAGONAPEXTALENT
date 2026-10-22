import { useState, type FormEvent } from 'react';
import { PageHeader, Field } from '../../components/ui';
import { ConfigNotice } from '../../components/ConfigNotice';
import { useToast } from '../../components/Toast';
import { db, isConfigured } from '../../lib/supabase';
import { humanError } from '../../lib/format';
import { CONTACT } from '../../lib/constants';

export default function Contact() {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSending(true);
    const { error } = await db().from('contact_messages').insert({
      name: String(f.get('name')).trim(), email: String(f.get('email')).trim(), phone: String(f.get('phone') || '') || null,
      subject: String(f.get('subject')).trim(), message: String(f.get('message')).trim(),
    });
    setSending(false);
    if (error) return toast('error', humanError(error));
    setSent(true);
  };

  return (
    <>
      <PageHeader eyebrow="Contato" title="Vamos conversar.">
        Dúvidas sobre vagas, parcerias ou cursos? Envie sua mensagem — nossa equipe responde pelo e-mail informado.
      </PageHeader>
      <section className="container-x grid gap-12 py-16 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6 text-sm text-white/60">
          <div><div className="eyebrow mb-2">Base</div>{CONTACT.city}</div>
          <div><div className="eyebrow mb-2">Atendimento</div>Pelo formulário ao lado. As mensagens ficam registradas no painel administrativo.</div>
        </div>
        {sent ? (
          <div className="card-silver p-10 text-center">
            <div className="font-display text-3xl text-silver-light">Mensagem recebida.</div>
            <p className="mt-3 text-white/60">Obrigado pelo contato. Retornaremos em breve.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
            <Field label="Nome *"><input name="name" required minLength={2} maxLength={120} className="input" autoComplete="name" /></Field>
            <Field label="E-mail *"><input name="email" type="email" required className="input" autoComplete="email" /></Field>
            <Field label="Telefone / WhatsApp"><input name="phone" className="input" autoComplete="tel" /></Field>
            <Field label="Assunto *"><input name="subject" required maxLength={160} className="input" /></Field>
            <Field label="Mensagem *" className="sm:col-span-2"><textarea name="message" required minLength={10} maxLength={4000} rows={6} className="input" /></Field>
            <div className="sm:col-span-2 space-y-3">
              <ConfigNotice compact />
              <button disabled={!isConfigured || sending} className="btn-silver">{sending ? 'Enviando…' : 'Enviar mensagem'}</button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
