/**
 * AiDoctorEvidencePanel — presenter-only component for the AI Doctor
 * "Evidence used" panel. All grouping/labels come from
 * `aiDoctorEvidenceViewModel` — this file only renders the VM.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type {
  AiDoctorEvidencePanelVM,
  EvidenceGroupVM,
  EvidenceItem,
  EvidenceMetricRow,
} from "@/lib/aiDoctorEvidenceViewModel";

interface Props {
  vm: AiDoctorEvidencePanelVM | null | undefined;
}

function MetricRowView({ row }: { row: EvidenceMetricRow }) {
  return (
    <li
      className="flex flex-wrap items-center gap-2 text-xs"
      data-testid={`evidence-metric-${row.key}`}
    >
      <span className="font-medium">{row.label}</span>
      <Badge variant="outline" aria-label={`Status: ${row.statusLabel}`}>
        {row.statusLabel}
      </Badge>
      <Badge variant="secondary" aria-label={`Context: ${row.contextLabel}`}>
        {row.contextLabel}
      </Badge>
      <span className="text-muted-foreground">
        value:&nbsp;{row.displayValue ?? "—"}
      </span>
      {row.notHealthy ? (
        <span className="text-amber-600" role="note">
          not healthy
        </span>
      ) : null}
      {row.reason ? (
        <span className="text-muted-foreground">— {row.reason}</span>
      ) : null}
    </li>
  );
}

function EvidenceItemView({ item }: { item: EvidenceItem }) {
  return (
    <li
      className="rounded border p-2 space-y-1"
      data-testid={`evidence-item-${item.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{item.title}</span>
        <Badge aria-label={`Source: ${item.sourceLabel}`}>
          {item.sourceLabel}
        </Badge>
        {item.capturedAt ? (
          <time
            className="text-xs text-muted-foreground"
            dateTime={item.capturedAt}
          >
            {item.capturedAt}
          </time>
        ) : null}
      </div>
      {item.summary ? (
        <p className="text-xs text-muted-foreground">{item.summary}</p>
      ) : null}
      {item.metricRows.length > 0 ? (
        <ul className="space-y-1 pl-1">
          {item.metricRows.map((row) => (
            <MetricRowView key={row.key} row={row} />
          ))}
        </ul>
      ) : null}
      {item.warnings.length > 0 ? (
        <ul className="text-xs text-amber-700 list-disc pl-5">
          {item.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
      {item.cautionCopy ? (
        <p className="text-xs text-amber-700">{item.cautionCopy}</p>
      ) : null}
      {item.timelineHref ? (
        <a
          href={item.timelineHref}
          className="text-xs underline"
          aria-label={`View ${item.title} in timeline`}
        >
          View in timeline
        </a>
      ) : null}
    </li>
  );
}

function GroupView({ group }: { group: EvidenceGroupVM }) {
  if (group.key === "missing") return null;
  return (
    <Collapsible defaultOpen data-testid={`evidence-group-${group.key}`}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded px-2 py-1 text-sm font-semibold hover:bg-muted">
        <span>{group.title}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {group.items.length} item{group.items.length === 1 ? "" : "s"}
          <ChevronDown className="h-3 w-3" aria-hidden />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {group.isEmpty ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid={`evidence-empty-${group.key}`}
          >
            {group.emptyCopy}
          </p>
        ) : (
          <ul className="space-y-2">
            {group.items.map((item) => (
              <EvidenceItemView key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function safeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function AiDoctorEvidencePanel({ vm }: Props) {
  if (!vm) return null;
  const missingGroup = vm.groups.find((g) => g.key === "missing");
  return (
    <Card id="ai-doctor-evidence-panel" data-testid="ai-doctor-evidence-panel" tabIndex={-1}>
      <CardHeader>
        <CardTitle className="text-base">Evidence used</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {vm.conservativeRecommendationCopy ? (
          <p
            className="text-xs text-amber-700"
            data-testid="evidence-conservative-copy"
            role="note"
          >
            {vm.conservativeRecommendationCopy}
          </p>
        ) : null}

        {/* Latest EcoWitt Environment Check (always shown — even when missing) */}
        <section
          aria-label="Latest EcoWitt Environment Check"
          data-testid="latest-environment-check-section"
          className="rounded border p-2 space-y-1"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {vm.latestEnvironmentCheck.title}
            </h3>
            <Badge aria-label={`Source: ${vm.latestEnvironmentCheck.sourceLabel}`}>
              {vm.latestEnvironmentCheck.sourceLabel}
            </Badge>
            <Badge
              variant="outline"
              aria-label={`Selected status: ${vm.latestEnvironmentCheck.selectedStatusLabel}`}
              data-testid="latest-env-check-status"
            >
              {vm.latestEnvironmentCheck.selectedStatusLabel}
            </Badge>
            {vm.latestEnvironmentCheck.isFallback ? (
              <Badge variant="outline" aria-label="Weak fallback">
                Weak fallback
              </Badge>
            ) : null}
            {vm.latestEnvironmentCheck.capturedAt ? (
              <time
                className="text-xs text-muted-foreground"
                dateTime={vm.latestEnvironmentCheck.capturedAt}
              >
                {vm.latestEnvironmentCheck.capturedAt}
              </time>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {vm.latestEnvironmentCheck.eventTitle}
          </p>
          <ul className="space-y-1">
            {vm.latestEnvironmentCheck.metricRows.map((row) => (
              <li
                key={row.key}
                id={`evidence-envcheck-${safeSlug(row.key)}`}
                tabIndex={-1}
                className="flex flex-wrap items-center gap-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                data-testid={`latest-env-check-row-${row.key}`}
              >
                <span className="font-medium">{row.label}</span>
                <Badge variant="outline" aria-label={`Status: ${row.statusLabel}`}>
                  {row.statusLabel}
                </Badge>
                <Badge variant="secondary" aria-label={`Context: ${row.contextLabel}`}>
                  {row.contextLabel}
                </Badge>
                <span className="text-muted-foreground">
                  value:&nbsp;{row.displayValue ?? "—"}
                </span>
                {row.notHealthy ? (
                  <span className="text-amber-600" role="note">
                    not healthy
                  </span>
                ) : null}
                {row.reason ? (
                  <span className="text-muted-foreground">— {row.reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {vm.latestEnvironmentCheck.cautionCopy ? (
            <p
              className="text-xs text-amber-700"
              data-testid="latest-env-check-caution"
            >
              {vm.latestEnvironmentCheck.cautionCopy}
            </p>
          ) : null}
          {vm.latestEnvironmentCheck.timelineHref ? (
            <a
              href={vm.latestEnvironmentCheck.timelineHref}
              className="text-xs underline"
              aria-label="View Latest EcoWitt Environment Check in timeline"
            >
              View in timeline
            </a>
          ) : null}
        </section>

        {/* More data needed checklist */}
        {vm.moreDataNeeded.show ? (
          <section
            aria-label="More data needed"
            data-testid="more-data-needed-section"
            className="rounded border p-2 space-y-1"
          >
            <h3 className="text-sm font-semibold">
              {vm.moreDataNeeded.title}
            </h3>
            <ul className="space-y-1 text-xs">
              {vm.moreDataNeeded.items.map((i) => (
                <li
                  key={i.key}
                  data-testid={`more-data-item-${i.key}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Badge
                    variant={i.state === "complete" ? "secondary" : "outline"}
                    aria-label={`Checklist state: ${i.state}`}
                  >
                    {i.state === "complete" ? "Complete" : "Needed"}
                  </Badge>
                  <span>{i.label}</span>
                  {i.reason ? (
                    <span className="text-muted-foreground">— {i.reason}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {vm.moreDataNeeded.cautionCopy ? (
              <p
                className="text-xs text-amber-700"
                data-testid="more-data-needed-caution"
              >
                {vm.moreDataNeeded.cautionCopy}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="space-y-2">
          {vm.groups
            .filter((g) => g.key !== "missing")
            .map((g) => (
              <GroupView key={g.key} group={g} />
            ))}
        </div>
        {missingGroup ? (
          <section
            id="evidence-missing-general"
            aria-label="Missing context"
            data-testid="evidence-missing-section"
            tabIndex={-1}
            className="space-y-1 border-t pt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <h4 className="text-sm font-semibold">{missingGroup.title}</h4>
            {vm.missing.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {missingGroup.emptyCopy}
              </p>
            ) : (
              <ul className="space-y-1 text-xs">
                {vm.missing.map((m) => (
                  <li
                    key={m.code}
                    id={`evidence-missing-${safeSlug(m.code)}`}
                    tabIndex={-1}
                    data-testid={`evidence-missing-${m.code}`}
                    className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Badge variant="outline" aria-label="Missing">
                      Missing
                    </Badge>
                    <span>{m.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default AiDoctorEvidencePanel;
