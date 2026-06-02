import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultMappingFromHeaders,
  emptyRepresentativeMapping,
  previewRepresentativeCsv,
  parseCsv,

  type EcUnit,
  type RepresentativeColumnMapping,
  type RepresentativeDraftReading,
  type RepresentativeMappingField,
  type RepresentativePreviewResult,
  type TempUnit,
} from "@/lib/representativeCsvSensorPreviewRules";
import {
  applyCsvMappingTemplate,
  buildMappingDownloadPayload,
  csvMappingDownloadFileName,
  CSV_MAPPING_TEMPLATES,
  getCsvMappingTemplate,
  type CsvMappingTemplateId,
} from "@/lib/csvMappingTemplates";
import {
  applyCsvMappingPreset,
  buildCsvMappingPreset,
  clearCsvMappingPreset,
  loadCsvMappingPreset,
  saveCsvMappingPreset,
} from "@/lib/csvMappingPresetStorage";
import {
  deriveCsvRowValidationHints,
  detectMappingCollisions,
  type CsvRowValidationHint,
} from "@/lib/csvRowValidationRules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * RepresentativeCsvPreview — DEMO/SAMPLE ONLY.
 *
 * Lets a grower pick a local .csv file with arbitrary headers, map those
 * headers to Verdant canonical sensor fields with explicit units, and
 * preview the normalized result. Parses in memory only.
 *
 * Hard constraints:
 *  - No DB writes, no Supabase calls, no functions.invoke.
 *  - No alerts, no action_queue, no AI Doctor calls.
 *  - No file persistence and no Storage upload.
 *  - Mapping is explicit; Facility/Room/Zone are NEVER inferred as Verdant
 *    grow_id / tent_id / plant_id.
 */

interface FieldDescriptor {
  field: RepresentativeMappingField;
  label: string;
  helper: string;
  units?: ReadonlyArray<string>;
}

const FIELD_DESCRIPTORS: ReadonlyArray<FieldDescriptor> = [
  { field: "timestamp", label: "Timestamp", helper: "Required. ISO-8601 or 'YYYY-MM-DD HH:MM:SS'." },
  { field: "sensor", label: "Sensor ID", helper: "Identifier for the probe/device." },
  { field: "facility", label: "Facility (optional)", helper: "Preserved as context. Not a Verdant ID." },
  { field: "room", label: "Room (optional)", helper: "Preserved as context. Not a Verdant ID." },
  { field: "zone", label: "Zone (optional)", helper: "Preserved as context. Not a Verdant ID." },
  { field: "air_temp", label: "Air temperature", helper: "Pick the source unit.", units: ["C", "F"] },
  { field: "substrate_temp", label: "Substrate temperature", helper: "Pick the source unit.", units: ["C", "F"] },
  { field: "humidity", label: "Humidity (%)", helper: "Relative humidity 0–100." },
  { field: "vpd", label: "VPD (kPa)", helper: "Vapor pressure deficit." },
  { field: "co2", label: "CO₂ (ppm)", helper: "Parts per million." },
  { field: "ppfd", label: "PPFD (µmol)", helper: "Photosynthetic photon flux density." },
  { field: "vwc", label: "Substrate VWC (%)", helper: "Volumetric water content 0–100." },
  { field: "substrate_ec", label: "Substrate EC", helper: "Pick the source unit.", units: ["mS/cm", "uS/cm"] },
];

const UNMAPPED = "__unmapped__";

