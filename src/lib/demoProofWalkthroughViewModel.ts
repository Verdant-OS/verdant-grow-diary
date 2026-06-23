/**
 * demoProofWalkthroughViewModel — pure, read-only walkthrough description
 * of the Verdant V0 One-Tent Loop RC1 proof path.
 *
 * Hard constraints:
 *  - Pure: no I/O, no React, no Supabase, no Edge/RPC/AI calls.
 *  - Read-only: lists existing routes/surfaces; does not fetch or write.
 *  - No raw payloads, private IDs, tokens, MACs, service role keys, or
 *    env secrets are referenced.
 *  - Demo / manual / live / stale / invalid data is never described as
 *    healthy or auto-actionable.
 *  - Operator Mode `?operator=1` is described as a URL surface gate,
 *    NOT a role or capability gate.
 */

export type DemoProofWalkthroughStatus =
  | "ready"
  | "operator_only"
  | "limited"
  | "unavailable";

export interface DemoProofWalkthroughStep {
  readonly id: string;
  readonly order: number;
  readonly label: string;
  readonly purpose: string;
  readonly expectedEvidence: string;
  readonly href: string;
  readonly safetyNote: string;
  readonly statusKind: DemoProofWalkthroughStatus;
}

export interface DemoProofWalkthroughViewModel {
  readonly title: string;
  readonly subtitle: string;
  readonly proofWindowLabel: string;
  readonly safetySummary: readonly string[];
  readonly steps: readonly DemoProofWalkthroughStep[];
  readonly whatThisProves: readonly string[];
  readonly whatThisDoesNotProve: readonly string[];
}

export const DEMO_PROOF_WALKTHROUGH_ROUTE =
  "/internal/demo-proof-walkthrough";

export const PROOF_WINDOW_LABEL = "current proof window (last 24 hours)";

const SAFETY_SUMMARY: readonly string[] = Object.freeze([
  "Read-only walkthrough.",
  "Verdant suggests; growers approve.",
  "No device control or automation is performed.",
  "Operator Mode uses ?operator=1 as a URL surface gate; data access is still enforced by RLS.",
  "Demo, manual, live, stale, and invalid data are clearly labeled. Missing or blocked proof is never treated as positive.",
]);

