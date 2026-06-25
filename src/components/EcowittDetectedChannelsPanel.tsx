import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  buildEcowittChannelLabelingViewModel,
  READ_ONLY_CHANNEL_NOTICE,
  type BuildEcowittChannelLabelingOptions,
  type EcowittChannelStatus,
} from "@/lib/ecowittChannelLabelingRules";

interface Props {
  payload: unknown;
  options?: BuildEcowittChannelLabelingOptions;
}

const STATUS_LABEL: Record<EcowittChannelStatus, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  missing: "Missing",
  invalid: "Invalid",
  stale: "Stale",
  not_checked: "Not checked",
};

const STATUS_WARNING: Record<EcowittChannelStatus, string | null> = {
  accepted: null,
  rejected: "Rejected value — do not treat as healthy.",
  stale: "Stale reading — do not treat as live.",
  missing: "Missing value — channel detected but no usable value.",
  invalid: "Invalid value — do not treat as healthy.",
  not_checked: null,
};

function statusVariant(
  status: EcowittChannelStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "accepted":
      return "default";
    case "stale":
    case "missing":
      return "secondary";
    case "rejected":
    case "invalid":
      return "destructive";
    case "not_checked":
    default:
      return "outline";
  }
}

export function EcowittDetectedChannelsPanel({ payload, options }: Props) {
  const vm = useMemo(
    () => buildEcowittChannelLabelingViewModel(payload, options),
    [payload, options],
  );

  return (
    <Card data-testid="ecowitt-detected-channels-panel">
      <CardHeader>
        <CardTitle>Detected EcoWitt channels</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="text-sm text-muted-foreground"
          data-testid="ecowitt-channels-readonly-notice"
        >
          {READ_ONLY_CHANNEL_NOTICE}
        </p>

        {!vm.hasChannels ? (
          <p className="text-sm text-muted-foreground">
            No EcoWitt channels detected in the latest evidence.
          </p>
        ) : null}

        {vm.groups.map((group) => (
          <section
            key={group.family}
            data-testid={`ecowitt-channel-group-${group.family}`}
            className="space-y-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{group.familyLabel}</h3>
              {group.canonicalMetric ? (
                <span className="text-xs text-muted-foreground">
                  Canonical: <code>{group.canonicalMetric}</code>
                </span>
              ) : null}
            </div>

            {group.multiChannelWarning ? (
              <p
                className="text-xs text-amber-600"
                data-testid={`ecowitt-multi-warning-${group.family}`}
              >
                {group.multiChannelWarning}
              </p>
            ) : null}

            <ul className="space-y-2">
              {group.channels.map((ch) => {
                const warn = STATUS_WARNING[ch.status];
                return (
                  <li
                    key={ch.rawKey}
                    data-testid={`ecowitt-channel-row-${ch.rawKey}`}
                    className="rounded border p-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs">{ch.rawKey}</code>
                      <span className="text-xs text-muted-foreground">
                        Channel {ch.channel ?? "—"}
                      </span>
                      <Badge variant={statusVariant(ch.status)}>
                        {STATUS_LABEL[ch.status]}
                      </Badge>
                      <span
                        className="ml-auto font-mono"
                        data-testid={`ecowitt-channel-value-${ch.rawKey}`}
                      >
                        {ch.valueLabel}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span data-testid={`ecowitt-channel-assignment-${ch.rawKey}`}>
                        {ch.knownLabel
                          ? `Known label: ${ch.knownLabel}`
                          : ch.assignmentLabel}
                      </span>
                      {ch.capturedAt ? (
                        <span>captured_at {ch.capturedAt}</span>
                      ) : null}
                    </div>
                    {ch.knownLabel === null && ch.status === "accepted" ? (
                      <p className="mt-1 text-xs text-amber-600">
                        Unassigned channel — label this before relying on
                        plant-specific decisions.
                      </p>
                    ) : null}
                    {warn ? (
                      <p
                        className="mt-1 text-xs text-destructive"
                        data-testid={`ecowitt-channel-warning-${ch.rawKey}`}
                      >
                        {warn}
                      </p>
                    ) : null}
                    {ch.reason ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {ch.reason}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {vm.unsupported.length > 0 ? (
          <section
            data-testid="ecowitt-channel-group-unsupported"
            className="space-y-2"
          >
            <h3 className="text-sm font-semibold">Unsupported channels</h3>
            <ul className="space-y-2">
              {vm.unsupported.map((ch) => (
                <li
                  key={ch.rawKey}
                  data-testid={`ecowitt-channel-row-${ch.rawKey}`}
                  className="rounded border p-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs">{ch.rawKey}</code>
                    <Badge variant="outline">Unsupported</Badge>
                    <span
                      className="ml-auto font-mono"
                      data-testid={`ecowitt-channel-value-${ch.rawKey}`}
                    >
                      {ch.valueLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 text-xs text-muted-foreground"
                    data-testid={`ecowitt-channel-warning-${ch.rawKey}`}
                  >
                    {ch.reason}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default EcowittDetectedChannelsPanel;
