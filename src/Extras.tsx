import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { PRICING } from './constants';

interface ExtrasProps {
    onExtraCostChange: (cost: number) => void;
}

export default function Extras({ onExtraCostChange }: ExtrasProps) {
    const [lasertimeMinutes, setLasertimeMinutes] = useState(0);
    const [printingGrams, setPrintingGrams] = useState(0);

    const lasertimeCost = lasertimeMinutes * PRICING.LASER_PER_MINUTE;
    const printingCost = printingGrams * PRICING.PRINTING_PER_GRAM;
    const totalExtraCost = lasertimeCost + printingCost;

    useEffect(() => {
        onExtraCostChange(totalExtraCost);
    }, [lasertimeMinutes, printingGrams, onExtraCostChange, totalExtraCost]);

    return (
        <div className="mt-4 pt-4 border-t-3 border-black">
            <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4" />
                <h3 className="text-sm font-bold uppercase text-gray-700">Extra Services</h3>
            </div>
            <div className="flex flex-col gap-3">
                {/* Lasertime Input */}
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <label className="block text-xs font-bold mb-1 text-gray-700">
                            Lasertime (min) - €{PRICING.LASER_PER_MINUTE.toFixed(2)}/min
                        </label>
                        <input
                            type="number"
                            value={lasertimeMinutes}
                            onChange={(e) => setLasertimeMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                            min="0"
                            className="brutalist-input w-full px-3 py-2 text-sm"
                        />
                    </div>
                    <p className="min-w-[60px] text-right text-sm font-bold mt-5">
                        €{lasertimeCost.toFixed(2)}
                    </p>
                </div>

                {/* 3D Printing Input */}
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <label className="block text-xs font-bold mb-1 text-gray-700">
                            3D Printing (g) - €{PRICING.PRINTING_PER_GRAM.toFixed(2)}/g
                        </label>
                        <input
                            type="number"
                            value={printingGrams}
                            onChange={(e) => setPrintingGrams(Math.max(0, parseFloat(e.target.value) || 0))}
                            min="0"
                            step="1"
                            className="brutalist-input w-full px-3 py-2 text-sm"
                        />
                    </div>
                    <p className="min-w-[60px] text-right text-sm font-bold mt-5">
                        €{printingCost.toFixed(2)}
                    </p>
                </div>

                {/* Total Extra Services */}
                <p className="text-right mt-2 font-bold text-sm">
                    Total Extra Services: €{totalExtraCost.toFixed(2)}
                </p>
            </div>
        </div>
    );
}
