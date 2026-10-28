import { describe, it, expect } from 'vitest';
import { requiredAccess } from '../src/lib/apiAccess';

describe('requiredAccess', () => {
  it('lets the till read the catalogue', () => {
    expect(requiredAccess('GET', '/api/part/')).toBe('public');
    expect(requiredAccess('GET', '/api/stock/12/')).toBe('public');
    expect(requiredAccess('GET', '/api/company/part/')).toBe('public');
  });

  it('lets the till look up a barcode; sales orders go through the till server', () => {
    expect(requiredAccess('POST', '/api/barcode/')).toBe('public');
    for (const path of [
      '/api/order/so/',
      '/api/order/so-line/',
      '/api/order/so-extra-line/',
      '/api/order/so/7/issue/',
      '/api/order/so/7/cancel/',
      '/api/order/so/shipment/3/ship/',
    ]) expect(requiredAccess('POST', path), path).toBe('volunteer');
  });

  it('keeps other writes for volunteers', () => {
    expect(requiredAccess('POST', '/api/stock/add/')).toBe('volunteer');
    expect(requiredAccess('POST', '/api/stock/remove/')).toBe('volunteer');
    expect(requiredAccess('PATCH', '/api/part/8/')).toBe('volunteer');
    expect(requiredAccess('POST', '/api/company/')).toBe('volunteer');
    expect(requiredAccess('DELETE', '/api/order/so/7/')).toBe('volunteer');
    expect(requiredAccess('POST', '/api/barcode/link/')).toBe('volunteer');
    expect(requiredAccess('POST', '/api/order/po/')).toBe('volunteer');
  });

  it('keeps users, settings and everything unlisted for volunteers, even to read', () => {
    expect(requiredAccess('GET', '/api/user/')).toBe('volunteer');
    expect(requiredAccess('GET', '/api/settings/global/')).toBe('volunteer');
    expect(requiredAccess('GET', '/api/')).toBe('volunteer');
  });
});
