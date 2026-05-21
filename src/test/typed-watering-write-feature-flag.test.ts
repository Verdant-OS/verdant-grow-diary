import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

import {
  featureFlags,
  typedWateringWriteEnabled,
} from "@/lib/featureFlags";
import { writeWateringTypedEvent } from "@/lib/writeWateringTypedEvent";

const REPO_ROOT = process.cwd();

function rg(args: string[]): string {
  try {
    return execSync(`rg ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch (err: unknown) {
    // rg exits 1 when there are no matches — that's a valid result.
    const e = err as { status?: number; stdout?: string };
    if (e && e.status === 1) return "";
    throw err;
  }
}

describe("typed watering write — feature flag scaffold", () => {
  it("feature flag defaults to false", () => {
    expect(typedWateringWriteEnabled).toBe(false);
    expect(featureFlags.typedWateringWriteEnabled).toBe(false);
  });

  it("featureFlags object is frozen", () => {
    expect(Object.isFrozen(featureFlags)).toBe(true);
  });

  it("helper returns disabled/skipped when flag is false", () => {
    const out = writeWateringTypedEvent({
      kind: "watering",
      input: {
        kind: "watering",
        details: { volume_ml: 500 },
      } as Parameters<typeof writeWateringTypedEvent>[0]["input"],
    });
    expect(out.ok).toBe(false);
    const fail = out as Extract<typeof out, { ok: false }>;
    expect(fail.status).toBe("disabled");
    expect((fail as { reason?: string }).reason).toBe("feature_flag_off");
  });

  it("helper short-circuit happens before any validation work", () => {
    // Passing an obviously invalid payload must still return `disabled`,
    // proving the flag check runs before the adapter is consulted.
    const out = writeWateringTypedEvent({
      // @ts-expect-error — deliberately malformed to prove no validation runs
      kind: "definitely-not-a-kind",
      // @ts-expect-error — deliberately malformed input
      input: { totally: "wrong" },
    });
    expect(out).toEqual({
      ok: false,
      status: "disabled",
      reason: "feature_flag_off",
    });
  });

  it("helper module does not import the Supabase client", () => {
    const src = readFileSync(
      resolve(REPO_ROOT, "src/lib/writeWateringTypedEvent.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
    expect(src).not.toMatch(/supabase\.rpc\s*\(/);
    expect(src).not.toMatch(/service_role/i);
  });

  it("featureFlags module does not reference service_role", () => {
    const src = readFileSync(
      resolve(REPO_ROOT, "src/lib/featureFlags.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/service_role/i);
  });

  it("no runtime module imports the helper (tests-only seam)", () => {
    const hits = rg([
      "-l",
      "writeWateringTypedEvent",
      "src",
    ])
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      // Allowed: the helper itself and test files.
      .filter((p) => p !== "src/lib/writeWateringTypedEvent.ts")
      .filter((p) => !p.startsWith("src/test/"));
    expect(hits).toEqual([]);
  });

  it("QuickLog code does not import or call the helper", () => {
    const hits = rg([
      "-l",
      "writeWateringTypedEvent",
      "src",
    ])
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((p) => /quick.?log/i.test(p));
    expect(hits).toEqual([]);
  });

  it("non-watering typed writes remain unavailable through this seam", () => {
    // While the flag is OFF the helper is `disabled` for every kind, which
    // is the strongest possible guarantee. Document the contract explicitly
    // so a future enable step cannot widen scope without updating this test.
    for (const kind of [
      "feeding",
      "photo",
      "observation",
      "training",
      "environment",
    ] as const) {
      const out = writeWateringTypedEvent({
        kind,
        input: { kind, details: {} } as Parameters<
          typeof writeWateringTypedEvent
        >[0]["input"],
      });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        // Today: disabled. After enable: must become `unsupported_event_type`.
        // It must never be `would_write` for a non-watering kind.
        expect(["disabled", "unsupported_event_type"]).toContain(out.status);
      }
    }
  });
});
