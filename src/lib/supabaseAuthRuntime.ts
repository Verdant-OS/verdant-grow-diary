export interface SupabaseAuthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SupabaseAuthStorageKind =
  | "server_memory"
  | "browser_session"
  | "browser_memory";

export interface SupabaseAuthRuntime {
  storage: SupabaseAuthStorage;
  storageKind: SupabaseAuthStorageKind;
  persistSession: boolean;
  autoRefreshToken: boolean;
  detectSessionInUrl: boolean;
}

/**
 * A new isolated storage instance for runtimes where browser storage is not
 * available. Server auth persistence stays disabled, so this adapter cannot
 * turn a module-level client into a cross-request session cache.
 */
export function createTransientMemoryStorage(): SupabaseAuthStorage {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

/**
 * Resolve the complete Supabase auth lifecycle as one deterministic unit.
 *
 * - SSR/prerender: explicit memory adapter, no persistence, no refresh timer,
 *   and no URL-session parsing.
 * - Browser with sessionStorage: existing per-tab persistence contract.
 * - Browser with blocked storage: in-memory per-module fallback so importing
 *   and using the client never depends on a throwing browser getter.
 */
export function createSupabaseAuthRuntime(): SupabaseAuthRuntime {
  if (typeof window === "undefined") {
    return {
      storage: createTransientMemoryStorage(),
      storageKind: "server_memory",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    };
  }

  try {
    const storage = window.sessionStorage;
    if (storage) {
      return {
        storage,
        storageKind: "browser_session",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      };
    }
  } catch {
    // Privacy mode, policy, or a partial SSR window shim can throw here.
  }

  return {
    storage: createTransientMemoryStorage(),
    storageKind: "browser_memory",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  };
}
