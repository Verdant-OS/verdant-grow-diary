/**
 * One-Tent Loop Internal Proof — read-only page.
 *
 * Renders the static OneTentLoopProofViewModel. Does NOT query live data,
 * call Supabase, run AI, create alerts, write to Action Queue, or control
 * devices. Selector-free, button-free.
 */
import * as React from "react";
import {
  buildOneTentLoopProofViewModel,
  type OneTentLoopProofStatus,
  type OneTentLoopProofStep,
} from "@/lib/oneTentLoopProofViewModel";

const STATUS_LABEL: Record<OneTentLoopProofStatus, string> = {
  ready: "Ready",
  partial: "Partial",
  blocked: "Blocked",
  not_started: "Not started",
};

function StatusBadge({ status }: { status: OneTentLoopProofStatus }) {
  return (
    <span
      data-testid={`one-tent-loop-proof-status-${status}`}
      className="inline-block rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
    >
      Status: {STATUS_LABEL[status]}
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

function StepCard({ step }: { step: OneTentLoopProofStep }) {
  return (
    <section
      data-testid={`one-tent-loop-proof-step-${step.id}`}
      className="space-y-2 rounded-md border border-border bg-card p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{step.label}</h3>
        <StatusBadge status={step.status} />
      </header>

      <p className="text-xs font-medium text-muted-foreground">Evidence</p>
      <BulletList
        items={step.evidence}
        emptyMessage="No evidence recorded."
        testId={`one-tent-loop-proof-step-${step.id}-evidence`}
      />

      <p className="text-xs font-medium text-muted-foreground">
        Missing pieces
      </p>
      <BulletList
        items={step.missing_pieces}
        emptyMessage="No missing pieces."
        testId={`one-tent-loop-proof-step-${step.id}-missing`}
      />

      <p className="text-xs font-medium text-muted-foreground">Safety notes</p>
      <BulletList
        items={step.safety_notes}
        emptyMessage="No safety notes."
        testId={`one-tent-loop-proof-step-${step.id}-safety`}
      />

      <p className="text-sm">
        <span className="font-medium">Next fix: </span>
        <span data-testid={`one-tent-loop-proof-step-${step.id}-next-fix`}>
          {step.next_fix}
        </span>
      </p>
    </section>
  );
}

export default function OneTentLoopProof(): JSX.Element {
  const vm = React.useMemo(() => buildOneTentLoopProofViewModel(), []);

  return (
    <div
      data-testid="one-tent-loop-proof-page"
      className="mx-auto max-w-3xl space-y-6 p-4 text-foreground"
    >
      <header className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
        <h1 className="text-lg font-semibold">{vm.title}</h1>
        <p
          data-testid="one-tent-loop-proof-subtitle"
          className="text-sm text-muted-foreground"
        >
          {vm.subtitle}
        </p>
        <div className="flex flex-wrap gap-1">
          {vm.badges.map((b, i) => (
            <span
              key={`badge-${i}`}
              data-testid={`one-tent-loop-proof-badge-${i}`}
              className="inline-block rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
            >
              {b}
            </span>
          ))}
        </div>
        <p
          data-testid="one-tent-loop-proof-generated-at"
          className="text-xs text-muted-foreground"
        >
          Generated at: {vm.generated_at}
        </p>
      </header>

      <section
        data-testid="one-tent-loop-proof-steps"
        className="space-y-4"
        aria-label="Loop steps"
      >
        {vm.steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </section>

      <section
        data-testid="one-tent-loop-proof-blocked-summary"
        className="space-y-2 rounded-md border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Blocked summary</h2>
        <BulletList
          items={vm.blocked_summary}
          emptyMessage="Nothing currently blocked."
          testId="one-tent-loop-proof-blocked-list"
        />
      </section>

      <section
        data-testid="one-tent-loop-proof-safety-summary"
        className="space-y-2 rounded-md border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Safety summary</h2>
        <BulletList
          items={vm.safety_summary}
          emptyMessage="No safety notes."
          testId="one-tent-loop-proof-safety-list"
        />
      </section>
    </div>
  );
}
