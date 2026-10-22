import { describe, expect, it } from 'vitest';
import { buildPixPayload, crc16, isValidPixPayload, parseTlv } from './pix';

const BASE =
  '00020126360014br.gov.bcb.pix01146880890400018127600016BR.COM.PAGSEGURO013629C47361-ACA6-4184-9F67-A9BFC61895205204731153039865802BR592568.808.904 RODRIGO CARNEI6006Recife62290525PAGS0000000002610220145856304BEAB';

describe('PIX BR Code', () => {
  it('reconhece o CRC do payload PagBank fornecido', () => {
    expect(crc16(BASE.slice(0, -4))).toBe('BEAB');
    expect(isValidPixPayload(BASE)).toBe(true);
  });

  it('mantém a chave e o recebedor ao injetar valor e txid', () => {
    const out = buildPixPayload(BASE, 0.15, 'DATABC123');
    const f = Object.fromEntries(parseTlv(out).map((x) => [x.id, x.value]));
    expect(f['26']).toContain('68808904000181');
    expect(f['54']).toBe('0.15');
    expect(f['59']).toBe('68.808.904 RODRIGO CARNEI');
    expect(parseTlv(f['62'])[0]).toEqual({ id: '05', value: 'DATABC123' });
    expect(isValidPixPayload(out)).toBe(true);
  });

  it('formata publicação de vaga (dias × R$ 1,00)', () => {
    const out = buildPixPayload(BASE, 10, 'DAT1');
    expect(parseTlv(out).find((x) => x.id === '54')?.value).toBe('10.00');
  });

  it('recusa valor zero', () => {
    expect(() => buildPixPayload(BASE, 0, 'X')).toThrow();
  });
});
