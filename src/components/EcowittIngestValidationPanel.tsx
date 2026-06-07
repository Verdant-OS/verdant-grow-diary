import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  buildEcowittIngestValidationViewModel,
  type EcowittIngestValidationInput,
  type EcowittValidationStatus,
} from "@/lib/ecowittIngestValidationViewModel";

interface Props {
  input: EcowittIngestValidationInput;
}

function statusVariant(
  status: EcowittValidationStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "accepted":
      return "default";
    case "stale":
      return "secondary";
    case "rejected_test":
      return "destructive";
    case "not_validated":
    default:
      return "outline";
  }
}

export function EcowittIngestValidationPanel({ input }: Props) {
  const vm = buildEcowittIngestValidationViewModel(input);
  return (
    <Card data-testid="ecowitt-ingest-validation-panel">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">
            EcoWitt ingest validation
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Read-only evidence from the latest local test sender payload for
            this tent.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {vm.testSenderBadge && (
            <Badge variant="outline" data-testid="test-sender-badge">
              {vm.testSenderBadge.label}
            </Badge>
          )}
          {vm.invalidTestBadge && (
            <Badge variant="destructive" data-testid="invalid-test-badge">
              {vm.invalidTestBadge.label}
            </Badge>
          )}
          <Badge
            variant={statusVariant(vm.status)}
            data-testid="validation-status-badge"
          >
            {vm.statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p data-testid="validation-status-message">{vm.statusMessage}</p>

        {vm.hasEvidence ? (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt className="font-medium">Source</dt>
            <dd>{vm.sourceLabel}</dd>
            <dt className="font-medium">Vendor</dt>
            <dd>{vm.vendorLabel}</dd>
            <dt className="font-medium">Transport</dt>
            <dd>{vm.transportLabel}</dd>
            <dt className="font-medium">Tent</dt>
            <dd>{vm.tentScopedLabel}</dd>
            <dt className="font-medium">Captured</dt>
            <dd>
              {vm.capturedAtLabel}
              <span className="ml-2 opacity-70">({vm.ageLabel})</span>
            </dd>
          </dl>
        ) : null}

        {vm.hasEvidence ? (
          <div
            data-testid="validation-metric-chips"
            className="flex flex-wrap gap-1"
          >
            {vm.metricChips.map((chip) => (
              <Badge
                key={chip.key}
                variant={chip.present ? "secondary" : "outline"}
                data-testid={`metric-chip-${chip.key}`}
                data-present={chip.present ? "true" : "false"}
                className="text-[10px]"
              >
                {chip.label}
                {chip.present ? "" : " (missing)"}
              </Badge>
            ))}
          </div>
        ) : null}

        {vm.nextSteps.length > 0 ? (
          <ul
            data-testid="validation-next-steps"
            className="list-disc pl-5 text-xs text-muted-foreground"
          >
            {vm.nextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        ) : null}

        {!vm.hasEvidence ? (
          <div
            data-testid="validation-cli-hints"
            className="rounded-md border border-dashed border-border p-3 text-xs"
          >
            <p className="mb-1 font-medium">Run the local test sender:</p>
            <ul className="space-y-1">
              {vm.cliHints.map((hint) => (
                <li key={hint.command}>
                  <span className="text-muted-foreground">{hint.label}:</span>{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    {hint.command}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default EcowittIngestValidationPanel;
