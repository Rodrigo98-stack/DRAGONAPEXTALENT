import { isConfigured } from '../lib/supabase';

/** Aviso honesto: sem backend configurado, nada é simulado. */
export function ConfigNotice({ compact }: { compact?: boolean }) {
  if (isConfigured) return null;
  if (compact)
    return (
      <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs text-amber-100/90">
        <strong className="font-semibold">Pendente de integração externa:</strong> conecte o Supabase (arquivo <code>.env.local</code>) para ativar esta função.
      </p>
    );
  return (
    <div className="card mx-auto max-w-xl border-amber-400/25 p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-amber-300/40 text-amber-200">!</div>
      <h2 className="font-display text-2xl">Plataforma em configuração</h2>
      <p className="mt-3 text-sm leading-relaxed text-white/60">
        Cadastros, login, vagas, pagamentos e painéis funcionam sobre o banco de dados Supabase, que ainda não foi conectado
        a este ambiente. Assim que as chaves forem configuradas (veja o README), esta área passa a operar com dados reais.
      </p>
    </div>
  );
}
