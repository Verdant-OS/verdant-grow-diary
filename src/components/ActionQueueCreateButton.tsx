/**
 * ActionQueueCreateButton — presenter + dialog for manually creating an
 * approval-required Action Queue item directly on `/actions`.
 *
 * Safety contract:
 *  - Creates only via `createActionQueueItem` (`action_queue_create` RPC),
 *    which forces `status = 'pending_approval'` and `target_device = NULL`,
 *    and resolves `auth.uid()` server-side.
 *  - Never sends `user_id` or `target_device`.
 *  - Items remain approval-required.
 */
import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createActionQueueItem } from "@/lib/actionQueueCreateService";
import {
  actionQueueCreateFailureCopy,
  type ActionQueueCreateRisk,
} from "@/lib/actionQueueCreateRules";
import { ACTION_QUEUE_SOURCE_VALUES } from "@/lib/actionQueueProvenanceRules";

export interface ActionQueueCreateButtonProps {
  growId: string | null | undefined;
  disabled?: boolean;
  onCreated?: (actionQueueId: string) => Promise<void> | void;
}

export function ActionQueueCreateButton({
  growId,
  disabled,
  onCreated,
}: ActionQueueCreateButtonProps) {
  const [open, setOpen] = useState(false);
  const [suggestedChange, setSuggestedChange] = useState("");
  const [reason, setReason] = useState("");
  const [riskLevel, setRiskLevel] = useState<ActionQueueCreateRisk>("low");
  const [submitting, setSubmitting] = useState(false);

  const effectiveGrowId = typeof growId === "string" && growId.trim() ? growId.trim() : null;
  const canSubmit =
    !!effectiveGrowId &&
    suggestedChange.trim().length > 0 &&
    reason.trim().length > 0 &&
    !submitting;

  function resetForm() {
    setSuggestedChange("");
    setReason("");
    setRiskLevel("low");
  }

  async function handleSubmit() {
    if (!canSubmit || !effectiveGrowId) return;
    setSubmitting(true);
    let result: Awaited<ReturnType<typeof createActionQueueItem>>;
    try {
      result = await createActionQueueItem({
        grow_id: effectiveGrowId,
        action_type: "advisory",
        target_metric: "general",
        suggested_change: suggestedChange.trim(),
        reason: reason.trim(),
        risk_level: riskLevel,
        source: ACTION_QUEUE_SOURCE_VALUES.MANUAL,
        audit_note: "Created manually in Action Queue (approval required)",
        originating_timeline_events: [],
      });
    } catch {
      toast.error(actionQueueCreateFailureCopy(null));
      return;
    } finally {
      setSubmitting(false);
    }
    if (!result.ok) {
      toast.error(actionQueueCreateFailureCopy(result.reason));
      return;
    }
    toast.success(
      result.reused ? "Action already in queue for approval." : "Action queued for approval.",
    );
    resetForm();
    setOpen(false);
    await onCreated?.(result.action_queue_id);
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !effectiveGrowId}
        onClick={() => setOpen(true)}
        data-testid="action-queue-create-button"
        aria-label="Add action to Action Queue"
        className="min-h-11 min-w-0 whitespace-normal sm:min-h-9"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span>Add action</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !submitting) {
            setOpen(false);
          }
        }}
      >
        <DialogContent data-testid="action-queue-create-dialog">
          <DialogHeader>
            <DialogTitle>Add Action to Queue</DialogTitle>
            <DialogDescription>
              Draft a manual action for grower review. New items always require approval and never
              send commands to equipment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="action-queue-create-suggested-change">Suggested action</Label>
              <Input
                id="action-queue-create-suggested-change"
                value={suggestedChange}
                onChange={(e) => setSuggestedChange(e.target.value)}
                placeholder="e.g. Check canopy airflow and inspect lower leaves"
                data-testid="action-queue-create-suggested-change"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="action-queue-create-reason">Reason</Label>
              <Textarea
                id="action-queue-create-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this action needed?"
                rows={3}
                data-testid="action-queue-create-reason"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="action-queue-create-risk">Risk level</Label>
              <Select
                value={riskLevel}
                onValueChange={(v) => setRiskLevel(v as ActionQueueCreateRisk)}
              >
                <SelectTrigger
                  id="action-queue-create-risk"
                  aria-label="New action risk level"
                  data-testid="action-queue-create-risk"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={submitting}
              onClick={() => setOpen(false)}
              data-testid="action-queue-create-cancel"
            >
              Cancel
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              data-testid="action-queue-create-submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Adding…</span>
                </>
              ) : (
                "Add to Action Queue"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
