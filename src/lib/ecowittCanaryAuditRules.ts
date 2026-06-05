/**
 * EcoWitt Canary Audit — pure rules.
 *
 * Used by the Operator EcoWitt Canary Audit page. NO Supabase writes, NO
 * device control, NO alerts/Action Queue side effects. Pure functions only.
 */

export type PreflightStatus = "pass" | "fail" | "incomplete";
export type CardStatus = "pass" | "fail" | "incomplete" | "unknown";
export type Verdict = "go" | "no_go" | "incomplete";

export const REPORT_VERSION = "ecowitt_canary_audit_v1";
export const VERDICT_REPORT_VERSION = "ecowitt_canary_verdict_v1";
export const LOCAL_STORAGE_KEY = "operator.ecowitt.canary.audit.v1";
export const WORKFLOW_STORAGE_KEY = "operator.ecowitt.canary.workflow.v1";

// ----- import secret-scan patterns ----------------------------------------

export const ALLOWED_REDACTION_PLACEHOLDERS = [
  "vbt_REDACTED",
  "PASSKEY_REDACTED",
  "MAC_REDACTED",
  "SHOULD_NOT_PERSIST",
  "[REDACTED]",
];

const PLACEHOLDER_TOKEN_RE = /(vbt_REDACTED|PASSKEY_REDACTED|MAC_REDACTED|SHOULD_NOT_PERSIST|\[REDACTED\])/;

interface SecretPattern {
  category: string;
  test: (text: string) => boolean;
}

