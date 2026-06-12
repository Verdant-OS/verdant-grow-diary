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

      <div>
        <Label htmlFor="qlv2-feed-note">Note (optional)</Label>
        <Textarea
          id="qlv2-feed-note"
          value={value.note}
          disabled={disabled}
          maxLength={500}
          onChange={(e) => setField("note", e.target.value)}
          placeholder="Anything notable about this feed?"
        />
      </div>
    </div>
  );
}
