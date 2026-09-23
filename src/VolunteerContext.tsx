import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { STORAGE_KEYS } from './constants';
import { getVolunteerKey, setVolunteerKey, VOLUNTEER_AUTH_FAILED } from './auth/volunteerKey';
import { useToast } from './ToastContext';

interface VolunteerContextType {
    isVolunteerMode: boolean;
    setIsVolunteerMode: (mode: boolean) => void;
}

const VolunteerContext = createContext<VolunteerContextType | undefined>(undefined);

export function VolunteerProvider({ children }: { children: ReactNode }) {
    const { addToast } = useToast();
    // Volunteer mode without a key (e.g. a session from before the proxy
    // checked passwords) cannot do anything, so it does not count.
    const [isVolunteerMode, setIsVolunteerModeState] = useState<boolean>(
        () => localStorage.getItem(STORAGE_KEYS.VOLUNTEER_MODE) === 'true' && getVolunteerKey() !== null
    );

    const setIsVolunteerMode = (mode: boolean) => {
        setIsVolunteerModeState(mode);
        if (mode) {
            localStorage.setItem(STORAGE_KEYS.VOLUNTEER_MODE, 'true');
        } else {
            localStorage.removeItem(STORAGE_KEYS.VOLUNTEER_MODE);
            setVolunteerKey(null);
        }
    };

    // The proxy rejected the stored key: the password changed. Log out.
    useEffect(() => {
        const onAuthFailed = () => {
            setIsVolunteerModeState(false);
            localStorage.removeItem(STORAGE_KEYS.VOLUNTEER_MODE);
            setVolunteerKey(null);
            addToast('Volunteer login expired. Log in again.', 'warning');
        };
        window.addEventListener(VOLUNTEER_AUTH_FAILED, onAuthFailed);
        return () => window.removeEventListener(VOLUNTEER_AUTH_FAILED, onAuthFailed);
    }, [addToast]);

    return (
        <VolunteerContext.Provider value={{ isVolunteerMode, setIsVolunteerMode }}>
            {children}
        </VolunteerContext.Provider>
    );
}

// The hook belongs with its provider; fast refresh reloads this file in full.
// eslint-disable-next-line react-refresh/only-export-components
export function useVolunteer() {
    const context = useContext(VolunteerContext);
    if (!context) {
        throw new Error('useVolunteer must be used within VolunteerProvider');
    }
    return context;
}
