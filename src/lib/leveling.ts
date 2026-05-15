// Level/tier curve — keep in sync with public.compute_level() in the database.
export const LEVEL_THRESHOLDS: number[] = [
  0, 500, 650, 845, 1099, 1428, 1856, 2413, 3137, 4078, 5301,
  7500, 9750, 12675, 16478, 21421, 27847, 36201, 47061, 61179, 79533,
  45000, 58500, 76050, 98865, 128525, 167082, 217207, 282369, 367080, 477204,
  160000, 208000, 270400, 351520, 456976, 594069, 772290, 1003977, 1305170, 1696721,
  500000, 650000, 845000, 1098500, 1428050, 1856465, 2413404, 3137425, 4078652, 5302248,
];

export type Tier = "seedling" | "vegetative" | "flowering" | "fruiting" | "harvest_master";

export const TIER_LABEL: Record<Tier, string> = {
  seedling: "Seedling",
  vegetative: "Vegetative",
  flowering: "Flowering",
  fruiting: "Fruiting",
  harvest_master: "Harvest Master",
};

export function tierForLevel(level: number): Tier {
  if (level >= 41) return "harvest_master";
  if (level >= 31) return "fruiting";
  if (level >= 21) return "flowering";
  if (level >= 11) return "vegetative";
  return "seedling";
}

export function progressToNext(total: number, level: number): { current: number; next: number; pct: number } {
  const current = LEVEL_THRESHOLDS[Math.max(0, Math.min(level, LEVEL_THRESHOLDS.length - 1))] ?? 0;
  const next = LEVEL_THRESHOLDS[Math.min(level + 1, LEVEL_THRESHOLDS.length - 1)] ?? current;
  if (next <= current) return { current, next, pct: 100 };
  const pct = Math.max(0, Math.min(100, ((total - current) / (next - current)) * 100));
  return { current, next, pct };
}

// Onboarding quest definitions used by the checklist UI.
export interface Quest {
  key: string;
  title: string;
  amount: number;
  href: string;
  description: string;
}

export const ONBOARDING_QUESTS: Quest[] = [
  { key: "onboarding_profile", title: "Set up your profile", amount: 100, href: "/rewards", description: "Add a display name." },
  { key: "onboarding_first_grow", title: "Create your first grow", amount: 150, href: "/grows", description: "Tent, outdoor, hydro — your call." },
  { key: "onboarding_first_entry", title: "Log your first diary entry", amount: 150, href: "/", description: "Tap the + button to log a note." },
  { key: "onboarding_first_coach", title: "Ask the AI Coach", amount: 100, href: "/coach", description: "Get a quick diagnosis or next steps." },
];

export const UNLOCK_LABELS: Record<string, { label: string; level: number }> = {
  grow_badge: { label: "Grow badge", level: 5 },
  strain_library: { label: "Strain library", level: 5 },
  custom_reminders: { label: "Custom grow reminders", level: 10 },
  second_grow: { label: "Run a second grow", level: 10 },
  vpd_tracker: { label: "VPD & light meter tools", level: 15 },
  strain_discount: { label: "Exclusive strain discount", level: 20 },
  breeding_database: { label: "Breeding & phenotype DB", level: 25 },
  premium_guides: { label: "Premium cultivation guides", level: 30 },
  priority_coach: { label: "Priority AI Coach", level: 30 },
  mentor_badge: { label: "Community mentor badge", level: 35 },
  limited_strains: { label: "Limited-edition strains", level: 40 },
  custom_advisory: { label: "Custom grow advisory", level: 40 },
  hall_of_growers: { label: "Hall of Growers leaderboard", level: 45 },
  legendary_cultivator: { label: "Legendary Cultivator", level: 50 },
};
