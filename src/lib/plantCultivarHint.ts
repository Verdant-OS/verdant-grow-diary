/**
 * Plant → cultivar reference hint (suggestion only).
 *
 * Doctrine: `plants.strain` is free text and is NEVER auto-linked to a cultivar.
 * This is a CONSERVATIVE, high-precision suggestion: it fires only when the
 * plant's strain text matches a published cultivar's name / search alias / slug
 * / alias on a whitespace- and punctuation-insensitive EXACT basis (so "GG-4"
 * and "GG4" hit Original Glue, but a bare "Blue" never suggests "Blue Dream").
 * The UI must let the grower dismiss it ("not the same strain").
 */
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";
import { normalizeSharedSearchText } from "@/lib/sharedSearchTextRules";

export interface PlantCultivarHint {
  slug: string;
  name: string;
}

function compact(value: string): string {
  return normalizeSharedSearchText(value).replace(/\s+/g, "");
}

/**
 * Return a confident cultivar match for a plant's free-text strain, or null.
 * Exact compact match against name/searchAlias/slug/aliases of a PUBLISHED
 * cultivar only. Deterministic (first published match in catalog order).
 */
export function matchCultivarForStrain(
  strain: string | null | undefined,
  cultivars: readonly VerdantCultivarProfile[] = VERDANT_CULTIVARS,
): PlantCultivarHint | null {
  const needle = compact(strain ?? "");
  if (needle.length < 2) return null;

  for (const cultivar of cultivars) {
    if (cultivar.publicationStatus !== "published") continue;
    const forms = [cultivar.name, cultivar.searchAlias, cultivar.slug, ...cultivar.aliases];
    if (forms.some((form) => compact(form) === needle)) {
      return { slug: cultivar.slug, name: cultivar.name };
    }
  }
  return null;
}
