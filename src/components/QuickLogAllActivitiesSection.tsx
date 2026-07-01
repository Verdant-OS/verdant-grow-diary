/**
 * QuickLogAllActivitiesSection — shared, mountable Quick Log activity
 * surface for Verdant V0 (One-Tent Loop).
 *
 * Wires:
 *   QuickLogActivityPicker  (shared UI, shared taxonomy)
 *   useQuickLogActivitySave (shared safe RPC routing)
 *   buildDailyCheckSavedItems (shared "What was saved" labels)
 *
 * Presenter-focused. No duplicate activity taxonomy. No local
 * activity/label arrays. Business rules stay in src/lib/* and
 * src/constants/*.
 *
 * Safety fences:
 *   - Harvest is visible-but-disabled; click never opens a form, never
 *     calls an RPC, never dispatches verdant:entry-created, never adds
 *     a saved item.
 *   - Manual sensor snapshot is intentionally deferred to the existing
 *     ManualSensorReadingCard path — this section shows the shared
 *     safety copy and links out; it does NOT persist a reading itself.
 *   - Unsaved draft selections never appear in "What was saved".
 *   - Failed saves never dispatch a timeline refresh and never render a
 *     confirmation card.
 *   - No recommendation, no health inference, no "safe to feed / train
 *     / defoliate", no harvest readiness, no diagnosis language.
 */
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import QuickLogActivityPicker from "@/components/QuickLogActivityPicker";
import { useQuickLogActivitySave } from "@/hooks/useQuickLogActivitySave";
import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
  QUICK_LOG_HARVEST_DISABLED_REASON,
  QUICK_LOG_WEIGHT_UNITS,
  type QuickLogActivityDefinition,
  type QuickLogActivityId,
  type QuickLogWeightUnit,
} from "@/constants/quickLogActivityTypes";
import { buildHarvestDetailsPayload } from "@/lib/harvestDetailsRules";
import {
  buildDailyCheckSavedItems,
  type DailyCheckSavedItem,
  type DailyCheckSavedSource,
} from "@/lib/dailyCheckPostSubmitRules";

export interface QuickLogAllActivitiesSectionProps {
  growId: string | null | undefined;
  tentId?: string | null;
  plantId?: string | null;
  /** Optional heading override for the section. */
  heading?: string;
  /** Optional testid prefix. Defaults to "quick-log-all-activities". */
  testIdPrefix?: string;
}

/** Map a QuickLogActivityId to the "What was saved" DailyCheck source. */
function toSavedSource(
  id: QuickLogActivityId,
): DailyCheckSavedSource | null {
  switch (id) {
    case "note":
      return "note";
    case "photo":
      return "photo";
    case "watering":
      return "watering";
    case "feeding":
      return "feeding";
    case "environment_check":
      return "environment_check";
    case "training":
      return "training";
    case "defoliation":
      return "defoliation";
    case "issue_observation":
      return "issue_observation";
    case "manual_sensor_snapshot":
      return "sensor";
    case "harvest":
      return "harvest";
    default:
      return null;
  }
}

function newIdempotencyKey(activityId: QuickLogActivityId): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `qla-${activityId}-${Date.now()}-${rand}`;
}

interface SavedRecord {
  id: string;
  activityId: QuickLogActivityId;
  item: DailyCheckSavedItem;
}

