import { useState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useGrows } from "@/store/grows";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { evaluateGrowCreationGate } from "@/lib/entitlements/freeTierGates";
import {
  GROW_ARCHIVE_CONFIRM_COPY,
  GROW_ARCHIVE_FAILED_COPY,
  growRestoreFailureCopy,
  nextActiveGrowIdAfterArchive,
  planGrowRestore,
} from "@/lib/archivedGrowQuickLogRules";

interface Props {
  growId: string;
  isArchived: boolean;
  onChanged?: () => void | Promise<void>;
}

/**
 * Archive or Restore action for Grow Detail header.
 * Uses the same archive confirmation and Free active-grow restore cap as My Grows.
 */
export default function GrowArchiveControlButton({ growId, isArchived, onChanged }: Props) {
  const { grows = [], activeGrowId = null, setActiveGrowId, refresh } = useGrows();
  const {
    loading: entLoading,
    lookupFailed: entitlementLookupFailed,
    entitlement,
  } = useMyEntitlements();
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const growGate = evaluateGrowCreationGate(
    entLoading || entitlementLookupFailed ? null : entitlement?.capabilities,
    grows.length,
  );

  async function handleArchive() {
    if (busy) return;
    if (!confirm(GROW_ARCHIVE_CONFIRM_COPY)) return;
    setBusy(true);
    setRestoreError(null);
    try {
      const { data: archivedRows, error: archiveError } = await supabase
        .from("grows")
        .update({ is_archived: true })
        .eq("id", growId)
        .select();
      const archivedCount = Array.isArray(archivedRows) ? archivedRows.length : 0;
      if (archiveError || archivedCount === 0) {
        toast.error(GROW_ARCHIVE_FAILED_COPY);
        return;
      }
      if (activeGrowId === growId && typeof setActiveGrowId === "function") {
        setActiveGrowId(
          nextActiveGrowIdAfterArchive({
            archivedGrowId: growId,
            activeGrowId,
            activeGrows: grows,
          }),
        );
      }
      if (typeof refresh === "function") {
        await refresh();
      }
      await onChanged?.();
      toast.success("Archived");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (busy) return;
    const plan = planGrowRestore({
      allowed: growGate.allowed,
      blockedCopy: growGate.blockedCopy,
    });
    if (!plan.proceed) {
      setRestoreError(plan.errorCopy);
      if (plan.errorCopy) toast.error(plan.errorCopy);
      return;
    }
    setBusy(true);
    setRestoreError(null);
    try {
      const { data: restoredRows, error: restoreWriteError } = await supabase
        .from("grows")
        .update({ is_archived: false })
        .eq("id", growId)
        .select();
      const restoredCount = Array.isArray(restoredRows) ? restoredRows.length : 0;
      if (restoreWriteError || restoredCount === 0) {
        const copy = growRestoreFailureCopy(restoreWriteError);
        setRestoreError(copy);
        toast.error(copy);
        return;
      }
      if (typeof refresh === "function") {
        await refresh();
      }
      await onChanged?.();
      toast.success("Grow restored");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {isArchived ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          aria-busy={busy}
          onClick={handleRestore}
          data-testid="grow-detail-restore"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {busy ? "Restoring grow" : "Restore grow"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          aria-busy={busy}
          onClick={handleArchive}
          data-testid="grow-detail-archive"
        >
          <Archive className="h-4 w-4" aria-hidden="true" />
          {busy ? "Archiving grow" : "Archive grow"}
        </Button>
      )}
      {restoreError && (
        <p
          role="alert"
          data-testid="grow-restore-error"
          className="w-full rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {restoreError}
        </p>
      )}
    </>
  );
}
