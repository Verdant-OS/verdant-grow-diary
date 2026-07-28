import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "verdant:schema-audit:verified";

function readStore(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeStore(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // sessionStorage disabled — silently ignore, verification is best-effort local state.
  }
}

/**
 * Local, per-tab session checklist for the operator schema audit.
 * State is stored only in sessionStorage — nothing is written to the database.
 */
export function useSchemaAuditVerifiedChecklist() {
  const [verified, setVerified] = useState<Set<string>>(() => readStore());

  useEffect(() => {
    writeStore(verified);
  }, [verified]);

  const isVerified = useCallback((id: string) => verified.has(id), [verified]);

  const toggle = useCallback((id: string) => {
    setVerified((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setVerified(new Set()), []);

  return { verified, isVerified, toggle, clearAll, count: verified.size };
}
