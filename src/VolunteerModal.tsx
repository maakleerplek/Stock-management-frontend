import { useState } from 'react';
import { X, LogIn, AlertCircle } from 'lucide-react';
import { useVolunteer } from './VolunteerContext';
import { AUTH } from './constants';
import { cn } from './lib/utils';

interface VolunteerModalProps {
    open: boolean;
    onClose: () => void;
}

export default function VolunteerModal({ open, onClose }: VolunteerModalProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { setIsVolunteerMode } = useVolunteer();

    const handleSubmit = () => {
        if (password === AUTH.VOLUNTEER_PASSWORD) {
            setIsVolunteerMode(true);
            setPassword('');
            setError('');
            onClose();
        } else {
            setError('INCORRECT PASSWORD');
            setPassword('');
        }
    };

    const handleClose = () => {
        setPassword('');
        setError('');
        onClose();
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit();
        }
    };

    return (
        <>
            {/* Backdrop */}
            {open && (
                <div 
                    className="fixed inset-0 bg-brand-black/80 z-50 flex items-center justify-center p-4 transition-opacity"
                    onClick={handleClose}
                >
                    {/* Modal */}
                    <div 
                        className="border-2 border-brand-black bg-white w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b-2 border-brand-black bg-brand-beige">
                            <h2 className="text-sm font-black uppercase tracking-widest text-brand-black">VOLUNTEER MODE</h2>
                            <button
                                onClick={handleClose}
                                className="p-1 hover:bg-white border-2 border-transparent hover:border-brand-black transition-colors"
                            >
                                <X className="w-5 h-5 text-brand-black" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex flex-col gap-6 p-6 bg-white">
                            <div className="flex gap-3 items-start">
                                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-brand-black" />
                                <div className="flex flex-col gap-1">
                                    <h3 className="font-black text-xs uppercase tracking-widest">AUTHENTICATION REQUIRED</h3>
                                    <p className="text-xs font-bold leading-relaxed text-brand-black/70 uppercase">
                                        VOLUNTEER MODE ALLOWS YOU TO ADJUST STOCK LEVELS.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-black uppercase tracking-widest text-brand-black">ENTER PASSWORD</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    autoFocus
                                    className={cn(
                                        "brutalist-input w-full px-4 py-3 text-lg font-black tracking-widest",
                                        error && "border-red-500 bg-red-50"
                                    )}
                                />
                                {error && (
                                    <p className="text-xs font-black uppercase tracking-widest text-red-600 mt-1">
                                        {error}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-4 p-4 border-t-2 border-brand-black bg-white">
                            <button
                                onClick={handleClose}
                                className="flex-1 brutalist-button bg-white text-brand-black py-3 text-xs uppercase flex justify-center items-center gap-2"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="flex-1 brutalist-button bg-[#c6e2ff] text-brand-black py-3 text-xs uppercase flex justify-center items-center gap-2 hover:bg-blue-200"
                            >
                                <LogIn className="w-4 h-4" />
                                AUTHENTICATE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
