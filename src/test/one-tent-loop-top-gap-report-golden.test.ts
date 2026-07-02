/**
 * Golden / exact-equality tests for the sanitized top-gap plain-text block.
 *
 * These tests lock the output of `buildOneTentLoopTopGapTextBlock` byte-for-byte
 * against the expected safe string. Any drift in the resolver's status copy,
 * downstream mapping, evidence-checklist wording, or safety-note templates
 * that would change what an operator sees in the copyable text report will
 * fail here.
 *
 * Coverage:
 *  - stale sensor snapshot
 *  - invalid sensor snapshot
 *  - demo-only sensor snapshot
 *  - missing grow (root-of-loop upstream)
 *  - action-queue safety-fence blocked
 *  - resolved / no-blocking-gap
 *
 * Intentionally not compared against text output (documented for future
 * readers):
 *  - `OneTentLoopGap.step_key`, `.status`, `.priority`, `.evidence_kind`,
 *    `.source_label`, `.blocked_downstream_steps`, and every checklist
 *    item's `state`, `label`, `source_label`, and `why_it_matters` ARE
 *    rendered and covered.
 *  - `OneTentLoopGap.is_real_data_gap` is rendered as "yes"/"no".
 *  - Checklist `provenance` and `kind` fields are NOT rendered in the text
 *    block (they are structured-only fields consumed by the UI). Coverage
 *    for provenance surface belongs in the presenter tests.
 *
 * Safety fences enforced per golden case:
 *  - No secret markers: raw_payload, service_role, bridge_token, api_key,
 *    access_token, JWT-looking prefixes (eyJ...).
 *  - No unqualified unsafe wording: healthy, verified, success, all good,
 *    no issues detected, confirmed safe, validated live.
 */
import { describe, expect, it } from "vitest";
import {
  buildOneTentLoopTopGapTextBlock,
  resolveTopOneTentLoopGap,
} from "@/lib/oneTentLoopGapResolver";
import type {
  LoopStepId,
  LoopStepRow,
  LoopStepStatus,
} from "@/lib/oneTentLoopProofRules";

const STEP_LABELS: ReadonlyArray<readonly [LoopStepId, string]> = [
  ["grow", "Grow"],
  ["tent", "Tent"],
  ["plant", "Plant"],
  ["quick-log", "Quick Log"],
  ["timeline", "Timeline"],
  ["sensor-snapshot", "Sensor Snapshot"],
  ["ai-doctor", "AI Doctor"],
  ["alert", "Alert"],
  ["action-queue", "Action Queue"],
  ["follow-up", "Follow-up"],
];

function mkRow(
  id: LoopStepId,
  label: string,
  status: LoopStepStatus,
  extra: Partial<LoopStepRow> = {},
): LoopStepRow {
  return {
    id,
    label,
    status,
    evidence: [],
    missing_info: [],
    safety_note: "",
    ...extra,
  };
}

function baseRows(): LoopStepRow[] {
  return STEP_LABELS.map(([id, label]) =>
    mkRow(id, label, "passed", { provenance: "direct" }),
  );
}

function withStep(
  patch: (row: LoopStepRow) => void,
  id: LoopStepId,
): LoopStepRow[] {
  const rows = baseRows();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`missing row ${id}`);
  patch(row);
  return rows;
}

const SECRET_MARKERS = [
  /raw_payload/i,
  /service_role/i,
  /bridge_token/i,
  /api_key/i,
  /access_token/i,
  /\beyJ[A-Za-z0-9_-]{6,}/,
];

// Words that must NEVER appear unqualified. The "not healthy" / "never healthy"
// honest negations are allowed and stripped before scanning.
const UNSAFE_WORDING = [
  /\bhealthy\b/i,
  /\bverified\b/i,
  /\bsuccess\b/i,
  /all good/i,
  /no issues detected/i,
  /confirmed safe/i,
  /validated live/i,
];

function assertNoSecrets(text: string) {
  for (const re of SECRET_MARKERS) {
    expect(re.test(text), `secret marker ${re} leaked into text`).toBe(false);
  }
}

