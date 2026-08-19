export interface TimelineSensorSnapshot {
  ts?: string;
  temp?: number;
  rh?: number;
  vpd?: number;
  co2?: number;
  soil?: number;
  source?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeCanonicalSnapshot(value: unknown): TimelineSensorSnapshot | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const snapshot: TimelineSensorSnapshot = {};
  const ts = nonEmptyString(raw.ts);
  const source = nonEmptyString(raw.source);
  if (ts) snapshot.ts = ts;
  if (source) snapshot.source = source;
  for (const key of ["temp", "rh", "vpd", "co2", "soil"] as const) {
    const value = finiteNumber(raw[key]);
    if (value !== undefined) snapshot[key] = value;
  }
  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

/**
 * Resolve the sensor evidence stored by both Quick Log presenters into the
 * canonical Timeline shape. PlantQuickLog persists Fahrenheit under
 * `manual_sensor_snapshot`; Timeline renders canonical Celsius internally.
 */
export function resolveTimelineSensorSnapshot(details: unknown): TimelineSensorSnapshot | null {
  const record = asRecord(details);
  if (!record) return null;

  const canonical =
    normalizeCanonicalSnapshot(record.sensor_snapshot) ?? normalizeCanonicalSnapshot(record.sensor);
  if (canonical) return canonical;

  const manual = asRecord(record.manual_sensor_snapshot);
  if (!manual) return null;

  const tempC = finiteNumber(manual.temp_c);
  const tempF = finiteNumber(manual.temp_f);
  const rh = finiteNumber(manual.humidity_percent);
  if (tempC === undefined && tempF === undefined && rh === undefined) return null;

  const snapshot: TimelineSensorSnapshot = { source: "manual" };
  const capturedAt = nonEmptyString(manual.captured_at);
  if (capturedAt) snapshot.ts = capturedAt;
  if (tempC !== undefined) snapshot.temp = tempC;
  else if (tempF !== undefined) snapshot.temp = ((tempF - 32) * 5) / 9;
  if (rh !== undefined) snapshot.rh = rh;
  return snapshot;
}
