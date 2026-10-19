/**
 * Logged at must follow the server logged_at contract. An impossible calendar
 * day and a zone-less timestamp are omitted, not normalized into a plausible time.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { describe, expect, it } from "vitest";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";

function loggedAtLine(loggedAt: string) {
  return presentTimelineDiaryEntryDetails(
    { event_type: "photo", logged_at: loggedAt },
    "fahrenheit",
  ).detailLines;
}

describe("timeline logged_at uses the server contract", () => {
  it("omits an impossible calendar day instead of normalizing it", () => {
    expect(loggedAtLine("2026-02-30T08:00:00Z")).toEqual([]);
  });

  it("omits a zone-less timestamp", () => {
    expect(loggedAtLine("2026-10-10T09:15:03")).toEqual([]);
  });
});
