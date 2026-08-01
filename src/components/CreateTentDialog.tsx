import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGES } from "@/lib/grow";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useTents } from "@/hooks/use-tents";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { evaluateTentCreationGate, FREE_TIER_UPGRADE_PATH } from "@/lib/entitlements/freeTierGates";
import {
  buildCreateGrowBindingView,
  canWriteCreateGrowId,
  resolveSetupName,
} from "@/lib/createDialogGrowBindingRules";
import { GROW_SETUP_MESSAGES } from "@/constants/growSetupMessages";
import { useCreateBindingRetry } from "@/hooks/useCreateBindingRetry";

export interface CreatedTent {
  id: string;
  name: string;
  grow_id: string;
}

interface Props {
  trigger?: React.ReactNode;
  defaultGrowId?: string;
  onCreated?: (tent: CreatedTent) => void;
  initiallyOpen?: boolean;
}

const EMPTY_TENT_FORM = { name: "", size: "", brand: "", stage: "seedling" };

export default function CreateTentDialog({
  trigger,
  defaultGrowId,
  onCreated,
  initiallyOpen = false,
}: Props) {
  const { user } = useAuth();
  const {
    grows = [],
    activeGrowId,
    loading: growsLoading,
    error: growsError,
    refresh: refreshGrows,
  } = useGrows();
  const qc = useQueryClient();
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_TENT_FORM);

  const runGrowRefresh = useCallback(() => refreshGrows(), [refreshGrows]);
  const growRetry = useCreateBindingRetry(runGrowRefresh);

  const binding = useMemo(
    () =>
      buildCreateGrowBindingView(
        {
          pageDefaultGrowId: defaultGrowId,
          activeGrowId,
          grows,
          growsLoading,
          growsError: !!growsError,
        },
        "tent",
      ),
    [defaultGrowId, activeGrowId, grows, growsLoading, growsError],
  );
  const targetGrowId = binding.targetGrowId;
  const setupName = useMemo(() => resolveSetupName(targetGrowId, grows), [targetGrowId, grows]);

  const { data: tents } = useTents();
  const {
    loading: entLoading,
    lookupFailed: entitlementLookupFailed,
    entitlement,
  } = useMyEntitlements();
  const tentGate = evaluateTentCreationGate(
    entLoading || entitlementLookupFailed ? null : entitlement.capabilities,
    (tents ?? []).length,
  );

  const formBlocked = binding.blockSubmit || !canWriteCreateGrowId(targetGrowId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setForm(EMPTY_TENT_FORM);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // React submit events bubble through portals. This dialog is nested inside
    // the plant form, so do not let a tent submit reach the parent form.
    e.stopPropagation();
    if (!tentGate.allowed) {
      toast.error(tentGate.blockedCopy);
      return;
    }
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (formBlocked) {
      if (binding.toastMessage) toast.error(binding.toastMessage);
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      user_id: user.id,
      name: form.name.trim(),
      size: form.size.trim() || null,
      brand: form.brand.trim() || null,
      stage: form.stage,
      grow_id: targetGrowId,
    };
    const { data, error } = await supabase
      .from("tents")
      .insert(payload as never)
      .select("id, name, grow_id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tent created");
    trackFunnelEvent("tent_created");
    qc.invalidateQueries({ queryKey: ["tents"] });
    qc.invalidateQueries({ queryKey: ["grow", "tents"] });
    if (data && onCreated) onCreated(data as CreatedTent);
    setForm(EMPTY_TENT_FORM);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gradient-leaf text-primary-foreground gap-1">
            <Plus className="h-4 w-4" /> New tent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">New tent</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Start simple. You can add size, brand, and stage later. Verdant works best once your first
          plant memory exists.
        </p>

        {binding.showLoading && (
          <p
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
            data-testid="create-tent-loading"
          >
            {binding.body}
          </p>
        )}
        {binding.showReadError && (
          <div
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-3 space-y-2"
            data-testid="create-tent-read-error"
            role="alert"
          >
            <p className="text-sm font-semibold">{binding.title}</p>
            <p className="text-xs text-muted-foreground">{binding.body}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="create-tent-retry"
              disabled={growRetry.gate.disabled}
              aria-disabled={growRetry.gate.disabled}
              title={
                growRetry.gate.reason === "cooldown"
                  ? GROW_SETUP_MESSAGES.retryCooldownHint
                  : undefined
              }
              onClick={() => void growRetry.attempt()}
            >
              {binding.retryLabel}
            </Button>
            {growRetry.gate.reason === "cooldown" && (
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="create-tent-retry-cooldown"
              >
                {GROW_SETUP_MESSAGES.retryCooldownHint}
              </p>
            )}
          </div>
        )}
        {binding.showRequestedUnavailable && (
          <div
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 space-y-2"
            data-testid="create-tent-requested-unavailable"
            role="alert"
          >
            <p className="text-sm font-semibold">{binding.title}</p>
            <p className="text-xs text-muted-foreground">{binding.body}</p>
            <Button asChild type="button" size="sm" variant="outline">
              <Link to={binding.chooseSetupHref}>{binding.chooseSetupLabel}</Link>
            </Button>
          </div>
        )}
        {binding.showStartRoomHardStop && (
          <div
            className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-3 space-y-2"
            data-testid="create-tent-hard-stop"
            role="alert"
          >
            <p className="text-sm font-semibold" data-testid="create-tent-hard-stop-title">
              {binding.title}
            </p>
            <p className="text-xs text-muted-foreground">{binding.body}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="gradient-leaf text-primary-foreground">
                <Link to={binding.startRoomHref} data-testid="create-tent-start-room-cta">
                  {binding.primaryCta}
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                data-testid="create-tent-hard-stop-dismiss"
              >
                {binding.secondaryCta}
              </Button>
            </div>
          </div>
        )}
        {binding.showPickGrowHint && (
          <p
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            data-testid="create-tent-pick-setup"
          >
            {GROW_SETUP_MESSAGES.pickSetupToast("tent")}{" "}
            <Link
              to={binding.chooseSetupHref}
              className="underline underline-offset-2"
              data-testid="create-tent-pick-setup-cta"
            >
              {binding.chooseSetupLabel}
            </Link>
          </p>
        )}
        {binding.kind === "ready" && canWriteCreateGrowId(targetGrowId) && (
          <p
            className="text-xs rounded-md border border-primary/30 bg-primary/10 px-3 py-2"
            data-testid="create-tent-target-setup"
          >
            <span className="font-medium">
              {setupName
                ? GROW_SETUP_MESSAGES.addingTo(setupName)
                : GROW_SETUP_MESSAGES.addingToHint}
            </span>
            {setupName ? (
              <span className="block text-muted-foreground mt-0.5">
                {GROW_SETUP_MESSAGES.addingToHint}
              </span>
            ) : null}
          </p>
        )}
        {!tentGate.allowed && (
          <p
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            data-testid="tent-create-gate-notice"
          >
            {tentGate.blockedCopy}{" "}
            <Link to={FREE_TIER_UPGRADE_PATH} className="underline underline-offset-2">
              See plans
            </Link>
          </p>
        )}

        {!formBlocked && (
          <form onSubmit={submit} className="grid gap-3" data-testid="create-tent-form">
            <div>
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tent #1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Only a name is required to get started.
              </p>
            </div>
            <details className="rounded-md border border-border/40 px-3 py-2">
              <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                Optional details (enrich later)
              </summary>
              <div className="grid gap-3 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Size (optional)</Label>
                    <Input
                      value={form.size}
                      onChange={(e) => setForm({ ...form, size: e.target.value })}
                      placeholder="4x4"
                    />
                  </div>
                  <div>
                    <Label>Brand (optional)</Label>
                    <Input
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      placeholder="Gorilla"
                    />
                  </div>
                </div>
                <div>
                  <Label>Stage (optional)</Label>
                  <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.filter((s) =>
                        ["seedling", "veg", "flower", "flush", "harvest"].includes(s.value),
                      ).map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </details>
            <Button
              disabled={busy || !tentGate.allowed || formBlocked}
              className="gradient-leaf text-primary-foreground"
              data-testid="tent-create-submit"
            >
              Create tent
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
