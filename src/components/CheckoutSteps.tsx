import { ScanBarcode, Timer, Euro } from 'lucide-react';

const STEPS = [
    { icon: ScanBarcode, label: 'Scan your items' },
    { icon: Timer, label: 'Add machine time (if you used one)' },
    { icon: Euro, label: 'Pay with the QR code' },
];

/** How the till works, in three steps, for first-time visitors. Wide screens only: narrow
 *  ones (phone, the laser PC's bar) already walk through it with the Scan / Cart tabs. */
export default function CheckoutSteps() {
    return (
        <ol className="hidden lg:flex border-b border-lijn bg-brand-beige-dark shrink-0 text-xs sm:text-sm" aria-label="How to pay">
            {STEPS.map((s, i) => (
                <li key={s.label} className="flex-1 flex items-center justify-center gap-2 px-2 py-2.5 border-l border-lijn first:border-l-0">
                    <span className="w-6 h-6 shrink-0 flex items-center justify-center bg-brand-black text-white font-semibold text-xs">{i + 1}</span>
                    <s.icon size={16} className="shrink-0 text-emerald-600" aria-hidden />
                    <span className="font-semibold">{s.label}</span>
                </li>
            ))}
        </ol>
    );
}
