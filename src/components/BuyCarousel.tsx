import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useStock } from '../StockContext';
import ImageDisplay from '../ImageDisplay';
import { displayName } from '../lib/utils';
import type { ItemData } from '../api/types';

const ROTATE_MS = 6000;
// Drinks first, then wood (for the lasercutter); other stock is not advertised.
const rank = (i: ItemData) => (/drink|drank/i.test(i.category) ? 0 : /wood|hout/i.test(i.category) ? 1 : 2);

/** "Want to buy?": one item for sale at a time, drinks then wood. Add to cart works like a scan. */
export default function BuyCarousel({ onAdd }: { onAdd: (item: ItemData) => void }) {
    const { items } = useStock();
    const picks = useMemo(() => items
        .filter(i => i.quantity > 0 && i.price > 0 && rank(i) < 2)
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)), [items]);
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const still = useReducedMotion();

    useEffect(() => {
        if (picks.length < 2 || paused || still) return;
        const t = setInterval(() => setIndex(n => (n + 1) % picks.length), ROTATE_MS);
        return () => clearInterval(t);
    }, [picks.length, paused, still]);

    const item = picks[index % Math.max(1, picks.length)];
    if (!item) return null;
    return (
        <section
            aria-label="Want to buy?"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className="w-full max-w-md border border-lijn bg-white"
        >
            <div className="flex items-center gap-3 p-3">
                <div className="w-16 h-16 shrink-0 border border-lijn overflow-hidden bg-brand-beige-dark">
                    <ImageDisplay imagePath={item.image} alt="" width={64} height={64} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-grafiet">Want to buy? {rank(item) === 0 ? 'A drink' : 'Wood for the laser'}</p>
                    <p className="font-semibold leading-tight line-clamp-2">{displayName(item.name)}</p>
                    <p className="text-lg font-semibold tabular-nums">€{item.price.toFixed(2)}</p>
                </div>
                <button
                    onClick={() => onAdd(item)}
                    className="brutalist-button h-11 px-3 bg-emerald-400 text-brand-black text-sm font-semibold flex items-center gap-1.5 shrink-0"
                >
                    <Plus size={16} aria-hidden /> Add to cart
                </button>
            </div>
            {picks.length > 1 && (
                <div className="flex gap-1 px-3 pb-2" aria-hidden>
                    {picks.slice(0, 12).map((p, i) => (
                        <span key={p.id} className={i === index % picks.length ? 'h-1 flex-1 bg-brand-black' : 'h-1 flex-1 bg-lijn'} />
                    ))}
                </div>
            )}
        </section>
    );
}
