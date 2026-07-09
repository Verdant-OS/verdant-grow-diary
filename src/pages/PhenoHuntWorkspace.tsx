/**
 * PhenoHuntWorkspace — /pheno-hunts/:id/workspace
 *
 * The grower's own hunt workspace: score each candidate on the loud trait axes
 * and record a keep / cull / hold / undecided decision. RLS-scoped writes of
 * the grower's OWN data. Suggest-only: saving a decision records a note to self
 * and acts on nothing — no AI, no Action Queue, no automation, no device
 * control. Verdant never picks a phenotype for you.
 */
import { memo, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { usePhenoHuntWorkspace } from "@/hooks/usePhenoHuntWorkspace";
import { buildPhenoHuntCsv, phenoHuntCsvFilename } from "@/lib/phenoHuntCsvExport";
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";
import {
  PHENO_KEEPER_DECISIONS,
  PHENO_KEEPER_DECISION_LABELS,
  PHENO_KEEPER_DECISION_CAVEAT,
  DEFAULT_KEEPER_DECISION,
  type PhenoKeeperDecision,
} from "@/lib/phenoKeeperDecisionModel";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import type { CandidateScoreRow } from "@/lib/phenoCandidateScoresService";
import type { KeeperDecisionRow } from "@/lib/phenoKeeperDecisionService";
import {
  PHENO_SCORE_ROUNDS,
  PHENO_SCORE_ROUND_LABELS,
  type PhenoScoreRound,
  type ScoreRoundRow,
} from "@/lib/phenoScoreRoundsService";
import type { KeeperDecisionLogEntry } from "@/lib/phenoKeeperDecisionLogService";
import type { SexObservationRow } from "@/lib/phenoSexObservationService";
import {
  PHENO_SEX_OBSERVATIONS,
  PHENO_SEX_OBSERVATION_LABELS,
  DEFAULT_SEX_OBSERVATION,
  type PhenoSexObservation,
} from "@/lib/phenoSexObservationModel";
import { usePhenoHermCullSuggestion } from "@/hooks/usePhenoHermCullSuggestion";
import type { SmokeTestRow } from "@/lib/phenoSmokeTestService";
import type { LabResultRow, PhenoLabSource, TerpeneReading } from "@/lib/phenoLabResultsService";
import PhenoProductSamplingSection from "@/components/PhenoProductSamplingSection";
import PhenoStressTestingSection from "@/components/PhenoStressTestingSection";
import PhenoSamplingWorkspaceTools from "@/components/PhenoSamplingWorkspaceTools";
import PhenoDocumentationSections from "@/components/PhenoDocumentationSections";
import PhenoStressObservationsList from "@/components/PhenoStressObservationsList";
import { PhenoSamplingProvider } from "@/context/PhenoSamplingContext";
import { usePhenoStressObservations } from "@/hooks/usePhenoStressObservations";
import PhenoHuntSetupProgressCard from "@/components/PhenoHuntSetupProgressCard";
import { updatePhenoHuntSetup } from "@/lib/phenoHuntService";


function toIntOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function tags(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Post-cure smoke test — the deciding gate. Own state + save. */
function SmokeTestFields({
  plantId,
  row,
  onSave,
}: {
  plantId: string;
  row: SmokeTestRow | undefined;
  onSave: (
    plantId: string,
    payload: {
      flavorDescriptors: readonly string[];
      effectDescriptors: readonly string[];
      smoothness: number | null;
      potencyImpression: number | null;
      verdict: string | null;
    },
  ) => Promise<boolean>;
}) {
  const [flavor, setFlavor] = useState((row?.flavorDescriptors ?? []).join(", "));
  const [effect, setEffect] = useState((row?.effectDescriptors ?? []).join(", "));
  const [smoothness, setSmoothness] = useState(
    row?.smoothness != null ? String(row.smoothness) : "",
  );
  const [potency, setPotency] = useState(
    row?.potencyImpression != null ? String(row.potencyImpression) : "",
  );
  const [verdict, setVerdict] = useState(row?.verdict ?? "");
  const [saved, setSaved] = useState(false);

  return (
    <details data-testid={`workspace-smoke-${plantId}`} className="text-sm">
      <summary className="cursor-pointer font-medium">Post-cure smoke test</summary>
      <div className="mt-2 space-y-2">
        <input
          type="text"
          data-testid={`workspace-smoke-flavor-${plantId}`}
          value={flavor}
          onChange={(e) => {
            setSaved(false);
            setFlavor(e.target.value);
          }}
          placeholder="Flavor: gas, cream…"
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
        <input
          type="text"
          data-testid={`workspace-smoke-effect-${plantId}`}
          value={effect}
          onChange={(e) => {
            setSaved(false);
            setEffect(e.target.value);
          }}
          placeholder="Effect: couchlock, euphoric…"
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
        <div className="flex gap-2 text-xs">
          <label className="flex items-center gap-1">
            Smoothness
            <input
              type="number"
              min={1}
              max={5}
              data-testid={`workspace-smoke-smoothness-${plantId}`}
              value={smoothness}
              onChange={(e) => {
                setSaved(false);
                setSmoothness(e.target.value);
              }}
              className="w-14 rounded border border-border bg-background px-1 py-0.5"
            />
          </label>
          <label className="flex items-center gap-1">
            Potency (feel)
            <input
              type="number"
              min={1}
              max={5}
              data-testid={`workspace-smoke-potency-${plantId}`}
              value={potency}
              onChange={(e) => {
                setSaved(false);
                setPotency(e.target.value);
              }}
              className="w-14 rounded border border-border bg-background px-1 py-0.5"
            />
          </label>
        </div>
        <textarea
          data-testid={`workspace-smoke-verdict-${plantId}`}
          value={verdict}
          onChange={(e) => {
            setSaved(false);
            setVerdict(e.target.value);
          }}
          rows={2}
          placeholder="Verdict…"
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
        <button
          type="button"
          data-testid={`workspace-save-smoke-${plantId}`}
          onClick={async () => {
            const ok = await onSave(plantId, {
              flavorDescriptors: tags(flavor),
              effectDescriptors: tags(effect),
              smoothness: toIntOrNull(smoothness),
              potencyImpression: toIntOrNull(potency),
              verdict: verdict.trim() || null,
            });
            setSaved(ok);
          }}
          className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium"
        >
          Save smoke test
        </button>
        {saved && <span className="ml-2 text-xs text-emerald-600">Saved</span>}
      </div>
    </details>
  );
}

/** COA / lab numbers — grower-attached, source-tagged, never fabricated. */
function LabFields({
  plantId,
  row,
  onSave,
}: {
  plantId: string;
  row: LabResultRow | undefined;
  onSave: (
    plantId: string,
    source: PhenoLabSource,
    payload: {
      thcPct: number | null;
      cbdPct: number | null;
      totalCannabinoidsPct: number | null;
      dominantTerpenes: readonly TerpeneReading[];
    },
  ) => Promise<boolean>;
}) {
  const [source, setSource] = useState<PhenoLabSource>(row?.source ?? "coa");
  const [thc, setThc] = useState(row?.thcPct != null ? String(row.thcPct) : "");
  const [cbd, setCbd] = useState(row?.cbdPct != null ? String(row.cbdPct) : "");
  const [terps, setTerps] = useState((row?.dominantTerpenes ?? []).map((t) => t.name).join(", "));
  const [saved, setSaved] = useState(false);

  return (
    <details data-testid={`workspace-lab-${plantId}`} className="text-sm">
      <summary className="cursor-pointer font-medium">Lab (COA)</summary>
      <div className="mt-2 space-y-2">
        <label className="flex items-center gap-2 text-xs">
          Source
          <select
            data-testid={`workspace-lab-source-${plantId}`}
            value={source}
            onChange={(e) => {
              setSaved(false);
              setSource(e.target.value as PhenoLabSource);
            }}
            className="rounded border border-border bg-background px-2 py-1"
          >
            <option value="coa">COA (lab)</option>
            <option value="estimate">Estimate</option>
            <option value="unspecified">Unspecified</option>
          </select>
        </label>
        <div className="flex gap-2 text-xs">
          <label className="flex items-center gap-1">
            THC %
            <input
              type="number"
              step="0.1"
              data-testid={`workspace-lab-thc-${plantId}`}
              value={thc}
              onChange={(e) => {
                setSaved(false);
                setThc(e.target.value);
              }}
              className="w-16 rounded border border-border bg-background px-1 py-0.5"
            />
          </label>
          <label className="flex items-center gap-1">
            CBD %
            <input
              type="number"
              step="0.1"
              data-testid={`workspace-lab-cbd-${plantId}`}
              value={cbd}
              onChange={(e) => {
                setSaved(false);
                setCbd(e.target.value);
              }}
              className="w-16 rounded border border-border bg-background px-1 py-0.5"
            />
          </label>
        </div>
        <input
          type="text"
          data-testid={`workspace-lab-terps-${plantId}`}
          value={terps}
          onChange={(e) => {
            setSaved(false);
            setTerps(e.target.value);
          }}
          placeholder="Dominant terps: caryophyllene, limonene…"
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
        <button
          type="button"
          data-testid={`workspace-save-lab-${plantId}`}
          onClick={async () => {
            const ok = await onSave(plantId, source, {
              thcPct: toIntOrNull(thc),
              cbdPct: toIntOrNull(cbd),
              totalCannabinoidsPct: null,
              dominantTerpenes: tags(terps).map((name) => ({ name, pct: null })),
            });
            setSaved(ok);
          }}
          className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium"
        >
          Save lab
        </button>
        {saved && <span className="ml-2 text-xs text-emerald-600">Saved</span>}
      </div>
    </details>
  );
}

/** "overall" = the flat card (pheno_candidate_scores); rounds = staged cards. */
type WorkspaceRound = "overall" | PhenoScoreRound;

// Stable empty history so memoized cards without history keep identical props
// across parent re-renders (a fresh [] per render would defeat React.memo).
const EMPTY_HISTORY: readonly KeeperDecisionLogEntry[] = [];

/** Cards rendered per "Show more" click — keeps first paint bounded at 300+. */
const CANDIDATE_PAGE_SIZE = 30;

interface EditorProps {
  candidate: PhenoCandidateInput;
  round: WorkspaceRound;
  score: CandidateScoreRow | undefined;
  roundRow: ScoreRoundRow | undefined;
  decision: KeeperDecisionRow | undefined;
  saving: boolean;
  onSaveScore: (
    plantId: string,
    traits: Record<string, number>,
    note: string | null,
  ) => Promise<boolean>;
  onSaveRound: (
    plantId: string,
    round: PhenoScoreRound,
    payload: {
      loudTraits: Record<string, number>;
      aromaDescriptors?: readonly string[];
      noseNote?: string | null;
      note?: string | null;
    },
  ) => Promise<boolean>;
  onSaveDecision: (
    plantId: string,
    decision: PhenoKeeperDecision,
    reason: string | null,
  ) => Promise<boolean>;
  history: readonly KeeperDecisionLogEntry[];
  /** Fetches this candidate's decision history when its section is opened. */
  onLoadHistory: (plantId: string) => Promise<void>;
  sexRow: SexObservationRow | undefined;
  /** This candidate's keeper has a recorded chemical reversal (expected pollen). */
  reversed: boolean;
  onSaveSex: (plantId: string, sex: PhenoSexObservation) => Promise<boolean>;
  growId: string | null;
  tentId: string | null;
  onQueueRemoval: (input: {
    observationId: string;
    candidateLabel: string;
    growId: string;
    plantId: string;
    tentId?: string | null;
  }) => Promise<boolean>;
  queuing: boolean;
  queued: boolean;
  smokeRow: SmokeTestRow | undefined;
  onSaveSmokeTest: (
    plantId: string,
    payload: {
      flavorDescriptors: readonly string[];
      effectDescriptors: readonly string[];
      smoothness: number | null;
      potencyImpression: number | null;
      verdict: string | null;
    },
  ) => Promise<boolean>;
  labRow: LabResultRow | undefined;
  onSaveLabResult: (
    plantId: string,
    source: PhenoLabSource,
    payload: {
      thcPct: number | null;
      cbdPct: number | null;
      totalCannabinoidsPct: number | null;
      dominantTerpenes: readonly TerpeneReading[];
    },
  ) => Promise<boolean>;
}

// Memoized: at commercial scale (hundreds of candidates) every save toggles
// parent state twice, and without memo each toggle re-renders EVERY heavy
// card. Save callbacks are useCallback-stable and per-candidate row props
// only change identity for the candidate that actually saved.
const CandidateEditor = memo(function CandidateEditor({
  candidate,
  round,
  score,
  roundRow,
  decision,
  saving,
  onSaveScore,
  onSaveRound,
  onSaveDecision,
  history,
  onLoadHistory,
  sexRow,
  reversed,
  onSaveSex,
  growId,
  tentId,
  onQueueRemoval,
  queuing,
  queued,
  smokeRow,
  onSaveSmokeTest,
  labRow,
  onSaveLabResult,
}: EditorProps) {
  const plantId = candidate.candidateId;
  const isRoundMode = round !== "overall";
  const [reason, setReason] = useState<string>("");
  const [sex, setSex] = useState<PhenoSexObservation>(sexRow?.sex ?? DEFAULT_SEX_OBSERVATION);
  const [traits, setTraits] = useState<Record<string, number>>(() =>
    isRoundMode ? { ...(roundRow?.loudTraits ?? {}) } : { ...(score?.traits ?? {}) },
  );
  const [note, setNote] = useState<string>((isRoundMode ? roundRow?.note : score?.note) ?? "");
  const [aroma, setAroma] = useState<string>((roundRow?.aromaDescriptors ?? []).join(", "));
  const [noseNote, setNoseNote] = useState<string>(roundRow?.noseNote ?? "");
  const [decisionValue, setDecisionValue] = useState<PhenoKeeperDecision>(
    decision?.decision ?? DEFAULT_KEEPER_DECISION,
  );
  const [saved, setSaved] = useState(false);
  const [historyRequested, setHistoryRequested] = useState(false);

  const setTrait = (key: string, raw: string) => {
    setSaved(false);
    setTraits((prev) => {
      const next = { ...prev };
      if (raw === "") delete next[key];
      else {
        const n = Number(raw);
        if (Number.isFinite(n)) next[key] = n;
      }
      return next;
    });
  };

  const onSave = async () => {
    let okScore: boolean;
    if (isRoundMode) {
      okScore = await onSaveRound(plantId, round as PhenoScoreRound, {
        loudTraits: traits,
        aromaDescriptors: aroma
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        noseNote: noseNote.trim() || null,
        note: note.trim() || null,
      });
    } else {
      okScore = await onSaveScore(plantId, traits, note.trim() || null);
    }
    const okDecision = await onSaveDecision(plantId, decisionValue, reason.trim() || null);
    const okSex = await onSaveSex(plantId, sex);
    setSaved(okScore && okDecision && okSex);
  };

  const hermObserved = sex === "hermaphrodite" || sexRow?.hermObserved === true;
  // Reversed-female herm landmine: a keeper with a recorded chemical reversal is
  // DELIBERATELY made to shed pollen, so its pollen sacs are EXPECTED — never
  // nudge culling the plant being bred with. Only a spontaneous (non-reversed)
  // herm surfaces the removal alert + cull button.
  const isHerm = hermObserved && !reversed;
  const isReversedFemale = hermObserved && reversed;

  return (
    <section
      data-testid={`pheno-workspace-candidate-${plantId}`}
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <header>
        <h2 className="text-lg font-semibold">{candidate.candidateLabel ?? plantId}</h2>
        <p className="text-xs text-muted-foreground">
          {candidate.strain ?? "Strain unknown"} · {candidate.stage ?? "Stage unknown"}
        </p>
      </header>

      <div className="space-y-2">
        {LOUD_TRAIT_AXES.map((axis) => (
          <label key={axis.key} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {axis.label}{" "}
              <span className="text-xs text-muted-foreground">
                ({axis.min}–{axis.max})
              </span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={axis.min}
              max={axis.max}
              step={1}
              data-testid={`workspace-trait-${plantId}-${axis.key}`}
              value={traits[axis.key] ?? ""}
              onChange={(e) => setTrait(axis.key, e.target.value)}
              className="w-20 rounded border border-border bg-background px-2 py-1 text-right"
            />
          </label>
        ))}
      </div>

      {isRoundMode && (
        <>
          <label className="block text-sm">
            <span className="mb-1 block">
              Aroma / nose <span className="text-xs text-muted-foreground">(comma-separated)</span>
            </span>
            <input
              type="text"
              data-testid={`workspace-aroma-${plantId}`}
              value={aroma}
              onChange={(e) => {
                setSaved(false);
                setAroma(e.target.value);
              }}
              placeholder="gas, funk, candy…"
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Nose note</span>
            <input
              type="text"
              data-testid={`workspace-nose-note-${plantId}`}
              value={noseNote}
              onChange={(e) => {
                setSaved(false);
                setNoseNote(e.target.value);
              }}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
        </>
      )}

      <label className="block text-sm">
        <span className="mb-1 block">Notes</span>
        <textarea
          data-testid={`workspace-note-${plantId}`}
          value={note}
          onChange={(e) => {
            setSaved(false);
            setNote(e.target.value);
          }}
          rows={2}
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium">Keeper decision</span>
        <select
          data-testid={`workspace-decision-${plantId}`}
          value={decisionValue}
          onChange={(e) => {
            setSaved(false);
            setDecisionValue(e.target.value as PhenoKeeperDecision);
          }}
          className="rounded border border-border bg-background px-2 py-1"
        >
          {PHENO_KEEPER_DECISIONS.map((d) => (
            <option key={d} value={d}>
              {PHENO_KEEPER_DECISION_LABELS[d]}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block">
          Reason <span className="text-xs text-muted-foreground">(kept in the decision log)</span>
        </span>
        <input
          type="text"
          data-testid={`workspace-reason-${plantId}`}
          value={reason}
          onChange={(e) => {
            setSaved(false);
            setReason(e.target.value);
          }}
          placeholder="Why keep/cull/hold?"
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium">Sex</span>
        <select
          data-testid={`workspace-sex-${plantId}`}
          value={sex}
          onChange={(e) => {
            setSaved(false);
            setSex(e.target.value as PhenoSexObservation);
          }}
          className="rounded border border-border bg-background px-2 py-1"
        >
          {PHENO_SEX_OBSERVATIONS.map((s) => (
            <option key={s} value={s}>
              {PHENO_SEX_OBSERVATION_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      {isReversedFemale && (
        <div
          data-testid={`workspace-herm-reversed-${plantId}`}
          className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground"
        >
          <p className="font-medium text-foreground">Reversed female — pollen sacs expected.</p>
          <p className="opacity-90">
            This keeper has a recorded chemical reversal, so it is deliberately shedding pollen for
            breeding. This is not a spontaneous hermaphrodite — the sex sacs alone are not a reason
            to remove it.
          </p>
        </div>
      )}

      {isHerm && (
        <div
          data-testid={`workspace-herm-flag-${plantId}`}
          role="alert"
          className="space-y-2 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300"
        >
          <p className="font-semibold">
            ⚠ Hermaphrodite recorded — consider removing to protect the run.
          </p>
          <p className="opacity-90">
            Verdant never removes a plant for you. Queue a removal for your own approval — you still
            confirm and act.
          </p>
          {queued ? (
            <span data-testid={`workspace-herm-queued-${plantId}`} className="font-medium">
              Removal queued for approval.
            </span>
          ) : (
            <button
              type="button"
              data-testid={`workspace-herm-queue-${plantId}`}
              disabled={queuing || !growId}
              onClick={() =>
                growId &&
                onQueueRemoval({
                  observationId: `${plantId}-herm-${sexRow?.observedAt ?? "now"}`,
                  candidateLabel: candidate.candidateLabel ?? plantId,
                  growId,
                  plantId,
                  tentId,
                })
              }
              className="rounded border border-red-500/60 px-2 py-1 font-medium disabled:opacity-50"
            >
              {queuing ? "Queuing…" : "Queue removal for approval"}
            </button>
          )}
        </div>
      )}

      <SmokeTestFields plantId={plantId} row={smokeRow} onSave={onSaveSmokeTest} />
      <LabFields plantId={plantId} row={labRow} onSave={onSaveLabResult} />

      <PhenoDocumentationSections
        recordId={plantId}
        recordType="candidate"
        title="Candidate documentation"
        defaultOpen={false}
      />

      <details
        data-testid={`workspace-decision-history-${plantId}`}
        className="text-xs"
        onToggle={(e) => {
          // Fetched per candidate on first open — a hunt-wide history read is
          // unbounded at commercial scale, and most cards are never expanded.
          if ((e.target as HTMLDetailsElement).open) {
            setHistoryRequested(true);
            void onLoadHistory(plantId);
          }
        }}
      >
        <summary className="cursor-pointer text-muted-foreground">
          Decision history{history.length > 0 ? ` (${history.length})` : ""}
        </summary>
        {history.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {history.map((h, i) => (
              <li
                key={`${h.decidedAt ?? "na"}-${i}`}
                className="rounded border border-border px-2 py-1"
              >
                <span className="font-medium capitalize">{h.decision}</span>
                {h.reason ? ` — ${h.reason}` : ""}
                {h.decidedAt ? (
                  <span className="ml-1 text-muted-foreground">({h.decidedAt.slice(0, 10)})</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted-foreground">
            {historyRequested ? "No decisions recorded yet." : "Open to load history."}
          </p>
        )}
      </details>

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid={`workspace-save-${plantId}`}
          disabled={saving}
          onClick={onSave}
          className="rounded-md border border-border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span data-testid={`workspace-saved-${plantId}`} className="text-xs text-emerald-600">
            Saved
          </span>
        )}
      </div>
    </section>
  );
});

export default function PhenoHuntWorkspace() {
  const { id } = useParams<{ id: string }>();
  const ws = usePhenoHuntWorkspace(id);
  const herm = usePhenoHermCullSuggestion();
  const stress = usePhenoStressObservations(ws.hunt?.id ?? null);
  const [round, setRound] = useState<WorkspaceRound>("overall");
  const [filterText, setFilterText] = useState("");
  const [filterDecision, setFilterDecision] = useState<"all" | "undecided" | PhenoKeeperDecision>(
    "all",
  );
  const [visibleCount, setVisibleCount] = useState(CANDIDATE_PAGE_SIZE);
  const [setupSaving, setSetupSaving] = useState(false);
  // Optimistic override so the card flips to "setup complete" instantly
  // after the grower confirms — the persisted hunt row is still authoritative.
  const [setupCompletedLocal, setSetupCompletedLocal] = useState<string | null>(null);

  const handleMarkSetupComplete = async () => {
    if (!ws.hunt?.id || setupSaving) return;
    setSetupSaving(true);
    try {
      await updatePhenoHuntSetup({ huntId: ws.hunt.id, markSetupComplete: true });
      setSetupCompletedLocal(new Date().toISOString());
    } catch {
      // Silent — no toast dependency here; workspace already surfaces
      // network errors elsewhere. Grower can retry.
    } finally {
      setSetupSaving(false);
    }
  };


  // Round cards are fetched per selected round, not all five upfront.
  useEffect(() => {
    if (round !== "overall") void ws.loadRound(round);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadRound is idempotent per round
  }, [round, ws.loadRound]);

  const candidates = useMemo(() => ws.candidates, [ws.candidates]);

  // Text + decision filters so a specific plant is findable among hundreds.
  // Filtering narrows the view only — it never orders by score or suggests
  // which candidate to keep.
  const filteredCandidates = useMemo(() => {
    const text = filterText.trim().toLowerCase();
    return candidates.filter((c) => {
      if (text) {
        const hay = `${c.candidateLabel ?? ""} ${c.candidateId} ${c.strain ?? ""}`.toLowerCase();
        if (!hay.includes(text)) return false;
      }
      if (filterDecision !== "all") {
        const d = ws.decisionsByPlant[c.candidateId]?.decision;
        if (filterDecision === "undecided") {
          if (d && d !== "undecided") return false;
        } else if (d !== filterDecision) {
          return false;
        }
      }
      return true;
    });
  }, [candidates, filterText, filterDecision, ws.decisionsByPlant]);

  const visibleCandidates = useMemo(
    () => filteredCandidates.slice(0, visibleCount),
    [filteredCandidates, visibleCount],
  );

  const onExportCsv = () => {
    const csv = buildPhenoHuntCsv({
      huntName: ws.hunt?.name ?? "hunt",
      candidates,
      scoresByPlant: ws.scoresByPlant,
      decisionsByPlant: ws.decisionsByPlant,
      sexByPlant: ws.sexByPlant,
      smokeByPlant: ws.smokeByPlant,
      labByKey: ws.labByKey,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = phenoHuntCsvFilename(ws.hunt?.name ?? "hunt");
    a.click();
    URL.revokeObjectURL(url);
  };
  const stressSummaries = useMemo(
    () =>
      candidates.map((c) => ({
        ...(stress.summariesByPlant[c.candidateId] ?? {
          plantId: c.candidateId,
          plannedCount: 0,
          observedCount: 0,
          mostRecentFactor: null,
          mostRecentIntensity: null,
          currentRecommendation: null,
          keyNotesPreview: "",
          hasDiaryEvidence: false,
        }),
        candidateLabel: c.candidateLabel,
      })),
    [candidates, stress.summariesByPlant],
  );

  if (ws.status === "loading" || ws.status === "idle") {
    return (
      <div data-testid="pheno-workspace-loading" className="container mx-auto max-w-5xl px-4 py-6">
        <p className="text-sm text-muted-foreground">Loading hunt…</p>
      </div>
    );
  }

  if (ws.status === "error") {
    return (
      <div data-testid="pheno-workspace-error" className="container mx-auto max-w-5xl px-4 py-6">
        <p className="text-sm text-muted-foreground" role="alert">
          {ws.error ?? "Could not load this hunt."}
        </p>
      </div>
    );
  }

  return (
    <PhenoSamplingProvider>
      <main
        data-testid="pheno-workspace"
        className="container mx-auto max-w-5xl space-y-4 px-4 py-6"
      >
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Hunt workspace: {ws.hunt?.name ?? "this hunt"}</h1>
          <p className="text-xs text-muted-foreground">{PHENO_KEEPER_DECISION_CAVEAT}</p>
          <label className="flex items-center gap-2 pt-1 text-sm">
            <span className="font-medium">Scoring round</span>
            <select
              data-testid="workspace-round-select"
              value={round}
              onChange={(e) => setRound(e.target.value as WorkspaceRound)}
              className="rounded border border-border bg-background px-2 py-1"
            >
              <option value="overall">Overall</option>
              {PHENO_SCORE_ROUNDS.map((r) => (
                <option key={r} value={r}>
                  {PHENO_SCORE_ROUND_LABELS[r]}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              Score the same plant at each stage — rounds save separately.
            </span>
          </label>
        </header>

        {candidates.length === 0 ? (
          <p data-testid="pheno-workspace-empty" className="text-sm text-muted-foreground">
            No candidates tagged to this hunt yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="search"
                data-testid="workspace-filter-text"
                value={filterText}
                onChange={(e) => {
                  setFilterText(e.target.value);
                  setVisibleCount(CANDIDATE_PAGE_SIZE);
                }}
                placeholder="Find a candidate (label, strain)…"
                className="w-56 rounded border border-border bg-background px-2 py-1"
              />
              <label className="flex items-center gap-1 text-xs">
                Decision
                <select
                  data-testid="workspace-filter-decision"
                  value={filterDecision}
                  onChange={(e) => {
                    setFilterDecision(e.target.value as typeof filterDecision);
                    setVisibleCount(CANDIDATE_PAGE_SIZE);
                  }}
                  className="rounded border border-border bg-background px-2 py-1"
                >
                  <option value="all">All</option>
                  <option value="undecided">Undecided</option>
                  {PHENO_KEEPER_DECISIONS.filter((d) => d !== "undecided").map((d) => (
                    <option key={d} value={d}>
                      {PHENO_KEEPER_DECISION_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <span data-testid="workspace-visible-count" className="text-xs text-muted-foreground">
                Showing {visibleCandidates.length} of {filteredCandidates.length} candidates
                {filteredCandidates.length !== candidates.length
                  ? ` (filtered from ${candidates.length})`
                  : ""}
              </span>
              <button
                type="button"
                data-testid="workspace-export-csv"
                onClick={onExportCsv}
                className="ml-auto rounded border border-border bg-secondary px-2 py-1 text-xs font-medium"
              >
                Export hunt CSV
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {visibleCandidates.map((c) => (
                <CandidateEditor
                  // Re-mount on round change so prefill state re-initializes.
                  key={`${c.candidateId}:${round}`}
                  candidate={c}
                  round={round}
                  score={ws.scoresByPlant[c.candidateId]}
                  roundRow={
                    round === "overall" ? undefined : ws.roundsByKey[`${c.candidateId}:${round}`]
                  }
                  decision={ws.decisionsByPlant[c.candidateId]}
                  saving={ws.saving === c.candidateId}
                  onSaveScore={ws.saveScore}
                  onSaveRound={ws.saveRound}
                  onSaveDecision={ws.saveDecision}
                  history={ws.decisionHistoryByPlant[c.candidateId] ?? EMPTY_HISTORY}
                  onLoadHistory={ws.loadDecisionHistory}
                  sexRow={ws.sexByPlant[c.candidateId]}
                  reversed={ws.reversedPlantIds.has(c.candidateId)}
                  onSaveSex={ws.saveSex}
                  growId={ws.hunt?.growId ?? null}
                  tentId={ws.hunt?.tentId ?? null}
                  onQueueRemoval={herm.queueRemoval}
                  queuing={herm.queuing === c.candidateId}
                  queued={herm.queuedPlantIds.has(c.candidateId)}
                  smokeRow={ws.smokeByPlant[c.candidateId]}
                  onSaveSmokeTest={ws.saveSmokeTest}
                  labRow={ws.labByKey[`${c.candidateId}:coa`]}
                  onSaveLabResult={ws.saveLabResult}
                />
              ))}
            </div>

            {filteredCandidates.length > visibleCount && (
              <div className="flex justify-center">
                <button
                  type="button"
                  data-testid="workspace-show-more"
                  onClick={() => setVisibleCount((n) => n + CANDIDATE_PAGE_SIZE)}
                  className="rounded border border-border bg-secondary px-3 py-1.5 text-sm font-medium"
                >
                  Show {Math.min(CANDIDATE_PAGE_SIZE, filteredCandidates.length - visibleCount)}{" "}
                  more
                </button>
              </div>
            )}
          </>
        )}

        <PhenoStressTestingSection
          candidates={candidates.map((c) => ({
            candidateId: c.candidateId,
            candidateLabel: c.candidateLabel,
          }))}
          diaryOptions={stress.diaryOptions}
          onPersist={stress.save}
          summaries={stressSummaries}
        />
        <PhenoStressObservationsList
          rows={stress.rows}
          candidates={candidates.map((c) => ({
            candidateId: c.candidateId,
            candidateLabel: c.candidateLabel,
          }))}
          diaryOptions={stress.diaryOptions}
          onUpdate={stress.update}
          onDelete={stress.remove}
        />
        <PhenoProductSamplingSection />
        <PhenoSamplingWorkspaceTools
          candidates={candidates.map((c) => ({
            candidateId: c.candidateId,
            candidateLabel: c.candidateLabel,
          }))}
        />
      </main>
    </PhenoSamplingProvider>
  );
}