function assertNoUnsafeWording(text: string) {
  let scrubbed = text;
  // Honest negations allowed.
  scrubbed = scrubbed
    .replace(/not healthy/gi, "")
    .replace(/never healthy/gi, "")
    .replace(/never shown as healthy/gi, "")
    .replace(/is never healthy/gi, "")
    .replace(/not verified/gi, "")
    .replace(/cannot be confirmed/gi, "");
  for (const re of UNSAFE_WORDING) {
    expect(re.test(scrubbed), `unsafe wording ${re} in text`).toBe(false);
  }
}

function goldenFor(rows: readonly LoopStepRow[]): string {
  const gap = resolveTopOneTentLoopGap(rows);
  return buildOneTentLoopTopGapTextBlock(gap);
}

/**
 * Assert the sanitized text preserves the exact line order produced by
 * `buildOneTentLoopTopGapTextBlock` for the resolved gap. Line prefixes
 * are the stable view-model contract: adding / removing / reordering
 * fields in the text builder will fail here.
 *
 * Fields intentionally not asserted (documented for future readers):
 *  - `OneTentLoopGapEvidenceChecklistItem.provenance` and `.kind` are
 *    NOT rendered in the text block. Structured-only fields consumed
 *    by the UI presenter.
 *  - `source_label` on the top-level gap is optional; the assertion
 *    only requires it when the resolved gap actually carries one.
 */
function assertTopGapTextLineOrderMatchesViewModel(
  rows: readonly LoopStepRow[],
  text: string,
): void {
  const gap = resolveTopOneTentLoopGap(rows);
  const lines = text.split("\n");
  const expectedPrefixes: string[] = [
    "Top real-data gap:",
    "- Step:",
    "- Title:",
    "- Status:",
    "- Priority:",
    "- Evidence kind:",
  ];
  if (gap.source_label) expectedPrefixes.push("- Source label:");
  expectedPrefixes.push(
    "- Why it matters:",
    "- Where to resolve:",
    "- Suggested next observation:",
    "- Safety note:",
    "- Real data gap:",
  );
  expectedPrefixes.push(
    gap.blocked_downstream_steps.length > 0
      ? "- Blocked / weakened downstream:"
      : "- Blocked / weakened downstream: none",
  );
  for (const step of gap.blocked_downstream_steps) {
    expectedPrefixes.push(`    - ${step}`);
  }
  expectedPrefixes.push(
    gap.evidence_checklist.length > 0
      ? "- Evidence checklist for this gap:"
      : "- Evidence checklist for this gap: none",
  );
  for (const item of gap.evidence_checklist) {
    expectedPrefixes.push(`    - ${item.label} [${item.state}]`);
  }

  expect(
    lines.length,
    `text has ${lines.length} lines, expected ${expectedPrefixes.length}\n${text}`,
  ).toBe(expectedPrefixes.length);
  for (let i = 0; i < expectedPrefixes.length; i += 1) {
    expect(
      lines[i].startsWith(expectedPrefixes[i]),
      `line ${i} mismatch: got "${lines[i]}", expected prefix "${expectedPrefixes[i]}"`,
    ).toBe(true);
  }
}

