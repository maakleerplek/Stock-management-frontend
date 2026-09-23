/**
 * Who may call which InvenTree endpoint through the proxy.
 *
 * The proxy holds the InvenTree token; the browser never sees it. Anyone at the
 * till may read the catalogue and run a checkout. Everything else needs the
 * volunteer key (SHA-256 of the volunteer password) in the X-Volunteer-Key header.
 *
 * nginx.conf.template enforces the same rules in production; the Vite dev
 * server imports this module. Keep the two in step.
 */

/** Writes the till needs: barcode lookups and the checkout sales order. */
export const CHECKOUT_WRITE =
  /^\/api\/(barcode\/|order\/so\/(shipment\/(\d+\/ship\/)?|\d+\/(issue|allocate|complete|cancel)\/)?|order\/so-line\/|order\/so-extra-line\/)$/;

/** Catalogue anyone may read. */
export const PUBLIC_READ = /^\/api\/(part|stock|company|order|barcode)\//;

export const VOLUNTEER_CHECK_PATH = '/api/auth/check/';
export const VOLUNTEER_HEADER = 'x-volunteer-key';

export type Access = 'public' | 'volunteer';

/** `path` without the query string. */
export function requiredAccess(method: string, path: string): Access {
  const m = method.toUpperCase();
  if (CHECKOUT_WRITE.test(path)) return 'public';
  if ((m === 'GET' || m === 'HEAD') && PUBLIC_READ.test(path)) return 'public';
  return 'volunteer';
}
