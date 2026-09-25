import { useState } from 'react';
import { X, LogIn, AlertCircle } from 'lucide-react';
import { startSignIn } from './auth/session';

interface VolunteerModalProps {
    open: boolean;
    onClose: () => void;
}

export default function VolunteerModal({ open, onClose }: VolunteerModalProps) {
    const [leaving, setLeaving] = useState(false);

    // The sign-in happens at Authentik; the app reloads here afterwards and
    // VolunteerContext picks up the session.
    const handleSignIn = () => {
        if (leaving) return;
        setLeaving(true);
        void startSignIn();
    };

    const handleClose = () => {
        if (!leaving) onClose();
    };

    return (
        <>
            {/* Backdrop */}
            {open && (
                <div 
                    className="fixed inset-0 bg-brand-black/50 z-50 flex items-center justify-center p-4 transition-opacity"
                    onClick={handleClose}
                >
                    {/* Modal */}
                    <div 
                        className="border border-lijn bg-white w-full max-w-md flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-lijn bg-brand-black">
                            <h2 className="text-sm font-semibold text-white">Volunteer login</h2>
                            <button
                                onClick={handleClose}
                                className="p-1 hover:bg-zinc-800 transition-colors"
                            >
                                <X className="w-5 h-5 text-white" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex flex-col gap-6 p-6 bg-white">
                            <div className="flex gap-3 items-start">
                                <div className="p-1 border border-lijn bg-amber-200">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-brand-black" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <h3 className="font-semibold text-xs">Volunteers sign in here</h3>
                                    <p className="text-xs font-bold leading-relaxed text-brand-black/60">
                                        Sign in with your Maakleerplek account to adjust stock levels and manage inventory. On a shared device, log out when you are done.
                                    </p>
                                </div>
                            </div>

                        </div>

                        {/* Actions */}
                        <div className="flex gap-4 p-4 border-t border-lijn bg-white">
                            <button
                                onClick={handleClose}
                                className="flex-1 brutalist-button bg-white text-brand-black py-3 text-xs flex justify-center items-center gap-2"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSignIn}
                                disabled={leaving}
                                autoFocus
                                className="flex-1 brutalist-button bg-amber-300 text-brand-black py-3 text-xs flex justify-center items-center gap-2"
                            >
                                <LogIn className="w-4 h-4" />
                                {leaving ? 'Opening sign-in…' : 'Sign in'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
