/**
 * AI Doctor Confidence Audit — internal read-only page.
 *
 * Renders the static AiDoctorConfidenceAuditViewModel with a scenario selector.
 * Does NOT query live data, call Supabase, write data, create alerts,
 * create Action Queue items, call models, or control devices.
 */
import * as React from "react";
import {
  buildAiDoctorConfidenceAuditViewModel,
  type AiDoctorConfidenceAuditRule,
  type AiDoctorConfidenceHardCap,
  type AiDoctorConfidenceAuditScenario,
} from "@/lib/aiDoctorConfidenceAuditViewModel";

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
      data-testid={`ai-doctor-confidence-audit-section-${id}`}
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function BulletList({
  items,
  testId,
}: {
  items: readonly string[];
  testId: string;
}) {
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

function RuleCard({ rule }: { rule: AiDoctorConfidenceAuditRule }) {
  return (
    <article
      data-testid={`ai-doctor-confidence-rule-${rule.id}`}
      className="space-y-2 rounded-md border border-border bg-background p-3"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{rule.label}</h3>
        {rule.hard_cap !== null ? (
          <span
            data-testid={`ai-doctor-confidence-rule-${rule.id}-cap`}
            className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground"
          >
            Hard cap: {rule.hard_cap}
          </span>
        ) : null}
      </header>
      <dl className="space-y-1 text-sm text-foreground">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Data condition
          </dt>
          <dd>{rule.data_condition}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Confidence effect
          </dt>
          <dd>{rule.confidence_effect}</dd>
        </div>
        {rule.required_warning ? (
          <div>
            <dt className="text-xs uppercase text-muted-foreground">
              Required warning
            </dt>
            <dd>{rule.required_warning}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Why it matters
          </dt>
          <dd>{rule.why_it_matters}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Expected UI behavior
          </dt>
          <dd>{rule.expected_ui_behavior}</dd>
        </div>
      </dl>
    </article>
  );
}

function HardCapCard({ cap }: { cap: AiDoctorConfidenceHardCap }) {
  return (
    <article
      data-testid={`ai-doctor-confidence-hard-cap-${cap.id}`}
      className="space-y-1 rounded-md border border-border bg-background p-3 text-sm"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{cap.label}</h3>
        <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
          Max score: {cap.max_score}
        </span>
      </header>
      <p className="text-foreground">{cap.condition}</p>
      <p className="text-muted-foreground">{cap.reason}</p>
    </article>
  );
}

function ScenarioPanel({ scenario }: { scenario: AiDoctorConfidenceAuditScenario }) {
  const ceilingText =
    scenario.confidence_ceiling >= 0
      ? scenario.confidence_ceiling.toString()
      : "Conservative / low";
  return (
    <article
      data-testid={`ai-doctor-confidence-scenario-panel`}
      className="space-y-3 rounded-md border border-border bg-background p-3 text-sm"
    >
      <header className="space-y-1">
        <h3
          data-testid="ai-doctor-confidence-scenario-label"
          className="text-sm font-semibold"
        >
          {scenario.label}
        </h3>
        <p
          data-testid="ai-doctor-confidence-scenario-description"
          className="text-foreground"
        >
          {scenario.description}
        </p>
      </header>

      <dl className="space-y-2">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Context type
          </dt>
          <dd data-testid="ai-doctor-confidence-scenario-context-type">
            {scenario.context_type}
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Confidence ceiling
          </dt>
          <dd data-testid="ai-doctor-confidence-scenario-ceiling">
            {ceilingText}
          </dd>
        </div>

        {scenario.applies_hard_caps.length > 0 ? (
          <div>
            <dt className="text-xs uppercase text-muted-foreground">
              Applicable hard caps
            </dt>
            <dd>
              <ul
                data-testid="ai-doctor-confidence-scenario-hard-caps"
                className="list-disc pl-5"
              >
                {scenario.applies_hard_caps.map((cap) => (
                  <li key={cap}>{cap}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-xs uppercase text-muted-foreground">
              Applicable hard caps
            </dt>
            <dd data-testid="ai-doctor-confidence-scenario-hard-caps">None</dd>
          </div>
        )}

        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Applicable safety flags
          </dt>
          <dd>
            <ul
              data-testid="ai-doctor-confidence-scenario-safety-flags"
              className="flex flex-wrap gap-2"
            >
              {scenario.applies_safety_flags.map((flag) => (
                <li
                  key={flag}
                  className="rounded border border-border bg-muted/40 px-2 py-0.5 text-xs"
                >
                  {flag}
                </li>
              ))}
            </ul>
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase text-muted-foreground">
            Operator takeaway
          </dt>
          <dd data-testid="ai-doctor-confidence-scenario-takeaway">
            {scenario.operator_takeaway}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function AiDoctorConfidenceAudit(): JSX.Element {
  const vm = React.useMemo(
    () => buildAiDoctorConfidenceAuditViewModel(),
    [],
  );
  const [selectedScenarioId, setSelectedScenarioId] = React.useState<string>(
    "demo-csv-only",
  );
  const selectedScenario = React.useMemo(
    () =>
      vm.scenarios.find((s) => s.id === selectedScenarioId) ?? vm.scenarios[0],
    [vm.scenarios, selectedScenarioId],
  );

  return (
    <main
      data-testid="ai-doctor-confidence-audit-page"
      className="mx-auto max-w-4xl space-y-4 p-4"
    >
      <header className="space-y-2">
        <h1 className="text-xl font-bold">{vm.title}</h1>
        <p className="text-sm text-muted-foreground">{vm.subtitle}</p>
        <div className="flex flex-wrap gap-2">
          {vm.badges.map((badge, i) => (
            <span
              key={`badge-${i}`}
              data-testid={`ai-doctor-confidence-audit-badge-${i}`}
              className="rounded border border-border bg-background px-2 py-0.5 text-xs"
            >
              {badge}
            </span>
          ))}
        </div>
        <p
          data-testid="ai-doctor-confidence-audit-top-note"
          className="rounded border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          This page documents AI Doctor confidence safety rules. It does not run
          diagnosis, score live confidence, query sensors, create alerts, create
          Action Queue items, or perform device control.
        </p>
      </header>

      <Section id="scenario-selector" title="Scenario selector">
        <label
          htmlFor="ai-doctor-confidence-scenario-select"
          className="text-sm font-medium text-foreground"
        >
          Select a weak-context scenario
        </label>
        <select
          id="ai-doctor-confidence-scenario-select"
          data-testid="ai-doctor-confidence-scenario-select"
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          value={selectedScenarioId}
          onChange={(e) => setSelectedScenarioId(e.target.value)}
        >
          {vm.scenarios.map((s) => (
            <option
              key={s.id}
              value={s.id}
              data-testid={`ai-doctor-confidence-scenario-option-${s.id}`}
            >
              {s.label}
            </option>
          ))}
        </select>
        <ScenarioPanel scenario={selectedScenario} />
      </Section>

      <Section id="rules" title="Confidence rules">
        <div className="grid gap-3">
          {vm.rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </div>
      </Section>

      <Section id="hard-caps" title="Hard caps">
        <div className="grid gap-3">
          {vm.hard_caps.map((cap) => (
            <HardCapCard key={cap.id} cap={cap} />
          ))}
        </div>
      </Section>

      <Section
        id="high-confidence-requirements"
        title="High-confidence requirements (trustworthy quartet)"
      >
        <BulletList
          items={vm.high_confidence_requirements}
          testId="ai-doctor-confidence-high-confidence-list"
        />
      </Section>

      <Section id="source-quality-notes" title="Source quality notes">
        <BulletList
          items={vm.source_quality_notes}
          testId="ai-doctor-confidence-source-quality-list"
        />
      </Section>

      <Section id="safety-flags" title="Safety flags">
        <ul
          data-testid="ai-doctor-confidence-safety-flags-list"
          className="flex flex-wrap gap-2"
        >
          {vm.safety_flags.map((flag) => (
            <li
              key={flag}
              data-testid={`ai-doctor-confidence-safety-flag-${flag}`}
              className="rounded border border-border bg-background px-2 py-0.5 text-xs"
            >
              {flag}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="forbidden-behavior" title="Forbidden behavior">
        <BulletList
          items={vm.forbidden_behavior}
          testId="ai-doctor-confidence-forbidden-behavior-list"
        />
      </Section>

      <footer
        data-testid="ai-doctor-confidence-audit-generated-at"
        className="text-xs text-muted-foreground"
      >
        Generated at: {vm.generated_at}
      </footer>
    </main>
  );
}
