/**
 * Community V1 contracts (docs: community-v1-design.md, plan Task 1).
 *
 * Pure types only. Reader-facing shapes carry opaque handles and display-safe
 * fields; they never carry auth IDs, source IDs, storage paths or the
 * owner-preview source/media binding.
 */

export type CommunityErrorCode =
  "unavailable" | "invalid" | "conflict" | "stale_preview" | "rate_limited" | "failed";

export type CommunityResult<T> = { ok: true; value: T } | { ok: false; code: CommunityErrorCode };

/** Opaque community viewer key plus a request generation; never an email or display name. */
export interface CommunitySession {
  viewerKey: string;
  generation: number;
}

export interface CommunityProfileDraft {
  username: string;
  displayName: string;
  bio: string;
}

/** Canonical sensor source labels; vendor or transport details are not provenance. */
export type SharedMeasurementProvenance = "live" | "manual" | "csv" | "demo" | "stale" | "invalid";

export interface SharedMeasurement {
  name: string;
  value: number;
  unit: string;
  provenance: SharedMeasurementProvenance;
}

/** One owner-selected diary entry revision, as the owner shapes it for sharing. */
export interface PublicationDraft {
  sourceEntryHandle: string;
  sourceRevision: string;
  sourceJournalLabel: string;
  occurredAt: string;
  action: string;
  note: string;
  stage: string | null;
  measurements: readonly SharedMeasurement[];
  mediaRevisionHandle: string | null;
}

/** Reader-facing publication: display-safe fields plus opaque handles only. */
export interface SharedPublication {
  publicationHandle: string;
  revision: number;
  publishedAt: string;
  sourceJournalLabel: string;
  occurredAt: string;
  action: string;
  note: string;
  stage: string | null;
  measurements: readonly SharedMeasurement[];
  derivativeHandle: string | null;
}

export interface CommunityProfileCard {
  communityId: string;
  username: string;
  displayName: string;
  bio: string;
}

/**
 * Owner-only exact preview. `sourceMediaBindingHash` is an opaque canonical
 * binding of the selected source revisions and derivative hashes, distinct from
 * the display payload. It must never appear on `SharedPublication`.
 */
export interface PublicationPreview {
  previewToken: string;
  expiresAt: string;
  collectionRevision: number;
  accessVersion: number;
  payloadHash: string;
  sourceMediaBindingHash: string;
  entries: readonly SharedPublication[];
  audience: readonly CommunityProfileCard[];
}

export type AccessState = "absent" | "pending" | "approved" | "declined" | "revoked" | "left";

/** Read-authority facts. Following is deliberately absent: it never grants access. */
export interface AccessFacts {
  isOwner: boolean;
  state: AccessState;
  blocked: boolean;
  activeAccount: boolean;
  activeProfile: boolean;
  ownerActive: boolean;
  collectionActive: boolean;
  publicationActive: boolean;
  sourceValid: boolean;
}

/** Navigation cursor only; it is not a seen watermark. */
export type DigestCursor = { publishedAt: string; publicationHandle: string } | null;

export interface DigestItem {
  ownerUsername: string;
  ownerDisplayName: string;
  collectionTitle: string;
  sourceJournalLabel: string;
  publication: SharedPublication;
}
