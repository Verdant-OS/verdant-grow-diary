/**
 * PhenoHuntWorkspace — /pheno-hunts/:id/workspace
 *
 * The grower's own hunt workspace: score each candidate on the loud trait axes
 * and record a keep / cull / hold / undecided decision. RLS-scoped writes of
 * the grower's OWN data. Suggest-only: saving a decision records a note to self
 * and acts on nothing — no AI, no Action Queue, no automation, no device
 * control. Verdant never picks a phenotype for you.
 */
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { usePhenoHuntWorkspace } from "@/hooks/usePhenoHuntWorkspace";
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

/** "overall" = the flat card (pheno_candidate_scores); rounds = staged cards. */
type WorkspaceRound = "overall" | PhenoScoreRound;

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
  onSaveDecision: (plantId: string, decision: PhenoKeeperDecision) => Promise<boolean>;
}

function CandidateEditor({
  candidate,
  round,
  score,
  roundRow,
  decision,
  saving,
  onSaveScore,
  onSaveRound,
  onSaveDecision,
}: EditorProps) {
  const plantId = candidate.candidateId;
  const isRoundMode = round !== "overall";
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
    const okDecision = await onSaveDecision(plantId, decisionValue);
    setSaved(okScore && okDecision);
  };

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
}

export default function PhenoHuntWorkspace() {
  const { id } = useParams<{ id: string }>();
  const ws = usePhenoHuntWorkspace(id);
  const [round, setRound] = useState<WorkspaceRound>("overall");

  const candidates = useMemo(() => ws.candidates, [ws.candidates]);

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
    <main data-testid="pheno-workspace" className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
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
        <div className="grid gap-4 md:grid-cols-2">
          {candidates.map((c) => (
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
            />
          ))}
        </div>
      )}
    </main>
  );
}
