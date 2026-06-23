/**
 * OneTentLiveProof — guided demo path for Verdant's One-Tent Loop.
 *
 * Read-only navigation/demo page. Does NOT write to Supabase, does NOT
 * call edge functions, does NOT create alerts or Action Queue items,
 * does NOT touch device control or AI.
 *
 * Status derivation is delegated to `buildOneTentLiveProofViewModel`.
 * Steps that cannot be safely inferred render as
 * "Needs operator confirmation".
 */
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { ClipboardCheck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import OneTentLiveProofChecklist from "@/components/OneTentLiveProofChecklist";
import { useGrows } from "@/store/grows";
import { useGrowTents } from "@/hooks/useGrowData";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { useAlertsList } from "@/hooks/useAlertsList";
import { useAlertsLinkedActionCounts } from "@/hooks/useAlertsLinkedActionCounts";
import { buildOneTentLiveProofViewModel } from "@/lib/oneTentLiveProofViewModel";

export default function OneTentLiveProof() {
  const { grows, activeGrowId } = useGrows();
  const [growId, setGrowId] = useState<string | "">(activeGrowId ?? "");
  const effectiveGrowId = growId || activeGrowId || grows[0]?.id || "";
  const { data: tents = [] } = useGrowTents(effectiveGrowId || undefined);
  const [tentId, setTentId] = useState<string | "">("");
  const effectiveTentId = tentId || (tents.length === 1 ? tents[0]?.id ?? "" : "");

  const selectedGrow = grows.find((g) => g.id === effectiveGrowId) ?? null;
  const selectedTent = tents.find((t) => t.id === effectiveTentId) ?? null;

  const tentIds = effectiveTentId
    ? [effectiveTentId]
    : tents.map((t) => t.id);
  const snapshot = useLatestSensorSnapshot(effectiveGrowId, tentIds);
  const { alerts } = useAlertsList({
    growId: effectiveGrowId || null,
    status: "open",
    severity: "all",
  });
  const alertIds = useMemo(() => alerts.map((a) => a.id), [alerts]);
  const linkedCounts = useAlertsLinkedActionCounts(alertIds);
  const linkedActionExists = useMemo(() => {
    for (const id of alertIds) {
      const summary = linkedCounts.get(id);
      if (summary && summary.count > 0) return true;
    }
    return false;
  }, [alertIds, linkedCounts]);

  const vm = useMemo(
    () =>
      buildOneTentLiveProofViewModel(
        {
          grow: selectedGrow
            ? { id: selectedGrow.id, name: selectedGrow.name ?? null }
            : null,
          tent: selectedTent
            ? { id: selectedTent.id, name: selectedTent.name ?? null }
            : null,
        },
        {
          snapshot: snapshot.status === "ok" ? snapshot.snapshot : null,
          snapshotStatus: snapshot.status,
          hasMatchingOpenAlert: alerts.length > 0,
          linkedActionExists,
          // The lightweight hook only counts open actions; we cannot
          // safely infer "completed" without an extra query, so we leave
          // it for operator confirmation.
          linkedActionCompleted: null,
          timelineFollowupConfirmed: null,
        },
      ),
    [
      selectedGrow,
      selectedTent,
      snapshot.status,
      snapshot.snapshot,
      alerts.length,
      linkedActionExists,
    ],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="One-Tent Live Proof"
        description="Manual Snapshot → Alert → Action Queue → Completed Follow-up → Timeline"
        icon={<ClipboardCheck className="h-5 w-5" />}
      />
      <p
        className="text-xs text-muted-foreground"
        data-testid="one-tent-live-proof-description"
      >
        Use this guided path to prove Verdant's core operating loop with a
        real/manual tent reading. Verdant does not fake live data, auto-create
        actions, or control equipment.
      </p>

      <ul
        className="flex flex-wrap gap-1.5"
        data-testid="one-tent-live-proof-safety-badges"
        aria-label="Proof safety badges"
      >
        {vm.safetyBadges.map((b) => (
          <li key={b.id}>
            <Badge variant="outline" className="text-[10px]">
              {b.label}
            </Badge>
          </li>
        ))}
      </ul>

      <section
        className="glass rounded-2xl p-3 space-y-2"
        aria-label="Proof context selector"
      >
        <p className="text-xs font-medium">Context</p>
        {grows.length === 0 ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="one-tent-live-proof-empty"
          >
            Create or select a grow/tent/plant to run the proof.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Select
              value={effectiveGrowId}
              onValueChange={(v) => {
                setGrowId(v);
                setTentId("");
              }}
            >
              <SelectTrigger
                className="w-[220px]"
                aria-label="Select grow"
                data-testid="one-tent-live-proof-grow-select"
              >
                <SelectValue placeholder="Select grow" />
              </SelectTrigger>
              <SelectContent>
                {grows.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name ?? "Untitled grow"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={effectiveTentId}
              onValueChange={(v) => setTentId(v)}
              disabled={tents.length === 0}
            >
              <SelectTrigger
                className="w-[220px]"
                aria-label="Select tent"
                data-testid="one-tent-live-proof-tent-select"
              >
                <SelectValue placeholder="Select tent" />
              </SelectTrigger>
              <SelectContent>
                {tents.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name ?? "Untitled tent"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {vm.selectionSummary ? (
          <p
            className="text-[11px] text-muted-foreground"
            data-testid="one-tent-live-proof-selection-summary"
          >
            {vm.selectionSummary}
          </p>
        ) : null}
      </section>

      <OneTentLiveProofChecklist vm={vm} />

      <p
        className="text-[11px] text-muted-foreground"
        data-testid="one-tent-live-proof-honesty-note"
      >
        Verdant will not mark steps complete unless real app state supports
        them. Steps that cannot be safely inferred show "Needs operator
        confirmation".
      </p>
    </div>
  );
}
