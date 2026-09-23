/**
 * The volunteer key is sha256(volunteer password). The proxy compares it with
 * its own hash of the password and only then lets volunteer-only API calls
 * through (see src/lib/apiAccess.ts). The password itself is never stored.
 */

import { VOLUNTEER_CHECK_PATH } from '../lib/apiAccess';

const STORAGE_KEY = 'volunteerKey';

/** Fired when the proxy rejects the stored key, e.g. after a password change. */
export const VOLUNTEER_AUTH_FAILED = 'volunteer-auth-failed';

// Read lazily: importing this module must not touch localStorage.
let current: string | null | undefined;

export function getVolunteerKey(): string | null {
  if (current === undefined) current = localStorage.getItem(STORAGE_KEY);
  return current;
}

export function setVolunteerKey(key: string | null): void {
  current = key;
  if (key) localStorage.setItem(STORAGE_KEY, key);
  else localStorage.removeItem(STORAGE_KEY);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Asks the proxy whether the password is right; stores the key if so. */
export async function logInVolunteer(password: string): Promise<'ok' | 'wrong' | 'unreachable'> {
  const key = await sha256Hex(password);
  try {
    const res = await fetch(VOLUNTEER_CHECK_PATH, { headers: { 'X-Volunteer-Key': key } });
    if (res.status === 204) {
      setVolunteerKey(key);
      return 'ok';
    }
    return res.status === 401 ? 'wrong' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
