import { useEffect } from "react";
import CsvSensorPreviewPanel from "@/components/CsvSensorPreviewPanel";
import CsvPreviewHelpPanel from "@/components/CsvPreviewHelpPanel";
import CsvPreviewRecordingGuide from "@/components/CsvPreviewRecordingGuide";
import { usePageSeo } from "@/hooks/usePageSeo";
import { buildCsvHistorySignupPath } from "@/lib/csvHistoryOnboardingIntentRules";
import { trackPricingEvent } from "@/lib/pricingAnalytics";

const CSV_HISTORY_PREVIEW_SIGNUP_PATH = buildCsvHistorySignupPath();

/**
 * SensorCsvPreview — read-only CSV preview page.
 *
 * Safe-by-Design: no DB writes, no Supabase, no Edge Functions, no alerts,
 * no Action Queue items, no AI calls, no device control, no automation.
 * Files are parsed entirely in-browser and never uploaded anywhere.
 */
export default function SensorCsvPreview() {
  usePageSeo({
    title: "CSV Sensor Preview | Verdant Grow Diary",
    description:
      "Preview a sensor CSV or TSV locally in your browser before creating a Verdant account. Nothing is uploaded or saved.",
    path: "/sensors/csv-preview",
    noindex: true,
  });

  useEffect(() => {
    trackPricingEvent("csv_history_preview_page_view", { source: "csv_history" });
  }, []);

  return (
    <main className="container mx-auto max-w-5xl p-4 md:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">CSV Sensor Preview</h1>
        <p className="text-sm text-muted-foreground">
          Drop a sensor export to see how Verdant would map its columns into plant memory — without
          saving anything.
        </p>
      </header>
      <CsvPreviewHelpPanel />
      <CsvPreviewRecordingGuide />
      <CsvSensorPreviewPanel
        conversionHref={CSV_HISTORY_PREVIEW_SIGNUP_PATH}
        onConversionClick={() =>
          trackPricingEvent("csv_history_preview_signup_clicked", {
            source: "csv_history",
            item: "preview_result",
          })
        }
      />
    </main>
  );
}
