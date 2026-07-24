/**
 * StructuredWateringEntry — a self-contained, drop-in structured watering log.
 *
 * REUSE, NOT A SECOND WRITE PATH: this composes the EXISTING pure watering rules
 * (`buildWateringFormPayload`, `buildWateringReview`) and the EXISTING canonical
 * writer (`writeQuickLogWateringTypedEvent` → `quicklog_save_event`). It owns
 * only its own local form state, a review step, one idempotency key (reused on
 * retry so a retry can never double-write), and the save lifecycle.
 *
 * Manual record only — never labeled "live". No recommendations, no dryback, no
 * dosage copy. EC is canonical mS/cm and always labeled as such (never µS/cm).
 * Blank means unknown, never zero.
 *
 * Not mounted anywhere in this branch. Integration seam:
 *   <StructuredWateringEntry growId={...} tentId={...} plantId={...} onSaved={...} />
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  buildWateringFormPayload,
  wateringFormReasonToHelper,
  WATERING_SAVE_SUCCESS_MESSAGE,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";
import {
  buildWateringReview,
  WATERING_REVIEW_SAFETY_NOTE,
} from "@/lib/quickLogWateringReviewViewModel";
import {
  writeQuickLogWateringTypedEvent,
  type WriteWateringTypedEventResult,
} from "@/lib/writeQuickLogWateringTypedEvent";

export type StructuredWateringSaveStatus = "idle" | "pending" | "saved" | "failed";

export interface StructuredWateringEntryProps {
  growId: string;
  tentId?: string | null;
  plantId?: string | null;
  onSaved?: (eventId: string) => void;
  /** Test seam: injected writer. Defaults to the canonical writer. */
  writer?: typeof writeQuickLogWateringTypedEvent;
  className?: string;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// Number field spec: [label, form key]. EC is always mS/cm.
const NUMERIC_FIELDS: ReadonlyArray<[string, keyof QuickLogWateringFormState, string]> = [
  ["Applied volume (ml)", "volumeMl", "e.g. 1000"],
  ["Input pH", "ph", "0–14"],
  ["Input EC (mS/cm)", "ec", "mS/cm"],
  ["Runoff volume (ml)", "runoffMl", "optional"],
  ["Runoff pH", "runoffPh", "0–14"],
  ["Runoff EC (mS/cm)", "runoffEc", "mS/cm"],
  ["Water temperature (°C)", "waterTempC", "°C"],
];

