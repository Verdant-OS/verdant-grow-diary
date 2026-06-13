/**
 * VerdantGeneticsXlsxPreviewPanel — presenter for Verdant Genetics
 * multi-tent XLSX exports.
 *
 * Preview only. Persistence for the verdant_genetics_xlsx source app is
 * intentionally disabled:
 *   - The save button is rendered disabled.
 *   - No Supabase calls. No alerts. No Action Queue writes. No AI.
 *     No device control.
 *   - CSV history language is used; XLSX rows are never labeled live.
 *   - Raw payloads, device serials, bridge tokens, and internal IDs are
 *     never rendered.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildVerdantGeneticsXlsxPreviewViewModel,
  VERDANT_GENETICS_CSV_HISTORY_COPY,
  VERDANT_GENETICS_FORMAT_LABEL,
  VERDANT_GENETICS_IMPORT_DISABLED_COPY,
  UNKNOWN_XLSX_COPY,
} from "@/lib/verdantGeneticsXlsxPreviewViewModel";
import {
  buildInitialMappingState,
  setGroupMapping,
  buildMappingReadiness,
  XLSX_MAPPING_REQUIRED_COPY,
  XLSX_NO_TENTS_COPY,
  XLSX_IMPORT_SAVING_DISABLED_COPY,
  type TentOption,
} from "@/lib/verdantGeneticsXlsxMappingViewModel";
import type { CellGrid } from "@/lib/verdantGeneticsXlsxParser";

export interface VerdantGeneticsXlsxPreviewPanelProps {
  grid: CellGrid;
  tentOptions?: TentOption[];
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function VerdantGeneticsXlsxPreviewPanel({
  grid,
  tentOptions = [],
}: VerdantGeneticsXlsxPreviewPanelProps) {
  const vm = buildVerdantGeneticsXlsxPreviewViewModel(grid);
  const [mappingState, setMappingState] = useState(() =>
    buildInitialMappingState(vm.detectedGroups),
  );

  const readiness = buildMappingReadiness(
    vm.detectedGroups,
    mappingState.tentIdBySensorGroup,
  );

  const hasTents = tentOptions.length > 0;

  return (
    <section
      data-testid="verdant-genetics-xlsx-preview"
      className="mt-4 rounded-xl border border-border/60 p-3 grid gap-3 text-xs"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" data-testid="vg-xlsx-format">
          {VERDANT_GENETICS_FORMAT_LABEL}
        </Badge>
        <Badge
          variant="outline"
          data-testid="vg-xlsx-source-app"
          className="font-mono"
        >
          {vm.sourceApp}
        </Badge>
        <Badge variant="outline" data-testid="vg-xlsx-canonical-source">
          {vm.canonicalSourceLabel}
        </Badge>
      </header>

      <p
        className="text-muted-foreground"
        data-testid="vg-xlsx-csv-history-copy"
      >
        {VERDANT_GENETICS_CSV_HISTORY_COPY}
      </p>

      {vm.unknownShape && (
        <p
          role="alert"
          className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-200"
          data-testid="vg-xlsx-unknown-shape"
        >
          {UNKNOWN_XLSX_COPY}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat
          label="Detected sensor groups"
          value={
            vm.detectedGroups.length > 0
              ? vm.detectedGroups.join(", ")
              : "—"
          }
          testId="vg-xlsx-detected-groups"
        />
        <Stat
          label="Date range"
          value={
            vm.dateRange
              ? `${fmtDate(vm.dateRange.start)} → ${fmtDate(vm.dateRange.end)}`
              : "—"
          }
          testId="vg-xlsx-date-range"
        />
        <Stat
          label="Timestamp rows"
          value={String(vm.timestampRowCount)}
          testId="vg-xlsx-timestamp-rows"
        />
        <Stat
          label="Mapped metrics"
          value={String(vm.mappedMetricCount)}
          testId="vg-xlsx-mapped-metrics"
        />
        <Stat
          label="Rejected / blank columns"
          value={String(vm.rejectedMetricCount)}
          testId="vg-xlsx-rejected-metrics"
        />
        <Stat
          label="Suspicious flags"
          value={String(vm.suspiciousCount)}
          testId="vg-xlsx-suspicious-count"
        />
      </div>

      {vm.suspicious.length > 0 && (
        <ul
          data-testid="vg-xlsx-suspicious-list"
          className="grid gap-1 text-amber-200/90"
        >
          {vm.suspicious.slice(0, 10).map((s, i) => (
            <li
              key={`${s.kind}-${i}`}
              data-testid={`vg-xlsx-suspicious-${s.kind}`}
            >
              <span className="font-mono">{s.kind}</span> · {s.note}
            </li>
          ))}
        </ul>
      )}

      {vm.rejected.length > 0 && (
        <ul
          data-testid="vg-xlsx-rejected-list"
          className="grid gap-1 text-muted-foreground"
        >
          {vm.rejected.slice(0, 10).map((r) => (
            <li
              key={`${r.column_index}-${r.reason}`}
              data-testid={`vg-xlsx-rejected-${r.column_index}`}
            >
              <span className="font-mono">
                col {r.column_index}
                {r.sensor_group ? ` · ${r.sensor_group}` : ""}
              </span>{" "}
              · {r.original_metric_label || "(blank)"} — {r.reason}
            </li>
          ))}
        </ul>
      )}

      {/* Tent mapping section */}
      {vm.detectedGroups.length > 0 && (
        <div
          className="rounded-md border border-border/60 p-3 grid gap-2"
          data-testid="vg-xlsx-mapping-section"
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Sensor group → Tent mapping
          </p>
          <p
            className="text-muted-foreground"
            data-testid="vg-xlsx-mapping-required-copy"
          >
            {XLSX_MAPPING_REQUIRED_COPY}
          </p>

          {!hasTents && (
            <p
              role="alert"
              className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-200"
              data-testid="vg-xlsx-no-tents"
            >
              {XLSX_NO_TENTS_COPY}
            </p>
          )}

          {vm.detectedGroups.map((group) => {
            const selectedTentId = mappingState.tentIdBySensorGroup[group] ?? "";
            return (
              <div
                key={group}
                className="grid grid-cols-[1fr_auto] items-center gap-2"
                data-testid={`vg-xlsx-mapping-row-${group}`}
              >
                <span
                  className="font-mono text-xs"
                  data-testid={`vg-xlsx-group-label-${group}`}
                >
                  {group}
                </span>
                {hasTents ? (
                  <Select
                    value={selectedTentId || "__none__"}
                    onValueChange={(value) =>
                      setMappingState((prev) =>
                        setGroupMapping(
                          prev,
                          group,
                          value === "__none__" ? null : value,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      className="h-8 w-48 text-xs"
                      data-testid={`vg-xlsx-tent-select-${group}`}
                    >
                      <SelectValue placeholder="Select tent…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Unmapped —</SelectItem>
                      {tentOptions.map((t) => (
                        <SelectItem
                          key={t.id}
                          value={t.id}
                          data-testid={`vg-xlsx-tent-option-${group}-${t.id}`}
                        >
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-muted-foreground text-[11px]">
                    —
                  </span>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-3 gap-2 mt-1">
            <Stat
              label="Mapped groups"
              value={String(readiness.mappedCount)}
              testId="vg-xlsx-mapped-count"
            />
            <Stat
              label="Unmapped groups"
              value={String(readiness.unmappedCount)}
              testId="vg-xlsx-unmapped-count"
            />
            <Stat
              label="All mapped"
              value={readiness.allMapped ? "Yes" : "No"}
              testId="vg-xlsx-all-mapped"
            />
          </div>
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="vg-xlsx-import-block"
      >
        <Button
          type="button"
          size="sm"
          disabled
          aria-disabled="true"
          data-testid="vg-xlsx-save-disabled"
          title={XLSX_IMPORT_SAVING_DISABLED_COPY}
        >
          Save XLSX history — coming later
        </Button>
        <span
          className="text-[11px] text-amber-200/80"
          data-testid="vg-xlsx-import-disabled-reason"
        >
          {XLSX_IMPORT_SAVING_DISABLED_COPY}
        </span>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-xs" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

export default VerdantGeneticsXlsxPreviewPanel;
