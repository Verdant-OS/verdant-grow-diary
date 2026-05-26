import {
  Droplets,
  Utensils,
  Scissors,
  Camera,
  Stethoscope,
  Gauge,
  Sprout,
  Bell,
  Eye,
  FlaskConical,
  Bug,
  ArrowRightLeft,
  MoreHorizontal,
  ClipboardCheck,
  CircleCheckBig,
  type LucideIcon,
} from "lucide-react";

export interface EventTypeDef {
  value: string;
  label: string;
  icon: LucideIcon;
  /** tailwind classes for badge background/foreground */
  tone: string;
}

export const EVENT_TYPES: EventTypeDef[] = [
  {
    value: "observation",
    label: "Observation",
    icon: Eye,
    tone: "bg-secondary/60 text-foreground border-border/50",
  },
  {
    value: "watering",
    label: "Watering",
    icon: Droplets,
    tone: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  {
    value: "feeding",
    label: "Feeding",
    icon: Utensils,
    tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  {
    value: "training",
    label: "Training",
    icon: Scissors,
    tone: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
  {
    value: "defoliation",
    label: "Defoliation",
    icon: Scissors,
    tone: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
  {
    value: "transplant",
    label: "Transplant",
    icon: ArrowRightLeft,
    tone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    value: "measurement",
    label: "Measurement",
    icon: FlaskConical,
    tone: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  },
  {
    value: "environment",
    label: "Environment check",
    icon: Gauge,
    tone: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  },
  {
    value: "photo",
    label: "Photo",
    icon: Camera,
    tone: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  {
    value: "diagnosis",
    label: "Diagnosis",
    icon: Stethoscope,
    tone: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  {
    value: "pest_disease",
    label: "Pest / Disease",
    icon: Bug,
    tone: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  {
    value: "harvest",
    label: "Harvest",
    icon: Sprout,
    tone: "bg-primary/20 text-primary border-primary/40",
  },
  {
    value: "action_followup",
    label: "Follow-up",
    icon: ClipboardCheck,
    tone: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  },
  {
    value: "action_outcome",
    label: "Outcome",
    icon: CircleCheckBig,
    tone: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  },
  {
    value: "reminder",
    label: "Reminder",
    icon: Bell,
    tone: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  },
  {
    value: "other",
    label: "Other",
    icon: MoreHorizontal,
    tone: "bg-secondary/60 text-foreground border-border/50",
  },
];

export const EVENT_TYPE_MAP: Record<string, EventTypeDef> = Object.fromEntries(
  EVENT_TYPES.map((e) => [e.value, e]),
);

export function getEventType(value?: string | null): EventTypeDef {
  if (value && EVENT_TYPE_MAP[value]) return EVENT_TYPE_MAP[value];
  return EVENT_TYPE_MAP.observation;
}

export interface SensorSnapshot {
  temp?: number;
  rh?: number;
  vpd?: number;
  co2?: number;
  soil?: number;
  ts?: string;
}

import { sensorReadings } from "@/mock";

export function snapshotForTent(tentId: string): SensorSnapshot | null {
  const rows = sensorReadings.filter((r) => r.tentId === tentId);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  return {
    temp: last.temp,
    rh: last.rh,
    vpd: last.vpd,
    co2: last.co2,
    soil: last.soil,
    ts: last.ts,
  };
}
