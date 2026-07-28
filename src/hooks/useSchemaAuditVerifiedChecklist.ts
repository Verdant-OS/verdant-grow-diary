import { useCallback, useEffect, useMemo, useState } from "react";

import type { SchemaAuditChecklistScope } from "@/lib/schemaAuditRules";

const STORAGE_KEY = "verdant:schema-audit:verified:v2";

interface StoredChecklist {
  scope: string;
  verified: string[];
}

function serializeScope(scope: SchemaAuditChecklistScope | null): string | null {
  if (!scope) return null;
  return JSON.stringify({
    user_id: scope.user_id,
    backend_ref: scope.backend_ref,
    checked_at: scope.checked_at,
    snapshot_fingerprint: scope.snapshot_fingerprint,
  });
}

function readStore(scopeKey: string | null): Set<string> {
  if (typeof window === "undefined" || !scopeKey) return new Set();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Partial<StoredChecklist>;
    if (parsed.scope !== scopeKey || !Array.isArray(parsed.verified)) return new Set();
    return new Set(parsed.verified.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

function writeStore(scopeKey: string, verified: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredChecklist = {
      scope: scopeKey,
      verified: Array.from(verified).sort(),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage disabled — verification remains best-effort local state.
  }
}

function clearStore() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage disabled — there is no durable local checklist to clear.
  }
}

/**
 * Per-tab review checklist scoped to one authenticated backend snapshot.
 * Changing user, backend, checked_at, or fingerprint clears prior marks.
 */
export function useSchemaAuditVerifiedChecklist(scope: SchemaAuditChecklistScope | null) {
  const scopeKey = useMemo(() => serializeScope(scope), [scope]);
  const [activeScopeKey, setActiveScopeKey] = useState<string | null>(scopeKey);
  const [verified, setVerified] = useState<Set<string>>(() => readStore(scopeKey));

  useEffect(() => {
    if (activeScopeKey === scopeKey) return;
    clearStore();
    setActiveScopeKey(scopeKey);
    setVerified(new Set());
  }, [activeScopeKey, scopeKey]);

  useEffect(() => {
    if (scopeKey && activeScopeKey === scopeKey) writeStore(scopeKey, verified);
  }, [activeScopeKey, scopeKey, verified]);

  const currentVerified = useMemo(
    () => (activeScopeKey === scopeKey ? verified : new Set<string>()),
    [activeScopeKey, scopeKey, verified],
  );
  const isVerified = useCallback((id: string) => currentVerified.has(id), [currentVerified]);

  const toggle = useCallback(
    (id: string) => {
      if (!scopeKey || activeScopeKey !== scopeKey) return;
      setVerified((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [activeScopeKey, scopeKey],
  );

  const clearAll = useCallback(() => {
    if (!scopeKey || activeScopeKey !== scopeKey) return;
    setVerified(new Set());
  }, [activeScopeKey, scopeKey]);

  return {
    verified: currentVerified,
    isVerified,
    toggle,
    clearAll,
    count: currentVerified.size,
    scoped: scopeKey !== null && activeScopeKey === scopeKey,
  };
}
