import { useState } from 'react';
import { X, LogIn, Info } from 'lucide-react';
import { useVolunteer } from './VolunteerContext';
import { AUTH } from './constants';
import { cn } from './lib/utils';

interface VolunteerModalProps {
    open: boolean;
    onClose: () => void;
}

// Volunteer password from environment or default

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
            setError('Incorrect password');
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
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={handleClose}
                >
                    {/* Modal */}
                    <div 
                        className="brutalist-card bg-white w-full max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b-3 border-black">
                            <h2 className="text-lg font-bold uppercase">Enter Volunteer Mode</h2>
                            <button
                                onClick={handleClose}
                                className="p-1 hover:bg-beige transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex flex-col gap-4 p-4">
                            <div className="brutalist-card bg-blue-50 border-blue-500 p-3 flex gap-2">
                                <Info className="w-5 h-5 flex-shrink-0 text-blue-600" />
                                <p className="text-sm">
                                    Volunteer mode allows you to add items to stock instead of removing them.
                                </p>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold mb-2 uppercase">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    autoFocus
                                    className={cn(
                                        "brutalist-input w-full px-3 py-2",
                                        error && "border-red-500"
                                    )}
                                />
                            </div>

                            {error && (
                                <p className="text-sm font-bold text-red-600">
                                    {error}
                                </p>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 justify-end p-4 border-t-3 border-black">
                            <button
                                onClick={handleClose}
                                className="brutalist-button px-4 py-2 flex items-center gap-2"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="brutalist-button px-4 py-2 bg-black text-beige flex items-center gap-2"
                            >
                                <LogIn className="w-4 h-4" />
                                Enter
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
