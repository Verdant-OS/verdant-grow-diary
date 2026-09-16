import { describe, expect, it } from "vitest";
import {
  resolveCsvHistoryWindow,
  buildCsvHistoryWindowPreview,
  csvHistoryWindowNotice,
} from "@/lib/csvHistoryWindowRules";
import type { LovableSubscriptionRow } from "@/lib/entitlements";

const now = new Date("2026-09-15T12:00:00Z");
const row = (overrides: Partial<LovableSubscriptionRow> = {}): LovableSubscriptionRow => ({
  user_id: "owner",
  environment: "live",
  price_id: "pro_monthly",
  status: "active",
  current_period_end: "2026-10-15T12:00:00Z",
  paddle_subscription_id: "sub_test",
  paddle_customer_id: "",
  product_id: "",
  ...overrides,
});

describe("CSV history access uses the live policy contract", () => {
  it("resolves an established empty subscription read to the Free window", () => {
    expect(resolveCsvHistoryWindow([], now)).toEqual({ status: "ready", days: 90 });
  });
  it.each([
    { price_id: "pro_monthly" },
    { price_id: "pro_annual" },
    { price_id: "craft_monthly" },
    { price_id: "craft_annual" },
    { status: "trialing" },
    { status: "canceled" },
    { status: "past_due", current_period_end: "2026-09-01T00:00:00Z" },
    {
      price_id: "founder_lifetime",
      paddle_subscription_id: "lifetime_test",
      current_period_end: null,
    },
  ])("recognizes an eligible live row: %j", (overrides) => {
    expect(resolveCsvHistoryWindow([row(overrides)], now)).toEqual({ status: "ready", days: null });
  });
  it.each([
    { environment: "sandbox" },
    { status: "paused" },
    { price_id: "unknown" },
    { current_period_end: "2026-09-15T12:00:00Z" },
    { current_period_end: null },
    { current_period_end: "invalid" },
    { price_id: "founder_lifetime", current_period_end: null },
    {
      price_id: "founder_lifetime",
      paddle_subscription_id: "lifetime_test",
      current_period_end: null,
      status: "canceled",
    },
  ])("does not present unbounded history for a non-entitling row: %j", (overrides) => {
    expect(resolveCsvHistoryWindow([row(overrides)], now)).toEqual({ status: "ready", days: 90 });
  });
  it("keeps older live Lifetime evidence despite a newer canceled recurring row", () => {
    expect(
      resolveCsvHistoryWindow(
        [
          row({ status: "canceled", current_period_end: "2026-09-01T00:00:00Z" }),
          row({
            price_id: "founder_lifetime",
            paddle_subscription_id: "lifetime_test",
            current_period_end: null,
          }),
        ],
        now,
      ),
    ).toEqual({ status: "ready", days: null });
  });
  it("does not infer Free from a truncated subscription scan", () => {
    const rows = Array.from({ length: 21 }, () => row({ status: "expired" }));
    expect(resolveCsvHistoryWindow(rows, now)).toEqual({ status: "unknown" });
    expect(resolveCsvHistoryWindow([...rows, row()], now)).toEqual({ status: "ready", days: null });
  });
  it("does not infer Free when the subscription scan contains a null row", () => {
    expect(resolveCsvHistoryWindow([null as unknown as LovableSubscriptionRow], now)).toEqual({
      status: "unknown",
    });
  });
  it("still recognizes entitling live rows when the scan also contains a null row", () => {
    expect(
      resolveCsvHistoryWindow([null as unknown as LovableSubscriptionRow, row()], now),
    ).toEqual({ status: "ready", days: null });
  });
  it("counts observations at the exact boundary without changing the source rows", () => {
    const rows = Object.freeze([
      Object.freeze({ captured_at: "2026-06-17T11:59:59.999Z" }),
      Object.freeze({ captured_at: "2026-06-17T12:00:00.000Z" }),
      Object.freeze({ captured_at: "2026-06-17T12:00:00.001Z" }),
    ]);
    expect(buildCsvHistoryWindowPreview(rows, { status: "ready", days: 90 }, now)).toEqual({
      outsideCount: 1,
      observationCount: 3,
    });
    expect(buildCsvHistoryWindowPreview(rows, { status: "ready", days: null }, now)).toBeNull();
    expect(buildCsvHistoryWindowPreview(rows, { status: "error" }, now)).toBeNull();
  });
  it.each(["loading", "paused"] as const)(
    "does not preview outside-window counts while access is %s",
    (status) => {
      const rows = Object.freeze([Object.freeze({ captured_at: "2026-06-17T11:59:59.999Z" })]);
      expect(buildCsvHistoryWindowPreview(rows, { status }, now)).toBeNull();
    },
  );
  it("ignores unparseable observation timestamps when counting outside-window rows", () => {
    const rows = Object.freeze([
      Object.freeze({ captured_at: "not-a-date" }),
      Object.freeze({ captured_at: "2026-06-17T11:59:59.999Z" }),
    ]);
    expect(buildCsvHistoryWindowPreview(rows, { status: "ready", days: 90 }, now)).toEqual({
      outsideCount: 1,
      observationCount: 2,
    });
  });
});

describe("csvHistoryWindowNotice copy", () => {
  it.each([
    {
      window: { status: "loading" } as const,
      includes: "Checking your sensor history window",
    },
    {
      window: { status: "paused" } as const,
      includes: "Waiting for a connection to check your sensor history window",
    },
    {
      window: { status: "error" } as const,
      includes: "We couldn't verify your sensor history window",
    },
    {
      window: { status: "unknown" } as const,
      includes: "We couldn't verify your sensor history window",
    },
    {
      window: { status: "ready", days: null } as const,
      includes: "no plan time limit for sensor history",
    },
    {
      window: { status: "ready", days: 90 } as const,
      includes: "sensor history covers the last 90 days",
    },
  ])("describes $window.status access honestly", ({ window, includes }) => {
    expect(csvHistoryWindowNotice(window)).toContain(includes);
  });
});
