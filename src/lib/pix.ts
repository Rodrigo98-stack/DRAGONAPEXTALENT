// Gerador de BR Code PIX (padrão EMV-QRCPS do Banco Central).
// Parte do payload estático configurado no admin e injeta o valor exato (campo 54)
// e o identificador da cobrança (campo 62.05), recalculando o CRC16.

export type Tlv = { id: string; value: string };

export function parseTlv(payload: string): Tlv[] {
  const out: Tlv[] = [];
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || Number.isNaN(len)) throw new Error('Payload PIX inválido');
    out.push({ id, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

export function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error(`Campo ${id} longo demais`);
  return id + String(value.length).padStart(2, '0') + value;
}

// CRC16-CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF), exigido pelo BR Code.
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function isValidPixPayload(payload: string): boolean {
  if (!payload.includes('6304') || payload.length < 8) return false;
  const body = payload.slice(0, -4);
  return body.endsWith('6304') && crc16(body) === payload.slice(-4).toUpperCase();
}

/** Monta o "Pix Copia e Cola" com valor e txid. txid: até 25 caracteres alfanuméricos. */
export function buildPixPayload(base: string, amount: number, txid: string): string {
  if (!(amount > 0)) throw new Error('Valor inválido');
  const safeTxid = txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const fields = parseTlv(base).filter((f) => f.id !== '63' && f.id !== '54');

  const additional = fields.find((f) => f.id === '62');
  const sub = additional ? parseTlv(additional.value).filter((s) => s.id !== '05') : [];
  sub.unshift({ id: '05', value: safeTxid });
  const field62: Tlv = { id: '62', value: sub.map((s) => tlv(s.id, s.value)).join('') };

  const merged = [...fields.filter((f) => f.id !== '62'), { id: '54', value: amount.toFixed(2) }, field62];
  merged.sort((a, b) => Number(a.id) - Number(b.id));
  const body = merged.map((f) => tlv(f.id, f.value)).join('') + '6304';
  return body + crc16(body);
}
