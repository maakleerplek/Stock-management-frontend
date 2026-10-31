import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { drawPurchaseOrder } from '../src/lib/purchaseOrderPdf';

describe('purchase order PDF', () => {
  it('lists the lines with SKU, a total of the priced lines and a note for unpriced ones', () => {
    const pdf = drawPurchaseOrder(new jsPDF(), {
      reference: 'PO-98627', date: new Date('2026-10-31'), supplier: 'FormFutura', currency: 'EUR',
      description: 'Filament', lines: [
        { name: 'PETG Black (1 kg)', sku: 'BPTG-175BLCK-01000', quantity: 2, unitPrice: 9.04 },
        { name: 'ASA Black (1 kg)', quantity: 1, unitPrice: null },
      ],
    }).output();
    for (const t of ['Bestelbon', 'PO-98627', 'FormFutura', 'PETG Black', 'BPTG-175BLCK-01000', '18,08', 'zonder prijs']) expect(pdf).toContain(t);
  });
});
