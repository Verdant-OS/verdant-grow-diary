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
      const previous =
        matches
          .map((r) => r.version)
          .filter((v) => typeof v === "string" && v !== agreement.version)
          .sort()
          .pop() ?? null;
      return { agreement, previouslyAcceptedVersion: previous } satisfies AgreementGap;
    })
    .filter((g): g is AgreementGap => g !== null);
}

export interface OwnAcceptancePayload {
  agreement_type: AgreementType;
  version: string;
  effective_date: string;
  user_agent?: string | null;
}

/**
 * Payload for `record_own_agreement_acceptances` — no client `user_id`.
 * The RPC sets `user_id` from `auth.uid()` server-side.
 */
export function buildOwnAcceptancePayloads(
  current: readonly AgreementVersion[] = CURRENT_AGREEMENT_LIST,
  userAgent?: string | null,
): OwnAcceptancePayload[] {
  return current.map((a) => ({
    agreement_type: a.type,
    version: a.version,
    effective_date: a.effectiveDate,
    ...(userAgent !== undefined ? { user_agent: userAgent } : {}),
  }));
}

/**
 * @deprecated Prefer {@link buildOwnAcceptancePayloads} + the auth.uid() RPC.
 * Kept for fixtures that still shape legacy direct-table rows with user_id.
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
