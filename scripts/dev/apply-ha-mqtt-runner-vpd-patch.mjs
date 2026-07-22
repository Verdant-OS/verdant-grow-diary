import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/dev/ecowitt-mqtt-runner.ts";
let source = readFileSync(path, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`patch anchor missing: ${label}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`patch anchor is not unique: ${label}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "adapter imports",
  `import {
  HaStatestreamAssembler,
  parseHaJsonMessage,
  parseHaStatestreamMessage,
  type HaAdapterResult,
  type HaMqttMappingFile,
} from "../../src/lib/homeAssistantEcowittMqttAdapter";`,
  `import {
  HaStatestreamAssembler,
  deriveVpdIfPaired,
  parseHaJsonMessage,
  parseHaStatestreamMessage,
  type HaAdapterResult,
  type HaMetricReading,
  type HaMqttMappingFile,
} from "../../src/lib/homeAssistantEcowittMqttAdapter";`,
);

replaceOnce(
  "HA state VPD cache",
  `  /** Ordered unique hav2 keys (capped at HA_DRY_RUN_MAX_TRACKED_KEYS). */
  idempotencyKeys: string[];
  seenKeys: Set<string>;
}`,
  `  /** Ordered unique hav2 keys (capped at HA_DRY_RUN_MAX_TRACKED_KEYS). */
  idempotencyKeys: string[];
  /**
   * Latest validated live temp/RH readings keyed by exact
   * tent + plant + configured channel identity. The runner never pairs
   * across channels or targets, and stale/invalid adapter results never
   * enter this cache.
   */
  vpdPairCache: Map<
    string,
    { temp: HaMetricReading | null; rh: HaMetricReading | null }
  >;
  seenKeys: Set<string>;
}`,
);

replaceOnce(
  "HA state initialization",
  `    reasonCounts: {},
    idempotencyKeys: [],
    seenKeys: new Set<string>(),`,
  `    reasonCounts: {},
    idempotencyKeys: [],
    vpdPairCache: new Map(),
    seenKeys: new Set<string>(),`,
);

replaceOnce(
  "adapter result coordinator",
  `function adapterResultToDryRunReport(args: {`,
  `function haVpdPairIdentity(reading: HaMetricReading): string {
  return JSON.stringify([
    reading.tent_id,
    reading.plant_id ?? null,
    reading.channel ?? null,
  ]);
}

/**
 * Add a derived VPD reading only when the canonical adapter has emitted
 * validated LIVE temperature and humidity readings for the same exact
 * tent/plant/channel identity. The adapter owns Tetens math, the two-minute
 * pairing window, provenance, and the hav2 idempotency preimage.
 */
function appendDerivedVpdReadings(
  state: HaDryRunState,
  incoming: readonly HaMetricReading[],
): HaMetricReading[] {
  const output = [...incoming];

  for (const reading of incoming) {
    if (
      reading.provenance.source !== "live" ||
      (reading.metric !== "air_temp_f" && reading.metric !== "humidity_pct")
    ) {
      continue;
    }

    const identity = haVpdPairIdentity(reading);
    const pair = state.vpdPairCache.get(identity) ?? { temp: null, rh: null };
    if (reading.metric === "air_temp_f") pair.temp = reading;
    else pair.rh = reading;
    state.vpdPairCache.set(identity, pair);

    if (!pair.temp || !pair.rh) continue;

    const derived = deriveVpdIfPaired({ temp: pair.temp, rh: pair.rh });
    if ("metric" in derived) {
      output.push(derived);
    } else {
      countReason(state, derived.reason);
    }
  }

  return output;
}

function adapterResultToDryRunReport(args: {`,
);

replaceOnce(
  "adapter result readings",
  `  const { state, result } = args;
  for (const reason of result.reasons) countReason(state, reason);
  const readings: HaDryRunReading[] = result.readings.map((r) => ({`,
  `  const { state, result } = args;
  for (const reason of result.reasons) countReason(state, reason);
  const readingsWithDerivedVpd = appendDerivedVpdReadings(
    state,
    result.readings,
  );
  const readings: HaDryRunReading[] = readingsWithDerivedVpd.map((r) => ({`,
);

writeFileSync(path, source, "utf8");
console.log("Applied deterministic HA MQTT runner VPD pairing patch.");