export default function RepresentativeCsvPreview() {
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [mapping, setMapping] = useState<RepresentativeColumnMapping>(emptyRepresentativeMapping());
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<CsvMappingTemplateId | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const [hasSavedPreset, setHasSavedPreset] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHasSavedPreset(loadCsvMappingPreset() !== null);
  }, []);

  const onFile = async (file: File) => {
    setError(null);
    setTemplateNotice(null);
    setPresetNotice(null);
    setTemplateId(null);
    setFileName(file.name);
    try {
      const fileText = await file.text();
      const parsed = parseCsv(fileText);
      setText(fileText);
      setHeaders([...parsed.headers]);
      setMapping(defaultMappingFromHeaders(parsed.headers));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse CSV";
      setError(message);
      setHeaders(null);
      setText(null);
    }
  };

  const result: RepresentativePreviewResult | null = useMemo(() => {
    if (!text || !headers) return null;
    try {
      return previewRepresentativeCsv(text, { mapping });
    } catch {
      return null;
    }
  }, [text, headers, mapping]);

  const updateColumn = (field: RepresentativeMappingField, value: string) => {
    const column = value === UNMAPPED ? null : value;
    setMapping((prev) => {
      const next = { ...prev };
      const current = prev[field];
      if (typeof current === "string" || current === null) {
        (next as Record<string, unknown>)[field] = column;
      } else if ("unit" in current) {
        (next as Record<string, unknown>)[field] = { ...current, column };
      } else {
        (next as Record<string, unknown>)[field] = { column };
      }
      return next;
    });
  };

  const updateUnit = (field: RepresentativeMappingField, unit: string) => {
    setMapping((prev) => {
      const current = prev[field];
      if (typeof current === "string" || current === null || !("unit" in current)) return prev;
      const next = { ...prev };
      if (field === "substrate_ec") {
        (next as Record<string, unknown>)[field] = { ...current, unit: unit as EcUnit };
      } else {
        (next as Record<string, unknown>)[field] = { ...current, unit: unit as TempUnit };
      }
      return next;
    });
  };

  const mappingColumn = (field: RepresentativeMappingField): string | null => {
    const v = mapping[field];
    if (v === null) return null;
    if (typeof v === "string") return v;
    return v.column;
  };

  const mappingUnit = (field: RepresentativeMappingField): string | null => {
    const v = mapping[field];
    if (v === null || typeof v === "string") return null;
    return "unit" in v ? v.unit : null;
  };

  return (
    <main className="container mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">CSV import</Badge>
          <Badge variant="outline">Representative sample</Badge>
          <Badge variant="destructive">Not live data</Badge>
        </div>
        <h1 className="text-2xl font-semibold">Representative CSV preview</h1>
        <p className="text-sm text-muted-foreground">
          Preview only. Nothing is saved. No data has been saved. CSV source, not live data.
          Review units before trusting values. Rows with invalid timestamps
          are blocked from canonical preview. Map your CSV headers to
          Verdant fields and pick units. This is a synthetic shape used to
          test Verdant&rsquo;s intake workflow — not a confirmed AROYA
          importer. Facility, Room, and Zone are preserved as context and
          are never used as Verdant tent or grow IDs.
        </p>
      </header>

      <section
        aria-label="Upload representative CSV sample"
        className="rounded-lg border border-dashed p-6"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Choose representative CSV sample file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => inputRef.current?.click()}>
            Choose CSV file
          </Button>
          <span className="text-sm text-muted-foreground">
            {fileName ? `Loaded: ${fileName}` : "No file selected"}
          </span>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      {headers && (
        <section
          aria-label="Map CSV columns to Verdant fields"
          className="space-y-3 rounded-lg border p-4"
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Map columns</h2>
            <p className="text-xs text-muted-foreground">
              Detected headers: {headers.join(", ") || "—"}
            </p>
          </div>

          <div
            aria-label="Mapping actions"
            className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3"
          >
            <label className="text-xs font-medium" htmlFor="csv-template">
              Apply template
            </label>
            <select
              id="csv-template"
              aria-label="Apply mapping template"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={templateId ?? ""}
              onChange={(e) => {
                const id = (e.target.value || null) as CsvMappingTemplateId | null;
                setTemplateId(id);
                setPresetNotice(null);
                if (!id || !headers) {
                  setTemplateNotice(null);
                  return;
                }
                const tpl = getCsvMappingTemplate(id);
                if (!tpl) return;
                const applied = applyCsvMappingTemplate(tpl, headers);
                setMapping(applied.mapping);
                const parts: string[] = [`Template "${tpl.name}" applied.`];
                if (applied.ambiguousFields.length > 0) {
                  parts.push(
                    `Multiple headers matched — review: ${applied.ambiguousFields.join(", ")}.`,
                  );
                }
                if (applied.unmatchedFields.length > 0) {
                  parts.push(
                    `No header found for: ${applied.unmatchedFields.join(", ")}.`,
                  );
                }
                setTemplateNotice(parts.join(" "));
              }}
            >
              <option value="">— Choose template —</option>
              {CSV_MAPPING_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const payload = buildMappingDownloadPayload({
                  mapping,
                  headers,
                  templateId,
                  templateName: templateId
                    ? getCsvMappingTemplate(templateId)?.name ?? null
                    : null,
                });
                const blob = new Blob([JSON.stringify(payload, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = csvMappingDownloadFileName();
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
            >
              Download mapping JSON
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const preset = buildCsvMappingPreset({
                  mapping,
                  templateId,
                  templateName: templateId
                    ? getCsvMappingTemplate(templateId)?.name ?? null
                    : null,
                });
                const ok = saveCsvMappingPreset(preset);
                setHasSavedPreset(ok);
                setPresetNotice(
                  ok
                    ? "Preset saved in this browser."
                    : "Could not save preset in this browser.",
                );
              }}
            >
              Save preset in this browser
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={!hasSavedPreset}
              onClick={() => {
                const preset = loadCsvMappingPreset();
                if (!preset || !headers) {
                  setPresetNotice("No saved preset found in this browser.");
                  return;
                }
                const applied = applyCsvMappingPreset(preset, headers);
                setMapping(applied.mapping);
                setTemplateId(preset.template_id);
                const parts: string[] = ["Saved preset applied."];
                if (applied.missingHeaders.length > 0) {
                  parts.push(
                    `Saved headers not found in this CSV: ${applied.missingHeaders
                      .map((m) => `${m.field}=${m.header}`)
                      .join(", ")}. Fields left unmapped — no guesses.`,
                  );
                }
                setPresetNotice(parts.join(" "));
              }}
            >
              Apply saved preset
            </Button>

            <Button
              type="button"
              variant="ghost"
              disabled={!hasSavedPreset}
              onClick={() => {
                clearCsvMappingPreset();
                setHasSavedPreset(false);
                setPresetNotice("Saved preset cleared from this browser.");
              }}
            >
              Clear saved preset
            </Button>
          </div>

          {templateNotice && (
            <p role="status" className="text-xs text-muted-foreground">
              {templateNotice}
            </p>
          )}
          {presetNotice && (
            <p role="status" className="text-xs text-muted-foreground">
              {presetNotice}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {FIELD_DESCRIPTORS.map((desc) => (
              <div key={desc.field} className="rounded-md border p-3">
                <label
                  className="block text-sm font-medium"
                  htmlFor={`map-${desc.field}`}
                >
                  {desc.label}
                </label>
                <p className="mb-2 text-xs text-muted-foreground">{desc.helper}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    id={`map-${desc.field}`}
                    aria-label={`Map ${desc.label}`}
                    className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                    value={mappingColumn(desc.field) ?? UNMAPPED}
                    onChange={(e) => updateColumn(desc.field, e.target.value)}
                  >
                    <option value={UNMAPPED}>— Not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {desc.units && (
                    <select
                      aria-label={`${desc.label} unit`}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={mappingUnit(desc.field) ?? desc.units[0]}
                      onChange={(e) => updateUnit(desc.field, e.target.value)}
                    >
                      {desc.units.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {result && <PreviewSummaryStrip result={result} />}
      {result && <PreviewTable result={result} mapping={mapping} />}
    </main>
  );
}

function PreviewSummaryStrip({ result }: { result: RepresentativePreviewResult }) {
  return (
    <section
      aria-label="Preview summary"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <SummaryCell label="Total rows" value={result.summary.total} />
      <SummaryCell label="Valid" value={result.summary.valid} />
      <SummaryCell label="Warnings" value={result.summary.warning} />
      <SummaryCell label="Invalid" value={result.summary.invalid} />
    </section>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function PreviewTable({
  result,
  mapping,
}: {
  result: RepresentativePreviewResult;
  mapping: RepresentativeColumnMapping;
}) {
  const rows = useMemo(() => result.rows, [result]);
  return (
    <section aria-label="Normalized representative CSV rows" className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Captured at (UTC)</TableHead>
            <TableHead>Sensor</TableHead>
            <TableHead>Room / Zone</TableHead>
            <TableHead>Air °C</TableHead>
            <TableHead>RH %</TableHead>
            <TableHead>VPD kPa</TableHead>
            <TableHead>CO₂ ppm</TableHead>
            <TableHead>PPFD</TableHead>
            <TableHead>VWC %</TableHead>
            <TableHead>EC mS/cm</TableHead>
            <TableHead>Sub °C</TableHead>
            <TableHead>Validation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <PreviewRow key={row.rowIndex} row={row} mapping={mapping} />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function stateVariant(state: RepresentativeDraftReading["state"]) {
  if (state === "invalid") return "destructive" as const;
  if (state === "warning") return "secondary" as const;
  return "outline" as const;
}

function fmt(n: number | null, digits = 2): string {
  if (n === null) return "—";
  return n.toFixed(digits);
}

function hintVariant(severity: CsvRowValidationHint["severity"]) {
  return severity === "invalid" ? ("destructive" as const) : ("secondary" as const);
}

function PreviewRow({
  row,
  mapping,
}: {
  row: RepresentativeDraftReading;
  mapping: RepresentativeColumnMapping;
}) {
  const outcome = useMemo(
    () => deriveCsvRowValidationHints({ row, mapping }),
    [row, mapping],
  );
  return (
    <TableRow data-row-canonical-previewable={outcome.canonicalPreviewable}>
      <TableCell>{row.rowIndex + 1}</TableCell>
      <TableCell>
        <Badge variant={stateVariant(row.state)}>{row.state}</Badge>
        {!outcome.canonicalPreviewable && (
          <div className="mt-1 text-[10px] uppercase text-destructive">
            Blocked from canonical preview
          </div>
        )}
      </TableCell>
      <TableCell>{row.captured_at ?? "—"}</TableCell>
      <TableCell>{row.sensor ?? "—"}</TableCell>
      <TableCell>
        {[row.room, row.zone].filter(Boolean).join(" / ") || "—"}
      </TableCell>
      <TableCell>{fmt(row.air_temp_c, 1)}</TableCell>
      <TableCell>{fmt(row.humidity_pct, 1)}</TableCell>
      <TableCell>{fmt(row.vpd_kpa, 2)}</TableCell>
      <TableCell>{fmt(row.co2_ppm, 0)}</TableCell>
      <TableCell>{fmt(row.ppfd, 0)}</TableCell>
      <TableCell>{fmt(row.vwc_pct, 1)}</TableCell>
      <TableCell>{fmt(row.substrate_ec_mscm, 2)}</TableCell>
      <TableCell>{fmt(row.substrate_temp_c, 1)}</TableCell>
      <TableCell className="space-y-1 text-xs">
        {outcome.hints.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <ul className="space-y-1">
            {outcome.hints.map((h) => (
              <li key={`${h.code}-${h.field ?? "row"}`} className="flex flex-wrap items-center gap-1">
                <Badge variant={hintVariant(h.severity)}>{h.severity}</Badge>
                <span className="text-muted-foreground">{h.message}</span>
              </li>
            ))}
          </ul>
        )}
      </TableCell>
    </TableRow>
  );
}
