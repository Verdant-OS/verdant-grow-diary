/**
 * diaryTimelineActionStyles — single source of truth for the diary
 * timeline action kind → label / icon / tone mapping.
 *
 * Pure constants. UI components must consume the view-model output and
 * MUST NOT duplicate this mapping in JSX.
 *
 * Tone tokens map to semantic design-system colors (text-* utility names)
 * so theming stays consistent in light/dark mode.
 */

export type DiaryTimelineActionKind =
  | "diary_note"
  | "observation"
  | "watering"
  | "feeding"
  | "training"
  | "defoliation"
  | "transplant"
  | "photo"
  | "measurement"
  | "environment"
  | "diagnosis"
  | "pest_disease"
  | "harvest"
  | "action_followup"
  | "action_outcome"
  | "unknown";

export type DiaryTimelineActionIconName =
  | "NotebookPen"
  | "Droplet"
  | "FlaskConical"
  | "Scissors"
  | "Camera"
  | "Gauge"
  | "Stethoscope"
  | "Sprout"
  | "ClipboardCheck"
  | "Circle";

/**
 * Tone tokens — semantic tailwind text colors backed by the design system.
 * Stable strings so tests can assert on them without coupling to specific
 * hex/HSL values.
 */
export type DiaryTimelineActionTone =
  | "neutral"
  | "info"
  | "primary"
  | "accent"
  | "warning"
  | "success"
  | "destructive";

export interface DiaryTimelineActionStyle {
  kind: DiaryTimelineActionKind;
  label: string;
  iconName: DiaryTimelineActionIconName;
  tone: DiaryTimelineActionTone;
  ariaLabel: string;
}

const STYLES: Record<DiaryTimelineActionKind, DiaryTimelineActionStyle> = {
  diary_note: {
    kind: "diary_note",
    label: "Diary note",
    iconName: "NotebookPen",
    tone: "neutral",
    ariaLabel: "Diary note entry",
  },
  observation: {
    kind: "observation",
    label: "Diary note",
    iconName: "NotebookPen",
    tone: "neutral",
    ariaLabel: "Diary note entry",
  },
  watering: {
    kind: "watering",
    label: "Watering",
    iconName: "Droplet",
    tone: "info",
    ariaLabel: "Watering entry",
  },
  feeding: {
    kind: "feeding",
    label: "Feeding",
    iconName: "FlaskConical",
    tone: "primary",
    ariaLabel: "Feeding entry",
  },
  training: {
    kind: "training",
    label: "Training",
    iconName: "Scissors",
    tone: "accent",
    ariaLabel: "Training entry",
  },
  defoliation: {
    kind: "defoliation",
    label: "Defoliation",
    iconName: "Scissors",
    tone: "accent",
    ariaLabel: "Defoliation entry",
  },
  transplant: {
    kind: "transplant",
    label: "Transplant",
    iconName: "Sprout",
    tone: "success",
    ariaLabel: "Transplant entry",
  },
  photo: {
    kind: "photo",
    label: "Photo",
    iconName: "Camera",
    tone: "neutral",
    ariaLabel: "Photo entry",
  },
  measurement: {
    kind: "measurement",
    label: "Measurement",
    iconName: "Gauge",
    tone: "info",
    ariaLabel: "Measurement entry",
  },
  environment: {
    kind: "environment",
    label: "Environment check",
    iconName: "Gauge",
    tone: "info",
    ariaLabel: "Environment check entry",
  },
  diagnosis: {
    kind: "diagnosis",
    label: "Diagnosis",
    iconName: "Stethoscope",
    tone: "warning",
    ariaLabel: "Diagnosis entry",
  },
  pest_disease: {
    kind: "pest_disease",
    label: "Pest / Disease",
    iconName: "Stethoscope",
    tone: "destructive",
    ariaLabel: "Pest or disease entry",
  },
  harvest: {
    kind: "harvest",
    label: "Harvest",
    iconName: "Sprout",
    tone: "success",
    ariaLabel: "Harvest entry",
  },
  action_followup: {
    kind: "action_followup",
    label: "Follow-up",
    iconName: "ClipboardCheck",
    tone: "info",
    ariaLabel: "Action follow-up entry",
  },
  action_outcome: {
    kind: "action_outcome",
    label: "Outcome",
    iconName: "ClipboardCheck",
    tone: "success",
    ariaLabel: "Action outcome entry",
  },
  unknown: {
    kind: "unknown",
    label: "Entry",
    iconName: "Circle",
    tone: "neutral",
    ariaLabel: "Timeline entry",
  },
};

export const DIARY_TIMELINE_ACTION_STYLES = STYLES;

export const DIARY_TIMELINE_TONE_CLASS: Record<DiaryTimelineActionTone, string> =
  {
    neutral: "text-muted-foreground",
    info: "text-sky-400",
    primary: "text-primary",
    accent: "text-violet-400",
    warning: "text-amber-400",
    success: "text-emerald-400",
    destructive: "text-destructive",
  };

export function getDiaryTimelineActionStyle(
  kind: string | null | undefined,
): DiaryTimelineActionStyle {
  if (!kind) return STYLES.unknown;
  const k = String(kind) as DiaryTimelineActionKind;
  return STYLES[k] ?? STYLES.unknown;
}
