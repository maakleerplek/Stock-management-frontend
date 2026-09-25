import { useState, useEffect } from 'react';
import { PRICING } from './constants';
import type { ExtraLine } from './sendCodeHandler';

interface ExtrasProps {
    /** The services in use, one line each; unused ones are left out. */
    onExtrasChange: (extras: ExtraLine[]) => void;
    /** Laser minutes live with the parent, so the Lasercutter tab can fill them in. */
    lasertimeMinutes: number;
    onLasertimeChange: (minutes: number) => void;
}

export default function Extras({ onExtrasChange, lasertimeMinutes, onLasertimeChange: setLasertimeMinutes }: ExtrasProps) {
    const [cncMinutes, setCncMinutes] = useState(0);
    const [printingGrams, setPrintingGrams] = useState(0);

    const lasertimeCost = lasertimeMinutes * PRICING.LASER_PER_MINUTE;
    const cncCost = cncMinutes * PRICING.CNC_PER_MINUTE;
    const printingCost = printingGrams * PRICING.PRINTING_PER_GRAM;

    useEffect(() => {
        const lines: ExtraLine[] = [
            { name: 'Lasertime', quantity: lasertimeMinutes, unit: 'min', unitPrice: PRICING.LASER_PER_MINUTE },
            { name: 'CNC time', quantity: cncMinutes, unit: 'min', unitPrice: PRICING.CNC_PER_MINUTE },
            { name: '3D printing', quantity: printingGrams, unit: 'g', unitPrice: PRICING.PRINTING_PER_GRAM },
        ];
        onExtrasChange(lines.filter(l => l.quantity > 0));
    }, [lasertimeMinutes, cncMinutes, printingGrams, onExtrasChange]);

    return (
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
    );
}
