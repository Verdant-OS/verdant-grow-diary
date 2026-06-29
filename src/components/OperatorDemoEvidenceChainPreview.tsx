/**
 * OperatorDemoEvidenceChainPreview — read-only presenter for the operator
 * Demo Preview page. Renders the One-Tent Evidence Chain walkthrough from a
 * pure view model. No I/O. No writes. No mutation controls.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import EvidenceLinkageBadges from "@/components/EvidenceLinkageBadges";
import type { OperatorDemoPreviewViewModel } from "@/lib/operatorDemoPreviewViewModel";

export interface OperatorDemoEvidenceChainPreviewProps {
  vm: OperatorDemoPreviewViewModel;
}

export default function OperatorDemoEvidenceChainPreview({
  vm,
}: OperatorDemoEvidenceChainPreviewProps) {
  return (
    <div
      className="mx-auto max-w-3xl space-y-4 p-4"
      data-testid="operator-demo-preview"
      data-source-label={vm.sourceLabel}
    >
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">
          One-Tent Evidence Chain Demo Preview
        </h1>
        <p className="text-sm text-muted-foreground">
          Read-only operator preview using demo-labeled fixture data. No
          database writes are performed.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge
            data-testid="operator-demo-preview-source-badge"
            className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            variant="outline"
          >
            Demo
          </Badge>
          <span className="text-xs text-muted-foreground">
            Grow: {vm.growLabel} · Plant: {vm.plantLabel}
          </span>
        </div>
      </header>

      <Card data-testid="operator-demo-preview-reading">
        <CardHeader>
          <CardTitle className="text-base">Demo source reading</CardTitle>
          <CardDescription>
            {vm.sensorReading.metric} · {vm.sensorReading.valueLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            >
              {vm.sensorReading.sourceLabel}
            </Badge>
            <span className="text-muted-foreground">
              captured {vm.sensorReading.capturedAtLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Demo data is not live telemetry.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="operator-demo-preview-alert">
        <CardHeader>
          <CardTitle className="text-base">Linked environment alert</CardTitle>
          <CardDescription>{vm.alert.title}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="text-xs text-muted-foreground">
            Status: {vm.alert.statusLabel}
          </div>
          <EvidenceLinkageBadges
            events={vm.alert.evidenceRefs}
            surface="alert-review"
          />
          <p className="text-xs text-muted-foreground">
            Evidence is linked through the persisted fixture ref, not inferred.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="operator-demo-preview-action">
        <CardHeader>
          <CardTitle className="text-base">
            Approval-required Action Queue item
          </CardTitle>
          <CardDescription>{vm.action.title}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge
              variant="outline"
              className="border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
              data-testid="operator-demo-preview-action-status"
            >
              {vm.action.statusLabel}
            </Badge>
            <span className="text-muted-foreground">
              Grower approval required before any change.
            </span>
          </div>
          <EvidenceLinkageBadges
            events={vm.action.evidenceRefs}
            surface="action-queue-suggestion"
          />
          <p className="text-xs text-muted-foreground">
            No equipment command is sent. Grower approval is required.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="operator-demo-preview-post-grow">
        <CardHeader>
          <CardTitle className="text-base">Post-Grow eligibility</CardTitle>
          <CardDescription>
            {vm.postGrow.eligible
              ? "Eligible for Post-Grow Learning Report (fixture state)."
              : "Not eligible in this fixture state."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">
            Stage: {vm.postGrow.growStageLabel} ·{" "}
            {vm.postGrow.archived ? "Archived" : "Active"}
          </div>
          {vm.postGrow.harvestedAtLabel && (
            <div className="text-xs text-muted-foreground">
              Harvested: {vm.postGrow.harvestedAtLabel}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            This fixture represents an eligible post-grow state for walkthrough
            purposes.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="operator-demo-preview-checklist">
        <CardHeader>
          <CardTitle className="text-base">Demo checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Source label visible (Demo).</li>
            <li>Alert evidence badge visible.</li>
            <li>Action evidence badge visible.</li>
            <li>Approval-required state visible.</li>
            <li>Post-Grow eligibility visible.</li>
            <li>No fake live data is shown.</li>
          </ul>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {vm.safetyNotes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