export default function QuickLogAllActivitiesSection({
  growId,
  tentId = null,
  plantId = null,
  heading = "All quick actions",
  testIdPrefix = "quick-log-all-activities",
}: QuickLogAllActivitiesSectionProps) {
  const [selected, setSelected] = useState<QuickLogActivityDefinition | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [harvestWet, setHarvestWet] = useState("");
  const [harvestDry, setHarvestDry] = useState("");
  const [harvestUnit, setHarvestUnit] = useState<QuickLogWeightUnit>("g");
  const [saved, setSaved] = useState<SavedRecord[]>([]);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [errorForActivity, setErrorForActivity] =
    useState<QuickLogActivityId | null>(null);
  const { save, saving } = useQuickLogActivitySave();

  const canPersistManualSensor = false; // Deferred to ManualSensorReadingCard.

  const requiresNote = useMemo(() => {
    if (!selected) return false;
    return (
      selected.id === "note" ||
      selected.id === "feeding" ||
      selected.id === "training" ||
      selected.id === "defoliation" ||
      selected.id === "issue_observation" ||
      selected.id === "environment_check"
    );
  }, [selected]);

  const handleSelect = useCallback((a: QuickLogActivityDefinition) => {
    setErrorReason(null);
    setErrorForActivity(null);
    setSelected(a);
    setNote("");
    setHarvestWet("");
    setHarvestDry("");
    setHarvestUnit("g");
  }, []);

  const handleSave = useCallback(async () => {
    if (!selected) return;
    if (!growId) {
      setErrorReason("Missing grow context. Nothing saved.");
      setErrorForActivity(selected.id);
      return;
    }
    // Disabled activities must never reach RPC.
    if (!selected.enabled) {
      setErrorReason(
        selected.disabledReason ?? QUICK_LOG_HARVEST_DISABLED_REASON,
      );
      setErrorForActivity(selected.id);
      return;
    }
    // Manual sensor snapshot fence — deferred to existing card path.
    if (selected.id === "manual_sensor_snapshot" && !canPersistManualSensor) {
      setErrorReason(
        "Use the Manual Sensor Snapshot card to save readings. This section does not persist readings.",
      );
      setErrorForActivity(selected.id);
      return;
    }
    if (requiresNote && note.trim().length === 0) {
      setErrorReason("Add a short note before saving.");
      setErrorForActivity(selected.id);
      return;
    }

    // Harvest optional weight details — sanitized in the shared rules
    // module. Empty / invalid / negative values are dropped, never sent.
    const extraDetails: Record<string, unknown> = {};
    if (selected.id === "harvest") {
      const harvestPayload = buildHarvestDetailsPayload({
        wetWeight: harvestWet,
        dryWeight: harvestDry,
        weightUnit: harvestUnit,
      });
      if (harvestPayload) extraDetails.harvest = harvestPayload;
    }

    const idempotencyKey = newIdempotencyKey(selected.id);
    const result = await save({
      activityId: selected.id,
      growId,
      tentId: tentId ?? null,
      plantId: plantId ?? null,
      note: note.trim().length > 0 ? note.trim() : null,
      idempotencyKey,
      extraDetails:
        Object.keys(extraDetails).length > 0 ? extraDetails : null,
    });

    if (!result.ok) {
      setErrorReason(
        result.reason === "save_failed"
          ? "Save failed. Nothing was saved."
          : result.disabledReason ?? "Save was refused.",
      );
      setErrorForActivity(selected.id);
      return;
    }

    // Success path — build saved-item using the SHARED helper so no
    // local label array can drift out of sync.
    const source = toSavedSource(selected.id);
    if (source) {
      const items = buildDailyCheckSavedItems({
        source,
        submittedAt: Date.now(),
      });
      if (items.length > 0) {
        setSaved((prev) => [
          ...prev,
          {
            id: `${idempotencyKey}-saved`,
            activityId: selected.id,
            item: items[0],
          },
        ]);
      }
    }
    setNote("");
    setHarvestWet("");
    setHarvestDry("");
    setHarvestUnit("g");
    setSelected(null);
    setErrorReason(null);
    setErrorForActivity(null);
  }, [
    selected,
    growId,
    tentId,
    plantId,
    note,
    requiresNote,
    save,
    canPersistManualSensor,
    harvestWet,
    harvestDry,
    harvestUnit,
  ]);

  const noContext = !growId;

  return (
    <section
      aria-label={heading}
      data-testid={testIdPrefix}
      className="rounded-2xl border border-border/60 bg-background/40 p-3 sm:p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">{heading}</h3>
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`${testIdPrefix}-safety-hint`}
        >
          Logs are grower memory, not diagnosis.
        </p>
      </div>

      {noContext && (
        <p
          role="note"
          className="text-xs text-muted-foreground"
          data-testid={`${testIdPrefix}-no-grow`}
        >
          Select a grow to enable Quick Log actions.
        </p>
      )}

      <QuickLogActivityPicker
        onSelect={handleSelect}
        selectedId={selected?.id ?? null}
        testIdPrefix={`${testIdPrefix}-picker`}
      />

      {selected && selected.enabled && (
        <div
          className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-2.5"
          data-testid={`${testIdPrefix}-form`}
          data-activity-id={selected.id}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-medium">{selected.label}</p>
            <p className="text-[11px] text-muted-foreground">
              {selected.safetyNote}
            </p>
          </div>

          {selected.id === "manual_sensor_snapshot" ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid={`${testIdPrefix}-manual-sensor-hint`}
            >
              Use the Manual Sensor Snapshot card on this page to record a
              reading. Manual snapshots stay labeled manual, not live.
            </p>
          ) : selected.id === "harvest" ? (
            <div
              className="space-y-2"
              data-testid={`${testIdPrefix}-harvest-fields`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label
                    htmlFor={`${testIdPrefix}-harvest-wet`}
                    className="text-[11px] text-muted-foreground"
                  >
                    Wet weight (optional)
                  </Label>
                  <Input
                    id={`${testIdPrefix}-harvest-wet`}
                    data-testid={`${testIdPrefix}-harvest-wet`}
                    value={harvestWet}
                    onChange={(e) => setHarvestWet(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 120"
                    min={0}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`${testIdPrefix}-harvest-dry`}
                    className="text-[11px] text-muted-foreground"
                  >
                    Dry weight (optional)
                  </Label>
                  <Input
                    id={`${testIdPrefix}-harvest-dry`}
                    data-testid={`${testIdPrefix}-harvest-dry`}
                    value={harvestDry}
                    onChange={(e) => setHarvestDry(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 22"
                    min={0}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`${testIdPrefix}-harvest-unit`}
                    className="text-[11px] text-muted-foreground"
                  >
                    Weight unit
                  </Label>
                  <select
                    id={`${testIdPrefix}-harvest-unit`}
                    data-testid={`${testIdPrefix}-harvest-unit`}
                    value={harvestUnit}
                    onChange={(e) =>
                      setHarvestUnit(e.target.value as QuickLogWeightUnit)
                    }
                    className="w-full text-sm h-9 rounded-md border border-input bg-background px-2"
                  >
                    {QUICK_LOG_WEIGHT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor={`${testIdPrefix}-note`}
                  className="text-[11px] text-muted-foreground"
                >
                  Note (optional)
                </Label>
                <Textarea
                  id={`${testIdPrefix}-note`}
                  data-testid={`${testIdPrefix}-note`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Removed main cola, lower branches…"
                  className="min-h-[64px] text-sm"
                />
              </div>
            </div>
          ) : requiresNote ? (
            <div className="space-y-1">
              <Label
                htmlFor={`${testIdPrefix}-note`}
                className="text-[11px] text-muted-foreground"
              >
                Note
              </Label>
              <Textarea
                id={`${testIdPrefix}-note`}
                data-testid={`${testIdPrefix}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Short observation…"
                className="min-h-[64px] text-sm"
              />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Save to record this action on the plant timeline.
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={
                saving ||
                noContext ||
                selected.id === "manual_sensor_snapshot" ||
                (requiresNote && note.trim().length === 0)
              }
              data-testid={`${testIdPrefix}-save`}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelected(null);
                setNote("");
                setErrorReason(null);
                setErrorForActivity(null);
              }}
              data-testid={`${testIdPrefix}-cancel`}
            >
              Cancel
            </Button>
          </div>

          {errorReason && errorForActivity === selected.id && (
            <p
              role="alert"
              className="text-xs text-destructive"
              data-testid={`${testIdPrefix}-error`}
            >
              {errorReason}
            </p>
          )}
        </div>
      )}

      {saved.length > 0 && (
        <div
          className="rounded-lg border border-primary/30 bg-primary/[0.04] p-2.5 space-y-1.5"
          data-testid={`${testIdPrefix}-saved`}
          aria-live="polite"
        >
          <p className="text-[11px] uppercase tracking-wide text-primary/80">
            What was saved
          </p>
          <ul className="text-xs space-y-0.5">
            {saved.map((s) => (
              <li
                key={s.id}
                data-testid={`${testIdPrefix}-saved-item`}
                data-saved-activity-id={s.activityId}
                data-saved-key={s.item.key}
              >
                {s.item.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Re-export a helper so callers/tests can reason about visible activity ids
// without duplicating taxonomy.
export const QUICK_LOG_ALL_ACTIVITIES_VISIBLE_IDS = Object.freeze(
  Object.keys(QUICK_LOG_ACTIVITY_DEFINITIONS) as QuickLogActivityId[],
);
