/**
 * One-shot handoff of a visitor's Harvest Window Tracker checks across signup.
 *
 * Written only when the visitor clicks "Keep this log in Verdant" with at least
 * one logged check, read after sign-in so the grower can import the checks as
 * Notes on a plant they pick. sessionStorage only, one versioned key, 24 h TTL,
 * size cap; anything malformed, expired or oversized is removed and ignored.
 * No network, no localStorage, no write on page load. The clock is injected.
 */

import {
  HARVEST_TARGETS,
  type HarvestCheck,
  type HarvestRange,
  type HarvestRanges,
  type HarvestTarget,
} from "@/lib/harvestWindowRules";

export const HARVEST_HANDOFF_STORAGE_KEY = "verdant:harvest-handoff:v1" as const;
export const HARVEST_HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;
export const HARVEST_HANDOFF_MAX_CHECKS = 200;
export const HARVEST_HANDOFF_MAX_BYTES = 64_000;
/** Room a later plant binding needs, so binding never pushes a saved log past the cap. */
export const HARVEST_HANDOFF_BIND_RESERVE_BYTES = 256;
/** Where the post-signup prompt lives; a known authenticated route. */
export const HARVEST_HANDOFF_RETURN_PATH = "/plants" as const;

export interface HarvestHandoffCheck {
  date: string;
  plant: string;
  clear: number;
  cloudy: number;
  amber: number;
  pistils: string;
  photoNote: string;
}

export interface HarvestCheckHandoff {
  version: 1;
  createdAt: string;
  target: HarvestTarget;
  ranges: HarvestRanges;
  checks: HarvestHandoffCheck[];
  /** Set before the first save, so every retry and remount targets the same plant. */
  plantId?: string;
}

export interface HarvestHandoffStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function sessionStore(): HarvestHandoffStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function resolveStorage(storage?: HarvestHandoffStorage | null): HarvestHandoffStorage | null {
  return storage === undefined ? sessionStore() : storage;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value);
  return present.length === keys.length && present.every((key) => keys.includes(key));
}

function percent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function text(value: unknown): value is string {
  return typeof value === "string";
}

/** Strict YYYY-MM-DD that round-trips (no 02-30 rollover). */
export function isHarvestHandoffDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validRange(value: unknown): value is HarvestRange {
  return (
    object(value) &&
    onlyKeys(value, ["cloudyMin", "amberMin", "amberMax"]) &&
    percent(value.cloudyMin) &&
    percent(value.amberMin) &&
    percent(value.amberMax)
  );
}

function validRanges(value: unknown): value is HarvestRanges {
  return (
    object(value) &&
    onlyKeys(value, HARVEST_TARGETS) &&
    HARVEST_TARGETS.every((t) => validRange(value[t]))
  );
}

function validCheck(value: unknown): value is HarvestHandoffCheck {
  return (
    object(value) &&
    onlyKeys(value, ["date", "plant", "clear", "cloudy", "amber", "pistils", "photoNote"]) &&
    isHarvestHandoffDate(value.date) &&
    text(value.plant) &&
    percent(value.clear) &&
    percent(value.cloudy) &&
    percent(value.amber) &&
    text(value.pistils) &&
    text(value.photoNote)
  );
}

/** A closed, versioned projection; anything else is not a handoff. */
export function parseHarvestCheckHandoff(value: unknown, now: Date): HarvestCheckHandoff | null {
  if (
    !object(value) ||
    !onlyKeys(
      value,
      "plantId" in value
        ? ["version", "createdAt", "target", "ranges", "checks", "plantId"]
        : ["version", "createdAt", "target", "ranges", "checks"],
    ) ||
    ("plantId" in value &&
      (typeof value.plantId !== "string" ||
        value.plantId.length === 0 ||
        value.plantId.length > 200)) ||
    value.version !== 1 ||
    typeof value.createdAt !== "string" ||
    !(HARVEST_TARGETS as readonly unknown[]).includes(value.target) ||
    !validRanges(value.ranges) ||
    !Array.isArray(value.checks) ||
    value.checks.length === 0 ||
    value.checks.length > HARVEST_HANDOFF_MAX_CHECKS ||
    !value.checks.every(validCheck)
  )
    return null;
  const created = Date.parse(value.createdAt);
  if (!Number.isFinite(created)) return null;
  const age = now.getTime() - created;
  if (age < 0 || age > HARVEST_HANDOFF_TTL_MS) return null;
  return value as unknown as HarvestCheckHandoff;
}

// Text is never shortened: a handoff carries every check whole or is not saved.
function toHandoffCheck(check: HarvestCheck): HarvestHandoffCheck {
  return {
    date: check.date,
    plant: check.plant,
    clear: check.clear,
    cloudy: check.cloudy,
    amber: check.amber,
    pistils: check.pistils,
    photoNote: check.photoNote,
  };
}

/**
 * Save the visitor's checks for the signup round trip. Zero checks never
 * write. Returns true only when every check is stored whole and reads back
 * intact; more than the check or size cap returns false and writes nothing.
 */
