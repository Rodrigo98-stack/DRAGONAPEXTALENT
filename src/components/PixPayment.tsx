import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { db } from '../lib/supabase';
import { buildPixPayload } from '../lib/pix';
import { useSettings } from '../lib/useSettings';
import { money, humanError } from '../lib/format';
import { CHARGE_KIND, CHARGE_STATUS } from '../lib/constants';
import type { Transaction } from '../lib/types';
import { Badge } from './ui';
import { useToast } from './Toast';

/** Tela de pagamento: somente PIX (QR Code + Copia e Cola) com o valor exato da cobrança. */
export function PixPayment({ tx: initial, onConfirmed }: { tx: Transaction; onConfirmed?: () => void }) {
  const settings = useSettings();
  const toast = useToast();
  const [tx, setTx] = useState(initial);
  const [qr, setQr] = useState('');
  const [payload, setPayload] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!settings.pix_base_payload) return;
    try {
      const p = buildPixPayload(settings.pix_base_payload, Number(tx.amount), tx.txid);
      setPayload(p);
      QRCode.toDataURL(p, { margin: 1, width: 560, color: { dark: '#0A0A0A', light: '#FFFFFF' } }).then(setQr);
    } catch (e) { toast('error', humanError(e)); }
  }, [settings.pix_base_payload, tx.amount, tx.txid, toast]);

  // Acompanha a confirmação (manual pelo admin ou via webhook PagBank).
  useEffect(() => {
    if (tx.status !== 'awaiting') return;
    const id = setInterval(async () => {
      const { data } = await db().from('transactions').select('*').eq('id', tx.id).single();
      if (data && data.status !== tx.status) {
        setTx(data as Transaction);
        if (data.status === 'confirmed') { toast('ok', 'Pagamento confirmado!'); onConfirmed?.(); }
      }
    }, 10000);
    return () => clearInterval(id);
  }, [tx.id, tx.status, onConfirmed, toast]);

  const copy = async () => {
    await navigator.clipboard.writeText(payload);
    toast('ok', 'Código Pix Copia e Cola copiado.');
  };

  const uploadProof = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return toast('error', 'Arquivo acima de 5 MB.');
    setUploading(true);
    try {
      const path = `${tx.user_id}/${tx.id}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await db().storage.from('payment-proofs').upload(path, file, { contentType: file.type });
      if (error) throw error;
      const r = await db().rpc('attach_payment_proof', { p_tx: tx.id, p_path: path });
      if (r.error) throw r.error;
      setTx({ ...tx, proof_path: path });
      toast('ok', 'Comprovante enviado. A equipe fará a conferência.');
    } catch (e) { toast('error', humanError(e)); } finally { setUploading(false); }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[240px_1fr]">
      <div className="rounded-2xl bg-white p-3">
        {qr ? <img src={qr} alt="QR Code PIX" className="aspect-square w-full" /> : <div className="aspect-square animate-pulse rounded-xl bg-black/10" />}
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tx.status === 'confirmed' ? 'ok' : tx.status === 'awaiting' ? 'warn' : 'bad'}>{CHARGE_STATUS[tx.status]}</Badge>
          <span className="text-xs text-white/40">Ref. {tx.txid}</span>
        </div>
        <div>
          <div className="text-xs text-white/50">{CHARGE_KIND[tx.kind]}</div>
          <div className="font-display text-4xl text-silver-light">{money(tx.amount)}</div>
          {settings.pix_receiver_name && <div className="mt-1 text-xs text-white/45">Recebedor: {settings.pix_receiver_name}</div>}
        </div>
        <div>
          <span className="label">Pix Copia e Cola</span>
          <div className="flex gap-2">
            <input readOnly value={payload} className="input font-mono text-[11px]" aria-label="Código Pix Copia e Cola" onFocus={(e) => e.currentTarget.select()} />
            <button onClick={copy} disabled={!payload} className="btn-silver btn-sm shrink-0">Copiar</button>
          </div>
        </div>
        <ol className="space-y-1 text-xs text-white/55">
          <li>1. Abra o app do seu banco e escolha pagar com PIX (QR Code ou Copia e Cola).</li>
          <li>2. Confira o valor exato e o recebedor antes de confirmar.</li>
          <li>3. A liberação acontece após a confirmação do pagamento — nunca antes.</li>
        </ol>
        {tx.status === 'awaiting' && (
          <label className="btn-ghost btn-sm w-fit cursor-pointer">
            {uploading ? 'Enviando…' : tx.proof_path ? '✓ Comprovante enviado — substituir' : 'Enviar comprovante (opcional)'}
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && uploadProof(e.target.files[0])} />
          </label>
        )}
      </div>
    </div>
  );
}
