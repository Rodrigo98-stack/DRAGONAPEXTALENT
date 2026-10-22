// Edge Function: cadastro público de profissional ou empresa SEM depender do envio de e-mail.
// O e-mail padrão do Supabase tem limite de envios por hora para o projeto inteiro; com esta função o cliente
// cria a conta e entra na hora. Proteções: honeypot, limite generoso por IP, validação no servidor e
// aceite obrigatório dos termos. O e-mail NÃO é verificado (marca `email_unverified` em app_metadata);
// ao configurar um SMTP próprio, volte ao signUp padrão do Supabase se quiser verificação.
//
// Deploy: supabase functions deploy signup --no-verify-jwt   (o site chama sem login prévio)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED_ORIGINS = ['https://dragon-apex-talent.netlify.app', 'http://localhost:5180', 'http://localhost:3000'];
const MAX_PER_HOUR_PER_IP = 30;

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'metodo_invalido' }, 405, origin);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'dados_invalidos' }, 400, origin);

  // honeypot: robôs preenchem o campo escondido; respondemos "ok" sem criar nada
  if (str(body.website_hp)) return json({ ok: true }, 200, origin);

  const role = body.role === 'company' ? 'company' : body.role === 'professional' ? 'professional' : null;
  const email = str(body.email, 254).toLowerCase();
  const fullName = str(body.full_name, 120);
  const phone = str(body.phone, 30);
  const password = typeof body.password === 'string' ? body.password : '';
  const company = body.company && typeof body.company === 'object' ? body.company as Record<string, unknown> : {};

  if (!role) return json({ error: 'papel_invalido' }, 400, origin);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'email_invalido' }, 400, origin);
  if (fullName.split(/\s+/).length < (role === 'company' ? 1 : 2) || fullName.length < 3) return json({ error: 'nome_invalido' }, 400, origin);
  if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return json({ error: 'senha_fraca' }, 400, origin);
  if (body.terms !== true) return json({ error: 'termos_nao_aceitos' }, 400, origin);
  if (role === 'company' && str(company.name, 160).length < 2) return json({ error: 'empresa_sem_nome' }, 400, origin);

  // limite generoso por IP (impede apenas abuso automatizado)
  const ip = (req.headers.get('x-forwarded-for') ?? 'desconhecido').split(',')[0].trim();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from('signup_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_HOUR_PER_IP) return json({ error: 'muitas_tentativas' }, 429, origin);
  await admin.from('signup_attempts').insert({ ip });
  if (Math.random() < 0.02) await admin.from('signup_attempts').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { self_signup: true, email_unverified: true },
    user_metadata: {
      role, full_name: fullName, phone, lgpd_consent: true,
      company: role === 'company' ? {
        name: str(company.name, 160), cnpj: str(company.cnpj, 20).replace(/\D/g, ''), responsible_role: str(company.responsible_role, 80),
        whatsapp: str(company.whatsapp, 30), city: str(company.city, 80), state: str(company.state, 2), sector: str(company.sector, 80),
        website: str(company.website, 200), description: str(company.description, 1000), terms_accepted: true,
      } : undefined,
    },
  });

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('already') || (error as { code?: string }).code === 'email_exists') return json({ error: 'email_ja_cadastrado' }, 409, origin);
    console.error('signup error', error.message);
    return json({ error: 'falha_cadastro' }, 500, origin);
  }
  return json({ ok: true }, 200, origin);
});
