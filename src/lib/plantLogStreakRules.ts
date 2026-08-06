/**
 * plantLogStreakRules — pure view rules for the Plant Detail "logged today"
 * retention marker.
 *
 * Turns a plant's recent diary entry timestamps into a small, honest status:
 * whether the grower logged today, the current consecutive-day streak, and
 * whether to show a calm Pro teaser (free plan + real history only).
 *
 * Hard constraints (repo rules-module style):
 *   - Pure & deterministic: clock injected via `now`; no I/O, no React.
 *   - Honest: streak is computed only from the entries provided (a bounded
 *     recent window) and never extrapolated.
 *   - Calm copy: no pressure mechanics, no loss-aversion wording, and none of
 *     the banned marketing words (see paywallCtaViewModel banned list).
 *   - The teaser NEVER hides data — it is an additive one-line link.
 */

export interface PlantLogStreakInput {
  /** Entry timestamps (ISO), any order; nulls/invalid are ignored. */
  entryAts: ReadonlyArray<string | null | undefined>;
  /** Injected clock (epoch ms). */
  now: number;
  /** True when the resolved plan is free (teaser eligibility). */
  isFreePlan: boolean;
}

export interface PlantLogStreakView {
  hasAny: boolean;
  loggedToday: boolean;
  /**
   * Current consecutive-day streak. Counts back from today when today has an
   * entry, else from yesterday (a streak survives until a full day is
   * missed). 0 when neither today nor yesterday has an entry.
   */
  streakDays: number;
  /** Distinct local days with at least one entry, within the given window. */
  daysLoggedInWindow: number;
  /** "Logged today" / "No log yet today" / "No logs yet". */
  statusLabel: string;
  /** "3-day streak" when streakDays >= 2, else null (a 1-day streak is noise). */
  streakLabel: string | null;
  teaser: {
    show: boolean;
    copy: string;
    ctaLabel: string;
    href: string;
  };
}

/** Free-plan teaser appears once the plant has real history (distinct days). */
export const PLANT_LOG_TEASER_MIN_DAYS = 3;

export const PLANT_LOG_TEASER_COPY =
  "This plant's memory is building. Pro keeps unlimited plant history and adds AI Doctor review.";

export const PLANT_LOG_TEASER_CTA_LABEL = "See plans";
export const PLANT_LOG_TEASER_HREF = "/pricing";

const MS_PER_DAY = 86_400_000;

/**
 * Local calendar-day key (days since epoch in the runtime's timezone).
 * Vitest pins TZ=UTC so tests are deterministic; in the browser this follows
 * the grower's local midnight, which is the honest reading of "today".
 */
function localDayKey(ms: number): number {
  const d = new Date(ms);
  // Shift by the local offset so the division buckets on LOCAL midnight.
  return Math.floor((ms - d.getTimezoneOffset() * 60_000) / MS_PER_DAY);
}

export function buildPlantLogStreakView(
  input: PlantLogStreakInput,
): PlantLogStreakView {
  const dayKeys = new Set<number>();
  for (const iso of input.entryAts ?? []) {
    if (typeof iso !== "string" || iso.length === 0) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    dayKeys.add(localDayKey(t));
  }

  const today = localDayKey(input.now);
  const loggedToday = dayKeys.has(today);
  const hasAny = dayKeys.size > 0;

  // Walk back day by day from the streak anchor (today when logged today,
  // else yesterday) counting consecutive logged days.
  let streakDays = 0;
  const anchor = loggedToday ? today : today - 1;
  for (let day = anchor; dayKeys.has(day); day -= 1) {
    streakDays += 1;
  }

  const statusLabel = !hasAny
    ? "No logs yet"
    : loggedToday
      ? "Logged today"
      : "No log yet today";

  const streakLabel =
    streakDays >= 2 ? `${streakDays}-day streak` : null;

  const show =
    input.isFreePlan === true && dayKeys.size >= PLANT_LOG_TEASER_MIN_DAYS;

  return {
    hasAny,
    loggedToday,
    streakDays,
    daysLoggedInWindow: dayKeys.size,
    statusLabel,
    streakLabel,
    teaser: {
      show,
      copy: PLANT_LOG_TEASER_COPY,
      ctaLabel: PLANT_LOG_TEASER_CTA_LABEL,
      href: PLANT_LOG_TEASER_HREF,
    },
  };
}
