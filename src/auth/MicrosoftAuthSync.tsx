import { useEffect, useRef } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { useVolunteer } from '../VolunteerContext';
import { MS_LOGIN_INTENT_KEY } from './msalConfig';

/**
 * Bridges Microsoft authentication state and volunteer mode. Rendered (only
 * when MSAL is configured) inside both MsalProvider and VolunteerProvider.
 *
 *  - After a redirect-based sign-in, resumes "enter volunteer mode" once the
 *    page has reloaded and the account is available.
 *  - When the user exits volunteer mode, clears the local Microsoft session so
 *    the next person on a shared device must sign in again.
 *
 * The happy path (popup sign-in) sets volunteer mode directly in the button;
 * this component covers the redirect fallback and sign-out.
 */
export default function MicrosoftAuthSync() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { isVolunteerMode, setIsVolunteerMode } = useVolunteer();
  const wasVolunteerMode = useRef(isVolunteerMode);

  // Resume volunteer mode after a redirect login.
  useEffect(() => {
    if (isAuthenticated && sessionStorage.getItem(MS_LOGIN_INTENT_KEY)) {
      sessionStorage.removeItem(MS_LOGIN_INTENT_KEY);
      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
      if (account) instance.setActiveAccount(account);
      setIsVolunteerMode(true);
    }
  }, [isAuthenticated, instance, setIsVolunteerMode]);

  // On exit from volunteer mode, drop the local Microsoft session.
  useEffect(() => {
    if (wasVolunteerMode.current && !isVolunteerMode && instance.getActiveAccount()) {
      instance.clearCache().catch((err) => console.error('MSAL clearCache failed', err));
    }
    wasVolunteerMode.current = isVolunteerMode;
  }, [isVolunteerMode, instance]);

  return null;
}
