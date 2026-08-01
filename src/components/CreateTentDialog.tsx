import { useState } from "react";
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
import { buildTentInsertPayload, resolveCreateGrowBinding } from "@/lib/createGrowBindingRules";
import { growSetupMessages } from "@/constants/growSetupMessages";

interface Props {
  trigger?: React.ReactNode;
  defaultGrowId?: string;
  onCreated?: (tent: { id: string; name: string }) => void;
  /** Opens the existing dialog on guided activation routes only. */
  initiallyOpen?: boolean;
  /** Notify a parent (e.g. nested-inside CreatePlantDialog) when open changes. */
  onOpenChange?: (open: boolean) => void;
}

const INITIAL_FORM = { name: "", size: "", brand: "", stage: "seedling" };

export default function CreateTentDialog({
  trigger,
  defaultGrowId,
  onCreated,
  initiallyOpen = false,
  onOpenChange,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { grows, activeGrowId, loading: growsLoading, error: growsError, refresh } = useGrows();
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", size: "", brand: "", stage: "seedling" });

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

  // Cancel/close/reopen must derive a fresh safe initial state.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) setForm({ ...INITIAL_FORM });
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
    // Only a ready binding can produce an insert payload; every canonical
    // tent insert carries the verified resolved grow id.
    const built = buildTentInsertPayload(binding, user.id, {
      name: form.name,
      size: form.size.trim() || null,
      brand: form.brand.trim() || null,
      stage: form.stage,
    });
    if (!built.ok) {
      toast.error(growSetupMessages.setupUnavailable.body);
      return;
    }
    setBusy(true);
    const payload = built.payload;
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
    // Notify the parent before closing so nested CreatePlantDialog can
    // preserve its form fields while the tent dialog is still considered open.
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
        {binding.kind === "loading" && (
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
                type="submit"
                disabled={busy || !tentGate.allowed}
                className="gradient-leaf text-primary-foreground"
                data-testid="tent-create-submit"
              >
                Create tent
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
