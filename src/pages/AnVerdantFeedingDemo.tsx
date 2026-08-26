/**
 * AnVerdantFeedingDemo — fixture-only Advanced Nutrients × Verdant demo.
 *
 * Reuses the real QuickLogFeedingForm. Saves are in-memory only.
 * No Supabase, no production writes, no device control, no auto-AQ create.
 *
 * Plant + feeding surfaces render on first paint (SSR-safe) so browser tests
 * do not depend on a post-hydration continue click.
 */
import { useCallback, useId, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import QuickLogFeedingForm from "@/components/QuickLogFeedingForm";
import { AiDoctorActionSuggestionReviewGate } from "@/components/AiDoctorActionSuggestionReviewGate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  type QuickLogFeedingFormState,
  feedingFormReasonToHelper,
} from "@/lib/quickLogFeedingFormViewModel";
import { buildFeedingReview } from "@/lib/quickLogFeedingReviewViewModel";
import {
  applyCatalogProductToForm,
  buildDefaultAnDemoForm,
  saveAnVerdantDemoFeeding,
  type AnVerdantPhotoState,
  type AnVerdantSensorScenario,
} from "@/lib/partners/advancedNutrients/anVerdantFeedingDemoRules";
import {
  buildAnVerdantFeedingDemoShellVM,
  buildAnVerdantPostSaveReviewVM,
} from "@/lib/partners/advancedNutrients/anVerdantFeedingDemoViewModel";
import { findAnDemoProductById } from "@/lib/partners/advancedNutrients/demoCatalog";

const FIXED_NOW = "2026-08-26T18:00:00.000Z";

type DemoStep = "feeding" | "saved" | "timeline" | "ai" | "action-queue";

