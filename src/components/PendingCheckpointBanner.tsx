/**
 * PendingCheckpointBanner — resurface the latest visit "Next checkpoint"
 * from plant diary notes on Plant Detail.
 *
 * Presenter + thin client derive:
 *  - Reads recent plant diary rows (existing usePlantRecentActivity).
 *  - Parses checkpoint via visitCheckpointRules (no schema).
 *  - Done / Dismiss append a durable `Checkpoint status:` marker. Linked
 *    Quick Log companions use the canonical correction RPC; ordinary diary
 *    rows retain the existing update path.
 *  - Same-angle opens existing Quick Log with checkpoint as note prefill
 *    stamped `[same-angle]` (verdant:open-quicklog); grower still saves.
 *
 * No Action Queue. No new RPC.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Flag, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { isLinkedQuickLogDiaryDetails } from "@/lib/diaryEntryRemovalRules";
import { correctQuickLogEntry } from "@/lib/quickLogRevisionService";
import { QUICKLOG_REVISION_FAILURE_COPY } from "@/lib/quick-log/quickLogRevisionRules";
import { createCheckpointCorrectionJournal } from "@/lib/visitCheckpointCorrectionStore";
import {
  buildQuickLogRevisionInvalidationKeys,
  QUICKLOG_REVISION_INVALIDATION_KEY_CONTAINS,
} from "@/lib/quickLogRevisionInvalidationRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import { stampSlot } from "@/lib/evidencePhotoSlotRules";
import {
  buildCheckpointCorrectionIntent,
  appendCheckpointClearMarker,
  buildCheckpointFollowUpNotePrefill,
  derivePendingCheckpoint,
  type CheckpointClearStatus,
  type PendingVisitCheckpoint,
  type VisitCheckpointDiaryEntry,
} from "@/lib/visitCheckpointRules";

const checkpointCorrectionJournal = createCheckpointCorrectionJournal();

function asCheckpointEntries(rows: unknown): VisitCheckpointDiaryEntry[] {
  if (!Array.isArray(rows)) return [];
  const out: VisitCheckpointDiaryEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : null;
    if (!id) continue;
    out.push({
      id,
      note: typeof r.note === "string" ? r.note : null,
      entry_at: typeof r.entry_at === "string" ? r.entry_at : null,
      occurred_at: typeof r.occurred_at === "string" ? r.occurred_at : null,
      created_at: typeof r.created_at === "string" ? r.created_at : null,
      linkedQuickLog: isLinkedQuickLogDiaryDetails(r.details),
    });
  }
  return out;
}

export interface PendingCheckpointBannerProps {
  readonly plantId: string;
  readonly plantName?: string | null;
  readonly growId?: string | null;
  readonly tentId?: string | null;
  /** Optional override for tests / story harness — skips derive when set. */
  readonly pendingOverride?: PendingVisitCheckpoint | null;
}

