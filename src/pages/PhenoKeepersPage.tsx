/**
 * PhenoKeepersPage — /pheno-hunts/:id/keepers
 *
 * Keepers, clone lineage, and the breeding endgame (two-parent crosses) for a
 * grower's own hunt. RLS-scoped writes of the grower's OWN records. Data/record-
 * only: naming a keeper, adding a clone, or recording a cross starts no grow and
 * drives no device. No AI, no Action Queue, no automation.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@/lib/react-router-compat";
import { usePhenoKeepers } from "@/hooks/usePhenoKeepers";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canWriteFeatureData } from "@/lib/featureEntitlements";
import { phenoCandidateDisplayLabel } from "@/lib/phenoCandidateIdentity";
import {
  buildPhenoKeeperLineage,
  type PhenoKeeperLineageView,
} from "@/lib/phenoKeeperLineageViewModel";
import type { CloneRow } from "@/lib/phenoKeepersService";
import type { StabilityRun } from "@/lib/phenoStabilityRunRules";
import {
  buildCrossFormViewModel,
  crossLineageBadge,
  crossDonorLabel,
  REVERSAL_METHOD_OPTIONS,
  SELF_DONOR_VALUE,
} from "@/lib/phenoCrossFormViewModel";
import { buildPhenoHuntActivityEntries } from "@/lib/phenoHuntActivityViewModel";
import PhenoTimelineEntries from "@/components/PhenoTimelineEntries";
import PhenoStabilityLedger from "@/components/PhenoStabilityLedger";
import PhenoGrowOutHandoff from "@/components/PhenoGrowOutHandoff";
import { buildGrowOutSuggestions, type GrowOutPlantInput } from "@/lib/phenoGrowOutHandoffRules";
import { buildCloneTreeRows } from "@/lib/phenoCloneTreeViewModel";
import { phenoHuntShowcasePath, phenoHuntWorkspacePath } from "@/lib/routes";

/** Depth → indent class (capped) so the clone lineage nests without inline styles. */
const CLONE_INDENT = ["pl-0", "pl-3", "pl-6", "pl-9", "pl-12"] as const;

// Stable empty clone list so memoized KeeperCards without clones keep identical
// props across parent re-renders (a fresh [] per render would defeat memo).
const EMPTY_CLONES: readonly CloneRow[] = [];
// Same stable-identity guard for a keeper with no recorded stability runs.
const EMPTY_STABILITY_RUNS: readonly StabilityRun[] = [];

interface KeeperCardProps {
  view: PhenoKeeperLineageView;
  clones: readonly CloneRow[];
  stabilityRuns: readonly StabilityRun[];
  growOutPlantsById: Readonly<Record<string, GrowOutPlantInput>>;
  reversed: boolean;
  saving: boolean;
  onAddClone: (keeperId: string, label: string) => Promise<boolean>;
  onMarkReversed: (keeperId: string, method: string) => Promise<boolean>;
  onSaveStabilityRuns: (keeperId: string, runs: readonly StabilityRun[]) => Promise<boolean>;
}