const STEPS: readonly DemoProofWalkthroughStep[] = Object.freeze([
  {
    id: "grow",
    order: 1,
    label: "Grow",
    purpose:
      "Start from the grow context so every event has a place in plant memory.",
    expectedEvidence:
      "Grow is selected; grow name and stage visible in app shell.",
    href: "/grows",
    safetyNote: "Read-only navigation. No writes.",
    statusKind: "ready",
  },
  {
    id: "tent",
    order: 2,
    label: "Tent",
    purpose: "Confirm tent context before reviewing readings.",
    expectedEvidence:
      "Tent detail shows tent name, current stage target, and assigned plants.",
    href: "/tents",
    safetyNote: "Read-only navigation. No device commands.",
    statusKind: "ready",
  },
  {
    id: "plant",
    order: 3,
    label: "Plant",
    purpose: "Review plant identity, timeline, and context readiness.",
    expectedEvidence:
      "Plant detail shows strain, stage, recent timeline entries, and context readiness flags.",
    href: "/plants",
    safetyNote: "Read-only navigation.",
    statusKind: "ready",
  },
  {
    id: "quick-log",
    order: 4,
    label: "Quick Log",
    purpose: "Capture action/evidence with source labels.",
    expectedEvidence:
      "Quick Log captures diary entry, optional photo, and sensor snapshot with source = manual or live; never relabels stale or invalid as live.",
    href: "/daily-check",
    safetyNote:
      "Snapshot provenance (source, captured_at) is preserved as-is. No fake live data.",
    statusKind: "ready",
  },
  {
    id: "timeline",
    order: 5,
    label: "Timeline",
    purpose: "Review what changed and what followed.",
    expectedEvidence:
      "Timeline shows category sections, evidence-quality indicators, readability summary, and print summary.",
    href: "/timeline",
    safetyNote: "Read-only view of recorded events.",
    statusKind: "ready",
  },
  {
    id: "sensor-snapshot",
    order: 6,
    label: "Sensor Snapshot",
    purpose:
      "Confirm the latest sensor snapshot with explicit source label.",
    expectedEvidence:
      "Latest snapshot shown with allowed source label (live | manual | csv | demo | stale | invalid) and captured_at.",
    href: "/sensors",
    safetyNote:
      "Stale or invalid telemetry is never displayed as healthy.",
    statusKind: "ready",
  },
  {
    id: "ecowitt-live-row-proof",
    order: 7,
    label: "EcoWitt row-level live proof (Operator Mode)",
    purpose:
      "Check EcoWitt row-level live/stale/invalid/limited/no-recent proof from already-loaded readings.",
    expectedEvidence:
      "Operator panel shows EcoWitt row-level proof status for the current tent within the current proof window.",
    href: "/sensors?operator=1",
    safetyNote:
      "Operator Mode uses ?operator=1 as a URL surface gate; RLS still enforces access.",
    statusKind: "operator_only",
  },
  {
    id: "ecowitt-ingest-audit-proof",
    order: 8,
    label: "EcoWitt ingest-audit proof (Operator Mode)",
    purpose:
      "Review accepted, rejected, and omitted ingest counts for the current tent within the current proof window.",
    expectedEvidence:
      "Operator panel shows received / inserted / rejected counts, last-accepted and last-rejected timestamps. Blocked or error states show calm copy and never imply healthy.",
    href: "/sensors?operator=1",
    safetyNote:
      "Narrow column allowlist; no raw payloads, owning auth ids, or bridge tokens rendered.",
    statusKind: "operator_only",
  },
  {
    id: "ai-doctor-readiness",
    order: 9,
    label: "AI Doctor readiness",
    purpose:
      "Review available and missing context before any AI interpretation.",
    expectedEvidence:
      "AI Doctor entry surface lists available context (stage, recent log, snapshot) and explicitly names missing context. No certain diagnoses from weak evidence.",
    href: "/doctor",
    safetyNote:
      "AI Doctor is advisory only. It does not write to Action Queue and does not control devices.",
    statusKind: "ready",
  },
  {
    id: "alerts",
    order: 10,
    label: "Alerts",
    purpose:
      "Confirm alerts reflect real target breaches against labeled telemetry.",
    expectedEvidence:
      "Open alerts show source-labeled evidence; stale or invalid telemetry never triggers a 'healthy' state.",
    href: "/alerts",
    safetyNote: "Alerts do not auto-create Action Queue items.",
    statusKind: "ready",
  },
  {
    id: "action-queue",
    order: 11,
    label: "Approval-required Action Queue",
    purpose:
      "Actions remain pending approval; Verdant does not execute device control.",
    expectedEvidence:
      "Action Queue items default to pending / approval-required; completion creates a follow-up diary entry visible on the timeline.",
    href: "/actions",
    safetyNote:
      "No automatic execution, no device-control payloads, no auto-creation from alerts or AI.",
    statusKind: "ready",
  },
  {
    id: "one-tent-live-proof",
    order: 12,
    label: "One-Tent Live Proof report",
    purpose:
      "View the read-only proof report tying the loop together with sanitized copy/print output.",
    expectedEvidence:
      "Checklist of six steps, sensor-proof section (live/audit), and copy/print markdown free of UUIDs, ISO-second timestamps, and private identifiers.",
    href: "/demo/one-tent-live-proof",
    safetyNote:
      "Report copy is sanitized; missing or blocked proof renders as 'Needs operator confirmation', never as healthy.",
    statusKind: "ready",
  },
]);

const WHAT_THIS_PROVES: readonly string[] = Object.freeze([
  "The One-Tent Loop renders end-to-end with source-labeled evidence.",
  "EcoWitt row-level and ingest-audit proof are visible in Operator Mode within the current proof window.",
  "Quick Log preserves snapshot source and captured_at without relabeling.",
  "Action Queue items remain approval-required and link to follow-up diary entries on the timeline.",
  "Copy/print proof report is sanitized: no UUIDs, second-precision timestamps, raw payloads, tokens, MACs, or env secrets.",
]);

const WHAT_THIS_DOES_NOT_PROVE: readonly string[] = Object.freeze([
  "It does not prove sensor data is correct for any specific equipment installation.",
  "It does not prove ingestion uptime outside the current proof window.",
  "It does not prove AI Doctor diagnoses; AI output remains advisory and must be confirmed by the grower.",
  "It does not authorize any automation or device control — none is performed by Verdant.",
  "It does not widen RLS or grant operator privileges; ?operator=1 is only a URL surface gate.",
]);

export function buildDemoProofWalkthroughViewModel(): DemoProofWalkthroughViewModel {
  return Object.freeze({
    title: "Verdant One-Tent Loop Proof Walkthrough",
    subtitle:
      "Read-only walkthrough of the V0 One-Tent Loop RC1 proof path.",
    proofWindowLabel: PROOF_WINDOW_LABEL,
    safetySummary: SAFETY_SUMMARY,
    steps: STEPS,
    whatThisProves: WHAT_THIS_PROVES,
    whatThisDoesNotProve: WHAT_THIS_DOES_NOT_PROVE,
  });
}
