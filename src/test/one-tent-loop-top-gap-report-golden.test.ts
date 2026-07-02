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
  OneTentLoopGap,
  OneTentLoopGapEvidenceChecklistItem,
} from "@/lib/oneTentLoopGapResolver";
import type { LoopStepId, LoopStepRow, LoopStepStatus } from "@/lib/oneTentLoopProofRules";

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
  return STEP_LABELS.map(([id, label]) => mkRow(id, label, "passed", { provenance: "direct" }));
}

function withStep(patch: (row: LoopStepRow) => void, id: LoopStepId): LoopStepRow[] {
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

/**
 * Rebuild the exact text line a checklist item MUST serialize to, straight from
 * the resolved view-model object's fields. Mirrors `buildOneTentLoopTopGapTextBlock`
 * line-for-line so a drift in either the object → text serialization OR the
 * ordering fails loudly.
 */
function reconstructChecklistLine(item: OneTentLoopGapEvidenceChecklistItem): string {
  const src = item.source_label ? ` · source=${item.source_label}` : "";
  return `    - ${item.label} [${item.state}]${src} — ${item.why_it_matters}`;
}

/**
 * assertTopGapReportOrderMatchesViewModel — parse the top-gap block out of a
 * (possibly larger) report text and assert, against the resolved
 * `OneTentLoopGap` object (the single source of truth the presenter also
 * renders):
 *   - `blocked_downstream_steps` ordering exactly matches the report ordering,
 *   - `evidence_checklist` ordering exactly matches the report ordering,
 *   - every checklist item's kind/label/state/why_it_matters (+ source_label
 *     when present) appears verbatim on its line,
 *   - no checklist item is silently omitted and no extra item appears.
 *
 * Lines are reconstructed from object fields and compared (rather than
 * regex-parsed out of the text) because labels and `why_it_matters` themselves
 * contain " — " and the source segment is " · source=…"; splitting would be
 * fragile. This proves serialization fidelity + order + completeness. It works
 * on the standalone top-gap block AND on the block embedded inside the full
 * live-proof report, since it locates the block by its stable headers.
 */
function assertTopGapReportOrderMatchesViewModel(topGap: OneTentLoopGap, reportText: string): void {
  const lines = reportText.split("\n");

  // --- Blocked / weakened downstream block ---
  if (topGap.blocked_downstream_steps.length === 0) {
    expect(
      lines.includes("- Blocked / weakened downstream: none"),
      "expected empty downstream to render as ': none'",
    ).toBe(true);
  } else {
    const di = lines.indexOf("- Blocked / weakened downstream:");
    expect(di, "downstream header not found in report").toBeGreaterThanOrEqual(0);
    const actual: string[] = [];
    for (let i = di + 1; i < lines.length && lines[i].startsWith("    - "); i += 1) {
      actual.push(lines[i]);
    }
    const expected = topGap.blocked_downstream_steps.map((s) => `    - ${s}`);
    expect(
      actual,
      `downstream order/content drift.\nexpected:\n${expected.join("\n")}\nactual:\n${actual.join("\n")}`,
    ).toEqual(expected);
  }

  // --- Evidence checklist block ---
  if (topGap.evidence_checklist.length === 0) {
    expect(
      lines.includes("- Evidence checklist for this gap: none"),
      "expected empty checklist to render as ': none'",
    ).toBe(true);
    return;
  }
  const ci = lines.indexOf("- Evidence checklist for this gap:");
  expect(ci, "checklist header not found in report").toBeGreaterThanOrEqual(0);
  const actualChecklist: string[] = [];
  for (let i = ci + 1; i < lines.length && lines[i].startsWith("    - "); i += 1) {
    actualChecklist.push(lines[i]);
  }
  const expectedChecklist = topGap.evidence_checklist.map(reconstructChecklistLine);

  // Completeness: no item omitted, no extra item appended.
  expect(
    actualChecklist.length,
    `checklist item count drift: report ${actualChecklist.length} vs view-model ${expectedChecklist.length}`,
  ).toBe(expectedChecklist.length);

  // Order + exact field text, item by item.
  for (let i = 0; i < expectedChecklist.length; i += 1) {
    expect(
      actualChecklist[i],
      `checklist line ${i} drift.\nexpected: ${expectedChecklist[i]}\nactual:   ${actualChecklist[i]}`,
    ).toBe(expectedChecklist[i]);
    const item = topGap.evidence_checklist[i];
    const line = actualChecklist[i];
    expect(item.kind, `item ${i} kind`).toBe("loop-step");
    expect(line, `item ${i} label`).toContain(item.label);
    expect(line, `item ${i} state`).toContain(`[${item.state}]`);
    expect(line, `item ${i} why_it_matters`).toContain(item.why_it_matters);
    if (item.source_label) {
      expect(line, `item ${i} source_label`).toContain(` · source=${item.source_label}`);
    }
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
    const alertOmittedRows: LoopStepRow[] = STEP_LABELS.filter(([id]) => id !== "alert").map(
      ([id, label]) => mkRow(id, label, "passed", { provenance: "direct" }),
    );
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
    const rows: LoopStepRow[] = STEP_LABELS.filter(([id]) => id !== "ai-doctor").map(
      ([id, label]) => mkRow(id, label, "passed", { provenance: "direct" }),
    );
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
    const rows: LoopStepRow[] = STEP_LABELS.filter(([id]) => id !== "action-queue").map(
      ([id, label]) => mkRow(id, label, "passed", { provenance: "direct" }),
    );
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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("buildOneTentLoopTopGapTextBlock — [blocked]-state golden cases (missing upstream)", () => {
  // NOTE: distinct from the "unknown (…row omitted)" goldens above. Here the
  // upstream row is PRESENT with status `missing`, so it renders with its
  // proper label (e.g. "Quick Log [missing]") and its own real downstream set
  // hard-blocks to `[blocked]` — a different resolver path than an absent row
  // rendering `[unknown]` with a raw-id fallback label.

  it("missing Quick Log → blocks Timeline + AI Doctor (parallel branches stay present)", () => {
    const rows = withStep((r) => {
      r.status = "missing";
    }, "quick-log");
    const gap = resolveTopOneTentLoopGap(rows);
    const text = buildOneTentLoopTopGapTextBlock(gap);

    const expected = [
      "Top real-data gap:",
      "- Step: quick-log",
      "- Title: Quick Log — missing",
      "- Status: missing",
      "- Priority: 4",
      "- Evidence kind: missing",
      "- Why it matters: No supporting record was found, so the loop cannot be proven end-to-end from current app state.",
      "- Where to resolve: Open Daily Check / Quick Log for this plant and confirm a recent entry.",
      "- Suggested next observation: Look for the next real record that would satisfy this step (with grow/tent/plant scope and a timestamp).",
      "- Safety note: Read-only view. Missing evidence is not proof of plant condition. Nothing will be created or automated by viewing this page.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - timeline",
      "    - ai-doctor",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [present] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [present] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [present] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [missing] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [blocked] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [present] — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - AI Doctor [blocked] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - Alert [present] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - Action Queue [present] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    // [blocked] appears on exactly the downstream rows of quick-log.
    expect(text).toContain("Timeline [blocked]");
    expect(text).toContain("AI Doctor [blocked]");
    expect(gap.blocked_downstream_steps).toEqual(["timeline", "ai-doctor", "follow-up"]);
    // Parallel branches (sensor/alert/action-queue) are NOT downstream of
    // quick-log in the loop model, so they must stay present — never falsely
    // blocked. This guards against over-broad downstream mapping.
    expect(text).toContain("Sensor Snapshot [present]");
    expect(text).toContain("Alert [present]");
    expect(text).toContain("Action Queue [present]");
    assertTopGapReportOrderMatchesViewModel(gap, text);
    assertTopGapTextLineOrderMatchesViewModel(rows, text);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });

  it("missing AI Doctor → blocks Alert + Action Queue recommendation quality", () => {
    const rows = withStep((r) => {
      r.status = "missing";
    }, "ai-doctor");
    const gap = resolveTopOneTentLoopGap(rows);
    const text = buildOneTentLoopTopGapTextBlock(gap);

    const expected = [
      "Top real-data gap:",
      "- Step: ai-doctor",
      "- Title: AI Doctor — missing",
      "- Status: missing",
      "- Priority: 7",
      "- Evidence kind: missing",
      "- Why it matters: No supporting record was found, so the loop cannot be proven end-to-end from current app state.",
      "- Where to resolve: Open the AI Doctor page for this plant and confirm the latest session context.",
      "- Suggested next observation: Look for the next real record that would satisfy this step (with grow/tent/plant scope and a timestamp).",
      "- Safety note: Read-only view. Missing evidence is not proof of plant condition. Nothing will be created or automated by viewing this page.",
      "- Real data gap: yes",
      "- Blocked / weakened downstream:",
      "    - alert",
      "    - action-queue",
      "    - follow-up",
      "- Evidence checklist for this gap:",
      "    - Grow [present] — The grow anchors every downstream loop step. Without it, no scope exists.",
      "    - Tent [present] — The tent scopes environment targets and sensor snapshots for this grow.",
      "    - Plant [present] — The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
      "    - Quick Log [present] — Quick Log is plant memory; the loop cannot be proven without recent entries.",
      "    - Timeline [present] — Timeline linkage confirms Quick Log became persistent plant memory.",
      "    - Sensor Snapshot [present] — Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
      "    - AI Doctor [missing] — AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
      "    - Alert [blocked] — Alerts turn sensor truth into a persisted, reviewable signal.",
      "    - Action Queue [blocked] — Action Queue items must stay approval-required. No device command.",
    ].join("\n");

    expect(text).toBe(expected);
    expect(text).toContain("Alert [blocked]");
    expect(text).toContain("Action Queue [blocked]");
    expect(gap.blocked_downstream_steps).toEqual(["alert", "action-queue", "follow-up"]);
    // Distinct from the row-omitted [unknown] golden: the present-but-missing
    // AI Doctor row keeps its proper label, never the raw "ai-doctor" id.
    expect(text).toContain("AI Doctor [missing]");
    expect(text).not.toContain("ai-doctor [unknown]");
    assertTopGapReportOrderMatchesViewModel(gap, text);
    assertTopGapTextLineOrderMatchesViewModel(rows, text);
    assertNoSecrets(text);
    assertNoUnsafeWording(text);
  });
});

describe("top-gap report ↔ resolved-gap parity across states (order + completeness)", () => {
  function omitRow(id: LoopStepId, mutate?: (rows: LoopStepRow[]) => void): LoopStepRow[] {
    const rows = STEP_LABELS.filter(([sid]) => sid !== id).map(([sid, label]) =>
      mkRow(sid, label, "passed", { provenance: "direct" }),
    );
    mutate?.(rows);
    return rows;
  }

  type Scenario = { name: string; rows: LoopStepRow[] };

  const SCENARIOS: Scenario[] = [
    {
      name: "missing (grow, root upstream)",
      rows: withStep((r) => {
        r.status = "missing";
      }, "grow"),
    },
    {
      name: "missing sensor snapshot (missing-equivalent)",
      rows: withStep((r) => {
        r.status = "missing";
      }, "sensor-snapshot"),
    },
    {
      name: "stale sensor telemetry",
      rows: withStep((r) => {
        r.status = "stale";
        r.source = "live";
      }, "sensor-snapshot"),
    },
    {
      name: "invalid sensor telemetry (unknown/malformed-equivalent)",
      rows: withStep((r) => {
        r.status = "invalid";
        r.source = "invalid";
      }, "sensor-snapshot"),
    },
    {
      name: "demo-only sensor telemetry",
      rows: withStep((r) => {
        r.status = "demo_only";
        r.source = "demo";
      }, "sensor-snapshot"),
    },
    {
      name: "weak (needs_review) sensor telemetry",
      rows: withStep((r) => {
        r.status = "needs_review";
        r.source = "manual";
      }, "sensor-snapshot"),
    },
    {
      name: "blocked action-queue safety fence",
      rows: withStep((r) => {
        r.status = "blocked";
      }, "action-queue"),
    },
    {
      name: "unknown (alert row absent) under stale telemetry",
      rows: omitRow("alert", (rows) => {
        const s = rows.find((r) => r.id === "sensor-snapshot");
        if (!s) throw new Error("missing sensor row");
        s.status = "stale";
        s.source = "live";
      }),
    },
    {
      name: "missing quick-log",
      rows: withStep((r) => {
        r.status = "missing";
      }, "quick-log"),
    },
    {
      name: "missing ai-doctor",
      rows: withStep((r) => {
        r.status = "missing";
      }, "ai-doctor"),
    },
  ];

  for (const sc of SCENARIOS) {
    it(`${sc.name} — report block matches the resolved gap object`, () => {
      const gap = resolveTopOneTentLoopGap(sc.rows);
      const text = buildOneTentLoopTopGapTextBlock(gap);

      // Downstream + checklist order + exact per-field text vs the object.
      assertTopGapReportOrderMatchesViewModel(gap, text);
      // The independent row-prefix contract must also still hold.
      assertTopGapTextLineOrderMatchesViewModel(sc.rows, text);

      // Core requirement: a telemetry-weakened / unknown gap must never leave
      // a dependent downstream checklist item at `present`.
      const downstream = new Set<LoopStepId>(gap.blocked_downstream_steps);
      for (const item of gap.evidence_checklist) {
        if (downstream.has(item.step_key)) {
          expect(
            item.state,
            `${sc.name}: downstream ${item.step_key} must not be present`,
          ).not.toBe("present");
          expect(text, `${sc.name}: downstream ${item.step_key} rendered as [present]`).not.toMatch(
            new RegExp(`- ${escapeRe(item.label)} \\[present\\]`),
          );
        }
      }

      // No checklist item silently dropped or added vs the object.
      const reportChecklistCount = text
        .split("\n")
        .filter((l) => /^ {4}- .+ \[[a-z_]+\]/.test(l)).length;
      expect(reportChecklistCount).toBe(gap.evidence_checklist.length);

      // Sanitization + honest-wording fences on every generated block.
      assertNoSecrets(text);
      assertNoUnsafeWording(text);
    });
  }

  it("determinism: identical rows produce byte-identical report blocks", () => {
    const rows = withStep((r) => {
      r.status = "invalid";
      r.source = "invalid";
    }, "sensor-snapshot");
    const a = buildOneTentLoopTopGapTextBlock(resolveTopOneTentLoopGap(rows));
    const b = buildOneTentLoopTopGapTextBlock(resolveTopOneTentLoopGap(rows));
    expect(a).toBe(b);
  });
});
