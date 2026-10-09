/**
 * useActionEvidenceVerification — #1001.
 *
 * Reads back the stored sensor rows behind an action's evidence refs and
 * returns per-ref verification. Until the read settles every sensor ref is
 * "not checked" (unverified), so nothing renders as Live early.
 *
 * `revision` identifies one load of the action (ActionDetail passes the row
 * object, which is new on every load). A new revision re-reads the rows even
 * when the ids are unchanged, so a reading superseded since the last load
 * cannot keep a verified badge; the badge is "not checked" until it settles.
 */
import { useEffect, useMemo, useState } from "react";
import {
  sensorEvidenceRefIdsToRead,
  verifyActionEvidenceRefs,
  type EvidenceRefVerification,
  type EvidenceRowsRead,
} from "@/lib/actionEvidenceVerificationRules";
import { fetchEvidenceSensorRows } from "@/lib/actionEvidenceVerificationService";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";

export function useActionEvidenceVerification(
  refs: ReadonlyArray<OriginatingTimelineEventRef>,
  actionTentId: string | null | undefined,
  actionTargetMetric: string | null | undefined,
  revision: unknown,
): Map<string, EvidenceRefVerification> {
  const ids = useMemo(() => sensorEvidenceRefIdsToRead(refs), [refs]);
  const idsKey = ids.join(",");
  const [read, setRead] = useState<EvidenceRowsRead>({ status: "pending" });

  useEffect(() => {
    let cancelled = false;
    const wanted = idsKey ? idsKey.split(",") : [];
    if (wanted.length === 0) {
      setRead({ status: "ok", rows: [] });
      return;
    }
    setRead({ status: "pending" });
    fetchEvidenceSensorRows(wanted)
      .then((rows) => {
        if (!cancelled) setRead({ status: "ok", rows });
      })
      .catch(() => {
        if (!cancelled) setRead({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, revision]);

  return useMemo(
    () => verifyActionEvidenceRefs({ refs, actionTentId, actionTargetMetric, read }),
    [refs, actionTentId, actionTargetMetric, read],
  );
}
