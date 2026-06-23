/**
 * DemoProofWalkthrough — read-only presenter for the V0 One-Tent Loop
 * RC1 proof walkthrough.
 *
 * Hard constraints:
 *  - Presenter only. No Supabase, no AI, no writes, no Action Queue,
 *    no automation, no device control.
 *  - Renders the pure view model from
 *    `@/lib/demoProofWalkthroughViewModel` and links to existing routes
 *    instead of duplicating proof components.
 */
import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  buildDemoProofWalkthroughViewModel,
  type DemoProofWalkthroughStatus,
  type DemoProofWalkthroughStep,
} from "@/lib/demoProofWalkthroughViewModel";

function statusLabel(kind: DemoProofWalkthroughStatus): string {
  switch (kind) {
    case "ready":
      return "Ready";
    case "operator_only":
      return "Operator Mode";
    case "limited":
      return "Limited";
    case "unavailable":
    default:
      return "Unavailable";
  }
}

function StepCard({ step }: { step: DemoProofWalkthroughStep }) {
  return (
    <section
      data-testid={`demo-proof-walkthrough-step-${step.id}`}
      className="rounded-md border border-border p-3 space-y-2"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          <span
            className="text-muted-foreground mr-2"
            data-testid={`demo-proof-walkthrough-step-${step.id}-order`}
          >
            {step.order}.
          </span>
          {step.label}
        </h3>
        <Badge
          variant="outline"
          className="text-[10px]"
          data-testid={`demo-proof-walkthrough-step-${step.id}-status`}
        >
          {statusLabel(step.statusKind)}
        </Badge>
      </header>
      <p
        className="text-xs text-muted-foreground"
        data-testid={`demo-proof-walkthrough-step-${step.id}-purpose`}
      >
        {step.purpose}
      </p>
      <p className="text-xs">
        <span className="font-medium">Expected evidence: </span>
        <span
          data-testid={`demo-proof-walkthrough-step-${step.id}-evidence`}
        >
          {step.expectedEvidence}
        </span>
      </p>
      <p className="text-[11px] text-muted-foreground">
        <span className="font-medium">Safety: </span>
        <span data-testid={`demo-proof-walkthrough-step-${step.id}-safety`}>
          {step.safetyNote}
        </span>
      </p>
      <div>
        <Link
          to={step.href}
          className="text-xs underline underline-offset-2"
          data-testid={`demo-proof-walkthrough-step-${step.id}-link`}
        >
          Open {step.label}
        </Link>
      </div>
    </section>
  );
}

export default function DemoProofWalkthrough(): JSX.Element {
  const vm = buildDemoProofWalkthroughViewModel();

  return (
    <div
      className="space-y-4"
      data-testid="demo-proof-walkthrough-page"
    >
      <PageHeader
        title={vm.title}
        description={vm.subtitle}
        icon={<ClipboardCheck className="h-5 w-5" />}
      />
      <section
        role="note"
        aria-label="Read-only demo walkthrough banner"
        className="rounded-md border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-[11px] text-emerald-900 dark:text-emerald-200 space-y-1"
        data-testid="demo-proof-walkthrough-readonly-banner"
      >
        <p className="font-semibold">Read-only demo walkthrough.</p>
        <p>
          Links open existing proof surfaces; this page does not submit logs,
          call AI, create alerts, approve actions, or control devices.
        </p>
        <p>
          Operator Mode uses <code>?operator=1</code> as a URL surface gate;
          data access is still enforced by RLS.
        </p>
      </section>
      <p
        className="text-[11px] text-muted-foreground"
        data-testid="demo-proof-walkthrough-proof-window"
      >
        Scope: {vm.proofWindowLabel}.
      </p>


      <section
        aria-label="Safety summary"
        className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-[11px] text-amber-900 dark:text-amber-200 space-y-1"
        data-testid="demo-proof-walkthrough-safety-summary"
      >
        <p className="font-medium">Safety summary</p>
        <ul className="list-disc pl-5">
          {vm.safetySummary.map((s, i) => (
            <li key={`safety-${i}`}>{s}</li>
          ))}
        </ul>
      </section>

      <section
        aria-label="Walkthrough steps"
        className="space-y-2"
        data-testid="demo-proof-walkthrough-steps"
      >
        {vm.steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </section>

      <section
        aria-label="What this proves"
        className="rounded-md border border-border p-3 space-y-2"
        data-testid="demo-proof-walkthrough-what-this-proves"
      >
        <h2 className="text-sm font-semibold">What this proves</h2>
        <ul className="list-disc pl-5 text-xs">
          {vm.whatThisProves.map((s, i) => (
            <li key={`proves-${i}`}>{s}</li>
          ))}
        </ul>
      </section>

      <section
        aria-label="What this does not prove"
        className="rounded-md border border-border p-3 space-y-2"
        data-testid="demo-proof-walkthrough-what-this-does-not-prove"
      >
        <h2 className="text-sm font-semibold">What this does not prove</h2>
        <ul className="list-disc pl-5 text-xs">
          {vm.whatThisDoesNotProve.map((s, i) => (
            <li key={`not-proves-${i}`}>{s}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
