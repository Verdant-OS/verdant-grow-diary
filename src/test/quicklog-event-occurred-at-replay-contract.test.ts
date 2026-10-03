/**
 * Client-side contracts that keep Quick Log event idempotency replays aligned
 * with the UTC session-hash repair (#1846). The database harness proves runtime
 * reuse; these tests pin the caller shapes that reach `quicklog_save_event`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { quickLogToTypedEventPayload } from "@/lib/quickLogTypedEventPayloadRules";
import { mapFeedingInputToRpcArgs } from "@/lib/writeFeedingTypedEvent";
import { mapWateringInputToRpcArgs } from "@/lib/writeQuickLogWateringTypedEvent";

const INSTANT_UTC = "2026-01-01T10:00:00.000Z";
const INSTANT_NY_OFFSET = "2026-01-01T05:00:00-05:00";
const INSTANT_FRACTIONAL = "2026-06-30T23:59:59.123456-07:00";
const INSTANT_FRACTIONAL_ZULU = "2026-07-01T06:59:59.123Z";

const SCAN_ROOTS = ["src", join("supabase", "functions")];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "_generated") continue;
      out.push(...listSourceFiles(path));
      continue;
    }
    const ext = entry.slice(entry.lastIndexOf("."));
    if (SOURCE_EXTENSIONS.has(ext) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      out.push(path);
    }
  }
  return out;
}

function expectEquivalentInstants(label: string, literals: string[]): void {
  const parsed = literals.map((literal) => {
    const result =
      label === "typed payload parent"
        ? quickLogToTypedEventPayload({
            grow_id: "grow-1",
            event_type: "observation",
            occurred_at: literal,
          })
        : null;
    if (label === "typed payload parent") {
      expect(result?.ok).toBe(true);
      if (!result?.ok) throw new Error("expected typed payload");
      return Date.parse(result.parent.occurred_at ?? "");
    }
    const mapper =
      label === "watering mapper"
        ? mapWateringInputToRpcArgs({
            idempotency_key: "water-key",
            grow_id: "grow-1",
            occurred_at: literal,
            volume_ml: 500,
          })
        : mapFeedingInputToRpcArgs({
            idempotency_key: "feed-key",
            grow_id: "grow-1",
            occurred_at: literal,
            line_id: "line-1",
            products: [{ name: "CalMag" }],
            volume_ml: 500,
          });
    expect(mapper.ok).toBe(true);
    if (!mapper.ok) throw new Error("expected mapper ok");
    return Date.parse(mapper.args.p_occurred_at ?? "");
  });
  expect(new Set(parsed).size, `${label}: instants must collapse to one epoch`).toBe(1);
}

describe("Quick Log event occurred_at replay contract", () => {
  it.each([
    ["watering mapper", INSTANT_UTC],
    ["watering mapper", INSTANT_NY_OFFSET],
    ["feeding mapper", INSTANT_UTC],
    ["feeding mapper", INSTANT_NY_OFFSET],
  ])("%s normalizes %s to UTC ISO", (label, literal) => {
    const mapper =
      label === "watering mapper"
        ? mapWateringInputToRpcArgs({
            idempotency_key: "water-key",
            grow_id: "grow-1",
            occurred_at: literal,
            volume_ml: 500,
          })
        : mapFeedingInputToRpcArgs({
            idempotency_key: "feed-key",
            grow_id: "grow-1",
            occurred_at: literal,
            line_id: "line-1",
            products: [{ name: "CalMag" }],
            volume_ml: 500,
          });
    expect(mapper.ok).toBe(true);
    if (!mapper.ok) return;
    expect(mapper.args.p_occurred_at).toBe(INSTANT_UTC);
  });

  it("typed payload rules collapse offset and zulu literals for the same instant", () => {
    expectEquivalentInstants("typed payload parent", [INSTANT_UTC, INSTANT_NY_OFFSET]);
    expectEquivalentInstants("typed payload parent", [INSTANT_FRACTIONAL, INSTANT_FRACTIONAL_ZULU]);
  });

  it("does not send Prefer: timezone from application or edge sources", () => {
    const preferTimezone = /prefer[^\n]{0,40}timezone|timezone[^\n]{0,40}prefer/i;
    const hits: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of listSourceFiles(resolve(root))) {
        const text = readFileSync(file, "utf8");
        if (preferTimezone.test(text)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});
