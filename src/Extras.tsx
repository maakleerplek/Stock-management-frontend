import { useState, useEffect } from 'react';
import { X, Zap } from 'lucide-react';
import { PRICING } from './constants';
import type { ExtraLine } from './sendCodeHandler';
import type { LaserSession } from './lib/laserApi';

/** Hand-typed services survive a refresh, like the cart. Cleared after a sale. */
export const EXTRAS_STORAGE_KEY = 'stockManagerExtras.v1';

interface ExtrasProps {
    /** The hand-typed services in use, one line each; unused ones are left out. */
    onExtrasChange: (extras: ExtraLine[]) => void;
    /** Laser sessions someone put in the checkout; their time comes from the laser service. */
    laserSessions: LaserSession[];
    onRemoveLaserSession: (id: string) => void;
}

function stored(): { laser: number; cnc: number; print: number } {
    try {
        return { laser: 0, cnc: 0, print: 0, ...JSON.parse(localStorage.getItem(EXTRAS_STORAGE_KEY) || '{}') };
    } catch {
        return { laser: 0, cnc: 0, print: 0 };
    }
}

export default function Extras({ onExtrasChange, laserSessions, onRemoveLaserSession }: ExtrasProps) {
    const [lasertimeMinutes, setLasertimeMinutes] = useState(() => stored().laser);
    const [cncMinutes, setCncMinutes] = useState(() => stored().cnc);
    const [printingGrams, setPrintingGrams] = useState(() => stored().print);

    const lasertimeCost = lasertimeMinutes * PRICING.LASER_PER_MINUTE;
    const cncCost = cncMinutes * PRICING.CNC_PER_MINUTE;
    const printingCost = printingGrams * PRICING.PRINTING_PER_GRAM;

    useEffect(() => {
        localStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify({ laser: lasertimeMinutes, cnc: cncMinutes, print: printingGrams }));
        const lines: ExtraLine[] = [
            { name: 'Lasertime', quantity: lasertimeMinutes, unit: 'min', unitPrice: PRICING.LASER_PER_MINUTE },
            { name: 'CNC time', quantity: cncMinutes, unit: 'min', unitPrice: PRICING.CNC_PER_MINUTE },
            { name: '3D printing', quantity: printingGrams, unit: 'g', unitPrice: PRICING.PRINTING_PER_GRAM },
        ];
        onExtrasChange(lines.filter(l => l.quantity > 0));
    }, [lasertimeMinutes, cncMinutes, printingGrams, onExtrasChange]);

    return (
        <div className="space-y-4">
        {laserSessions.length > 0 && (
            <div className="space-y-2">
                {laserSessions.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-3 border border-lijn p-3 bg-brand-beige-dark">
                        <div className="flex items-center gap-2 min-w-0">
                            <Zap size={14} className="shrink-0" />
                            <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">Lasertime – {s.name}</div>
                                <div className="text-[10px] font-mono text-brand-black/60">{s.minutes} min × €{PRICING.LASER_PER_MINUTE.toFixed(2)} · from the laser</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-lg font-semibold tabular-nums">€{(s.minutes * PRICING.LASER_PER_MINUTE).toFixed(2)}</span>
                            <button onClick={() => onRemoveLaserSession(s.id)} title="Take out of the checkout" className="p-1 hover:bg-brand-accent">
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Lasertime Input */}
            <div className="space-y-1 border border-lijn p-3 bg-brand-beige">
                <div className="flex justify-between items-end border-b border-lijn pb-2 mb-2">
                    <label className="text-[10px] font-semibold block text-brand-black/60">Lasertime (min)</label>
                    <span className="text-[10px] font-mono opacity-50 font-bold">€{PRICING.LASER_PER_MINUTE.toFixed(2)}/min</span>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        value={lasertimeMinutes || ''}
                        onChange={(e) => setLasertimeMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                        min="0"
                        className="brutalist-input w-full font-mono bg-brand-beige h-9 px-3 border border-lijn focus:border-sky-500 focus:bg-sky-50/10 transition-all outline-none text-sm"
                        placeholder="0"
                    />
                    <div className="text-lg font-semibold whitespace-nowrap tabular-nums text-brand-black">
                        €{lasertimeCost.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* CNC Time Input */}
            <div className="space-y-1 border border-lijn p-3 bg-brand-beige">
                <div className="flex justify-between items-end border-b border-lijn pb-2 mb-2">
                    <label className="text-[10px] font-semibold block text-brand-black/60">CNC Time (min)</label>
                    <span className="text-[10px] font-mono opacity-50 font-bold">€{PRICING.CNC_PER_MINUTE.toFixed(2)}/min</span>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        value={cncMinutes || ''}
                        onChange={(e) => setCncMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                        min="0"
                        className="brutalist-input w-full font-mono bg-brand-beige h-9 px-3 border border-lijn focus:border-sky-500 focus:bg-sky-50/10 transition-all outline-none text-sm"
                        placeholder="0"
                    />
                    <div className="text-lg font-semibold whitespace-nowrap tabular-nums text-brand-black">
                        €{cncCost.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* 3D Printing Input */}
            <div className="space-y-1 border border-lijn p-3 bg-brand-beige">
                <div className="flex justify-between items-end border-b border-lijn pb-2 mb-2">
                    <label className="text-[10px] font-semibold block text-brand-black/60">3D Printing (g)</label>
                    <span className="text-[10px] font-mono opacity-50 font-bold">€{PRICING.PRINTING_PER_GRAM.toFixed(2)}/g</span>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        value={printingGrams || ''}
                        onChange={(e) => setPrintingGrams(Math.max(0, parseFloat(e.target.value) || 0))}
                        min="0"
                        step="1"
                        className="brutalist-input w-full font-mono bg-brand-beige h-9 px-3 border border-lijn focus:border-sky-500 focus:bg-sky-50/10 transition-all outline-none text-sm"
                        placeholder="0"
                    />
                    <div className="text-lg font-semibold whitespace-nowrap tabular-nums text-brand-black">
                        €{printingCost.toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
        </div>
    );
}
