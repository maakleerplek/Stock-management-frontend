import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';

vi.stubEnv('VITE_INVOICE_SELLER', 'Street 1\\n9000 Gent\\nKBO 0000.000.000');
const { drawInvoice } = await import('../src/lib/invoice');

describe('invoice PDF', () => {
  it('lists the lines and the total with the seller and the customer', () => {
    const img = (f: string) => new Uint8Array(readFileSync(`public/${f}`));
    const doc = drawInvoice(new jsPDF(), {
      reference: 'SO-0042', date: new Date('2026-10-12'),
      lines: [{ name: 'Monster Ultra White', quantity: 2, unitPrice: 3 }, { name: 'Laser time (min)', quantity: 30, unitPrice: 0.5 }],
    }, 'Jane Doe\nStreet 2, 9000 Gent', img('invoice-logo.png'), img('invoice-wordmark.png'));
    const pdf = doc.output();
    for (const text of ['Factuur', 'SO-0042', 'Jane Doe', 'Monster Ultra White', '21,00', 'KBO 0000.000.000']) expect(pdf).toContain(text);
    if (process.env.INVOICE_OUT) writeFileSync(process.env.INVOICE_OUT, Buffer.from(doc.output('arraybuffer')));
  });
});
