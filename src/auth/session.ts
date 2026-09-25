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

/**
 * The sign-in round trip has to reach the server: oauth2-proxy sets a CSRF
 * cookie on /oauth/start and checks it on /oauth/callback. A service worker
 * from an older build answers every navigation with the app shell, and some
 * browsers (Firefox) keep such a worker even after the cache is cleared.
 * Dropping it first makes the next navigations go to the network; the app
 * registers the current worker again when it loads.
 */
async function leaveServiceWorker(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
    await Promise.all(regs.map(r => r.unregister()));
  } catch {
    // No service worker support, or it is blocked: nothing to get out of the way.
  }
}

/** Leaves the app for the Authentik sign-in and comes back to the same page. */
export async function startSignIn(): Promise<void> {
  const back = window.location.pathname + window.location.search;
  await leaveServiceWorker();
  window.location.assign(`/oauth/start?rd=${encodeURIComponent(back)}`);
}

/** Ends the session here and at Authentik (see /logout in nginx.conf.template). */
export async function signOut(): Promise<void> {
  signedIn = false;
  await leaveServiceWorker();
  window.location.assign('/logout');
}
