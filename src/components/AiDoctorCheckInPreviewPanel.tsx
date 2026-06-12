/**
 * AiDoctorCheckInPreviewPanel — read-only "Preview AI Doctor Check-In"
 * action. Renders a button; when clicked, opens a Dialog showing the
 * deterministic Phase 1 preview output.
 *
 * Hard constraints:
 *  - No model/API calls. No Supabase. No alerts. No Action Queue writes.
 *  - Uses ONLY the already-compiled `AiDoctorContext` passed in.
 *  - Output is clearly labeled "Preview only — not saved." and
 *    "No live AI model was called."
 *  - Failures render a calm fallback message and never crash the page.
 */
import { useMemo, useState, useCallback } from "react";
import { Stethoscope, Copy, Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  buildAiDoctorCheckInPreviewView,
  type AiDoctorCheckInPreviewView,
} from "@/lib/aiDoctorCheckInPreviewViewModel";
import {
  formatAiDoctorCheckInReceipt,
  type AiDoctorCheckInReceiptInput,
} from "@/lib/aiDoctorCheckInReceiptView";
import {
  buildAiDoctorManualSaveConfirmationView,
  type AiDoctorManualSaveConfirmationView,
} from "@/lib/aiDoctorManualSaveConfirmationViewModel";
import type { AiDoctorContext } from "@/lib/aiDoctorEngine";

export interface AiDoctorCheckInPreviewPanelProps {
  context: AiDoctorContext;
  className?: string;
}

const RISK_BADGE: Record<string, string> = {
  low: "border-emerald-500/40 text-emerald-300",
  medium: "border-amber-500/40 text-amber-300",
  high: "border-rose-500/40 text-rose-300",
};

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1" data-testid={testId}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function BulletList({
  items,
  testId,
  emptyLabel,
}: {
  items: readonly string[];
  testId: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid={`${testId}-empty`}>
        {emptyLabel ?? "—"}
      </p>
    );
  }
  return (
    <ul
      className="list-disc pl-4 space-y-0.5 text-xs"
      data-testid={testId}
    >
      {items.map((it, idx) => (
        <li key={`${idx}-${it}`}>{it}</li>
      ))}
    </ul>
  );
}

