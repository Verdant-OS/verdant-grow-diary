/**
 * plantGeneticsViewModel — pure, presenter-only view-model helper for
 * optional strain / genetics / lineage context on plant memory surfaces.
 *
 * Hard constraints:
 *   - No Supabase / client / network imports.
 *   - No I/O, no fetching, no persistence.
 *   - Never throws on malformed input.
 *   - All inputs are treated as untrusted `unknown`.
 *
 * This module deliberately has zero runtime dependencies.
 */

export interface PlantGeneticsViewModel {
  strainName: string | null;
  breeder: string | null;
  genetics: string | null;
  /** Up to `maxLineage` deduplicated, trimmed lineage names. */
  lineagePreview: string[];
  /** Count of lineage entries that were truncated past `maxLineage`. */
  hiddenLineageCount: number;
  generation: string | null;
  /** True when at least one displayable field is present. */
  shouldRender: boolean;
}

export interface PlantGeneticsInput {
  /** Strain may be a plain string or a structured object. */
  strain?: unknown;
  /** Some callers carry strain fields flat on the plant — accept both. */
  strainName?: unknown;
  breeder?: unknown;
  genetics?: unknown;
  lineage?: unknown;
  generation?: unknown;
}

export interface BuildPlantGeneticsOptions {
  /** Maximum lineage chips to render. Defaults to 4. */
  maxLineage?: number;
}

const DEFAULT_MAX_LINEAGE = 4;

const EMPTY_VM: PlantGeneticsViewModel = {
  strainName: null,
  breeder: null,
  genetics: null,
  lineagePreview: [],
  hiddenLineageCount: 0,
  generation: null,
  shouldRender: false,
};

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLineage(input: unknown, max: number): { preview: string[]; hidden: number } {
  if (!Array.isArray(input)) return { preview: [], hidden: 0 };
  const seen = new Set<string>();
  const all: string[] = [];
  for (const raw of input) {
    let name: string | null = null;
    if (typeof raw === "string") {
      name = trimToNull(raw);
    } else if (isPlainObject(raw)) {
      name = trimToNull(raw.name) ?? trimToNull(raw.strain);
    }
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(name);
  }
  const limit = Math.max(0, Number.isFinite(max) ? Math.floor(max) : DEFAULT_MAX_LINEAGE);
  const preview = all.slice(0, limit);
  const hidden = Math.max(0, all.length - preview.length);
  return { preview, hidden };
}

function normalizeGeneration(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return trimToNull(value);
}

/**
 * Build a safe view model from an unknown plant- or strain-shaped input.
 * Never throws; returns an empty (non-renderable) view model on garbage.
 */
export function buildPlantGeneticsViewModel(
  input: unknown,
  options: BuildPlantGeneticsOptions = {},
): PlantGeneticsViewModel {
  const max = options.maxLineage ?? DEFAULT_MAX_LINEAGE;
  try {
    if (input == null) return EMPTY_VM;

    // Allow bare strain string as the entire input.
    if (typeof input === "string") {
      const name = trimToNull(input);
      if (!name) return EMPTY_VM;
      return { ...EMPTY_VM, strainName: name, shouldRender: true };
    }

    if (!isPlainObject(input)) return EMPTY_VM;

    const root = input as PlantGeneticsInput & Record<string, unknown>;
    let strainObj: Record<string, unknown> | null = null;
    let strainAsString: string | null = null;

    if (typeof root.strain === "string") {
      strainAsString = trimToNull(root.strain);
    } else if (isPlainObject(root.strain)) {
      strainObj = root.strain;
    }

    const pick = (key: string): unknown =>
      (strainObj && strainObj[key] !== undefined ? strainObj[key] : root[key]);

    const strainName =
      trimToNull(strainObj?.name) ??
      trimToNull(root.strainName) ??
      strainAsString;

    const breeder = trimToNull(pick("breeder"));
    const genetics = trimToNull(pick("genetics"));
    const generation = normalizeGeneration(pick("generation"));
    const lineageRaw = strainObj?.lineage ?? root.lineage;
    const { preview, hidden } = normalizeLineage(lineageRaw, max);

    const shouldRender =
      Boolean(strainName) ||
      Boolean(genetics) ||
      Boolean(breeder) ||
      Boolean(generation) ||
      preview.length > 0;

    return {
      strainName,
      breeder,
      genetics,
      lineagePreview: preview,
      hiddenLineageCount: hidden,
      generation,
      shouldRender,
    };
  } catch {
    return EMPTY_VM;
  }
}

export const PLANT_GENETICS_DEFAULT_MAX_LINEAGE = DEFAULT_MAX_LINEAGE;
