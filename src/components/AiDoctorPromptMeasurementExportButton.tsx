/**
 * AiDoctorPromptMeasurementExportButton — diagnostics-only export button.
 *
 * Presenter only. Pulls captured AI Doctor prompt measurements from the
 * provided store and downloads them as CSV. Disabled when nothing has been
 * captured.
 *
 * This component is NOT mounted in the normal grower flow. Mount only inside
 * an explicit diagnostics/operator panel.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  getDefaultAiDoctorPromptMeasurementCaptureStore,
  type AiDoctorPromptMeasurementCaptureStore,
} from "@/lib/cost/aiDoctorPromptMeasurementCaptureStore";
import {
  AI_DOCTOR_PROMPT_MEASUREMENT_CSV_FILENAME,
  serializeAiDoctorPromptMeasurementsToCsv,
} from "@/lib/cost/aiDoctorPromptMeasurementCsvExport";

export interface AiDoctorPromptMeasurementExportButtonProps {
  readonly store?: AiDoctorPromptMeasurementCaptureStore;
  readonly filename?: string;
  /** Test seam for download trigger. */
  readonly onDownload?: (filename: string, csv: string) => void;
  readonly className?: string;
}

function triggerBrowserDownload(filename: string, csv: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}

export function AiDoctorPromptMeasurementExportButton(
  props: AiDoctorPromptMeasurementExportButtonProps,
): JSX.Element {
  const store = useMemo(
    () => props.store ?? getDefaultAiDoctorPromptMeasurementCaptureStore(),
    [props.store],
  );
  // Re-render only when consumer triggers; for diagnostics use a snapshot.
  const size = useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, 1000);
      return () => clearInterval(id);
    },
    () => store.size(),
    () => 0,
  );

  const disabled = size === 0;
  const filename = props.filename ?? AI_DOCTOR_PROMPT_MEASUREMENT_CSV_FILENAME;

  const handleClick = useCallback(() => {
    const csv = serializeAiDoctorPromptMeasurementsToCsv(store.list());
    if (props.onDownload) {
      props.onDownload(filename, csv);
      return;
    }
    triggerBrowserDownload(filename, csv);
  }, [store, props, filename]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={handleClick}
      className={props.className}
      aria-label="Export AI Doctor prompt measurements (diagnostics CSV)"
    >
      Export prompt measurements (diagnostics CSV)
      {size > 0 ? ` · ${size}` : ""}
    </Button>
  );
}

export default AiDoctorPromptMeasurementExportButton;
