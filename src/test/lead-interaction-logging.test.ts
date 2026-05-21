/**
 * Tests for manual lead interaction logging.
 *
 * Verifies:
 *  - The lead_events event_type CHECK constraint supports interaction types.
 *  - RLS on lead_events is still operator-only INSERT/SELECT with no
 *    UPDATE/DELETE policies (append-only).
 *  - The Leads page exposes a LogInteraction control wired to a hook.
 *  - useCreateLeadEvent inserts into public.lead_events only.
 *  - Follow-up changes write a follow_up_changed event via the page.
 *  - LeadActivity renders compact labels for each new event type.
 *  - The status-change trigger is preserved.
 *  - updateLead allow-list still excludes original submission fields.
 *  - No service_role / external-control / email / SMS / webhook strings.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  INTERACTION_EVENT_TYPES,
  INTERACTION_OPTIONS,
  describeFollowUpChange,
  followUpDidChange,
  isInteractionEventType,
  labelForEventType,
  normalizeFollowUp,
} from "@/lib/leadEventRules";

const root = resolve(__dirname, "..", "..");
const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

const MIGRATIONS_DIR = resolve(root, "supabase/migrations");
const migrationContents = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .join("\n\n");

import { readLeadDetailDrawerBundle } from "./_leadDrawerBundle";
const DRAWER = readLeadDetailDrawerBundle();
const PAGE = readSrc("pages/Leads.tsx") + "\n" + DRAWER;
const HOOK = readSrc("hooks/useLeadsList.ts");
const CREATE_HOOK = readSrc("hooks/useCreateLeadEvent.ts");
const RULES = readSrc("lib/leadEventRules.ts");

const ALL_INTERACTION = [
  "call_logged",
  "email_logged",
  "voicemail_logged",
  "meeting_logged",
  "note_added",
];

describe("lead_events event_type CHECK extension", () => {
  it("includes all interaction event types in the latest CHECK constraint", () => {
    // Use the LAST CHECK in migration history so later edits supersede earlier ones.
    const matches = [
      ...migrationContents.matchAll(
        /CONSTRAINT\s+lead_events_event_type_check[\s\S]*?CHECK\s*\(\s*event_type\s+IN\s*\(([\s\S]*?)\)\s*\)/gi,
      ),
    ];
    const inlineAlter = [
      ...migrationContents.matchAll(
        /ADD\s+CONSTRAINT\s+lead_events_event_type_check[\s\S]*?CHECK\s*\(\s*event_type\s+IN\s*\(([\s\S]*?)\)\s*\)/gi,
      ),
    ];
    const all = [...matches, ...inlineAlter];
    expect(all.length).toBeGreaterThan(0);
    const last = all[all.length - 1][1];
    for (const t of [
      "status_change",
      "note_added",
      "call_logged",
      "email_logged",
      "voicemail_logged",
      "meeting_logged",
      "follow_up_changed",
    ]) {
      expect(last).toMatch(new RegExp(`'${t}'`));
    }
  });
});

describe("lead_events RLS remains operator-only and append-only", () => {
  const policies =
    migrationContents.match(/CREATE POLICY[^;]*ON\s+public\.lead_events[^;]*;/gi) ?? [];

  it("has operator-only INSERT policy", () => {
    const inserts = policies.filter((p) => /FOR\s+INSERT/i.test(p));
    expect(inserts.length).toBeGreaterThan(0);
    for (const p of inserts) {
      expect(p).toMatch(/has_role[\s\S]*?'operator'/i);
      expect(p).not.toMatch(/\banon\b/);
    }
  });

  it("has operator-only SELECT policy", () => {
    const selects = policies.filter((p) => /FOR\s+SELECT/i.test(p));
    expect(selects.length).toBeGreaterThan(0);
    for (const p of selects) {
      expect(p).toMatch(/has_role[\s\S]*?'operator'/i);
      expect(p).not.toMatch(/\banon\b/);
    }
  });

  it("has no UPDATE policy", () => {
    for (const p of policies) expect(p).not.toMatch(/FOR\s+UPDATE/i);
  });

  it("has no DELETE policy", () => {
    for (const p of policies) expect(p).not.toMatch(/FOR\s+DELETE/i);
  });
});

describe("status_change trigger is preserved", () => {
  it("AFTER UPDATE trigger on leads still exists", () => {
    expect(migrationContents).toMatch(
      /CREATE TRIGGER\s+leads_log_status_change[\s\S]*?AFTER UPDATE[\s\S]*?ON\s+public\.leads/i,
    );
  });
});

describe("interaction rule helpers", () => {
  it("exports the expected interaction event types", () => {
    expect([...INTERACTION_EVENT_TYPES].sort()).toEqual([...ALL_INTERACTION].sort());
    for (const t of ALL_INTERACTION) expect(isInteractionEventType(t)).toBe(true);
    expect(isInteractionEventType("status_change")).toBe(false);
    expect(isInteractionEventType("nonsense")).toBe(false);
  });

  it("exposes operator-friendly labels for every event type", () => {
    expect(labelForEventType("call_logged")).toBe("Called");
    expect(labelForEventType("email_logged")).toBe("Emailed");
    expect(labelForEventType("voicemail_logged")).toBe("Voicemail");
    expect(labelForEventType("meeting_logged")).toBe("Meeting");
    expect(labelForEventType("note_added")).toBe("Note");
    expect(labelForEventType("follow_up_changed")).toBe("Follow-up changed");
    expect(labelForEventType("status_change")).toBe("Status changed");
  });

  it("INTERACTION_OPTIONS matches the allowed types and labels", () => {
    const values = INTERACTION_OPTIONS.map((o) => o.value).sort();
    expect(values).toEqual([...ALL_INTERACTION].sort());
  });

  it("detects follow-up changes ignoring equivalent ISO formats", () => {
    expect(followUpDidChange(null, null)).toBe(false);
    expect(followUpDidChange(null, "2026-06-01T10:00:00.000Z")).toBe(true);
    expect(followUpDidChange("2026-06-01T10:00:00.000Z", null)).toBe(true);
    expect(
      followUpDidChange(
        "2026-06-01T10:00:00.000Z",
        "2026-06-01T10:00:00Z",
      ),
    ).toBe(false);
    expect(normalizeFollowUp("bad-date")).toBe(null);
  });

  it("describes follow-up changes for the activity note", () => {
    expect(describeFollowUpChange(null, "2026-06-01T10:00:00Z")).toMatch(/set to/);
    expect(describeFollowUpChange("2026-06-01T10:00:00Z", null)).toMatch(/cleared/);
    expect(
      describeFollowUpChange("2026-06-01T10:00:00Z", "2026-06-02T10:00:00Z"),
    ).toMatch(/moved to/);
  });
});

describe("/leads UI exposes interaction logging", () => {
  it("imports the hook and rules helpers", () => {
    expect(PAGE).toMatch(/useCreateLeadEvent/);
    expect(PAGE).toMatch(/INTERACTION_OPTIONS/);
    expect(PAGE).toMatch(/labelForEventType/);
    expect(PAGE).toMatch(/followUpDidChange/);
    expect(PAGE).toMatch(/describeFollowUpChange/);
  });

  it("renders a LogInteraction control with select + note + log button", () => {
    expect(PAGE).toMatch(/data-testid="log-interaction"/);
    expect(PAGE).toMatch(/Log Interaction/i);
    expect(PAGE).toMatch(/placeholder="Optional note"/);
  });

  it("renders activity items with a data-event-type attribute for each event type", () => {
    expect(PAGE).toMatch(/data-event-type=\{ev\.event_type\}/);
  });

  it("creates a follow_up_changed event when follow_up_at changes", () => {
    expect(PAGE).toMatch(/eventType:\s*"follow_up_changed"/);
    // Only created when the value actually changed.
    expect(PAGE).toMatch(/followUpDidChange\(l\.follow_up_at,\s*next\)/);
  });

  it("does not write lead_events directly from the page or list hook", () => {
    expect(PAGE).not.toMatch(/\.from\(["']lead_events["']\)/);
    expect(HOOK).not.toMatch(/\.from\(["']lead_events["']\)/);
  });

  it("does not duplicate event-writing logic across React components", () => {
    // The insert lives only in the dedicated hook.
    const pageInserts = (PAGE.match(/from\(["']lead_events["']\)[\s\S]{0,80}\.insert/g) ?? []).length;
    const hookInserts = (HOOK.match(/from\(["']lead_events["']\)[\s\S]{0,80}\.insert/g) ?? []).length;
    const createInserts = (CREATE_HOOK.match(/from\(["']lead_events["']\)[\s\S]{0,80}\.insert/g) ?? []).length;
    expect(pageInserts).toBe(0);
    expect(hookInserts).toBe(0);
    expect(createInserts).toBeGreaterThan(0);
  });
});

describe("useCreateLeadEvent hook safety", () => {
  it("writes only to public.lead_events", () => {
    const fromCalls = CREATE_HOOK.match(/\.from\(["']([^"']+)["']\)/g) ?? [];
    expect(fromCalls.length).toBeGreaterThan(0);
    for (const c of fromCalls) {
      expect(c).toMatch(/\.from\(["']lead_events["']\)/);
    }
  });

  it("does not perform update/delete on lead_events", () => {
    expect(CREATE_HOOK).not.toMatch(/\.update\(/);
    expect(CREATE_HOOK).not.toMatch(/\.delete\(/);
  });
});

describe("submission fields remain immutable through updateLead", () => {
  it("allow-list excludes original lead submission fields", () => {
    const allowBlock =
      HOOK.match(/const ALLOWED\s*=\s*\[[\s\S]*?\]\s+as const;/)?.[0] ?? "";
    for (const forbidden of [
      "email",
      "name",
      "company",
      "role",
      "lead_type",
      "source",
      "message",
    ]) {
      expect(allowBlock).not.toMatch(new RegExp(`"${forbidden}"`));
    }
  });
});

describe("no external-control / email / SMS / webhook strings introduced", () => {
  for (const [name, blob] of [
    ["Leads page", PAGE],
    ["useCreateLeadEvent", CREATE_HOOK],
    ["leadEventRules", RULES],
  ] as const) {
    it(`${name} has no forbidden strings`, () => {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/external[-_ ]control/i);
      expect(blob).not.toMatch(/device[-_ ]command/i);
      expect(blob).not.toMatch(/\bwebhook\b/i);
      expect(blob).not.toMatch(/\bSMS\b/);
      // "email" appears as a lead field; restrict to outbound-email phrases.
      expect(blob).not.toMatch(/send[-_ ]?email/i);
      expect(blob).not.toMatch(/mailgun|sendgrid|twilio|resend\.com/i);
    });
  }
});
