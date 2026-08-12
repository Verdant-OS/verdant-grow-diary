/**
 * QuickLogEntryIntegrityControls — "Correct" / "Retract" affordances for a
 * single Quick Log entry (issue #786).
 *
 * Safety:
 *   - Append-only: both actions call SECURITY DEFINER RPCs that write an
 *     immutable revision ledger row. Nothing here deletes anything.
 *   - Retraction always goes through an explicit confirmation dialog with a
 *     required reason chip; the copy states the entry is removed from active
 *     history but retained in the audit trail.
 *   - Hidden when no Quick Log handle can be resolved (legacy/plain diary
 *     rows keep their existing Edit / Remove controls, untouched).
 *   - No entitlement/plan gating — identical for every plan.
 *   - Fixed copy; never echoes raw DB errors.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilLine, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  QUICKLOG_CORRECT_DIALOG_BODY,
  QUICKLOG_CORRECT_DIALOG_TITLE,
  QUICKLOG_CORRECTION_REASON_CHIPS,
  QUICKLOG_RETRACT_CONFIRM_LABEL,
  QUICKLOG_RETRACT_DIALOG_BODY,
  QUICKLOG_RETRACT_DIALOG_TITLE,
  QUICKLOG_RETRACTION_REASON_CHIPS,
  QUICKLOG_REVISION_NOTE_MAX_LENGTH,
  QUICKLOG_REVISION_REASON_LABELS,
  quickLogRevisionFailureCopy,
  type QuickLogRevisionReasonCode,
} from "@/lib/quick-log/quickLogRevisionRules";
import {
  correctQuickLogEntry,
  retractQuickLogEntry,
  type QuickLogEntryHandle,
} from "@/lib/quickLogRevisionService";
import {
  QUICKLOG_REVISION_INVALIDATION_KEY_CONTAINS,
  buildQuickLogRevisionInvalidationKeys,
} from "@/lib/quickLogRevisionInvalidationRules";
import { cn } from "@/lib/utils";

export interface QuickLogEntryIntegrityControlsProps {
  handle: QuickLogEntryHandle;
  /** Current values used to prefill the correction form. */
  currentNote?: string | null;
  currentOccurredAt?: string | null;
  currentPlantId?: string | null;
  /** Invalidation scope (best-effort; broad prefixes are used regardless). */
  plantId?: string | null;
  tentId?: string | null;
  growId?: string | null;
  onChanged?: () => void;
  className?: string;
}

interface OwnedPlantOption {
  id: string;
  name: string;
}

function useOwnedPlantOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["quicklog_correction_plants"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<OwnedPlantOption[]> => {
      const { data, error } = await supabase
        .from("plants")
        .select("id, name, is_archived")
        .eq("is_archived", false)
        .order("name", { ascending: true })
        .limit(200);
      if (error) return [];
      return (data ?? []).map((p) => ({ id: p.id, name: p.name }));
    },
  });
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function ReasonChips({
  chips,
  selected,
  onSelect,
  testIdPrefix,
}: {
  chips: readonly QuickLogRevisionReasonCode[];
  selected: QuickLogRevisionReasonCode | null;
  onSelect: (r: QuickLogRevisionReasonCode) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          role="radio"
          aria-checked={selected === chip}
          data-testid={`${testIdPrefix}-reason-${chip}`}
          onClick={() => onSelect(chip)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition",
            selected === chip
              ? "border-primary bg-primary/15 text-primary"
              : "border-border/60 text-muted-foreground hover:bg-secondary/40",
          )}
        >
          {QUICKLOG_REVISION_REASON_LABELS[chip]}
        </button>
      ))}
    </div>
  );
}

