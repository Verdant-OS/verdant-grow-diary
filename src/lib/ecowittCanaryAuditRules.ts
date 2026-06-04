/**
 * EcoWitt Canary Audit — pure rules.
 *
 * Used by the Operator EcoWitt Canary Audit page. NO Supabase writes, NO
 * device control, NO alerts/Action Queue side effects. Pure functions only.
 */

export type PreflightStatus = "pass" | "fail" | "incomplete";
export type CardStatus = "pass" | "fail" | "incomplete" | "unknown";
export type Verdict = "go" | "no_go" | "incomplete";

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
    detail: archivedOk ? undefined : "Tent is archived.",
  });

  const hw = (tent.hardware_config ?? null) as Record<string, unknown> | null;
  const ecowitt =
    hw && typeof hw === "object" ? ((hw as Record<string, unknown>).ecowitt as Record<string, unknown> | undefined) : undefined;

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
  const fpOk = typeof fp === "string" && fp.startsWith("ewfp_") && fp.length > "ewfp_".length;
  const fpLooksRaw = typeof fp === "string" && (MAC_LIKE.test(fp) || PASSKEY_LIKE.test(fp));
  checks.push({
    key: "fingerprint",
    label: "passkey_fingerprint present and ewfp_-prefixed",
    status: fpOk && !fpLooksRaw ? "pass" : "fail",
    detail: !fp
      ? "Missing fingerprint."
      : fpLooksRaw
        ? "Fingerprint looks like a raw MAC/PASSKEY — never store raw secrets."
        : !fpOk
          ? "Fingerprint must start with 'ewfp_'."
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
    detail: airNumeric ? undefined : "air_channels must be numbers (e.g. [1]), not strings.",
  });
  checks.push({
    key: "soil_numeric",
    label: "soil_channels is numeric array",
    status: soilNumeric ? "pass" : "fail",
    detail: soilNumeric ? undefined : "soil_channels must be numbers (e.g. [1]), not strings.",
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
    detail: has9 ? "Channel 9 must remain unmapped to validate negative control." : undefined,
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
  // try JSON
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

// ----- verdict --------------------------------------------------------------

export interface VerdictCard {
  key: string;
  label: string;
  status: CardStatus;
  reason: string;
}

export interface VerdictResult {
  verdict: Verdict;
  cards: VerdictCard[];
  reasons: string[];
}

const REQUIRED_MAIN_METRICS = ["temperature_c", "humidity", "soil_moisture", "vpd_kpa"];
const REQUIRED_MALFORMED_METRICS = ["humidity", "soil_moisture"];
const FORBIDDEN_MALFORMED_METRICS = ["temperature_c", "vpd_kpa"];

export function computeVerdict(args: {
  preflight: PreflightResult | null;
  report: CanaryReportInput | null;
  logReviewed: boolean;
}): VerdictResult {
  const cards: VerdictCard[] = [];
  const reasons: string[] = [];
  let anyFail = false;
  let anyIncomplete = false;

  const push = (c: VerdictCard) => {
    cards.push(c);
    if (c.status === "fail") {
      anyFail = true;
      reasons.push(`${c.label}: ${c.reason}`);
    } else if (c.status === "incomplete" || c.status === "unknown") {
      anyIncomplete = true;
    }
  };

  // Preflight
  if (!args.preflight) {
    push({ key: "preflight", label: "Preflight", status: "incomplete", reason: "Not run." });
  } else {
    push({
      key: "preflight",
      label: "Preflight",
      status: args.preflight.status === "pass" ? "pass" : args.preflight.status === "fail" ? "fail" : "incomplete",
      reason: args.preflight.reason,
    });
  }

  const r = args.report;
  if (!r) {
    push({ key: "posts", label: "POSTs", status: "incomplete", reason: "No canary report imported." });
    push({ key: "sql", label: "SQL Verification", status: "incomplete", reason: "No SQL counts imported." });
    push({ key: "ts", label: "Timestamp Integrity", status: "incomplete", reason: "Missing." });
    push({ key: "secrets", label: "Secret Safety", status: "incomplete", reason: "Missing." });
    push({ key: "dup", label: "Duplicate Replay", status: "incomplete", reason: "Missing." });
    push({ key: "ch9", label: "Unmapped Channel 9", status: "incomplete", reason: "Missing." });
  } else {
    // POSTs
    const resp = r.responses ?? {};
    const allOk = ["main", "duplicate", "malformed"].every((k) => {
      const v = (resp as Record<string, { http?: number; ok?: boolean } | undefined>)[k];
      return v && (v.ok === true || v.http === 200);
    });
    const anyMissing = !resp.main || !resp.duplicate || !resp.malformed;
    push({
      key: "posts",
      label: "POSTs",
      status: anyMissing ? "incomplete" : allOk ? "pass" : "fail",
      reason: anyMissing ? "One or more POST responses missing." : allOk ? "All three POSTs returned 200." : "A POST did not return 200.",
    });

    // SQL: main row counts
    if (!r.main_row_counts) {
      push({ key: "sql_main", label: "Main canary rows", status: "incomplete", reason: "Missing." });
    } else {
      const missing = REQUIRED_MAIN_METRICS.filter((m) => (r.main_row_counts?.[m] ?? 0) !== 1);
      const totalRows = Object.values(r.main_row_counts).reduce((a, b) => a + b, 0);
      const extra = Object.keys(r.main_row_counts).filter((m) => !REQUIRED_MAIN_METRICS.includes(m));
      const ok = missing.length === 0 && totalRows === 4 && extra.length === 0;
      push({
        key: "sql_main",
        label: "Main canary rows (expect 4)",
        status: ok ? "pass" : "fail",
        reason: ok
          ? "4 rows present: temperature_c, humidity, soil_moisture, vpd_kpa."
          : `Mismatch — total=${totalRows}, missing=${missing.join(",") || "none"}, extra=${extra.join(",") || "none"}.`,
      });
    }

    // SQL: malformed
    if (!r.malformed_row_counts) {
      push({ key: "sql_malformed", label: "Malformed canary rows", status: "incomplete", reason: "Missing." });
    } else {
      const m = r.malformed_row_counts;
      const present = Object.keys(m).filter((k) => (m[k] ?? 0) > 0);
      const hasForbidden = FORBIDDEN_MALFORMED_METRICS.filter((k) => (m[k] ?? 0) > 0);
      const hasRequired = REQUIRED_MALFORMED_METRICS.every((k) => (m[k] ?? 0) === 1);
      const ok = hasForbidden.length === 0 && hasRequired && present.length === 2;
      push({
        key: "sql_malformed",
        label: "Malformed canary rows (expect 2)",
        status: ok ? "pass" : "fail",
        reason: ok
          ? "humidity + soil_moisture only; no temperature_c or vpd_kpa."
          : `Forbidden=${hasForbidden.join(",") || "none"}, present=${present.join(",")}`,
      });
    }

    // Duplicate replay
    if (!r.duplicate_replay_counts) {
      push({ key: "dup", label: "Duplicate Replay", status: "incomplete", reason: "Missing." });
    } else {
      const over = Object.entries(r.duplicate_replay_counts).filter(([, v]) => (v ?? 0) > 1);
      push({
        key: "dup",
        label: "Duplicate Replay",
        status: over.length === 0 ? "pass" : "fail",
        reason: over.length === 0 ? "Still 1 per metric." : `Metrics with >1: ${over.map(([k]) => k).join(",")}`,
      });
    }

    // Channel 9
    if (typeof r.channel_9_count !== "number") {
      push({ key: "ch9", label: "Unmapped Channel 9", status: "incomplete", reason: "Missing count." });
    } else {
      push({
        key: "ch9",
        label: "Unmapped Channel 9",
        status: r.channel_9_count === 0 ? "pass" : "fail",
        reason: r.channel_9_count === 0 ? "0 rows from channel 9." : `${r.channel_9_count} rows leaked from channel 9.`,
      });
    }

    // Timestamp integrity
    const tsc = r.timestamp_source_counts;
    if (!tsc) {
      push({ key: "ts", label: "Timestamp Integrity", status: "incomplete", reason: "Missing." });
    } else {
      const onlyServer =
        (tsc.ecowitt_dateutc ?? 0) === 0 && (tsc.server_received_at ?? 0) > 0;
      const hasEcowitt = (tsc.ecowitt_dateutc ?? 0) > 0;
      push({
        key: "ts",
        label: "Timestamp Integrity",
        status: onlyServer ? "fail" : hasEcowitt ? "pass" : "incomplete",
        reason: onlyServer
          ? "Only server_received_at present — ecowitt_dateutc not honored."
          : hasEcowitt
            ? "ecowitt_dateutc present for canary rows."
            : "No timestamp_source counts provided.",
      });
    }

    // Secret safety
    const leakCount = (r.leak_scan_count ?? null) as number | null;
    const valLeak = (r.secret_value_leak_count ?? null) as number | null;
    const nullTs = (r.null_captured_at_count ?? null) as number | null;
    if (leakCount === null || valLeak === null || nullTs === null) {
      push({ key: "secrets", label: "Secret Safety", status: "incomplete", reason: "Missing leak/null counts." });
    } else {
      const ok = leakCount === 0 && valLeak === 0 && nullTs === 0;
      push({
        key: "secrets",
        label: "Secret Safety",
        status: ok ? "pass" : "fail",
        reason: ok
          ? "0 key-name leaks, 0 secret-value leaks, 0 null captured_at."
          : `leaks=${leakCount}, value_leaks=${valLeak}, null_captured_at=${nullTs}`,
      });
    }

    // VPD provenance
    const vpd = r.vpd_provenance;
    if (!vpd) {
      push({ key: "vpd", label: "VPD Provenance", status: "incomplete", reason: "Missing." });
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
        reason: ok ? "calculated=true; derived_from temp+humidity." : "vpd_kpa not provably derived from temp+humidity.",
      });
    }

    // Log safety
    push({
      key: "logs",
      label: "Log Safety",
      status:
        r.log_safety_status === "clean"
          ? args.logReviewed
            ? "pass"
            : "incomplete"
          : r.log_safety_status === "leaked"
            ? "fail"
            : "incomplete",
      reason:
        r.log_safety_status === "clean"
          ? args.logReviewed
            ? "Logs reviewed; no secrets found."
            : "Mark logs as reviewed to confirm."
          : r.log_safety_status === "leaked"
            ? "Secret found in logs."
            : "Log review not yet completed.",
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
    reason: verdict === "go" ? "All canary checks passed." : verdict === "no_go" ? "One or more hard failures." : "Awaiting evidence.",
  });

  return { verdict, cards, reasons };
}

// ----- report (download) ---------------------------------------------------

export function buildAuditReport(args: {
  tent: { id: string; name?: string | null } | null;
  endpoint?: string | null;
  preflight: PreflightResult | null;
  report: CanaryReportInput | null;
  verdict: VerdictResult;
}) {
  return {
    generated_at: new Date().toISOString(),
    tent: args.tent ? { id: args.tent.id, name: args.tent.name ?? null } : null,
    endpoint: args.endpoint ?? null,
    preflight: args.preflight,
    canary: args.report,
    verdict: args.verdict.verdict,
    cards: args.verdict.cards,
    reasons: args.verdict.reasons,
    safety_notes: [
      "Read-only diagnostics.",
      "No device control.",
      "No automation.",
      "No alerts written.",
      "No Action Queue writes.",
    ],
  };
}
