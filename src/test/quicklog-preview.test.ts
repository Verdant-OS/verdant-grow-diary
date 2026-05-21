/**
 * Tests for the QuickLog details validation preview using the shared
 * diary normalization rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateQuickLogPreview,
  type QuickLogDraft,
} from "@/lib/quickLogPreviewRules";

const ROOT = resolve(__dirname, "../..");
const QUICKLOG = readFileSync(
  resolve(ROOT, "src/components/QuickLog.tsx"),
  "utf8",
);

const base = (over: Partial<QuickLogDraft> = {}): QuickLogDraft => ({
  note: "Watered.",
  eventType: "watering",
  stage: "veg",
  details: {},
  ...over,
});

describe("evaluateQuickLogPreview", () => {
  it("shows no severe warning for valid watering details", () => {
    const r = evaluateQuickLogPreview(
      base({ details: { ph: "6.2", ec: "1.4", watering: "500" } }),
    );
    expect(r.hasIssues).toBe(false);
    expect(r.warnings.every((w) => w.severity !== "warning")).toBe(true);
  });

  it("warns for invalid pH", () => {
    const r = evaluateQuickLogPreview(base({ details: { ph: "abc" } }));
    expect(r.warnings.some((w) => w.code === "ph:invalid")).toBe(true);
    expect(r.hasIssues).toBe(true);
  });

  it("warns for out-of-range pH", () => {
    const r = evaluateQuickLogPreview(base({ details: { ph: "99" } }));
    expect(r.warnings.some((w) => w.code === "ph:out-of-range")).toBe(true);
  });

  it("warns for invalid EC/TDS", () => {
    const r = evaluateQuickLogPreview(base({ details: { ec: "xyz" } }));
    expect(r.warnings.some((w) => w.code === "ec:invalid")).toBe(true);
  });

  it("marks high EC numbers as looking like PPM/TDS (info, not warning)", () => {
    const r = evaluateQuickLogPreview(base({ details: { ec: "800" } }));
    const ecWarn = r.warnings.find((w) => w.code === "ec:looks-like-tds");
    expect(ecWarn).toBeTruthy();
    expect(ecWarn?.severity).toBe("info");
    expect(r.hasIssues).toBe(false);
  });

  it("warns for invalid watering amount", () => {
    const r = evaluateQuickLogPreview(
      base({ details: { watering: "lots" } }),
    );
    expect(r.warnings.some((w) => w.code === "watering:invalid")).toBe(true);
  });

  it("warns for invalid runoff value", () => {
    const r = evaluateQuickLogPreview(base({ details: { runoff: "nope" } }));
    expect(r.warnings.some((w) => w.code === "runoff:invalid")).toBe(true);
  });

  it("warns for reminder event without remindAt", () => {
    const r = evaluateQuickLogPreview(
      base({ eventType: "reminder", remindAt: "" }),
    );
    expect(r.warnings.some((w) => w.code === "remind-at:missing")).toBe(true);
  });

  it("flags missing note as info-only", () => {
    const r = evaluateQuickLogPreview(base({ note: "" }));
    const noteWarn = r.warnings.find((w) => w.code === "note:missing");
    expect(noteWarn?.severity).toBe("info");
  });

  it("Timeline normalization remains compatible with QuickLog details", () => {
    const r = evaluateQuickLogPreview(
      base({ details: { ph: "6.2", ec: "1.4", watering: "500" } }),
    );
    // Shared normalizer must not flag valid pH/EC/watering coming from QuickLog.
    expect(r.normalizedWarnings).not.toContain("ph:invalid");
    expect(r.normalizedWarnings).not.toContain("ec:invalid");
    expect(r.normalizedWarnings).not.toContain("watering:invalid");
  });

  it("does not echo raw user input in warning messages", () => {
    const secret = "SECRET_PAYLOAD_XYZ";
    const r = evaluateQuickLogPreview(
      base({ note: secret, details: { ph: secret, ec: secret } }),
    );
    for (const w of r.warnings) {
      expect(w.message).not.toContain(secret);
      expect(w.message.length).toBeLessThan(120);
    }
  });

  it("tolerates null/undefined input safely", () => {
    expect(() => evaluateQuickLogPreview(null)).not.toThrow();
    expect(() => evaluateQuickLogPreview(undefined)).not.toThrow();
    const r = evaluateQuickLogPreview(undefined);
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});

describe("QuickLog component wiring", () => {
  it("imports the preview helper", () => {
    expect(QUICKLOG).toMatch(
      /from\s+["']@\/lib\/quickLogPreviewRules["']/,
    );
    expect(QUICKLOG).toMatch(/evaluateQuickLogPreview\s*\(/);
  });

  it("does not gate save on validation warnings (submit not blocked)", () => {
    // The submit Button's disabled prop should only depend on busy state.
    expect(QUICKLOG).toMatch(/disabled=\{busy\}/);
    expect(QUICKLOG).not.toMatch(/disabled=\{[^}]*preview[^}]*\}/);
    expect(QUICKLOG).not.toMatch(/disabled=\{[^}]*hasIssues[^}]*\}/);
  });

  it("does not change the diary_entries.details payload shape", () => {
    // Still inserts cleanDetails and still attaches event_type the same way.
    expect(QUICKLOG).toMatch(/cleanDetails\.event_type\s*=\s*eventType/);
    expect(QUICKLOG).toMatch(
      /supabase\.from\("diary_entries"\)\.insert\(/,
    );
  });

  it("does not introduce service_role or device-control surfaces", () => {
    expect(QUICKLOG).not.toMatch(/service_role/);
    expect(QUICKLOG).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator/i,
    );
  });
});
