/**
 * Unit tests for the paddle-portal-session client (Code #6).
 *
 * Verifies the client distinguishes the "Founder Lifetime — nothing to
 * manage" error code from the generic "no active subscription" one, so the
 * UI never shows the misleading "no active paid subscription" message to a
 * lifetime-only account.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  openPaddleCustomerPortal,
  PORTAL_LIFETIME_ONLY_MESSAGE,
  PORTAL_NO_SUBSCRIPTION_MESSAGE,
  PORTAL_UNAVAILABLE_MESSAGE,
  portalErrorMessage,
} from '@/lib/customerPortal';

beforeEach(() => {
  invokeMock.mockReset();
  vi.stubGlobal('open', vi.fn());
});

describe('customerPortal — Code #6 lifetime_only reason', () => {
  it('lifetime_only body → distinct code + friendly copy (not "no active subscription")', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { status: 404, body: { error: 'lifetime_only' } } },
    });
    const res = await openPaddleCustomerPortal();
    expect(res.ok).toBe(false);
    expect(res.code).toBe('lifetime_only');
    expect(res.error).toBe(PORTAL_LIFETIME_ONLY_MESSAGE);
    expect(res.error).not.toMatch(/no active paid subscription/i);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('lifetime_only as JSON string body still resolves correctly', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { status: 404, body: JSON.stringify({ error: 'lifetime_only' }) } },
    });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe('lifetime_only');
  });

  it('no_subscription body → generic "no active paid subscription" copy', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { status: 404, body: { error: 'no_subscription' } } },
    });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe('no_subscription');
    expect(res.error).toBe(PORTAL_NO_SUBSCRIPTION_MESSAGE);
  });

  it('legacy 404 with no body still maps to no_subscription (back-compat)', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { status: 404 } },
    });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe('no_subscription');
  });

  it('happy path: url opens in a new tab with noopener,noreferrer', async () => {
    invokeMock.mockResolvedValue({
      data: { url: 'https://customer-portal.paddle.com/abc' },
      error: null,
    });
    const res = await openPaddleCustomerPortal();
    expect(res.ok).toBe(true);
    expect(window.open).toHaveBeenCalledWith(
      'https://customer-portal.paddle.com/abc',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('unknown failures degrade to PORTAL_UNAVAILABLE_MESSAGE', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { status: 500 } },
    });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe('unavailable');
    expect(res.error).toBe(PORTAL_UNAVAILABLE_MESSAGE);
  });

  it('portalErrorMessage maps every code deterministically', () => {
    expect(portalErrorMessage('lifetime_only')).toBe(PORTAL_LIFETIME_ONLY_MESSAGE);
    expect(portalErrorMessage('no_subscription')).toBe(PORTAL_NO_SUBSCRIPTION_MESSAGE);
    expect(portalErrorMessage('unavailable')).toBe(PORTAL_UNAVAILABLE_MESSAGE);
  });
});
