import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Sem as variáveis de ambiente o site institucional funciona, mas login, cadastros e dados ficam
 *  explicitamente marcados como "pendente de integração". Nada é simulado. */
export const isConfigured = Boolean(url && anon && !url.includes('SEU-PROJETO'));

export const supabase: SupabaseClient | null = isConfigured ? createClient(url!, anon!) : null;

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase não configurado. Preencha .env.local (veja o README).');
  return supabase;
}