export default function PendingCheckpointBanner({
  plantId,
  plantName,
  growId,
  tentId,
  pendingOverride,
}: PendingCheckpointBannerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: rawRows, isLoading } = usePlantRecentActivity(plantId);
  const [saving, setSaving] = useState(false);
  const [optimisticClearedEntryId, setOptimisticClearedEntryId] = useState<string | null>(null);
  useEffect(() => {
    setOptimisticClearedEntryId(null);
  }, [plantId]);

  const entries = useMemo(() => asCheckpointEntries(rawRows), [rawRows]);

  const pending = useMemo(() => {
    if (pendingOverride !== undefined) return pendingOverride;
    const next = derivePendingCheckpoint({ entries });
    return next?.diaryEntryId === optimisticClearedEntryId ? null : next;
  }, [pendingOverride, optimisticClearedEntryId, entries]);

  const clearCheckpoint = useCallback(
    async (status: CheckpointClearStatus) => {
      if (!pending || saving) return;
      setSaving(true);
      try {
        const row = entries.find((r) => r.id === pending.diaryEntryId);
        const currentNote = typeof row?.note === "string" ? row.note : "";
        const nextNote = appendCheckpointClearMarker(currentNote, status);
        let saved = false;
        let revisionMeta: { growEventId: string | null; diaryEntryIds: string[] } | null = null;
        if (row?.linkedQuickLog) {
          const ownerId = user?.id;
          if (!ownerId) {
            toast.error("Can't safely save this checkpoint right now. Please try again.");
            return;
          }
          const intent = buildCheckpointCorrectionIntent(pending.diaryEntryId, status, nextNote);
          const claim = checkpointCorrectionJournal.claim(ownerId, pending.diaryEntryId, intent);
          if (claim.status === "conflict") {
            toast.error("The previous checkpoint update is unconfirmed. Retry that action first.");
            return;
          }
          if (claim.status === "blocked") {
            toast.error("Can't safely save this checkpoint right now. Please try again.");
            return;
          }
          const result = await correctQuickLogEntry(
            { diaryEntryId: pending.diaryEntryId },
            "other",
            { note: nextNote },
            `Checkpoint ${status}`,
            claim.idempotencyKey,
          );
          saved = result.ok;
          if (result.ok) {
            revisionMeta = {
              growEventId: result.growEventId,
              diaryEntryIds: result.diaryEntryIds,
            };
          }
          if (
            result.ok ||
            (result.reason !== "rpc_error" &&
              Object.hasOwn(QUICKLOG_REVISION_FAILURE_COPY, result.reason))
          ) {
            checkpointCorrectionJournal.clear(
              ownerId,
              pending.diaryEntryId,
              intent,
              claim.idempotencyKey,
            );
          }
        } else {
          const { data, error } = await supabase
            .from("diary_entries")
            .update({ note: nextNote })
            .eq("id", pending.diaryEntryId)
            .select("id");
          saved = !error && Array.isArray(data) && data.length === 1;
        }
        if (!saved) {
          toast.error("Could not update checkpoint status. Try again.");
          return;
        }
        setOptimisticClearedEntryId(pending.diaryEntryId);
        const keys = revisionMeta
          ? buildQuickLogRevisionInvalidationKeys({ ...revisionMeta, plantId, tentId, growId })
          : [["plant_recent_activity", plantId], ["diary_entries"]];
        await Promise.allSettled([
          ...keys.map((key) => queryClient.invalidateQueries({ queryKey: key as unknown[] })),
          ...(revisionMeta
            ? [
                queryClient.invalidateQueries({
                  predicate: (query) =>
                    query.queryKey.some(
                      (part) =>
                        typeof part === "string" &&
                        QUICKLOG_REVISION_INVALIDATION_KEY_CONTAINS.includes(part),
                    ),
                }),
              ]
            : []),
        ]);
        toast.success(status === "done" ? "Checkpoint marked done." : "Checkpoint dismissed.");
      } catch {
        toast.error("Could not update checkpoint status. Try again.");
      } finally {
        setSaving(false);
      }
    },
    [pending, saving, entries, queryClient, plantId, tentId, growId, user?.id],
  );

  const openSameAngle = useCallback(() => {
    if (!pending) return;
    const note = stampSlot(buildCheckpointFollowUpNotePrefill(pending.text), "same-angle");
    window.dispatchEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, {
        detail: {
          plantId,
          plantName: plantName ?? null,
          growId: growId ?? null,
          tentId: tentId ?? null,
          eventType: "observation",
          note,
          source: "visit-checkpoint-resurface",
        },
      }),
    );
  }, [pending, plantId, plantName, growId, tentId]);

  if (isLoading && pendingOverride === undefined) return null;
  if (!pending) return null;

  return (
    <section
      className="glass my-3 rounded-2xl p-4"
      aria-label="Pending visit checkpoint"
      data-testid="pending-checkpoint-banner"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted p-2">
          <Flag className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-semibold">Next checkpoint</h2>
          <p
            className="mt-0.5 text-sm text-foreground break-words"
            data-testid="pending-checkpoint-banner-text"
          >
            {pending.text}
          </p>
          {pending.setAt ? (
            <p
              className="mt-1 text-xs text-muted-foreground"
              data-testid="pending-checkpoint-banner-set-at"
            >
              Set {new Date(pending.setAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-11 gap-1"
          disabled={saving}
          onClick={() => void clearCheckpoint("done")}
          data-testid="pending-checkpoint-banner-done"
        >
          <Check className="h-3.5 w-3.5" /> Done
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 gap-1"
          disabled={saving}
          onClick={() => void clearCheckpoint("dismissed")}
          data-testid="pending-checkpoint-banner-dismiss"
        >
          <X className="h-3.5 w-3.5" /> Dismiss
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-11 gap-1"
          disabled={saving}
          onClick={openSameAngle}
          data-testid="pending-checkpoint-banner-same-angle"
        >
          <Camera className="h-3.5 w-3.5" /> Same angle
        </Button>
      </div>
    </section>
  );
}
