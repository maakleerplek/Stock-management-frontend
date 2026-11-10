import { ChevronRight } from 'lucide-react';
import ImageDisplay from '../../ImageDisplay';
import { useStock } from '../../StockContext';
import { useVolunteer } from '../../VolunteerContext';

export function WoodReminder({ onShop }: { onShop: () => void }) {
  const { items } = useStock();
  const { isVolunteerMode } = useVolunteer();
  const wood = items.filter(i => /wood|hout/i.test(i.category) && i.quantity > 0 && i.price > 0);
  if (isVolunteerMode || !wood.length) return null;
  const pic = wood.find(i => i.image) ?? wood[0];
  const from = Math.min(...wood.map(i => i.price));
  return (
    // The whole block goes to the checkout's wood (a › like any link to another page); no cart icon, it is not a purchase yet.
    <button onClick={onShop} title="See the wood at the checkout"
      className="w-full text-left flex items-center gap-3 border border-amber-300 bg-amber-50 p-3 hover:brightness-95 active:scale-[0.99] transition-[filter,scale]">
      <div className="w-14 h-14 shrink-0 border border-lijn overflow-hidden bg-white">
        <ImageDisplay imagePath={pic.image} alt="" width={56} height={56} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Need wood for your job?</p>
        <p className="text-xs text-grafiet">MDF and poplar sheets for the laser, from €{from.toFixed(2)}.</p>
      </div>
      <ChevronRight size={28} className="shrink-0 text-amber-700" aria-hidden />
    </button>
  );
}