const SECRET_IMPORT_PATTERNS: SecretPattern[] = [
  { category: "bridge token (vbt_)", test: (t) => /\bvbt_(?!REDACTED\b)[A-Za-z0-9_-]{6,}/.test(t) },
  { category: "MAC address", test: (t) => /\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/.test(t) },
  { category: "JWT-like (eyJ...)", test: (t) => /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(t) },
  { category: "Stripe-like (sk_)", test: (t) => /\bsk_[A-Za-z0-9]{10,}/.test(t) },
  { category: "service_role literal", test: (t) => /service_role/i.test(t) },
  {
    category: "api_key=value",
    test: (t) => {
      const m = t.match(/\bapi_key\s*[=:]\s*["']?([^\s"',}]+)/i);
      return !!m && !PLACEHOLDER_TOKEN_RE.test(m[1]);
    },
  },
  {
    category: "application_key=value",
    test: (t) => {
      const m = t.match(/\bapplication_key\s*[=:]\s*["']?([^\s"',}]+)/i);
      return !!m && !PLACEHOLDER_TOKEN_RE.test(m[1]);
    },
  },
  {
    category: "PASSKEY= non-redacted",
    test: (t) => {
      const m = t.match(/\bPASSKEY\s*[=:]\s*["']?([^\s"',}]+)/i);
      return !!m && !PLACEHOLDER_TOKEN_RE.test(m[1]);
    },
  },
  {
    category: "MAC= non-redacted",
    test: (t) => {
      const m = t.match(/\bMAC\s*[=:]\s*["']?([^\s"',}]+)/i);
      return !!m && !PLACEHOLDER_TOKEN_RE.test(m[1]);
    },
  },
  {
    category: "long hex string (32+ chars)",
    test: (t) => {
      const re = /\b[0-9a-fA-F]{32,}\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t)) !== null) {
        const ctxStart = Math.max(0, m.index - 5);
        if (t.slice(ctxStart, m.index).includes("ewfp_")) continue;
        return true;
      }
      return false;
    },
  },
];

/** Return matched secret-pattern *category names* (never the values). */
export function detectSecretCategories(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const p of SECRET_IMPORT_PATTERNS) {
    try {
      if (p.test(text)) found.add(p.category);
    } catch {
      /* ignore */
    }
  }
  return Array.from(found);
}

export interface PreflightInput {
  /** Whether an authenticated operator session is available. */
  authAvailable: boolean;
  /** Raw tents row, or null if not loaded yet. */
  tent: {
    id: string;
    name?: string | null;
    is_archived?: boolean | null;
    hardware_config?: unknown;
  } | null;
}

export interface PreflightCheck {
  key: string;
  label: string;
  status: CardStatus;
  detail?: string;
}

export interface PreflightResult {
  status: PreflightStatus;
  checks: PreflightCheck[];
  reason: string;
}

// ----- secret heuristics ---------------------------------------------------

const SECRET_KEY_NAMES = [
  "passkey",
  "mac",
  "api_key",
  "apikey",
  "application_key",
  "applicationkey",
  "token",
  "auth",
  "service_role",
];

const MAC_LIKE = /^[0-9A-Fa-f]{2}([:-]?[0-9A-Fa-f]{2}){5}$/;
const PASSKEY_LIKE = /^[0-9A-F]{16,}$/;

function looksLikeRawSecret(value: string): boolean {
  if (!value) return false;
  if (MAC_LIKE.test(value)) return true;
  if (PASSKEY_LIKE.test(value)) return true;
  return false;
}

function scanForRawSecrets(node: unknown, path: string[] = []): string | null {
  if (node == null) return null;
  if (typeof node === "string") {
    if (looksLikeRawSecret(node)) return path.join(".") || "(root)";
    return null;
  }
  if (typeof node !== "object") return null;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    if (SECRET_KEY_NAMES.some((s) => lower === s || lower.endsWith(`_${s}`))) {
      if (typeof v === "string" && v.length > 0 && !v.startsWith("ewfp_")) {
        return [...path, k].join(".");
      }
    }
    const nested = scanForRawSecrets(v, [...path, k]);
    if (nested) return nested;
  }
  return null;
}

// ----- preflight -----------------------------------------------------------

export function evaluatePreflight(input: PreflightInput): PreflightResult {
  const checks: PreflightCheck[] = [];

  if (!input.authAvailable) {
    return {
      status: "incomplete",
      reason: "Preflight DB checks require an authenticated operator session.",
      checks: [
        {
          key: "auth",
          label: "Authenticated operator session",
          status: "incomplete",
          detail: "Sign in as an operator to run preflight.",
        },
      ],
    };
  }

  if (!input.tent) {
    return {
      status: "incomplete",
      reason: "No tent loaded yet.",
      checks: [{ key: "tent_loaded", label: "Tent loaded", status: "incomplete" }],
    };
  }

  const tent = input.tent;
  checks.push({
    key: "tent_exists",
    label: "Tent exists",
    status: "pass",
    detail: tent.name ?? tent.id,
  });

  const archivedOk = tent.is_archived !== true;
  checks.push({
    key: "tent_active",
    label: "Tent is not archived",
    status: archivedOk ? "pass" : "fail",
    detail: archivedOk ? undefined : "Tent is archived. Select an active canary tent.",
  });

  const hw = (tent.hardware_config ?? null) as Record<string, unknown> | null;
  const ecowitt =
    hw && typeof hw === "object"
      ? ((hw as Record<string, unknown>).ecowitt as Record<string, unknown> | undefined)
      : undefined;

  if (!ecowitt || typeof ecowitt !== "object") {
    checks.push({
      key: "ecowitt_config",
      label: "hardware_config.ecowitt present",
      status: "fail",
      detail: "Missing ecowitt block.",
    });
    return finalize(checks, "ecowitt block missing from hardware_config");
  }
  checks.push({ key: "ecowitt_config", label: "hardware_config.ecowitt present", status: "pass" });

  const fp = ecowitt.passkey_fingerprint;
  const fpLooksRaw = typeof fp === "string" && (MAC_LIKE.test(fp) || PASSKEY_LIKE.test(fp));
  const fpOk = typeof fp === "string" && fp.startsWith("ewfp_") && fp.length > "ewfp_".length;
  checks.push({
    key: "fingerprint",
    label: "passkey_fingerprint present and ewfp_-prefixed",
    status: fpOk && !fpLooksRaw ? "pass" : "fail",
    detail: !fp
      ? "passkey_fingerprint is missing. Compute ewfp_… from the exact PASSKEY used in the canary curl."
      : fpLooksRaw
        ? "Fingerprint looks like a raw MAC/PASSKEY. Store only ewfp_… fingerprint, never raw device identifiers."
        : !fpOk
          ? "passkey_fingerprint must start with 'ewfp_'. Compute ewfp_… from the exact PASSKEY used in the canary curl."
          : undefined,
  });

  const air = ecowitt.air_channels;
  const soil = ecowitt.soil_channels;
  const isNumericArr = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x));

  const airNumeric = isNumericArr(air);
  const soilNumeric = isNumericArr(soil);
  checks.push({
    key: "air_numeric",
    label: "air_channels is numeric array",
    status: airNumeric ? "pass" : "fail",
    detail: airNumeric
      ? undefined
      : 'air_channels must be numeric array [1]. Strings like ["1"] will not route.',
  });
  checks.push({
    key: "soil_numeric",
    label: "soil_channels is numeric array",
    status: soilNumeric ? "pass" : "fail",
    detail: soilNumeric
      ? undefined
      : 'soil_channels must be numeric array [1]. Strings like ["1"] will not route.',
  });

  const airEq1 = airNumeric && air.length === 1 && air[0] === 1;
  const soilEq1 = soilNumeric && soil.length === 1 && soil[0] === 1;
  checks.push({
    key: "air_eq_1",
    label: "air_channels === [1]",
    status: airEq1 ? "pass" : "fail",
  });
  checks.push({
    key: "soil_eq_1",
    label: "soil_channels === [1]",
    status: soilEq1 ? "pass" : "fail",
  });

  const has9 =
    (Array.isArray(air) && air.some((x) => x === 9 || x === "9")) ||
    (Array.isArray(soil) && soil.some((x) => x === 9 || x === "9"));
  checks.push({
    key: "channel_9_unmapped",
    label: "channel 9 not mapped",
    status: has9 ? "fail" : "pass",
    detail: has9
      ? "Channel 9 must remain unmapped for the canary. Remove 9 from air_channels/soil_channels."
      : undefined,
  });

  const leakPath = scanForRawSecrets(ecowitt);
  checks.push({
    key: "no_raw_secrets",
    label: "no raw PASSKEY/MAC/token in hardware_config.ecowitt",
    status: leakPath ? "fail" : "pass",
    detail: leakPath ? `Suspicious field: ${leakPath}` : undefined,
  });

  return finalize(checks);
}

function finalize(checks: PreflightCheck[], extraReason?: string): PreflightResult {
  const anyFail = checks.some((c) => c.status === "fail");
  const anyIncomplete = checks.some((c) => c.status === "incomplete");
  if (anyFail) {
    return {
      status: "fail",
      checks,
      reason: extraReason ?? checks.find((c) => c.status === "fail")?.detail ?? "Preflight failed.",
    };
  }
  if (anyIncomplete) {
    return { status: "incomplete", checks, reason: "Preflight incomplete." };
  }
  return { status: "pass", checks, reason: "All preflight checks passed." };
}

// ----- canary results parsing ---------------------------------------------

export interface CanaryReportInput {
  generated_at?: string;
  endpoint?: string;
  preflight_status?: PreflightStatus;
  responses?: {
    main?: { http?: number; ok?: boolean };
    duplicate?: { http?: number; ok?: boolean };
    malformed?: { http?: number; ok?: boolean };
  };
  /** metric -> count for main canary */
  main_row_counts?: Record<string, number>;
  /** metric -> count for malformed canary */
  malformed_row_counts?: Record<string, number>;
  /** metric -> count after duplicate replay (still 1 per metric) */
  duplicate_replay_counts?: Record<string, number>;
  channel_9_count?: number;
  leak_scan_count?: number;
  secret_value_leak_count?: number;
  null_captured_at_count?: number;
  timestamp_source_counts?: Record<string, number>;
  vpd_provenance?: {
    calculated?: boolean;
    derived_from?: string[];
  };
  log_safety_status?: "clean" | "leaked" | "not_reviewed";
}

export interface ParsedCanaryReport {
  ok: boolean;
  report: CanaryReportInput | null;
  source: "json" | "text" | "empty";
  parseNotes: string[];
}

export function parseCanaryPaste(raw: string): ParsedCanaryReport {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, report: null, source: "empty", parseNotes: [] };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return { ok: true, report: parsed as CanaryReportInput, source: "json", parseNotes: [] };
    }
  } catch {
    /* fall through */
  }
  return {
    ok: true,
    report: {},
    source: "text",
    parseNotes: [
      "Plain-text paste detected. Verdict cannot be GO without structured JSON or manual SQL verification.",
    ],
  };
}

