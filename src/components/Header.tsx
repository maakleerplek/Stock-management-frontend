import { LogOut, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVolunteer } from '../VolunteerContext';
import htlLogo from '../assets/HTL_logo_CMYK_white-04.svg';
import Clock from './Clock';

interface HeaderProps {
  currentView: 'checkout' | 'volunteer' | 'inventory';
  onViewChange: (view: 'checkout' | 'volunteer' | 'inventory') => void;
  onVolunteerClick?: () => void;
}

export default function Header({ currentView, onViewChange, onVolunteerClick }: HeaderProps) {
  const { isVolunteerMode, setIsVolunteerMode } = useVolunteer();

  const handleVolunteerToggle = () => {
    if (isVolunteerMode) {
      setIsVolunteerMode(false);
      onViewChange('checkout');
    } else {
      onVolunteerClick?.();
    }
  };

  return (
    <header className={cn(
      "border-b-2 border-brand-black px-4 sm:px-6 py-3 flex justify-between items-center relative",
      isVolunteerMode ? "bg-amber-100" : "bg-brand-beige"
    )}>
      {/* Centered Clock */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
        <Clock />
      </div>

      <a 
        href="https://maakleerplek.be/" 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-3 sm:gap-4 hover:opacity-80 transition-opacity cursor-pointer group"
      >
        <div className="w-12 h-12 bg-brand-black flex items-center justify-center p-1 border-2 border-brand-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-transform group-hover:scale-105">
          <img src={htlLogo} alt="HTL Logo" className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col justify-center">
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-none text-brand-black">
            Inventree
          </h1>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-brand-black/60 mt-1">
            Maakleerplek vzw
          </p>
        </div>
      </a>
      <div className="flex gap-3">
        {isVolunteerMode && (
          <button 
            onClick={() => onViewChange(currentView === 'volunteer' ? 'inventory' : 'volunteer')}
            className="brutalist-button flex items-center gap-2 px-4 py-2 text-sm"
          >
            <span>{currentView === 'volunteer' ? 'STOCK LIST' : 'DASHBOARD'}</span>
          </button>
        )}
        <button 
          onClick={handleVolunteerToggle}
          className={cn(
            "brutalist-button flex items-center gap-2 px-4 py-2 text-sm",
            isVolunteerMode ? "bg-amber-300" : ""
          )}
        >
          {isVolunteerMode ? (
            <>
              <LogOut size={16} />
              <span>EXIT VOLUNTEER</span>
            </>
          ) : (
            <>
              <Settings size={16} />
              <span>ADMIN PANEL</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
