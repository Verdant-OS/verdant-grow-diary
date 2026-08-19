#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";

const PREFIX = "ONE_TENT_BROWSER_PROOF_JSON=";
const EXPECTED_STAGES = [
  "auth_restored",
  "hierarchy_created_via_ui",
  "grow_resolved",
  "tent_resolved",
  "plant_resolved",
  "quick_log_context_verified",
  "plant_persisted_after_refresh",
  "photo_and_manual_evidence_persisted",
  "quick_log_persisted",
  "timeline_visible",
  "manual_provenance_visible",
  "sensor_snapshot_verified",
  "ai_doctor_boundary_verified",
  "alert_verified",
  "action_queue_suggestion_verified",
  "grower_decision_verified",
  "follow_up_marker_verified",
  "paddle_sandbox_verified",
  "auto_diary_follow_up",
];
const EXPECTED_FENCES = [
  "quick_log_count",
  "alert_count",
  "action_queue_count",
  "follow_up_marker_count",
];
const MAX_LOG_BYTES = 10 * 1024 * 1024;

function fail(code) {
  console.error(`one_tent_browser_proof=${code}`);
  process.exit(1);
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--log" || argv[2] !== "--playwright-exit") {
    fail("invalid_arguments");
  }
  if (!/^(0|[1-9][0-9]*)$/.test(argv[3])) fail("invalid_playwright_exit");
  return { logPath: argv[1], playwrightExit: Number(argv[3]) };
}

function isExactObject(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function verifyReceipt(receipt) {
  const receiptKeys = [
    "schema_version",
    "proof",
    "status",
    "blocker_reason",
    "restore_strategy",
    "seed_status",
    "stages",
    "duplicate_fences",
    "safety",
  ];
  if (!isExactObject(receipt, receiptKeys)) return false;
  if (receipt?.schema_version !== "2") return false;
  if (receipt?.proof !== "one-tent-loop-authenticated-ui") return false;
  if (receipt?.status !== "pass" || receipt?.blocker_reason !== null) return false;
  if (receipt?.seed_status !== "completed" || receipt?.restore_strategy === "none") return false;
  if (!isExactObject(receipt?.stages, EXPECTED_STAGES)) return false;
  if (!EXPECTED_STAGES.every((stage) => receipt.stages[stage] === "pass")) return false;
  if (!isExactObject(receipt?.duplicate_fences, EXPECTED_FENCES)) return false;
  if (!EXPECTED_FENCES.every((fence) => receipt.duplicate_fences[fence] === 1)) return false;

  const safetyKeys = [
    "fabricated_login_used",
    "paid_ai_request_observed",
    "device_control_request_observed",
    "service_role_in_browser_observed",
  ];
  if (!isExactObject(receipt?.safety, safetyKeys)) return false;
  return safetyKeys.every((key) => receipt.safety[key] === false);
}

const { logPath, playwrightExit } = parseArgs(process.argv.slice(2));
if (playwrightExit !== 0) fail("playwright_failed");

let log;
try {
  const size = statSync(logPath).size;
  if (size <= 0 || size > MAX_LOG_BYTES) fail("invalid_log_size");
  log = readFileSync(logPath, "utf8");
} catch {
  fail("log_unreadable");
}

const receiptLines = log.split(/\r?\n/u).filter((line) => line.startsWith(PREFIX));
if (receiptLines.length !== 1) fail("invalid_receipt_count");

let receipt;
try {
  receipt = JSON.parse(receiptLines[0].slice(PREFIX.length));
} catch {
  fail("invalid_receipt_json");
}
if (!verifyReceipt(receipt)) fail("receipt_not_complete_pass");

console.log("one_tent_browser_proof=verified_pass");
