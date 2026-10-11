import { Label } from "@/components/ui/label";
import { CANNABIS_SYMPTOM_DEFINITIONS } from "@/constants/cannabisSymptomTypes";
import { STAGES, type CanonicalQuickLogStage } from "@/lib/grow";
import { getQuickLogActivityDetailFields } from "@/lib/quickLogActivityDetailFields";

interface QuickLogSymptomCheckFieldsProps {
  readonly symptomObservedSign: string;
  readonly observationLocation: string;
  readonly stage: CanonicalQuickLogStage | null;
  readonly stageConfirmed: boolean;
  readonly noSymptomsObserved: boolean;
  readonly disabled: boolean;
  readonly testIdPrefix: string;
  readonly onSymptomObservedSignChange: (value: string) => void;
  readonly onObservationLocationChange: (value: string) => void;
  readonly onStageChange: (value: CanonicalQuickLogStage | null) => void;
  readonly onStageConfirmedChange: (value: boolean) => void;
  readonly onNoSymptomsObservedChange: (value: boolean) => void;
}

export default function QuickLogSymptomCheckFields({
  symptomObservedSign,
  observationLocation,
  stage,
  stageConfirmed,
  noSymptomsObserved,
  disabled,
  testIdPrefix,
  onSymptomObservedSignChange,
  onObservationLocationChange,
  onStageChange,
  onStageConfirmedChange,
  onNoSymptomsObservedChange,
}: QuickLogSymptomCheckFieldsProps) {
  const locationField = getQuickLogActivityDetailFields("issue_observation").find(
    (field) => field.key === "observationLocation",
  );
  return (
    <fieldset className="space-y-3" data-testid={`${testIdPrefix}-symptom-fields`}>
      <legend className="text-xs font-semibold">Symptom Check</legend>
      <p className="text-xs text-muted-foreground">
        Record the visible sign and confirmed stage. This preserves evidence; it does not diagnose a
        cause.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CANNABIS_SYMPTOM_DEFINITIONS.map((symptom) => {
          const selected = !noSymptomsObserved && symptomObservedSign === symptom.observedSign;
          return (
            <button
              key={symptom.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled || noSymptomsObserved}
              onClick={() => onSymptomObservedSignChange(symptom.observedSign)}
              className={`min-h-[44px] rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:bg-muted/40"
              }`}
              data-testid={`${testIdPrefix}-symptom-${symptom.id}`}
            >
              <span className="block font-medium">{symptom.label}</span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {symptom.description}
              </span>
            </button>
          );
        })}
      </div>
      <label
        className="flex min-h-[44px] items-start gap-2 rounded-md border border-border/60 p-2.5 text-xs"
        data-testid={`${testIdPrefix}-symptom-none-row`}
      >
        <input
          type="checkbox"
          checked={noSymptomsObserved}
          onChange={(event) => onNoSymptomsObservedChange(event.target.checked)}
          disabled={disabled}
          className="mt-0.5"
          data-testid={`${testIdPrefix}-symptom-none-observed`}
        />
        <span>
          I checked this plant and saw no visible symptoms. Records the check as evidence; it is not
          a health verdict.
        </span>
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label
            htmlFor={`${testIdPrefix}-symptom-location`}
            className="text-[11px] text-muted-foreground"
          >
            Location (optional)
          </Label>
          <select
            id={`${testIdPrefix}-symptom-location`}
            value={observationLocation}
            onChange={(event) => onObservationLocationChange(event.target.value)}
            disabled={disabled}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Not recorded</option>
            {(locationField?.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label
            htmlFor={`${testIdPrefix}-symptom-stage`}
            className="text-[11px] text-muted-foreground"
          >
            Current plant stage (required)
          </Label>
          <select
            id={`${testIdPrefix}-symptom-stage`}
            value={stage ?? ""}
            onChange={(event) =>
              onStageChange((event.target.value || null) as CanonicalQuickLogStage | null)
            }
            disabled={disabled}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            data-testid={`${testIdPrefix}-symptom-stage`}
          >
            <option value="">Choose stage</option>
            {STAGES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex min-h-[44px] items-start gap-2 rounded-md border border-border/60 p-2.5 text-xs">
        <input
          type="checkbox"
          checked={stageConfirmed}
          onChange={(event) => onStageConfirmedChange(event.target.checked)}
          disabled={disabled || !stage}
          className="mt-0.5"
          data-testid={`${testIdPrefix}-symptom-stage-confirmed`}
        />
        <span>I checked the plant and confirm this is its current stage.</span>
      </label>
    </fieldset>
  );
}
