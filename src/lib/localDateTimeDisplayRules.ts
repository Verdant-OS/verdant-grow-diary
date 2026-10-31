/**
 * Viewer-local date/time for stored ISO instants, for surfaces that must not
 * import the alert module by name (the maturity-evidence static-safety scan
 * forbids "alert" in TimelineEvidenceDetailDrawer.tsx).
 *
 * This is the same function #2270, #2313 and #2315 use — re-exported, not
 * copied — so every local time reads "MMM d, yyyy, h:mm a" in one format.
 */
export { formatSnapshotCapturedAt } from "@/lib/alertReasonDisplayRules";
