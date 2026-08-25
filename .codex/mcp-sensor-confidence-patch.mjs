import { readFileSync, writeFileSync } from "node:fs";

const DESCRIPTION_PARTS = [
  "Fetch the most recent sensor reading per metric (temperature_c, humidity_pct, vpd_kpa, co2_ppm, soil_moisture_pct, soil_temp_c, ph, ec, ppfd) for one of the signed-in grower's own tents, ordered by capture time (captured_at, falling back to ingest time). ",
  "Every reading returns a constitution source tag from exactly live/manual/csv/demo/stale/invalid, never a vendor or transport label, plus confidence on a 0–1 scale, response-time freshness (fresh, stale, or invalid), and current_live. ",
  "sim normalizes to demo; unknown or vendor labels normalize to invalid and cannot be promoted by freshness. ",
  "Confidence is derived from the existing source, quality, value plausibility, and age: 0 for invalid or unknown data, 0.25 for low-confidence stale, demo, or degraded data, 0.6 for medium-confidence fresh manual or csv data, and 0.9 for high-confidence fresh plausible live data with quality ok. ",
  "Raw provenance is not returned. Read-only.",
];
const NEW_DESCRIPTION = DESCRIPTION_PARTS.join("");

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content);
}

function replaceOnce(content, before, after, label) {
  const first = content.indexOf(before);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (content.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous ${label}`);
  }
  return content.slice(0, first) + after + content.slice(first + before.length);
}

function replaceBetween(content, start, end, replacement, label) {
  const startIndex = content.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing start for ${label}`);
  const endIndex = content.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing end for ${label}`);
  return content.slice(0, startIndex) + replacement + content.slice(endIndex);
}

function descriptionBlock(indent) {
  const continuation = `${indent}  `;
  return (
    `${indent}description:\n` +
    DESCRIPTION_PARTS.map(
      (part, index) =>
        `${continuation}${JSON.stringify(part)}${index < DESCRIPTION_PARTS.length - 1 ? " +" : ","}`,
    ).join("\n")
  );
}

const operatorPath = "src/lib/operatorAccountReadModels.ts";
let operator = read(operatorPath);
operator = replaceOnce(
  operator,
  'import { normalizeSensorSource, rawSensorSourceValuesFor } from "./sensor/sensorSourceRules";',
  `import {
  normalizeSensorSource,
  rawSensorSourceValuesFor,
  type SensorSource,
} from "./sensor/sensorSourceRules";`,
  "sensor source import",
);
operator = replaceOnce(
  operator,
  `export interface McpSensorReading {
  id: string;
  tent_id: string;
  metric: string;
  value: number;
  quality: string;
  source: string;
  ts: string;
  captured_at: string | null;
  freshness: McpSensorFreshness;
  current_live: boolean;
}`,
  `export interface McpSensorReading {
  id: string;
  tent_id: string;
  metric: string;
  value: number;
  quality: string;
  source: SensorSource;
  ts: string;
  captured_at: string | null;
  freshness: McpSensorFreshness;
  confidence: number;
  current_live: boolean;
}`,
  "McpSensorReading interface",
);
operator = replaceOnce(
  operator,
  `const PPFD_SOURCE_CONTRADICTION_TOLERANCE = 50;`,
  `const PPFD_SOURCE_CONTRADICTION_TOLERANCE = 50;
const MCP_SENSOR_CONFIDENCE_INVALID = 0;
const MCP_SENSOR_CONFIDENCE_LOW = 0.25;
const MCP_SENSOR_CONFIDENCE_MEDIUM = 0.6;
const MCP_SENSOR_CONFIDENCE_HIGH = 0.9;`,
  "confidence constants",
);
operator = replaceBetween(
  operator,
  `function normalizedLabel(value: unknown): string {`,
  `/**
 * Deterministic newest-row comparison:`,
  `function normalizedLabel(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "invalid";
}

function isKnownMcpSensorQuality(value: string): boolean {
  return value === "ok" || value === "degraded" || value === "stale" || value === "invalid";
}

/**
 * Fail-closed plausibility gate for the long-format metrics exposed here.
 * Values remain visible as explicitly invalid context, but can never inherit
 * a healthy/current-live label from otherwise optimistic stored metadata.
 */
function isPlausibleMcpSensorValue(row: McpSensorQueryRow): boolean {
  if (!Number.isFinite(row.value)) return false;

  switch (row.metric) {
    case "temperature_c":
    case "soil_temp_c":
      return validateTempC(row.value) === null;
    case "humidity_pct":
      return validateHumidity(row.value) === null;
    case "vpd_kpa":
      return row.value >= 0 && row.value <= 10;
    case "co2_ppm":
      return row.value >= 0 && row.value <= 5000;
    case "soil_moisture_pct":
      return row.value > 0 && row.value < 100;
    case "ph":
      return validatePh(row.value) === null;
    case "ec":
      return validateEcWithUnit(row.value, "mS/cm") === null;
    case "ppfd":
      return row.value >= 0;
    default:
      return false;
  }
}

function deriveMcpFreshness(
  row: McpSensorQueryRow,
  nowMs: number,
  staleAfterMs: number,
): McpSensorFreshness {
  const source = normalizeSensorSource(row.source);
  const quality = normalizedLabel(row.quality);
  if (source === "invalid" || quality === "invalid" || !isKnownMcpSensorQuality(quality)) {
    return "invalid";
  }
  if (source === "stale" || quality === "stale") return "stale";
  if (!isPlausibleMcpSensorValue(row)) return "invalid";

  const capturedAt = row.captured_at ?? row.ts;
  if (!Number.isFinite(nowMs)) return "invalid";

  return classifySnapshotFreshness(
    {
      // Freshness is timestamp truth, not permission to promote a vendor,
      // transport, demo, manual, or imported source to live. Canonical source
      // trust is resolved above; use manual only to reuse the shared malformed,
      // future, and stale timestamp classifier without demo's freshness override.
      source: "manual",
      captured_at: capturedAt,
      tent_id: row.tent_id,
      metrics: {},
    },
    { now: nowMs, freshnessMs: staleAfterMs },
  ).freshness;
}

function deriveMcpSensorConfidence(
  row: McpSensorQueryRow,
  source: SensorSource,
  freshness: McpSensorFreshness,
): number {
  const quality = normalizedLabel(row.quality);
  if (
    freshness === "invalid" ||
    source === "invalid" ||
    quality === "invalid" ||
    !isKnownMcpSensorQuality(quality) ||
    !isPlausibleMcpSensorValue(row)
  ) {
    return MCP_SENSOR_CONFIDENCE_INVALID;
  }

  if (
    freshness === "stale" ||
    source === "stale" ||
    source === "demo" ||
    quality === "stale" ||
    quality === "degraded"
  ) {
    return MCP_SENSOR_CONFIDENCE_LOW;
  }

  if (freshness !== "fresh" || quality !== "ok") {
    return MCP_SENSOR_CONFIDENCE_INVALID;
  }
  if (source === "live") return MCP_SENSOR_CONFIDENCE_HIGH;
  if (source === "manual" || source === "csv") return MCP_SENSOR_CONFIDENCE_MEDIUM;
  return MCP_SENSOR_CONFIDENCE_INVALID;
}

`,
  "MCP sensor classification functions",
);
operator = replaceBetween(
  operator,
  `export function selectLatestMcpSensorReadings(`,
  `export async function getLatestSensorSnapshotForOwnedTent(`,
  `export function selectLatestMcpSensorReadings(
  rows: readonly McpSensorQueryRow[],
  options: McpSensorSelectionOptions = {},
): Record<string, McpSensorReading> {
  const { nowMs, staleAfterMs } = sensorSelectionClock(options);
  const selected: Record<string, McpSensorQueryRow> = {};
  for (const row of withoutDiagnosticSensorRows(rows)) {
    if (!row || !KNOWN_METRIC_SET.has(row.metric)) continue;
    const current = selected[row.metric];
    selected[row.metric] = current ? newerReading(current, row) : row;
  }

  return Object.fromEntries(
    Object.entries(selected).map(([metric, row]) => {
      const source = normalizeSensorSource(row.source);
      const freshness = deriveMcpFreshness(row, nowMs, staleAfterMs);
      const confidence = deriveMcpSensorConfidence(row, source, freshness);
      return [
        metric,
        {
          id: row.id,
          tent_id: row.tent_id,
          metric: row.metric,
          value: row.value,
          quality: row.quality,
          source,
          ts: row.ts,
          captured_at: row.captured_at,
          freshness,
          confidence,
          current_live:
            freshness === "fresh" &&
            source === "live" &&
            normalizedLabel(row.quality) === "ok",
        },
      ];
    }),
  );
}

`,
  "MCP sensor projection",
);
write(operatorPath, operator);

const existingTestPath = "src/test/operator-account-read-models.test.ts";
let existingTest = read(existingTestPath);
existingTest = replaceOnce(
  existingTest,
  `      {
        name: "legacy provider source",
        overrides: { source: "ecowitt" },
        freshness: "fresh",
        currentLive: false,
      },`,
  `      {
        name: "legacy provider source",
        overrides: { source: "ecowitt" },
        freshness: "invalid",
        currentLive: false,
      },`,
  "legacy provider regression",
);
write(existingTestPath, existingTest);

const toolPath = "src/lib/mcp/tools/get-latest-sensor-snapshot.ts";
let tool = read(toolPath);
tool = replaceBetween(
  tool,
  ` * Preserves \`source\` and \`quality\` labels verbatim, then derives response-time`,
  ` * Never returns \`raw_payload\`.`,
  ` * Normalizes every stored source at the MCP publication boundary to the
 * canonical SENSOR TRUTH vocabulary, then derives bounded confidence from
 * only the existing source, quality, value plausibility, and response-time age.
 * Raw provenance is selected only long enough to exclude diagnostic-only
 * Windows testbench rows, then is stripped before tool content is assembled.
 * Only quality \`ok\` + source \`live\` + response-time freshness \`fresh\`
 * counts as current live data. Manual and csv remain non-live, sim maps to
 * demo, and vendor or unknown labels map to invalid.
`,
  "MCP tool truth comment",
);
const toolDescriptionStart = tool.indexOf("  description:");
const toolInputStart = tool.indexOf("  inputSchema:", toolDescriptionStart);
if (toolDescriptionStart < 0 || toolInputStart < 0) throw new Error("Missing MCP tool description");
tool =
  tool.slice(0, toolDescriptionStart) +
  descriptionBlock("  ") +
  "\n" +
  tool.slice(toolInputStart);
tool = replaceOnce(
  tool,
  "`${r.metric}=${r.value} (source: ${r.source}, quality: ${r.quality}, freshness: ${r.freshness}, current_live: ${r.current_live}, at: ${r.captured_at ?? r.ts})`",
  "`${r.metric}=${r.value} (source: ${r.source}, quality: ${r.quality}, confidence: ${r.confidence}, freshness: ${r.freshness}, current_live: ${r.current_live}, at: ${r.captured_at ?? r.ts})`",
  "MCP text confidence",
);
write(toolPath, tool);

const manifestPath = ".lovable/mcp/manifest.json";
const manifest = JSON.parse(read(manifestPath));
const manifestTool = manifest.mcp.tools.find(
  (candidate) => candidate.name === "get_latest_sensor_snapshot",
);
if (!manifestTool) throw new Error("Manifest snapshot tool missing");
manifestTool.description = NEW_DESCRIPTION;
write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const manifestViewPath = "src/lib/mcp/manifestView.ts";
let manifestView = read(manifestViewPath);
const manifestToolStart = manifestView.indexOf('      name: "get_latest_sensor_snapshot",');
const manifestDescriptionStart = manifestView.indexOf("      description:", manifestToolStart);
const manifestReadOnlyStart = manifestView.indexOf("      readOnly:", manifestDescriptionStart);
if (manifestToolStart < 0 || manifestDescriptionStart < 0 || manifestReadOnlyStart < 0) {
  throw new Error("Manifest view snapshot tool missing");
}
manifestView =
  manifestView.slice(0, manifestDescriptionStart) +
  descriptionBlock("      ") +
  "\n" +
  manifestView.slice(manifestReadOnlyStart);
write(manifestViewPath, manifestView);

const bundlePath = "supabase/functions/mcp/index.ts";
let bundle = read(bundlePath);
bundle = replaceOnce(
  bundle,
  `var PPFD_SOURCE_CONTRADICTION_TOLERANCE = 50;`,
  `var PPFD_SOURCE_CONTRADICTION_TOLERANCE = 50;
var MCP_SENSOR_CONFIDENCE_INVALID = 0;
var MCP_SENSOR_CONFIDENCE_LOW = 0.25;
var MCP_SENSOR_CONFIDENCE_MEDIUM = 0.6;
var MCP_SENSOR_CONFIDENCE_HIGH = 0.9;`,
  "bundle confidence constants",
);
bundle = replaceBetween(
  bundle,
  `function normalizedLabel(value) {`,
  `function newerReading(a, b) {`,
  `function normalizedLabel(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "invalid";
}
function isKnownMcpSensorQuality(value) {
  return value === "ok" || value === "degraded" || value === "stale" || value === "invalid";
}
function isPlausibleMcpSensorValue(row) {
  if (!Number.isFinite(row.value)) return false;
  switch (row.metric) {
    case "temperature_c":
    case "soil_temp_c":
      return validateTempC(row.value) === null;
    case "humidity_pct":
      return validateHumidity(row.value) === null;
    case "vpd_kpa":
      return row.value >= 0 && row.value <= 10;
    case "co2_ppm":
      return row.value >= 0 && row.value <= 5e3;
    case "soil_moisture_pct":
      return row.value > 0 && row.value < 100;
    case "ph":
      return validatePh(row.value) === null;
    case "ec":
      return validateEcWithUnit(row.value, "mS/cm") === null;
    case "ppfd":
      return row.value >= 0;
    default:
      return false;
  }
}
function deriveMcpFreshness(row, nowMs, staleAfterMs) {
  const source = normalizeSensorSource(row.source);
  const quality = normalizedLabel(row.quality);
  if (source === "invalid" || quality === "invalid" || !isKnownMcpSensorQuality(quality)) {
    return "invalid";
  }
  if (source === "stale" || quality === "stale") return "stale";
  if (!isPlausibleMcpSensorValue(row)) return "invalid";
  const capturedAt = row.captured_at ?? row.ts;
  if (!Number.isFinite(nowMs)) return "invalid";
  return classifySnapshotFreshness(
    {
      source: "manual",
      captured_at: capturedAt,
      tent_id: row.tent_id,
      metrics: {},
    },
    { now: nowMs, freshnessMs: staleAfterMs },
  ).freshness;
}
function deriveMcpSensorConfidence(row, source, freshness) {
  const quality = normalizedLabel(row.quality);
  if (
    freshness === "invalid" ||
    source === "invalid" ||
    quality === "invalid" ||
    !isKnownMcpSensorQuality(quality) ||
    !isPlausibleMcpSensorValue(row)
  ) {
    return MCP_SENSOR_CONFIDENCE_INVALID;
  }
  if (
    freshness === "stale" ||
    source === "stale" ||
    source === "demo" ||
    quality === "stale" ||
    quality === "degraded"
  ) {
    return MCP_SENSOR_CONFIDENCE_LOW;
  }
  if (freshness !== "fresh" || quality !== "ok") {
    return MCP_SENSOR_CONFIDENCE_INVALID;
  }
  if (source === "live") return MCP_SENSOR_CONFIDENCE_HIGH;
  if (source === "manual" || source === "csv") return MCP_SENSOR_CONFIDENCE_MEDIUM;
  return MCP_SENSOR_CONFIDENCE_INVALID;
}
`,
  "bundle MCP classification functions",
);
bundle = replaceBetween(
  bundle,
  `function selectLatestMcpSensorReadings(rows, options = {}) {`,
  `async function getLatestSensorSnapshotForOwnedTent(`,
  `function selectLatestMcpSensorReadings(rows, options = {}) {
  const { nowMs, staleAfterMs } = sensorSelectionClock(options);
  const selected = {};
  for (const row of withoutDiagnosticSensorRows(rows)) {
    if (!row || !KNOWN_METRIC_SET.has(row.metric)) continue;
    const current = selected[row.metric];
    selected[row.metric] = current ? newerReading(current, row) : row;
  }
  return Object.fromEntries(
    Object.entries(selected).map(([metric, row]) => {
      const source = normalizeSensorSource(row.source);
      const freshness = deriveMcpFreshness(row, nowMs, staleAfterMs);
      const confidence = deriveMcpSensorConfidence(row, source, freshness);
      return [
        metric,
        {
          id: row.id,
          tent_id: row.tent_id,
          metric: row.metric,
          value: row.value,
          quality: row.quality,
          source,
          ts: row.ts,
          captured_at: row.captured_at,
          freshness,
          confidence,
          current_live:
            freshness === "fresh" &&
            source === "live" &&
            normalizedLabel(row.quality) === "ok",
        },
      ];
    }),
  );
}
`,
  "bundle MCP sensor projection",
);
const bundleDescriptionMarker =
  'var get_latest_sensor_snapshot_default = defineTool3({';
const bundleToolStart = bundle.indexOf(bundleDescriptionMarker);
const bundleDescriptionStart = bundle.indexOf("  description:", bundleToolStart);
const bundleInputStart = bundle.indexOf("  inputSchema:", bundleDescriptionStart);
if (bundleToolStart < 0 || bundleDescriptionStart < 0 || bundleInputStart < 0) {
  throw new Error("Bundle MCP tool description missing");
}
bundle =
  bundle.slice(0, bundleDescriptionStart) +
  `  description:\n    ${JSON.stringify(NEW_DESCRIPTION)},\n` +
  bundle.slice(bundleInputStart);
bundle = replaceOnce(
  bundle,
  "`${r.metric}=${r.value} (source: ${r.source}, quality: ${r.quality}, freshness: ${r.freshness}, current_live: ${r.current_live}, at: ${r.captured_at ?? r.ts})`",
  "`${r.metric}=${r.value} (source: ${r.source}, quality: ${r.quality}, confidence: ${r.confidence}, freshness: ${r.freshness}, current_live: ${r.current_live}, at: ${r.captured_at ?? r.ts})`",
  "bundle MCP text confidence",
);
write(bundlePath, bundle);
