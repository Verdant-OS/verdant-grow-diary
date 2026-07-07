/**
 * PhenoKeepersPage — /pheno-hunts/:id/keepers
 *
 * Keepers, clone lineage, and the breeding endgame (two-parent crosses) for a
 * grower's own hunt. RLS-scoped writes of the grower's OWN records. Data/record-
 * only: naming a keeper, adding a clone, or recording a cross starts no grow and
 * drives no device. No AI, no Action Queue, no automation.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { usePhenoKeepers } from "@/hooks/usePhenoKeepers";
import { buildPhenoKeeperLineage } from "@/lib/phenoKeeperLineageViewModel";
import {
  buildCrossFormViewModel,
  crossLineageBadge,
  crossDonorLabel,
  REVERSAL_METHOD_OPTIONS,
  SELF_DONOR_VALUE,
} from "@/lib/phenoCrossFormViewModel";
import { buildPhenoTimelineEntries } from "@/lib/phenoTimelineEntriesViewModel";
import PhenoTimelineEntries from "@/components/PhenoTimelineEntries";

export default function PhenoKeepersPage() {
  const { id } = useParams<{ id: string }>();
  const ks = usePhenoKeepers(id);

  const [promotePlant, setPromotePlant] = useState("");
  const [promoteName, setPromoteName] = useState("");
  const [cloneLabels, setCloneLabels] = useState<Record<string, string>>({});
  const [reversalMethods, setReversalMethods] = useState<Record<string, string>>({});
  const [female, setFemale] = useState("");
  const [donor, setDonor] = useState("");
  const [crossName, setCrossName] = useState("");

  const reversedSet = useMemo(() => new Set(ks.reversedKeeperIds), [ks.reversedKeeperIds]);
  const keeperNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of ks.keepers) m[k.id] = k.keeperName;
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

  // Chronological breeding activity for this hunt: reversals + crosses (with
  // selfing rendered "Self" and F1/Feminized/S1 badges). Read-only.
  const timelineEntries = useMemo(
    () =>
      buildPhenoTimelineEntries({
        crosses: ks.crosses,
        reversals: ks.reversals,
        keeperName: (kid) => keeperNameById[kid] ?? null,
      }),
    [ks.crosses, ks.reversals, keeperNameById],
  );

  const candidateLabelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of ks.candidates) m[c.candidateId] = c.candidateLabel ?? c.candidateId;
    return m;
  }, [ks.candidates]);

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
    <main data-testid="pheno-keepers" className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          Keepers &amp; crosses: {ks.hunt?.name ?? "this hunt"}
        </h1>
        <p className="text-xs text-muted-foreground">
          Preserve a keeper as clones and record breeding crosses. Recording anything here changes
          nothing on its own — Verdant never starts a grow or acts for you.
        </p>
      </header>

      {/* Promote a candidate to keeper */}
      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Name a keeper</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="keepers-promote-plant"
            value={promotePlant}
            onChange={(e) => setPromotePlant(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">Choose a candidate…</option>
            {ks.candidates.map((c) => (
              <option key={c.candidateId} value={c.candidateId}>
                {c.candidateLabel ?? c.candidateId}
              </option>
            ))}
          </select>
          <input
            type="text"
            data-testid="keepers-promote-name"
            value={promoteName}
            onChange={(e) => setPromoteName(e.target.value)}
            placeholder="Keeper name"
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          />
          <button
            type="button"
            data-testid="keepers-promote-save"
            disabled={ks.saving || !promotePlant || !promoteName.trim()}
            onClick={async () => {
              if (await ks.promoteToKeeper(promotePlant, promoteName)) {
                setPromotePlant("");
                setPromoteName("");
              }
            }}
            className="rounded-md border border-border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Name keeper
          </button>
        </div>
      </section>

      {/* Keepers + clone lineage */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Keepers</h2>
        {ks.keepers.length === 0 ? (
          <p data-testid="pheno-keepers-empty" className="text-sm text-muted-foreground">
            No keepers named yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {lineage.map((view) => (
              <li
                key={view.keeperId}
                data-testid={`pheno-keeper-${view.keeperId}`}
                className="space-y-2 rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <h3 className="flex items-center gap-2 font-semibold">
                    {view.keeperName}
                    {reversedSet.has(view.keeperId) && (
                      <span
                        data-testid={`keeper-reversed-badge-${view.keeperId}`}
                        className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
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
                  <span className="font-medium">
                    Clones ({ks.clonesByKeeper[view.keeperId]?.length ?? 0}):
                  </span>{" "}
                  {(ks.clonesByKeeper[view.keeperId] ?? []).map((c) => c.cloneLabel).join(", ") ||
                    "none yet"}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    data-testid={`keepers-clone-label-${view.keeperId}`}
                    value={cloneLabels[view.keeperId] ?? ""}
                    onChange={(e) =>
                      setCloneLabels((prev) => ({ ...prev, [view.keeperId]: e.target.value }))
                    }
                    placeholder="Clone label (e.g. mother, cut #2)"
                    className="rounded border border-border bg-background px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    data-testid={`keepers-clone-add-${view.keeperId}`}
                    disabled={ks.saving || !(cloneLabels[view.keeperId] ?? "").trim()}
                    onClick={async () => {
                      if (
                        await ks.addKeeperClone(view.keeperId, cloneLabels[view.keeperId] ?? "")
                      ) {
                        setCloneLabels((prev) => ({ ...prev, [view.keeperId]: "" }));
                      }
                    }}
                    className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium disabled:opacity-50"
                  >
                    Add clone
                  </button>
                </div>
                {/* Record a reversal (append-only): shown only until reversed. */}
                {reversedSet.has(view.keeperId) ? (
                  <p
                    data-testid={`keeper-reversed-note-${view.keeperId}`}
                    className="text-[11px] text-muted-foreground"
                  >
                    Reversed — its pollen makes feminized (self / S1 or feminized-cross) seed.
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      data-testid={`keeper-reverse-method-${view.keeperId}`}
                      aria-label={`Reversal method for ${view.keeperName}`}
                      value={reversalMethods[view.keeperId] ?? "sts"}
                      onChange={(e) =>
                        setReversalMethods((prev) => ({ ...prev, [view.keeperId]: e.target.value }))
                      }
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      {REVERSAL_METHOD_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      data-testid={`keeper-reverse-${view.keeperId}`}
                      disabled={ks.saving}
                      onClick={() =>
                        ks.markReversed(view.keeperId, reversalMethods[view.keeperId] ?? "sts")
                      }
                      className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium disabled:opacity-50"
                    >
                      Mark as reversed
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Record a cross — standard F1, feminized cross, or self (S1). The
          resulting type is DERIVED from reversal state; the grower never forces
          it, and the service classifies on save. Shown with a single keeper so
          a reversed keeper can self. */}
      {ks.keepers.length >= 1 && (
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
              className="rounded border border-border bg-background px-2 py-1"
            />
            <button
              type="button"
              data-testid="keepers-cross-save"
              disabled={ks.saving || !crossForm.canSubmit}
              onClick={async () => {
                if (await ks.saveCross(female, crossForm.pollenKeeperId, crossName)) {
                  setFemale("");
                  setDonor("");
                  setCrossName("");
                }
              }}
              className="rounded-md border border-border bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-50"
            >
              Record cross
            </button>
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
                    {crossLineageBadge(x.crossType)}
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
    </main>
  );
}
