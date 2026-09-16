import { useEffect, useRef, useState } from "react";
import { newQuickLogSaveKey } from "@/lib/quickLogIdempotencyKey";
import {
  correctQuickLogEntry,
  retractQuickLogEntry,
  type QuickLogEntryHandle,
  type QuickLogRevisionWriteResult,
} from "@/lib/quickLogRevisionService";
import {
  QUICKLOG_REVISION_FAILURE_COPY,
  type QuickLogCorrectionChanges,
  type QuickLogRevisionReasonCode,
} from "@/lib/quick-log/quickLogRevisionRules";

type Kind = "correction" | "retraction";
interface PendingRevision {
  kind: Kind;
  key: string;
  reason: QuickLogRevisionReasonCode;
  note: string;
  changes: QuickLogCorrectionChanges;
}

/** Mounted once per owner/root. Unconfirmed writes retain their exact request. */
export function useQuickLogRevisionMutation(ownerId: string | null, handle: QuickLogEntryHandle) {
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const pending = useRef<PendingRevision | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const submit = async (
    kind: Kind,
    reason: QuickLogRevisionReasonCode,
    changes: QuickLogCorrectionChanges,
    note: string,
  ): Promise<QuickLogRevisionWriteResult | null> => {
    if (inFlight.current || !alive.current) return null;
    if (!ownerId) return { ok: false, reason: "not_authenticated" };
    if (pending.current && pending.current.kind !== kind) {
      return { ok: false, reason: "rpc_error" };
    }
    const request = pending.current ?? {
      kind,
      key: newQuickLogSaveKey(),
      reason,
      note,
      changes: { ...changes },
    };
    inFlight.current = true;
    setBusy(true);
    let result: QuickLogRevisionWriteResult;
    try {
      result =
        request.kind === "correction"
          ? await correctQuickLogEntry(
              handle,
              request.reason,
              request.changes,
              request.note,
              request.key,
            )
          : await retractQuickLogEntry(handle, request.reason, request.note, request.key);
    } catch {
      result = { ok: false, reason: "rpc_error" };
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
    if (!alive.current) return null;
    // A later rejection cannot disprove an earlier ambiguous commit.
    const unknown =
      !result.ok &&
      (pending.current !== null ||
        result.reason === "rpc_error" ||
        !Object.hasOwn(QUICKLOG_REVISION_FAILURE_COPY, result.reason));
    pending.current = unknown ? request : null;
    setUnconfirmed(unknown);
    return unknown ? { ok: false, reason: "rpc_error" } : result;
  };
  return { busy, unconfirmed, pendingKind: unconfirmed ? pending.current?.kind : null, submit };
}
