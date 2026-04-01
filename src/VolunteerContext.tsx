import { createContext, useContext, useState, type ReactNode } from 'react';
import { STORAGE_KEYS } from './constants';

interface VolunteerContextType {
    isVolunteerMode: boolean;
    setIsVolunteerMode: (mode: boolean) => void;
}

const VolunteerContext = createContext<VolunteerContextType | undefined>(undefined);

export function VolunteerProvider({ children }: { children: ReactNode }) {
    const [isVolunteerMode, setIsVolunteerModeState] = useState<boolean>(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.VOLUNTEER_MODE);
        return stored === 'true';
    });

    const setIsVolunteerMode = (mode: boolean) => {
        setIsVolunteerModeState(mode);
        if (mode) {
            localStorage.setItem(STORAGE_KEYS.VOLUNTEER_MODE, 'true');
        } else {
            localStorage.removeItem(STORAGE_KEYS.VOLUNTEER_MODE);
        }
    };

    return (
        <VolunteerContext.Provider value={{ isVolunteerMode, setIsVolunteerMode }}>
            {children}
        </VolunteerContext.Provider>
    );
}

export function useVolunteer() {
    const context = useContext(VolunteerContext);
    if (!context) {
        throw new Error('useVolunteer must be used within VolunteerProvider');
    }
    return context;
}
