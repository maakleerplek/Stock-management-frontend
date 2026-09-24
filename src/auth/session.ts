/**
 * Volunteer sign-in through Authentik.
 *
 * oauth2-proxy (next to nginx, see docker-compose.yml) runs the sign-in and
 * keeps the session in an encrypted cookie. nginx asks it on every
 * volunteer-only API call, so the app itself holds no secret: it only asks
 * whether this browser is signed in, and sends people to sign in or out.
 */

import { VOLUNTEER_CHECK_PATH } from '../lib/apiAccess';

/** Fired when the proxy refuses a volunteer call, e.g. after the session expired. */
export const VOLUNTEER_AUTH_FAILED = 'volunteer-auth-failed';

// Mirrors the last answer from the proxy, so the API client can tell an expired
// session from a visitor who never signed in.
let signedIn = false;

export function hasVolunteerSession(): boolean {
  return signedIn;
}

export function markSignedOut(): void {
  signedIn = false;
}

/** Asks the proxy whether this browser has a volunteer session. */
export async function checkVolunteerSession(): Promise<'ok' | 'no' | 'unreachable'> {
  try {
    const res = await fetch(VOLUNTEER_CHECK_PATH, { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 204) {
      signedIn = true;
      return 'ok';
    }
    signedIn = false;
    return res.status === 401 ? 'no' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

/** Leaves the app for the Authentik sign-in and comes back to the same page. */
export function startSignIn(): void {
  const back = window.location.pathname + window.location.search;
  window.location.assign(`/oauth/start?rd=${encodeURIComponent(back)}`);
}

/** Ends the session here and at Authentik (see /logout in nginx.conf.template). */
export function signOut(): void {
  signedIn = false;
  window.location.assign('/logout');
}
