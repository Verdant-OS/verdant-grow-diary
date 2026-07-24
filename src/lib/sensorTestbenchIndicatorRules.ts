/**
 * Pure classifier for the Sensors testbench indicator.
 *
 * Looks at recent sensor_readings rows for a single tent and decides which
 * indicator the Sensors page should render:
 *
 *  - "testbench"  → most recent ingest carries the Ecowitt Windows testbench
 *                    lineage (vendor=ecowitt_windows_testbench OR
 *                    metadata.confidence=test/demo). Never rendered as "live".
 *  - "live"       → recent (≤ STALE_MS) ingest from an ingest source that is
 *                    NOT testbench-tagged. UI shows existing live treatment.
 *  - "stale"      → most recent ingest is older than STALE_MS.
 *  - "none"       → no rows seen for this tent.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no timers, no automation.
 *  - Testbench tag wins over freshness. A fresh testbench ingest is NEVER
 *    surfaced as "live".
 *  - Manual / CSV / demo readings do not promote to "live".
 */

export const SENSOR_TESTBENCH_LIVE_WINDOW_MS = 15 * 60 * 1000;

export type SensorTestbenchIndicator = "testbench" | "live" | "stale" | "none";

export interface SensorTestbenchRowLike {
  source?: string | null;
  captured_at?: string | Date | null;
  created_at?: string | Date | null;
  raw_payload?: unknown;
}

export interface SensorTestbenchRawPayloadLike {
  source?: unknown;
  raw_payload?: unknown;
}

export interface SensorTestbenchClassification {
  indicator: SensorTestbenchIndicator;
  source: string | null;
  vendor: string | null;
  confidence: string | null;
  latestAtIso: string | null;
  ageMs: number | null;
  isTestbench: boolean;
}

const LIVE_SOURCES = new Set([
  "live",
  "ecowitt",
  "webhook",
  "webhook_generic",
  "pi_bridge",
  "node_red_bridge",
  "home_assistant_bridge",
  "ha_forwarded",
  "esp32_arduino",
  "esp32_arduino_sht31",
  "esp32_esphome",
  "esp32_mqtt_bridge",
  "mqtt",
]);

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function readString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function extractTestbenchFields(row: SensorTestbenchRawPayloadLike): {
  vendor: string | null;
  confidence: string | null;
  verdantSource: string | null;
  physicalGatewayEvidence: boolean;
} {
  const raw = row.raw_payload;
  const vendor = readString(raw, "vendor");
  const metadata =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>).metadata : null;
  const confidence = readString(metadata, "confidence");
  // `verdant_source` is the canonical stored mirror and may be `live` for
  // any accepted transport. Only the separately preserved listener report
  // can distinguish its original demo/live decision.
  const verdantSource = readString(metadata, "reported_verdant_source");
  const nestedRaw =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).raw_payload
      : null;
  const gatewayMarkers = new Set([
    "stationtype",
    "model",
    "dateutc",
    "freq",
    "runtime",
    "wh65batt",
    "wh25batt",
  ]);
  const markerCount =
    nestedRaw && typeof nestedRaw === "object"
      ? Object.keys(nestedRaw as Record<string, unknown>).filter((key) =>
          gatewayMarkers.has(key.trim().toLowerCase()),
        ).length
      : 0;
  return {
    vendor,
    confidence,
    verdantSource,
    physicalGatewayEvidence: verdantSource?.trim().toLowerCase() === "live" && markerCount >= 2,
  };
}

/**
 * Shared provenance fence for every surface that must distinguish a
 * diagnostic packet from real sensor evidence. Keep this independent of
 * freshness and canonical stored source: the webhook intentionally stores
 * accepted transport packets as `live`, while raw lineage preserves whether
 * the packet came from Verdant's Windows testbench.
 */
export function isSensorTestbenchProvenance(input: {
  vendor?: unknown;
  confidence?: unknown;
  verdantSource?: unknown;
  physicalGatewayEvidence?: unknown;
}): boolean {
  const vendor = typeof input.vendor === "string" ? input.vendor.trim().toLowerCase() : "";
  const confidence =
    typeof input.confidence === "string" ? input.confidence.trim().toLowerCase() : "";
  const verdantSource =
    typeof input.verdantSource === "string" ? input.verdantSource.trim().toLowerCase() : "";
  if (confidence === "test" || confidence === "demo") return true;
  // The Windows listener intentionally keeps this historical vendor label
  // for both loopback diagnostics and physical LAN gateway uploads. A row
  // carrying its preserved `reported_verdant_source=live` lineage plus
  // physical gateway markers is therefore real bridge evidence; any
  // other/missing source remains diagnostic by default.
  if (
    vendor === "ecowitt_windows_testbench" &&
    !(verdantSource === "live" && input.physicalGatewayEvidence === true)
  ) {
    return true;
  }
  return false;
}

