/**
 * EcoWitt Live Bring-Up — operator-only page.
 *
 * Renders the deterministic EcowittLiveBringupViewModel and a local-only
 * Live Evidence Evaluator that runs evaluateLiveSourceTruth on operator-
 * entered form state. Does NOT query sensors, call Supabase, write data,
 * call models, control devices, or create alerts or Action Queue items.
 */
import * as React from "react";
import {
  buildEcowittLiveBringupViewModel,
  type EcowittBringupStep,
  type EcowittBringupCommand,
  type EcowittEvidenceField,
  type EcowittGoNoGoRule,
} from "@/lib/ecowittLiveBringupViewModel";
import {
  evaluateLiveSourceTruth,
  type LiveSourceTruthGateResult,
  type LiveSourceTruthMetricKey,
} from "@/lib/liveSourceTruthGateRules";
import {
  buildLiveSourceTruthEvidenceFromForm,
  createInitialEcowittLiveEvidenceFormState,
  ECOWITT_FORM_METRIC_KEYS,
  ECOWITT_FORM_SOURCE_OPTIONS,
  type EcowittLiveEvidenceFormState,
  type EcowittLiveEvidenceMetricRow,
} from "@/lib/ecowittLiveEvidenceFormRules";
import {
  ECOWITT_LIVE_EVIDENCE_TEMPLATES,
  type EcowittLiveEvidenceTemplateId,
} from "@/lib/ecowittLiveEvidenceTemplates";
import {
  detectEcowittEvidenceUnitWarnings,
  type EcowittEvidenceUnitWarning,
} from "@/lib/ecowittLiveEvidenceUnitWarningRules";
import { evaluateLiveEvidenceForPlants } from "@/lib/ecowittLiveEvidenceMultiPlantRules";
import {
  buildEcowittLiveEvidenceSnapshotExport,
  buildEcowittLiveEvidenceSnapshotFilename,
  serializeEcowittLiveEvidenceSnapshotExport,
} from "@/lib/ecowittLiveEvidenceExportRules";
import {
  buildEcowittTonightModeViewModel,
  type EcowittTonightModeViewModel,
} from "@/lib/ecowittTonightModeViewModel";




function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={`ecowitt-bringup-section-${id}`}
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function StepCard({ step }: { step: EcowittBringupStep }) {
  return (
    <article
      data-testid={`ecowitt-bringup-step-${step.id}`}
      className="space-y-2 rounded-md border border-border bg-background p-3 text-sm"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{step.label}</h3>
        <span
          data-testid={`ecowitt-bringup-step-${step.id}-status`}
          className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground"
        >
          Status: {step.status}
        </span>
      </header>
      <dl className="space-y-1">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Operator action
          </dt>
          <dd>{step.operator_action}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Expected evidence
          </dt>
          <dd>{step.expected_evidence}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Success criteria
          </dt>
          <dd>{step.success_criteria}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Blocked if
          </dt>
          <dd>{step.blocked_if}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Safety notes
          </dt>
          <dd>{step.safety_notes}</dd>
        </div>
      </dl>
    </article>
  );
}

function CommandCard({ cmd }: { cmd: EcowittBringupCommand }) {
  return (
    <article
      data-testid={`ecowitt-bringup-command-${cmd.id}`}
      className="space-y-2 rounded-md border border-border bg-background p-3 text-sm"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{cmd.label}</h3>
        <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {cmd.environment}
        </span>
      </header>
      <pre
        data-testid={`ecowitt-bringup-command-${cmd.id}-text`}
        className="overflow-x-auto rounded bg-muted/40 p-2 text-xs"
      >
        <code>{cmd.command}</code>
      </pre>
      <p className="text-foreground">{cmd.purpose}</p>
      <p className="text-xs text-muted-foreground">{cmd.safety_note}</p>
    </article>
  );
}

