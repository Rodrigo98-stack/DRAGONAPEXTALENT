-- Confirmação automática de PIX (PagBank). Chamada SOMENTE pela Edge Function `pagbank-webhook`
-- com a service_role key; nenhum usuário do site consegue executá-la.
create or replace function public.webhook_confirm_pix(p_txid text, p_external_id text, p_amount numeric)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_tx public.transactions;
begin
  select * into v_tx from public.transactions where txid = p_txid for update;
  if not found or v_tx.status <> 'awaiting' then return false; end if;
  if p_amount is distinct from v_tx.amount then
    perform public._audit('pix_amount_mismatch', 'transactions', v_tx.id::text,
      jsonb_build_object('esperado', v_tx.amount, 'recebido', p_amount));
    return false;
  end if;
  perform public._apply_confirmed(v_tx, null, 'Confirmado via webhook PagBank', p_external_id);
  return true;
end; $$;
revoke execute on function public.webhook_confirm_pix(text, text, numeric) from public, anon, authenticated;
