/**
 * Sensor Truth Audit — internal read-only page.
 *
 * Renders the static SensorTruthAuditViewModel. Does NOT query live sensors,
 * call Supabase, write data, create alerts, create Action Queue items, run AI,
 * or control devices.
 */
import * as React from "react";
import {
  buildSensorTruthAuditViewModel,
  type SensorTruthSourceRule,
  type SensorTruthSuspiciousCheck,
} from "@/lib/sensorTruthAuditViewModel";

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

function SourceRuleCard({ rule }: { rule: SensorTruthSourceRule }) {
  return (
    <section
      data-testid={`sensor-truth-source-rule-${rule.label}`}
      className="space-y-2 rounded-md border border-border bg-card p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold capitalize text-foreground">
          {rule.label}
        </h3>
        <span
          data-testid={`sensor-truth-source-rule-${rule.label}-badge`}
          className="inline-block rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
        >
          Source: {rule.label}
        </span>
      </header>

      <p className="text-sm text-foreground">{rule.meaning}</p>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Allowed use</p>
        <p
          data-testid={`sensor-truth-source-rule-${rule.label}-allowed-use`}
          className="text-sm text-foreground"
        >
          {rule.allowed_use}
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Confidence impact
        </p>
        <p
          data-testid={`sensor-truth-source-rule-${rule.label}-confidence-impact`}
          className="text-sm text-foreground"
        >
          {rule.confidence_impact}
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          UI label requirement
        </p>
        <p
          data-testid={`sensor-truth-source-rule-${rule.label}-ui-label`}
          className="text-sm text-foreground"
        >
          {rule.ui_label_requirement}
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Safety notes</p>
        <p
          data-testid={`sensor-truth-source-rule-${rule.label}-safety-notes`}
          className="text-sm text-foreground"
        >
          {rule.safety_notes}
        </p>
      </div>
    </section>
  );
}

function SuspiciousCheckCard({ check }: { check: SensorTruthSuspiciousCheck }) {
  return (
    <section
      data-testid={`sensor-truth-suspicious-check-${check.id}`}
      className="space-y-2 rounded-md border border-border bg-card p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{check.label}</h3>
        <span
          data-testid={`sensor-truth-suspicious-check-${check.id}-badge`}
          className="inline-block rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
        >
          Check: {check.id}
        </span>
      </header>

      <p
        data-testid={`sensor-truth-suspicious-check-${check.id}-description`}
        className="text-sm text-foreground"
      >
        {check.description}
      </p>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Why it matters</p>
        <p
          data-testid={`sensor-truth-suspicious-check-${check.id}-why`}
          className="text-sm text-foreground"
        >
          {check.why_it_matters}
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Expected handling
        </p>
        <p
          data-testid={`sensor-truth-suspicious-check-${check.id}-handling`}
          className="text-sm text-foreground"
        >
          {check.expected_handling}
        </p>
      </div>
    </section>
  );
}

export default function SensorTruthAudit(): JSX.Element {
  const vm = React.useMemo(() => buildSensorTruthAuditViewModel(), []);

  return (
    <div
      data-testid="sensor-truth-audit-page"
      className="mx-auto max-w-3xl space-y-6 p-4 text-foreground"
    >
      <header className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
        <h1 className="text-lg font-semibold">{vm.title}</h1>
        <p
          data-testid="sensor-truth-audit-subtitle"
          className="text-sm text-muted-foreground"
        >
          {vm.subtitle}
        </p>
        <div className="flex flex-wrap gap-1">
          {vm.badges.map((b, i) => (
            <span
              key={`badge-${i}`}
              data-testid={`sensor-truth-audit-badge-${i}`}
              className="inline-block rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
            >
              {b}
            </span>
          ))}
        </div>
        <p
          data-testid="sensor-truth-audit-generated-at"
          className="text-xs text-muted-foreground"
        >
          Generated at: {vm.generated_at}
        </p>
      </header>

      <section
        data-testid="sensor-truth-audit-source-rules"
        className="space-y-4"
        aria-label="Source label rules"
      >
        <h2 className="text-sm font-semibold">Source label rules</h2>
        {vm.source_rules.map((rule) => (
          <SourceRuleCard key={rule.label} rule={rule} />
        ))}
      </section>

      <section
        data-testid="sensor-truth-audit-suspicious-checks"
        className="space-y-4"
        aria-label="Suspicious data checks"
      >
        <h2 className="text-sm font-semibold">Suspicious data checks</h2>
        {vm.suspicious_checks.map((check) => (
          <SuspiciousCheckCard key={check.id} check={check} />
        ))}
      </section>

      <section
        data-testid="sensor-truth-audit-core-warnings"
        className="space-y-2 rounded-md border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Core warnings</h2>
        <BulletList
          items={vm.core_warnings}
          emptyMessage="No core warnings."
          testId="sensor-truth-audit-core-warnings-list"
        />
      </section>

      <section
        data-testid="sensor-truth-audit-blocked-note"
        className="space-y-2 rounded-md border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Blocked live-data note</h2>
        <p
          data-testid="sensor-truth-audit-blocked-note-text"
          className="text-sm text-foreground"
        >
          {vm.blocked_live_data_note}
        </p>
      </section>

      <section
        data-testid="sensor-truth-audit-validation-notes"
        className="space-y-2 rounded-md border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Validation notes</h2>
        <BulletList
          items={vm.validation_notes}
          emptyMessage="No validation notes."
          testId="sensor-truth-audit-validation-notes-list"
        />
      </section>
    </div>
  );
}