// Memoized with row-LOCAL input state: at commercial scale a hunt can have
// many keepers, and previously the clone-label / reversal-method inputs lived
// in page-level Record<id,value> maps — every keystroke re-rendered the whole
// keeper list AND rebuilt every keeper's clone tree. Holding the inputs here
// scopes each keystroke to its own card, and memo keeps a save on one card
// from re-rendering the rest.
const KeeperCard = memo(function KeeperCard({
  view,
  clones,
  stabilityRuns,
  growOutPlantsById,
  reversed,
  saving,
  onAddClone,
  onMarkReversed,
  onSaveStabilityRuns,
}: KeeperCardProps) {
  const [cloneLabel, setCloneLabel] = useState("");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [reversalMethod, setReversalMethod] = useState("sts");
  // Marking a reversal is one-way (append-only) and flips the S1/feminized
  // classification of every future cross — a mis-tap must not do it silently,
  // so the button arms first and executes on the explicit confirm.
  const [reversalArmed, setReversalArmed] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);
  const cloneRows = useMemo(() => buildCloneTreeRows([...clones]), [clones]);
  const saveStabilityRuns = useCallback(
    (runs: readonly StabilityRun[]) => onSaveStabilityRuns(view.keeperId, runs),
    [onSaveStabilityRuns, view.keeperId],
  );

  // Grow-outs Verdant can carry into the ledger: clones the grower linked to a
  // real plant, whose recorded traits aren't in the ledger yet. Suggest-only.
  const growOutSuggestions = useMemo(
    () =>
      buildGrowOutSuggestions({
        clones: clones.map((c) => ({
          cloneId: c.id,
          cloneLabel: c.cloneLabel,
          clonePlantId: c.clonePlantId ?? null,
        })),
        plantsById: growOutPlantsById,
        existingRuns: stabilityRuns,
      }),
    [clones, growOutPlantsById, stabilityRuns],
  );

  // Accepting a proposal APPENDS it to the existing ledger — the service
  // replaces the whole set, so the current runs must be carried along.
  const acceptGrowOut = useCallback(
    (run: StabilityRun) => onSaveStabilityRuns(view.keeperId, [...stabilityRuns, run]),
    [onSaveStabilityRuns, view.keeperId, stabilityRuns],
  );

  return (
    <li
      data-testid={`pheno-keeper-${view.keeperId}`}
      className="space-y-2 rounded-lg border border-border bg-card p-4"
    >
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          {view.keeperName}
          {reversed && (
            <span
              data-testid={`keeper-reversed-badge-${view.keeperId}`}
              className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
              title="Reversed — makes feminized pollen"
            >
              Reversed ♀→pollen
            </span>
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          From {view.origin.sourceCandidateLabel ?? "unknown candidate"} ·{" "}
          {view.origin.huntName ?? "this hunt"}
        </p>
      </div>
      <div className="text-xs">
        <span className="font-medium">Clones ({clones.length}):</span>
        {cloneRows.length === 0 ? (
          <span className="text-muted-foreground"> none yet</span>
        ) : (
          <ul data-testid={`keeper-clone-tree-${view.keeperId}`} className="mt-1 space-y-0.5">
            {cloneRows.map((r) => (
              <li
                key={r.id}
                data-testid={`keeper-clone-node-${r.id}`}
                data-depth={r.depth}
                className={CLONE_INDENT[Math.min(r.depth, CLONE_INDENT.length - 1)]}
              >
                {r.depth > 0 && <span className="text-muted-foreground">└ </span>}
                {r.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          data-testid={`keepers-clone-label-${view.keeperId}`}
          value={cloneLabel}
          onChange={(e) => {
            setCloneError(null);
            setCloneLabel(e.target.value);
          }}
          placeholder="Clone label (e.g. mother, cut #2)"
          aria-label={`New clone label for ${view.keeperName}`}
          className="rounded border border-border bg-background px-2 py-1 text-sm"
        />
        <button
          type="button"
          data-testid={`keepers-clone-add-${view.keeperId}`}
          disabled={saving || !cloneLabel.trim()}
          onClick={async () => {
            setCloneError(null);
            if (await onAddClone(view.keeperId, cloneLabel)) setCloneLabel("");
            else setCloneError("Could not record this clone — try again.");
          }}
          className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium disabled:opacity-50"
        >
          Add clone
        </button>
        {cloneError && (
          <span
            role="alert"
            data-testid={`keepers-clone-error-${view.keeperId}`}
            className="text-xs font-medium text-red-600 dark:text-red-400"
          >
            {cloneError}
          </span>
        )}
      </div>
      {reversed ? (
        <p
          data-testid={`keeper-reversed-note-${view.keeperId}`}
          className="text-[11px] text-muted-foreground"
        >
          Reversed — its pollen makes feminized (self / S1 or feminized-cross) seed.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid={`keeper-reverse-method-${view.keeperId}`}
            aria-label={`Reversal method for ${view.keeperName}`}
            value={reversalMethod}
            onChange={(e) => setReversalMethod(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs"
          >
            {REVERSAL_METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {!reversalArmed ? (
            <button
              type="button"
              data-testid={`keeper-reverse-${view.keeperId}`}
              disabled={saving}
              onClick={() => setReversalArmed(true)}
              className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium disabled:opacity-50"
            >
              Mark as reversed
            </button>
          ) : (
            <>
              <span className="text-[11px] text-muted-foreground">
                Permanent record — classifies future crosses from this keeper as feminized/S1.
              </span>
              <button
                type="button"
                data-testid={`keeper-reverse-confirm-${view.keeperId}`}
                disabled={saving}
                onClick={async () => {
                  setReversalError(null);
                  const ok = await onMarkReversed(view.keeperId, reversalMethod);
                  if (!ok) setReversalError("Could not record the reversal — try again.");
                  setReversalArmed(false);
                }}
                className="rounded border border-amber-500/60 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 disabled:opacity-50 dark:text-amber-300"
              >
                Confirm reversal
              </button>
              <button
                type="button"
                data-testid={`keeper-reverse-cancel-${view.keeperId}`}
                onClick={() => setReversalArmed(false)}
                className="rounded border border-border px-2 py-1 text-xs font-medium"
              >
                Cancel
              </button>
            </>
          )}
          {reversalError && (
            <span
              role="alert"
              data-testid={`keeper-reverse-error-${view.keeperId}`}
              className="text-xs font-medium text-red-600 dark:text-red-400"
            >
              {reversalError}
            </span>
          )}
        </div>
      )}
      <PhenoGrowOutHandoff
        keeperId={view.keeperId}
        suggestions={growOutSuggestions}
        onAccept={acceptGrowOut}
        saving={saving}
      />
      <PhenoStabilityLedger
        keeperId={view.keeperId}
        runs={stabilityRuns}
        onSave={saveStabilityRuns}
        saving={saving}
      />
    </li>
  );
});

export default function PhenoKeepersPage() {
  const { id } = useParams<{ id: string }>();
  const ks = usePhenoKeepers(id);
  // The allowReadOnly route path admits lapsed-Pro growers for viewing; the
  // banner + fieldset below fence every mutation control on this flag
  // (RESTRICTIVE RLS remains the server-side authority).
  const { entitlement } = useMyEntitlements();
  const canWrite = canWriteFeatureData(entitlement, "pheno_tracker");

  const [promotePlant, setPromotePlant] = useState("");
  const [promoteName, setPromoteName] = useState("");
  const [keeperFilter, setKeeperFilter] = useState("");
  const [female, setFemale] = useState("");
  const [donor, setDonor] = useState("");
  const [crossName, setCrossName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [crossError, setCrossError] = useState<string | null>(null);

  const reversedSet = useMemo(() => new Set(ks.reversedKeeperIds), [ks.reversedKeeperIds]);
  const keeperNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of ks.keepers) m[k.id] = k.keeperName;
    return m;
  }, [ks.keepers]);
  const stabilityRunsByKeeper = useMemo(() => {
    const m: Record<string, StabilityRun[]> = {};
    for (const k of ks.keepers)
      if (k.stabilityRuns && k.stabilityRuns.length > 0) m[k.id] = k.stabilityRuns;
    return m;
  }, [ks.keepers]);

  // Reset the cross form when navigating to a different hunt so stale parents
  // from the previous hunt can't linger in state (see buildCrossFormViewModel's
  // validKeeperIds guard, which is the belt-and-suspenders backstop).
  useEffect(() => {
    setFemale("");
    setDonor("");
    setCrossName("");
  }, [id]);

  const crossForm = useMemo(
    () =>
      buildCrossFormViewModel({
        femaleKeeperId: female,
        donorSelection: donor,
        reversedKeeperIds: ks.reversedKeeperIds,
        validKeeperIds: ks.keepers.map((k) => k.id),
      }),
    [female, donor, ks.reversedKeeperIds, ks.keepers],
  );

  const candidateLabelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of ks.candidates) m[c.candidateId] = phenoCandidateDisplayLabel(c);
    return m;
  }, [ks.candidates]);

  // Chronological pheno activity for this hunt: sex reveals, keeper decisions,
  // reversals, and crosses (selfing rendered "Self"; F1/Feminized/S1 badges;
  // each row labeled by candidate). Read-only.
  const timelineEntries = useMemo(
    () =>
      buildPhenoHuntActivityEntries({
        sexByPlant: ks.sexByPlant,
        decisionsByPlant: ks.decisionsByPlant,
        crosses: ks.crosses,
        reversals: ks.reversals,
        candidateLabelById,
        keeperNameById,
      }),
    [
      ks.sexByPlant,
      ks.decisionsByPlant,
      ks.crosses,
      ks.reversals,
      candidateLabelById,
      keeperNameById,
    ],
  );

  const lineage = useMemo(
    () =>
      buildPhenoKeeperLineage(
        ks.keepers.map((k) => ({
          keeperId: k.id,
          keeperName: k.keeperName,
          huntId: k.huntId,
          huntName: ks.hunt?.name ?? null,
          sourcePlantId: k.sourcePlantId,
          sourceCandidateLabel: candidateLabelById[k.sourcePlantId] ?? null,
          note: k.note,
          createdAt: k.createdAt,
        })),
      ),
    [ks.keepers, ks.hunt, candidateLabelById],
  );

  const visibleLineage = useMemo(() => {
    const q = keeperFilter.trim().toLowerCase();
    if (!q) return lineage;
    return lineage.filter((v) => v.keeperName.toLowerCase().includes(q));
  }, [lineage, keeperFilter]);

  if (ks.status === "loading" || ks.status === "idle") {
    return (
      <div data-testid="pheno-keepers-loading" className="container mx-auto max-w-4xl px-4 py-6">
        <p className="text-sm text-muted-foreground">Loading keepers…</p>
      </div>
    );
  }
  if (ks.status === "error") {
    return (
      <div data-testid="pheno-keepers-error" className="container mx-auto max-w-4xl px-4 py-6">
        <p className="text-sm text-muted-foreground" role="alert">
          {ks.error ?? "Could not load keepers."}
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="Pheno hunt keepers"
      data-testid="pheno-keepers"
      className="container mx-auto max-w-4xl space-y-6 px-4 py-6"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          Keepers &amp; crosses: {ks.hunt?.name ?? "this hunt"}
        </h1>
        <p className="text-xs text-muted-foreground">
          Preserve a keeper as clones and record breeding crosses. Recording anything here changes
          nothing on its own — Verdant never starts a grow or acts for you.
        </p>
        <div className="flex flex-col items-start gap-1 pt-1">
          {id ? (
            <Link
              to={phenoHuntWorkspacePath(id)}
              data-testid="pheno-keepers-workspace-link"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              ← Back to hunt workspace
            </Link>
          ) : null}
          {id ? (
            <Link
              to={phenoHuntShowcasePath(id)}
              data-testid="pheno-keepers-walk-link"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Walk this hunt — pack, contenders, fight night & family tree →
            </Link>
          ) : null}
        </div>
      </header>

      {!canWrite && (
        <p
          role="status"
          data-testid="pheno-keepers-readonly-banner"
          className="rounded border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          Read-only: your current plan doesn&apos;t include Pheno Tracker changes, so editing is
          off. Your records stay visible.
        </p>
      )}

      {/* Mutation controls (promote, clone, cross, reversal, stability runs)
          sit inside disabled fieldsets so the allowReadOnly route path is
          genuinely view-only for lapsed-Pro growers. Read-only browsing —
          the keeper filter, crosses list, activity timeline — stays OUTSIDE
          the fences so records remain reachable, as the banner promises. */}
      <div className="min-w-0 space-y-6">
        {/* Promote a candidate to keeper */}
        <fieldset disabled={!canWrite} className="m-0 min-w-0 border-0 p-0">
          <section className="space-y-2 rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">Name a keeper</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="keepers-promote-plant"
                aria-label="Candidate to name as keeper"
                value={promotePlant}
                onChange={(e) => setPromotePlant(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="">Choose a candidate…</option>
                {ks.candidates.map((c) => (
                  <option key={c.candidateId} value={c.candidateId}>
                    {phenoCandidateDisplayLabel(c)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                data-testid="keepers-promote-name"
                value={promoteName}
                onChange={(e) => setPromoteName(e.target.value)}
                placeholder="Keeper name"
                aria-label="Keeper name"
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              />
              <button
                type="button"
                data-testid="keepers-promote-save"
                disabled={ks.saving || !promotePlant || !promoteName.trim()}
                onClick={async () => {
                  setActionError(null);
                  if (await ks.promoteToKeeper(promotePlant, promoteName)) {
                    setPromotePlant("");
                    setPromoteName("");
                  } else {
                    setActionError("Could not name this keeper — try again.");
                  }
                }}
                className="rounded-md border border-border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Name keeper
              </button>
              {actionError && (
                <span
                  role="alert"
                  data-testid="pheno-keepers-action-error"
                  className="text-xs font-medium text-red-600 dark:text-red-400"
                >
                  {actionError}
                </span>
              )}
            </div>
          </section>
        </fieldset>

        {/* Keepers + clone lineage. The filter is read-only browsing and stays
            enabled for lapsed-Pro growers; the cards carry editors, so the
            list itself is fenced. */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Keepers</h2>
          {ks.keepers.length === 0 ? (
            <p data-testid="pheno-keepers-empty" className="text-sm text-muted-foreground">
              No keepers named yet.
            </p>
          ) : (
            <>
              {lineage.length > 8 && (
                <input
                  type="search"
                  data-testid="keepers-filter"
                  value={keeperFilter}
                  onChange={(e) => setKeeperFilter(e.target.value)}
                  placeholder="Filter keepers by name…"
                  className="w-56 rounded border border-border bg-background px-2 py-1 text-sm"
                />
              )}
              <fieldset disabled={!canWrite} className="m-0 min-w-0 border-0 p-0">
                <ul className="space-y-3">
                  {visibleLineage.map((view) => (
                    <KeeperCard
                      key={view.keeperId}
                      view={view}
                      clones={ks.clonesByKeeper[view.keeperId] ?? EMPTY_CLONES}
                      stabilityRuns={stabilityRunsByKeeper[view.keeperId] ?? EMPTY_STABILITY_RUNS}
                      growOutPlantsById={ks.growOutPlantsById}
                      reversed={reversedSet.has(view.keeperId)}
                      saving={ks.saving}
                      onAddClone={ks.addKeeperClone}
                      onMarkReversed={ks.markReversed}
                      onSaveStabilityRuns={ks.saveStabilityRuns}
                    />
                  ))}
                </ul>
              </fieldset>
            </>
          )}
        </section>

        {/* Record a cross — standard F1, feminized cross, or self (S1). The
          resulting type is DERIVED from reversal state; the grower never forces
          it, and the service classifies on save. Shown with a single keeper so
          a reversed keeper can self. */}
        {ks.keepers.length >= 1 && (
          <fieldset disabled={!canWrite} className="m-0 min-w-0 border-0 p-0">
            <section className="space-y-2 rounded-lg border border-border bg-card p-4">
              <h2 className="text-lg font-semibold">Record a cross</h2>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1">
                  ♀
                  <select
                    data-testid="keepers-cross-female"
                    aria-label="Seed (female) keeper"
                    value={female}
                    onChange={(e) => {
                      const next = e.target.value;
                      setFemale(next);
                      // A donor equal to the new seed is dropped from the options
                      // below and would otherwise linger in state as an accidental
                      // self-cross — clear it so the selection stays consistent.
                      if (donor === next) setDonor("");
                    }}
                    className="rounded border border-border bg-background px-2 py-1"
                  >
                    <option value="">Seed (female) keeper…</option>
                    {ks.keepers.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.keeperName}
                        {reversedSet.has(k.id) ? " (reversed)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <span>×</span>
                <label className="flex items-center gap-1">
                  pollen
                  <select
                    data-testid="keepers-cross-donor"
                    aria-label="Pollen donor"
                    value={donor}
                    onChange={(e) => setDonor(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1"
                  >
                    <option value="">Pollen donor…</option>
                    <option value={SELF_DONOR_VALUE}>Self (S1) — same keeper</option>
                    {ks.keepers
                      .filter((k) => k.id !== female)
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.keeperName}
                          {reversedSet.has(k.id) ? " (reversed)" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <input
                  type="text"
                  data-testid="keepers-cross-name"
                  value={crossName}
                  onChange={(e) => setCrossName(e.target.value)}
                  placeholder="Cross name (optional)"
                  aria-label="Cross name (optional)"
                  className="rounded border border-border bg-background px-2 py-1"
                />
                <button
                  type="button"
                  data-testid="keepers-cross-save"
                  disabled={ks.saving || !crossForm.canSubmit}
                  onClick={async () => {
                    setCrossError(null);
                    if (await ks.saveCross(female, crossForm.pollenKeeperId, crossName)) {
                      setFemale("");
                      setDonor("");
                      setCrossName("");
                    } else {
                      setCrossError(ks.error ?? "Could not record this cross — try again.");
                    }
                  }}
                  className="rounded-md border border-border bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-50"
                >
                  Record cross
                </button>
                {crossError && (
                  <span
                    role="alert"
                    data-testid="keepers-cross-error"
                    className="text-xs font-medium text-red-600 dark:text-red-400"
                  >
                    {crossError}
                  </span>
                )}
              </div>
              {crossForm.canSubmit ? (
                <p data-testid="keepers-cross-preview" className="text-xs text-muted-foreground">
                  Will be recorded as{" "}
                  <span className="font-medium text-foreground">{crossForm.previewBadge}</span>.
                </p>
              ) : (
                <p
                  data-testid="keepers-cross-disabled-reason"
                  className="text-xs text-muted-foreground"
                  role="status"
                >
                  {crossForm.disabledReason}
                </p>
              )}
            </section>
          </fieldset>
        )}

        {/* Crosses list */}
        {ks.crosses.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Crosses</h2>
            <ul data-testid="pheno-crosses" className="space-y-1 text-sm">
              {ks.crosses.map((x) => {
                const f = keeperNameById[x.femaleKeeperId] ?? "unknown keeper";
                // Donor side: a selfing / null-male row renders "Self", never blank.
                const donorText = crossDonorLabel(x, keeperNameById[x.maleKeeperId ?? ""] ?? null);
                return (
                  <li
                    key={x.id}
                    data-testid={`pheno-cross-${x.id}`}
                    className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1"
                  >
                    <span className="font-medium">{x.crossName || `${f} × ${donorText}`}</span>
                    <span className="text-muted-foreground">
                      (♀ {f} × {donorText})
                    </span>
                    <span
                      data-testid={`pheno-cross-badge-${x.id}`}
                      className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      {crossLineageBadge(x.crossType, x.generation, x.channel)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Breeding activity timeline — reversals + crosses in one chronological
          read-only view (C2 view-model + presenter). */}
        {timelineEntries.length > 0 && (
          <section data-testid="pheno-keepers-activity" className="space-y-2">
            <h2 className="text-lg font-semibold">Breeding activity</h2>
            <PhenoTimelineEntries entries={timelineEntries} />
          </section>
        )}
      </div>
    </section>
  );
}
