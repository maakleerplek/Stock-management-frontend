import { Plus, Tag, MapPin, Wrench } from 'lucide-react';

interface AdminToolsBarProps {
  onNewItem: () => void;
  onAddCategory: () => void;
  onAddLocation: () => void;
  onRepairData: () => void;
}

export default function AdminToolsBar({ onNewItem, onAddCategory, onAddLocation, onRepairData }: AdminToolsBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-brand-beige-dark border-b border-brand-black">
      <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/60 mr-2">
        ADMIN:
      </span>
      <button
        onClick={onNewItem}
        className="flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-[10px] font-black uppercase bg-amber-300 border border-brand-black hover:bg-amber-400 transition-colors"
      >
        <Plus size={12} />
        <span className="hidden sm:inline">NEW ITEM</span>
      </button>
      <button
        onClick={onAddCategory}
        className="flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-[10px] font-black uppercase bg-blue-200 border border-brand-black hover:bg-blue-300 transition-colors"
      >
        <Tag size={12} />
        <span className="hidden sm:inline">+ CATEGORY</span>
        <span className="sm:hidden">+</span>
      </button>
      <button
        onClick={onAddLocation}
        className="flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-[10px] font-black uppercase bg-emerald-200 border border-brand-black hover:bg-emerald-300 transition-colors"
      >
        <MapPin size={12} />
        <span className="hidden sm:inline">+ LOCATION</span>
        <span className="sm:hidden">+</span>
      </button>
      <button
        onClick={onRepairData}
        className="flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-[10px] font-black uppercase bg-white border border-brand-black hover:bg-brand-beige transition-colors ml-auto"
      >
        <Wrench size={12} />
        <span className="hidden sm:inline">REPAIR DATA</span>
      </button>
    </div>
  );
}
