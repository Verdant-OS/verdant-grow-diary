/**
 * Operator: One-Tent Proof Record export screen.
 *
 * Operator Self-Report (unverified). Compiles operator-pasted evidence from
 * a manual One-Tent Loop walkthrough into a downloadable JSON file.
 *
 * Safe-by-Design:
 *  - No Supabase reads or writes.
 *  - No fetch, no rpc, no Edge Function calls.
 *  - No sensor / alert / Action Queue / target writes.
 *  - No automation. No device control.
 *  - Never generates fake proof data — missing fields stay null.
 *  - The exported record self-identifies as `unverified: true` via the
 *    computed `integrity` block so partners can't mistake a self-report
 *    for verified loop traversal.
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
  ALLOWED_SOURCE_LABELS,
  buildOneTentProofRecord,
  buildProofRecordFilename,
  canExportProofRecord,
  serializeProofRecordToJson,
  type ProofRecordInput,
  type ProofSourceLabel,
} from "@/lib/oneTentProofRecordExportRules";

const EMPTY: ProofRecordInput = {
  scope: {},
  quickLog: {},
  timeline: {},
  reading: {},
  aiDoctor: {},
  target: {},
  alert: {},
  action: { approvalGate: {} },
  followup: {},
};

const ALLOWED_LABELS_COPY = ALLOWED_SOURCE_LABELS.map(
  (l) => l.charAt(0).toUpperCase() + l.slice(1),
).join(" / ");

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

  const updateApprovalGate = (
    patch: Partial<NonNullable<NonNullable<ProofRecordInput["action"]>["approvalGate"]>>,
  ) => {
    setInput((prev) => ({
      ...prev,
      action: {
        ...(prev.action ?? {}),
        approvalGate: { ...(prev.action?.approvalGate ?? {}), ...patch },
      },
    }));
  };

  const record = useMemo(
    () => buildOneTentProofRecord({ ...input, assembledAt: new Date().toISOString() }),
    [input],
  );

  const json = useMemo(() => serializeProofRecordToJson(record), [record]);
  const canExport = canExportProofRecord(record);

  const handleDownload = () => {
    if (!canExport) return;
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
  const capturedAt = (input.reading?.capturedAt ?? "").trim();
  // Tightened live chip: only render `Source: live` when the operator both
  // selected `live` AND captured a timestamp. Other source labels render as
  // soon as a label is selected (they don't carry the same trust weight).
  const showSourceChip =
    Boolean(sourceLabel) && (sourceLabel !== "live" || capturedAt.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="chip-proof-record" className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Proof Record
          </span>
          <span data-testid="chip-review-only" className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Review only
          </span>
          <span
            data-testid="chip-unverified"
            className="inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium uppercase text-destructive"
          >
            Unverified
          </span>
          {showSourceChip ? (
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
        <p
          data-testid="self-report-subhead"
          className="text-sm font-medium text-foreground"
        >
          Operator Self-Report (unverified)
        </p>
        <p className="text-sm text-muted-foreground">
          Operator-only export screen. Paste the captured evidence from one
          real or manual end-to-end Verdant loop. JSON is built client-side.
          No live data is implied unless the source label says so.
        </p>
        <p
          data-testid="allowed-labels-copy"
          className="text-xs text-muted-foreground"
        >
          Allowed source labels: {ALLOWED_LABELS_COPY}.
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
          <CardTitle className="text-base">2. Quick Log</CardTitle>
          <CardDescription>The diary entry created during Quick Log.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="ql-id" label="Quick Log diary entry id" value={input.quickLog?.diaryEntryId ?? ""} onChange={(v) => update("quickLog", { diaryEntryId: v })} />
          <Field id="ql-action" label="Action type" value={input.quickLog?.actionType ?? ""} onChange={(v) => update("quickLog", { actionType: v })} />
          <div className="flex items-center gap-2 pt-5">
            <input
              id="ql-photo"
              type="checkbox"
              checked={input.quickLog?.photoAttached === true}
              onChange={(e) => update("quickLog", { photoAttached: e.target.checked })}
            />
            <Label htmlFor="ql-photo" className="text-xs">Photo attached</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Timeline</CardTitle>
          <CardDescription>Proof the Quick Log rendered on the Timeline.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="tl-row" label="Timeline row id" value={input.timeline?.rowId ?? ""} onChange={(v) => update("timeline", { rowId: v })} />
          <Field id="tl-route" label="Timeline route observed" value={input.timeline?.routeObserved ?? ""} onChange={(v) => update("timeline", { routeObserved: v })} />
          <div className="flex items-center gap-2 pt-5">
            <input
              id="tl-chip"
              type="checkbox"
              checked={input.timeline?.chipVisible === true}
              onChange={(e) => update("timeline", { chipVisible: e.target.checked })}
            />
            <Label htmlFor="tl-chip" className="text-xs">Timeline chip visible</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">4. Manual reading</CardTitle>
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
              data-testid="source-label-select"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={input.reading?.sourceLabel ?? ""}
              onChange={(e) => update("reading", { sourceLabel: (e.target.value || undefined) as ProofSourceLabel | undefined })}
            >
              <option value="">(not captured)</option>
              {ALLOWED_SOURCE_LABELS.map((opt) => (
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
          <CardTitle className="text-base">5. AI Doctor</CardTitle>
          <CardDescription>Cautious-AI session evidence (confidence, risk, presence of missing_info / do_not_do).</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="ai-session" label="AI Doctor session id" value={input.aiDoctor?.sessionId ?? ""} onChange={(v) => update("aiDoctor", { sessionId: v })} />
          <Field id="ai-confidence" label="Confidence" value={input.aiDoctor?.confidence ?? ""} onChange={(v) => update("aiDoctor", { confidence: v })} />
          <Field id="ai-risk" label="Risk level" value={input.aiDoctor?.riskLevel ?? ""} onChange={(v) => update("aiDoctor", { riskLevel: v })} />
          <div className="flex items-center gap-2 pt-5">
            <input
              id="ai-missing"
              type="checkbox"
              checked={input.aiDoctor?.missingInfoPresent === true}
              onChange={(e) => update("aiDoctor", { missingInfoPresent: e.target.checked })}
            />
            <Label htmlFor="ai-missing" className="text-xs">missing_info present</Label>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input
              id="ai-do-not-do"
              type="checkbox"
              checked={input.aiDoctor?.doNotDoPresent === true}
              onChange={(e) => update("aiDoctor", { doNotDoPresent: e.target.checked })}
            />
            <Label htmlFor="ai-do-not-do" className="text-xs">do_not_do present</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">6. Target (original → temporary → restored)</CardTitle>
          <CardDescription>Capture original value before changing. Restore at end.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="t-metric" label="Target metric" value={input.target?.metric ?? ""} onChange={(v) => update("target", { metric: v })} />
          <Field id="t-original" label="Original target value" value={String(input.target?.originalValue ?? "")} onChange={(v) => update("target", { originalValue: v })} />
          <Field id="t-temp" label="Temporary target value" value={String(input.target?.temporaryValue ?? "")} onChange={(v) => update("target", { temporaryValue: v })} />
          <Field id="t-restored-at" label="Restored at (ISO)" value={input.target?.restoredAt ?? ""} onChange={(v) => update("target", { restoredAt: v })} />
          <Field id="t-restore-diary" label="Restore diary entry id" value={input.target?.restoreDiaryEntryId ?? ""} onChange={(v) => update("target", { restoreDiaryEntryId: v })} />
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
          <CardTitle className="text-base">7. Alert</CardTitle>
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
          <CardTitle className="text-base">8. Action Queue item</CardTitle>
          <CardDescription>Approval gate must remain operator-driven.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="act-id" label="Action id" value={input.action?.id ?? ""} onChange={(v) => update("action", { id: v })} />
          <Field id="act-status" label="Action status" value={input.action?.status ?? ""} onChange={(v) => update("action", { status: v })} />
          <Field id="act-linked-alert" label="Linked alert id" value={input.action?.linkedAlertId ?? ""} onChange={(v) => update("action", { linkedAlertId: v })} />
          <Field id="act-result" label="Completion result" value={input.action?.completionResult ?? ""} onChange={(v) => update("action", { completionResult: v })} />
          <Field id="act-completed" label="Completed at (ISO)" value={input.action?.completedAt ?? ""} onChange={(v) => update("action", { completedAt: v })} />
          <Field id="act-approved-at" label="Approved at (ISO)" value={input.action?.approvalGate?.approvedAt ?? ""} onChange={(v) => updateApprovalGate({ approvedAt: v })} />
          <div className="flex items-center gap-2 pt-5">
            <input
              id="act-approval-required"
              type="checkbox"
              checked={input.action?.approvalGate?.requiredObserved === true}
              onChange={(e) => updateApprovalGate({ requiredObserved: e.target.checked })}
            />
            <Label htmlFor="act-approval-required" className="text-xs">Approval gate observed (required)</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">9. Follow-up</CardTitle>
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
          <CardTitle className="text-base">10. UX friction notes</CardTitle>
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
          {!canExport && (
            <p
              role="status"
              data-testid="empty-record-helper"
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              Record is empty — fill at least scope + one loop step before exporting.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleDownload}
              data-testid="download-proof-record"
              disabled={!canExport}
            >
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
