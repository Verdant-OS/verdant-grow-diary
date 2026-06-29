/**
 * Evidence Ref Population v1 — write-path pure helper coverage.
 *
 * Verifies the narrow population path that forwards already-typed, persisted
 * `originating_timeline_events` from a source alert row into the derived
 * action_queue row (and from an in-memory suggestion column into a write).
 *
 * No I/O. No Supabase. No React. No automation. No device-control copy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  forwardAlertRefsToActionQueue,
  forwardInMemoryRefs,
} from "@/lib/originatingTimelineEventForwardRules";
import { FORBIDDEN_REF_FIELDS } from "@/lib/originatingTimelineEventAdapter";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

// ---------------------------------------------------------------------------
// A. Pure population — normalization, dedupe, sort, forbidden-field rejection
// ---------------------------------------------------------------------------

describe("Evidence Ref Population v1 — pure helper", () => {
  it("returns [] for absent / null / undefined / missing-column input", () => {
    expect(forwardAlertRefsToActionQueue(null)).toEqual([]);
    expect(forwardAlertRefsToActionQueue(undefined)).toEqual([]);
    expect(forwardAlertRefsToActionQueue({})).toEqual([]);
    expect(
      forwardAlertRefsToActionQueue({ originating_timeline_events: null }),
    ).toEqual([]);
    expect(
      forwardAlertRefsToActionQueue({ originating_timeline_events: "boom" }),
    ).toEqual([]);
  });

  it("forwards valid refs deterministically sorted by occurred_at then id", () => {
    const out = forwardAlertRefsToActionQueue({
      originating_timeline_events: [
        { id: "z", kind: "diary_entry", source: "manual" }, // null occurred_at -> last
        { id: "b", kind: "sensor_snapshot", source: "live", occurred_at: "2026-06-02T10:00:00Z" },
        { id: "a", kind: "grow_event", source: "csv", occurred_at: "2026-06-01T10:00:00Z" },
      ],
    });
    expect(out.map((e) => e.id)).toEqual(["a", "b", "z"]);
  });

  it("dedupes by id (first occurrence wins)", () => {
    const out = forwardAlertRefsToActionQueue({
      originating_timeline_events: [
        { id: "dup", kind: "grow_event", source: "manual" },
        { id: "dup", kind: "diary_entry", source: "csv" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe("manual");
  });

  it("maps unknown/unrecognized source to 'unknown'", () => {
    const out = forwardAlertRefsToActionQueue({
      originating_timeline_events: [
        { id: "a", kind: "grow_event", source: "made-up" },
        { id: "b", kind: "grow_event" /* missing */ },
      ],
    });
    expect(out.map((e) => e.source)).toEqual(["unknown", "unknown"]);
  });

  it("drops malformed entries (primitives, nulls, missing id)", () => {
    const out = forwardAlertRefsToActionQueue({
      originating_timeline_events: [
        null,
        "string",
        42,
        [],
        { noId: true },
        { id: "" },
        { id: 123 },
        { id: "ok", source: "manual" },
      ],
    });
    expect(out.map((e) => e.id)).toEqual(["ok"]);
  });

  it("rejects every entry that carries a forbidden secret-like field", () => {
    const SENTINEL = "VERDANT_FORBIDDEN_VALUE_SENTINEL_42";
    for (const field of FORBIDDEN_REF_FIELDS) {
      const out = forwardAlertRefsToActionQueue({
        originating_timeline_events: [
          { id: "leak", kind: "grow_event", source: "manual", [field]: SENTINEL },
          { id: "clean", kind: "grow_event", source: "manual" },
        ],
      });
      expect(out.map((e) => e.id)).toEqual(["clean"]);
      const json = JSON.stringify(out);
      expect(json).not.toContain(SENTINEL);
      expect(json.toLowerCase()).not.toContain(field.toLowerCase());
    }
  });

  it("forwardInMemoryRefs accepts a raw column array and sanitizes the same way", () => {
    const out = forwardInMemoryRefs([
      { id: "a", source: "manual", occurred_at: "2026-06-01T00:00:00Z" },
      { id: "a", source: "csv" }, // duplicate
      { id: "x", source: "manual", raw_payload: { token: "boom" } }, // forbidden
    ]);
    expect(out.map((e) => e.id)).toEqual(["a"]);
    expect(JSON.stringify(out)).not.toContain("boom");
  });

  it("forwardInMemoryRefs returns [] for non-array input", () => {
    expect(forwardInMemoryRefs(null)).toEqual([]);
    expect(forwardInMemoryRefs(undefined)).toEqual([]);
    expect(forwardInMemoryRefs({ id: "x" })).toEqual([]);
    expect(forwardInMemoryRefs("nope")).toEqual([]);
  });

  it("never invents refs from empty input — empty stays empty", () => {
    expect(
      forwardAlertRefsToActionQueue({
        id: "alert-123",
        grow_id: "grow-abc",
        tent_id: "tent-1",
        plant_id: "plant-1",
        metric: "vpd",
        reason: "VPD high — investigate",
        title: "VPD warning",
        originating_timeline_events: [],
      } as unknown as Parameters<typeof forwardAlertRefsToActionQueue>[0]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B. AlertDetail action_queue insert — uses the forward helper, not literal []
// ---------------------------------------------------------------------------

describe("Evidence Ref Population v1 — AlertDetail wiring", () => {
  const src = read("src/pages/AlertDetail.tsx");

  it("imports the forward helper", () => {
    expect(src).toMatch(
      /from\s+"@\/lib\/originatingTimelineEventForwardRules"/,
    );
    expect(src).toMatch(/forwardAlertRefsToActionQueue/);
  });

  it("passes forwarded refs into the action_queue insert payload", () => {
    expect(src).toMatch(
      /originating_timeline_events:\s*\n?\s*forwardAlertRefsToActionQueue\(alert\)/,
    );
  });

  it("does not regress to a literal [] originating_timeline_events on the alert→action insert", () => {
    // Locate the action_queue.insert(...) call site and assert no
    // `originating_timeline_events: []` literal lives inside it.
    const m = src.match(/\.from\("action_queue"\)\s*\.insert\(\{[\s\S]*?\}\)/);
    expect(m, "alert→action_queue insert call not found").not.toBeNull();
    expect(m![0]).not.toMatch(/originating_timeline_events:\s*\[\]/);
  });


  it("never infers refs from alert id, prose, metric, or timestamps at the insert site", () => {
    const m = src.match(/\.from\("action_queue"\)\s*\.insert\(\{[\s\S]*?\}\)/);
    expect(m, "alert→action_queue insert call not found").not.toBeNull();
    const block = m![0].toLowerCase();
    const payloadStart = block.indexOf("originating_timeline_events:");
    expect(payloadStart).toBeGreaterThan(-1);
    const payloadLine = block.slice(payloadStart, payloadStart + 200);
    const forbiddenInfer = [
      "[alert:",
      "raw_payload",
      "rawpayload",
      "service_role",
      "bridge_token",
      "api_token",
      "automatically execute",
      "auto execute",
      "send command",
      "set fan",
      "set light",
      "set irrigation",
      "dose nutrients",
    ];
    for (const phrase of forbiddenInfer) {
      expect(
        payloadLine.includes(phrase),
        `unexpected "${phrase}" near originating_timeline_events payload`,
      ).toBe(false);
    }
  });

});

// ---------------------------------------------------------------------------
// C. AI Doctor session → action_queue — still explicit [], documented
// ---------------------------------------------------------------------------

describe("Evidence Ref Population v1 — AI Doctor session path stays []", () => {
  const src = read(
    "src/hooks/useAddAiDoctorSessionSuggestionToActionQueue.ts",
  );

  it("persists an explicit empty array (no typed refs at this boundary)", () => {
    expect(src).toMatch(/originating_timeline_events:\s*\[\]/);
  });

  it("does not infer refs from session id, prose, timestamps, or model output", () => {
    const lower = src.toLowerCase();
    const forbidden = [
      "raw_payload",
      "service_role",
      "bridge_token",
      "api_token",
      "model_output",
      "prompt:",
      "completion:",
      "automatically execute",
      "auto execute",
      "send command",
      "set fan",
      "set light",
      "set irrigation",
      "dose nutrients",
    ];
    for (const phrase of forbidden) {
      expect(lower.includes(phrase), `unexpected "${phrase}"`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// D. saveAlert — already normalizes; no inference from non-ref fields
// ---------------------------------------------------------------------------

describe("Evidence Ref Population v1 — saveAlert input contract", () => {
  const src = read("src/lib/alerts.ts");

  it("normalizes refs before insert via the shared rules helper", () => {
    expect(src).toMatch(/normalizeOriginatingTimelineEvents\(/);
    expect(src).toMatch(
      /originating_timeline_events:\s*refs\s+as\s+unknown\s+as\s+never/,
    );
  });

  it("SaveAlertInput exposes the refs field but never accepts raw payload", () => {
    expect(src).toMatch(/originating_timeline_events\?:/);
    const lower = src.toLowerCase();
    expect(lower).not.toContain("raw_payload");
    expect(lower).not.toContain("service_role");
    expect(lower).not.toContain("bridge_token");
    expect(lower).not.toContain("api_token");
  });
});

// ---------------------------------------------------------------------------
// E. Static safety — forward helper module is import-clean
// ---------------------------------------------------------------------------

describe("Evidence Ref Population v1 — forward helper static safety", () => {
  const src = read("src/lib/originatingTimelineEventForwardRules.ts");
  const lower = src.toLowerCase();

  it("is pure — no Supabase / fetch / React / AI / automation imports", () => {
    expect(src).not.toMatch(/from\s+"@\/integrations\/supabase\/client"/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/from\s+"react"/);
    expect(src).not.toMatch(/functions\.invoke/);
  });

  it("contains no banned safety phrases", () => {
    const banned = [
      "raw_payload",
      "service_role",
      "bridge_token",
      "api_token",
      "model_output",
      "automatically executed",
      "auto-execute",
      "auto execute",
      "send command",
      "set fan",
      "set light",
      "set irrigation",
      "dose nutrients",
      "guaranteed",
      "definitely",
      "certain diagnosis",
    ];
    for (const phrase of banned) {
      expect(lower.includes(phrase), `unexpected "${phrase}"`).toBe(false);
    }
  });

  it("never co-locates 'healthy' with invalid/stale/demo/csv/unknown/untrusted", () => {
    const risky = ["invalid", "stale", "demo", "csv", "unknown", "untrusted"];
    for (const word of risky) {
      const re = new RegExp(`healthy[\\s\\S]{0,40}${word}|${word}[\\s\\S]{0,40}healthy`, "i");
      expect(re.test(src)).toBe(false);
    }
  });
});
