/**
 * A session-only auth storage adapter that remains usable when a browser
 * blocks access to sessionStorage (for example, in a restrictive privacy
 * context). It never falls back to localStorage.
 */
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SessionStorageResolver = () => SessionStorageLike | null;

function browserSessionStorage(): SessionStorageLike | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

/**
 * Uses the browser's sessionStorage while it is available. After any storage
 * access fails, it switches to page-memory only so an old durable token can
 * never be read after a newer write could not be persisted.
 */
export function createResilientSessionStorage(
  resolveSessionStorage: SessionStorageResolver = browserSessionStorage,
): SessionStorageLike {
  const fallback = new Map<string, string>();
  let fallbackOnly = false;

  const resolve = (): SessionStorageLike | null => {
    if (fallbackOnly) return null;

    try {
      return resolveSessionStorage();
    } catch {
      fallbackOnly = true;
      return null;
    }
  };

  return {
    getItem(key) {
      const storage = resolve();
      if (!storage) return fallback.get(key) ?? null;

      try {
        return storage.getItem(key) ?? null;
      } catch {
        fallbackOnly = true;
        return fallback.get(key) ?? null;
      }
    },

    setItem(key, value) {
      const storage = resolve();
      if (!storage) {
        fallback.set(key, value);
        return;
      }

      try {
        storage.setItem(key, value);
      } catch {
        fallbackOnly = true;
        fallback.set(key, value);
      }
    },

    removeItem(key) {
      const storage = resolve();
      if (!storage) {
        fallback.delete(key);
        return;
      }

      try {
        storage.removeItem(key);
        fallback.delete(key);
      } catch {
        fallbackOnly = true;
        fallback.delete(key);
      }
    },
  };
}

export const resilientSessionStorage = createResilientSessionStorage();
