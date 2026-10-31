/**
 * Receipt (betalingsbewijs) PDF for a till sale, made in the browser. Not an
 * invoice: that needs a proper invoice form. The sales order reference is the number.
 */
import type { jsPDF as JsPDF } from 'jspdf';
import { PAYMENT } from '../constants';

export interface InvoiceLine { name: string; quantity: number; unitPrice: number }
export interface Invoice { reference: string; date: Date; lines: InvoiceLine[] }

const eur = (n: number) => `€ ${n.toFixed(2).replace('.', ',')}`;

/** Draws the invoice on a fresh A4 document; `customer` is free text (name, address, VAT nr). */
/** `logo` = the HTL cube, `wordmark` = the maakleerplek hightechlab name (public/invoice-*.png). */
export function drawInvoice(doc: JsPDF, inv: Invoice, customer: string, logo?: Uint8Array, wordmark?: Uint8Array): JsPDF {
  const x = 20, right = 190;
  let y = 25;
  if (logo) doc.addImage(logo, 'PNG', x, y - 8, 16, 16);
  const tx = logo ? x + 20 : x;
  if (wordmark) doc.addImage(wordmark, 'PNG', tx, y - 8, 47, 13.2);   // 1738 × 488 px
  else doc.setFont('helvetica', 'bold').setFontSize(18).text(PAYMENT.INVOICE_SELLER_NAME, tx, y - 1);
  doc.setFont('helvetica', 'bold').setFontSize(12).text('Betalingsbewijs', x, y + 18);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  y -= 5;
  for (const line of [PAYMENT.INVOICE_SELLER_NAME, ...PAYMENT.INVOICE_SELLER.split('\n').filter(Boolean), `IBAN ${PAYMENT.IBAN}`]) {
    y += 5;
    doc.text(line, right, y, { align: 'right' });
  }

  y = 48;
  doc.setFontSize(10).text(`Nummer: ${inv.reference}`, x, y);
  doc.text(`Datum: ${inv.date.toLocaleDateString('nl-BE')}`, x, y + 6);
  y = Math.max(y + 18, 20 + 5 * (PAYMENT.INVOICE_SELLER.split('\n').filter(Boolean).length + 2) + 10);
  if (customer.trim()) {
    doc.setFont('helvetica', 'bold').text('Klant', x, y);
    doc.setFont('helvetica', 'normal');
    for (const line of customer.trim().split('\n')) doc.text(line, x, (y += 5));
    y += 10;
  }

  const cols = [x, 125, 150, right];
  doc.setFont('helvetica', 'bold');
  doc.text('Omschrijving', cols[0], y);
  doc.text('Aantal', cols[1], y, { align: 'right' });
  doc.text('Prijs', cols[2], y, { align: 'right' });
  doc.text('Totaal', cols[3], y, { align: 'right' });
  doc.line(x, y + 2, right, y + 2);
  doc.setFont('helvetica', 'normal');
  y += 8;
  for (const l of inv.lines) {
    doc.text(doc.splitTextToSize(l.name, 95)[0], cols[0], y);
    doc.text(String(l.quantity), cols[1], y, { align: 'right' });
    doc.text(eur(l.unitPrice), cols[2], y, { align: 'right' });
    doc.text(eur(l.unitPrice * l.quantity), cols[3], y, { align: 'right' });
    y += 6;
    if (y > 270) { doc.addPage(); y = 25; }
  }
  doc.line(x, y - 3, right, y - 3);
  doc.setFont('helvetica', 'bold').text('Totaal', cols[2], y + 3, { align: 'right' });
  doc.text(eur(inv.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)), cols[3], y + 3, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9);
  if (PAYMENT.INVOICE_NOTE) doc.text(doc.splitTextToSize(PAYMENT.INVOICE_NOTE, right - x), x, y + 15);
  return doc;
}

export async function downloadInvoice(inv: Invoice, customer: string): Promise<void> {
  const { jsPDF } = await import('jspdf');   // only loaded when someone asks for a receipt
  const image = (path: string) => fetch(path).then(r => r.ok ? r.arrayBuffer() : undefined).then(b => b && new Uint8Array(b)).catch(() => undefined);
  const [logo, wordmark] = await Promise.all([image('/invoice-logo.png'), image('/invoice-wordmark.png')]);
  drawInvoice(new jsPDF(), inv, customer, logo, wordmark).save(`betalingsbewijs-${inv.reference}.pdf`);
}
