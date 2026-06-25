import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { BrowserAuthError, InteractionStatus } from '@azure/msal-browser';
import { Loader2 } from 'lucide-react';
import { loginRequest, MS_LOGIN_INTENT_KEY } from './msalConfig';

interface MicrosoftSignInButtonProps {
  /** Called after a successful popup sign-in (enter volunteer mode + close modal). */
  onSuccess: () => void;
}

/** Official Microsoft logo (four coloured squares). */
function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" className="flex-shrink-0">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function MicrosoftSignInButton({ onSuccess }: MicrosoftSignInButtonProps) {
  const { instance, inProgress } = useMsal();
  const [error, setError] = useState('');
  const busy = inProgress !== InteractionStatus.None;

  const handleSignIn = async () => {
    setError('');
    try {
      const result = await instance.loginPopup(loginRequest);
      instance.setActiveAccount(result.account);
      onSuccess();
    } catch (err) {
      // Popups can be blocked (kiosk / PWA standalone / strict browsers).
      // Fall back to a full-page redirect; MicrosoftAuthSync resumes afterwards.
      if (
        err instanceof BrowserAuthError &&
        (err.errorCode === 'popup_window_error' || err.errorCode === 'empty_window_error')
      ) {
        try {
          sessionStorage.setItem(MS_LOGIN_INTENT_KEY, '1');
          await instance.loginRedirect(loginRequest);
          return;
        } catch (redirectErr) {
          console.error('MSAL redirect login failed', redirectErr);
        }
      } else if (err instanceof BrowserAuthError && err.errorCode === 'user_cancelled') {
        return; // user closed the popup — not an error worth showing
      }
      console.error('MSAL login failed', err);
      setError('MICROSOFT SIGN-IN FAILED');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSignIn}
        disabled={busy}
        className="brutalist-button bg-white text-brand-black py-3 text-xs uppercase flex justify-center items-center gap-2 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MicrosoftLogo />}
        SIGN IN WITH MICROSOFT
      </button>
      {error && (
        <p className="text-xs font-black uppercase tracking-widest text-red-600">{error}</p>
      )}
    </div>
  );
}
