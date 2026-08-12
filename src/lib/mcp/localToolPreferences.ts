/**
 * Local per-tool preferences for the MCP status page.
 *
 * HONESTY CONTRACT: these preferences are LOCAL TO THIS BROWSER only.
 * The Verdant MCP OAuth grant is integration-wide — a connected
 * assistant is authorized for every advertised read-only tool at once,
 * and nothing written here changes what the server allows. Disabling a
 * tool here only (a) stops this browser's built-in test clients (the
 * status-page probe and the docs-page tool explorer) from calling it
 * and (b) marks it disabled in the support export. The UI that renders
 * these toggles must say so explicitly, and every built-in client that
 * can call a tool MUST consult these preferences — a toggle that gates
 * nothing is a dishonest control.
 *
 * Storage is injectable so tests never touch real localStorage.
 */
import { MCP_MANIFEST } from "@/lib/mcp/manifestView";

export const LOCAL_TOOL_PREFS_KEY = "verdant.mcp.localToolPrefs.v1";

/** Minimal Storage surface we rely on (subset of DOM Storage). */
export type PrefStorage = Pick<Storage, "getItem" | "setItem">;

export type LocalToolPreferences = Record<string, boolean>;

function defaultPreferences(): LocalToolPreferences {
  const prefs: LocalToolPreferences = {};
  for (const tool of MCP_MANIFEST.tools) prefs[tool.name] = true;
  return prefs;
}

function safeStorage(): PrefStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read local tool preferences. Every advertised tool defaults to
 * enabled; unknown keys in storage are ignored; corrupt JSON falls back
 * to the defaults. Never throws.
 */
export function readLocalToolPreferences(
  storage: PrefStorage | null = safeStorage(),
): LocalToolPreferences {
  const prefs = defaultPreferences();
  if (!storage) return prefs;
  try {
    const raw = storage.getItem(LOCAL_TOOL_PREFS_KEY);
    if (!raw) return prefs;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return prefs;
    for (const name of Object.keys(prefs)) {
      const v = (parsed as Record<string, unknown>)[name];
      if (typeof v === "boolean") prefs[name] = v;
    }
    return prefs;
  } catch {
    return prefs;
  }
}

/**
 * Persist one tool's local preference. Unknown tool names are ignored
 * (nothing is written) so storage can never accumulate stray keys.
 * Returns the resulting full preference map.
 */
export function setLocalToolPreference(
  name: string,
  enabled: boolean,
  storage: PrefStorage | null = safeStorage(),
): LocalToolPreferences {
  const prefs = readLocalToolPreferences(storage);
  if (!(name in prefs)) return prefs;
  prefs[name] = enabled;
  if (storage) {
    try {
      storage.setItem(LOCAL_TOOL_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* quota/privacy-mode failures degrade to in-memory only */
    }
  }
  return prefs;
}