describe("buildOneTentLoopTopGapTextBlock — golden sanitized output", () => {
  it("stale sensor snapshot → exact expected text and safety fences", () => {
    const rows = withStep((r) => {
      r.status = "stale";
      r.source = "live";
      r.evidence_refs = [
        {
          label: "sensor",
          timestamp: "2026-06-01T00:00:00Z",
          source: "live",
          kind: "inferred",
        },
      ];
    }, "sensor-snapshot");
    const text = goldenFor(rows);

    const expected = [
      "Top real-data gap:",
      "- Step: sensor-snapshot",
      "- Title: Sensor Snapshot — stale reading",
      "- Status: stale",
      "- Priority: 5.75",
      "- Evidence kind: stale",
      "- Source label: live",
      "- Why it matters: The latest reading is too old to be trusted as current sensor truth for the loop.",
      "- Where to resolve: Open the Sensors page for this tent and confirm a fresh, source-labeled reading.",
      "- Suggested next observation: Look for a fresher reading with an explicit source label and captured_at timestamp.",
      "- Safety note: Read-only view. Stale telemetry must never be shown as current sensor truth.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - ai-doctor",
      "    - alert",
      "    - action-queue",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [present] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [present] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [present] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [present] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [present] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [stale] · source=live — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - AI Doctor [weak] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - Alert [weak] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - Action Queue [weak] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });

  it("invalid sensor snapshot → exact expected text and safety fences", () => {
    const rows = withStep((r) => {
      r.status = "invalid";
      r.source = "invalid";
    }, "sensor-snapshot");
    const text = goldenFor(rows);

    const expected = [
      "Top real-data gap:",
      "- Step: sensor-snapshot",
      "- Title: Sensor Snapshot — invalid telemetry",
      "- Status: invalid",
      "- Priority: 5.75",
      "- Evidence kind: invalid",
      "- Source label: invalid",
      "- Why it matters: The latest reading failed shape / range / source validation and cannot be treated as sensor truth.",
      "- Where to resolve: Open the Sensors page for this tent and confirm a fresh, source-labeled reading.",
      "- Suggested next observation: Look for a well-formed reading (known metric, known source, sensible range, parseable captured_at).",
      "- Safety note: Read-only view. Invalid telemetry is never healthy and never accurate.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - ai-doctor",
      "    - alert",
      "    - action-queue",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [present] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [present] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [present] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [present] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [present] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [invalid] · source=invalid — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - AI Doctor [blocked] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - Alert [blocked] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - Action Queue [blocked] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });

  it("demo-only sensor snapshot → exact expected text and safety fences", () => {
    const rows = withStep((r) => {
      r.status = "demo_only";
      r.source = "demo";
    }, "sensor-snapshot");
    const text = goldenFor(rows);

    const expected = [
      "Top real-data gap:",
      "- Step: sensor-snapshot",
      "- Title: Sensor Snapshot — demo data only",
      "- Status: demo_only",
      "- Priority: 5.9",
      "- Evidence kind: demo_only",
      "- Source label: demo",
      "- Why it matters: Only demo or seeded data is available. Demo data is not real proof of the loop.",
      "- Where to resolve: Open the Sensors page for this tent and confirm a fresh, source-labeled reading.",
      "- Suggested next observation: Look for a real, source-labeled record (live, manual, or csv) rather than demo/seeded data.",
      "- Safety note: Read-only view. Demo-only data is not proof of the real One-Tent Loop.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - ai-doctor",
      "    - alert",
      "    - action-queue",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [present] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [present] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [present] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [present] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [present] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [demo_only] · source=demo — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - AI Doctor [weak] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - Alert [weak] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - Action Queue [weak] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });

  it("missing grow → exact expected text and safety fences", () => {
    const rows = withStep((r) => {
      r.status = "missing";
    }, "grow");
    const text = goldenFor(rows);

    const expected = [
      "Top real-data gap:",
      "- Step: grow",
      "- Title: Grow — missing",
      "- Status: missing",
      "- Priority: 1",
      "- Evidence kind: missing",
      "- Why it matters: No supporting record was found, so the loop cannot be proven end-to-end from current app state.",
      "- Where to resolve: Open the Grows page and confirm an active grow exists for this scope.",
      "- Suggested next observation: Look for the next real record that would satisfy this step (with grow/tent/plant scope and a timestamp).",
      "- Safety note: Read-only view. Missing evidence is not proof of plant condition. Nothing will be created or automated by viewing this page.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - tent",
      "    - plant",
      "    - quick-log",
      "    - timeline",
      "    - sensor-snapshot",
      "    - ai-doctor",
      "    - alert",
      "    - action-queue",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [missing] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [blocked] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [blocked] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [blocked] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [blocked] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [blocked] — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - AI Doctor [blocked] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - Alert [blocked] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - Action Queue [blocked] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });

  it("action-queue safety fence blocked → exact expected text and safety fences", () => {
    const rows = withStep((r) => {
      r.status = "blocked";
    }, "action-queue");
    const text = goldenFor(rows);

    const expected = [
      "Top real-data gap:",
      "- Step: action-queue",
      "- Title: Action Queue — safety fence fired",
      "- Status: blocked",
      "- Priority: 8.5",
      "- Evidence kind: missing",
      "- Why it matters: An Action Queue item is not approval-required, or carries a device-command marker. Verdant treats this as a safety block, not proof.",
      "- Where to resolve: Open the Action Queue and confirm the item is approval-required with no device command.",
      "- Suggested next observation: Look for the same item with approval_required=true and no device_command marker.",
      "- Safety note: Read-only view. Do not bypass the safety fence. Verdant will not auto-execute device commands.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [present] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [present] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [present] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [present] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [present] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [present] — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - AI Doctor [present] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - Alert [present] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - Action Queue [blocked] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });

  // The `unknown` checklist state fires when a step in CHECKLIST_STEP_ORDER
  // has no corresponding LoopStepRow — i.e. the view model was unable to
  // evaluate that step at all. This is distinct from "missing evidence"
  // (rendered as [missing]) or "blocked by upstream" (rendered as
  // [blocked]). The label falls back to the raw step id when no row is
  // present; we assert that verbatim so the UI/text stay aligned with the
  // view model and the honest uncertainty is preserved.
  it("unknown checklist state (missing row) → exact expected text and safety fences", () => {
    // Omit the alert row entirely; keep the sensor-snapshot stale so a
    // real gap still resolves and the checklist renders. Alert must
    // surface as `[unknown]` because there is no row to evaluate it.
    const alertOmittedRows: LoopStepRow[] = STEP_LABELS.filter(
      ([id]) => id !== "alert",
    ).map(([id, label]) => mkRow(id, label, "passed", { provenance: "direct" }));
    const sensor = alertOmittedRows.find((r) => r.id === "sensor-snapshot");
    if (!sensor) throw new Error("missing sensor row");
    sensor.status = "stale";
    sensor.source = "live";
    const text = goldenFor(alertOmittedRows);

    const expected = [
      "Top real-data gap:",
      "- Step: sensor-snapshot",
      "- Title: Sensor Snapshot — stale reading",
      "- Status: stale",
      "- Priority: 5.75",
      "- Evidence kind: stale",
      "- Source label: live",
      "- Why it matters: The latest reading is too old to be trusted as current sensor truth for the loop.",
      "- Where to resolve: Open the Sensors page for this tent and confirm a fresh, source-labeled reading.",
      "- Suggested next observation: Look for a fresher reading with an explicit source label and captured_at timestamp.",
      "- Safety note: Read-only view. Stale telemetry must never be shown as current sensor truth.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - ai-doctor",
      "    - alert",
      "    - action-queue",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [present] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [present] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [present] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [present] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [present] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [stale] · source=live — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - AI Doctor [weak] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - alert [unknown] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - Action Queue [weak] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    // Explicit unknown-state fences: the honest bracketed state must be
    // preserved and must never be silently rewritten to a present/healthy
    // label. The label falls back to the raw step id when the row is
    // absent — assert that too so any drift is caught.
    expect(text).toContain("[unknown]");
    expect(text).not.toMatch(/alert \[present\]/i);
    assertTopGapTextLineOrderMatchesViewModel(alertOmittedRows, text);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });

  // Additional unknown/equivalent coverage on non-alert rows. Each case
  // asserts (a) exact sanitized output, (b) the unknown row's honest
  // `[unknown]` bracketed state with raw-step-id fallback label, (c) no
  // Present / success wording, (d) view-model line ordering, and (e) no
  // secret markers.
  it("unknown checklist state — ai-doctor row omitted → exact expected text and fences", () => {
    const rows: LoopStepRow[] = STEP_LABELS.filter(
      ([id]) => id !== "ai-doctor",
    ).map(([id, label]) => mkRow(id, label, "passed", { provenance: "direct" }));
    const sensor = rows.find((r) => r.id === "sensor-snapshot");
    if (!sensor) throw new Error("missing sensor row");
    sensor.status = "stale";
    sensor.source = "live";
    const text = goldenFor(rows);

    const expected = [
      "Top real-data gap:",
      "- Step: sensor-snapshot",
      "- Title: Sensor Snapshot — stale reading",
      "- Status: stale",
      "- Priority: 5.75",
      "- Evidence kind: stale",
      "- Source label: live",
      "- Why it matters: The latest reading is too old to be trusted as current sensor truth for the loop.",
      "- Where to resolve: Open the Sensors page for this tent and confirm a fresh, source-labeled reading.",
      "- Suggested next observation: Look for a fresher reading with an explicit source label and captured_at timestamp.",
      "- Safety note: Read-only view. Stale telemetry must never be shown as current sensor truth.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - ai-doctor",
      "    - alert",
      "    - action-queue",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [present] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [present] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [present] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [present] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [present] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [stale] · source=live — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - ai-doctor [unknown] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - Alert [weak] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - Action Queue [weak] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    expect(text).toContain("ai-doctor [unknown]");
    expect(text).not.toMatch(/ai-doctor \[present\]/i);
    assertTopGapTextLineOrderMatchesViewModel(rows, text);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });

  it("unknown checklist state — action-queue row omitted → exact expected text and fences", () => {
    const rows: LoopStepRow[] = STEP_LABELS.filter(
      ([id]) => id !== "action-queue",
    ).map(([id, label]) => mkRow(id, label, "passed", { provenance: "direct" }));
    const sensor = rows.find((r) => r.id === "sensor-snapshot");
    if (!sensor) throw new Error("missing sensor row");
    sensor.status = "stale";
    sensor.source = "live";
    const text = goldenFor(rows);

    const expected = [
      "Top real-data gap:",
      "- Step: sensor-snapshot",
      "- Title: Sensor Snapshot — stale reading",
      "- Status: stale",
      "- Priority: 5.75",
      "- Evidence kind: stale",
      "- Source label: live",
      "- Why it matters: The latest reading is too old to be trusted as current sensor truth for the loop.",
      "- Where to resolve: Open the Sensors page for this tent and confirm a fresh, source-labeled reading.",
      "- Suggested next observation: Look for a fresher reading with an explicit source label and captured_at timestamp.",
      "- Safety note: Read-only view. Stale telemetry must never be shown as current sensor truth.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - ai-doctor",
      "    - alert",
      "    - action-queue",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [present] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [present] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [present] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [present] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [present] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [stale] · source=live — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - AI Doctor [weak] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - Alert [weak] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - action-queue [unknown] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    expect(text).toContain("action-queue [unknown]");
    expect(text).not.toMatch(/action-queue \[present\]/i);
    assertTopGapTextLineOrderMatchesViewModel(rows, text);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });


  it("resolved / no-blocking-gap → exact expected text and safety fences", () => {
    const text = goldenFor(baseRows());

    const expected = [
      "Top real-data gap:",
      "- Step: none",
      "- Title: No blocking real-data gap found",
      "- Status: resolved",
      "- Priority: n/a",
      "- Evidence kind: resolved",
      "- Why it matters: Every loop step has direct evidence in the current app state. Continue observing the loop.",
      "- Where to resolve: No blocking gap. Continue observing the loop as normal.",
      "- Suggested next observation: Watch for the next Quick Log, sensor snapshot, alert, and follow-up as the loop continues.",
      "- Safety note: Read-only view. This is a snapshot of current evidence, not a certainty claim about plant health.",
      "- Real data gap: no",
      "- Blocked / weakened downstream: none",
      "- Evidence checklist for this gap: none",
    ].join("\n");

    expect(text).toBe(expected);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });
});