export default function QuickLogEntryIntegrityControls({
  handle,
  currentNote,
  currentOccurredAt,
  currentPlantId,
  plantId,
  tentId,
  growId,
  onChanged,
  className,
}: QuickLogEntryIntegrityControlsProps) {
  const queryClient = useQueryClient();
  const [correctOpen, setCorrectOpen] = useState(false);
  const [retractOpen, setRetractOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [correctReason, setCorrectReason] = useState<QuickLogRevisionReasonCode | null>(null);
  const [retractReason, setRetractReason] = useState<QuickLogRevisionReasonCode | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>(currentNote ?? "");
  const [timeDraft, setTimeDraft] = useState<string>(toDatetimeLocalValue(currentOccurredAt));
  const [plantDraft, setPlantDraft] = useState<string>(currentPlantId ?? "");
  const [explain, setExplain] = useState("");

  const plantsQuery = useOwnedPlantOptions(correctOpen);

  const hasHandle = !!handle.growEventId || !!handle.diaryEntryId;
  const invalidate = useMemo(
    () => () => {
      const keys = buildQuickLogRevisionInvalidationKeys({
        growEventId: handle.growEventId ?? null,
        diaryEntryIds: handle.diaryEntryId ? [handle.diaryEntryId] : null,
        plantId,
        tentId,
        growId,
      });
      // Owner-prefixed keys (buildPrivateGrowQueryKey) cannot be matched by
      // prefix from pure code; match them by contained token instead so the
      // mounted root-zone/AI-context queries refresh too.
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.some(
            (part) =>
              typeof part === "string" &&
              QUICKLOG_REVISION_INVALIDATION_KEY_CONTAINS.includes(part),
          ),
      });
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: key as unknown[] });
      }
    },
    [queryClient, handle.growEventId, handle.diaryEntryId, plantId, tentId, growId],
  );

  if (!hasHandle) return null;

  const openCorrect = () => {
    setNoteDraft(currentNote ?? "");
    setTimeDraft(toDatetimeLocalValue(currentOccurredAt));
    setPlantDraft(currentPlantId ?? "");
    setExplain("");
    setCorrectReason(null);
    setCorrectOpen(true);
  };

  const submitCorrection = async () => {
    if (!correctReason) {
      toast.error("Pick a reason chip first.");
      return;
    }
    const changes: {
      note?: string | null;
      occurredAt?: string;
      targetType?: "plant" | "tent";
      targetId?: string;
    } = {};
    if ((currentNote ?? "") !== noteDraft) changes.note = noteDraft;
    const originalTime = toDatetimeLocalValue(currentOccurredAt);
    if (timeDraft && timeDraft !== originalTime) {
      const parsed = new Date(timeDraft);
      if (!Number.isNaN(parsed.getTime())) changes.occurredAt = parsed.toISOString();
    }
    if (plantDraft && plantDraft !== (currentPlantId ?? "")) {
      changes.targetType = "plant";
      changes.targetId = plantDraft;
    }
    setBusy(true);
    const result = await correctQuickLogEntry(handle, correctReason, changes, explain);
    setBusy(false);
    if (!result.ok) {
      toast.error(quickLogRevisionFailureCopy(result.reason));
      return;
    }
    toast.success("Entry corrected. The original stays in its history.");
    setCorrectOpen(false);
    invalidate();
    onChanged?.();
  };

  const submitRetraction = async () => {
    if (!retractReason) {
      toast.error("Pick a reason chip first.");
      return;
    }
    setBusy(true);
    const result = await retractQuickLogEntry(handle, retractReason, explain);
    setBusy(false);
    if (!result.ok) {
      toast.error(quickLogRevisionFailureCopy(result.reason));
      return;
    }
    toast.success("Entry retracted. It stays in your audit trail.");
    setRetractOpen(false);
    invalidate();
    onChanged?.();
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          openCorrect();
        }}
        aria-label="Correct this Quick Log entry"
        data-testid="quicklog-entry-correct-button"
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
      >
        <PencilLine className="h-3 w-3" />
        Correct
      </button>
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          setRetractReason(null);
          setExplain("");
          setRetractOpen(true);
        }}
        aria-label="Retract this Quick Log entry"
        data-testid="quicklog-entry-retract-button"
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
      >
        <Undo2 className="h-3 w-3" />
        Retract
      </button>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent data-testid="quicklog-entry-correct-dialog">
          <DialogHeader>
            <DialogTitle>{QUICKLOG_CORRECT_DIALOG_TITLE}</DialogTitle>
            <DialogDescription>{QUICKLOG_CORRECT_DIALOG_BODY}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ReasonChips
              chips={QUICKLOG_CORRECTION_REASON_CHIPS}
              selected={correctReason}
              onSelect={setCorrectReason}
              testIdPrefix="quicklog-correct"
            />
            <label className="block text-xs text-muted-foreground">
              Note
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={3}
                data-testid="quicklog-correct-note-input"
                className="mt-1 w-full rounded-md border border-border/60 bg-background p-2 text-sm"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              When it happened
              <input
                type="datetime-local"
                value={timeDraft}
                onChange={(e) => setTimeDraft(e.target.value)}
                data-testid="quicklog-correct-time-input"
                className="mt-1 w-full rounded-md border border-border/60 bg-background p-2 text-sm"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Plant
              <select
                value={plantDraft}
                onChange={(e) => setPlantDraft(e.target.value)}
                data-testid="quicklog-correct-plant-select"
                className="mt-1 w-full rounded-md border border-border/60 bg-background p-2 text-sm"
              >
                <option value="">Keep current plant</option>
                {(plantsQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              Why (optional)
              <input
                type="text"
                value={explain}
                maxLength={QUICKLOG_REVISION_NOTE_MAX_LENGTH}
                onChange={(e) => setExplain(e.target.value)}
                data-testid="quicklog-correct-explain-input"
                className="mt-1 w-full rounded-md border border-border/60 bg-background p-2 text-sm"
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCorrectOpen(false)}
              disabled={busy}
              data-testid="quicklog-correct-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitCorrection()}
              disabled={busy || !correctReason}
              data-testid="quicklog-correct-save"
            >
              Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={retractOpen} onOpenChange={setRetractOpen}>
        <AlertDialogContent data-testid="quicklog-entry-retract-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{QUICKLOG_RETRACT_DIALOG_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>{QUICKLOG_RETRACT_DIALOG_BODY}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <ReasonChips
              chips={QUICKLOG_RETRACTION_REASON_CHIPS}
              selected={retractReason}
              onSelect={setRetractReason}
              testIdPrefix="quicklog-retract"
            />
            <label className="block text-xs text-muted-foreground">
              Why (optional)
              <input
                type="text"
                value={explain}
                maxLength={QUICKLOG_REVISION_NOTE_MAX_LENGTH}
                onChange={(e) => setExplain(e.target.value)}
                data-testid="quicklog-retract-explain-input"
                className="mt-1 w-full rounded-md border border-border/60 bg-background p-2 text-sm"
              />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} data-testid="quicklog-retract-cancel">
              Keep entry
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="quicklog-retract-confirm"
              onClick={(ev) => {
                ev.preventDefault();
                void submitRetraction();
              }}
              disabled={busy || !retractReason}
            >
              {QUICKLOG_RETRACT_CONFIRM_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}

/** Compact "edited" disclosure badge for corrected entries. */
export function QuickLogEditedBadge({
  correctionCount,
  className,
}: {
  correctionCount: number;
  className?: string;
}) {
  if (correctionCount <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground",
        className,
      )}
      title={
        correctionCount === 1
          ? "Corrected once. The original values are kept in the audit history."
          : `Corrected ${correctionCount} times. The original values are kept in the audit history.`
      }
      data-testid="quicklog-entry-edited-badge"
    >
      edited
    </span>
  );
}