// ----- redaction -----------------------------------------------------------

const REPORT_ALLOWED_KEYS: (keyof CanaryReportInput)[] = [
  "generated_at",
  "endpoint",
  "preflight_status",
  "responses",
  "main_row_counts",
  "malformed_row_counts",
  "duplicate_replay_counts",
  "channel_9_count",
  "leak_scan_count",
  "secret_value_leak_count",
  "null_captured_at_count",
  "timestamp_source_counts",
  "vpd_provenance",
  "log_safety_status",
];

const REDACT_KEY_PATTERN = /(passkey|^mac$|_mac$|api_?key|application_?key|token|auth|secret|service_role|user_id|raw_payload|payload|body)/i;

function deepRedact(node: unknown): unknown {
  if (node == null) return node;
  if (typeof node === "string") {
    return looksLikeRawSecret(node) ? "[REDACTED]" : node;
  }
  if (Array.isArray(node)) return node.map(deepRedact);
  if (typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (REDACT_KEY_PATTERN.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = deepRedact(v);
    }
    return out;
  }
  return node;
}

export function redactReport(r: CanaryReportInput | null): CanaryReportInput | null {
  if (!r) return null;
  const allow: Record<string, unknown> = {};
  for (const k of REPORT_ALLOWED_KEYS) {
    const v = (r as Record<string, unknown>)[k as string];
    if (v !== undefined) allow[k as string] = v;
  }
  return deepRedact(allow) as CanaryReportInput;
}

