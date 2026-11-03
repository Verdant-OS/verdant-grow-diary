/**
 * Presenter for one tent's EcoWitt live station. All decisions live in
 * `buildEcowittCustomUploadStationCard`. This component does not read the
 * network, mint tokens, or send device commands.
 */
import { ECOWITT_CUSTOM_UPLOAD_COPY } from "@/constants/ecowittCustomUploadCopy";
import type { EcowittStationCardModel } from "@/lib/ecowittCustomUploadStationCardViewModel";

export interface EcowittCustomUploadStationCardProps {
  readonly model: EcowittStationCardModel;
  readonly onCreateLink?: () => void;
  readonly onRevokeLink?: () => void;
  readonly onRotateLink?: () => void;
  readonly creating?: boolean;
}

function Metric({ label, value, testId }: { label: string; value: string | null; testId: string }) {
  if (value === null) return null;
  return (
    <div data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-xl tabular-nums">{value}</dd>
    </div>
  );
}

export function EcowittCustomUploadStationCard(props: EcowittCustomUploadStationCardProps) {
  const { model, onCreateLink, onRevokeLink, onRotateLink, creating = false } = props;
  return (
    <section
      aria-label={model.sectionLabel}
      data-testid="ecowitt-custom-upload-station"
      data-freshness={model.freshness}
      className="mt-4 rounded-md border border-border/70 p-3"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{model.sectionLabel}</h4>
        {model.freshnessLabel ? (
          <span
            data-testid="ecowitt-custom-upload-freshness"
            className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          >
            {model.freshnessLabel}
          </span>
        ) : null}
      </header>

      {model.emptyMessage ? (
        <p data-testid="ecowitt-custom-upload-empty" className="text-sm text-muted-foreground">
          {model.emptyMessage}
        </p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          <Metric
            label={ECOWITT_CUSTOM_UPLOAD_COPY.indoorTemp}
            value={model.indoorTempF}
            testId="ecowitt-custom-upload-temp"
          />
          <Metric
            label={ECOWITT_CUSTOM_UPLOAD_COPY.indoorRh}
            value={model.indoorRh}
            testId="ecowitt-custom-upload-rh"
          />
          <Metric label="Soil moisture 1" value={model.soil1} testId="ecowitt-custom-upload-soil" />
          <Metric label="CO2" value={model.co2} testId="ecowitt-custom-upload-co2" />
        </dl>
      )}

      {model.edgeNote ? (
        <p
          data-testid="ecowitt-custom-upload-edge"
          className="mt-2 text-[11px] text-muted-foreground"
        >
          {model.edgeNote}
        </p>
      ) : null}

      {model.lastReadingLabel ? (
        <p
          data-testid="ecowitt-custom-upload-last"
          className="mt-2 text-[11px] text-muted-foreground"
        >
          {model.lastReadingLabel}
        </p>
      ) : null}

      <div className="mt-3" data-testid="ecowitt-custom-upload-settings">
        <p className="text-xs font-semibold">{model.settingsTitle}</p>
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {model.settings.map((setting) => (
            <div key={setting.label}>
              <dt className="text-muted-foreground">{setting.label}</dt>
              <dd data-testid={`ecowitt-custom-upload-setting-${setting.label.toLowerCase()}`}>
                {setting.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] text-muted-foreground">{model.tokenOnceNote}</p>
      </div>

      {model.createError ? (
        <p
          role="alert"
          data-testid="ecowitt-custom-upload-create-error"
          className="mt-2 text-sm text-destructive"
        >
          {model.createError}
        </p>
      ) : null}

      {model.canCreateLink && onCreateLink ? (
        <button
          type="button"
          className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm"
          data-testid="ecowitt-custom-upload-create"
          onClick={onCreateLink}
          disabled={creating}
        >
          {model.createLinkLabel}
        </button>
      ) : null}
      {model.canRevoke && onRevokeLink ? (
        <button
          type="button"
          className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm"
          data-testid="ecowitt-custom-upload-revoke"
          onClick={onRevokeLink}
          disabled={creating}
        >
          {model.revokeLinkLabel}
        </button>
      ) : null}
      {model.canRotate && onRotateLink ? (
        <button
          type="button"
          className="mt-3 ml-2 rounded-md border border-border px-3 py-1.5 text-sm"
          data-testid="ecowitt-custom-upload-rotate"
          onClick={onRotateLink}
          disabled={creating}
        >
          {model.rotateLinkLabel}
        </button>
      ) : null}
    </section>
  );
}
