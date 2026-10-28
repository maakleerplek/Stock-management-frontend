/**
 * Who may call which InvenTree endpoint through the proxy.
 *
 * The proxy holds the InvenTree token; the browser never sees it. Anyone at the
 * till may read the catalogue and look up a barcode; the sale itself goes
 * to the checkout server (core/checkout.py, /api/checkout/), which holds its own token. Everything else needs a
 * volunteer session: signed in through Authentik via oauth2-proxy, or on a
 * test server the shared volunteer password (AUTH_MODE=password).
 *
 * nginx.conf.template enforces the same rules in production; the Vite dev
 * server imports this module. Keep the two in step.
 */

/** The one write the till needs on InvenTree: a barcode lookup (a POST). */
export const CHECKOUT_WRITE = /^\/api\/barcode\/$/;

/** Catalogue anyone may read. */
export const PUBLIC_READ = /^\/api\/(part|stock|company|order|barcode)\/|^\/api\/parameter\/template\/$/;
// /api/parameter/ itself: in production only the 3D-print price template is public
// (nginx, PRINT_PRICE_TEMPLATE); here it stays volunteer-only, prices then fall back to the default.

export const VOLUNTEER_CHECK_PATH = '/api/auth/check/';
/** Answers {"mode": "authentik" | "password"}: which sign-in the server uses. */
export const AUTH_MODE_PATH = '/api/auth/mode/';
/** Password mode: sha256 of the volunteer password, checked by the proxy. */
export const VOLUNTEER_KEY_COOKIE = 'volunteer_key';

export type AuthMode = 'authentik' | 'password';

export type Access = 'public' | 'volunteer';

/** `path` without the query string. */
export function requiredAccess(method: string, path: string): Access {
  const m = method.toUpperCase();
  if (CHECKOUT_WRITE.test(path)) return 'public';
  if ((m === 'GET' || m === 'HEAD') && PUBLIC_READ.test(path)) return 'public';
  return 'volunteer';
}
