import { useEffect, useState } from 'react';
import { Loader2, ShoppingBag, X } from 'lucide-react';
import inventreeClient from '../api/inventreeClient';
import type { PurchaseOrderLine, PurchaseOrderSummary } from '../api/types';
import { DEFAULTS } from '../constants';
import { cn } from '@/lib/utils';
import ModalFrame from './ModalFrame';
import ImageDisplay from '../ImageDisplay';

interface Row {
  pk: number;
  name: string;
  image: string | null;
  packs: number;
  received: number;
  units: number;
  /** Line cost; null when neither the order nor the supplier has a price. */
  cost: number | null;
  /** True when the cost comes from the supplier price, not from the order. */
  estimated: boolean;
}

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('nl-BE', { style: 'currency', currency }).format(n);
const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString('nl-BE') : '—');

/**
 * Everything about one purchase order, also completed and cancelled ones:
 * dates, supplier, cost and every line. Quantities on a line are in packs;
 * units = packs × the supplier part's pack size.
 */
export default function PurchaseOrderDetail({ po, statusClass, onClose }: {
  po: PurchaseOrderSummary;
  statusClass: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currency = po.order_currency || DEFAULTS.CURRENCY;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      inventreeClient.getPurchaseOrderLines(po.pk),
      inventreeClient.getSupplierPartsForSupplier(po.supplier),
      inventreeClient.getSupplierCostPerPart().catch(() => ({} as Record<number, number>)),
    ]).then(([lines, supplierParts, unitCost]) => {
      if (cancelled) return;
      setRows(lines.map((l: PurchaseOrderLine) => {
        const pack = parseFloat(supplierParts.find(sp => sp.pk === l.part)?.pack_quantity ?? '1') || 1;
        const partPk = l.internal_part ?? l.part_detail?.pk ?? null;
        const perPack = l.purchase_price == null ? NaN : Number(l.purchase_price);
        const perUnit = partPk != null ? unitCost[partPk] : undefined;
        const cost = isFinite(perPack) ? perPack * l.quantity
          : perUnit !== undefined ? perUnit * pack * l.quantity
          : null;
        return {
          pk: l.pk,
          name: l.internal_part_name || l.part_detail?.name || l.sku || `Line ${l.pk}`,
          image: l.part_detail?.thumbnail || l.part_detail?.image || null,
          packs: l.quantity,
          received: l.received,
          units: l.quantity * pack,
          cost,
          estimated: !isFinite(perPack) && cost !== null,
        };
      }));
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the order'); });
    return () => { cancelled = true; };
  }, [po.pk, po.supplier]);

  const total = rows?.reduce((sum, r) => sum + (r.cost ?? 0), 0) ?? 0;
  const anyEstimated = rows?.some(r => r.estimated) ?? false;
  const anyUnknown = rows?.some(r => r.cost === null) ?? false;

  return (
    <ModalFrame onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex items-center gap-2 p-4 border-b border-lijn bg-brand-black text-white sticky top-0">
        <ShoppingBag size={16} />
        <h2 className="text-sm font-semibold flex-1">{po.reference}</h2>
        <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold">{po.supplier_detail?.name || po.supplier_name}</p>
            {po.description && <p className="text-sm text-grafiet">{po.description}</p>}
          </div>
          <span className={cn('text-xs font-semibold px-2 py-1 shrink-0', statusClass)}>{po.status_text}</span>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-lijn border border-lijn text-sm">
          {[
            ['Created', date(po.creation_date)],
            ['Issued', date(po.issue_date)],
            ['Target', date(po.target_date)],
            [po.status_text?.toLowerCase().includes('cancel') ? 'Cancelled' : 'Completed', date(po.complete_date)],
          ].map(([k, v]) => (
            <div key={k} className="bg-white p-3">
              <dt className="text-xs text-grafiet">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        {!rows && !error && (
          <p className="flex items-center gap-2 text-sm text-grafiet"><Loader2 size={14} className="animate-spin" /> Loading lines...</p>
        )}

        {rows && (
          <>
            <ul className="border border-lijn divide-y divide-lijn">
              {rows.map(r => (
                <li key={r.pk} className="flex items-center gap-3 p-3">
                  <div className="border border-lijn bg-white w-10 h-10 overflow-hidden shrink-0">
                    <ImageDisplay imagePath={r.image} alt={r.name} width={40} height={40} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold break-words">{r.name}</p>
                    <p className="text-xs text-grafiet">
                      {r.packs} {r.packs === 1 ? 'pack' : 'packs'} · {r.units} units ·{' '}
                      <span className={cn(r.received < r.packs && 'text-amber-700 font-semibold')}>
                        {r.received} of {r.packs} received
                      </span>
                    </p>
                  </div>
                  <div className="text-right text-sm font-semibold shrink-0">
                    {r.cost === null ? <span className="text-grafiet font-normal">no price</span> : (
                      <>{r.estimated && '≈ '}{money(r.cost, currency)}</>
                    )}
                  </div>
                </li>
              ))}
              {rows.length === 0 && <li className="p-4 text-sm text-grafiet">This order has no lines.</li>}
            </ul>

            <div className="flex items-baseline justify-between border-t-2 border-brand-black pt-3">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-lg font-semibold">{anyEstimated && '≈ '}{money(total, currency)}</span>
            </div>
            {(anyEstimated || anyUnknown) && (
              <p className="text-xs text-grafiet">
                {anyEstimated && '≈ no price on the order: estimated from the supplier price. '}
                {anyUnknown && 'Lines without any price are not in the total.'}
              </p>
            )}
          </>
        )}
      </div>
    </ModalFrame>
  );
}
