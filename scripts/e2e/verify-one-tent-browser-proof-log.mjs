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
  "approval_boundary_verified",
  "paddle_sandbox_verified",
];
const EXPECTED_FENCES = ["quick_log_count", "alert_count", "action_queue_count"];
const RECEIPT_KEYS = [
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
const SAFETY_KEYS = [
  "fabricated_login_used",
  "paid_ai_request_observed",
  "device_control_request_observed",
  "service_role_in_browser_observed",
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

function hasExactReceiptShape(receipt) {
  if (!isExactObject(receipt, RECEIPT_KEYS)) return false;
  if (receipt?.schema_version !== "3") return false;
  if (receipt?.proof !== "one-tent-loop-authenticated-ui") return false;
  if (!["pass", "blocked", "fail"].includes(receipt?.status)) return false;
  if (receipt?.blocker_reason !== null && typeof receipt?.blocker_reason !== "string") return false;
  if (
    !["storage_session", "storage_plus_cookies", "cookies_only", "none"].includes(
      receipt?.restore_strategy,
    )
  ) {
    return false;
  }
  if (!["not_started", "blocked", "completed", "failed"].includes(receipt?.seed_status)) {
    return false;
  }
  if (!isExactObject(receipt?.stages, EXPECTED_STAGES)) return false;
  if (
    !EXPECTED_STAGES.every((stage) =>
      ["pass", "blocked", "fail", "not_run"].includes(receipt.stages[stage]),
    )
  ) {
    return false;
  }
  if (!isExactObject(receipt?.duplicate_fences, EXPECTED_FENCES)) return false;
  if (
    !EXPECTED_FENCES.every((fence) => {
      const value = receipt.duplicate_fences[fence];
      return value === null || (Number.isInteger(value) && value >= 0);
    })
  ) {
    return false;
  }
  if (!isExactObject(receipt?.safety, SAFETY_KEYS)) return false;
  if (receipt.safety.fabricated_login_used !== false) return false;
  return SAFETY_KEYS.slice(1).every((key) => typeof receipt.safety[key] === "boolean");
}

function verifyReceipt(receipt) {
  if (!hasExactReceiptShape(receipt)) return false;
  if (receipt.status !== "pass" || receipt.blocker_reason !== null) return false;
  if (
    receipt.seed_status !== "completed" ||
    !["storage_session", "storage_plus_cookies"].includes(receipt.restore_strategy)
  ) {
    return false;
  }
  if (!EXPECTED_STAGES.every((stage) => receipt.stages[stage] === "pass")) return false;
  if (!EXPECTED_FENCES.every((fence) => receipt.duplicate_fences[fence] === 1)) return false;
  return SAFETY_KEYS.every((key) => receipt.safety[key] === false);
}

function sanitizedFailureReason(receipt) {
  if (!hasExactReceiptShape(receipt) || receipt.status !== "fail") return null;
  const reason = receipt.blocker_reason;
  if (typeof reason !== "string") return null;

  for (const stage of EXPECTED_STAGES) {
    if (reason === `${stage}_failed` && receipt.stages[stage] === "fail") return reason;
  }

  if (reason === "password_auth_request_observed") return reason;
  if (reason === "paid_ai_request_observed" && receipt.safety.paid_ai_request_observed) {
    return reason;
  }
  if (
    reason === "device_control_request_observed" &&
    receipt.safety.device_control_request_observed
  ) {
    return reason;
  }
  if (
    reason === "service_role_in_browser_observed" &&
    receipt.safety.service_role_in_browser_observed
  ) {
    return reason;
  }
  return null;
}

const { logPath, playwrightExit } = parseArgs(process.argv.slice(2));

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
if (playwrightExit !== 0) {
  fail(`playwright_failed:${sanitizedFailureReason(receipt) ?? "unclassified"}`);
}
if (!verifyReceipt(receipt)) fail("receipt_not_complete_pass");

console.log("one_tent_browser_proof=verified_pass");
