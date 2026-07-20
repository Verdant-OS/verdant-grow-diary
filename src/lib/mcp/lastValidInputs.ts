/**
 * Per-tool "last valid inputs" persistence for the MCP tool explorer.
 *
 * When a tool call returns ok (no isError, no invalid_params), we snapshot
 * the current form values so the next visit to the explorer pre-fills the
 * fields the grower just corrected. Storage is per-browser, per-tool, and
 * only stringifiable field values are stored — never tokens, results, or
 * server payloads.
 */

const STORAGE_PREFIX = "verdant.mcp.lastValidInputs.v1";

export type ToolName =
  | "list_grows"
  | "list_recent_diary_entries"
  | "get_latest_sensor_snapshot";

function storageKey(tool: ToolName) {
  return `${STORAGE_PREFIX}.${tool}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadLastValidInputs<T extends Record<string, unknown>>(
  tool: ToolName,
): Partial<T> | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(storageKey(tool));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<T>;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLastValidInputs(
  tool: ToolName,
  inputs: Record<string, unknown>,
): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(storageKey(tool), JSON.stringify(inputs));
  } catch {
    // Quota or serialization failure — silently skip; explorer still works.
  }
}

export function clearLastValidInputs(tool: ToolName): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.removeItem(storageKey(tool));
  } catch {
    // ignore
  }
}
