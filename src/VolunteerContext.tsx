import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { checkVolunteerSession, signOut, VOLUNTEER_AUTH_FAILED } from './auth/session';
import inventreeClient from './api/inventreeClient';
import { useToast } from './ToastContext';

interface VolunteerContextType {
    isVolunteerMode: boolean;
    /** Leaving volunteer mode signs out here and at Authentik. */
    setIsVolunteerMode: (mode: boolean) => void;
}

const VolunteerContext = createContext<VolunteerContextType | undefined>(undefined);

export function VolunteerProvider({ children }: { children: ReactNode }) {
    const { addToast } = useToast();
    // Volunteer mode is whatever the proxy says about this browser's session,
    // asked once on load (also right after coming back from the sign-in).
    const [isVolunteerMode, setIsVolunteerModeState] = useState(false);

    useEffect(() => {
        let cancelled = false;
        checkVolunteerSession().then(result => {
            if (cancelled || result !== 'ok') return;
            setIsVolunteerModeState(true);
            // Till sales need this customer, and only a volunteer may create it.
            void inventreeClient.getTillCustomer().catch(err => console.warn('[Volunteer] Till customer setup failed:', err));
        });
        return () => { cancelled = true; };
    }, []);

    const setIsVolunteerMode = (mode: boolean) => {
        if (mode) {
            setIsVolunteerModeState(true);
        } else {
            setIsVolunteerModeState(false);
            signOut();
        }
    };

    // The proxy refused a volunteer call: the session expired.
    useEffect(() => {
        const onAuthFailed = () => {
            setIsVolunteerModeState(false);
            addToast('Volunteer sign-in expired. Sign in again.', 'warning');
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
