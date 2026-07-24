/**
 * Quarantine clearance-preview rules.
 *
 * PURE: no React, no Supabase, no I/O. Never throws. This mirrors the SQL
 * clearance logic (`genetics_quarantine_transition` release branch) so the UI
 * can preview whether a release is possible and explain why not. It is ADVISORY
 * only — the SECURITY DEFINER RPC is always authoritative.
 *
 * A release is possible only when there is a current (non-superseded), matching
 * NEGATIVE for the episode's subject + target, collected on/after the last
 * (re)open, with no newer/equal contradicting evidence. Inconclusive /
 * not_tested / positive can never clear.
 */
import type { ScreeningRowInput } from "./screeningEvidenceRules";

export interface QuarantineEpisodeInput {
  readonly subjectType?: string | null;
  readonly subjectId?: string | null;
  readonly target?: string | null;
  readonly status?: string | null;
  readonly openedAt?: string | null;
  readonly reopenedAt?: string | null;
}

export interface QuarantineScreeningRow extends ScreeningRowInput {
  readonly subjectType?: string | null;
  readonly subjectId?: string | null;
}

export type ReleaseEligibility =
  | { readonly ok: true; readonly screeningId: string; readonly collectedDate: string | null }
  | { readonly ok: false; readonly reason: string };

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** UTC date (YYYY-MM-DD) of a timestamp; null if unparseable. Matches the SQL AT TIME ZONE 'UTC'::date. */
function utcDate(ts: string | null): string | null {
  if (!ts) return null;
  // Accept an ISO timestamp or a bare date.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(ts);
  return m ? m[1] : null;
}

/**
 * Evaluate whether the episode can be released given the owner's screening rows.
 * Returns the qualifying screening id, or a reason code aligned with the server.
 */
export function evaluateRelease(
  episode: QuarantineEpisodeInput | null | undefined,
  screeningRows: readonly QuarantineScreeningRow[] | null | undefined,
): ReleaseEligibility {
  const status = clean(episode?.status);
  if (status !== "open") {
    return { ok: false, reason: "illegal_transition" };
  }
  const subjectType = clean(episode?.subjectType);
  const subjectId = clean(episode?.subjectId);
  const target = clean(episode?.target)?.toLowerCase();
  if (!subjectType || !subjectId || !target) {
    return { ok: false, reason: "episode_incomplete" };
  }

  const effectiveOpen = utcDate(clean(episode?.reopenedAt) ?? clean(episode?.openedAt));
  const rows = Array.isArray(screeningRows) ? screeningRows : [];

  // Rows superseded by a later correction are not current.
  const superseded = new Set<string>();
  for (const r of rows) {
    const sup = clean(r?.supersedesId);
    if (sup) superseded.add(sup);
  }

  const forSubject = rows.filter(
    (r) =>
      clean(r?.subjectType) === subjectType &&
      clean(r?.subjectId) === subjectId &&
      clean(r?.target)?.toLowerCase() === target,
  );

  // Candidate negatives: current, collected on/after the effective open.
  const candidates = forSubject.filter((r) => {
    const id = clean(r?.id);
    if (id && superseded.has(id)) return false;
    if (clean(r?.result) !== "negative") return false;
    const collected = clean(r?.collectedDate);
    if (!collected) return false;
    if (effectiveOpen && collected < effectiveOpen) return false;
    return true;
  });

  if (candidates.length === 0) {
    return { ok: false, reason: "no_qualifying_negative" };
  }

  // Pick the latest candidate negative.
  const chosen = candidates.reduce((best, r) => {
    const a = clean(r?.collectedDate) ?? "";
    const b = clean(best?.collectedDate) ?? "";
    return a > b ? r : best;
  });
  const chosenCollected = clean(chosen?.collectedDate);

  // Any newer/equal contradicting current result blocks clearance.
  const contradicted = forSubject.some((r) => {
    const id = clean(r?.id);
    if (id && superseded.has(id)) return false;
    const result = clean(r?.result);
    if (result !== "positive" && result !== "inconclusive" && result !== "not_tested") return false;
    const collected = clean(r?.collectedDate);
    if (!collected || !chosenCollected) return false;
    return collected >= chosenCollected;
  });
  if (contradicted) {
    return { ok: false, reason: "contradicting_or_newer_evidence" };
  }

  return { ok: true, screeningId: clean(chosen?.id) ?? "", collectedDate: chosenCollected };
}

export function releaseReasonLabel(reason: string): string {
  switch (reason) {
    case "illegal_transition":
      return "This episode is not open.";
    case "episode_incomplete":
      return "This episode is missing a subject or target.";
    case "no_qualifying_negative":
      return "No negative screening for this subject and target has been recorded since it was opened.";
    case "contradicting_or_newer_evidence":
      return "A newer or equally-recent inconclusive/positive result contradicts the negative.";
    default:
      return "Release is not currently possible.";
  }
}
