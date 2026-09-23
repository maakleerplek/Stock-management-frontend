import { useState } from 'react';
import { LogOut, Settings, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVolunteer } from '../VolunteerContext';
import htlCube from '../assets/htl-cube-white.png';
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
      <header className="border-b border-brand-black/80 bg-brand-beige px-4 sm:px-8 h-16 flex justify-between items-center relative shrink-0">
        {/* Centered Clock */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
          <Clock />
        </div>

        <a
          href="https://maakleerplek.be/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="w-9 h-9 flex items-center justify-center bg-brand-black">
            <img src={htlCube} alt="HTL" className="w-6 h-6 object-contain" />
          </div>
          <div className="flex flex-col justify-center leading-none">
            <h1 className="text-xl font-semibold tracking-tight text-brand-black">
              maakleerplek
            </h1>
            <p className="text-xs font-medium text-grafiet mt-1">
              Stock management
            </p>
          </div>
        </a>
        <div className="flex items-center gap-3">
          {isVolunteerMode && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-300 border-l-4 border-amber-700 text-amber-800">
              Volunteer mode
            </span>
          )}
          {isVolunteerMode && (
            <button
              onClick={() => onViewChange(currentView === 'volunteer' ? 'inventory' : 'volunteer')}
              className="brutalist-button hidden sm:flex items-center gap-2 px-4 py-2 text-sm"
            >
              <span>{currentView === 'volunteer' ? 'Stock list' : 'Dashboard'}</span>
            </button>
          )}
          <button
            onClick={handleVolunteerToggle}
            className={cn(
              "brutalist-button flex items-center gap-2 px-4 py-2 text-sm",
              !isVolunteerMode && "btn-primary"
            )}
          >
            {isVolunteerMode ? (
              <>
                <LogOut size={16} />
                <span>Log out</span>
              </>
            ) : (
              <>
                <Settings size={16} />
                <span>Admin panel</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Exit Volunteer Confirmation Modal */}
      {exitConfirmOpen && (
        <div
          className="fixed inset-0 bg-brand-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setExitConfirmOpen(false)}
        >
          <div
            className="border border-lijn bg-white w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-lijn bg-red-500">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white" />
                <h2 className="text-sm font-semibold text-white">Exit volunteer mode</h2>
              </div>
              <button
                onClick={() => setExitConfirmOpen(false)}
                className="p-1 hover:bg-red-600 border border-transparent hover:border-white transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="p-6 bg-white">
              <p className="text-sm font-bold text-brand-black/80">
                Are you sure you want to exit volunteer mode?
              </p>
              <p className="text-xs text-brand-black/60 mt-2">
                You will return to the checkout view.
              </p>
            </div>
            <div className="flex gap-4 p-4 border-t border-lijn bg-gray-50">
              <button
                onClick={() => setExitConfirmOpen(false)}
                className="flex-1 brutalist-button bg-white text-brand-black py-3 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmExit}
                className="flex-1 brutalist-button bg-red-500 text-white py-3 text-xs hover:bg-red-600 border-lijn"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