// ----- verdict --------------------------------------------------------------

export interface VerdictCard {
  key: string;
  label: string;
  status: CardStatus;
  reason: string;
  evidence_present: string[];
  evidence_missing: string[];
  next_action?: string;
}

export interface VerdictResult {
  verdict: Verdict;
  cards: VerdictCard[];
  reasons: string[];
}

const REQUIRED_MAIN_METRICS = ["temperature_c", "humidity", "soil_moisture", "vpd_kpa"];
const REQUIRED_MALFORMED_METRICS = ["humidity", "soil_moisture"];
const FORBIDDEN_MALFORMED_METRICS = ["temperature_c", "vpd_kpa"];

interface CardInit {
  key: string;
  label: string;
  status: CardStatus;
  reason: string;
  evidence_present?: string[];
  evidence_missing?: string[];
  next_action?: string;
}

export function computeVerdict(args: {
  preflight: PreflightResult | null;
  report: CanaryReportInput | null;
  logReviewed: boolean;
}): VerdictResult {
  const cards: VerdictCard[] = [];
  const reasons: string[] = [];
  let anyFail = false;
  let anyIncomplete = false;

  const push = (c: CardInit) => {
    const card: VerdictCard = {
      evidence_present: [],
      evidence_missing: [],
      ...c,
    };
    cards.push(card);
    if (c.status === "fail") {
      anyFail = true;
      reasons.push(`${c.label}: ${c.reason}`);
    } else if (c.status === "incomplete" || c.status === "unknown") {
      anyIncomplete = true;
    }
  };

  // Preflight
  if (!args.preflight) {
    push({
      key: "preflight",
      label: "Preflight",
      status: "incomplete",
      reason: "Not run.",
      evidence_missing: ["preflight result"],
      next_action: "Select a canary tent and run the Pre-POST Validator.",
    });
  } else {
    const failed = args.preflight.checks.filter((c) => c.status === "fail").map((c) => c.detail || c.label);
    const passed = args.preflight.checks.filter((c) => c.status === "pass").map((c) => c.label);
    push({
      key: "preflight",
      label: "Preflight",
      status: args.preflight.status === "pass" ? "pass" : args.preflight.status === "fail" ? "fail" : "incomplete",
      reason: args.preflight.reason,
      evidence_present: passed,
      evidence_missing: args.preflight.status === "fail" ? failed : [],
      next_action:
        args.preflight.status === "fail"
          ? "Fix the listed hardware_config issues before POSTing."
          : undefined,
    });
  }

  const r = args.report;
  if (!r || Object.keys(r).length === 0) {
    push({
      key: "posts",
      label: "POSTs",
      status: "incomplete",
      reason: "No canary report imported.",
      evidence_missing: ["responses.main", "responses.duplicate", "responses.malformed"],
      next_action: "Run scripts/ecowitt-canary-harness.sh and paste the JSON output.",
    });
    push({
      key: "sql",
      label: "SQL Verification",
      status: "incomplete",
      reason: "No SQL counts imported.",
      evidence_missing: ["main_row_counts", "malformed_row_counts"],
      next_action: "Include sensor_readings row counts in the harness JSON.",
    });
    push({
      key: "ts",
      label: "Timestamp Integrity",
      status: "incomplete",
      reason: "Missing.",
      evidence_missing: ["timestamp_source_counts"],
    });
    push({
      key: "secrets",
      label: "Secret Safety",
      status: "incomplete",
      reason: "Missing.",
      evidence_missing: ["leak_scan_count", "secret_value_leak_count", "null_captured_at_count"],
    });
    push({
      key: "dup",
      label: "Duplicate Replay",
      status: "incomplete",
      reason: "Missing.",
      evidence_missing: ["duplicate_replay_counts"],
    });
    push({
      key: "ch9",
      label: "Unmapped Channel 9",
      status: "incomplete",
      reason: "Missing.",
      evidence_missing: ["channel_9_count"],
    });
  } else {
    // POSTs
    const resp = r.responses ?? {};
    const respKeys = ["main", "duplicate", "malformed"] as const;
    const respMissing = respKeys.filter((k) => !(resp as Record<string, unknown>)[k]);
    const respFailed = respKeys.filter((k) => {
      const v = (resp as Record<string, { http?: number; ok?: boolean } | undefined>)[k];
      return v && !(v.ok === true || v.http === 200);
    });
    push({
      key: "posts",
      label: "POSTs",
      status:
        respMissing.length > 0
          ? "incomplete"
          : respFailed.length === 0
            ? "pass"
            : "fail",
      reason:
        respMissing.length > 0
          ? `Missing responses: ${respMissing.join(", ")}.`
          : respFailed.length === 0
            ? "All three POSTs returned 200."
            : `Non-200 responses: ${respFailed.join(", ")}.`,
      evidence_present: respKeys.filter((k) => !respMissing.includes(k) && !respFailed.includes(k)).map((k) => `${k}=200`),
      evidence_missing: respMissing.map((k) => `responses.${k}`),
      next_action:
        respFailed.length > 0
          ? "Re-run the harness; investigate the failing POST before grading."
          : undefined,
    });

    // SQL: main row counts
    if (!r.main_row_counts) {
      push({
        key: "sql_main",
        label: "Main canary rows (expect 4)",
        status: "incomplete",
        reason: "main_row_counts missing.",
        evidence_missing: ["main_row_counts"],
        next_action: "Include per-metric row counts in the imported JSON.",
      });
    } else {
      const counts = r.main_row_counts;
      const missing = REQUIRED_MAIN_METRICS.filter((m) => (counts[m] ?? 0) !== 1);
      const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
      const extra = Object.keys(counts).filter((m) => !REQUIRED_MAIN_METRICS.includes(m));
      const ok = missing.length === 0 && totalRows === 4 && extra.length === 0;
      push({
        key: "sql_main",
        label: "Main canary rows (expect 4)",
        status: ok ? "pass" : "fail",
        reason: ok
          ? "4 rows present: temperature_c, humidity, soil_moisture, vpd_kpa."
          : `Mismatch — total=${totalRows}, missing=${missing.join(",") || "none"}, extra=${extra.join(",") || "none"}.`,
        evidence_present: REQUIRED_MAIN_METRICS.filter((m) => (counts[m] ?? 0) === 1).map((m) => `${m}=1`),
        evidence_missing: missing.map((m) => `${m}=1`),
        next_action: ok ? undefined : "Re-check ingest mapping and re-run the main canary POST.",
      });
    }

    // SQL: malformed
    if (!r.malformed_row_counts) {
      push({
        key: "sql_malformed",
        label: "Malformed canary rows (expect 2)",
        status: "incomplete",
        reason: "malformed_row_counts missing.",
        evidence_missing: ["malformed_row_counts"],
      });
    } else {
      const m = r.malformed_row_counts;
      const present = Object.keys(m).filter((k) => (m[k] ?? 0) > 0);
      const hasForbidden = FORBIDDEN_MALFORMED_METRICS.filter((k) => (m[k] ?? 0) > 0);
      const hasRequired = REQUIRED_MALFORMED_METRICS.every((k) => (m[k] ?? 0) === 1);
      const ok = hasForbidden.length === 0 && hasRequired && present.length === 2;
      const reason = ok
        ? "humidity + soil_moisture only; no temperature_c or vpd_kpa."
        : hasForbidden.includes("vpd_kpa")
          ? "Hard fail: VPD was generated from malformed temperature input."
          : hasForbidden.includes("temperature_c")
            ? "Hard fail: temperature_c row was generated from malformed temperature input."
            : `Unexpected metric set: present=${present.join(",")}`;
      push({
        key: "sql_malformed",
        label: "Malformed canary rows (expect 2)",
        status: ok ? "pass" : "fail",
        reason,
        evidence_present: REQUIRED_MALFORMED_METRICS.filter((k) => (m[k] ?? 0) === 1).map((k) => `${k}=1`),
        evidence_missing: hasForbidden.map((k) => `forbidden:${k}`),
        next_action: ok
          ? undefined
          : "Reject the canary. Malformed inputs must drop temperature_c/vpd_kpa rows.",
      });
    }

    // Duplicate replay
    if (!r.duplicate_replay_counts) {
      push({
        key: "dup",
        label: "Duplicate Replay",
        status: "incomplete",
        reason: "Missing.",
        evidence_missing: ["duplicate_replay_counts"],
      });
    } else {
      const over = Object.entries(r.duplicate_replay_counts).filter(([, v]) => (v ?? 0) > 1);
      push({
        key: "dup",
        label: "Duplicate Replay",
        status: over.length === 0 ? "pass" : "fail",
        reason:
          over.length === 0
            ? "Still 1 per metric."
            : "Duplicate replay produced more than one row per metric. Check dateutc, captured_at, and the sensor_readings_dedupe_uidx constraint.",
        evidence_present:
          over.length === 0
            ? Object.entries(r.duplicate_replay_counts).map(([k, v]) => `${k}=${v}`)
            : [],
        evidence_missing: over.map(([k, v]) => `${k}=${v} (expected 1)`),
        next_action:
          over.length === 0 ? undefined : "Verify dedupe index exists and dateutc is preserved.",
      });
    }

    // Channel 9
    if (typeof r.channel_9_count !== "number") {
      push({
        key: "ch9",
        label: "Unmapped Channel 9",
        status: "incomplete",
        reason: "Missing count.",
        evidence_missing: ["channel_9_count"],
      });
    } else {
      const ok = r.channel_9_count === 0;
      push({
        key: "ch9",
        label: "Unmapped Channel 9",
        status: ok ? "pass" : "fail",
        reason: ok
          ? "0 rows from channel 9 (unmapped, as required)."
          : `Channel 9 leaked ${r.channel_9_count} rows. Unmapped channels must produce zero rows.`,
        evidence_present: ok ? ["channel_9_count=0"] : [],
        evidence_missing: ok ? [] : [`channel_9_count=${r.channel_9_count}`],
        next_action: ok ? undefined : "Remove channel 9 from hardware_config and re-run.",
      });
    }

    // Timestamp integrity
    const tsc = r.timestamp_source_counts;
    if (!tsc) {
      push({
        key: "ts",
        label: "Timestamp Integrity",
        status: "incomplete",
        reason: "Missing.",
        evidence_missing: ["timestamp_source_counts"],
      });
    } else {
      const eco = tsc.ecowitt_dateutc ?? 0;
      const srv = tsc.server_received_at ?? 0;
      const onlyServer = eco === 0 && srv > 0;
      push({
        key: "ts",
        label: "Timestamp Integrity",
        status: onlyServer ? "fail" : eco > 0 ? "pass" : "incomplete",
        reason: onlyServer
          ? "Valid canary rows should use timestamp_source = ecowitt_dateutc. server_received_at means dateutc was missing, malformed, or out of the clock-sanity window."
          : eco > 0
            ? `ecowitt_dateutc=${eco} for canary rows.`
            : "No timestamp_source counts provided.",
        evidence_present: eco > 0 ? [`ecowitt_dateutc=${eco}`] : [],
        evidence_missing: onlyServer ? [`server_received_at=${srv} (expected ecowitt_dateutc)`] : [],
        next_action: onlyServer
          ? "Inspect dateutc parsing and clock-sanity bounds in ecowitt-ingest."
          : undefined,
      });
    }

    // Secret safety
    const leakCount = r.leak_scan_count;
    const valLeak = r.secret_value_leak_count;
    const nullTs = r.null_captured_at_count;
    if (leakCount == null || valLeak == null || nullTs == null) {
      push({
        key: "secrets",
        label: "Secret Safety",
        status: "incomplete",
        reason: "Missing leak/null counts.",
        evidence_missing: [
          leakCount == null ? "leak_scan_count" : "",
          valLeak == null ? "secret_value_leak_count" : "",
          nullTs == null ? "null_captured_at_count" : "",
        ].filter(Boolean),
      });
    } else {
      const ok = leakCount === 0 && valLeak === 0 && nullTs === 0;
      const reason = ok
        ? "0 key-name leaks, 0 secret-value leaks, 0 null captured_at."
        : leakCount > 0 || valLeak > 0
          ? "Secret-like data was found in raw_payload. Stop before live gateway testing."
          : `null_captured_at=${nullTs}`;
      push({
        key: "secrets",
        label: "Secret Safety",
        status: ok ? "pass" : "fail",
        reason,
        evidence_present: ok
          ? ["leak_scan_count=0", "secret_value_leak_count=0", "null_captured_at_count=0"]
          : [],
        evidence_missing: ok
          ? []
          : [
              leakCount > 0 ? `leak_scan_count=${leakCount}` : "",
              valLeak > 0 ? `secret_value_leak_count=${valLeak}` : "",
              nullTs > 0 ? `null_captured_at_count=${nullTs}` : "",
            ].filter(Boolean),
        next_action: ok ? undefined : "Do not proceed with live gateway. Scrub payload pipeline.",
      });
    }

    // VPD provenance
    const vpd = r.vpd_provenance;
    if (!vpd) {
      push({
        key: "vpd",
        label: "VPD Provenance",
        status: "incomplete",
        reason: "Missing.",
        evidence_missing: ["vpd_provenance"],
      });
    } else {
      const derived = vpd.derived_from ?? [];
      const ok =
        vpd.calculated === true &&
        derived.some((k) => /temp/i.test(k)) &&
        derived.some((k) => /humidity/i.test(k));
      push({
        key: "vpd",
        label: "VPD Provenance",
        status: ok ? "pass" : "fail",
        reason: ok
          ? "calculated=true; derived_from temp+humidity."
          : "vpd_kpa not provably derived from temp+humidity.",
        evidence_present: ok ? [`derived_from=${derived.join("+")}`] : [],
        evidence_missing: ok ? [] : ["calculated=true; derived_from=[temp*,humidity*]"],
      });
    }

    // Log safety
    const logsClean = r.log_safety_status === "clean";
    const logsLeaked = r.log_safety_status === "leaked";
    push({
      key: "logs",
      label: "Log Safety",
      status: logsClean ? (args.logReviewed ? "pass" : "incomplete") : logsLeaked ? "fail" : "incomplete",
      reason: logsClean
        ? args.logReviewed
          ? "Logs reviewed; no secrets found."
          : "Mark logs as reviewed to confirm."
        : logsLeaked
          ? "Secret found in logs."
          : "Log review not yet completed.",
      evidence_present: logsClean && args.logReviewed ? ["log_safety_status=clean", "operator_reviewed=true"] : [],
      evidence_missing: !args.logReviewed ? ["operator_reviewed=true"] : [],
      next_action: logsLeaked ? "Block live gateway; rotate any exposed secrets." : undefined,
    });
  }

  let verdict: Verdict;
  if (anyFail) verdict = "no_go";
  else if (anyIncomplete) verdict = "incomplete";
  else verdict = "go";

  cards.push({
    key: "verdict",
    label: "Final Verdict",
    status: verdict === "go" ? "pass" : verdict === "no_go" ? "fail" : "incomplete",
    reason:
      verdict === "go"
        ? "All canary checks passed."
        : verdict === "no_go"
          ? "One or more hard failures."
          : "Awaiting evidence.",
    evidence_present: [],
    evidence_missing: [],
  });

  return { verdict, cards, reasons };
}