export function saveHarvestCheckHandoff(
  input: { target: HarvestTarget; ranges: HarvestRanges; checks: readonly HarvestCheck[] },
  now: Date,
  storage?: HarvestHandoffStorage | null,
): boolean {
  if (input.checks.length === 0) return false;
  const store = resolveStorage(storage);
  if (!store) return false;
  const handoff: HarvestCheckHandoff = {
    version: 1,
    createdAt: now.toISOString(),
    target: input.target,
    ranges: {
      energetic: { ...input.ranges.energetic },
      peak: { ...input.ranges.peak },
      body: { ...input.ranges.body },
    },
    checks: input.checks.map(toHandoffCheck),
  };
  const raw = JSON.stringify(handoff);
  if (
    !parseHarvestCheckHandoff(handoff, now) ||
    raw.length > HARVEST_HANDOFF_MAX_BYTES - HARVEST_HANDOFF_BIND_RESERVE_BYTES
  ) {
    // A refused log must not leave an older handoff behind to be imported instead.
    clearHarvestCheckHandoff(store);
    return false;
  }
  try {
    store.setItem(HARVEST_HANDOFF_STORAGE_KEY, raw);
    if (store.getItem(HARVEST_HANDOFF_STORAGE_KEY) === raw) return true;
  } catch {
    // Fall through: storage refused the write.
  }
  clearHarvestCheckHandoff(store);
  return false;
}

/**
 * Record the plant an import targets before its first save. Retries, a lost
 * response or a reload then stay on that plant, so the idempotency keys replay
 * instead of copying checks onto another plant. `null` removes the binding.
 * Returns false, leaving the stored value as it was, if it cannot be stored.
 */
export function bindHarvestCheckHandoffPlant(
  handoff: HarvestCheckHandoff,
  plantId: string | null,
  storage?: HarvestHandoffStorage | null,
): boolean {
  const store = resolveStorage(storage);
  if (!store) return false;
  const { plantId: _previous, ...unbound } = handoff;
  const raw = JSON.stringify(plantId ? { ...unbound, plantId } : unbound);
  if (raw.length > HARVEST_HANDOFF_MAX_BYTES) return false;
  try {
    store.setItem(HARVEST_HANDOFF_STORAGE_KEY, raw);
    return store.getItem(HARVEST_HANDOFF_STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}

/** Read a valid handoff; an expired, oversized or malformed one is removed. */
export function readHarvestCheckHandoff(
  now: Date,
  storage?: HarvestHandoffStorage | null,
): HarvestCheckHandoff | null {
  const store = resolveStorage(storage);
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(HARVEST_HANDOFF_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: HarvestCheckHandoff | null = null;
  if (raw.length <= HARVEST_HANDOFF_MAX_BYTES) {
    try {
      parsed = parseHarvestCheckHandoff(JSON.parse(raw), now);
    } catch {
      parsed = null;
    }
  }
  if (!parsed) clearHarvestCheckHandoff(store);
  return parsed;
}

export function clearHarvestCheckHandoff(storage?: HarvestHandoffStorage | null): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(HARVEST_HANDOFF_STORAGE_KEY);
  } catch {
    // Storage can be unavailable; nothing else depends on this key.
  }
}

/** The signup link that brings the grower back to the import prompt. */
export function harvestHandoffSignupHref(baseHref: string): string {
  return `${baseHref}&redirectTo=${encodeURIComponent(HARVEST_HANDOFF_RETURN_PATH)}`;
}

export const HARVEST_HANDOFF_COUNT_BUCKETS = ["1", "2-5", "6-20", "21+"] as const;
export type HarvestHandoffCountBucket = (typeof HARVEST_HANDOFF_COUNT_BUCKETS)[number];

export function harvestHandoffCountBucket(count: number): HarvestHandoffCountBucket {
  if (count <= 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  return "21+";
}

/**
 * Local noon on the check's date, so the timeline shows that calendar date in
 * the grower's own timezone; a check dated today is never placed after
 * `latest`. Pass the handoff's `createdAt` so every retry sends the same
 * instant under the same idempotency key.
 */
export function harvestHandoffOccurredAt(date: string, latest: Date): string {
  const [year, month, day] = date.split("-").map(Number);
  const noon = new Date(year, month - 1, day, 12);
  return (noon.getTime() > latest.getTime() ? latest : noon).toISOString();
}

/** Deterministic per check, so a retried import replays instead of duplicating. */
export function harvestHandoffIdempotencyKey(
  handoff: Pick<HarvestCheckHandoff, "createdAt">,
  plantId: string,
  index: number,
): string {
  return `harvest-handoff:${handoff.createdAt}:${plantId}:${index}`;
}

export function buildHarvestHandoffNote(check: HarvestHandoffCheck): string {
  const lines = [
    `Trichome check (Harvest Window Tracker): clear ${check.clear}%, cloudy ${check.cloudy}%, amber ${check.amber}%.`,
  ];
  if (check.plant.trim()) lines.push(`Plant label in the tracker: ${check.plant.trim()}`);
  if (check.pistils.trim()) lines.push(`Pistils: ${check.pistils.trim()}`);
  if (check.photoNote.trim()) lines.push(`Note: ${check.photoNote.trim()}`);
  return lines.join("\n");
}
