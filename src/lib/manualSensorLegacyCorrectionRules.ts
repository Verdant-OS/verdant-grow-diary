import { isUuid } from "@/lib/isUuid";
import { isObservationTimestamp } from "@/lib/manualSensorCorrectionOperationRules";

export interface LegacyCorrectionReading {
  id: string;
  user_id: string;
  tent_id: string;
  metric: string;
  value: number;
  source: string;
  captured_at: string | null;
  ts: string;
}
export interface LegacyCorrectionLink {
  original_reading_id: string;
  replacement_reading_id: string | null;
  user_id: string;
  tent_id: string;
  source_before: string;
  source_after: string;
  old_values: unknown;
  new_values: unknown;
  changed_fields: unknown;
}
function matchesValue(value: unknown, metric: string, expected: number): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    Object.hasOwn(record, metric) &&
    typeof record[metric] === "number" &&
    Number.isFinite(record[metric]) &&
    Math.abs(record[metric] - expected) < 1e-9
  );
}
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Resolves a complete, caller-authorized legacy evidence set, never a guessed join.
 * The fetch layer must collect links touching either endpoint and close the chain
 * before calling this function. Missing/expired endpoints are unavailable, not empty.
 * Unlinked rows remain raw facts: an orphan replacement cannot be inferred safely.
 * Apply validated new-operation overlays to the resulting root identities afterwards.
 */
export function resolveLegacyManualCorrections<T extends LegacyCorrectionReading>(
  ownerId: string,
  readings: readonly T[] | null | undefined,
  links: readonly LegacyCorrectionLink[] | null | undefined,
):
  | { status: "resolved"; readings: T[]; suppressedReplacementIds: string[] }
  | { status: "unavailable" } {
  const unavailable = { status: "unavailable" } as const;
  if (!isUuid(ownerId) || !Array.isArray(readings) || !Array.isArray(links)) return unavailable;
  const byId = new Map<string, T>();
  for (const row of readings) {
    if (
      !row ||
      !isUuid(row.id) ||
      byId.has(row.id) ||
      row.user_id !== ownerId ||
      !isUuid(row.tent_id) ||
      !Number.isFinite(row.value) ||
      !isObservationTimestamp(row.captured_at ?? row.ts)
    )
      return unavailable;
    byId.set(row.id, row);
  }
  const next = new Map<string, string>();
  const previous = new Map<string, string>();
  for (const link of links) {
    if (!link || !link.replacement_reading_id) return unavailable;
    const original = byId.get(link.original_reading_id);
    const replacement = byId.get(link.replacement_reading_id);
    if (
      !original ||
      !replacement ||
      link.user_id !== ownerId ||
      link.tent_id !== original.tent_id ||
      replacement.tent_id !== original.tent_id ||
      replacement.metric !== original.metric ||
      original.source !== "manual" ||
      replacement.source !== "manual" ||
      link.source_before !== "manual" ||
      link.source_after !== "manual" ||
      !Array.isArray(link.changed_fields) ||
      link.changed_fields.length !== 1 ||
      link.changed_fields[0] !== original.metric ||
      !matchesValue(link.old_values, original.metric, original.value) ||
      !matchesValue(link.new_values, original.metric, replacement.value) ||
      next.has(original.id) ||
      previous.has(replacement.id)
    )
      return unavailable;
    next.set(original.id, replacement.id);
    previous.set(replacement.id, original.id);
  }
  const resolved: T[] = [];
  const visited = new Set<string>();
  for (const original of [...byId.values()].sort((a, b) => compareIds(a.id, b.id))) {
    if (previous.has(original.id)) continue;
    let last = original;
    while (true) {
      if (visited.has(last.id)) return unavailable;
      visited.add(last.id);
      const nextId = next.get(last.id);
      if (!nextId) break;
      const replacement = byId.get(nextId);
      if (!replacement) return unavailable;
      last = replacement;
    }
    resolved.push({ ...original, value: last.value });
  }
  // A component without a root is a cycle, even if another component resolved.
  if (visited.size !== byId.size) return unavailable;
  return {
    status: "resolved",
    readings: resolved,
    suppressedReplacementIds: [...previous.keys()].sort(compareIds),
  };
}
