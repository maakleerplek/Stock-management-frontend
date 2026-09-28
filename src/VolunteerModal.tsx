import { useEffect, useState } from 'react';
import { X, LogIn, AlertCircle } from 'lucide-react';
import { getAuthMode, signInWithPassword, startSignIn, type AuthMode } from './auth/session';

interface VolunteerModalProps {
    open: boolean;
    onClose: () => void;
}

export default function VolunteerModal({ open, onClose }: VolunteerModalProps) {
    const [leaving, setLeaving] = useState(false);
    const [mode, setMode] = useState<AuthMode | null>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) void getAuthMode().then(setMode);
    }, [open]);

    // Authentik: the sign-in happens there, the app reloads here afterwards and
    // VolunteerContext picks up the session. Password: the cookie is set here,
    // and a reload does the same.
    const handleSignIn = async () => {
        if (leaving || !mode) return;
        if (mode === 'authentik') {
            setLeaving(true);
            void startSignIn();
            return;
        }
        if (!password) return;
        setLeaving(true);
        setError(null);
        const result = await signInWithPassword(password);
        if (result === 'ok') {
            window.location.reload();
            return;
        }
        setLeaving(false);
        setPassword('');
        setError(result === 'wrong' ? 'Wrong password.' : 'The server did not answer. Try again.');
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
                                        {mode === 'password'
                                            ? 'Enter the volunteer password to adjust stock levels and manage inventory. On a shared device, log out when you are done.'
                                            : 'Sign in with your Maakleerplek account to adjust stock levels and manage inventory. On a shared device, log out when you are done.'}
                                    </p>
                                </div>
                            </div>
                            {mode === 'password' && (
                                <form onSubmit={e => { e.preventDefault(); void handleSignIn(); }} className="flex flex-col gap-2">
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="Volunteer password"
                                        autoComplete="current-password"
                                        autoFocus
                                        className="h-10 px-3 border border-lijn bg-white text-sm"
                                    />
                                    {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
                                </form>
                            )}

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
                                onClick={() => void handleSignIn()}
                                disabled={leaving || !mode || (mode === 'password' && !password)}
                                autoFocus={mode === 'authentik'}
                                className="flex-1 brutalist-button bg-amber-300 text-brand-black py-3 text-xs flex justify-center items-center gap-2"
                            >
                                <LogIn className="w-4 h-4" />
                                {leaving ? (mode === 'password' ? 'Checking…' : 'Opening sign-in…') : 'Sign in'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
