/**
 * SensorNormalizationPreviewPanel — read-only display surface for the
 * sensor normalization preview view model.
 *
 * Hard rules:
 *  - Presenter-only. No Supabase. No fetch. No mutations.
 *  - Never renders the underlying payload directly. Never renders
 *    privileged credentials, vendor secrets, or internal IDs.
 *  - Always advertises data-writes-enabled="false".
 */
import type {
  SensorNormalizationPreviewBadgeTone,
  SensorNormalizationPreviewViewModel,
} from "@/lib/sensors/sensorNormalizationPreviewViewModel";

export interface SensorNormalizationPreviewPanelProps {
  viewModel: SensorNormalizationPreviewViewModel;
  title?: string;
  variant?: "default" | "compact";
}

const TONE_CLASS: Record<SensorNormalizationPreviewBadgeTone, string> = {
  info: "border-sky-500/40 bg-sky-500/10 text-foreground",
  neutral: "border-border/60 bg-secondary/40 text-foreground",
  warning: "border-amber-500/40 bg-amber-500/10 text-foreground",
  danger: "border-destructive/40 bg-destructive/10 text-foreground",
  muted: "border-border/40 bg-muted/40 text-muted-foreground",
};

export function SensorNormalizationPreviewPanel({
  viewModel,
  title = "Normalization preview",
  variant = "default",
}: SensorNormalizationPreviewPanelProps): JSX.Element {
  const vm = viewModel;
  const compact = variant === "compact";
  return (
    <section
      data-testid="sensor-normalization-preview-panel"
      data-writes-enabled="false"
      aria-label={title}
      className="rounded-xl border border-border/60 bg-background/60 p-3 space-y-3"
    >
      <header className="space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <p
          data-testid="sensor-normalization-preview-disclaimer"
          className="text-[11px] text-muted-foreground"
        >
          {vm.disclaimer}
        </p>
      </header>

      <div
        data-testid="sensor-normalization-preview-badges"
        className="flex flex-wrap gap-1.5"
      >
        {vm.badges.map((b) => (
          <span
            key={b.label}
            data-testid="sensor-normalization-preview-badge"
            data-tone={b.tone}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${TONE_CLASS[b.tone]}`}
          >
            {b.label}
          </span>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <div>
          <dt className="font-semibold text-foreground">Tent ID</dt>
          <dd data-testid="sensor-normalization-preview-tent-status">
            {vm.tentIdStatus === "present" ? "Provided" : "Missing"}
          </dd>
        </div>
        {vm.plantIdStatus !== "not_applicable" && (
          <div>
            <dt className="font-semibold text-foreground">Plant ID</dt>
            <dd data-testid="sensor-normalization-preview-plant-status">
              {vm.plantIdStatus === "present" ? "Provided" : "Missing"}
            </dd>
          </div>
        )}
        <div>
          <dt className="font-semibold text-foreground">Captured at</dt>
          <dd data-testid="sensor-normalization-preview-captured-at">
            {vm.capturedAtDisplay}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Long-form rows</dt>
          <dd data-testid="sensor-normalization-preview-row-count">
            {vm.longFormRowCount}
          </dd>
        </div>
      </dl>

      {vm.warnings.length > 0 && (
        <ul
          data-testid="sensor-normalization-preview-warnings"
          className="flex flex-wrap gap-1.5"
        >
          {vm.warnings.map((w) => (
            <li
              key={w.code}
              data-testid="sensor-normalization-preview-warning"
              data-code={w.code}
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-foreground"
            >
              {w.label}
            </li>
          ))}
        </ul>
      )}

      {vm.metricRows.length > 0 && (
        <div
          data-testid="sensor-normalization-preview-metrics"
          className="rounded-lg border border-border/60 bg-secondary/20 p-2"
        >
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Normalized metrics
          </p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-medium">Metric</th>
                <th className="font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {vm.metricRows.map((r) => (
                <tr key={r.metric} data-testid="sensor-normalization-preview-metric-row">
                  <td className="font-mono">{r.metric}</td>
                  <td>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vm.longFormRows.length > 0 ? (
        <div
          data-testid="sensor-normalization-preview-long-form"
          className="rounded-lg border border-border/60 bg-secondary/20 p-2 overflow-x-auto"
        >
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Long-form row preview
          </p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-medium">Metric</th>
                <th className="font-medium">Value</th>
                <th className="font-medium">Source</th>
                <th className="font-medium">Identity</th>
                <th className="font-medium">Transport</th>
                <th className="font-medium">Confidence</th>
                <th className="font-medium">Captured At</th>
              </tr>
            </thead>
            <tbody>
              {vm.longFormRows.map((r, i) => (
                <tr
                  key={`${r.metric}-${i}`}
                  data-testid="sensor-normalization-preview-long-form-row"
                >
                  <td className="font-mono">{r.metric}</td>
                  <td>{r.value}</td>
                  <td>{r.source}</td>
                  <td>{r.source_identity}</td>
                  <td>{r.transport}</td>
                  <td>{r.confidence}</td>
                  <td className="font-mono">{r.captured_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p
          data-testid="sensor-normalization-preview-empty-state"
          className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground"
        >
          {vm.emptyState ?? ""}
        </p>
      )}

      <p
        data-testid="sensor-normalization-preview-raw-note"
        className="text-[11px] text-muted-foreground"
      >
        {vm.rawPayloadNote} Raw fields: {vm.rawPayloadFieldCount}
      </p>
    </section>
  );
}