export default function AnVerdantFeedingDemo(): JSX.Element {
  const shell = useMemo(() => buildAnVerdantFeedingDemoShellVM(), []);
  const [step, setStep] = useState<DemoStep>("feeding");
  const [form, setForm] = useState<QuickLogFeedingFormState>(() => buildDefaultAnDemoForm());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sensorScenario, setSensorScenario] = useState<AnVerdantSensorScenario>("trustworthy");
  const [photoState, setPhotoState] = useState<AnVerdantPhotoState>("present");
  const [idempotencyKey] = useState(() => `an-demo-save-${crypto.randomUUID()}`);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [review, setReview] = useState<ReturnType<typeof buildAnVerdantPostSaveReviewVM> | null>(
    null,
  );
  const catalogSelectId = useId();

  const feedingReview = useMemo(() => buildFeedingReview(form, false), [form]);

  const toggleCatalogProduct = useCallback((productId: string) => {
    const product = findAnDemoProductById(productId);
    if (!product) return;

    setSelectedIds((prev) => {
      if (prev.includes(productId)) {
        setForm((current) => ({
          ...current,
          products: current.products.map((row) =>
            row.name === product.name ? { ...row, name: "" } : row,
          ),
        }));
        return prev.filter((id) => id !== productId);
      }

      setForm((current) => {
        const emptyIdx = current.products.findIndex((r) => r.name.trim() === "");
        const idx = emptyIdx >= 0 ? emptyIdx : Math.min(current.products.length, 11);
        return applyCatalogProductToForm(current, product, idx);
      });
      return [...prev, productId];
    });
  }, []);

  const handleSave = useCallback(() => {
    setSaveError(null);
    const result = saveAnVerdantDemoFeeding({
      form,
      idempotencyKey,
      selectedProductIds: selectedIds,
      sensorScenario,
      photoState,
      nowIso: FIXED_NOW,
    });
    if (!result.ok) {
      setSaveError(feedingFormReasonToHelper(result.reason));
      return;
    }
    setReview(buildAnVerdantPostSaveReviewVM(result.event));
    setStep("saved");
  }, [form, idempotencyKey, selectedIds, sensorScenario, photoState]);

  return (
    <main
      data-testid="an-verdant-feeding-demo-page"
      className="container mx-auto max-w-3xl px-4 py-6 space-y-6"
    >
      <PageHeader title={shell.header} description={shell.supporting} />

      <p
        className="text-xs text-muted-foreground border border-border rounded-md p-3"
        data-testid="an-verdant-demo-disclosure"
      >
        {shell.disclosure}
      </p>

      <p className="text-sm" data-testid="an-verdant-demo-complement">
        {shell.complementNote}
      </p>

      <ul
        className="text-xs text-muted-foreground list-disc pl-5 space-y-1"
        data-testid="an-verdant-demo-safety"
      >
        {shell.safetyNotes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <section
        data-testid="an-verdant-demo-plant"
        className="space-y-2 rounded-md border border-border p-4"
      >
        <h2 className="text-sm font-semibold">1. Demo grow → tent → plant</h2>
        <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Grow</dt>
            <dd data-testid="an-verdant-demo-grow-label">{shell.plant.growLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tent</dt>
            <dd data-testid="an-verdant-demo-tent-label">{shell.plant.tentLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Plant</dt>
            <dd data-testid="an-verdant-demo-plant-label">{shell.plant.plantLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Stage / strain</dt>
            <dd>
              {shell.plant.stage} · {shell.plant.strain}
            </dd>
          </div>
        </dl>
      </section>

      <section
        data-testid="an-verdant-demo-feeding"
        className="space-y-4 rounded-md border border-border p-4"
      >
        <h2 className="text-sm font-semibold">2. Quick Log → Feeding (real form)</h2>

        <div className="space-y-2" data-testid="an-verdant-demo-catalog">
          <Label htmlFor={catalogSelectId}>AN demo catalog</Label>
          <p
            className="text-xs font-medium text-amber-800 dark:text-amber-200"
            data-testid="an-verdant-demo-catalog-disclosure"
          >
            {shell.catalogDisclosure}
          </p>
          <div className="flex flex-wrap gap-2" id={catalogSelectId}>
            {shell.catalog.map((p) => {
              const selected = selectedIds.includes(p.productId);
              return (
                <Button
                  key={p.productId}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  data-testid={`an-verdant-catalog-product-${p.productId}`}
                  aria-pressed={selected}
                  onClick={() => toggleCatalogProduct(p.productId)}
                >
                  {p.name}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Selecting a product fills the name only. Enter amount, unit, and water volume yourself.
          </p>
        </div>

        <QuickLogFeedingForm value={form} onChange={setForm} />

        <div className="space-y-2" data-testid="an-verdant-demo-evidence-controls">
          <h3 className="text-sm font-medium">3. Evidence at save time</h3>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["trustworthy", "Manual snapshot"],
                ["missing", "Missing sensor"],
                ["stale", "Stale sensor"],
                ["demo", "Demo sensor"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={sensorScenario === value ? "default" : "outline"}
                data-testid={`an-verdant-sensor-${value}`}
                onClick={() => setSensorScenario(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={photoState === "present" ? "default" : "outline"}
              data-testid="an-verdant-photo-present"
              onClick={() => setPhotoState("present")}
            >
              Photo present (fixture)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={photoState === "missing" ? "default" : "outline"}
              data-testid="an-verdant-photo-missing"
              onClick={() => setPhotoState("missing")}
            >
              Photo missing (honest)
            </Button>
          </div>
        </div>

        <div
          className="rounded-md border border-dashed border-border p-3 text-sm"
          data-testid="an-verdant-demo-form-review"
        >
          <p className="font-medium">
            {feedingReview.needsInput ? "Needs input before save" : "Ready to save"}
          </p>
          <p className="text-xs text-muted-foreground">
            {feedingReview.lineLabel ? `Line: ${feedingReview.lineLabel}` : "Line missing"}
            {feedingReview.productLabels.length > 0
              ? ` · ${feedingReview.productLabels.map((p) => p.display).join(", ")}`
              : " · no products"}
          </p>
        </div>

        {saveError ? (
          <p className="text-sm text-destructive" data-testid="an-verdant-demo-save-error">
            {saveError}
          </p>
        ) : null}

        <Button type="button" data-testid="an-verdant-demo-save" onClick={handleSave}>
          Save feeding (in-memory demo only)
        </Button>
      </section>

      {review ? (
        <>
          <section
            data-testid="an-verdant-demo-saved"
            className="space-y-2 rounded-md border border-border p-4"
          >
            <h2 className="text-sm font-semibold">4. Saved timeline event</h2>
            <p data-testid="an-verdant-demo-timeline-summary">{review.timelineSummary}</p>
            <ul className="text-sm space-y-1" data-testid="an-verdant-demo-evidence-summary">
              {review.evidenceLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground" data-testid="an-verdant-demo-event-id">
              Event id: {review.event.eventId}
              {review.event.reused ? " (idempotent reuse)" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                data-testid="an-verdant-demo-open-timeline"
                onClick={() => setStep("timeline")}
              >
                Event details
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="an-verdant-demo-open-ai"
                onClick={() => setStep("ai")}
              >
                AI Doctor split
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="an-verdant-demo-open-aq"
                onClick={() => setStep("action-queue")}
              >
                Action Queue suggestion
              </Button>
            </div>
          </section>

          {(step === "timeline" ||
            step === "ai" ||
            step === "action-queue" ||
            step === "saved") && (
            <section
              data-testid="an-verdant-demo-event-detail"
              className="space-y-2 rounded-md border border-border p-4"
            >
              <h2 className="text-sm font-semibold">Event detail</h2>
              <ul className="text-sm space-y-1">
                {review.event.products.map((p) => (
                  <li key={p.productId} data-testid={`an-verdant-event-product-${p.productId}`}>
                    {p.brand} · {p.name}
                    {p.amount !== null ? ` · ${p.amount}${p.unit ? ` ${p.unit}` : ""}` : ""} ·{" "}
                    {p.catalogSource}
                  </li>
                ))}
              </ul>
              <p data-testid="an-verdant-event-sensor">{review.event.sensorSummary}</p>
              <p data-testid="an-verdant-event-photo">{review.event.photo.label}</p>
            </section>
          )}

          {(step === "ai" || step === "action-queue") && (
            <section
              data-testid="an-verdant-demo-ai-doctor"
              className="space-y-3 rounded-md border border-border p-4"
            >
              <h2 className="text-sm font-semibold">
                5. AI Doctor — Observed / Inferred / Unknown
              </h2>
              {(["observed", "inferred", "unknown"] as const).map((key) => {
                const bucket = review.aiDoctor[key];
                return (
                  <div key={key} data-testid={`an-verdant-ai-${key}`}>
                    <h3 className="text-sm font-medium">{bucket.title}</h3>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {bucket.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <p className="text-xs" data-testid="an-verdant-ai-causation-fence">
                {review.aiDoctor.causationFence}
              </p>
              <p className="text-xs" data-testid="an-verdant-ai-follow-up">
                {review.aiDoctor.preferredFollowUp}
              </p>
            </section>
          )}

          {step === "action-queue" && (
            <section
              data-testid="an-verdant-demo-action-queue"
              className="space-y-3 rounded-md border border-border p-4"
            >
              <h2 className="text-sm font-semibold">6. Approval-required Action Queue</h2>
              <p className="text-xs text-muted-foreground" data-testid="an-verdant-aq-label">
                {review.actionQueue.label}
              </p>
              <p className="text-xs" data-testid="an-verdant-aq-source-event">
                Source feeding event: {review.actionQueue.sourceFeedingEventId}
              </p>
              <p className="text-xs" data-testid="an-verdant-aq-status">
                Status: {review.actionQueue.status} · deviceControl:{" "}
                {String(review.actionQueue.deviceControl)} · autoCreatedOnSave:{" "}
                {String(review.actionQueue.autoCreatedOnSave)}
              </p>
              <AiDoctorActionSuggestionReviewGate suggestion={review.actionQueue.suggestion} />
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
