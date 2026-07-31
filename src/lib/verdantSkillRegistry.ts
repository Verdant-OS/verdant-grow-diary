/**
 * Closed registry for trusted, first-party Verdant skills.
 *
 * Adding a skill requires a source import and code review. Runtime callers
 * cannot register callbacks, load modules, or resolve remote implementations.
 */

import { PLANT_EVENT_REVIEW_SKILL_DEFINITION } from "@/lib/plantEventReviewSkill";
import {
  validateVerdantSkillManifest,
  type VerdantSkillDefinition,
  type VerdantSkillManifest,
} from "@/lib/verdantSkillManifest";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function buildVerdantSkillRegistryKey(id: string, version: string): string {
  return `${id}@${version}`;
}

const DEFINITIONS_SOURCE: readonly VerdantSkillDefinition<unknown, unknown>[] = [
  PLANT_EVENT_REVIEW_SKILL_DEFINITION as VerdantSkillDefinition<unknown, unknown>,
];

function buildClosedRegistry(): ReadonlyMap<string, VerdantSkillDefinition<unknown, unknown>> {
  const entries = DEFINITIONS_SOURCE.map((definition) => {
    const manifestValidation = validateVerdantSkillManifest(definition.manifest);
    if (manifestValidation.ok === false) {
      throw new Error(
        `Invalid registered Verdant skill manifest: ${manifestValidation.reasonCodes.join(",")}`,
      );
    }
    const key = buildVerdantSkillRegistryKey(
      manifestValidation.manifest.id,
      manifestValidation.manifest.version,
    );
    return [
      key,
      Object.freeze({
        manifest: manifestValidation.manifest,
        assess: definition.assess,
        run: definition.run,
        validateOutcome: definition.validateOutcome,
      }),
    ] as const;
  }).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  const seen = new Set<string>();
  for (const [key] of entries) {
    if (seen.has(key)) {
      throw new Error(`Duplicate Verdant skill registry key: ${key}`);
    }
    seen.add(key);
  }

  return new Map(entries);
}

const CLOSED_REGISTRY = buildClosedRegistry();

export const VERDANT_SKILL_DEFINITIONS: readonly VerdantSkillDefinition<unknown, unknown>[] =
  Object.freeze([...CLOSED_REGISTRY.values()]);

export const VERDANT_SKILL_MANIFESTS: readonly VerdantSkillManifest[] = Object.freeze(
  VERDANT_SKILL_DEFINITIONS.map((definition) => definition.manifest),
);

/**
 * Resolve an exact code-owned `id@version`. There is no latest-version
 * fallback because version selection must stay explicit and reproducible.
 */
export function resolveVerdantSkillDefinition(
  skillId: unknown,
  skillVersion: unknown,
): VerdantSkillDefinition<unknown, unknown> | null {
  if (
    typeof skillId !== "string" ||
    typeof skillVersion !== "string" ||
    !ID_PATTERN.test(skillId) ||
    !VERSION_PATTERN.test(skillVersion)
  ) {
    return null;
  }
  return CLOSED_REGISTRY.get(buildVerdantSkillRegistryKey(skillId, skillVersion)) ?? null;
}
