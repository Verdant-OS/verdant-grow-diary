/**
 * Pure helpers for the agreement re-consent gate.
 *
 * Business rule: a user has satisfied a given agreement iff they have an
 * acceptance row with `version === current.version`. Older acceptances
 * do NOT satisfy the current version — that's the whole point of the
 * re-consent flow when we ship an updated agreement.
 */

import {
  CURRENT_AGREEMENT_LIST,
  type AgreementType,
  type AgreementVersion,
} from "@/constants/agreements";

export interface AcceptanceRow {
  agreement_type: AgreementType;
  version: string;
}

export interface AgreementGap {
  agreement: AgreementVersion;
  previouslyAcceptedVersion: string | null;
}

/**
 * Given the user's acceptance history and the current agreement registry,
 * return the list of agreements the user still needs to accept. An empty
 * array means the user is fully current.
 */
export function computeAgreementGaps(
  acceptances: readonly AcceptanceRow[] | null | undefined,
  current: readonly AgreementVersion[] = CURRENT_AGREEMENT_LIST,
): AgreementGap[] {
  const rows = Array.isArray(acceptances) ? acceptances : [];
  return current
    .map((agreement) => {
      const matches = rows.filter((r) => r.agreement_type === agreement.type);
      const hasCurrent = matches.some((r) => r.version === agreement.version);
      if (hasCurrent) return null;
      // "Previously accepted" = any prior version, deterministic ordering.
      const previous = matches
        .map((r) => r.version)
        .filter((v) => typeof v === "string" && v !== agreement.version)
        .sort()
        .pop() ?? null;
      return { agreement, previouslyAcceptedVersion: previous } satisfies AgreementGap;
    })
    .filter((g): g is AgreementGap => g !== null);
}

/**
 * Returns the rows to insert into `user_agreement_acceptances` when a
 * user accepts the current agreement set (signup or re-consent).
 * `user_agent` is optional; callers may add it at insert time.
 */
export function buildAcceptanceRows(
  userId: string,
  current: readonly AgreementVersion[] = CURRENT_AGREEMENT_LIST,
): Array<{
  user_id: string;
  agreement_type: AgreementType;
  version: string;
  effective_date: string;
}> {
  return current.map((a) => ({
    user_id: userId,
    agreement_type: a.type,
    version: a.version,
    effective_date: a.effectiveDate,
  }));
}