export function StructuredWateringEntry({
  growId,
  tentId = null,
  plantId = null,
  onSaved,
  writer = writeQuickLogWateringTypedEvent,
  className,
}: StructuredWateringEntryProps) {
  const [form, setForm] = useState<QuickLogWateringFormState>({ ...EMPTY_QUICKLOG_WATERING_FORM });
  const [occurredAt, setOccurredAt] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<StructuredWateringSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const attemptKeyRef = useRef<string | null>(null);

  const review = useMemo(() => buildWateringReview(form), [form]);

  const setField = useCallback((key: keyof QuickLogWateringFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const run = useCallback(
    async (key: string): Promise<WriteWateringTypedEventResult> => {
      setStatus("pending");
      setError(null);
      const built = buildWateringFormPayload({
        growId,
        tentId,
        plantId,
        idempotencyKey: key,
        occurredAt: occurredAt.trim() === "" ? null : occurredAt,
        form,
        note,
      });
      // strict:false does not narrow `!x.ok`; compare the discriminant explicitly.
      if (built.ok === false) {
        setStatus("failed");
        setError(wateringFormReasonToHelper(built.reason));
        return { ok: false, reason: "rpc:rejected" };
      }
      let result: WriteWateringTypedEventResult;
      try {
        result = await writer(built.payload);
      } catch {
        result = { ok: false, reason: "rpc:error" };
      }
      if (result.ok) {
        attemptKeyRef.current = null;
        setStatus("saved");
        onSaved?.(result.eventId);
      } else {
        setStatus("failed");
        setError(
          "Verdant could not confirm the watering save. Retry safely re-checks the exact same record.",
        );
      }
      return result;
    },
    [growId, tentId, plantId, occurredAt, form, note, writer, onSaved],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // Mint one key per submission; reused by retry() so a retry cannot double-write.
      const key = newIdempotencyKey();
      attemptKeyRef.current = key;
      void run(key);
    },
    [run],
  );

  const handleRetry = useCallback(() => {
    const key = attemptKeyRef.current;
    if (!key) return;
    void run(key); // same idempotency key → server collapses a landed write to the original
  }, [run]);

  const targetLabel = plantId ? "this plant" : tentId ? "this tent" : "this grow";

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("space-y-5 min-w-0", className)}
      data-testid="structured-watering-entry"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Droplets className="h-5 w-5 shrink-0 text-sky-300" aria-hidden />
        <h2 className="min-w-0 truncate text-sm font-semibold text-white/85">
          Structured watering record
        </h2>
        <span
          data-testid="watering-source-manual"
          className="ml-auto shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/60"
        >
          Manual record
        </span>
      </div>

      <div className="space-y-1.5 min-w-0">
        <Label htmlFor="swe-occurred-at">When (optional — defaults to now)</Label>
        <Input
          id="swe-occurred-at"
          type="datetime-local"
          className="min-h-11"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NUMERIC_FIELDS.map(([label, key, placeholder]) => (
          <div key={key} className="space-y-1.5 min-w-0">
            <Label htmlFor={`swe-${key}`}>{label}</Label>
            <Input
              id={`swe-${key}`}
              inputMode="decimal"
              className="min-h-11"
              placeholder={placeholder}
              value={form[key]}
              onChange={(e) => setField(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5 min-w-0">
        <Label htmlFor="swe-note">Note</Label>
        <Textarea id="swe-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div
        data-testid="watering-review"
        className="rounded-md border border-border bg-card p-3 space-y-2 min-w-0"
      >
        <p className="text-xs font-medium text-white/70">
          Review — this saves to {targetLabel} as a manual record:
        </p>
        {review.needsInput ? (
          <p
            data-testid="watering-review-needs-input"
            className="text-xs text-amber-300 break-words"
          >
            Add the applied volume to preview the watering record.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {review.measurements.map((m) => (
              <li key={m.label} className="flex min-w-0 items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-white/50">{m.label}</span>
                <span className="shrink-0 font-medium text-white/85">{m.value}</span>
              </li>
            ))}
            {note.trim() ? (
              <li className="flex min-w-0 items-start justify-between gap-2 text-xs">
                <span className="shrink-0 text-white/50">Note</span>
                <span className="min-w-0 break-words text-right font-medium text-white/85">
                  {note.trim()}
                </span>
              </li>
            ) : null}
          </ul>
        )}
        <p className="text-[11px] text-white/40 break-words">{WATERING_REVIEW_SAFETY_NOTE}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          className="min-h-11"
          disabled={status === "pending" || review.needsInput}
        >
          Save watering record
        </Button>
        <div aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          {status === "pending" ? (
            <span className="inline-flex items-center gap-1.5 text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
            </span>
          ) : null}
          {status === "saved" ? (
            <span
              className="inline-flex items-center gap-1.5 text-emerald-300"
              data-testid="watering-saved"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> {WATERING_SAVE_SUCCESS_MESSAGE}
            </span>
          ) : null}
          {status === "failed" ? (
            <span
              className="inline-flex min-w-0 flex-wrap items-center gap-2"
              data-testid="watering-failed"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5 text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{error ?? "Save failed."}</span>
              </span>
              {attemptKeyRef.current ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={handleRetry}
                  data-testid="watering-retry"
                >
                  Retry
                </Button>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export default StructuredWateringEntry;
