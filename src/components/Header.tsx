import { useState } from 'react';
import { LogOut, Settings, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVolunteer } from '../VolunteerContext';
import htlLogo from '../assets/HTL.png';
import Clock from './Clock';

interface HeaderProps {
  currentView: 'checkout' | 'volunteer' | 'inventory';
  onViewChange: (view: 'checkout' | 'volunteer' | 'inventory') => void;
  onVolunteerClick?: () => void;
}

export default function Header({ currentView, onViewChange, onVolunteerClick }: HeaderProps) {
  const { isVolunteerMode, setIsVolunteerMode } = useVolunteer();
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  const handleVolunteerToggle = () => {
    if (isVolunteerMode) {
      setExitConfirmOpen(true);
    } else {
      onVolunteerClick?.();
    }
  };

  const handleConfirmExit = () => {
    setIsVolunteerMode(false);
    onViewChange('checkout');
    setExitConfirmOpen(false);
  };

  return (
    <>
    <header className={cn(
      "border-b-2 border-brand-black px-4 sm:px-6 py-3 flex justify-between items-center relative",
      isVolunteerMode ? "bg-amber-200" : "bg-brand-beige"
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
        <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border-2 border-brand-black">
          <img src={htlLogo} alt="HTL Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
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
            isVolunteerMode ? "bg-amber-400 border-brand-black" : ""
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

    {/* Exit Volunteer Confirmation Modal */}
    {exitConfirmOpen && (
      <div 
        className="fixed inset-0 bg-brand-black/80 z-50 flex items-center justify-center p-4"
        onClick={() => setExitConfirmOpen(false)}
      >
        <div 
          className="border-3 border-brand-black bg-white w-full max-w-sm shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b-3 border-brand-black bg-red-500">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-white" />
              <h2 className="text-sm font-black uppercase tracking-widest text-white">EXIT VOLUNTEER MODE</h2>
            </div>
            <button
              onClick={() => setExitConfirmOpen(false)}
              className="p-1 hover:bg-red-600 border-2 border-transparent hover:border-white transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="p-6 bg-white">
            <p className="text-sm font-bold uppercase text-brand-black/80">
              Are you sure you want to exit volunteer mode?
            </p>
            <p className="text-xs text-brand-black/60 mt-2 uppercase">
              You will return to the checkout view.
            </p>
          </div>
          <div className="flex gap-4 p-4 border-t-3 border-brand-black bg-gray-50">
            <button
              onClick={() => setExitConfirmOpen(false)}
              className="flex-1 brutalist-button bg-white text-brand-black py-3 text-xs uppercase"
            >
              CANCEL
            </button>
            <button
              onClick={handleConfirmExit}
              className="flex-1 brutalist-button bg-red-500 text-white py-3 text-xs uppercase hover:bg-red-600 border-brand-black"
            >
              EXIT
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
