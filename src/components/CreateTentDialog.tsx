import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import { useTents } from "@/hooks/use-tents";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { evaluateTentCreationGate, FREE_TIER_UPGRADE_PATH } from "@/lib/entitlements/freeTierGates";
import { growSetupMessages } from "@/constants/growSetupMessages";
import {
  buildGrowBoundTentInsertPayload,
  resolveCreateGrowBinding,
} from "@/lib/createGrowBindingRules";

interface Props {
  trigger?: React.ReactNode;
  defaultGrowId?: string;
  onCreated?: (tent: { id: string; name: string }) => void;
  /** Opens the existing dialog on guided activation routes only. */
  initiallyOpen?: boolean;
  /**
   * Inline presentation for nesting inside CreatePlantDialog.
   * Avoids a second Radix dialog that would dismiss the parent form.
   */
  presentation?: "dialog" | "inline";
  /** Controlled open state for inline presentation. */
  inlineOpen?: boolean;
  onInlineOpenChange?: (open: boolean) => void;
}

const EMPTY_FORM = { name: "", size: "", brand: "", stage: "seedling" };

export default function CreateTentDialog({
  trigger,
  defaultGrowId,
  onCreated,
  initiallyOpen = false,
  presentation = "dialog",
  inlineOpen,
  onInlineOpenChange,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const {
    grows,
    activeGrowId,
    loading: growsLoading,
    error: growsError,
    refresh,
  } = useGrows();
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const isInline = presentation === "inline";
  const effectiveOpen = isInline ? Boolean(inlineOpen) : open;

  const binding = resolveCreateGrowBinding({
    grows,
    growsLoading,
    growsError,
    requestedGrowId: defaultGrowId,
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

  function resetDialogState() {
    setForm(EMPTY_FORM);
    setBusy(false);
  }

  function setEffectiveOpen(next: boolean) {
    if (isInline) onInlineOpenChange?.(next);
    else setOpen(next);
    if (!next) resetDialogState();
    else resetDialogState();
  }

  async function submit(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (binding.kind !== "ready") return;
    if (!form.name.trim()) {
      toast.error("Tent name is required");
      return;
    }
    if (!tentGate.allowed) {
      toast.error(tentGate.blockedCopy);
      return;
    }
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (busy) return;
    setBusy(true);
    const payload = buildGrowBoundTentInsertPayload({
      binding,
      userId: user.id,
      name: form.name,
      size: form.size,
      brand: form.brand,
      stage: form.stage,
    });
    if (!payload) {
      setBusy(false);
      toast.error("Choose a current setup before creating a tent.");
      return;
    }
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
    const created = data as { id: string; name: string } | null;
    resetDialogState();
    setEffectiveOpen(false);
    if (created && onCreated) onCreated(created);
  }

  function renderBody() {
    switch (binding.kind) {
      case "loading":
        return (
          <p className="text-sm text-muted-foreground" data-testid="create-tent-binding-loading">
            {growSetupMessages.loading.body}
          </p>
        );
      case "read_error":
        return (
          <div className="grid gap-3" data-testid="create-tent-binding-read-error">
            <div>
              <p className="font-medium text-sm">{growSetupMessages.readError.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{growSetupMessages.readError.body}</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => void refresh()}>
              {growSetupMessages.readError.cta}
            </Button>
          </div>
        );
      case "no_setup":
        return (
          <div className="grid gap-3" data-testid="create-tent-no-setup">
            <div>
              <p className="font-medium text-sm">{growSetupMessages.noSetup.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{growSetupMessages.noSetup.body}</p>
            </div>
            <Button asChild className="gradient-leaf text-primary-foreground">
              <Link to={binding.startHref} data-testid="create-tent-start-room">
                {growSetupMessages.noSetup.ctaPrimary}
              </Link>
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEffectiveOpen(false)}>
              {growSetupMessages.noSetup.ctaSecondary}
            </Button>
          </div>
        );
      case "requested_setup_unavailable":
      case "choose_setup":
        return (
          <div className="grid gap-3" data-testid="create-tent-choose-setup">
            <div>
              <p className="font-medium text-sm">{growSetupMessages.setupUnavailable.title}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {growSetupMessages.setupUnavailable.body}
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link to={binding.chooseHref}>{growSetupMessages.setupUnavailable.cta}</Link>
            </Button>
          </div>
        );
      case "ready":
        return (
          <>
            <div data-testid="create-tent-setup-context">
              <p className="text-sm font-medium">
                {growSetupMessages.create.addingTo(binding.setupName)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {growSetupMessages.create.addingToHint}
              </p>
            </div>
            {!isInline && (
              <p className="text-xs text-muted-foreground">
                Start simple. You can add size, brand, and stage later. Verdant works best once your
                first plant memory exists.
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
            <div
              className="grid gap-3"
              data-testid="create-tent-form"
              role={isInline ? "group" : undefined}
            >
              <div>
                <Label>Name</Label>
                <Input
                  required={!isInline}
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
              <div className="flex gap-2">
                {isInline && (
                  <Button type="button" variant="ghost" onClick={() => setEffectiveOpen(false)}>
                    Cancel
                  </Button>
                )}
                {isInline ? (
                  <Button
                    type="button"
                    disabled={busy || !tentGate.allowed}
                    className="gradient-leaf text-primary-foreground flex-1"
                    data-testid="tent-create-submit"
                    onClick={() => void submit()}
                  >
                    Create tent
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={busy || !tentGate.allowed}
                    className="gradient-leaf text-primary-foreground flex-1"
                    data-testid="tent-create-submit"
                  >
                    Create tent
                  </Button>
                )}
              </div>
            </div>
          </>
        );
      default: {
        const _exhaustive: never = binding;
        return _exhaustive;
      }
    }
  }

  // Dialog presentation wraps the ready fields in a native form; inline
  // nesting must not, because it would sit inside CreatePlantDialog's form.
  function renderReadyOrGate() {
    const body = renderBody();
    if (isInline || binding.kind !== "ready") return body;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e);
        }}
        className="contents"
      >
        {body}
      </form>
    );
  }

  const defaultTrigger = (
    <Button size="sm" className="gradient-leaf text-primary-foreground gap-1">
      <Plus className="h-4 w-4" /> New tent
    </Button>
  );

  if (isInline) {
    if (!effectiveOpen) {
      return (
        <span
          onClick={() => setEffectiveOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setEffectiveOpen(true);
          }}
          role="button"
          tabIndex={0}
        >
          {trigger ?? defaultTrigger}
        </span>
      );
    }
    return (
      <div
        className="rounded-md border border-border/50 p-3 grid gap-3"
        data-testid="create-tent-inline"
      >
        <p className="text-sm font-medium font-display">New tent</p>
        {renderBody()}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setEffectiveOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">New tent</DialogTitle>
        </DialogHeader>
        {renderReadyOrGate()}
      </DialogContent>
    </Dialog>
  );
}
