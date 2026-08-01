import { useMemo, useState } from "react";
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
  buildCreateGrowBindingHardStop,
  canWriteCreateGrowId,
  resolveCreateTargetGrowId,
  resolveSetupName,
} from "@/lib/createDialogGrowBindingRules";
import { GROW_SETUP_MESSAGES } from "@/constants/growSetupMessages";

interface Props {
  trigger?: React.ReactNode;
  defaultGrowId?: string;
  onCreated?: (tent: { id: string; name: string }) => void;
  /** Opens the existing dialog on guided activation routes only. */
  initiallyOpen?: boolean;
  /** Notify a parent (e.g. nested-inside CreatePlantDialog) when open changes. */
  onOpenChange?: (open: boolean) => void;
}

const EMPTY_TENT_FORM = { name: "", size: "", brand: "", stage: "seedling" };

export default function CreateTentDialog({
  trigger,
  defaultGrowId,
  onCreated,
  initiallyOpen = false,
  onOpenChange,
}: Props) {
  const { user } = useAuth();
  const { grows = [], activeGrowId, loading: growsLoading } = useGrows();
  const qc = useQueryClient();
  const { grows, activeGrowId, loading: growsLoading, error: growsError, refresh } = useGrows();
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_TENT_FORM);

  const targetGrowId = useMemo(
    () =>
      resolveCreateTargetGrowId({
        pageDefaultGrowId: defaultGrowId,
        activeGrowId,
        grows,
      }),
    [defaultGrowId, activeGrowId, grows],
  );
  const hardStop = useMemo(
    () =>
      buildCreateGrowBindingHardStop(
        { targetGrowId, growCount: grows.length, growsLoading },
        "tent",
      ),
    [targetGrowId, grows.length, growsLoading],
  );
  const setupName = useMemo(
    () => resolveSetupName(targetGrowId, grows),
    [targetGrowId, grows],
  );

  // Every tent creation binds to a verified current setup or fails closed.
  // The requested grow (when a caller preselects one) is matched against the
  // RLS-loaded grow list and never silently replaced by another setup.
  const binding = resolveCreateGrowBinding({
    grows,
    growsLoading: !!growsLoading,
    growsError,
    requestedGrowId: defaultGrowId ?? null,
    activeGrowId,
  });

  // Free-tier tent gate (multiTent=false → single tent). useTents already
  // filters archived tents. Fails open while entitlements load.
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

  function resetForm() {
    setForm(EMPTY_TENT_FORM);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Nested inside CreatePlantDialog the tent form lives in a portal, but
    // React still bubbles submit up the component tree. Stop that so the
    // parent plant form does not also submit.
    e.stopPropagation();
    if (!tentGate.allowed) {
      toast.error(tentGate.blockedCopy);
      return;
    }
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (hardStop.blockSubmit || !canWriteCreateGrowId(targetGrowId)) {
      if (hardStop.toastMessage) toast.error(hardStop.toastMessage);
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      user_id: user.id,
      name: form.name.trim(),
      size: form.size.trim() || null,
      brand: form.brand.trim() || null,
      stage: form.stage,
      // Fail closed: always write grow_id when submitting.
      grow_id: targetGrowId,
    };
    const { data, error } = await supabase
      .from("tents")
      .insert(payload as never)
      .select("id, name")
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
    resetForm();
    setOpen(false);
    if (data && onCreated) onCreated(data as { id: string; name: string });
    setForm({ name: "", size: "", brand: "", stage: "seedling" });
    handleOpenChange(false);
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
        {hardStop.showStartRoomHardStop && (
          <div
            className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-3 space-y-2"
            data-testid="create-tent-hard-stop"
            role="alert"
          >
            <p className="text-sm font-semibold" data-testid="create-tent-hard-stop-title">
              {hardStop.hardStopTitle}
            </p>
            <p className="text-xs text-muted-foreground">{hardStop.hardStopBody}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="gradient-leaf text-primary-foreground">
                <Link to={hardStop.startRoomHref} data-testid="create-tent-start-room-cta">
                  {hardStop.hardStopCta}
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="create-tent-hard-stop-dismiss"
              >
                {hardStop.hardStopSecondary}
              </Button>
            </div>
          </div>
        )}
        {hardStop.showPickGrowHint && !hardStop.showStartRoomHardStop && (
          <p
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            data-testid="create-tent-pick-setup"
          >
            {GROW_SETUP_MESSAGES.pickSetupToast("tent")}{" "}
            <Link
              to={hardStop.startRoomHref}
              className="underline underline-offset-2"
              data-testid="create-tent-pick-setup-cta"
            >
              {hardStop.hardStopCta}
            </Link>
          </p>
        )}
        {canWriteCreateGrowId(targetGrowId) && (
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
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground py-4"
            data-testid="create-binding-loading"
          >
            Checking your current setup…
          </p>
        )}
        {binding.kind === "read_error" && (
          <div className="grid gap-3 py-2" data-testid="create-binding-read-error">
            <p className="text-sm font-medium">{growSetupMessages.readError.title}</p>
            <p className="text-sm text-muted-foreground">{growSetupMessages.readError.body}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => refresh?.()}
              data-testid="create-binding-retry"
            >
              {growSetupMessages.readError.cta}
            </Button>
          </div>
        )}
        {binding.kind === "no_setup" && (
          <div className="grid gap-3 py-2" data-testid="create-binding-no-setup">
            <p className="text-sm font-medium">{growSetupMessages.noSetup.title}</p>
            <p className="text-sm text-muted-foreground">{growSetupMessages.noSetup.body}</p>
            <Button asChild className="gradient-leaf text-primary-foreground">
              <Link to={binding.startHref} data-testid="create-binding-start-room">
                {growSetupMessages.noSetup.ctaPrimary}
              </Link>
            </Button>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {growSetupMessages.noSetup.ctaSecondary}
            </Button>
          </div>
        )}
        {(binding.kind === "requested_setup_unavailable" || binding.kind === "choose_setup") && (
          <div className="grid gap-3 py-2" data-testid="create-binding-choose-setup">
            <p className="text-sm font-medium">{growSetupMessages.setupUnavailable.title}</p>
            <p className="text-sm text-muted-foreground">
              {growSetupMessages.setupUnavailable.body}
            </p>
            <Button asChild variant="outline">
              <Link to={binding.chooseHref}>{growSetupMessages.setupUnavailable.cta}</Link>
            </Button>
          </div>
        )}
        {binding.kind === "ready" && (
          <>
            <p className="text-xs text-muted-foreground -mt-1">
              Start simple. You can add size, brand, and stage later. Verdant works best once your first
              plant memory exists.
            </p>
            <p
              className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
              data-testid="create-binding-context"
            >
              <span className="font-medium">{growSetupMessages.create.addingTo(binding.setupName)}</span>{" "}
              <span className="text-muted-foreground">{growSetupMessages.create.addingToHint}</span>
            </p>
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
            <form onSubmit={submit} className="grid gap-3">
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
            </div>
          </details>
          <Button
            disabled={busy || !tentGate.allowed || hardStop.blockSubmit}
            className="gradient-leaf text-primary-foreground"
            data-testid="tent-create-submit"
          >
            Create tent
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
