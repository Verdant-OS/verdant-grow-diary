import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QUICK_LOG_MATURITY_NOTE_LIMIT,
  type QuickLogMaturityEvidenceFormState,
} from "@/lib/quickLogMaturityEvidenceRules";

interface Props {
  value: QuickLogMaturityEvidenceFormState;
  onChange: (next: QuickLogMaturityEvidenceFormState) => void;
  visible: boolean;
  disabled?: boolean;
}

export default function QuickLogMaturityEvidenceFields({
  value,
  onChange,
  visible,
  disabled = false,
}: Props) {
  if (!visible) return null;

  const setField = <K extends keyof QuickLogMaturityEvidenceFormState>(
    field: K,
    fieldValue: QuickLogMaturityEvidenceFormState[K],
  ) => onChange({ ...value, [field]: fieldValue });

  return (
    <details className="rounded-md border border-border p-3" data-testid="qlv2-maturity-evidence">
      <summary className="cursor-pointer text-sm font-medium">Maturity evidence</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          Evidence only — grower decides. Use close-up photos and observation notes when available.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="qlv2-maturity-clear">Clear %</Label>
            <Input
              id="qlv2-maturity-clear"
              inputMode="decimal"
              value={value.clearPct}
              disabled={disabled}
              onChange={(e) => setField("clearPct", e.target.value)}
              aria-describedby="qlv2-maturity-percent-help"
            />
          </div>
          <div>
            <Label htmlFor="qlv2-maturity-cloudy">Cloudy %</Label>
            <Input
              id="qlv2-maturity-cloudy"
              inputMode="decimal"
              value={value.cloudyPct}
              disabled={disabled}
              onChange={(e) => setField("cloudyPct", e.target.value)}
              aria-describedby="qlv2-maturity-percent-help"
            />
          </div>
          <div>
            <Label htmlFor="qlv2-maturity-amber">Amber %</Label>
            <Input
              id="qlv2-maturity-amber"
              inputMode="decimal"
              value={value.amberPct}
              disabled={disabled}
              onChange={(e) => setField("amberPct", e.target.value)}
              aria-describedby="qlv2-maturity-percent-help"
            />
          </div>
        </div>
        <p id="qlv2-maturity-percent-help" className="text-sm text-muted-foreground">
          Optional manual estimate. Do not force totals to 100.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="qlv2-maturity-color">Color note</Label>
            <Textarea
              id="qlv2-maturity-color"
              value={value.colorNote}
              disabled={disabled}
              maxLength={QUICK_LOG_MATURITY_NOTE_LIMIT}
              onChange={(e) => setField("colorNote", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label htmlFor="qlv2-maturity-recession">Recession note</Label>
            <Textarea
              id="qlv2-maturity-recession"
              value={value.recessionNote}
              disabled={disabled}
              maxLength={QUICK_LOG_MATURITY_NOTE_LIMIT}
              onChange={(e) => setField("recessionNote", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label htmlFor="qlv2-maturity-swell">Swell note</Label>
            <Textarea
              id="qlv2-maturity-swell"
              value={value.swellNote}
              disabled={disabled}
              maxLength={QUICK_LOG_MATURITY_NOTE_LIMIT}
              onChange={(e) => setField("swellNote", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label htmlFor="qlv2-maturity-aroma">Aroma note</Label>
            <Textarea
              id="qlv2-maturity-aroma"
              value={value.aromaNote}
              disabled={disabled}
              maxLength={QUICK_LOG_MATURITY_NOTE_LIMIT}
              onChange={(e) => setField("aromaNote", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label htmlFor="qlv2-maturity-fade">Fade note</Label>
            <Textarea
              id="qlv2-maturity-fade"
              value={value.fadeNote}
              disabled={disabled}
              maxLength={QUICK_LOG_MATURITY_NOTE_LIMIT}
              onChange={(e) => setField("fadeNote", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label htmlFor="qlv2-maturity-grower-note">Grower note</Label>
            <Textarea
              id="qlv2-maturity-grower-note"
              value={value.growerNote}
              disabled={disabled}
              maxLength={QUICK_LOG_MATURITY_NOTE_LIMIT}
              onChange={(e) => setField("growerNote", e.target.value)}
              placeholder="What changed since last check?"
            />
          </div>
        </div>
      </div>
    </details>
  );
}
