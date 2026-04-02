import { Box, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ORGANIZATION } from './constants';

interface HeaderProps {
  currentView: 'checkout' | 'volunteer' | 'inventory';
  onViewChange: (view: 'checkout' | 'volunteer' | 'inventory') => void;
  onVolunteerClick?: () => void;
}

export default function Header({ currentView, onViewChange, onVolunteerClick }: HeaderProps) {
  const isVolunteerMode = currentView === 'volunteer' || currentView === 'inventory';

  const handleVolunteerToggle = () => {
    if (isVolunteerMode) {
      onViewChange('checkout');
    } else {
      // Open volunteer password modal
      onVolunteerClick?.();
    }
  };

  return (
    <header className="border-b-[3px] border-brand-black bg-white p-3 sm:p-6 flex justify-between items-center">
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-8 h-8 sm:w-12 sm:h-12 brutalist-border bg-brand-black flex items-center justify-center text-white">
          <Box size={20} className="sm:hidden" />
          <Box size={28} className="hidden sm:block" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-black tracking-tighter uppercase leading-none">
            Inventree Assistant
          </h1>
          <p className="text-[10px] sm:text-xs font-mono opacity-60">
            by {ORGANIZATION.name}
          </p>
        </div>
      </div>
      <div className="flex gap-2 sm:gap-3">
        {isVolunteerMode && (
          <button 
            onClick={() => onViewChange(currentView === 'volunteer' ? 'inventory' : 'volunteer')}
            className="brutalist-button flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-base"
          >
            <span>{currentView === 'volunteer' ? 'Stock List' : 'Dashboard'}</span>
          </button>
        )}
        <button 
          onClick={handleVolunteerToggle}
          className={cn(
            "brutalist-button flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-base",
            isVolunteerMode ? "bg-yellow-400" : "bg-white"
          )}
        >
          <Settings size={16} className="sm:w-[18px] sm:h-[18px]" />
          <span>{isVolunteerMode ? 'Back to Checkout' : 'Volunteer Mode'}</span>
        </button>
      </div>
    </header>
  );
}
