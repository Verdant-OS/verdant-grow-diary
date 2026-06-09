/**
 * EcoWitt Live Bring-Up — operator-only static page.
 *
 * Renders the deterministic EcowittLiveBringupViewModel. Does NOT query
 * sensors, call Supabase, write data, call models, control devices, or
 * create alerts or Action Queue items.
 */
import * as React from "react";
import {
  buildEcowittLiveBringupViewModel,
  type EcowittBringupStep,
  type EcowittBringupCommand,
  type EcowittEvidenceField,
  type EcowittGoNoGoRule,
} from "@/lib/ecowittLiveBringupViewModel";

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
