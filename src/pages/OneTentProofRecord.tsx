/**
 * Operator: One-Tent Proof Record export screen.
 *
 * Review-only. Compiles operator-pasted evidence from a manual One-Tent Loop
 * walkthrough into a downloadable JSON file.
 *
 * Safe-by-Design:
 *  - No Supabase reads or writes.
 *  - No fetch, no rpc, no Edge Function calls.
 *  - No sensor / alert / Action Queue / target writes.
 *  - No automation. No device control.
 *  - Never generates fake proof data — missing fields stay missing.
 *  - Source labels are preserved verbatim and never imply "live" unless
 *    the operator captured an actual `live` label.
 */
import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildOneTentProofRecord,
  buildProofRecordFilename,
  serializeProofRecordToJson,
  type ProofRecordInput,
  type ProofSourceLabel,
} from "@/lib/oneTentProofRecordExportRules";

const SOURCE_OPTIONS: ProofSourceLabel[] = [
  "manual",
  "live",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
];

const EMPTY: ProofRecordInput = {
  scope: {},
  reading: {},
  target: {},
  alert: {},
  action: {},
  followup: {},
};

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export default function OneTentProofRecord() {
  const [input, setInput] = useState<ProofRecordInput>(EMPTY);

  const update = <K extends keyof ProofRecordInput>(
    key: K,
    patch: Partial<NonNullable<ProofRecordInput[K]>>,
  ) => {
    setInput((prev) => ({
      ...prev,
      [key]: { ...(prev[key] as object | undefined), ...patch },
    }));
  };

  const record = useMemo(
    () => buildOneTentProofRecord({ ...input, assembledAt: new Date().toISOString() }),
    [input],
  );

  const json = useMemo(() => serializeProofRecordToJson(record), [record]);

  const handleDownload = () => {
    const filename = buildProofRecordFilename(new Date());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sourceLabel = input.reading?.sourceLabel;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Proof Record
          </span>
          <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Review only
          </span>
          {sourceLabel ? (
            <span
              data-testid="active-source-label"
              className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase text-primary"
            >
              Source: {sourceLabel}
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          One-Tent Proof Record
        </h1>
        <p className="text-sm text-muted-foreground">
          Operator-only export screen. Paste the captured evidence from one
          real or manual end-to-end Verdant loop. JSON is built client-side.
          No live data is implied unless the source label says so.
        </p>
        <p className="text-xs text-muted-foreground">
          Allowed source labels: Manual / Live / CSV / Demo / Stale / Invalid.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Scope</CardTitle>
          <CardDescription>Grow / tent / plant identifiers as shown in the app.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="grow-name" label="Grow name" value={input.scope?.growName ?? ""} onChange={(v) => update("scope", { growName: v })} />
          <Field id="grow-id" label="Grow id" value={input.scope?.growId ?? ""} onChange={(v) => update("scope", { growId: v })} />
          <Field id="tent-name" label="Tent name" value={input.scope?.tentName ?? ""} onChange={(v) => update("scope", { tentName: v })} />
          <Field id="tent-id" label="Tent id" value={input.scope?.tentId ?? ""} onChange={(v) => update("scope", { tentId: v })} />
          <Field id="plant-name" label="Plant name" value={input.scope?.plantName ?? ""} onChange={(v) => update("scope", { plantName: v })} />
          <Field id="plant-id" label="Plant id" value={input.scope?.plantId ?? ""} onChange={(v) => update("scope", { plantId: v })} />
          <Field id="stage" label="Stage / day" value={input.scope?.stage ?? ""} onChange={(v) => update("scope", { stage: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Manual reading</CardTitle>
          <CardDescription>Captured values and the source label as rendered in the UI.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="r-metric" label="Metric" value={input.reading?.metric ?? ""} onChange={(v) => update("reading", { metric: v })} />
          <Field id="r-value" label="Value" value={String(input.reading?.value ?? "")} onChange={(v) => update("reading", { value: v })} />
          <Field id="r-unit" label="Unit" value={input.reading?.unit ?? ""} onChange={(v) => update("reading", { unit: v })} />
          <Field id="r-captured" label="Captured at (ISO)" value={input.reading?.capturedAt ?? ""} onChange={(v) => update("reading", { capturedAt: v })} />
          <div className="space-y-1">
            <Label htmlFor="r-source" className="text-xs">Source label (as shown)</Label>
            <select
              id="r-source"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={input.reading?.sourceLabel ?? ""}
              onChange={(e) => update("reading", { sourceLabel: (e.target.value || undefined) as ProofSourceLabel | undefined })}
            >
              <option value="">(not captured)</option>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <Field id="r-route" label="Route observed" value={input.reading?.routeObserved ?? ""} onChange={(v) => update("reading", { routeObserved: v })} />
          <Field id="snapshot-route" label="Latest snapshot route" value={input.snapshotRoute ?? ""} onChange={(v) => setInput((p) => ({ ...p, snapshotRoute: v }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Target (original → temporary → restored)</CardTitle>
          <CardDescription>Capture original value before changing. Restore at end.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="t-metric" label="Target metric" value={input.target?.metric ?? ""} onChange={(v) => update("target", { metric: v })} />
          <Field id="t-original" label="Original target value" value={String(input.target?.originalValue ?? "")} onChange={(v) => update("target", { originalValue: v })} />
          <Field id="t-temp" label="Temporary target value" value={String(input.target?.temporaryValue ?? "")} onChange={(v) => update("target", { temporaryValue: v })} />
          <div className="flex items-center gap-2 pt-5">
            <input
              id="t-restored"
              type="checkbox"
              checked={input.target?.restored === true}
              onChange={(e) => update("target", { restored: e.target.checked })}
            />
            <Label htmlFor="t-restored" className="text-xs">Target restored to original</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">4. Alert</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="a-id" label="Alert id" value={input.alert?.id ?? ""} onChange={(v) => update("alert", { id: v })} />
          <Field id="a-metric" label="Alert metric" value={input.alert?.metric ?? ""} onChange={(v) => update("alert", { metric: v })} />
          <Field id="a-sev" label="Alert severity" value={input.alert?.severity ?? ""} onChange={(v) => update("alert", { severity: v })} />
          <Field id="a-created" label="Alert created at (ISO)" value={input.alert?.createdAt ?? ""} onChange={(v) => update("alert", { createdAt: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">5. Action Queue item</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="act-id" label="Action id" value={input.action?.id ?? ""} onChange={(v) => update("action", { id: v })} />
          <Field id="act-status" label="Action status" value={input.action?.status ?? ""} onChange={(v) => update("action", { status: v })} />
          <Field id="act-result" label="Completion result" value={input.action?.completionResult ?? ""} onChange={(v) => update("action", { completionResult: v })} />
          <Field id="act-completed" label="Completed at (ISO)" value={input.action?.completedAt ?? ""} onChange={(v) => update("action", { completedAt: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">6. Follow-up</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="f-diary" label="Follow-up diary entry id" value={input.followup?.diaryEntryId ?? ""} onChange={(v) => update("followup", { diaryEntryId: v })} />
          <div className="flex items-center gap-2 pt-5">
            <input
              id="f-chip"
              type="checkbox"
              checked={input.followup?.timelineChipVisible === true}
              onChange={(e) => update("followup", { timelineChipVisible: e.target.checked })}
            />
            <Label htmlFor="f-chip" className="text-xs">Timeline follow-up chip visible</Label>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input
              id="f-link"
              type="checkbox"
              checked={input.followup?.actionDetailLinkVisible === true}
              onChange={(e) => update("followup", { actionDetailLinkVisible: e.target.checked })}
            />
            <Label htmlFor="f-link" className="text-xs">ActionDetail follow-up link visible</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">7. UX friction notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="ux-notes"
            rows={4}
            value={input.uxFrictionNotes ?? ""}
            onChange={(e) => setInput((p) => ({ ...p, uxFrictionNotes: e.target.value }))}
            placeholder="Anything slow, confusing, or unsafe-feeling along the loop."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview &amp; download</CardTitle>
          <CardDescription>
            JSON is generated entirely client-side. A printable export is
            deferred until the project ships a shared safe export helper for
            this surface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownload} data-testid="download-proof-record">
              Download JSON
            </Button>
          </div>
          <pre
            data-testid="proof-record-preview"
            className="max-h-96 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs"
          >
            {json}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
