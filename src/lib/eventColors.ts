import { EventType } from "@/store/verdant";

// Single source of truth for event/diary type colors.
// Tailwind classes only — no raw hex values.

export const eventDot: Record<EventType, string> = {
  watering: "bg-info",
  feeding: "bg-primary",
  training: "bg-warning",
  photo: "bg-accent",
  diagnosis: "bg-destructive",
  harvest: "bg-leaf",
  reminder: "bg-muted-foreground",
  transplant: "bg-secondary-foreground",
  environment: "bg-success",
  note: "bg-muted-foreground",
};

export const eventChip: Record<EventType, string> = {
  note: "bg-muted text-muted-foreground border-border",
  watering: "bg-info/20 text-info border-info/40",
  feeding: "bg-primary/20 text-primary border-primary/40",
  training: "bg-warning/20 text-warning border-warning/40",
  photo: "bg-accent/20 text-accent-foreground border-accent/40",
  diagnosis: "bg-destructive/20 text-destructive border-destructive/40",
  environment: "bg-success/20 text-success border-success/40",
  transplant: "bg-secondary text-secondary-foreground border-border",
  harvest: "bg-leaf/20 text-leaf border-leaf/40",
  reminder: "bg-muted text-muted-foreground border-border",
};
