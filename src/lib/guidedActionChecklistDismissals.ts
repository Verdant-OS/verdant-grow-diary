/**
 * Local, per-browser dismiss persistence for guided action checklist items.
 *
 * Purely client-side — never touches any Supabase table. Dismissals expire
 * after 12h so a stale reminder eventually resurfaces if the underlying
 * gap is still there. Safe on SSR / private-mode browsers where
 * localStorage throws.
 */
const STORAGE_KEY = "verdant.guidedActionChecklist.dismissedV1";
export const DISMISS_TTL_MS = 12 * 60 * 60 * 1000;

interface DismissEntry {
  id: string;
  dismissedAt: number;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(): DismissEntry[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is DismissEntry =>
        typeof v === "object" &&
        v != null &&
        typeof (v as DismissEntry).id === "string" &&
        typeof (v as DismissEntry).dismissedAt === "number",
    );
  } catch {
    return [];
  }
}

function writeRaw(entries: DismissEntry[]): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota / privacy mode — ignore.
  }
}

/**
 * Return the set of ids currently dismissed (expiry-pruned).
 */
export function readActiveDismissals(now: number = Date.now()): string[] {
  const raw = readRaw();
  const active = raw.filter((e) => now - e.dismissedAt < DISMISS_TTL_MS);
  if (active.length !== raw.length) {
    writeRaw(active);
  }
  return active.map((e) => e.id);
}

export function dismissItem(id: string, now: number = Date.now()): string[] {
  const raw = readRaw().filter(
    (e) => e.id !== id && now - e.dismissedAt < DISMISS_TTL_MS,
  );
  raw.push({ id, dismissedAt: now });
  writeRaw(raw);
  return raw.map((e) => e.id);
}

export function clearAllDismissals(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
