import { useState, useEffect } from 'react';
import { PRICING } from './constants';

interface ExtrasProps {
    onExtraCostChange: (cost: number) => void;
}

export default function Extras({ onExtraCostChange }: ExtrasProps) {
    const [lasertimeMinutes, setLasertimeMinutes] = useState(0);
    const [cncMinutes, setCncMinutes] = useState(0);
    const [printingGrams, setPrintingGrams] = useState(0);

    const lasertimeCost = lasertimeMinutes * PRICING.LASER_PER_MINUTE;
    const cncCost = cncMinutes * PRICING.CNC_PER_MINUTE;
    const printingCost = printingGrams * PRICING.PRINTING_PER_GRAM;
    const totalExtraCost = lasertimeCost + cncCost + printingCost;

    useEffect(() => {
        onExtraCostChange(totalExtraCost);
    }, [lasertimeMinutes, cncMinutes, printingGrams, onExtraCostChange, totalExtraCost]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Lasertime Input */}
            <div className="space-y-1 border-2 border-brand-black p-3 bg-white">
                <div className="flex justify-between items-end border-b-2 border-brand-black pb-2 mb-2">
                    <label className="text-[10px] font-black uppercase block tracking-widest text-brand-black/60">Lasertime (min)</label>
                    <span className="text-[10px] font-mono opacity-50 font-bold">€{PRICING.LASER_PER_MINUTE.toFixed(2)}/min</span>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        value={lasertimeMinutes || ''}
                        onChange={(e) => setLasertimeMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                        min="0"
                        className="brutalist-input w-full font-mono bg-white h-9 px-3 border-2 border-brand-black focus:border-sky-500 focus:bg-sky-50/10 transition-all outline-none text-sm"
                        placeholder="0"
                    />
                    <div className="text-lg font-black whitespace-nowrap text-sky-600">
                        €{lasertimeCost.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* CNC Time Input */}
            <div className="space-y-1 border-2 border-brand-black p-3 bg-white">
                <div className="flex justify-between items-end border-b-2 border-brand-black pb-2 mb-2">
                    <label className="text-[10px] font-black uppercase block tracking-widest text-brand-black/60">CNC Time (min)</label>
                    <span className="text-[10px] font-mono opacity-50 font-bold">€{PRICING.CNC_PER_MINUTE.toFixed(2)}/min</span>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        value={cncMinutes || ''}
                        onChange={(e) => setCncMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                        min="0"
                        className="brutalist-input w-full font-mono bg-white h-9 px-3 border-2 border-brand-black focus:border-sky-500 focus:bg-sky-50/10 transition-all outline-none text-sm"
                        placeholder="0"
                    />
                    <div className="text-lg font-black whitespace-nowrap text-sky-600">
                        €{cncCost.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* 3D Printing Input */}
            <div className="space-y-1 border-2 border-brand-black p-3 bg-white">
                <div className="flex justify-between items-end border-b-2 border-brand-black pb-2 mb-2">
                    <label className="text-[10px] font-black uppercase block tracking-widest text-brand-black/60">3D Printing (g)</label>
                    <span className="text-[10px] font-mono opacity-50 font-bold">€{PRICING.PRINTING_PER_GRAM.toFixed(2)}/g</span>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        value={printingGrams || ''}
                        onChange={(e) => setPrintingGrams(Math.max(0, parseFloat(e.target.value) || 0))}
                        min="0"
                        step="1"
                        className="brutalist-input w-full font-mono bg-white h-9 px-3 border-2 border-brand-black focus:border-sky-500 focus:bg-sky-50/10 transition-all outline-none text-sm"
                        placeholder="0"
                    />
                    <div className="text-lg font-black whitespace-nowrap text-sky-600">
                        €{printingCost.toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
    );
}
