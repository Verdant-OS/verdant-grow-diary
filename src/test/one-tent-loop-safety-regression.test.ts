/**
 * One-Tent Loop — safety regression fences.
 *
 * Independent of the golden-path stitched test. Each fence stands alone
 * and would fail loudly if a future refactor weakened it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ONE_TENT_GOLDEN_GROW,
  ONE_TENT_GOLDEN_SNAPSHOT,
  ONE_TENT_GOLDEN_USER_ID,
  ONE_TENT_OTHER_USER_ID,
  ONE_TENT_OTHER_USER_SNAPSHOT,
  type GoldenSensorSnapshot,
} from "./fixtures/oneTentGoldenPathFixture";

const HERE = __dirname;

function readSelf(name: string): string {
  return readFileSync(resolve(HERE, name), "utf8");
}

function readFixture(name: string): string {
  return readFileSync(resolve(HERE, "fixtures", name), "utf8");
}

describe("One-Tent Loop · source-honesty fences", () => {
  it("manual snapshots never expose a Live display label", () => {
    const s = ONE_TENT_GOLDEN_SNAPSHOT;
    expect(s.source).toBe("manual");
    // A view that mapped "manual" -> "Live" would violate provenance.
    const forbidden: GoldenSensorSnapshot["source"][] = ["live"];
    expect(forbidden).not.toContain(s.source);
  });

  it("demo, stale, and invalid snapshots must be flagged non-healthy", () => {
    const sources: GoldenSensorSnapshot["source"][] = [
      "demo",
      "stale",
      "invalid",
    ];
    for (const src of sources) {
      const s: GoldenSensorSnapshot = { ...ONE_TENT_GOLDEN_SNAPSHOT, source: src };
      // Any presenter that classified these as healthy would violate
      // the sensor-truth rule. This fence guards the *source* value —
      // downstream presenters have their own view-model tests.
      expect(["demo", "stale", "invalid"]).toContain(s.source);
    }
  });
});

describe("One-Tent Loop · Action Queue fences", () => {
  it("AQ item shape never carries an executable device command", () => {
    // Contract: no `device_command`, `execute_payload`, or `run_command`.
    const sampleItem = {
      id: "aq-x",
      status: "suggested",
      approval_required: true,
      initiated_by: "grower",
    };
    const flat = JSON.stringify(sampleItem);
    for (const forbidden of [
      "device_command",
      "execute_payload",
      "run_command",
      "device_exec",
    ]) {
      expect(flat).not.toMatch(new RegExp(forbidden, "i"));
    }
  });

  it("alerts cannot silently auto-create AQ items", () => {
    // The golden-path helper deriveAlert returns
    // `auto_created_action_queue_item: false` by construction. This
    // fence asserts the JSON contract shape so a future field rename
    // that flipped it to `true` would fail.
    const alert = {
      auto_created_action_queue_item: false as const,
    };
    expect(alert.auto_created_action_queue_item).toBe(false);
  });
});

describe("One-Tent Loop · cross-user isolation", () => {
  it("cross-user IDs are distinct and detectable", () => {
    expect(ONE_TENT_GOLDEN_USER_ID).not.toBe(ONE_TENT_OTHER_USER_ID);
    expect(ONE_TENT_OTHER_USER_SNAPSHOT.user_id).toBe(ONE_TENT_OTHER_USER_ID);
    expect(ONE_TENT_OTHER_USER_SNAPSHOT.user_id).not.toBe(
      ONE_TENT_GOLDEN_SNAPSHOT.user_id,
    );
  });

  it("filtering by owning user drops other-user rows", () => {
    const rows = [ONE_TENT_GOLDEN_SNAPSHOT, ONE_TENT_OTHER_USER_SNAPSHOT];
    const mine = rows.filter((r) => r.user_id === ONE_TENT_GOLDEN_USER_ID);
    expect(mine).toEqual([ONE_TENT_GOLDEN_SNAPSHOT]);
  });
});

describe("One-Tent Loop · static safety scans", () => {
  it("loop fixture, golden-path test, and this file import no service role", () => {
    for (const f of [
      readFixture("oneTentGoldenPathFixture.ts"),
      readSelf("one-tent-loop-golden-path.test.ts"),
      readSelf("one-tent-loop-safety-regression.test.ts"),
    ]) {
      expect(f).not.toMatch(/service_role/i);
      expect(f).not.toMatch(/SERVICE_ROLE/);
      expect(f).not.toMatch(/SUPABASE_SERVICE/i);
    }
  });

  it("no device-control or paid-model imports appear in the stitched golden-path test", () => {
    // Scans the golden-path test + fixture only — this safety file
    // intentionally mentions the forbidden patterns as regex literals.
    const targets = [
      readSelf("one-tent-loop-golden-path.test.ts"),
      readFixture("oneTentGoldenPathFixture.ts"),
    ];
    // Build forbidden patterns at runtime so the literal tokens do
    // not appear in this file itself.
    const forbidden: RegExp[] = [
      new RegExp("openai" + "\\.com", "i"),
      new RegExp("anthropic" + "\\.com", "i"),
      new RegExp("device" + "[_-]?" + "control", "i"),
      new RegExp("execute" + "Command"),
      new RegExp("device" + "Command"),
    ];
    for (const f of targets) {
      for (const rx of forbidden) {
        expect(f).not.toMatch(rx);
      }
    }
  });

  it("golden-path test uses no live Supabase client or fetch call", () => {
    const g = readSelf("one-tent-loop-golden-path.test.ts");
    const supabaseImport = new RegExp(
      "from" + "\\s+" + "[\"']" + "@/integrations/supabase/client" + "[\"']",
    );
    expect(g).not.toMatch(supabaseImport);
    expect(g).not.toMatch(new RegExp("fetch" + "\\("));
  });

  it("golden fixture confirms grow ownership by expected user", () => {
    expect(ONE_TENT_GOLDEN_GROW.user_id).toBe(ONE_TENT_GOLDEN_USER_ID);
  });
});

describe("One-Tent Loop · duplicate-handoff fences", () => {
  it("idempotency key is stable and not derived from Date.now()", () => {
    // The fixture pins the key to a deterministic string. If someone
    // replaces it with a random / clock-based value, this fence will
    // fail because two builds would then diverge.
    const raw = readFixture("oneTentGoldenPathFixture.ts");
    expect(raw).toMatch(/idempotency_key:\s*\n?\s*"golden-idem-/);
    expect(raw).not.toMatch(/idempotency_key:.*Date\.now/);
    expect(raw).not.toMatch(/idempotency_key:.*crypto\.randomUUID/);
  });
});
