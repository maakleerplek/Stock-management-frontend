import { useMemo } from 'react';
import { useStock } from '../StockContext';
import ImageDisplay from '../ImageDisplay';
import { cn, displayName } from '../lib/utils';
import { pickerCategories, pickerItems } from '../lib/picker';
import type { ItemData } from '../api/types';

// The kiosk's category colours (Interface-stock kiosk/src/lib.rs category_colors): light / deep.
function tone(category: string | null): { light: string; deep: string } {
    if (!category) return { light: 'bg-brand-accent', deep: 'bg-grafiet' };
    if (/drink|drank/i.test(category)) return { light: 'bg-blue-200', deep: 'bg-blue-600' };
    if (/filament/i.test(category)) return { light: 'bg-emerald-300', deep: 'bg-emerald-600' };
    if (/wood|hout/i.test(category)) return { light: 'bg-amber-300', deep: 'bg-amber-700' };
    return { light: 'bg-purple-300', deep: 'bg-[#4B3A7A]' };
}

/** Tap to add, like the touch kiosk: category sections, then the products of the chosen one. */
export default function ProductPicker({ category, onCategory, onAdd }: {
    category: string | null;
    onCategory: (category: string | null) => void;
    onAdd: (item: ItemData) => void;
}) {
    const { items } = useStock();
    const categories = useMemo(() => pickerCategories(items), [items]);
    const shown = useMemo(() => pickerItems(items, category), [items, category]);
    if (!categories.length) return null;
    return (
        <section id="product-picker" aria-label="Pick a product" className="w-full max-w-3xl space-y-3">
            <h3 className="text-lg font-semibold">No barcode? Tap what you take</h3>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
                {[null, ...categories].map(c => {
                    const t = tone(c), on = c === category;
                    return (
                        <button key={c ?? 'all'} onClick={() => onCategory(c)} aria-pressed={on}
                            className={cn('h-12 px-4 border border-lijn text-sm font-semibold',
                                on ? cn(t.deep, 'text-white') : cn(t.light, 'text-brand-black hover:brightness-95'))}>
                            {c ?? 'All'}
                        </button>
                    );
                })}
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                {shown.map(item => (
                    <li key={item.id}>
                        <button onClick={() => onAdd(item)} aria-label={`Add ${displayName(item.name)}, €${item.price.toFixed(2)}`}
                            className="w-full h-full min-h-28 flex flex-col text-left border border-lijn bg-white hover:bg-brand-beige-dark active:scale-[0.98] transition-transform">
                            <span className={cn('h-1.5 w-full', tone(item.category).deep)} aria-hidden />
                            <span className="flex gap-2 p-2 flex-1">
                                <span className="w-12 h-12 shrink-0 border border-lijn overflow-hidden bg-brand-beige-dark flex items-center justify-center">
                                    {item.image
                                        ? <ImageDisplay imagePath={item.image} alt="" width={48} height={48} />
                                        : <span className="text-sm font-semibold text-grafiet">{displayName(item.name).slice(0, 2).toUpperCase()}</span>}
                                </span>
                                <span className="min-w-0 flex flex-col">
                                    <span className="text-sm font-semibold leading-tight line-clamp-2">{displayName(item.name)}</span>
                                    <span className="text-base font-semibold tabular-nums mt-auto">€{item.price.toFixed(2)}</span>
                                </span>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
