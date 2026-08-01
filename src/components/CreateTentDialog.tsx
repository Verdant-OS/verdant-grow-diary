import { useEffect, useMemo, useState } from "react";
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
  buildTentInsertPayload,
  resolveCreateGrowBinding,
  type CreateGrowOption,
} from "@/lib/createGrowBindingRules";
import {
  growSetupMessages,
} from "@/constants/growSetupMessages";

const EMPTY_GROWS: CreateGrowOption[] = [];

interface Props {
  trigger?: React.ReactNode;
  defaultGrowId?: string;
  onCreated?: (tent: { id: string; name: string }) => void;
  /** Opens the existing dialog on guided activation routes only. */
  initiallyOpen?: boolean;
}

const EMPTY_FORM = { name: "", size: "", brand: "", stage: "seedling" };

export default function CreateTentDialog({
  trigger,
  defaultGrowId,
  onCreated,
  initiallyOpen = false,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const {
    grows: loadedGrows,
    activeGrowId,
    loading: growsLoading,
    error: growsError,
    refresh: refreshGrows,
  } = useGrows();
  const grows = loadedGrows ?? EMPTY_GROWS;
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const growBinding = useMemo(
    () =>
      resolveCreateGrowBinding({
        grows,
        growsLoading,
        growsError,
        requestedGrowId: defaultGrowId,
        activeGrowId,
      }),
    [grows, growsLoading, growsError, defaultGrowId, activeGrowId],
  );

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

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setBusy(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (growBinding.kind !== "ready") return;
    if (!tentGate.allowed) {
      toast.error(tentGate.blockedCopy);
      return;
    }
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    const payload = buildTentInsertPayload(growBinding, {
      user_id: user.id,
      name: form.name.trim(),
      size: form.size.trim() || null,
      brand: form.brand.trim() || null,
      stage: form.stage,
    });
    if (!payload) return;

    setBusy(true);
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
    setForm(EMPTY_FORM);
    setOpen(false);
    if (data && onCreated) onCreated(data as { id: string; name: string });
  }

  function renderBody() {
    if (growBinding.kind === "loading") {
      return (
        <p className="text-sm text-muted-foreground" data-testid="create-tent-loading">
          Loading your current setup…
        </p>
      );
    }

    if (growBinding.kind === "read_error") {
      return (
        <div className="grid gap-3" data-testid="create-tent-read-error">
          <p className="text-sm font-medium">{growSetupMessages.readError.title}</p>
          <p className="text-xs text-muted-foreground">{growSetupMessages.readError.body}</p>
          <Button type="button" variant="outline" onClick={() => void refreshGrows()}>
            {growSetupMessages.readError.cta}
          </Button>
        </div>
      );
    }

    if (growBinding.kind === "no_setup") {
      return (
        <div className="grid gap-3" data-testid="create-tent-no-setup">
          <p className="text-sm font-medium">{growSetupMessages.noSetup.title}</p>
          <p className="text-xs text-muted-foreground">{growSetupMessages.noSetup.body}</p>
          <div className="flex gap-2">
            <Button asChild className="gradient-leaf text-primary-foreground">
              <Link to={growBinding.startHref}>{growSetupMessages.noSetup.ctaPrimary}</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {growSetupMessages.noSetup.ctaSecondary}
            </Button>
          </div>
        </div>
      );
    }

    if (
      growBinding.kind === "requested_setup_unavailable" ||
      growBinding.kind === "choose_setup"
    ) {
      return (
        <div className="grid gap-3" data-testid="create-tent-setup-unavailable">
          <p className="text-sm font-medium">{growSetupMessages.setupUnavailable.title}</p>
          <p className="text-xs text-muted-foreground">{growSetupMessages.setupUnavailable.body}</p>
          <Button asChild variant="outline">
            <Link to={growBinding.chooseHref}>{growSetupMessages.setupUnavailable.cta}</Link>
          </Button>
        </div>
      );
    }

    return (
      <>
        <div
          className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
          data-testid="create-tent-setup-context"
        >
          <p className="font-medium">{growSetupMessages.create.addingTo(growBinding.setupName)}</p>
          <p className="text-muted-foreground">{growSetupMessages.create.addingToHint}</p>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Start simple. You can add size, brand, and stage later. Verdant works best once your first
          plant memory exists.
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
            disabled={busy || !tentGate.allowed}
            className="gradient-leaf text-primary-foreground"
            data-testid="tent-create-submit"
          >
            Create tent
          </Button>
        </form>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        {renderBody()}
      </DialogContent>
    </Dialog>
  );
}