function EvidenceCard({ field }: { field: EcowittEvidenceField }) {
  return (
    <article
      data-testid={`ecowitt-bringup-evidence-${field.id}`}
      className="space-y-1 rounded-md border border-border bg-background p-3 text-sm"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{field.label}</h3>
        {field.required_for_ready ? (
          <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
            Required for READY
          </span>
        ) : (
          <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
            Optional
          </span>
        )}
      </header>
      <p className="text-xs text-muted-foreground">
        Example: <code>{field.example}</code>
      </p>
      <p>{field.why_it_matters}</p>
    </article>
  );
}

function GoNoGoCard({ rule }: { rule: EcowittGoNoGoRule }) {
  return (
    <article
      data-testid={`ecowitt-bringup-go-no-go-${rule.id}`}
      className="space-y-2 rounded-md border border-border bg-background p-3 text-sm"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{rule.label}</h3>
        <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
          Status: {rule.status}
        </span>
      </header>
      <ul
        data-testid={`ecowitt-bringup-go-no-go-${rule.id}-criteria`}
        className="list-disc space-y-1 pl-5"
      >
        {rule.criteria.map((c, i) => (
          <li key={`${rule.id}-c-${i}`}>{c}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Operator decision: {rule.operator_decision}
      </p>
    </article>
  );
}

// ============================================================
// Local-only Live Evidence Evaluator
// ============================================================

function MetricRowEditor({
  row,
  onChange,
  unitWarnings,
}: {
  row: EcowittLiveEvidenceMetricRow;
  onChange: (next: EcowittLiveEvidenceMetricRow) => void;
  unitWarnings: readonly EcowittEvidenceUnitWarning[];
}) {
  const tid = `ecowitt-evaluator-metric-${row.key}`;
  const rowWarnings = unitWarnings.filter((w) => w.metric_key === row.key);
  return (
    <div
      data-testid={tid}
      className="grid gap-2 rounded-md border border-border bg-background p-2 text-xs sm:grid-cols-8"
    >
      <label className="flex items-center gap-1 sm:col-span-1">
        <input
          type="checkbox"
          data-testid={`${tid}-enabled`}
          checked={row.enabled}
          onChange={(e) => onChange({ ...row, enabled: e.target.checked })}
        />
        <span className="font-mono">{row.key}</span>
      </label>
      <label className="flex flex-col sm:col-span-1">
        <span className="text-muted-foreground">backend</span>
        <input
          type="text"
          inputMode="decimal"
          data-testid={`${tid}-backend`}
          value={row.backend_value}
          onChange={(e) =>
            onChange({ ...row, backend_value: e.target.value })
          }
          className="rounded border border-border bg-background px-1 py-0.5"
        />
      </label>
      <label className="flex flex-col sm:col-span-1">
        <span className="text-muted-foreground">backend unit</span>
        <input
          type="text"
          data-testid={`${tid}-backend-unit`}
          value={row.backend_unit ?? ""}
          onChange={(e) =>
            onChange({ ...row, backend_unit: e.target.value })
          }
          className="rounded border border-border bg-background px-1 py-0.5"
        />
      </label>
      <label className="flex flex-col sm:col-span-1">
        <span className="text-muted-foreground">controller</span>
        <input
          type="text"
          inputMode="decimal"
          data-testid={`${tid}-controller`}
          value={row.controller_value}
          onChange={(e) =>
            onChange({ ...row, controller_value: e.target.value })
          }
          className="rounded border border-border bg-background px-1 py-0.5"
        />
      </label>
      <label className="flex flex-col sm:col-span-1">
        <span className="text-muted-foreground">controller unit</span>
        <input
          type="text"
          data-testid={`${tid}-controller-unit`}
          value={row.controller_unit ?? ""}
          onChange={(e) =>
            onChange({ ...row, controller_unit: e.target.value })
          }
          className="rounded border border-border bg-background px-1 py-0.5"
        />
      </label>
      <label className="flex flex-col sm:col-span-1">
        <span className="text-muted-foreground">shared unit</span>
        <input
          type="text"
          data-testid={`${tid}-unit`}
          value={row.unit}
          onChange={(e) => onChange({ ...row, unit: e.target.value })}
          className="rounded border border-border bg-background px-1 py-0.5"
        />
      </label>
      <label className="flex flex-col sm:col-span-2">
        <span className="text-muted-foreground">
          tolerance override (blank = default)
        </span>
        <input
          type="text"
          inputMode="decimal"
          data-testid={`${tid}-tolerance`}
          value={row.tolerance}
          onChange={(e) => onChange({ ...row, tolerance: e.target.value })}
          className="rounded border border-border bg-background px-1 py-0.5"
        />
      </label>
      {rowWarnings.length > 0 ? (
        <ul
          data-testid={`${tid}-unit-warnings`}
          className="sm:col-span-8 list-disc pl-5 text-amber-600"
        >
          {rowWarnings.map((w, i) => (
            <li key={`uw-${row.key}-${i}`}>
              [{w.severity}] {w.message} {w.operator_fix}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}


function VerdictCard({
  result,
  formWarnings,
}: {
  result: LiveSourceTruthGateResult;
  formWarnings: readonly string[];
}) {
  const nextSteps =
    result.required_next_steps.length > 0
      ? result.required_next_steps
      : [
          "No next steps returned by the evaluator. Recheck evidence before treating data as live.",
        ];
  return (
    <div
      data-testid="ecowitt-evaluator-verdict-card"
      className="space-y-3 rounded-md border border-border bg-background p-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="ecowitt-evaluator-verdict"
          className="rounded border border-border px-2 py-0.5 text-xs font-mono"
        >
          verdict: {result.verdict}
        </span>
        <span
          data-testid="ecowitt-evaluator-is-live-proof"
          className="rounded border border-border px-2 py-0.5 text-xs"
        >
          is_live_proof: {String(result.is_live_proof)}
        </span>
        <span
          data-testid="ecowitt-evaluator-confidence"
          className="rounded border border-border px-2 py-0.5 text-xs"
        >
          confidence: {result.confidence_label}
        </span>
      </div>
      <p data-testid="ecowitt-evaluator-summary">{result.summary}</p>

      <div>
        <h4 className="text-xs uppercase text-muted-foreground">
          Required next steps
        </h4>
        <ul
          data-testid="ecowitt-evaluator-next-steps"
          className="list-disc space-y-1 pl-5"
        >
          {nextSteps.map((s, i) => (
            <li key={`next-${i}`}>{s}</li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-xs uppercase text-muted-foreground">Limitations</h4>
        <ul
          data-testid="ecowitt-evaluator-limitations"
          className="list-disc space-y-1 pl-5"
        >
          {result.limitations.length === 0 ? (
            <li>No limitations reported.</li>
          ) : (
            result.limitations.map((s, i) => <li key={`lim-${i}`}>{s}</li>)
          )}
        </ul>
      </div>

      <div>
        <h4 className="text-xs uppercase text-muted-foreground">Warnings</h4>
        <ul
          data-testid="ecowitt-evaluator-warnings"
          className="list-disc space-y-1 pl-5"
        >
          {result.warnings.length === 0 && formWarnings.length === 0 ? (
            <li>No warnings reported.</li>
          ) : (
            <>
              {result.warnings.map((s, i) => (
                <li key={`w-${i}`}>{s}</li>
              ))}
              {formWarnings.map((s, i) => (
                <li key={`fw-${i}`}>{s}</li>
              ))}
            </>
          )}
        </ul>
      </div>
    </div>
  );
}

function TonightModePanel({ vm }: { vm: EcowittTonightModeViewModel }) {
  return (
    <section
      data-testid="ecowitt-tonight-mode"
      className="space-y-2 rounded-md border border-border bg-background p-3 text-sm"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Tonight Mode</h3>
        <span
          data-testid="ecowitt-tonight-mode-status"
          className="rounded border border-border px-2 py-0.5 text-xs font-mono"
        >
          status: {vm.status}
        </span>
        <span
          data-testid="ecowitt-tonight-mode-can-export"
          className="rounded border border-border px-2 py-0.5 text-xs"
        >
          can_export_snapshot: {String(vm.can_export_snapshot)}
        </span>
        <span
          data-testid="ecowitt-tonight-mode-can-claim-live"
          className="rounded border border-border px-2 py-0.5 text-xs"
        >
          can_claim_live_proof: {String(vm.can_claim_live_proof)}
        </span>
      </header>
      <p
        data-testid="ecowitt-tonight-mode-headline"
        className="text-sm font-medium"
      >
        {vm.headline}
      </p>
      <p
        data-testid="ecowitt-tonight-mode-summary"
        className="text-xs text-muted-foreground"
      >
        {vm.summary}
      </p>
      <div>
        <h4 className="text-xs uppercase text-muted-foreground">
          Top blockers
        </h4>
        <ul
          data-testid="ecowitt-tonight-mode-top-blockers"
          className="list-disc space-y-1 pl-5 text-xs"
        >
          {vm.top_blockers.length === 0 ? (
            <li>No blockers detected.</li>
          ) : (
            vm.top_blockers.map((b, i) => (
              <li key={`tm-b-${i}`}>{b}</li>
            ))
          )}
        </ul>
      </div>
      <p
        data-testid="ecowitt-tonight-mode-next-best-action"
        className="rounded border border-border bg-muted/40 p-2 text-xs"
      >
        Next: {vm.next_best_action}
      </p>
      <div>
        <h4 className="text-xs uppercase text-muted-foreground">Checklist</h4>
        <ul
          data-testid="ecowitt-tonight-mode-checklist"
          className="space-y-1 text-xs"
        >
          {vm.checklist_items.map((item) => (
            <li
              key={item.id}
              data-testid={`ecowitt-tonight-mode-checklist-item-${item.id}`}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="font-mono">{item.label}</span>
              <span
                data-testid={`ecowitt-tonight-mode-checklist-item-${item.id}-status`}
                className="rounded border border-border px-2 py-0.5"
              >
                {item.status}
              </span>
              <span className="basis-full text-muted-foreground">
                {item.helper}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p
        data-testid="ecowitt-tonight-mode-safety-note"
        className="text-xs text-muted-foreground"
      >
        {vm.safety_note}
      </p>
    </section>
  );
}

function LiveEvidenceEvaluator() {

  const [form, setForm] = React.useState<EcowittLiveEvidenceFormState>(() =>
    createInitialEcowittLiveEvidenceFormState(),
  );
  const [plantIdsInput, setPlantIdsInput] = React.useState<string>("");
  const [evaluated, setEvaluated] = React.useState<boolean>(false);

  const built = React.useMemo(
    () => buildLiveSourceTruthEvidenceFromForm(form),
    [form],
  );
  const result = React.useMemo(
    () => evaluateLiveSourceTruth(built.evidence),
    [built.evidence],
  );
  const unitWarnings = React.useMemo(
    () => detectEcowittEvidenceUnitWarnings(form.metric_rows),
    [form.metric_rows],
  );
  const multi = React.useMemo(
    () => evaluateLiveEvidenceForPlants({ formState: form, plantIdsInput }),
    [form, plantIdsInput],
  );

  const tonight = React.useMemo<EcowittTonightModeViewModel>(
    () =>
      buildEcowittTonightModeViewModel({
        evaluator_result: evaluated ? result : null,
        overall_verdict: evaluated ? multi.overall_verdict : null,
        plant_results: evaluated ? multi.per_plant : null,
        unit_warnings: unitWarnings,
        form_warnings: built.form_warnings,
        required_next_steps: evaluated ? multi.combined_next_steps : null,
        export_ready: evaluated,
        snapshot_exported: false,
      }),
    [evaluated, result, multi, unitWarnings, built.form_warnings],
  );


  const updateMetric = (key: LiveSourceTruthMetricKey) =>
    (next: EcowittLiveEvidenceMetricRow) =>
      setForm((prev) => ({
        ...prev,
        metric_rows: prev.metric_rows.map((r) => (r.key === key ? next : r)),
      }));

  const applyTemplate = (id: EcowittLiveEvidenceTemplateId) => {
    const t = ECOWITT_LIVE_EVIDENCE_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setForm(t.build());
  };

  return (
    <Section id="live-evidence-evaluator" title="Live Evidence Evaluator">
      <TonightModePanel vm={tonight} />
      <p
        data-testid="ecowitt-evaluator-helper"
        className="text-xs text-muted-foreground"
      >
        Enter evidence from the EcoWitt app/controller, MQTT payload, and
        backend response. This evaluator runs locally in the browser and does
        not query sensors or write data.
      </p>


      <div
        data-testid="ecowitt-evaluator-templates"
        className="space-y-2 rounded-md border border-border bg-background p-3"
      >
        <h3 className="text-sm font-semibold">Quick-fill templates</h3>
        <p
          data-testid="ecowitt-evaluator-templates-helper"
          className="text-xs text-muted-foreground"
        >
          Templates are local examples for faster testing. Replace example
          values with tonight's real EcoWitt/MQTT/backend evidence before
          treating any result as useful.
        </p>
        <div className="flex flex-wrap gap-2">
          {ECOWITT_LIVE_EVIDENCE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`ecowitt-evaluator-template-${t.id}`}
              onClick={() => applyTemplate(t.id)}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              title={t.description}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col text-xs">
          <span className="text-muted-foreground">source</span>
          <select
            data-testid="ecowitt-evaluator-source"
            value={form.source}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, source: e.target.value }))
            }
            className="rounded border border-border bg-background px-1 py-0.5"
          >
            {ECOWITT_FORM_SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-muted-foreground">tent_id</span>
          <input
            type="text"
            data-testid="ecowitt-evaluator-tent-id"
            value={form.tent_id}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, tent_id: e.target.value }))
            }
            className="rounded border border-border bg-background px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-muted-foreground">plant_id (optional)</span>
          <input
            type="text"
            data-testid="ecowitt-evaluator-plant-id"
            value={form.plant_id}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, plant_id: e.target.value }))
            }
            className="rounded border border-border bg-background px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-muted-foreground">captured_at (ISO)</span>
          <input
            type="text"
            data-testid="ecowitt-evaluator-captured-at"
            value={form.captured_at}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, captured_at: e.target.value }))
            }
            className="rounded border border-border bg-background px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-muted-foreground">now (ISO)</span>
          <input
            type="text"
            data-testid="ecowitt-evaluator-now"
            value={form.now}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, now: e.target.value }))
            }
            className="rounded border border-border bg-background px-1 py-0.5"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="ecowitt-evaluator-raw-payload"
            checked={form.raw_payload_present}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                raw_payload_present: e.target.checked,
              }))
            }
          />
          raw_payload_present
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="ecowitt-evaluator-normalized-payload"
            checked={form.normalized_payload_present}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                normalized_payload_present: e.target.checked,
              }))
            }
          />
          normalized_payload_present
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="ecowitt-evaluator-operator-compared"
            checked={form.operator_compared_controller}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                operator_compared_controller: e.target.checked,
              }))
            }
          />
          operator_compared_controller
        </label>
      </div>

      <label className="flex flex-col text-xs">
        <span className="text-muted-foreground">
          plant_id entries (comma or newline-separated)
        </span>
        <textarea
          data-testid="ecowitt-evaluator-plant-ids"
          value={plantIdsInput}
          onChange={(e) => setPlantIdsInput(e.target.value)}
          rows={3}
          className="rounded border border-border bg-background px-1 py-0.5 font-mono"
        />
        <span
          data-testid="ecowitt-evaluator-plant-ids-helper"
          className="text-muted-foreground"
        >
          EcoWitt evidence is usually tent-level. Per-plant verdicts reuse the
          same tent evidence and should not be treated as plant-specific
          sensor proof.
        </span>
      </label>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Metrics</h3>
        {ECOWITT_FORM_METRIC_KEYS.map((key) => {
          const row = form.metric_rows.find((r) => r.key === key)!;
          return (
            <MetricRowEditor
              key={key}
              row={row}
              onChange={updateMetric(key)}
              unitWarnings={unitWarnings}
            />
          );
        })}
      </div>

      {unitWarnings.length > 0 ? (
        <div
          data-testid="ecowitt-evaluator-unit-warnings"
          className="rounded-md border border-amber-500 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <h4 className="text-xs font-semibold uppercase">Unit warnings</h4>
          <ul className="list-disc pl-5">
            {unitWarnings.map((w, i) => (
              <li key={`uw-${i}`}>
                [{w.severity}] {w.metric_key}: {w.message} {w.operator_fix}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        data-testid="ecowitt-evaluator-evaluate-button"
        onClick={() => setEvaluated(true)}
        className="rounded border border-border bg-background px-3 py-1 text-sm"
      >
        Evaluate evidence
      </button>

      {!evaluated ? (
        <p
          data-testid="ecowitt-evaluator-empty-state"
          className="rounded border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          No evaluation yet. Enter evidence above and choose Evaluate evidence
          to see a local verdict. Default state must not be treated as live.
        </p>
      ) : (
        <>
          <VerdictCard
            result={result}
            formWarnings={built.form_warnings}
          />

          <div
            data-testid="ecowitt-evaluator-overall-summary"
            className="rounded-md border border-border bg-background p-3 text-sm"
          >
            <h4 className="text-xs uppercase text-muted-foreground">
              Overall summary (multi-plant)
            </h4>
            <div className="flex flex-wrap gap-2 text-xs">
              <span
                data-testid="ecowitt-evaluator-overall-verdict"
                className="rounded border border-border px-2 py-0.5 font-mono"
              >
                overall: {multi.overall_verdict}
              </span>
              <span className="rounded border border-border px-2 py-0.5">
                is_live_proof: {String(multi.overall_is_live_proof)}
              </span>
            </div>
            <p className="mt-1">{multi.overall_summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">{multi.note}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Overall summary uses the most conservative per-plant verdict.
            </p>
          </div>

          <div
            data-testid="ecowitt-evaluator-per-plant"
            className="rounded-md border border-border bg-background p-3 text-sm"
          >
            <h4 className="text-xs uppercase text-muted-foreground">
              Per-plant verdicts
            </h4>
            <ul className="space-y-1">
              {multi.per_plant.map((p, i) => (
                <li
                  key={`pp-${i}`}
                  data-testid={`ecowitt-evaluator-per-plant-row-${i}`}
                  className="flex flex-wrap gap-2 text-xs"
                >
                  <span className="font-mono">
                    {p.plant_id ?? "Tent-level evidence"}
                  </span>
                  <span>verdict: {p.result.verdict}</span>
                  <span>confidence: {p.result.confidence_label}</span>
                  <span>is_live_proof: {String(p.result.is_live_proof)}</span>
                  <span>
                    limitations: {p.result.limitations.length} | warnings:{" "}
                    {p.result.warnings.length}
                  </span>
                  <span className="basis-full">{p.result.summary}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            data-testid="ecowitt-evaluator-combined-next-steps"
            className="rounded-md border border-border bg-background p-3 text-sm"
          >
            <h4 className="text-xs uppercase text-muted-foreground">
              Required next steps (combined)
            </h4>
            <ul className="list-disc pl-5">
              {multi.combined_next_steps.length === 0 ? (
                <li>No next steps. Recheck evidence before treating as live.</li>
              ) : (
                multi.combined_next_steps.map((s, i) => (
                  <li key={`cns-${i}`}>{s}</li>
                ))
              )}
            </ul>
          </div>

          <div
            data-testid="ecowitt-evaluator-status-card"
            className="rounded-md border border-border bg-background p-3 text-sm"
          >
            <h4 className="text-xs uppercase text-muted-foreground">
              Evaluator verdict
            </h4>
            <p
              data-testid="ecowitt-evaluator-status-message"
              className="text-sm"
            >
              {result.verdict === "verified_live"
                ? "Local evaluator says the submitted evidence can support live proof. Confirm screenshots/notes before marking the bring-up ready."
                : "Submitted evidence does not prove live sensor truth yet."}
            </p>
          </div>

          <details
            data-testid="ecowitt-evaluator-live-evidence-details"
            className="rounded-md border border-border bg-background p-3 text-xs"
          >
            <summary className="cursor-pointer text-sm font-semibold">
              Live Evidence
            </summary>
            <div className="mt-2 space-y-2">
              {result.metric_results.length === 0 ? (
                <p className="text-muted-foreground">
                  No metric rows submitted.
                </p>
              ) : (
                result.metric_results.map((m) => {
                  const row = form.metric_rows.find((r) => r.key === m.key);
                  const backendUnit =
                    (row?.backend_unit ?? "").trim() || (row?.unit ?? "");
                  const controllerUnit =
                    (row?.controller_unit ?? "").trim() || (row?.unit ?? "");
                  const overridden =
                    row != null && row.tolerance.trim().length > 0;
                  const rowWarnings = unitWarnings.filter(
                    (w) => w.metric_key === m.key,
                  );
                  return (
                    <div
                      key={`mr-${m.key}`}
                      data-testid={`ecowitt-evaluator-metric-result-${m.key}`}
                      className="rounded border border-border bg-background p-2"
                    >
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="font-mono">{m.key}</span>
                        <span>status: {m.status}</span>
                        <span>
                          backend: {String(m.backend_value ?? "—")}
                          {backendUnit ? ` ${backendUnit}` : ""}
                        </span>
                        <span>
                          controller: {String(m.controller_value ?? "—")}
                          {controllerUnit ? ` ${controllerUnit}` : ""}
                        </span>
                        <span>difference: {String(m.difference ?? "—")}</span>
                        <span>
                          tolerance: {String(m.tolerance ?? "—")}
                          {overridden ? " (overridden)" : " (default)"}
                        </span>
                      </div>
                      <p className="mt-1">{m.message}</p>
                      {rowWarnings.length > 0 ? (
                        <ul className="mt-1 list-disc pl-5 text-amber-600">
                          {rowWarnings.map((w, i) => (
                            <li key={`mrw-${m.key}-${i}`}>
                              [{w.severity}] {w.message} {w.operator_fix}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })
              )}
              {result.warnings.length > 0 ? (
                <ul className="list-disc pl-5">
                  {result.warnings.map((w, i) => (
                    <li key={`dw-${i}`}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </>
      )}

      <SnapshotExportPanel
        evaluated={evaluated}
        form={form}
        tonight={tonight}
        overall={result}
        plantResults={multi.per_plant}
        unitWarnings={unitWarnings}
        formWarnings={built.form_warnings}
        requiredNextSteps={multi.combined_next_steps}
      />
    </Section>
  );
}

interface SnapshotExportPanelProps {
  readonly evaluated: boolean;
  readonly form: EcowittLiveEvidenceFormState;
  readonly overall: LiveSourceTruthGateResult;
  readonly plantResults: ReturnType<
    typeof evaluateLiveEvidenceForPlants
  >["per_plant"];
  readonly unitWarnings: readonly EcowittEvidenceUnitWarning[];
  readonly formWarnings: readonly string[];
  readonly requiredNextSteps: readonly string[];
}

function SnapshotExportPanel({
  evaluated,
  form,
  overall,
  plantResults,
  unitWarnings,
  formWarnings,
  requiredNextSteps,
}: SnapshotExportPanelProps) {
  const handleDownload = React.useCallback(() => {
    // Use the form's `now` field as the deterministic generated_at when
    // available; fall back to the captured_at; otherwise pass an empty
    // string so the filename helper returns its static fallback.
    const generatedAt =
      (form.now ?? "").trim() ||
      (form.captured_at ?? "").trim() ||
      "";
    const snapshot = buildEcowittLiveEvidenceSnapshotExport({
      generated_at: generatedAt,
      form_state: form,
      overall_result: overall,
      plant_results: plantResults,
      unit_warnings: unitWarnings,
      form_warnings: formWarnings,
      required_next_steps: requiredNextSteps,
    });
    const text = serializeEcowittLiveEvidenceSnapshotExport(snapshot);
    const filename = buildEcowittLiveEvidenceSnapshotFilename(generatedAt);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.click();
    } finally {
      // Revoke immediately; the browser has already captured the URL for
      // the synchronous download click above.
      URL.revokeObjectURL(url);
    }
  }, [
    form,
    overall,
    plantResults,
    unitWarnings,
    formWarnings,
    requiredNextSteps,
  ]);

  return (
    <div
      data-testid="ecowitt-evaluator-export"
      className="space-y-2 rounded-md border border-border bg-background p-3 text-sm"
    >
      <h3 className="text-sm font-semibold">Evidence Snapshot Export</h3>
      <p
        data-testid="ecowitt-evaluator-export-helper"
        className="text-xs text-muted-foreground"
      >
        Download a local JSON snapshot of the evidence currently entered on
        this page. This does not write to the database, query sensors, or
        prove live data by itself.
      </p>
      {evaluated ? (
        <button
          type="button"
          data-testid="ecowitt-evaluator-export-button"
          onClick={handleDownload}
          className="rounded border border-border bg-background px-3 py-1 text-sm"
        >
          Download evidence snapshot
        </button>
      ) : (
        <p
          data-testid="ecowitt-evaluator-export-disabled-message"
          className="text-xs text-muted-foreground"
        >
          Evaluate evidence before exporting a snapshot.
        </p>
      )}
    </div>
  );
}


export default function EcowittLiveBringup(): JSX.Element {
  const vm = React.useMemo(() => buildEcowittLiveBringupViewModel(), []);

  return (
    <main
      data-testid="ecowitt-bringup-page"
      className="mx-auto max-w-4xl space-y-4 p-4"
    >
      <header className="space-y-2">
        <h1 className="text-xl font-bold">{vm.title}</h1>
        <p className="text-sm text-muted-foreground">{vm.subtitle}</p>
        <div className="flex flex-wrap gap-2">
          {vm.badges.map((badge, i) => (
            <span
              key={`badge-${i}`}
              data-testid={`ecowitt-bringup-badge-${i}`}
              className="rounded border border-border bg-background px-2 py-0.5 text-xs"
            >
              {badge}
            </span>
          ))}
        </div>
        <p
          data-testid="ecowitt-bringup-top-note"
          className="rounded border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          {vm.top_note}
        </p>
      </header>

      <Section id="overall-status" title="Overall status">
        <p
          data-testid="ecowitt-bringup-overall-status"
          className="rounded border border-border bg-background p-3 text-sm"
        >
          {vm.overall_status}
        </p>
        <p className="text-xs text-muted-foreground">
          Live proof stays blocked until the grower has compared real
          EcoWitt/controller readings against backend evidence.
        </p>
      </Section>

      <LiveEvidenceEvaluator />

      <Section id="checklist" title="Checklist steps">
        <div className="grid gap-3">
          {vm.steps.map((s) => (
            <StepCard key={s.id} step={s} />
          ))}
        </div>
      </Section>

      <Section id="commands" title="Commands">
        <div className="grid gap-3">
          {vm.commands.map((c) => (
            <CommandCard key={c.id} cmd={c} />
          ))}
        </div>
      </Section>

      <Section id="evidence-fields" title="Evidence fields">
        <div className="grid gap-3">
          {vm.evidence_fields.map((f) => (
            <EvidenceCard key={f.id} field={f} />
          ))}
        </div>
      </Section>

      <Section id="go-no-go" title="GO / NO-GO rules">
        <div className="grid gap-3">
          {vm.go_no_go_rules.map((r) => (
            <GoNoGoCard key={r.id} rule={r} />
          ))}
        </div>
      </Section>

      <Section id="source-truth-warnings" title="Source truth warnings">
        <ul
          data-testid="ecowitt-bringup-source-truth-warnings"
          className="list-disc space-y-1 pl-5 text-sm"
        >
          {vm.source_truth_warnings.map((w, i) => (
            <li key={`warn-${i}`}>{w}</li>
          ))}
        </ul>
      </Section>

      <Section id="tonight-notes" title="Tonight notes">
        <ul
          data-testid="ecowitt-bringup-tonight-notes"
          className="list-disc space-y-1 pl-5 text-sm"
        >
          {vm.tonight_notes.map((n, i) => (
            <li key={`note-${i}`}>{n}</li>
          ))}
        </ul>
      </Section>

      <footer
        data-testid="ecowitt-bringup-generated-at"
        className="text-xs text-muted-foreground"
      >
        Generated at: {vm.generated_at}
      </footer>
    </main>
  );
}
