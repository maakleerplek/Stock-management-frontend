/**
 * Volunteer sign-in, in one of two modes set on the server (AUTH_MODE):
 *
 * - authentik: oauth2-proxy (next to nginx, see docker-compose.yml) runs the
 *   sign-in and keeps the session in an encrypted cookie.
 * - password: one shared volunteer password, for a server that cannot reach
 *   Authentik. Its sha256 goes in the volunteer_key cookie.
 *
 * Either way nginx checks every volunteer-only API call, so the app itself
 * holds no secret: it only asks whether this browser is signed in, and sends
 * people to sign in or out.
 */

import { VOLUNTEER_CHECK_PATH, AUTH_MODE_PATH, VOLUNTEER_KEY_COOKIE, type AuthMode } from '../lib/apiAccess';

export type { AuthMode };

let modePromise: Promise<AuthMode> | null = null;

/** Which sign-in this server uses. Asked once; Authentik when the answer is unclear. */
export function getAuthMode(): Promise<AuthMode> {
  modePromise ??= fetch(AUTH_MODE_PATH, { cache: 'no-store' })
    .then(res => (res.ok ? res.json() : null))
    .then(data => (data?.mode === 'password' ? 'password' : 'authentik') as AuthMode)
    .catch(() => 'authentik' as AuthMode);
  return modePromise;
}

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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Password mode: keep the password's hash in the cookie nginx checks, and ask
 * whether it is right. A wrong password leaves no cookie behind.
 */
export async function signInWithPassword(password: string): Promise<'ok' | 'wrong' | 'unreachable'> {
  const key = await sha256Hex(password);
  // 12 h, like the Authentik session: a forgotten sign-in on the till ends the same day.
  document.cookie = `${VOLUNTEER_KEY_COOKIE}=${key}; Path=/; Max-Age=43200; Secure; SameSite=Strict`;
  const result = await checkVolunteerSession();
  if (result === 'ok') return 'ok';
  document.cookie = `${VOLUNTEER_KEY_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Strict`;
  return result === 'no' ? 'wrong' : 'unreachable';
}

/** Ends the session (see /logout in nginx/auth-*.conf.template); in Authentik mode also at Authentik. */
export async function signOut(): Promise<void> {
  signedIn = false;
  await leaveServiceWorker();
  window.location.assign('/logout');
}
