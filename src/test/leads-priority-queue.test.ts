/**
 * Tests for the read-only Lead Priority Queue.
 *
 * Covers happy-path ranking, terminal closed/spam leads ranking low,
 * missing/invalid fields, deterministic tie-breakers, empty input, and
 * compatibility with leadNextActionRules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPriorityQueue,
  buildPriorityQueueItem,
} from "@/lib/leadPriorityQueueRules";
import { recommendNextAction } from "@/lib/leadNextActionRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadPriorityQueueRules.ts");
const COMPONENT = readSrc("components/LeadPriorityQueuePanel.tsx");
const PAGE = readSrc("pages/Leads.tsx");

const NOW = new Date("2026-05-10T12:00:00Z").getTime();

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-x",
    created_at: "2026-05-09T12:00:00Z",
    updated_at: null,
    name: "Ada",
    email: "ada@example.com",
    company: null,
    role: null,
    lead_type: "investor",
    source: "landing",
    message: null,
    status: "new",
    operator_notes: null,
    contacted_at: null,
    follow_up_at: null,
    ...over,
  };
}

describe("buildPriorityQueue — happy-path ranking", () => {
  it("ranks overdue follow-up above new leads above closed leads", () => {
    const overdue = lead({
      id: "a",
      status: "follow_up",
      follow_up_at: "2026-05-05T12:00:00Z",
      contacted_at: "2026-05-01T12:00:00Z",
    });
    const fresh = lead({ id: "b", status: "new" });
    const done = lead({ id: "c", status: "closed" });
    const ranked = buildPriorityQueue([done, fresh, overdue], NOW).map(
      (i) => i.leadId,
    );
    expect(ranked[0]).toBe("a");
    expect(ranked[ranked.length - 1]).toBe("c");
  });

  it("returns one queue item per input lead with safe labels", () => {
    const items = buildPriorityQueue(
      [lead({ id: "a", name: "  " }), lead({ id: "b", name: null })],
      NOW,
    );
    expect(items.length).toBe(2);
    expect(items.every((i) => i.label.length > 0)).toBe(true);
  });
});

describe("buildPriorityQueue — terminal states rank lowest", () => {
  it("closed and spam end up with priority 'none'", () => {
    const items = buildPriorityQueue(
      [lead({ id: "a", status: "closed" }), lead({ id: "b", status: "spam" })],
      NOW,
    );
    expect(items.every((i) => i.priority === "none")).toBe(true);
  });

  it("active leads are ranked above closed/spam", () => {
    const items = buildPriorityQueue(
      [
        lead({ id: "c", status: "closed" }),
        lead({ id: "a", status: "new" }),
        lead({ id: "s", status: "spam" }),
      ],
      NOW,
    );
    expect(items[0].leadId).toBe("a");
  });
});

describe("buildPriorityQueue — safety and ambiguity", () => {
  it("missing name falls back to email then to 'Unknown lead'", () => {
    const i1 = buildPriorityQueueItem(
      lead({ id: "a", name: null }),
      NOW,
    );
    expect(i1.label).toBe("ada@example.com");
    const i2 = buildPriorityQueueItem(
      lead({ id: "b", name: null, email: "" as unknown as string }),
      NOW,
    );
    expect(i2.label).toBe("Unknown lead");
  });

  it("unknown status surfaces warnings rather than ranking as healthy", () => {
    const item = buildPriorityQueueItem(
      lead({ status: "weird" as unknown as LeadRow["status"] }),
      NOW,
    );
    expect(item.actionType).toBe("review_manually");
    expect(item.warnings.length).toBeGreaterThan(0);
    expect(item.priority).not.toBe("none");
  });

  it("missing/invalid created_at and missing source/type still produce a deterministic item", () => {
    const a = buildPriorityQueueItem(
      lead({
        created_at: "" as unknown as string,
        source: "   ",
        lead_type: "",
      }),
      NOW,
    );
    const b = buildPriorityQueueItem(
      lead({
        created_at: "" as unknown as string,
        source: "   ",
        lead_type: "",
      }),
      NOW,
    );
    expect(a).toEqual(b);
    expect(a.warnings.join(" ")).toMatch(/source|lead type|created_at/i);
  });

  it("empty input returns empty queue", () => {
    expect(buildPriorityQueue([], NOW)).toEqual([]);
  });
});

describe("buildPriorityQueue — deterministic tie-breakers", () => {
  it("breaks priority ties by createdAt ascending then by leadId lexically", () => {
    const older = lead({
      id: "z-old",
      status: "new",
      created_at: "2026-05-01T12:00:00Z",
    });
    const newer = lead({
      id: "a-new",
      status: "new",
      created_at: "2026-05-08T12:00:00Z",
    });
    const ranked = buildPriorityQueue([newer, older], NOW).map(
      (i) => i.leadId,
    );
    // older leads outrank newer ones at the same priority
    expect(ranked[0]).toBe("z-old");
  });

  it("identical leads sort by lead id lexically", () => {
    const a = lead({ id: "aaa", status: "new" });
    const b = lead({ id: "bbb", status: "new" });
    const ranked = buildPriorityQueue([b, a], NOW).map((i) => i.leadId);
    expect(ranked).toEqual(["aaa", "bbb"]);
  });

  it("produces identical output across repeated calls", () => {
    const leads = [
      lead({ id: "a", status: "new" }),
      lead({
        id: "b",
        status: "follow_up",
        follow_up_at: "2026-05-05T12:00:00Z",
      }),
      lead({ id: "c", status: "closed" }),
    ];
    const r1 = buildPriorityQueue(leads, NOW);
    const r2 = buildPriorityQueue(leads, NOW);
    expect(r1).toEqual(r2);
  });
});

describe("compatibility with leadNextActionRules", () => {
  it("reuses recommendNextAction output for action label and priority", () => {
    const l = lead({
      status: "follow_up",
      follow_up_at: "2026-05-05T12:00:00Z",
    });
    const rec = recommendNextAction(l, NOW);
    const item = buildPriorityQueueItem(l, NOW);
    expect(item.actionType).toBe(rec.type);
    expect(item.actionLabel).toBe(rec.label);
    expect(item.priority).toBe(rec.priority);
    expect(item.reason).toBe(rec.reason);
  });
});

describe("wiring and safety contracts", () => {
  it("LeadPriorityQueuePanel is mounted on the Leads page", () => {
    expect(PAGE).toMatch(/LeadPriorityQueuePanel/);
    expect(PAGE).toMatch(/from "@\/components\/LeadPriorityQueuePanel"/);
  });

  it("does not alter analytics, saved-views, or filter wiring", () => {
    expect(PAGE).toMatch(/LeadAnalyticsPanel/);
    expect(PAGE).toMatch(/LeadSavedViewsMenu/);
    expect(PAGE).toMatch(/QUICK_FILTERS/);
  });

  for (const [name, blob] of [
    ["rules", RULES],
    ["component", COMPONENT],
  ] as const) {
    it(`${name} has no forbidden strings`, () => {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/\bwebhook\b/i);
      expect(blob).not.toMatch(/\bSMS\b/);
      expect(blob).not.toMatch(/send[-_ ]?email/i);
      expect(blob).not.toMatch(/mailgun|sendgrid|twilio|resend\.com/i);
      expect(blob).not.toMatch(/from "@\/integrations\/supabase/);
    });
  }
});
