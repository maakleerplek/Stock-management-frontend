/**
 * Purchase order (bestelbon) PDF, to send an order to the supplier or to
 * whoever pays for it. Same look as the invoice (lib/invoice.ts).
 */
import type { jsPDF as JsPDF } from 'jspdf';
import { PAYMENT } from '../constants';

export interface PurchaseOrderPdfLine { name: string; sku?: string | null; quantity: number; unitPrice: number | null }
export interface PurchaseOrderPdf {
  reference: string;
  date: Date;
  supplier: string;
  description?: string | null;
  currency: string;
  lines: PurchaseOrderPdfLine[];
}

export function drawPurchaseOrder(doc: JsPDF, po: PurchaseOrderPdf, logo?: Uint8Array, wordmark?: Uint8Array): JsPDF {
  const money = (n: number) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: po.currency }).format(n).replace(/\u00a0/g, ' ');
  const x = 20, right = 190;
  let y = 25;
  if (logo) doc.addImage(logo, 'PNG', x, y - 8, 16, 16);
  const tx = logo ? x + 20 : x;
  if (wordmark) doc.addImage(wordmark, 'PNG', tx, y - 8, 47, 13.2);
  else doc.setFont('helvetica', 'bold').setFontSize(18).text(PAYMENT.INVOICE_SELLER_NAME, tx, y - 1);
  doc.setFont('helvetica', 'bold').setFontSize(12).text('Bestelbon', x, y + 18);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  const seller = [PAYMENT.INVOICE_SELLER_NAME, ...PAYMENT.INVOICE_SELLER.split('\n').filter(Boolean)];
  y -= 5;
  for (const line of seller) doc.text(line, right, (y += 5), { align: 'right' });

  y = 48;
  doc.setFontSize(10).text(`Nummer: ${po.reference}`, x, y);
  doc.text(`Datum: ${po.date.toLocaleDateString('nl-BE')}`, x, y + 6);
  y = Math.max(y + 18, 20 + 5 * (seller.length + 1) + 10);
  doc.setFont('helvetica', 'bold').text('Leverancier', x, y);
  doc.setFont('helvetica', 'normal').text(po.supplier, x, (y += 5));
  if (po.description) for (const line of doc.splitTextToSize(po.description, right - x)) doc.text(line, x, (y += 5));
  y += 12;

  const cols = [x, 125, 150, right];
  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.text('Omschrijving', cols[0], y);
    doc.text('Aantal', cols[1], y, { align: 'right' });
    doc.text('Prijs', cols[2], y, { align: 'right' });
    doc.text('Totaal', cols[3], y, { align: 'right' });
    doc.line(x, y + 2, right, y + 2);
    doc.setFont('helvetica', 'normal');
    y += 8;
  };
  header();
  for (const l of po.lines) {
    doc.setFontSize(10).text(doc.splitTextToSize(l.name, 95)[0], cols[0], y);
    doc.text(String(l.quantity), cols[1], y, { align: 'right' });
    doc.text(l.unitPrice === null ? '—' : money(l.unitPrice), cols[2], y, { align: 'right' });
    doc.text(l.unitPrice === null ? '—' : money(l.unitPrice * l.quantity), cols[3], y, { align: 'right' });
    if (l.sku) doc.setFontSize(8).setTextColor(110).text(l.sku, cols[0], y + 4).setTextColor(0);
    y += l.sku ? 10 : 6;
    if (y > 270) { doc.addPage(); y = 25; header(); }
  }
  doc.setFontSize(10).line(x, y - 3, right, y - 3);
  const priced = po.lines.filter(l => l.unitPrice !== null);
  doc.setFont('helvetica', 'bold').text('Totaal', cols[2], y + 3, { align: 'right' });
  doc.text(money(priced.reduce((s, l) => s + (l.unitPrice ?? 0) * l.quantity, 0)), cols[3], y + 3, { align: 'right' });
  if (priced.length < po.lines.length) {
    doc.setFont('helvetica', 'normal').setFontSize(9).text('Lijnen zonder prijs (—) zitten niet in het totaal.', x, y + 13);
  }
  return doc;
}

export async function downloadPurchaseOrder(po: PurchaseOrderPdf): Promise<void> {
  const { jsPDF } = await import('jspdf');   // only loaded when someone exports
  const image = (path: string) => fetch(path).then(r => r.ok ? r.arrayBuffer() : undefined).then(b => b && new Uint8Array(b)).catch(() => undefined);
  const [logo, wordmark] = await Promise.all([image('/invoice-logo.png'), image('/invoice-wordmark.png')]);
  drawPurchaseOrder(new jsPDF(), po, logo, wordmark).save(`bestelbon-${po.reference}.pdf`);
}
