/**
 * phenoHuntRenameRules — #551.
 *
 * Hunt names used to be immutable, so rows mangled by the pre-#482 prefill
 * concat bug could not be repaired in-app. These rules validate a rename
 * typed in the workspace. Pure: no React, no I/O, deterministic.
 */

/** Upper bound for a typed rename. Existing longer names still render. */
export const PHENO_HUNT_NAME_MAX_LENGTH = 120;

export type PhenoHuntRenameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: "empty" | "too_long" | "unchanged" };

export const PHENO_HUNT_RENAME_COPY = {
  open: "Rename",
  label: "Hunt name",
  save: "Save name",
  cancel: "Cancel",
  saving: "Saving…",
  empty: "Enter a hunt name.",
  tooLong: `Keep the name to ${PHENO_HUNT_NAME_MAX_LENGTH} characters or fewer.`,
  unchanged: "",
  saveFailed: "Couldn't rename this hunt — check your connection and try again.",
} as const;

/** Trim and collapse internal whitespace runs. */
export function normalizePhenoHuntName(raw: string | null | undefined): string {
  return (typeof raw === "string" ? raw : "").trim().replace(/\s+/g, " ");
}

export function validatePhenoHuntRename(
  raw: string | null | undefined,
  currentName: string | null | undefined,
): PhenoHuntRenameResult {
  const name = normalizePhenoHuntName(raw);
  if (!name) return { ok: false, reason: "empty" };
  if (name.length > PHENO_HUNT_NAME_MAX_LENGTH) return { ok: false, reason: "too_long" };
  if (name === normalizePhenoHuntName(currentName)) return { ok: false, reason: "unchanged" };
  return { ok: true, name };
}

/**
 * An optimistic value saved for ONE hunt. The workspace route isn't keyed by
 * hunt id, so the same page instance can move to another hunt; an override is
 * only honoured for the hunt it was saved on (#551 review P2).
 */
export interface HuntScopedOverride<T> {
  readonly huntId: string;
  readonly value: T;
}

export function huntScopedOverrideValue<T>(
  override: HuntScopedOverride<T> | null,
  huntId: string | null | undefined,
): T | null {
  if (!override || !huntId || override.huntId !== huntId) return null;
  return override.value;
}

/**
 * An optimistic hunt name, plus every name it replaced. The override stands
 * in only while the loaded row still shows one of `staleNames`: the original
 * row name, or an earlier rename a slow reload can still return. Once the row
 * shows this value, or any other name (another session's rename), the row is
 * authoritative again. No clock involved, so a stale in-flight load can't
 * flash an old name back (#551 CodeRabbit, Codex P2).
 */
export interface HuntNameOverride extends HuntScopedOverride<string> {
  readonly staleNames: readonly string[];
}

export function huntNameOverrideValue(
  override: HuntNameOverride | null,
  hunt: { readonly id: string; readonly name: string } | null | undefined,
): string | null {
  if (!override || !hunt || override.huntId !== hunt.id) return null;
  return override.staleNames.includes(hunt.name) ? override.value : null;
}

/** The override after a confirmed rename to `value` of the hunt whose loaded row shows `rowName`. */
export function nextHuntNameOverride(
  previous: HuntNameOverride | null,
  huntId: string,
  rowName: string,
  value: string,
): HuntNameOverride {
  const carried =
    previous && previous.huntId === huntId ? [...previous.staleNames, previous.value] : [];
  const staleNames: string[] = [];
  for (const name of [rowName, ...carried]) {
    if (name !== value && !staleNames.includes(name)) staleNames.push(name);
  }
  return { huntId, value, staleNames };
}

export function phenoHuntRenameHint(result: PhenoHuntRenameResult): string {
  if (result.ok) return "";
  if (result.reason === "empty") return PHENO_HUNT_RENAME_COPY.empty;
  if (result.reason === "too_long") return PHENO_HUNT_RENAME_COPY.tooLong;
  return PHENO_HUNT_RENAME_COPY.unchanged;
}
