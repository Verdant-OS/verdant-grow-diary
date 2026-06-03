/**
 * QA Patch tests:
 * 1. Sensor snapshot attach toggle / strip contradiction fix.
 * 2. Note validation copy fix.
 *
 * These tests are purely unit/logic level — no React renders needed.
 */
import { describe, it, expect } from "vitest";
import { buildQuickLogSnapshotStrip } from "@/lib/quickLogSnapshotStripAdapter";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { evaluateQuickLogPreview, type QuickLogDraft } from "@/lib/quickLogPreviewRules";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NOW = new Date("2026-06-02T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function snap(partial: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "live",
    ts: minutesAgo(5),
    temp: 24.3,
    rh: 55,
    vpd: 1.12,
    ...partial,
  };
}

const baseDraft = (over: Partial<QuickLogDraft> = {}): QuickLogDraft => ({
  note: "Looking good.",
  eventType: "observation",
  stage: "veg",
  details: {},
  ...over,
});

// ---------------------------------------------------------------------------
// Issue 1 — Adapter: usable + attached=true (default) keeps original copy
// ---------------------------------------------------------------------------
describe("Adapter — usable + attached (default)", () => {
  it("title is 'Sensor context ready' when attached is true (default)", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap(), hasTent: true, now: NOW });
    expect(v.title).toBe("Sensor context ready");
  });

  it("description says 'This log will include current sensor context.' when attached", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap(), hasTent: true, now: NOW });
    expect(v.description).toBe("This log will include current sensor context.");
  });

  it("explicit attached=true produces the same result as omitting the prop", () => {
    const withProp = buildQuickLogSnapshotStrip({
      snapshot: snap(),
      hasTent: true,
      now: NOW,
      attached: true,
    });
    const withoutProp = buildQuickLogSnapshotStrip({ snapshot: snap(), hasTent: true, now: NOW });
    expect(withProp.title).toBe(withoutProp.title);
    expect(withProp.description).toBe(withoutProp.description);
  });
});

// ---------------------------------------------------------------------------
// Issue 1 — Adapter: usable + attached=false switches copy
// ---------------------------------------------------------------------------
describe("Adapter — usable + attached=false", () => {
  it("title switches to 'Sensor snapshot available'", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap(),
      hasTent: true,
      now: NOW,
      attached: false,
    });
    expect(v.title).toBe("Sensor snapshot available");
  });

  it("description does NOT say 'will include'", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap(),
      hasTent: true,
      now: NOW,
      attached: false,
    });
    expect(v.description).not.toMatch(/will include/i);
  });

  it("description tells the grower how to attach", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap(),
      hasTent: true,
      now: NOW,
      attached: false,
    });
    // Must mention the toggle by name (or equivalent guidance).
    expect(v.description).toMatch(/Attach sensor snapshot/i);
  });

  it("status remains 'usable' — attach flag does not change the classification", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap(),
      hasTent: true,
      now: NOW,
      attached: false,
    });
    expect(v.status).toBe("usable");
  });

  it("metrics are still present when attached=false (snapshot still loaded)", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap(),
      hasTent: true,
      now: NOW,
      attached: false,
    });
    expect(v.metrics.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Issue 1 — attached=false has no effect on non-usable statuses
// ---------------------------------------------------------------------------
describe("Adapter — attached=false on non-usable statuses", () => {
  it("stale copy is unchanged when attached=false", () => {
    const withFlag = buildQuickLogSnapshotStrip({
      snapshot: snap({ ts: minutesAgo(48 * 60) }),
      hasTent: true,
      now: NOW,
      attached: false,
    });
    const withoutFlag = buildQuickLogSnapshotStrip({
      snapshot: snap({ ts: minutesAgo(48 * 60) }),
      hasTent: true,
      now: NOW,
    });
    expect(withFlag.title).toBe(withoutFlag.title);
    expect(withFlag.description).toBe(withoutFlag.description);
  });

  it("no_data copy is unchanged when attached=false", () => {
    const withFlag = buildQuickLogSnapshotStrip({
      snapshot: snap(),
      hasTent: false,
      now: NOW,
      attached: false,
    });
    const withoutFlag = buildQuickLogSnapshotStrip({
      snapshot: snap(),
      hasTent: false,
      now: NOW,
    });
    expect(withFlag.title).toBe(withoutFlag.title);
    expect(withFlag.description).toBe(withoutFlag.description);
  });
});

// ---------------------------------------------------------------------------
// Issue 2 — Note validation: existing note shows positive feedback
// ---------------------------------------------------------------------------
describe("evaluateQuickLogPreview — note validation fix", () => {
  it("when note has text, does NOT show 'Add a quick note before saving.'", () => {
    const r = evaluateQuickLogPreview(baseDraft({ note: "Plants looking healthy." }));
    expect(r.warnings.some((w) => w.code === "note:missing")).toBe(false);
  });

  it("when note has text, shows 'note:captured' info", () => {
    const r = evaluateQuickLogPreview(baseDraft({ note: "Plants looking healthy." }));
    const captured = r.warnings.find((w) => w.code === "note:captured");
    expect(captured).toBeTruthy();
    expect(captured?.severity).toBe("info");
  });

  it("note:captured message is 'Note captured.'", () => {
    const r = evaluateQuickLogPreview(baseDraft({ note: "Some note." }));
    const captured = r.warnings.find((w) => w.code === "note:captured");
    expect(captured?.message).toBe("Note captured.");
  });

  it("note:captured does not set hasIssues to true", () => {
    const r = evaluateQuickLogPreview(baseDraft({ note: "Some note." }));
    expect(r.hasIssues).toBe(false);
  });

  it("whitespace-only note still triggers note:missing", () => {
    const r = evaluateQuickLogPreview(baseDraft({ note: "   " }));
    expect(r.warnings.some((w) => w.code === "note:missing")).toBe(true);
    expect(r.warnings.some((w) => w.code === "note:captured")).toBe(false);
  });

  it("empty note still triggers note:missing", () => {
    const r = evaluateQuickLogPreview(baseDraft({ note: "" }));
    expect(r.warnings.some((w) => w.code === "note:missing")).toBe(true);
  });

  it("note:captured does not echo user content in message", () => {
    const secret = "SECRET_PAYLOAD_XYZ";
    const r = evaluateQuickLogPreview(baseDraft({ note: secret }));
    for (const w of r.warnings) {
      expect(w.message).not.toContain(secret);
    }
  });
});

// ---------------------------------------------------------------------------
// Save gate: hasIssues must never block the Save button
// ---------------------------------------------------------------------------
describe("Save gate — save remains enabled", () => {
  it("note:captured does not set hasIssues (save stays enabled)", () => {
    const r = evaluateQuickLogPreview(baseDraft());
    expect(r.hasIssues).toBe(false);
  });

  it("note:missing (info) does not set hasIssues (save stays enabled)", () => {
    const r = evaluateQuickLogPreview(baseDraft({ note: "" }));
    expect(r.hasIssues).toBe(false);
  });
});
