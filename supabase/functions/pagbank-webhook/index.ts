// Edge Function: recebe a notificação de PIX pago e confirma a transação correspondente.
// PENDENTE DE INTEGRAÇÃO EXTERNA: o formato exato do corpo depende do produto PagBank contratado
// (API de Pedidos/Cobranças). Ajuste `extract()` conforme a documentação da sua conta.
//
// Deploy:  supabase functions deploy pagbank-webhook --no-verify-jwt
// Segredos: supabase secrets set PAGBANK_WEBHOOK_TOKEN=... (o mesmo token configurado na URL do webhook)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Paid = { txid: string; externalId: string; amount: number };

function extract(body: any): Paid | null {
  // Formato típico de pedido PagBank: reference_id = nosso txid, charges[0].amount.value em centavos.
  const charge = body?.charges?.[0];
  if (!charge || charge.status !== 'PAID') return null;
  return { txid: body.reference_id, externalId: charge.id, amount: Number(charge.amount?.value) / 100 };
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token');
  if (!token || token !== Deno.env.get('PAGBANK_WEBHOOK_TOKEN')) return new Response('forbidden', { status: 403 });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const paid = extract(await req.json().catch(() => null));
  if (!paid) return new Response('ignored', { status: 200 });

  const { data, error } = await supabase.rpc('webhook_confirm_pix', {
    p_txid: paid.txid, p_external_id: paid.externalId, p_amount: paid.amount,
  });
  if (error) return new Response(error.message, { status: 500 });
  return new Response(data ? 'confirmed' : 'not matched', { status: 200 });
});
