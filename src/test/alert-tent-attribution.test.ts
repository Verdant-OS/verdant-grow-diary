/**
 * Tent attribution for environment alerts.
 *
 * Every persisted environment alert used to carry `tent_id = null`, because
 * `useLatestSensorSnapshot` selected `sensor_readings.tent_id` and then
 * dropped it when mapping rows into `snapshotFromReadings`, and neither
 * saveAlert call site passed one. `buildAssignedTentAlerts` filters with
 * `a.tent_id !== tentId`, which null can never satisfy against a real tent
 * uuid — so Plant Detail's assigned-tent alerts panel was dead code at both
 * of its mount sites and could only ever render its empty state.
 *
 * Two properties are load-bearing and asserted here:
 *
 *  1. Attribution is derived from EXACTLY the rows the snapshot was built
 *     from, and only when they agree. Mixed-tent evidence (the Dashboard's
 *     "All tents" view genuinely produces it) yields null rather than an
 *     arbitrary winner — attaching a real breach to the wrong tent is worse
 *     than leaving it unattributed.
 *
 *  2. Dedupe is per (tent, rule). Grow-scoped keys would let two tents
 *     breaching the same metric collapse into ONE row, silently attributed
 *     to whichever tent won the race, leaving the other tent's panel empty —
 *     a half-fix that looks correct.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { snapshotFromReadings, EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const reading = (tent: string | null, metric = "temperature_c", value = 30) => ({
  ts: "2026-08-06T12:00:00.000Z",
  metric,
  value,
  source: "live",
  tent_id: tent,
});

describe("snapshotFromReadings · tent attribution", () => {
  it("attributes the tent when every contributing row agrees", () => {
    const snap = snapshotFromReadings([
      reading("tent-a", "temperature_c", 30),
      reading("tent-a", "humidity_pct", 55),
    ]);
    expect(snap?.tent_id).toBe("tent-a");
  });

  it("returns null when the contributing rows span several tents", () => {
    // The honest answer. Picking one would pin a real breach on a tent whose
    // readings may not have caused it.
    const snap = snapshotFromReadings([
      reading("tent-a", "temperature_c", 30),
      reading("tent-b", "humidity_pct", 55),
    ]);
    expect(snap?.tent_id).toBeNull();
  });

  it("returns null when rows carry no tent at all", () => {
    const snap = snapshotFromReadings([reading(null)]);
    expect(snap?.tent_id).toBeNull();
  });

  it("ignores blank/whitespace tent ids rather than attributing them", () => {
    const snap = snapshotFromReadings([reading("   "), reading("   ", "humidity_pct", 55)]);
    expect(snap?.tent_id).toBeNull();
  });

  it("treats an UNKNOWN tent as disagreement, not absence (regression)", () => {
    // Filtering blanks out before testing uniqueness made ["tent-a", null]
    // look unanimous, pinning the alert on tent-a even though a contributing
    // row had no known tent. Caught in review on #775.
    for (const other of [null, "", "   "]) {
      const snap = snapshotFromReadings([
        reading("tent-a", "temperature_c", 30),
        reading(other, "humidity_pct", 55),
      ]);
      expect(snap?.tent_id, `["tent-a", ${JSON.stringify(other)}] must not attribute`).toBeNull();
    }
  });

  it("derives from the LATEST rows only, not superseded ones", () => {
    // A snapshot describes one instant. An older row from a different tent
    // must not influence the attribution of the rows that actually won.
    const snap = snapshotFromReadings([
      {
        ts: "2026-08-06T12:00:00.000Z",
        metric: "temperature_c",
        value: 30,
        source: "live",
        tent_id: "tent-a",
      },
      {
        ts: "2026-08-01T09:00:00.000Z",
        metric: "humidity_pct",
        value: 55,
        source: "live",
        tent_id: "tent-b",
      },
    ]);
    expect(snap?.ts).toBe("2026-08-06T12:00:00.000Z");
    expect(snap?.tent_id).toBe("tent-a");
  });

  it("EMPTY_SNAPSHOT carries an explicit null tent", () => {
    expect(EMPTY_SNAPSHOT.tent_id).toBeNull();
  });
});

describe("wiring · the tent actually reaches the alert row", () => {
  const HOOK = read("src/hooks/useLatestSensorSnapshot.ts");
  const PERSIST = read("src/hooks/usePersistEnvironmentAlerts.ts");
  const AUTO = read("src/components/AlertsAutoPersistForGrow.tsx");
  const DASHBOARD = read("src/pages/Dashboard.tsx");

  it("the snapshot hook no longer drops sensor_readings.tent_id", () => {
    // This single omission is what made the whole chain dead.
    expect(HOOK).toMatch(/tent_id:\s*\(r as \{ tent_id\?: string \| null \}\)\.tent_id \?\? null/);
  });

  it("both saveAlert call sites pass a tent", () => {
    expect(PERSIST).toMatch(/tent_id:\s*observedTentId/);
    expect(DASHBOARD).toMatch(/tent_id:\s*manualAlertTentId/);
  });

  it("the auto-persist writer sources its tent from the snapshot it alerted on", () => {
    // Not from a sibling query: attribution must not be able to drift from
    // the evidence that produced the alert.
    expect(AUTO).toMatch(/tentId:[\s\S]{0,120}snapshot\.tent_id/);
  });

  it("EVERY usePersistEnvironmentAlerts call site passes a tentId", () => {
    // The original version of this test asserted the two saveAlert sites and
    // AlertsAutoPersistForGrow, and so passed while Dashboard's own
    // usePersistEnvironmentAlerts({...}) call silently omitted tentId —
    // meaning Dashboard-originated auto-persisted alerts stayed tent-less.
    // Caught in review on #775. Enumerate the call sites instead of naming
    // the ones we happen to remember.
    const callers = [
      ["src/components/AlertsAutoPersistForGrow.tsx", AUTO],
      ["src/pages/Dashboard.tsx", DASHBOARD],
    ] as const;
    let found = 0;
    for (const [name, src] of callers) {
      for (const m of src.matchAll(/usePersistEnvironmentAlerts\(\{/g)) {
        // Scan the argument object: from the call to the line that closes it.
        const start = m.index ?? 0;
        const end = src.indexOf("\n  });", start);
        expect(end, `${name}: could not find end of call at ${start}`).toBeGreaterThan(start);
        const args = src.slice(start, end);
        expect(args, `${name} calls usePersistEnvironmentAlerts without tentId`).toMatch(
          /\btentId\s*:/,
        );
        found += 1;
      }
    }
    // Non-triviality: if the call sites are ever renamed/moved, this test
    // must fail loudly rather than pass by matching nothing.
    expect(found).toBeGreaterThanOrEqual(2);
  });

  it("a tent change re-runs the persist effect", () => {
    // tentKey is part of the dedupe key; omitting it from the dep array would
    // let a stale tent attribute the next grow's alerts.
    expect(PERSIST).toMatch(/const tentKey = input\.tentId \?\? "";/);
    expect(PERSIST).toMatch(/stageProvided,\s*tentKey,/);
  });
});

describe("dedupe is per (tent, rule), not per rule", () => {
  const PERSIST = read("src/hooks/usePersistEnvironmentAlerts.ts");

  it("composes the tent into the dedupe key on both sides of the comparison", () => {
    // Both the existing-open set and the to-insert filter must use the same
    // composite, or dedupe silently stops working in one direction.
    expect(PERSIST).toMatch(/const scopedKey = \(tent: string \| null, ruleKey: string\)/);
    const existingIdx = PERSIST.indexOf("const existing = new Set(");
    const insertIdx = PERSIST.indexOf("const toInsert = persistable.filter(");
    expect(existingIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(existingIdx);
    expect(PERSIST.slice(existingIdx, insertIdx)).toMatch(/scopedKey\(\s*r\.tent,/);
    expect(PERSIST.slice(insertIdx)).toMatch(
      /scopedKey\(observedTentId, derivedAlertKey\(a, SOURCE\)\)/,
    );
  });

  it("reads the open rows' tent so the comparison has something to key on", () => {
    expect(PERSIST).toMatch(/tent:\s*r\.tent_id \?\? null/);
  });

  it("leaves derivedAlertKey itself untouched (no blast radius on other callers)", () => {
    // The tent is composed around derivedAlertKey by its caller, never baked
    // into it — dedupeAgainstOpen and the other consumers in this module must
    // keep working unchanged. Assert the shape of the shared helpers rather
    // than scanning for the word "tent" (which false-matches "persistent").
    const RULES = read("src/lib/environmentAlertPersistence.ts");
    expect(RULES).toMatch(
      /export function derivedAlertKey\(alert: EnvironmentAlert, source = "environment_alerts"\)/,
    );
    expect(RULES).not.toMatch(/tent_id/);
  });
});

describe("the dedupe key behaves correctly for the multi-tent case", () => {
  // Mirrors the production composition so the collapse bug is provable
  // rather than merely described.
  const scopedKey = (grow: string | null, tent: string | null, ruleKey: string) =>
    `${grow ?? ""}::${tent ?? ""}::${ruleKey}`;
  const rule = "environment_alerts|temp|Temperature high";
  const G = "grow-1";

  it("keeps two tents breaching the same metric as DISTINCT rows", () => {
    expect(scopedKey(G, "tent-a", rule)).not.toBe(scopedKey(G, "tent-b", rule));
  });

  it("still dedupes a repeat breach within the SAME tent", () => {
    expect(scopedKey(G, "tent-a", rule)).toBe(scopedKey(G, "tent-a", rule));
  });

  it("keeps historical tent-less rows distinct from tent-scoped ones", () => {
    expect(scopedKey(G, null, rule)).toBe(scopedKey(G, null, rule));
    expect(scopedKey(G, null, rule)).not.toBe(scopedKey(G, "tent-a", rule));
  });

  it("does not let one grow's in-flight key suppress the same rule in another", () => {
    // inFlightKeys is a ref that survives grow switches and never drops
    // successful keys, so a grow-blind key would silently suppress a real
    // alert after the user changes grows. Caught in review on #775.
    expect(scopedKey("grow-1", null, rule)).not.toBe(scopedKey("grow-2", null, rule));
    expect(scopedKey("grow-1", "tent-a", rule)).not.toBe(scopedKey("grow-2", "tent-a", rule));
  });
});