function CopyPreviewSummary({
  view,
  context,
}: {
  view: AiDoctorCheckInPreviewView;
  context: AiDoctorContext;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const handleCopy = useCallback(async () => {
    setCopied(false);
    setCopyError(false);
    const receiptInput: AiDoctorCheckInReceiptInput = {
      view,
      plantName: context.plant_name,
      plantId: context.plant_id,
      stage: context.stage,
    };
    const receipt = formatAiDoctorCheckInReceipt(receiptInput);
    try {
      await navigator.clipboard.writeText(receipt.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  }, [view, context]);

  return (
    <div className="flex items-center gap-2" data-testid="ai-doctor-check-in-copy-section">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleCopy}
        data-testid="ai-doctor-check-in-copy-button"
      >
        {copied ? (
          <Check className="h-4 w-4 mr-1" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4 mr-1" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy preview summary"}
      </Button>
      {copied && (
        <span
          className="text-xs text-emerald-300"
          data-testid="ai-doctor-check-in-copy-success"
        >
          Preview summary copied.
        </span>
      )}
      {copyError && (
        <span
          className="text-xs text-amber-300"
          data-testid="ai-doctor-check-in-copy-error"
        >
          Copy unavailable. You can manually select the preview text.
        </span>
      )}
    </div>
  );
}

function PreviewBody({
  view,
  context,
}: {
  view: AiDoctorCheckInPreviewView;
  context: AiDoctorContext;
}) {
  return (
    <div
      className="space-y-3"
      data-testid="ai-doctor-check-in-preview-body"
      data-context-weak={view.contextWeak ? "true" : "false"}
    >
      <CopyPreviewSummary view={view} context={context} />

      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center rounded-md border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
          data-testid="ai-doctor-check-in-preview-notice"
        >
          {view.notices.previewOnly}
        </span>
        <span
          className="inline-flex items-center rounded-md border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
          data-testid="ai-doctor-check-in-preview-no-model-notice"
        >
          {view.notices.noModelCalled}
        </span>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
            RISK_BADGE[view.riskLevel] ?? "border-border/60 text-muted-foreground"
          }`}
          data-testid="ai-doctor-check-in-preview-risk"
        >
          Risk: {view.riskLevel}
        </span>
        <span
          className="inline-flex items-center rounded-md border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
          data-testid="ai-doctor-check-in-preview-confidence"
        >
          Confidence: {view.confidenceBand} ({view.confidence.toFixed(2)})
        </span>
      </div>

      <Section title="Summary" testId="ai-doctor-check-in-preview-summary-section">
        <p className="text-xs" data-testid="ai-doctor-check-in-preview-summary">
          {view.summary}
        </p>
        {view.likelyIssue ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Likely issue: </span>
            <span data-testid="ai-doctor-check-in-preview-likely-issue">
              {view.likelyIssue}
            </span>
          </p>
        ) : null}
      </Section>

      <Section title="Evidence" testId="ai-doctor-check-in-preview-evidence-section">
        <BulletList
          items={view.evidence}
          testId="ai-doctor-check-in-preview-evidence"
          emptyLabel="No evidence collected for this preview."
        />
      </Section>

      <Section
        title="Missing information"
        testId="ai-doctor-check-in-preview-missing-section"
      >
        <BulletList
          items={view.missingInformation}
          testId="ai-doctor-check-in-preview-missing"
          emptyLabel="No critical missing information detected."
        />
      </Section>

      <Section
        title="Possible causes"
        testId="ai-doctor-check-in-preview-causes-section"
      >
        <BulletList
          items={view.possibleCauses}
          testId="ai-doctor-check-in-preview-causes"
        />
      </Section>

      <Section
        title="Immediate action"
        testId="ai-doctor-check-in-preview-immediate-section"
      >
        <p
          className="text-xs"
          data-testid="ai-doctor-check-in-preview-immediate"
        >
          {view.immediateAction}
        </p>
      </Section>

      <Section
        title="What not to do"
        testId="ai-doctor-check-in-preview-never-section"
      >
        <BulletList
          items={view.whatNotToDo}
          testId="ai-doctor-check-in-preview-never"
        />
      </Section>

      <Section title="24-hour follow-up" testId="ai-doctor-check-in-preview-24h-section">
        <p className="text-xs" data-testid="ai-doctor-check-in-preview-24h">
          {view.followUp24h}
        </p>
      </Section>

      <Section
        title="3-day recovery plan"
        testId="ai-doctor-check-in-preview-3d-section"
      >
        <p className="text-xs" data-testid="ai-doctor-check-in-preview-3d">
          {view.recoveryPlan3Day}
        </p>
      </Section>

      {view.limitations.length > 0 ? (
        <Section
          title="Data limitations"
          testId="ai-doctor-check-in-preview-limitations-section"
        >
          <ul
            className="list-disc pl-4 space-y-0.5 text-xs"
            data-testid="ai-doctor-check-in-preview-limitations"
          >
            {view.limitations.map((l) => (
              <li
                key={l.code}
                data-testid={`ai-doctor-check-in-preview-limitation-${l.code}`}
              >
                {l.message}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {view.actionQueueSuggestion ? (
        <Section
          title="Action Queue suggestion (advisory, approval-required)"
          testId="ai-doctor-check-in-preview-aqs-section"
        >
          <p
            className="text-xs"
            data-testid="ai-doctor-check-in-preview-aqs"
            data-status={view.actionQueueSuggestion.status}
            data-risk={view.actionQueueSuggestion.risk_level}
          >
            {view.actionQueueSuggestion.reason}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Status: {view.actionQueueSuggestion.status} · Type: advisory · Not
            created.
          </p>
        </Section>
      ) : null}
    </div>
  );
}

function PreviewFallback() {
  return (
    <p
      className="text-xs text-muted-foreground"
      data-testid="ai-doctor-check-in-preview-fallback"
    >
      AI Doctor preview is not available right now. Nothing was saved.
    </p>
  );
}

export default function AiDoctorCheckInPreviewPanel({
  context,
  className,
}: AiDoctorCheckInPreviewPanelProps) {
  const [open, setOpen] = useState(false);

  const view = useMemo(() => {
    if (!open) return null;
    try {
      return buildAiDoctorCheckInPreviewView(context);
    } catch {
      return null;
    }
  }, [open, context]);

  return (
    <div
      className={`flex items-center justify-end ${className ?? ""}`}
      data-testid="ai-doctor-check-in-preview-panel"
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="ai-doctor-check-in-preview-button"
          >
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
            Preview AI Doctor Check-In
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
          data-testid="ai-doctor-check-in-preview-dialog"
        >
          <DialogHeader>
            <DialogTitle>Preview AI Doctor Check-In</DialogTitle>
            <DialogDescription>
              Deterministic, local preview only. No diagnoses, alerts, or
              Action Queue items are created.
            </DialogDescription>
          </DialogHeader>
          {view ? <PreviewBody view={view} context={context} /> : <PreviewFallback />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
