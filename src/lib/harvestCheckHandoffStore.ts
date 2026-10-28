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
/** Where the post-signup prompt lives; a known authenticated route. */
export const HARVEST_HANDOFF_RETURN_PATH = "/plants" as const;

const MAX_PLANT_CHARS = 80;
const MAX_PISTILS_CHARS = 500;
const MAX_PHOTO_NOTE_CHARS = 1000;

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

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
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
    boundedString(value.plant, MAX_PLANT_CHARS) &&
    percent(value.clear) &&
    percent(value.cloudy) &&
    percent(value.amber) &&
    boundedString(value.pistils, MAX_PISTILS_CHARS) &&
    boundedString(value.photoNote, MAX_PHOTO_NOTE_CHARS)
  );
}

/** A closed, versioned projection; anything else is not a handoff. */
export function parseHarvestCheckHandoff(value: unknown, now: Date): HarvestCheckHandoff | null {
  if (
    !object(value) ||
    !onlyKeys(value, ["version", "createdAt", "target", "ranges", "checks"]) ||
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

function toHandoffCheck(check: HarvestCheck): HarvestHandoffCheck {
  return {
    date: check.date,
    plant: check.plant.slice(0, MAX_PLANT_CHARS),
    clear: check.clear,
    cloudy: check.cloudy,
    amber: check.amber,
    pistils: check.pistils.slice(0, MAX_PISTILS_CHARS),
    photoNote: check.photoNote.slice(0, MAX_PHOTO_NOTE_CHARS),
  };
}

/**
 * Save the visitor's checks for the signup round trip. Zero checks never
 * write. Returns true only when the stored value reads back intact.
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
    checks: input.checks.slice(0, HARVEST_HANDOFF_MAX_CHECKS).map(toHandoffCheck),
  };
  if (!parseHarvestCheckHandoff(handoff, now)) return false;
  const raw = JSON.stringify(handoff);
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

/** Midday UTC keeps the check's calendar date in every timezone from UTC−11 to UTC+11. */
export function harvestHandoffOccurredAt(date: string): string {
  return `${date}T12:00:00.000Z`;
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
