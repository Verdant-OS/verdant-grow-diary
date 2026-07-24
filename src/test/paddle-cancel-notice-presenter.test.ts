/**
 * Unit tests for the pure paddleCancelNoticePresenter (Code #5).
 *
 * PURE presenter — no React, no Supabase, no access-rule side effects.
 * The notice is DISPLAY-ONLY; it never mutates entitlements or overrides
 * paddleSubscriptionAccessRules.
 */
import { describe, it, expect } from 'vitest';
import {
  derivePaddleCancelNotice,
  type PaddleCancelNoticeInput,
} from '@/lib/paddleCancelNoticePresenter';

const BASE: PaddleCancelNoticeInput = {
  paddle_subscription_id: 'sub_abc',
  status: 'active',
  cancel_at_period_end: false,
  scheduled_change_action: null,
  scheduled_change_at: null,
  current_period_end: '2026-09-01T00:00:00.000Z',
};

describe('derivePaddleCancelNotice — Code #5 presenter', () => {
  it('hidden when nothing is scheduled', () => {
    expect(derivePaddleCancelNotice(BASE).visible).toBe(false);
  });

  it('hidden for null row', () => {
    expect(derivePaddleCancelNotice(null).visible).toBe(false);
    expect(derivePaddleCancelNotice(undefined).visible).toBe(false);
  });

  it('visible with scheduled_change_at when scheduled_change_action=cancel', () => {
    const n = derivePaddleCancelNotice(
      { ...BASE, scheduled_change_action: 'cancel', scheduled_change_at: '2026-08-15T00:00:00.000Z' },
      'en-US',
    );
    expect(n.visible).toBe(true);
    expect(n.reason).toBe('scheduled_change_cancel');
    expect(n.accessUntilIso).toBe('2026-08-15T00:00:00.000Z');
    expect(n.accessUntilLabel).toMatch(/2026/);
  });

  it('visible with current_period_end fallback when cancel_at_period_end=true', () => {
    const n = derivePaddleCancelNotice(
      { ...BASE, cancel_at_period_end: true, scheduled_change_at: null },
      'en-US',
    );
    expect(n.visible).toBe(true);
    expect(n.reason).toBe('cancel_at_period_end');
    expect(n.accessUntilIso).toBe('2026-09-01T00:00:00.000Z');
  });

  it('scheduled_change_at wins over current_period_end when both present', () => {
    const n = derivePaddleCancelNotice({
      ...BASE,
      cancel_at_period_end: true,
      scheduled_change_action: 'cancel',
      scheduled_change_at: '2026-08-10T00:00:00.000Z',
      current_period_end: '2026-09-01T00:00:00.000Z',
    });
    expect(n.accessUntilIso).toBe('2026-08-10T00:00:00.000Z');
  });

  it('lifetime pseudo-rows never show the notice, even if flags are set', () => {
    const n = derivePaddleCancelNotice({
      paddle_subscription_id: 'lifetime_txn_01xyz',
      cancel_at_period_end: true,
      scheduled_change_action: 'cancel',
      scheduled_change_at: '2026-08-15T00:00:00.000Z',
      current_period_end: null,
    });
    expect(n.visible).toBe(false);
  });

  it('handles missing / malformed dates without throwing (visible, no label)', () => {
    const n = derivePaddleCancelNotice({
      ...BASE,
      cancel_at_period_end: true,
      scheduled_change_at: 'not-a-date',
      current_period_end: null,
    });
    expect(n.visible).toBe(true);
    expect(n.accessUntilIso).toBeNull();
    expect(n.accessUntilLabel).toBe('');
  });

  it('does not fire on a plain active row', () => {
    const n = derivePaddleCancelNotice({ ...BASE, status: 'active' });
    expect(n.visible).toBe(false);
  });

  it('regression: presenter shape is stable (no fields leak beyond contract)', () => {
    const n = derivePaddleCancelNotice({
      ...BASE,
      cancel_at_period_end: true,
    });
    expect(Object.keys(n).sort()).toEqual(
      ['accessUntilIso', 'accessUntilLabel', 'reason', 'visible'].sort(),
    );
  });
});
