/**
 * Action Queue evidence provenance leakage guard.
 *
 * Focused fast PR gate that complements the Action Detail leakage guard.
 * Covers the Action Queue ROW evidence/provenance surface:
 *
 *   1. View-model behavior: buildActionEvidenceViewModel must never echo
 *      raw_payload / service_role / Bearer tokens / private keys / device-
 *      control language back through any rendered string field, even when
 *      a noisy/malicious input is passed in.
 *   2. View-model still surfaces the calm, centralized review-only labels
 *      and the neutral "evidence quality unavailable" copy when no
 *      sanitized snapshot is attached.
 *   3. Static safety scan of `src/pages/ActionQueue.tsx`: the row
 *      evidence badge JSX must only reference sanitized vm.* fields and
 *      must not reference raw_payload / service_role / token / private
 *      keys / device-control verbs. Approve/Reject/Simulate controls
 *      remain wired to the existing handlers (review-only posture).
 *
 * No production code is exercised beyond the pure view-model. No
 * Supabase, alerts, Action Queue writes, AI, automation, or device
 * control is touched.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildActionEvidenceViewModel,
  ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL,
  ACTION_EVIDENCE_QUALITY_UNAVAILABLE_SUMMARY,
  ACTION_EVIDENCE_REVIEW_ONLY_LABEL,
  ACTION_EVIDENCE_NO_AUTOMATION_NOTE,
  ACTION_EVIDENCE_STATUS_UNAVAILABLE_LABEL,
  ACTION_EVIDENCE_STATUS_UNAVAILABLE_HELP,
  ACTION_EVIDENCE_STATUS_MISSING_LABEL,
} from "@/lib/actionQueueEvidenceViewModel";

const UNSAFE_TOKENS = [
  "raw_payload",
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRIVATE_API_KEY",
  "Bearer eyJ",
  "sk_live_",
  "mqtt://",
  "pump.on",
  "dose(",
  "turn on equipment",
  "send command",
  "control device",
] as const;

const DEVICE_VERBS = [
  /\bautopilot\b/i,
  /\bauto[-_ ]?execute\b/i,
  /\bauto[-_ ]?run\b/i,
  /\brelay\.(on|off|toggle)\b/i,
  /\bactuator\.(send|trigger|run|fire)\b/i,
  /automatically (turn|run|trigger|dose|adjust)/i,
];

// Cast through unknown so we can deliberately seed non-schema extras the
// presenter must ignore.
const NOISY_INPUT = {
  source: "environment_alert",
  action_type: "lower_humidity",
  alert_type: "humidity_high",
  captured_at: "2026-05-29T10:00:00Z",
  // Malicious noise — none of this is part of ActionEvidenceInput.
  raw_payload: { secret: "PRIVATE_API_KEY=sk_live_51AbCdEfGhIjKlMnOpQrStUv" },
  service_role_key: "service_role:Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
  bridge_token: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
  device_command:
    "turn on equipment; pump.on; dose(5ml); mqtt://broker.example.com:1883",
} as unknown as Parameters<typeof buildActionEvidenceViewModel>[0];

function vmRenderedStrings(
  vm: ReturnType<typeof buildActionEvidenceViewModel>,
): string {
  return [
    vm.originLabel,
    vm.sourceLabel,
    vm.capturedAtLabel,
    vm.evidenceQualityLabel,
    vm.evidenceQualitySummary,
    vm.reviewOnlyLabel,
    vm.rowEvidenceStatusLabel,
    vm.rowEvidenceStatusHelp,
    ...vm.safetyNotes,
  ].join(" || ");
}

describe("Action Queue evidence view-model — leakage guards", () => {
  it("never echoes raw_payload / service_role / tokens / device-control strings", () => {
    const vm = buildActionEvidenceViewModel(NOISY_INPUT);
    const blob = vmRenderedStrings(vm);
    for (const tok of UNSAFE_TOKENS) {
      expect(blob, `unsafe token leaked: ${tok}`).not.toContain(tok);
    }
    for (const re of DEVICE_VERBS) {
      expect(blob, `device-control verb leaked: ${re}`).not.toMatch(re);
    }
  });

  it("returns calm review-only + unavailable copy when no sanitized snapshot is attached", () => {
    const vm = buildActionEvidenceViewModel(NOISY_INPUT);
    expect(vm.hasSnapshotQuality).toBe(false);
    expect(vm.snapshotQuality).toBeNull();
    expect(vm.evidenceQualityLabel).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL);
    expect(vm.evidenceQualitySummary).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_SUMMARY);
    expect(vm.reviewOnlyLabel).toBe(ACTION_EVIDENCE_REVIEW_ONLY_LABEL);
    expect(vm.safetyNotes).toContain(ACTION_EVIDENCE_NO_AUTOMATION_NOTE);
    expect(vm.rowEvidenceStatus).toBe("quality_unavailable");
    expect(vm.rowEvidenceStatusLabel).toBe(ACTION_EVIDENCE_STATUS_UNAVAILABLE_LABEL);
    expect(vm.rowEvidenceStatusHelp).toBe(ACTION_EVIDENCE_STATUS_UNAVAILABLE_HELP);
  });

  it("collapses bare / unknown input to the calm missing-evidence row status", () => {
    const vm = buildActionEvidenceViewModel(
      {} as Parameters<typeof buildActionEvidenceViewModel>[0],
    );
    expect(vm.rowEvidenceStatus).toBe("missing");
    expect(vm.rowEvidenceStatusLabel).toBe(ACTION_EVIDENCE_STATUS_MISSING_LABEL);
    const blob = vmRenderedStrings(vm);
    for (const tok of UNSAFE_TOKENS) {
      expect(blob).not.toContain(tok);
    }
  });

  it("is null-safe and never leaks unsafe strings for null / undefined inputs", () => {
    for (const input of [null, undefined]) {
      const vm = buildActionEvidenceViewModel(input);
      const blob = vmRenderedStrings(vm);
      for (const tok of UNSAFE_TOKENS) {
        expect(blob).not.toContain(tok);
      }
      expect(vm.evidenceQualityLabel).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL);
    }
  });
});

// --- Static safety scan of the Action Queue row evidence surface -----------

const ACTION_QUEUE_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"),
  "utf8",
);

describe("ActionQueue.tsx — row evidence/provenance static leakage scan", () => {
  it("source does not reference raw_payload / service_role / private tokens", () => {
    expect(ACTION_QUEUE_SRC).not.toMatch(/raw_payload/i);
    expect(ACTION_QUEUE_SRC).not.toMatch(/service_role/i);
    expect(ACTION_QUEUE_SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(ACTION_QUEUE_SRC).not.toMatch(/PRIVATE_API_KEY/);
    expect(ACTION_QUEUE_SRC).not.toMatch(/Bearer\s+ey/);
    expect(ACTION_QUEUE_SRC).not.toMatch(/sk_live_/);
  });

  it("source contains no device-control / automation verbs", () => {
    for (const re of DEVICE_VERBS) {
      expect(ACTION_QUEUE_SRC, `forbidden verb ${re}`).not.toMatch(re);
    }
    expect(ACTION_QUEUE_SRC).not.toMatch(/mqtt:\/\//i);
    expect(ACTION_QUEUE_SRC).not.toMatch(/\bpump\.on\b/);
    expect(ACTION_QUEUE_SRC).not.toMatch(/\bdose\(/);
  });

  it("EvidenceStatusBadge only renders sanitized vm.* fields", () => {
    const start = ACTION_QUEUE_SRC.indexOf("function EvidenceStatusBadge(");
    expect(start).toBeGreaterThan(-1);
    const end = ACTION_QUEUE_SRC.indexOf("\n}\n", start);
    const block = ACTION_QUEUE_SRC.slice(start, end);

    // Whitelist: only vm.rowEvidenceStatus* fields are read.
    expect(block).toContain("vm.rowEvidenceStatus");
    expect(block).toContain("vm.rowEvidenceStatusLabel");
    expect(block).toContain("vm.rowEvidenceStatusHelp");
    expect(block).toContain("vm.rowEvidenceStatusTone");

    // Forbid any direct row/payload reads inside the badge.
    expect(block).not.toMatch(/\brow\./);
    expect(block).not.toMatch(/raw_payload|service_role|target_device/i);
  });

  it("uses the centralized evidence view-model builder, not ad-hoc string assembly", () => {
    expect(ACTION_QUEUE_SRC).toContain("buildActionEvidenceViewModel");
    // Both pending and reviewed row blocks call the builder.
    const calls = ACTION_QUEUE_SRC.match(/buildActionEvidenceViewModel\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("approval / rejection / simulate controls remain wired (review-only posture)", () => {
    expect(ACTION_QUEUE_SRC).toMatch(/onClick=\{\(\) => approve\(row\)\}/);
    expect(ACTION_QUEUE_SRC).toMatch(/onClick=\{\(\) => reject\(row\)\}/);
    expect(ACTION_QUEUE_SRC).toMatch(/onClick=\{\(\) => simulate\(row\)\}/);
  });
});