/** True when a stored sensor row carries explicit testbench lineage. */
export function isSensorTestbenchRow(row: SensorTestbenchRawPayloadLike): boolean {
  const { vendor, confidence, verdantSource, physicalGatewayEvidence } =
    extractTestbenchFields(row);
  const source = typeof row.source === "string" ? row.source.trim().toLowerCase() : "";
  const normalizedVendor = vendor?.trim().toLowerCase() ?? "";
  // Some pre-canonicalization rows stored the listener vendor directly in
  // `source` and lack a raw vendor envelope. Those rows cannot prove a
  // physical gateway and must fail closed. If the matching raw vendor and
  // physical markers are present, the shared provenance rule below can still
  // admit the legitimate gateway packet.
  if (source === "ecowitt_windows_testbench" && normalizedVendor !== source) {
    return true;
  }
  return isSensorTestbenchProvenance({
    vendor,
    confidence,
    verdantSource,
    physicalGatewayEvidence,
  });
}

export interface ClassifyInput {
  rows: ReadonlyArray<SensorTestbenchRowLike>;
  now?: Date;
  liveWindowMs?: number;
}

export function classifySensorTestbench(input: ClassifyInput): SensorTestbenchClassification {
  const now = input.now ?? new Date();
  const windowMs = input.liveWindowMs ?? SENSOR_TESTBENCH_LIVE_WINDOW_MS;
  const rows = input.rows ?? [];
  if (rows.length === 0) {
    return {
      indicator: "none",
      source: null,
      vendor: null,
      confidence: null,
      latestAtIso: null,
      ageMs: null,
      isTestbench: false,
    };
  }
  // Pick the most recent row by captured_at then created_at.
  let latest: SensorTestbenchRowLike | null = null;
  let latestTs: Date | null = null;
  for (const r of rows) {
    const t = toDate(r.captured_at) ?? toDate(r.created_at);
    if (!t) continue;
    if (!latestTs || t.getTime() > latestTs.getTime()) {
      latest = r;
      latestTs = t;
    }
  }
  if (!latest || !latestTs) {
    return {
      indicator: "none",
      source: null,
      vendor: null,
      confidence: null,
      latestAtIso: null,
      ageMs: null,
      isTestbench: false,
    };
  }
  const source = typeof latest.source === "string" ? latest.source : null;
  const { vendor, confidence, verdantSource, physicalGatewayEvidence } =
    extractTestbenchFields(latest);
  const testbench = isSensorTestbenchProvenance({
    vendor,
    confidence,
    verdantSource: verdantSource ?? source,
    physicalGatewayEvidence,
  });
  const ageMs = now.getTime() - latestTs.getTime();
  let indicator: SensorTestbenchIndicator;
  if (testbench) {
    // Testbench tag always wins over freshness — never render as live.
    indicator = "testbench";
  } else if (ageMs <= windowMs && source && LIVE_SOURCES.has(source)) {
    indicator = "live";
  } else {
    indicator = "stale";
  }
  return {
    indicator,
    source,
    vendor,
    confidence,
    latestAtIso: latestTs.toISOString(),
    ageMs,
    isTestbench: testbench,
  };
}

/**
 * Build the PowerShell snippet for the Windows EcoWitt listener.
 *
 * Token plaintext is only included when caller passes the shown-once value
 * from the mint reveal. Otherwise a placeholder is rendered and the caller
 * is expected to surface the mint instructions.
 */
export interface BuildPowerShellInput {
  tentId: string | null;
  bridgeTokenPlaintext: string | null;
  ingestUrl: string;
}

export function buildEcowittPowerShellSnippet(input: BuildPowerShellInput): string {
  const tent = input.tentId && input.tentId.length > 0 ? input.tentId : "<TENT-UUID>";
  const token =
    input.bridgeTokenPlaintext && input.bridgeTokenPlaintext.startsWith("vbt_")
      ? input.bridgeTokenPlaintext
      : "<vbt_… mint a token to reveal>";
  const url = input.ingestUrl;
  return [
    `$env:VERDANT_TENT_ID = "${tent}"`,
    `$env:VERDANT_BRIDGE_TOKEN = "${token}"`,
    `$env:VERDANT_INGEST_URL = "${url}"`,
    ``,
    `# Start the listener:`,
    `cd $HOME\\verdant-testbench`,
    `.\\.venv\\Scripts\\Activate.ps1`,
    `python ecowitt_listener.py`,
  ].join("\n");
}
