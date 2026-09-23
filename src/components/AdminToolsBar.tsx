import { Plus, Tag, MapPin, Building2 } from 'lucide-react';

interface AdminToolsBarProps {
  onNewItem: () => void;
  onAddCategory: () => void;
  onAddLocation: () => void;
  onAddSupplier: () => void;
}

export default function AdminToolsBar({ onNewItem, onAddCategory, onAddLocation, onAddSupplier }: AdminToolsBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-brand-beige-dark border-b border-lijn">
      <span className="text-[10px] font-semibold text-brand-black/60 mr-2">
        Admin:
      </span>
      <button
        onClick={onNewItem}
        className="flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-[10px] font-semibold bg-amber-300 border border-lijn hover:bg-amber-400 transition-colors"
      >
        <Plus size={12} />
        <span className="hidden sm:inline">New item</span>
      </button>
      <button
        onClick={onAddCategory}
        className="flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-[10px] font-semibold bg-blue-200 border border-lijn hover:bg-blue-300 transition-colors"
      >
        <Tag size={12} />
        <span className="hidden sm:inline">+ Category</span>
        <span className="sm:hidden">+</span>
      </button>
      <button
        onClick={onAddLocation}
        className="flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-[10px] font-semibold bg-emerald-200 border border-lijn hover:bg-emerald-300 transition-colors"
      >
        <MapPin size={12} />
        <span className="hidden sm:inline">+ Location</span>
        <span className="sm:hidden">+</span>
      </button>
      <button
        onClick={onAddSupplier}
        className="flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-[10px] font-semibold bg-purple-200 border border-lijn hover:bg-purple-300 transition-colors"
      >
        <Building2 size={12} />
        <span className="hidden sm:inline">+ Supplier</span>
        <span className="sm:hidden">+</span>
      </button>
    </div>
  );
}
