/**
 * AiDoctorVpdDriftSection — read-only presenter for the "VPD Drift"
 * block inside AI Doctor context details.
 *
 * Safety:
 *  - Display only. No writes, no fetch, no supabase client, no
 *    edge-function invocation, no device control, no automation.
 *  - Classification logic lives in
 *    `buildAiDoctorVpdDriftSectionViewModel`; this file is presenter-only.
 *  - Renders nothing when `vpdDrift` is absent.
 */

import { Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AiDoctorVpdDriftContext } from "@/lib/vpdDriftRules";
import {
  buildAiDoctorVpdDriftSectionViewModel,
  type AiDoctorVpdDriftPresenterStatus,
} from "@/lib/aiDoctorVpdDriftContextViewModel";

interface Props {
  vpdDrift: AiDoctorVpdDriftContext | null | undefined;
  testId?: string;
  className?: string;
}

const TONE_CLASSES: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  muted: "text-muted-foreground",
  unavailable: "text-muted-foreground",
};

function StatusIcon({ status }: { status: AiDoctorVpdDriftPresenterStatus }) {
  if (status === "in_band") {
    return (
      <CheckCircle2
        className="h-3.5 w-3.5 text-emerald-500 shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === "sustained_high" || status === "sustained_low") {
    return (
      <AlertTriangle
        className="h-3.5 w-3.5 text-amber-500 shrink-0"
        aria-hidden="true"
      />
    );
  }
  return (
    <Info
      className="h-3.5 w-3.5 text-muted-foreground shrink-0"
      aria-hidden="true"
    />
  );
}

export default function AiDoctorVpdDriftSection({
  vpdDrift,
  testId = "ai-doctor-vpd-drift-section",
  className,
}: Props) {
  const vm = buildAiDoctorVpdDriftSectionViewModel(vpdDrift);
  if (!vm.visible) return null;

  return (
    <section
      aria-labelledby={`${testId}-heading`}
      data-testid={testId}
      data-status={vm.status}
      data-suggest-review={vm.suggestReview ? "true" : "false"}
      className={`rounded-md border border-border/40 bg-background/30 p-3 space-y-1.5 ${className ?? ""}`.trim()}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3
          id={`${testId}-heading`}
          className="text-xs font-semibold tracking-tight"
        >
          {vm.headingLabel}
        </h3>
        <span
          className={`inline-flex items-center gap-1 text-[11px] ${TONE_CLASSES[vm.statusTone]}`}
          data-testid={`${testId}-status`}
        >
          <StatusIcon status={vm.status} />
          {vm.statusLabel}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{vm.vpdLabel}</span>
          {vm.currentVpdLabel ? (
            <>
              {" "}
              ≈{" "}
              <strong data-testid={`${testId}-current`}>
                {vm.currentVpdLabel}
              </strong>
            </>
          ) : (
            <span data-testid={`${testId}-current-unavailable`}>
              {" "}
              — value unavailable
            </span>
          )}
        </span>
        {vm.targetBandLabel ? (
          <span data-testid={`${testId}-band`}>
            target {vm.targetBandLabel}
          </span>
        ) : null}
      </div>

      <p
        className="text-[11px] text-muted-foreground leading-snug"
        data-testid={`${testId}-primary`}
      >
        {vm.primaryCopy}
      </p>

      {vm.reviewCopy ? (
        <p
          className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug"
          data-testid={`${testId}-review`}
        >
          {vm.reviewCopy}
        </p>
      ) : null}

      <p
        className="text-[10px] text-muted-foreground italic leading-snug"
        data-testid={`${testId}-safety`}
      >
        {vm.safetyNote}
      </p>
    </section>
  );
}
