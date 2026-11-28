import TentSensorStripFreshnessLine from "@/components/TentSensorStripFreshnessLine";
import {
  TENT_SENSOR_STRIP_COPY,
  type TentSensorStripFreshness,
  type TentSensorStripVpd,
} from "@/lib/tentSensorStripRules";

export interface TentSensorStripProps {
  /** Freshness of the air temperature and RH the strip shows. */
  climateFreshness: TentSensorStripFreshness;
  /** Display-ready air temperature, or null when not reported. */
  temperature: { value: string; unit: string } | null;
  /** Display-ready relative humidity (without the % sign), or null when not reported. */
  humidity: string | null;
  vpd: TentSensorStripVpd;
  /** Display-ready VPD value (without the kPa unit), used when vpd.value is set. */
  vpdDisplay: string | null;
}

function Reading({
  label,
  value,
  unit,
  testId,
}: {
  label: string;
  value: string | null;
  unit: string;
  testId: string;
}) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums leading-tight">
        {value === null ? (
          <span className="text-sm font-normal text-muted-foreground">
            {TENT_SENSOR_STRIP_COPY.notReported}
          </span>
        ) : (
          <>
            {value}
            <span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span>
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * Compact sensor strip directly under Plants on Grow → Tent (Cheek,
 * 2026-11-28). When two values fit at a readable size it shows air temperature
 * and RH; when only one fits it shows VPD in kPa. Both layouts carry their own
 * freshness. Which one shows follows the strip's own width in rem (a container
 * query), so enlarged text also falls back to the single value. Detailed
 * metrics stay farther down the page.
 */
export default function TentSensorStrip({
  climateFreshness,
  temperature,
  humidity,
  vpd,
  vpdDisplay,
}: TentSensorStripProps) {
  const hasClimate = temperature !== null || humidity !== null;
  return (
    <section
      aria-labelledby="tent-detail-sensor-strip-heading"
      className="@container glass rounded-2xl p-3 mb-4"
      data-testid="tent-detail-sensor-strip"
    >
      <h2 id="tent-detail-sensor-strip-heading" className="mb-1 font-display text-sm font-semibold">
        {TENT_SENSOR_STRIP_COPY.heading}
      </h2>
      <div className="hidden @min-[15rem]:block" data-testid="tent-detail-sensor-strip-climate">
        {hasClimate ? (
          <dl className="mb-1 grid grid-cols-2 gap-3">
            <Reading
              label={TENT_SENSOR_STRIP_COPY.airLabel}
              value={temperature?.value ?? null}
              unit={temperature?.unit ?? ""}
              testId="tent-detail-sensor-strip-air"
            />
            <Reading
              label={TENT_SENSOR_STRIP_COPY.rhLabel}
              value={humidity}
              unit="%"
              testId="tent-detail-sensor-strip-rh"
            />
          </dl>
        ) : null}
        <TentSensorStripFreshnessLine freshness={climateFreshness} />
      </div>
      <div className="block @min-[15rem]:hidden" data-testid="tent-detail-sensor-strip-vpd-only">
        {vpd.value === null || vpdDisplay === null ? (
          <p
            className="mb-1 text-sm text-muted-foreground"
            data-testid="tent-detail-sensor-strip-vpd-unavailable"
          >
            {TENT_SENSOR_STRIP_COPY.vpdUnavailable}
          </p>
        ) : (
          <>
            <dl className="mb-1">
              <Reading
                label={TENT_SENSOR_STRIP_COPY.vpdLabel}
                value={vpdDisplay}
                unit="kPa"
                testId="tent-detail-sensor-strip-vpd"
              />
            </dl>
            {vpd.calculated ? (
              <p className="mb-1 text-xs text-muted-foreground">
                {TENT_SENSOR_STRIP_COPY.calculated}
              </p>
            ) : null}
            <TentSensorStripFreshnessLine
              freshness={vpd.freshness}
              testIdPrefix="tent-detail-sensor-strip-vpd"
            />
          </>
        )}
      </div>
    </section>
  );
}
