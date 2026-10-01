/**
 * Strain Reference Library V1.1 — reference-source notices.
 *
 * Shown only once database reads are enabled; while the release flag is off the
 * public pages carry no visible change. Every notice keeps the sample-reference
 * framing: the transport never upgrades the evidence state.
 */
import type { CultivarReferenceSourceReason } from "@/lib/cultivarReferenceSourceRules";

export const CULTIVAR_REFERENCE_SOURCE_COPY = {
  database: "Reference source: Verdant reference database. Profiles remain sample reference data.",
  database_pending:
    "Reference source: bundled sample reference library while the reference database loads.",
  database_error:
    "Reference database unavailable — showing the bundled sample reference library instead.",
  database_invalid:
    "Reference database returned incomplete records — showing the bundled sample reference library instead.",
  database_incomplete:
    "Reference database is missing approved profiles — showing the bundled sample reference library instead.",
  database_unapproved:
    "Reference database lists profiles outside the approved set — showing the bundled sample reference library instead.",
  database_empty:
    "Reference database returned no published profiles — showing the bundled sample reference library instead.",
} as const satisfies Record<
  Exclude<CultivarReferenceSourceReason, "flag_disabled"> | "database",
  string
>;

/** Visible notice for a resolution, or null while the release flag is off. */
export function cultivarReferenceSourceNotice(
  reason: CultivarReferenceSourceReason | null,
): string | null {
  if (reason === "flag_disabled") return null;
  return reason === null
    ? CULTIVAR_REFERENCE_SOURCE_COPY.database
    : CULTIVAR_REFERENCE_SOURCE_COPY[reason];
}
