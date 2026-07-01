/**
 * One-Tent Loop Live Proof — read-only operator page.
 *
 * Route: /one-tent-loop-proof
 *
 * Composes existing read-only hooks and passes derived evidence into the
 * pure `buildOneTentLoopLiveProofView`. Renders per-step rows with clear
 * status badges, missing-info flags, safety notes, and safe deep links.
 *
 * Hard rules for this presenter:
 *  - Read-only. No forms, no writes, no imports, no device controls.
 *  - No fetch / XHR / Supabase writes / model calls / device commands.
 *    (All queries used are pre-existing read-only hooks under RLS.)
 *  - Never labels missing / stale / invalid / unknown / demo-only as healthy.
 *  - Never renders raw payloads, tokens, bridge secrets, or service keys.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useGrows } from "@/store/grows";
import { useTents } from "@/hooks/use-tents";
import { usePlants } from "@/hooks/use-plants";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { useAlertsList } from "@/hooks/useAlertsList";
import { useAiDoctorSessions } from "@/hooks/use-ai-doctor-sessions";
import { usePlantAssignedTentActions } from "@/hooks/usePlantAssignedTentActions";
import {
  buildOneTentLoopLiveProofView,
  buildOneTentLoopLiveProofTextReport,
  type LiveProofView,
} from "@/lib/oneTentLoopLiveProofViewModel";
import type {
  ActionQueueEvidence,
  AiDoctorEvidence,
  AlertEvidence,
  EvidenceProvenance,
  EvidenceRef,
  FollowUpEvidence,
  GrowEvidence,
  LoopEvidence,
  LoopStepRow,
  LoopStepStatus,
  MissingEvidenceDrilldown,
  PlantEvidence,
  QuickLogEvidence,
  SensorSnapshotEvidence,
  SensorSourceLabel,
  TentEvidence,
  TimelineEvidence,
} from "@/lib/oneTentLoopProofRules";

const STATUS_LABEL: Record<LoopStepStatus, string> = {
  passed: "Passed",
  needs_review: "Needs review",
  missing: "Missing evidence",
  blocked: "Blocked",
  stale: "Stale reading",
  invalid: "Invalid telemetry",
  demo_only: "Demo data only",
};

function statusToneClass(status: LoopStepStatus): string {
  // Deliberately avoid green success tones for non-live/untrusted rows.
  switch (status) {
    case "passed":
      return "bg-muted text-foreground border-border";
    case "needs_review":
      return "bg-muted text-foreground border-border";
    case "missing":
      return "bg-muted text-muted-foreground border-border";
    case "blocked":
      return "bg-destructive/10 text-destructive border-destructive/40";
    case "stale":
      return "bg-muted text-muted-foreground border-border";
    case "invalid":
      return "bg-destructive/10 text-destructive border-destructive/40";
    case "demo_only":
      return "bg-muted text-muted-foreground border-border";
  }
}

function mapSnapshotSourceToLabel(
  source: string | null | undefined,
): SensorSourceLabel | null {
  switch (source) {
    case "live":
      return "live";
    case "manual":
    case "diary":
      return "manual";
    case "csv":
      return "csv";
    case "sim":
      return "demo";
    case "unavailable":
    case null:
    case undefined:
      return null;
    default:
      return "invalid";
  }
}

function StatusBadge({ status }: { status: LoopStepStatus }) {
  return (
    <span
      data-testid={`loop-live-proof-status-${status}`}
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${statusToneClass(status)}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function BulletList({
  items,
  emptyMessage,
  testId,
}: {
  items: readonly string[];
  emptyMessage: string;
  testId: string;
}) {
  if (!items || items.length === 0) {
    return (
      <p
        data-testid={`${testId}-empty`}
        className="text-xs italic text-muted-foreground"
      >
        {emptyMessage}
      </p>
    );
  }
  return (
    <ul
      data-testid={testId}
      className="list-disc space-y-1 pl-5 text-sm text-foreground"
    >
      {items.map((item, i) => (
        <li key={`${testId}-${i}`}>{item}</li>
      ))}
    </ul>
  );
}

function StepCard({ step }: { step: LoopStepRow }) {
  return (
    <section
      data-testid={`loop-live-proof-step-${step.id}`}
      data-status={step.status}
      className="space-y-2 rounded-md border border-border bg-card p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{step.label}</h3>
        <StatusBadge status={step.status} />
      </header>

      {step.source ? (
        <p
          data-testid={`loop-live-proof-step-${step.id}-source`}
          className="text-xs text-muted-foreground"
        >
          Source: {step.source}
        </p>
      ) : null}

      <p className="text-xs font-medium text-muted-foreground">Evidence</p>
      <BulletList
        items={step.evidence}
        emptyMessage="No evidence recorded."
        testId={`loop-live-proof-step-${step.id}-evidence`}
      />

      <p className="text-xs font-medium text-muted-foreground">
        Missing information
      </p>
      <BulletList
        items={step.missing_info}
        emptyMessage="No missing information."
        testId={`loop-live-proof-step-${step.id}-missing`}
      />

      <p
        data-testid={`loop-live-proof-step-${step.id}-safety`}
        className="text-xs text-muted-foreground"
      >
        Safety note: {step.safety_note}
      </p>

      {step.deep_link ? (
        <p className="text-xs">
          <Link
            data-testid={`loop-live-proof-step-${step.id}-link`}
            to={step.deep_link}
            className="underline text-foreground"
          >
            Open related page
          </Link>
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Evidence composer — bounded to shapes we can trust from existing hooks.
// ---------------------------------------------------------------------------

interface AnyRow {
  [k: string]: unknown;
}

function firstBy<T extends AnyRow>(
  rows: readonly T[] | undefined,
  pred: (r: T) => boolean,
): T | null {
  if (!rows || rows.length === 0) return null;
  return rows.find(pred) ?? null;
}

function toGrowEvidence(g: AnyRow | null): GrowEvidence | null {
  if (!g || typeof g.id !== "string") return null;
  return {
    id: g.id,
    name: typeof g.name === "string" ? g.name : null,
    stage: typeof g.stage === "string" ? g.stage : null,
    status: typeof g.status === "string" ? g.status : null,
  };
}

function toTentEvidence(t: AnyRow | null): TentEvidence | null {
  if (!t || typeof t.id !== "string") return null;
  const hasTarget = Boolean(
    (t as { target_temp_c?: unknown }).target_temp_c ||
      (t as { target_rh?: unknown }).target_rh ||
      (t as { target_vpd?: unknown }).target_vpd,
  );
  return {
    id: t.id,
    name: typeof t.name === "string" ? t.name : null,
    grow_id: typeof t.grow_id === "string" ? t.grow_id : null,
    has_environment_target: hasTarget,
  };
}

function toPlantEvidence(p: AnyRow | null): PlantEvidence | null {
  if (!p || typeof p.id !== "string") return null;
  return {
    id: p.id,
    name: typeof p.name === "string" ? p.name : null,
    stage: typeof p.stage === "string" ? p.stage : null,
    medium: typeof p.medium === "string" ? p.medium : null,
    pot_size:
      typeof p.pot_size === "string"
        ? p.pot_size
        : typeof p.pot_size_l === "number"
          ? `${p.pot_size_l} L`
          : null,
    tent_id: typeof p.tent_id === "string" ? p.tent_id : null,
  };
}

function toQuickLogEvidence(d: AnyRow | null): QuickLogEvidence | null {
  if (!d || typeof d.id !== "string") return null;
  const details = (d.details ?? {}) as AnyRow;
  return {
    id: d.id,
    entry_at:
      typeof d.entry_at === "string"
        ? d.entry_at
        : typeof d.created_at === "string"
          ? d.created_at
          : null,
    entry_type:
      typeof details.event_type === "string"
        ? details.event_type
        : typeof d.entry_type === "string"
          ? d.entry_type
          : null,
    has_note: typeof d.note === "string" && d.note.length > 0,
    has_photo: Array.isArray(d.photos) && d.photos.length > 0,
    has_action_context:
      Boolean(details.action_id) || Boolean(details.linked_action_id),
    plant_id: typeof d.plant_id === "string" ? d.plant_id : null,
    tent_id: typeof d.tent_id === "string" ? d.tent_id : null,
  };
}

export default function OneTentLoopLiveProof(): JSX.Element {
  const { activeGrow, activeGrowId } = useGrows();
  const tentsQ = useTents();
  const plantsQ = usePlants();
  const diaryQ = useDiaryEntries();
  const alertsQ = useAlertsList({ growId: activeGrowId ?? undefined });

  // Derive scoped tent/plant.
  const grow = toGrowEvidence(activeGrow as AnyRow | null);
  const tents = (tentsQ.data ?? []) as AnyRow[];
  const scopedTent = firstBy(tents, (t) => t.grow_id === (grow?.id ?? "__none__"));
  const tent = toTentEvidence(scopedTent);

  const plants = (plantsQ.data ?? []) as AnyRow[];
  const scopedPlant = firstBy(plants, (p) => p.tent_id === (tent?.id ?? "__none__"));
  const plant = toPlantEvidence(scopedPlant);

  const diary = (diaryQ.data ?? []) as AnyRow[];
  const scopedDiary = firstBy(
    diary,
    (d) => (plant ? d.plant_id === plant.id : d.tent_id === (tent?.id ?? "__none__")),
  );
  const latest_quick_log = toQuickLogEvidence(scopedDiary);

  const timeline: TimelineEvidence | null =
    diary.length > 0
      ? {
          event_count: diary.length,
          latest_entry_id: latest_quick_log?.id ?? null,
          linked_directly: Boolean(latest_quick_log),
        }
      : null;

  const snapState = useLatestSensorSnapshot(
    grow?.id ?? null,
    tent ? [tent.id] : [],
  );
  const snapSourceLabel = mapSnapshotSourceToLabel(snapState.snapshot.source);
  const latest_sensor_snapshot: SensorSnapshotEvidence | null = snapSourceLabel
    ? {
        source: snapSourceLabel,
        captured_at: snapState.snapshot.ts ?? null,
        confidence: null,
        metric: null,
      }
    : null;

  const aiSessionsQ = useAiDoctorSessions(plant?.id ?? null);
  const latestSession = (aiSessionsQ.data ?? [])[0] ?? null;
  const latest_ai_doctor: AiDoctorEvidence | null = latestSession
    ? {
        session_id: latestSession.id,
        created_at: latestSession.created_at ?? null,
        had_plant_stage: Boolean(plant?.stage),
        had_medium: Boolean(plant?.medium),
        had_pot_size: Boolean(plant?.pot_size),
        had_recent_log: Boolean(latest_quick_log),
        had_recent_photo: Boolean(latest_quick_log?.has_photo),
        had_recent_sensor_snapshot: Boolean(latest_sensor_snapshot),
        had_alerts: (alertsQ.alerts?.length ?? 0) > 0,
      }
    : null;

  const alertRow = alertsQ.alerts?.[0] ?? null;
  const latest_alert: AlertEvidence | null = alertRow
    ? {
        id: alertRow.id,
        metric: alertRow.metric ?? null,
        severity: alertRow.severity ?? null,
        reason: alertRow.reason ?? null,
        status: alertRow.status ?? null,
        created_at: alertRow.created_at ?? null,
      }
    : null;

  const aqQ = usePlantAssignedTentActions(
    tent?.id ?? null,
    grow?.id ?? null,
  );
  const aqRow = (aqQ.rows ?? [])[0] ?? null;
  const latest_action_queue: ActionQueueEvidence | null = aqRow
    ? {
        id: aqRow.id,
        status: aqRow.status ?? "pending_approval",
        approval_required: true,
        has_device_command: false,
        reason: aqRow.reason ?? null,
        risk_level: (aqRow as { riskLevel?: string | null }).riskLevel ?? null,
        linked_alert_id: null,
      }
    : null;

  const latest_follow_up: FollowUpEvidence | null = null;

  const evidence: LoopEvidence = {
    grow,
    tent,
    plant,
    latest_quick_log,
    timeline,
    latest_sensor_snapshot,
    latest_ai_doctor,
    latest_alert,
    latest_action_queue,
    latest_follow_up,
  };

  const view: LiveProofView = React.useMemo(
    () => buildOneTentLoopLiveProofView(evidence),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(evidence)],
  );

  const report = React.useMemo(
    () => buildOneTentLoopLiveProofTextReport(view),
    [view],
  );

  return (
    <div
      data-testid="one-tent-loop-live-proof-page"
      className="mx-auto max-w-3xl space-y-6 p-4 text-foreground"
    >
      <header className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
        <h1 className="text-lg font-semibold">{view.title}</h1>
        <p
          data-testid="one-tent-loop-live-proof-banner"
          role="note"
          className="text-sm text-muted-foreground"
        >
          {view.banner}
        </p>
        <p
          data-testid="one-tent-loop-live-proof-counts"
          className="text-xs text-muted-foreground"
        >
          Passed: {view.counts.passed} · Needs review: {view.counts.needs_review} ·
          Missing: {view.counts.missing} · Blocked: {view.counts.blocked} ·
          Stale: {view.counts.stale} · Invalid: {view.counts.invalid} ·
          Demo only: {view.counts.demo_only}
        </p>
      </header>

      <section
        data-testid="one-tent-loop-live-proof-steps"
        className="space-y-4"
        aria-label="One-Tent Loop steps"
      >
        {view.steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </section>

      <section
        data-testid="one-tent-loop-live-proof-safety-summary"
        className="space-y-2 rounded-md border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Safety summary</h2>
        <BulletList
          items={view.safety_summary}
          emptyMessage="No safety notes."
          testId="one-tent-loop-live-proof-safety-list"
        />
      </section>

      <section
        data-testid="one-tent-loop-live-proof-report"
        className="space-y-2 rounded-md border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Copyable proof summary</h2>
        <pre
          data-testid="one-tent-loop-live-proof-report-text"
          className="whitespace-pre-wrap break-words text-xs text-muted-foreground"
        >
          {report}
        </pre>
      </section>
    </div>
  );
}
