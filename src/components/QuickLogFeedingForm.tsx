/**
 * QuickLogFeedingForm — presenter for the Quick Log structured feeding
 * surface. All business logic lives in `quickLogFeedingFormViewModel.ts`.
 *
 * Renders: required nutrient line + at least one product row, with a
 * progressive-disclosure "Metrics" section for optional pH/EC/runoff/water
 * temperature/note. No data fetching, no Supabase, no writers.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QuickLogFeedingFormState } from "@/lib/quickLogFeedingFormViewModel";
import {
  buildFeedingReview,
  FEEDING_REVIEW_TITLE,
  FEEDING_REVIEW_DEFAULTS_FLAG,
  FEEDING_REVIEW_NEEDS_INPUT,
} from "@/lib/quickLogFeedingReviewViewModel";
import {
  buildEcCompensationPreview,
  EC_COMPENSATION_PREVIEW_DISCLAIMER,
} from "@/lib/ecCompensationPreviewViewModel";

interface Props {
  value: QuickLogFeedingFormState;
  onChange: (next: QuickLogFeedingFormState) => void;
  disabled?: boolean;
  defaultsApplied?: boolean;
}

export default function QuickLogFeedingForm({
  value,
  onChange,
  disabled,
  defaultsApplied = false,
}: Props) {
  const setField = <K extends keyof QuickLogFeedingFormState>(
    k: K,
    v: QuickLogFeedingFormState[K],
  ) => onChange({ ...value, [k]: v });

  const setProductField = (
    idx: number,
    patch: Partial<QuickLogFeedingFormState["products"][number]>,
  ) => {
    const next = value.products.map((row, i) =>
      i === idx ? { ...row, ...patch } : row,
    );
    onChange({ ...value, products: next });
  };

  const review = buildFeedingReview(value, defaultsApplied);


  return (
    <div className="space-y-4" data-testid="qlv2-feeding-form">
      <div>
        <Label htmlFor="qlv2-feed-line">Nutrient line</Label>
        <Input
          id="qlv2-feed-line"
          value={value.lineId}
          disabled={disabled}
          aria-describedby="qlv2-feed-line-help"
          onChange={(e) => setField("lineId", e.target.value)}
          placeholder="e.g. veg-week-3"
        />
        <p
          id="qlv2-feed-line-help"
          className="mt-1 text-sm text-muted-foreground"
        >
          Required. Use a short label you can recognize later.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Products</Label>
        {value.products.map((row, idx) => (
          <div
            key={idx}
            className="grid grid-cols-[1fr_80px_80px] gap-2"
            data-testid={`qlv2-feed-product-row-${idx}`}
          >
            <Input
              aria-label={`Product ${idx + 1} name`}
              value={row.name}
              disabled={disabled}
              onChange={(e) => setProductField(idx, { name: e.target.value })}
              placeholder="Product"
            />
            <Input
              aria-label={`Product ${idx + 1} amount`}
              inputMode="decimal"
              value={row.amount}
              disabled={disabled}
              onChange={(e) => setProductField(idx, { amount: e.target.value })}
              placeholder="Amount"
            />
            <Input
              aria-label={`Product ${idx + 1} unit`}
              value={row.unit}
              disabled={disabled}
              onChange={(e) => setProductField(idx, { unit: e.target.value })}
              placeholder="Unit"
            />
          </div>
        ))}
        <p className="text-sm text-muted-foreground">
          At least one product is required.
        </p>
      </div>

      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Optional metrics
        </summary>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="qlv2-feed-ph">pH</Label>
            <Input
              id="qlv2-feed-ph"
              inputMode="decimal"
              value={value.ph}
              disabled={disabled}
              onChange={(e) => setField("ph", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-feed-ec-in">EC in</Label>
            <Input
              id="qlv2-feed-ec-in"
              inputMode="decimal"
              value={value.ecIn}
              disabled={disabled}
              onChange={(e) => setField("ecIn", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-feed-ec-out">EC out</Label>
            <Input
              id="qlv2-feed-ec-out"
              inputMode="decimal"
              value={value.ecOut}
              disabled={disabled}
              onChange={(e) => setField("ecOut", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-feed-runoff-ml">Runoff (ml)</Label>
            <Input
              id="qlv2-feed-runoff-ml"
              inputMode="decimal"
              value={value.runoffMl}
              disabled={disabled}
              onChange={(e) => setField("runoffMl", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-feed-runoff-ph">Runoff pH</Label>
            <Input
              id="qlv2-feed-runoff-ph"
              inputMode="decimal"
              value={value.runoffPh}
              disabled={disabled}
              onChange={(e) => setField("runoffPh", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-feed-runoff-ec">Runoff EC</Label>
            <Input
              id="qlv2-feed-runoff-ec"
              inputMode="decimal"
              value={value.runoffEc}
              disabled={disabled}
              onChange={(e) => setField("runoffEc", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="qlv2-feed-water-temp">Water (°C)</Label>
            <Input
              id="qlv2-feed-water-temp"
              inputMode="decimal"
              value={value.waterTempC}
              disabled={disabled}
              onChange={(e) => setField("waterTempC", e.target.value)}
            />
          </div>
        </div>
      </details>

      <div
        className="rounded-md border border-border p-3"
        data-testid="qlv2-feeding-review"
      >
        <h4 className="text-sm font-medium">{FEEDING_REVIEW_TITLE}</h4>
        {review.defaultsApplied && (
          <p
            className="mt-1 text-xs text-muted-foreground"
            data-testid="qlv2-feeding-review-defaults-flag"
          >
            {FEEDING_REVIEW_DEFAULTS_FLAG}
          </p>
        )}
        {review.needsInput ? (
          <p
            className="mt-2 text-sm text-muted-foreground"
            data-testid="qlv2-feeding-review-needs-input"
          >
            {FEEDING_REVIEW_NEEDS_INPUT}
          </p>
        ) : (
          <dl className="mt-2 space-y-1 text-sm">
            {review.lineLabel && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Line:</dt>
                <dd className="font-medium">{review.lineLabel}</dd>
              </div>
            )}
            {review.productLabels.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Products:</dt>
                <dd className="font-medium">
                  {review.productLabels.map((p) => p.display).join(", ")}
                </dd>
              </div>
            )}
            {review.optionalMetrics.map((m) => (
              <div key={m.label} className="flex gap-2">
                <dt className="text-muted-foreground">{m.label}:</dt>
                <dd className="font-medium">{m.value}</dd>
              </div>
            ))}
            {review.note && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Note:</dt>
                <dd className="font-medium">{review.note}</dd>
              </div>
            )}
            <EcCompensationPreviewLine
              ec={value.ecIn}
              waterTempC={value.waterTempC}
            />
          </dl>
        )}
      </div>
    </div>
  );
}
