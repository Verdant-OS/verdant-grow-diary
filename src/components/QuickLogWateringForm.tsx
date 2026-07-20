/** Presenter-only structured Water form for Quick Log V2. */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type QuickLogWateringFormState } from "@/lib/quickLogWateringFormViewModel";
import {
  buildWateringReview,
  WATERING_REVIEW_NEEDS_INPUT,
  WATERING_REVIEW_TITLE,
} from "@/lib/quickLogWateringReviewViewModel";
import type { QuickLogWateringContextViewModel } from "@/lib/quickLogWateringContextViewModel";
import { updateEcPpm500Pair, type EcPpm500EditSource } from "@/lib/ecPpm500PairRules";
import {
  buildEcCompensationPreview,
  EC_COMPENSATION_PREVIEW_DISCLAIMER,
} from "@/lib/ecCompensationPreviewViewModel";

interface Props {
  value: QuickLogWateringFormState;
  onChange: (next: QuickLogWateringFormState) => void;
  context: QuickLogWateringContextViewModel;
  disabled?: boolean;
}

interface ObservationOption {
  value: string;
  label: string;
}

export default function QuickLogWateringForm({ value, onChange, context, disabled }: Props) {
  const setField = <K extends keyof QuickLogWateringFormState>(
    key: K,
    next: QuickLogWateringFormState[K],
  ) => onChange({ ...value, [key]: next });

  const setEcPpmPair = (
    ecKey: "ec" | "runoffEc",
    ppmKey: "ppm" | "runoffPpm",
    source: EcPpm500EditSource,
    raw: string,
  ) => {
    const pair = updateEcPpm500Pair(source, raw);
    onChange({ ...value, [ecKey]: pair.ec, [ppmKey]: pair.ppm });
  };

  const review = buildWateringReview(value);

  return (
    <div className="space-y-4" data-testid="qlv2-watering-form">
      <div>
        <Label htmlFor="qlv2-volume">Volume (ml)</Label>
        <Input
          id="qlv2-volume"
          inputMode="decimal"
          value={value.volumeMl}
          disabled={disabled}
          aria-describedby="qlv2-volume-help"
          onChange={(event) => setField("volumeMl", event.target.value)}
          placeholder="e.g. 500"
        />
        <p id="qlv2-volume-help" className="mt-1 text-sm text-muted-foreground">
          Required. Record the total water delivered to this target.
        </p>
      </div>

      {context.visible && (
        <section
          className="rounded-md border border-border/60 bg-secondary/10 p-3"
          aria-label="Watering decision context"
          data-testid="qlv2-watering-context"
          data-scope={context.scope}
        >
          <h4 className="text-sm font-medium">Read-only grow context</h4>
          <dl className="mt-2 grid grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
            {context.fields.map((field) => (
              <div className="contents" key={field.testId}>
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd data-testid={`qlv2-watering-context-${field.testId}`}>
                  <span className={field.present ? "text-foreground" : "text-muted-foreground"}>
                    {field.value}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">({field.source})</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{context.helper}</p>
        </section>
      )}

      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Root-zone measurements (optional)
        </summary>
        <p id="qlv2-water-ec-ppm-help" className="mt-2 text-xs text-muted-foreground">
          PPM uses the 500 scale. Enter either value and Verdant fills the other: PPM ÷ 500 = EC; EC
          × 500 = PPM. Canonical EC is saved in mS/cm.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="qlv2-water-ph">Input pH</Label>
            <Input
              id="qlv2-water-ph"
              inputMode="decimal"
              value={value.ph}
              disabled={disabled}
              onChange={(event) => setField("ph", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-water-ec">Input EC</Label>
            <Input
              id="qlv2-water-ec"
              inputMode="decimal"
              value={value.ec}
              disabled={disabled}
              aria-describedby="qlv2-water-ec-ppm-help"
              onChange={(event) => setEcPpmPair("ec", "ppm", "ec", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-water-ppm">Input PPM (500 scale)</Label>
            <Input
              id="qlv2-water-ppm"
              inputMode="decimal"
              value={value.ppm}
              disabled={disabled}
              aria-describedby="qlv2-water-ec-ppm-help"
              onChange={(event) => setEcPpmPair("ec", "ppm", "ppm", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-water-runoff-ml">Runoff (ml)</Label>
            <Input
              id="qlv2-water-runoff-ml"
              inputMode="decimal"
              value={value.runoffMl}
              disabled={disabled}
              onChange={(event) => setField("runoffMl", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-water-runoff-ph">Runoff pH</Label>
            <Input
              id="qlv2-water-runoff-ph"
              inputMode="decimal"
              value={value.runoffPh}
              disabled={disabled}
              onChange={(event) => setField("runoffPh", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-water-runoff-ec">Runoff EC</Label>
            <Input
              id="qlv2-water-runoff-ec"
              inputMode="decimal"
              value={value.runoffEc}
              disabled={disabled}
              aria-describedby="qlv2-water-ec-ppm-help"
              onChange={(event) => setEcPpmPair("runoffEc", "runoffPpm", "ec", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-water-runoff-ppm">Runoff PPM (500 scale)</Label>
            <Input
              id="qlv2-water-runoff-ppm"
              inputMode="decimal"
              value={value.runoffPpm}
              disabled={disabled}
              aria-describedby="qlv2-water-ec-ppm-help"
              onChange={(event) => setEcPpmPair("runoffEc", "runoffPpm", "ppm", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-water-temp">Water temperature (°C)</Label>
            <Input
              id="qlv2-water-temp"
              inputMode="decimal"
              value={value.waterTempC}
              disabled={disabled}
              onChange={(event) => setField("waterTempC", event.target.value)}
            />
          </div>
        </div>
      </details>

      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Manual pre-water observation (optional)
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          These are your observations—not sensor readings or a measured dryback. Tap a selected chip
          again to clear it.
        </p>
        <div className="mt-3 space-y-3">
          <ObservationChips
            label="Pot/container weight feel"
            value={value.potWeightFeel}
            options={[
              { value: "light", label: "Light" },
              { value: "moderate", label: "Moderate" },
              { value: "heavy", label: "Heavy" },
            ]}
            disabled={disabled}
            onChange={(next) =>
              setField("potWeightFeel", next as QuickLogWateringFormState["potWeightFeel"])
            }
          />
          <ObservationChips
            label="Medium surface"
            value={value.mediumSurface}
            options={[
              { value: "dry", label: "Dry" },
              { value: "moist", label: "Moist" },
              { value: "wet", label: "Wet" },
            ]}
            disabled={disabled}
            onChange={(next) =>
              setField("mediumSurface", next as QuickLogWateringFormState["mediumSurface"])
            }
          />
          <ObservationChips
            label="Drainage observed"
            value={value.drainage}
            options={[
              { value: "normal", label: "Normal" },
              { value: "slow", label: "Slow" },
              { value: "none", label: "None" },
            ]}
            disabled={disabled}
            onChange={(next) => setField("drainage", next as QuickLogWateringFormState["drainage"])}
          />
        </div>
      </details>

      <section
        className="rounded-md border border-border p-3"
        data-testid="qlv2-watering-review"
        aria-label={WATERING_REVIEW_TITLE}
      >
        <h4 className="text-sm font-medium">{WATERING_REVIEW_TITLE}</h4>
        {review.needsInput ? (
          <p
            className="mt-2 text-sm text-muted-foreground"
            data-testid="qlv2-watering-review-needs-input"
          >
            {WATERING_REVIEW_NEEDS_INPUT}
          </p>
        ) : (
          <dl className="mt-2 space-y-1 text-sm">
            {review.measurements.map((item) => (
              <ReviewRow key={item.label} label={item.label} value={item.value} />
            ))}
            {review.manualObservations.map((item) => (
              <ReviewRow key={item.label} label={`${item.label} (manual)`} value={item.value} />
            ))}
            <EcCompensationPreviewLine ec={value.ec} waterTempC={value.waterTempC} />
          </dl>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{review.safetyNote}</p>
      </section>
    </div>
  );
}

function ObservationChips({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly ObservationOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(selected ? "" : option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function EcCompensationPreviewLine({ ec, waterTempC }: { ec: string; waterTempC: string }) {
  const preview = buildEcCompensationPreview({ ec, waterTempC, sourceLabel: "manual" });
  if (!preview.visible) return null;
  const toneClass =
    preview.tone === "review"
      ? "text-amber-600 dark:text-amber-400"
      : preview.tone === "unavailable"
        ? "text-muted-foreground"
        : "font-medium";
  return (
    <div
      className="flex flex-col gap-0.5 pt-1"
      data-testid="qlv2-watering-ec-compensation-preview"
      data-tone={preview.tone}
    >
      <div className="flex gap-2">
        <dt className="text-muted-foreground">{preview.label}:</dt>
        <dd className={toneClass}>{preview.valueDisplay}</dd>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {EC_COMPENSATION_PREVIEW_DISCLAIMER}
        {preview.hint ? ` — ${preview.hint}` : ""}
      </p>
    </div>
  );
}
