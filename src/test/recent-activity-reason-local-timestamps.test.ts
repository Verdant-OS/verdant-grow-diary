/**
 * Codex P2 on #2270 (r4327944102): an approved/rejected alert-derived action
 * with no audit note falls back to the stored `parent.reason` for the Recent
 * Activity detail. Dashboard and grow detail must show it in local time with
 * no `[alert:...]` token, exactly like the pending action card.
 *
 * @source-scan-justified: the wiring assertions below check that each hook
 * routes the parent-reason fallback through the display helper; rendering the
 * hooks would require mocking every Supabase query they issue.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatActionReasonForDisplay } from "@/lib/actionQueueRowView";

const STORED_REASON =
  "VPD out of range in Tent A. Reading at 2026-10-19T07:52:26.706Z. [alert:7f0c2b6e-1111-4c4c-9d9d-0123456789ab]";

describe("Recent Activity action-reason detail (#2270)", () => {
  it("localizes Reading at and strips the alert back-pointer", () => {
    const detail = formatActionReasonForDisplay(STORED_REASON);
    expect(detail).toContain("Reading at");
    expect(detail).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(detail).not.toContain("[alert:");
    expect(detail).toContain("VPD out of range in Tent A.");
  });

  it("returns null for a missing or empty reason", () => {
    expect(formatActionReasonForDisplay(null)).toBeNull();
    expect(formatActionReasonForDisplay(undefined)).toBeNull();
    expect(formatActionReasonForDisplay("")).toBeNull();
  });

  it.each(["src/hooks/useDashboardScopedData.ts", "src/hooks/useGrowDetailData.ts"])(
    "%s keeps audit notes and formats only the parent-reason fallback",
    (file) => {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src).toContain("detail: e.note ?? formatActionReasonForDisplay(parent?.reason),");
      expect(src).not.toContain("parent?.reason ?? null");
    },
  );
});
