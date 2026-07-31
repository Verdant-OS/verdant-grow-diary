/**
 * verdantSkillRegistry — the deterministic, version-aware registry of
 * Verdant skill manifests.
 *
 * Build 4 of Verdant Skill Runtime v1. This is NOT a marketplace: there
 * is no dynamic loading, no third-party code, no network. Registration
 * is an explicit static list, mirroring the repo's existing
 * `appRouteManifest` pattern (frozen entries + duplicate detection +
 * an assert helper).
 *
 * Determinism: registry order never depends on insertion order —
 * listings are sorted by id then descending semver, so the same set of
 * manifests always produces the same output.
 */

import {
  parseVerdantSkillManifest,
  skillManifestKey,
  type VerdantSkillManifest,
} from "@/lib/verdantSkillManifest";

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

function versionParts(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map((p) => Number.parseInt(p, 10));
  return [major, minor, patch];
}

/** Negative when a < b, positive when a > b, 0 when equal. */
export function compareSkillVersions(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = versionParts(a);
  const [bMajor, bMinor, bPatch] = versionParts(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface SkillRegistry {
  /** All registered manifests, sorted by id then newest version first. */
  list(): VerdantSkillManifest[];
  /** Exact id + version lookup. */
  get(id: string, version: string): VerdantSkillManifest | null;
  /**
   * Newest RESOLVABLE version of a skill: the highest version that is
   * neither deprecated nor superseded. Returns null when every version
   * is retired — a retired skill must not silently keep running.
   */
  resolveLatest(id: string): VerdantSkillManifest | null;
  /** Follows supersession to the manifest that replaces this one. */
  resolveSupersession(id: string, version: string): VerdantSkillManifest | null;
  ids(): string[];
}

export type BuildSkillRegistryResult =
  | { ok: true; registry: SkillRegistry }
  | { ok: false; issues: string[] };

/** Duplicate id@version pairs in a candidate list. */
export function findDuplicateSkillKeys(
  manifests: readonly { id: string; version: string }[],
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const m of manifests) {
    const key = skillManifestKey(m);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

/**
 * Deep-freeze a registered manifest. A registry entry is a governance
 * record: a caller must not be able to widen a registered permission
 * set or envelope after the fact by mutating the object it was handed.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function sortManifests(manifests: VerdantSkillManifest[]): VerdantSkillManifest[] {
  return [...manifests].sort((a, b) => {
    const idCmp = a.id.localeCompare(b.id);
    if (idCmp !== 0) return idCmp;
    // Newest version first within an id.
    return compareSkillVersions(b.version, a.version);
  });
}

/**
 * Build a registry from raw manifest data. Every manifest is validated;
 * a duplicate id@version or any invalid manifest fails the whole build
 * rather than silently registering a partial set.
 */
export function buildSkillRegistry(rawManifests: readonly unknown[]): BuildSkillRegistryResult {
  const issues: string[] = [];
  const manifests: VerdantSkillManifest[] = [];

  rawManifests.forEach((raw, index) => {
    const parsed = parseVerdantSkillManifest(raw);
    if (parsed.ok === false) {
      issues.push(...parsed.issues.map((i) => `[${index}] ${i}`));
      return;
    }
    manifests.push(parsed.manifest);
  });

  for (const key of findDuplicateSkillKeys(manifests)) {
    issues.push(`duplicate skill id@version: ${key}`);
  }

  // A manifest may only be superseded by a version of itself that
  // actually exists, and never by an older one.
  for (const m of manifests) {
    const successor = m.deprecation.supersededBy;
    if (successor === null) continue;
    const target = manifests.find((c) => c.id === m.id && c.version === successor);
    if (target === undefined) {
      issues.push(`${skillManifestKey(m)}: supersededBy ${successor} is not registered`);
      continue;
    }
    if (compareSkillVersions(successor, m.version) <= 0) {
      issues.push(`${skillManifestKey(m)}: supersededBy ${successor} is not newer`);
    }
  }

  if (issues.length > 0) return { ok: false, issues: issues.sort() };

  const sorted = sortManifests(manifests).map((m) => deepFreeze(m));
  const byKey = new Map<string, VerdantSkillManifest>();
  for (const m of sorted) byKey.set(skillManifestKey(m), m);

  const registry: SkillRegistry = {
    list: () => [...sorted],
    get: (id, version) => byKey.get(`${id}@${version}`) ?? null,
    ids: () => [...new Set(sorted.map((m) => m.id))].sort(),
    resolveLatest: (id) => {
      const usable = sorted.filter(
        (m) =>
          m.id === id &&
          m.deprecation.deprecated === false &&
          m.lifecycle !== "superseded" &&
          m.lifecycle !== "deprecated" &&
          m.lifecycle !== "paused",
      );
      // `sorted` is already newest-first within an id.
      return usable[0] ?? null;
    },
    resolveSupersession: (id, version) => {
      const current = byKey.get(`${id}@${version}`);
      if (current === undefined) return null;
      const successor = current.deprecation.supersededBy;
      if (successor === null) return null;
      return byKey.get(`${id}@${successor}`) ?? null;
    },
  };

  return { ok: true, registry };
}

/**
 * Throwing variant for module-load-time registration, mirroring
 * `assertUniqueAppRouteManifestPaths`.
 */
export function assertValidSkillRegistry(rawManifests: readonly unknown[]): SkillRegistry {
  const result = buildSkillRegistry(rawManifests);
  if (result.ok === false) {
    throw new Error(`[verdantSkillRegistry] ${result.issues.join("; ")}`);
  }
  return result.registry;
}
