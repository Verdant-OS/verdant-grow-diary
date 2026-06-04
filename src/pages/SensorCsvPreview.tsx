import CsvSensorPreviewPanel from "@/components/CsvSensorPreviewPanel";
import CsvPreviewHelpPanel from "@/components/CsvPreviewHelpPanel";
import CsvPreviewRecordingGuide from "@/components/CsvPreviewRecordingGuide";

/**
 * SensorCsvPreview — read-only CSV preview page.
 *
 * Safe-by-Design: no DB writes, no Supabase, no Edge Functions, no alerts,
 * no Action Queue items, no AI calls, no device control, no automation.
 * Files are parsed entirely in-browser and never uploaded anywhere.
 */
export default function SensorCsvPreview() {
  return (
    <main className="container mx-auto max-w-5xl p-4 md:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          CSV Sensor Preview
        </h1>
        <p className="text-sm text-muted-foreground">
          Drop a sensor export to see how Verdant would map its columns into
          plant memory — without saving anything.
        </p>
      </header>
      <CsvPreviewHelpPanel />
      <CsvPreviewRecordingGuide />
      <CsvSensorPreviewPanel />
    </main>
  );
}
