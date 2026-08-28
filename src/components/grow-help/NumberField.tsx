import { useEffect, useState, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface NumberFieldProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  help?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  integer?: boolean;
}

function numberFieldError(
  value: number | null,
  options: Pick<NumberFieldProps, "label" | "min" | "max" | "required" | "integer">,
): string | null {
  if (value === null) return options.required ? `Enter ${options.label.toLowerCase()}.` : null;
  if (!Number.isFinite(value)) return `${options.label} must be a number.`;
  if (value < options.min || value > options.max) {
    return `${options.label} must be between ${options.min} and ${options.max}.`;
  }
  if (options.integer && !Number.isInteger(value)) {
    return `${options.label} must be a whole number.`;
  }
  return null;
}

export default function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  help,
  required = false,
  disabled = false,
  className,
  placeholder,
  integer = false,
}: NumberFieldProps) {
  // Preserve an empty editing draft even when a parent keeps a non-null
  // fallback. Mobile users can backspace and type a replacement without the
  // old value snapping back between keystrokes. Blur returns to the canonical
  // parent value.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (draft === null || draft.trim() === "" || value === null) return;
    const parsedDraft = Number(draft.trim());
    if (
      Number.isFinite(parsedDraft) &&
      Math.abs(parsedDraft - value) > Number.EPSILON * Math.max(1, Math.abs(value))
    ) {
      // A unit conversion or other external update changed the canonical
      // value. Stop showing the now-stale editing text.
      setDraft(null);
    }
  }, [draft, value]);
  const effectiveValue = draft === null ? value : draft.trim() === "" ? null : Number(draft.trim());
  const error = numberFieldError(effectiveValue, { label, min, max, required, integer });
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value.trim();
    setDraft(event.target.value);
    onChange(next === "" ? null : Number(next));
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={draft ?? value ?? ""}
          onChange={handleChange}
          onBlur={() => setDraft(null)}
          min={min}
          max={max}
          step={step}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={unit ? "pr-16" : undefined}
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {help ? (
        <p id={helpId} className="text-xs leading-5 text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
