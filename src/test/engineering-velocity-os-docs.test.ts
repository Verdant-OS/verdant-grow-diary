/**
 * Static-safety doc test: verifies the Engineering Velocity OS scaffold
 * exists and mentions the non-negotiable safety invariants for Verdant.
 *
 * This is a documentation test — it does not exercise app code and does
 * not change schema, RLS, auth, or edge functions. It exists so the
 * scaffold cannot silently drift away from the One-Tent Loop safety
 * envelope.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

const FILES = {
  velocity: "docs/engineering-velocity-os.md",
  dorDod: "docs/definition-of-ready-done.md",
  eventMap: "docs/v0-loop-event-map.md",
  linearTpl: "templates/linear-issue-template.md",
  cursorTpl: "templates/cursor-task-template.md",
} as const;

function read(rel: string): string {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

describe("Engineering Velocity OS scaffold", () => {
  for (const [key, rel] of Object.entries(FILES)) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(ROOT, rel))).toBe(true);
      void key;
    });
  }

  const all = Object.values(FILES).map(read).join("\n\n");

  it("mentions the One-Tent Loop", () => {
    expect(all).toMatch(/One-Tent Loop/);
  });

  it("forbids fake live data", () => {
    expect(all).toMatch(/fake live data/i);
  });

  it("forbids blind automation", () => {
    expect(all).toMatch(/blind automation/i);
  });

  it("requires approval-required Action Queue", () => {
    expect(all).toMatch(/approval-required/i);
    expect(all).toMatch(/Action Queue/);
  });

  it("references Playwright coverage", () => {
    expect(all).toMatch(/Playwright/);
  });

  it("references GitHub PR / CI gate", () => {
    expect(all).toMatch(/GitHub/);
    expect(all).toMatch(/\bCI\b/);
    expect(all).toMatch(/\bPR\b/);
  });

  it("event map defines the seven V0 events without an executed event", () => {
    const em = read(FILES.eventMap);
    for (const name of [
      "quick_log_created",
      "sensor_snapshot_attached",
      "timeline_viewed",
      "ai_doctor_opened",
      "alert_viewed",
      "action_queue_item_created",
      "action_queue_item_completed",
    ]) {
      expect(em).toContain(name);
    }
    // The event MAY be referenced in prose as forbidden, but must never
    // appear as a defined section header.
    expect(em).not.toMatch(/^### `action_queue_item_executed`/m);
  });
});
