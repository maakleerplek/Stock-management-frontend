import { useState, useEffect, useMemo } from 'react';
import { X, Zap, Drill, Printer, Plus } from 'lucide-react';
import { PRICING } from './constants';
import { isFilament, filamentType, priced, topUp, extraLabel, type ExtraLine } from './sendCodeHandler';
import { useStock } from './StockContext';
import { inventreeClient } from './api/inventreeClient';
import { cutPreviewUrl, laserMinutes, shortDuration, type LaserSession } from './lib/laserApi';
import { cn } from './lib/utils';

/** Machine time added by hand survives a refresh, like the cart. Cleared after a sale. */
export const EXTRAS_STORAGE_KEY = 'stockManagerExtras.v2';

interface ExtrasProps {
    /** The machine time added to this checkout by hand, one line per job. */
    onExtrasChange: (extras: ExtraLine[]) => void;
    /** Laser sessions in this checkout; their time comes from the laser service. */
    laserSessions: LaserSession[];
    /** Open laser sessions not in the checkout yet, to pick from. */
    openLaserSessions: LaserSession[];
    onAddLaserSession: (id: string) => void;
    onRemoveLaserSession: (id: string) => void;
}

function stored(): ExtraLine[] {
    try {
        const v = JSON.parse(localStorage.getItem(EXTRAS_STORAGE_KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

const eur = (n: number) => `€${n.toFixed(2)}`;
export const laserSessionPrice = (minutes: number) => minutes * PRICING.LASER_PER_MINUTE;
/** Under each machine: its minimum counts once per payment, for all machine use together. */
const minimumText = (minimum: number) => `min. ${eur(minimum)} per payment`;

export default function Extras({ onExtrasChange, laserSessions, openLaserSessions, onAddLaserSession, onRemoveLaserSession }: ExtrasProps) {
    const [added, setAdded] = useState<ExtraLine[]>(stored);
    const [laserMin, setLaserMin] = useState(0);
    const [cncMin, setCncMin] = useState(0);
    const [grams, setGrams] = useState(0);
    // 3D print: the type, then its colour (part id); both optional. Price per gram from InvenTree, else the default.
    const [printType, setPrintType] = useState<string | null>(null);
    const [printPart, setPrintPart] = useState<number | null>(null);
    const [printPrices, setPrintPrices] = useState<Record<number, number>>({});
    useEffect(() => { void inventreeClient.getPrintPricePerGram().then(setPrintPrices); }, []);
    const { items } = useStock();
    const filaments = useMemo(() => {
        const byPart = new Map<number, string>();
        for (const i of items) if (i.part_id != null && isFilament(i)) byPart.set(i.part_id, i.name);
        return [...byPart].map(([id, name]) => ({ id, name, ...filamentType(name) })).sort((a, b) => a.name.localeCompare(b.name));
    }, [items]);
    const types = [...new Set(filaments.map(f => f.type))].sort((a, b) => a.localeCompare(b));
    const priceOf = (id: number) => printPrices[id] || PRICING.PRINTING_PER_GRAM;
    const printFilament = filaments.find(f => f.id === printPart);
    // Only a type: its cheapest filament. Only grams: the default price.
    const ofType = filaments.filter(f => f.type === printType);
    const perGram = printFilament ? priceOf(printFilament.id)
        : ofType.length ? Math.min(...ofType.map(f => priceOf(f.id))) : PRICING.PRINTING_PER_GRAM;

    useEffect(() => {
        localStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(added));
        onExtrasChange(added);
    }, [added, onExtrasChange]);

    const add = (line: ExtraLine) => setAdded(a => [...a, line]);
    // The top-up over everything in this checkout: the laser sessions and the added lines.
    // The laser cuts are one line, rounded up once (as ShoppingWindow books them).
    const cutMinutes = laserMinutes(laserSessions);
    const inCheckout: ExtraLine[] = [...(laserSessions.length ? [{ name: 'Lasertime', quantity: cutMinutes, unit: 'min', ...priced(PRICING.LASER_PER_MINUTE, PRICING.LASER_MINIMUM) }] : []), ...added];
    const top = topUp(inCheckout);
    const minimum = Math.max(0, ...inCheckout.map(e => e.minimum ?? 0));

    return (
        <div className="space-y-4">
            {openLaserSessions.length > 0 && (
                <div className="border-2 border-laser bg-laser-licht/40">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-sm font-semibold flex items-center gap-2"><Zap size={16} className="text-laser" aria-hidden /> Laser cuts not paid yet</span>
                        {openLaserSessions.length > 1 && (
                            <button onClick={() => openLaserSessions.forEach(s => onAddLaserSession(s.id))}
                                className="h-9 px-3 border border-brand-black bg-white text-xs font-semibold">Add all ({openLaserSessions.length})</button>
                        )}
                    </div>
                    <ul className="divide-y divide-lijn border-t border-lijn bg-white">
                        {openLaserSessions.map(s => (
                            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                                <span className="w-11 h-11 shrink-0 border border-lijn bg-brand-beige-dark flex items-center justify-center overflow-hidden" aria-hidden>
                                    {s.has_preview ? <img src={cutPreviewUrl(s.id)} alt="" className="w-full h-full object-contain" loading="lazy" /> : <Zap size={16} className="text-grafiet" />}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold truncate">{s.name}</div>
                                    <div className="text-xs text-grafiet">{new Date(s.created).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                                </div>
                                <span className="font-semibold tabular-nums">{shortDuration(s.total_time)}</span>
                                <button onClick={() => onAddLaserSession(s.id)}
                                    className="h-11 px-3 border border-brand-black bg-white text-xs font-semibold flex items-center gap-1">
                                    <Plus size={14} aria-hidden /> Add
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {(laserSessions.length > 0 || added.length > 0) && (
                <ul className="space-y-2" aria-label="Machine time in this checkout">
                    {laserSessions.length > 0 && (
                        <Row icon={Zap} tone="text-laser"
                            title={`Lasercut · ${laserSessions.length === 1 ? laserSessions[0].name : `${laserSessions.length} cuts`}`}
                            detail={`${cutMinutes} min, from the laser timer`} price={laserSessionPrice(cutMinutes)}
                            onRemove={() => laserSessions.forEach(s => onRemoveLaserSession(s.id))} />
                    )}
                    {added.map((l, i) => (
                        <Row key={i} icon={l.unit === 'g' ? Printer : l.name === 'CNC time' ? Drill : Zap}
                            tone={l.unit === 'g' ? 'text-blue-600' : l.name === 'CNC time' ? 'text-cnc' : 'text-laser'}
                            title={extraLabel(l)} detail={`${l.quantity} ${l.unit}`} price={l.quantity * l.unitPrice}
                            onRemove={() => setAdded(a => a.filter((_, j) => j !== i))} />
                    ))}
                    {top > 0 && (
                        <li className="flex items-center justify-between gap-2 border border-lijn bg-white p-3 text-sm">
                            <span><span className="font-semibold">Minimum per payment</span> · machine use together is at least {eur(minimum)}</span>
                            <span className="font-semibold">{eur(top)}</span>
                        </li>
                    )}
                </ul>
            )}

            <div className="grid grid-cols-1 gap-3">
                <Machine icon={Zap} tone="text-laser" border="border-laser" name="Lasercut" unit="min"
                    rate={`${eur(PRICING.LASER_PER_MINUTE)}/min · ${minimumText(PRICING.LASER_MINIMUM)}`}
                    value={laserMin} onChange={setLaserMin} price={laserMin * PRICING.LASER_PER_MINUTE}
                    onAdd={() => { add({ name: 'Lasertime', quantity: laserMin, unit: 'min', ...priced(PRICING.LASER_PER_MINUTE, PRICING.LASER_MINIMUM) }); setLaserMin(0); }} />
                <Machine icon={Drill} tone="text-cnc" border="border-cnc" name="CNC" unit="min"
                    rate={`${eur(PRICING.CNC_PER_MINUTE)}/min · ${minimumText(PRICING.CNC_MINIMUM)}`}
                    value={cncMin} onChange={setCncMin} price={cncMin * PRICING.CNC_PER_MINUTE}
                    onAdd={() => { add({ name: 'CNC time', quantity: cncMin, unit: 'min', ...priced(PRICING.CNC_PER_MINUTE, PRICING.CNC_MINIMUM) }); setCncMin(0); }} />
                <Machine icon={Printer} tone="text-blue-600" border="border-blue-600" name="3D print" unit="g"
                    rate={`${eur(perGram)}/g · ${minimumText(PRICING.PRINTING_MINIMUM)}`} value={grams} onChange={setGrams} price={grams * perGram}
                    onAdd={() => {
                        // Booked as the line's description, for the analytics per filament: the filament,
                        // only its type, or nothing.
                        add({ name: '3D printing', quantity: grams, unit: 'g', ...priced(perGram, PRICING.PRINTING_MINIMUM), person: printFilament?.name ?? printType ?? undefined });
                        setGrams(0);
                    }}>
                    <Chips label="Filament (optional)" options={types.map(t => ({ key: t, text: t }))} value={printType}
                        onChange={t => { setPrintType(t); setPrintPart(null); }} />
                    {printType && (
                        <Chips label="Colour (optional)" options={ofType.map(f => ({ key: String(f.id), text: f.colour, sub: `${eur(priceOf(f.id))}/g` }))}
                            value={printPart != null ? String(printPart) : null} onChange={k => setPrintPart(k ? Number(k) : null)} />
                    )}
                </Machine>
            </div>
        </div>
    );
}

/** Tap-to-pick buttons, like the shop's sections; tapping the picked one again clears it. */
function Chips({ label, options, value, onChange }: {
    label: string; options: { key: string; text: string; sub?: string }[]; value: string | null; onChange: (key: string | null) => void;
}) {
    return (
        <fieldset>
            <legend className="text-xs font-semibold text-grafiet mb-1">{label}</legend>
            <div className="flex flex-wrap gap-1.5">
                {options.map(o => (
                    <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(value === o.key ? null : o.key)}
                        className={cn('min-h-11 px-3 border text-sm font-semibold text-left',
                            value === o.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-lijn hover:bg-blue-100')}>
                        {o.text}{o.sub && <span className={cn('ml-1.5 text-xs font-normal', value === o.key ? 'text-white/80' : 'text-grafiet')}>{o.sub}</span>}
                    </button>
                ))}
            </div>
        </fieldset>
    );
}

function Row({ icon: Icon, tone, title, detail, price, onRemove }: {
    icon: React.ElementType; tone: string; title: string; detail: string; price: number; onRemove: () => void;
}) {
    return (
        <li className="flex items-center justify-between gap-3 border border-lijn p-3 bg-white">
            <div className="flex items-center gap-2 min-w-0">
                <Icon size={18} className={cn('shrink-0', tone)} aria-hidden />
                <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{title}</div>
                    <div className="text-xs text-grafiet">{detail}</div>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-lg font-semibold tabular-nums">{eur(price)}</span>
                <button onClick={onRemove} className="h-11 px-3 border border-lijn bg-white text-xs font-semibold flex items-center gap-1 hover:bg-red-50 text-red-600">
                    <X size={14} aria-hidden /> Remove
                </button>
            </div>
        </li>
    );
}

/** One machine: type the minutes (or grams), see the price, add it to the checkout. */
function Machine({ icon: Icon, tone, border, name, unit, rate, value, onChange, price, onAdd, disabledReason, children }: {
    icon: React.ElementType; tone: string; border: string; name: string; unit: string; rate: string;
    value: number; onChange: (n: number) => void; price: number; onAdd: () => void; disabledReason?: string; children?: React.ReactNode;
}) {
    const id = `extra-${name.replace(/\W/g, '').toLowerCase()}`;
    const reason = disabledReason ?? (value > 0 ? undefined : `Type the ${unit === 'g' ? 'grams' : 'minutes'} first`);
    return (
        <div className={cn('border-t-4 border border-lijn bg-white p-3 flex flex-col gap-2', border)}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold"><Icon size={18} className={tone} aria-hidden />{name}</span>
                <span className="text-xs text-grafiet">{rate}</span>
            </div>
            {children}
            <label htmlFor={id} className="text-xs font-semibold text-grafiet">{unit === 'g' ? 'Grams of your print' : 'Minutes the machine ran'}</label>
            <div className="flex items-center gap-2">
                <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    value={value || ''}
                    onChange={e => onChange(Math.max(0, unit === 'g' ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0))}
                    min="0"
                    className="w-full h-11 px-3 border border-lijn bg-white text-base font-mono focus:border-brand-black outline-none"
                    placeholder="0"
                />
                <span className="text-sm text-grafiet">{unit}</span>
                <span className="text-lg font-semibold tabular-nums whitespace-nowrap">{eur(price)}</span>
            </div>
            <button
                onClick={onAdd}
                disabled={!!reason}
                title={reason}
                className="h-11 brutalist-button bg-emerald-400 text-brand-black text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                <Plus size={16} aria-hidden /> {reason ?? 'Add to cart'}
            </button>
        </div>
    );
}