// ----- report (download) ---------------------------------------------------

export interface BuiltAuditReport {
  report_version: string;
  generated_at: string;
  tent: { id: string; name: string | null } | null;
  endpoint: string | null;
  verdict: Verdict;
  cards: VerdictCard[];
  reasons: string[];
  preflight_summary: {
    status: PreflightStatus | null;
    reason: string | null;
    checks: PreflightCheck[];
  };
  imported_report: CanaryReportInput | null;
  safety_notes: string[];
  restored?: boolean;
}

export function buildAuditReport(args: {
  tent: { id: string; name?: string | null } | null;
  endpoint?: string | null;
  preflight: PreflightResult | null;
  report: CanaryReportInput | null;
  verdict: VerdictResult;
}): BuiltAuditReport {
  return {
    report_version: REPORT_VERSION,
    generated_at: new Date().toISOString(),
    tent: args.tent ? { id: args.tent.id, name: args.tent.name ?? null } : null,
    endpoint: args.endpoint ?? null,
    verdict: args.verdict.verdict,
    cards: args.verdict.cards,
    reasons: args.verdict.reasons,
    preflight_summary: {
      status: args.preflight?.status ?? null,
      reason: args.preflight?.reason ?? null,
      checks: args.preflight?.checks ?? [],
    },
    imported_report: redactReport(args.report),
    safety_notes: [
      "Read-only diagnostics.",
      "No device control.",
      "No automation.",
      "No alerts written.",
      "No Action Queue writes.",
      "Secrets, tokens, MACs, and raw payloads are redacted.",
    ],
  };
}

// ----- localStorage (opt-in) ----------------------------------------------

export function saveAuditToLocalStorage(audit: BuiltAuditReport): void {
  try {
    const redacted: BuiltAuditReport = {
      ...audit,
      imported_report: redactReport(audit.imported_report ?? null),
    };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(redacted));
    }
  } catch {
    /* ignore */
  }
}

export function loadAuditFromLocalStorage(): BuiltAuditReport | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuiltAuditReport;
    if (!parsed || parsed.report_version !== REPORT_VERSION) return null;
    return { ...parsed, restored: true };
  } catch {
    return null;
  }
}

export function clearAuditFromLocalStorage(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
