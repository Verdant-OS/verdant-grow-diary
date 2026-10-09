import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "@/lib/react-router-compat";
import { useGrows } from "@/store/grows";
import { useAuth } from "@/store/auth";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Sprout, Check, Trash2, Loader2, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { GROW_TYPES, STAGES, growTypeLabel, stageLabel } from "@/lib/grow";
import { format } from "date-fns";
import { toast } from "sonner";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { evaluateGrowCreationGate, FREE_TIER_UPGRADE_PATH } from "@/lib/entitlements/freeTierGates";
import { growRestoreFailureCopy, planGrowRestore } from "@/lib/archivedGrowQuickLogRules";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import {
  buildConnectedActivationRoutes,
  isOneTentActivationIntent,
} from "@/lib/connectedOneTentActivationRules";
import {
  newHierarchyCreateAttemptId,
  persistHierarchyCreateAttempt,
} from "@/lib/hierarchyCreatePersistence";
import { useHierarchyCreateOutcomeRecovery } from "@/hooks/useHierarchyCreateOutcomeRecovery";

export default function Grows() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activationIntent = isOneTentActivationIntent(searchParams.get("intent"));
  const { user } = useAuth();
  const { grows, archivedGrows, activeGrowId, setActiveGrowId, refresh, loading, error } =
    useGrows();
  const archivedGrowList = archivedGrows ?? [];
  const [open, setOpen] = useState(activationIntent);
  const [form, setForm] = useState({ name: "", grow_type: "tent", stage: "seedling", notes: "" });
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const createInFlightRef = useRef(false);
  const { createOutcomeUnknown, recordUnknownCreateOutcome } = useHierarchyCreateOutcomeRecovery({
    ownerId: user?.id,
  });

  function handleOpenChange(next: boolean) {
    if (next && createOutcomeUnknown) return;
    setOpen(next);
  }

  // Free-tier grow gate. The grows store already returns only non-archived
  // rows, so its length IS the active-grow count. Fails open while the
  // entitlement resolver is loading — the gate is UX honesty, and a paying
  // grower must never be blocked by a resolver hiccup.
  const {
    loading: entLoading,
    lookupFailed: entitlementLookupFailed,
    entitlement,
  } = useMyEntitlements();
  const growGate = evaluateGrowCreationGate(
    entLoading || entitlementLookupFailed ? null : entitlement.capabilities,
    grows.length,
  );

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user || busy || createInFlightRef.current) return;
    if (createOutcomeUnknown) {
      toast.error("Refresh this page before trying to create another grow.");
      return;
    }
    if (!growGate.allowed) {
      toast.error(growGate.blockedCopy);
      return;
    }
    let growId: string;
    try {
      growId = newHierarchyCreateAttemptId();
    } catch {
      toast.error("Verdant could not start a safe grow save. Refresh and try again.");
      return;
    }

    const attempt = { entity: "grow" as const, rowId: growId, ownerId: user.id };
    const payload = {
      id: growId,
      user_id: user.id,
      name: form.name.trim(),
      grow_type: form.grow_type,
      stage: form.stage,
      notes: form.notes.trim() || null,
    };
    createInFlightRef.current = true;
    setBusy(true);
    try {
      const result = await persistHierarchyCreateAttempt(supabase, attempt, payload);
      if (result.status === "unknown") {
        recordUnknownCreateOutcome(attempt);
        toast.error(
          "Verdant could not confirm whether this grow was saved. Refresh before adding another.",
        );
        return;
      }
      if (result.status === "definitive_error") {
        toast.error(result.message);
        return;
      }

      trackFunnelEvent("grow_created");
      toast.success("Grow created");
      setActiveGrowId(result.confirmed.row.id);
      setOpen(false);
      setForm({ name: "", grow_type: "tent", stage: "seedling", notes: "" });
      if (activationIntent) {
        navigate(
          buildConnectedActivationRoutes({
            growId: result.confirmed.row.id,
            tentId: null,
            plantId: null,
          }).addTent,
        );
      }
      try {
        await refresh();
      } catch {
        // The insert is confirmed and the dialog is terminal. A stale list is
        // recoverable after refresh; leaving this populated dialog open would
        // invite a second logical create for the same grow.
        toast.error("Grow created, but the list could not refresh. Refresh this page to see it.");
      }
    } finally {
      createInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function archive(id: string) {
    if (!confirm("Archive this grow? Entries stay saved.")) return;
    const { error: archiveError } = await supabase
      .from("grows")
      .update({ is_archived: true })
      .eq("id", id);
    if (archiveError) {
      toast.error("Unable to archive this grow. Please try again.");
      return;
    }
    await refresh();
    toast.success("Archived");
  }

  async function restore(id: string) {
    const plan = planGrowRestore({
      allowed: growGate.allowed,
      blockedCopy: growGate.blockedCopy,
    });
    if (!plan.proceed) {
      setRestoreError(plan.errorCopy);
      if (plan.errorCopy) toast.error(plan.errorCopy);
      return;
    }
    setRestoringId(id);
    setRestoreError(null);
    const { error: restoreWriteError } = await supabase
      .from("grows")
      .update({ is_archived: false })
      .eq("id", id);
    setRestoringId(null);
    if (restoreWriteError) {
      const copy = growRestoreFailureCopy(restoreWriteError);
      setRestoreError(copy);
      toast.error(copy);
      return;
    }
    await refresh();
    toast.success("Grow restored");
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="My Grows"
        eyebrow="Cultivation"
        description="Follow each grow from seed or clone through harvest without losing the why."
        icon={<Sprout className="size-5" />}
        actions={
          <Button
            onClick={() => handleOpenChange(true)}
            size="sm"
            className="w-full gradient-leaf text-primary-foreground sm:w-auto"
            disabled={!growGate.allowed || createOutcomeUnknown}
            data-testid="grows-new-button"
          >
            <Plus data-icon="inline-start" />
            New grow
          </Button>
        }
      />

      {!growGate.allowed && (
        <p
          className="mb-4 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="grow-create-gate-notice"
        >
          {growGate.blockedCopy}{" "}
          <Link to={FREE_TIER_UPGRADE_PATH} className="underline underline-offset-2">
            See plans
          </Link>
        </p>
      )}

      {loading ? (
        <div className="py-16 text-center text-muted-foreground" data-testid="grows-loading">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-6 text-center" role="alert" data-testid="grows-error">
          <AlertCircle className="h-5 w-5 text-destructive mx-auto mb-2" />
          <p className="font-semibold">Unable to load grows.</p>
          <p className="text-xs text-muted-foreground mt-1">Please try again later.</p>
        </div>
      ) : grows.length === 0 ? (
        <div className="py-16 text-center" data-testid="grows-empty">
          <div className="mx-auto h-16 w-16 rounded-2xl glass flex items-center justify-center mb-4">
            <Sprout className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-display text-lg font-semibold">No grows yet.</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create your first grow to start logging.
          </p>
          <Button
            onClick={() => handleOpenChange(true)}
            className="gradient-leaf text-primary-foreground"
            disabled={createOutcomeUnknown}
          >
            Create grow
          </Button>
        </div>
      ) : (
        <ul
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="grows-list"
        >
          {grows.map((g) => (
            <li
              key={g.id}
              className={`group overflow-hidden rounded-3xl border bg-card/65 shadow-card backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevated ${g.id === activeGrowId ? "border-primary/60" : "border-border/60"}`}
            >
              <Link
                to={`/grows/${g.id}`}
                className="block p-5 transition-colors hover:bg-secondary/20"
                data-testid="grow-card-link"
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold">{g.name}</span>
                  {g.id === activeGrowId && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                      active
                    </span>
                  )}
                  {g.is_archived && (
                    <Badge variant="outline" className="text-[10px]">
                      archived
                    </Badge>
                  )}
                  <Badge variant="outline" className="uppercase text-[10px]">
                    {stageLabel(g.stage)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {growTypeLabel(g.grow_type)}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Started {format(new Date(g.started_at), "MMM d, yyyy")}
                  {g.updated_at && <> · Updated {format(new Date(g.updated_at), "MMM d, yyyy")}</>}
                </div>
                {g.notes && (
                  <p className="text-xs mt-2 text-muted-foreground line-clamp-2">{g.notes}</p>
                )}
              </Link>
              <div className="flex items-center justify-between px-4 pb-3 -mt-1">
                {g.id === activeGrowId ? (
                  <span className="inline-flex items-center text-[11px] text-primary gap-1">
                    <Check className="h-3 w-3" /> active grow
                  </span>
                ) : (
                  <button
                    onClick={() => setActiveGrowId(g.id)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Set active
                  </button>
                )}
                {g.id !== activeGrowId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => archive(g.id)}
                    aria-label="Archive grow"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && archivedGrowList.length > 0 && (
        <section className="mt-8" data-testid="archived-grows">
          <h2 className="font-display text-lg font-semibold mb-3">Archived grows</h2>
          {restoreError && (
            <p
              role="alert"
              data-testid="grow-restore-error"
              className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {restoreError}
            </p>
          )}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archivedGrowList.map((g) => (
              <li
                key={g.id}
                className="rounded-3xl border border-border/60 bg-card/65 p-5 shadow-card"
                data-testid="archived-grow-row"
              >
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="font-semibold">{g.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    archived
                  </Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="restore-grow"
                  disabled={restoringId === g.id}
                  onClick={() => restore(g.id)}
                >
                  Restore grow
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">New grow</DialogTitle>
          </DialogHeader>
          {createOutcomeUnknown && (
            <p
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
              data-testid="grow-create-outcome-unknown"
            >
              Verdant could not confirm whether that grow was saved. Refresh this page before
              creating another so you do not make a duplicate.
            </p>
          )}
          <form onSubmit={create} className="grid gap-3">
            <div>
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tent #1, Backyard, Mothers…"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Type</Label>
                <Select
                  value={form.grow_type}
                  onValueChange={(v) => setForm({ ...form, grow_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROW_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stage</Label>
                <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Strain, lighting, medium…"
                rows={2}
              />
            </div>
            <Button
              disabled={busy || createOutcomeUnknown}
              className="gradient-leaf text-primary-foreground"
            >
              Create grow
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
