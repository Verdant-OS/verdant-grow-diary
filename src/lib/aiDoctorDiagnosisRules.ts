/**
 * aiDoctorDiagnosisRules — pure schema + validator/sanitizer for Verdant's
 * Structured AI Doctor v1.
 *
 * Strict safety envelope:
 *   - No I/O. No React. No Supabase. No fetch. No AI calls.
 *   - No alert persistence, Action Queue writes, automation, or device control.
 *   - All values are sanitized; outputs are deterministic and approval-first.
 *
 * Suggested actions are NEVER executable from this module. The caller (UI)
 * must require an explicit user click to enqueue an approval-required Action
 * Queue item — this helper only normalizes the AI Doctor's draft suggestions.
 */

export type DiagnosisRiskLevel = "low" | "medium" | "high";

export type DiagnosisSuggestedActionType = "task" | "alert" | "note";

export interface DiagnosisSuggestedAction {
  type: DiagnosisSuggestedActionType;
  title: string;
  detail: string;
  priority: "low" | "medium" | "high";
  reason: string;
  /** Always true — Verdant never auto-executes AI suggestions. */
  approvalRequired: true;
}

export interface DiagnosisFollowUp {
  /** Short follow-up window summary. */
  summary: string;
  /** Conservative observation/log checklist. */
  checklist: string[];
}

export interface Diagnosis {
  summary: string;
  likelyIssue: string | null;
  /** Clamped to [0, 1]. */
  confidence: number;
  evidence: string[];
  missingInformation: string[];
  possibleCauses: string[];
  immediateAction: string | null;
  whatNotToDo: string[];
  followUp24h: DiagnosisFollowUp;
  recoveryPlan3d: DiagnosisFollowUp;
  riskLevel: DiagnosisRiskLevel;
  /** Max 2 entries, always approval-required. */
  suggestedActions: DiagnosisSuggestedAction[];
}

export interface SanitizeReport {
  /** Sanitized diagnosis, or null when input was unrecoverably malformed. */
  diagnosis: Diagnosis | null;
  /** Human-readable notes about what was clamped/stripped/coerced. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_SUGGESTED_ACTIONS = 2;
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

/** Approval-required helper copy shown alongside every suggestion. */
export const SUGGESTION_APPROVAL_COPY =
  "AI suggestion — requires your approval.";

/** Global safety helper copy for the diagnosis surface. */
export const DIAGNOSIS_SAFETY_COPY =
  "AI suggestions are drafts. Review and approve before acting. Verdant never sends commands to equipment.";

/** Default cautious fallback used when the model returns unparseable output. */
export const CAUTIOUS_FALLBACK: Diagnosis = {
  summary:
    "AI Doctor could not produce a structured diagnosis from the available context. Add a fresh photo, note, or sensor snapshot and try again.",
  likelyIssue: null,
  confidence: 0,
  evidence: [],
  missingInformation: [
    "Recent diary entry, photo, or sensor snapshot is missing.",
  ],
  possibleCauses: [],
  immediateAction: null,
  whatNotToDo: [
    "Do not make irreversible changes (heavy defoliation, aggressive feeding, transplant) without more evidence.",
  ],
  followUp24h: {
    summary: "Log one observation in the next 24 hours.",
    checklist: ["Add a note or photo", "Capture a sensor snapshot"],
  },
  recoveryPlan3d: {
    summary: "Build a small baseline over the next 3 days before changing inputs.",
    checklist: ["Daily note", "Daily photo", "Watering log"],
  },
  riskLevel: "low",
  suggestedActions: [],
};

// ---------------------------------------------------------------------------
// Forbidden language — device control + over-promising claims
// ---------------------------------------------------------------------------

/**
 * Phrases that imply Verdant or AI will physically actuate equipment.
 * Matching suggestions are dropped; matches inside free text are redacted.
 */
const DEVICE_CONTROL_PATTERNS: RegExp[] = [
  /\bturn (on|off)\b/i,
  /\bswitch (on|off)\b/i,
  /\bpower (on|off|down|up)\b/i,
  /\bauto[-\s]?(start|stop|on|off|run|toggle)\b/i,
  /\bautomate\b/i,
  /\bautomatically (run|adjust|set|switch|start|stop)\b/i,
  /\bsend (a )?command\b/i,
  /\bactuate\b/i,
  /\brelay\b/i,
  /\bmqtt\b/i,
  /\bhome[-\s]?assistant\b/i,
  /\bpi[-\s]?bridge\b/i,
  /\bsmart plug\b/i,
  /\bcontrol (the )?(fan|light|pump|heater|humidifier|dehumidifier|valve)\b/i,
];

/** Phrases that over-promise recovery, yield, or certainty. */
const OVER_PROMISE_PATTERNS: RegExp[] = [
  /\bguarantee(d|s)?\b/i,
  /\bdefinitely\b/i,
  /\bwill (fully )?recover\b/i,
  /\bfull recovery\b/i,
  /\bmaximize? (your )?yield\b/i,
  /\bguaranteed yield\b/i,
  /\b(100%|hundred percent) (sure|certain|safe)\b/i,
];

function containsDeviceControl(text: string): boolean {
  return DEVICE_CONTROL_PATTERNS.some((re) => re.test(text));
}

function stripOverPromises(text: string): string {
  let out = text;
  for (const re of OVER_PROMISE_PATTERNS) {
    out = out.replace(re, "[removed: over-promising language]");
  }
  return out;
}

function redactDeviceControl(text: string): string {
  let out = text;
  for (const re of DEVICE_CONTROL_PATTERNS) {
    out = out.replace(re, "[removed: device-control language]");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small coercion helpers
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asTrimmedString(v: unknown, max = 600): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

function asStringArray(v: unknown, maxItems = 8, maxLen = 400): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = asTrimmedString(item, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function clampConfidence(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function coerceRiskLevel(v: unknown): DiagnosisRiskLevel {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "low";
}

function coercePriority(v: unknown): "low" | "medium" | "high" {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "low";
}

function coerceActionType(v: unknown): DiagnosisSuggestedActionType {
  if (v === "task" || v === "alert" || v === "note") return v;
  return "note";
}

function coerceFollowUp(v: unknown, defaults: DiagnosisFollowUp): DiagnosisFollowUp {
  if (typeof v === "string") {
    const summary = asTrimmedString(v, 400);
    if (summary) return { summary: redactDeviceControl(stripOverPromises(summary)), checklist: [] };
    return defaults;
  }
  if (!isObject(v)) return defaults;
  const summary =
    asTrimmedString(v.summary, 400) ?? defaults.summary;
  const checklist = asStringArray(v.checklist, 6, 200).map((s) =>
    redactDeviceControl(stripOverPromises(s)),
  );
  return {
    summary: redactDeviceControl(stripOverPromises(summary)),
    checklist,
  };
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

/**
 * Validate + sanitize a raw model-produced diagnosis object.
 *
 * Hard guarantees on the returned `diagnosis`:
 *   - `confidence` is a finite number in `[0, 1]`.
 *   - `suggestedActions.length <= MAX_SUGGESTED_ACTIONS`.
 *   - Every `suggestedActions[i].approvalRequired === true`.
 *   - Device-control language is stripped from every text field and any
 *     suggested action whose `title`/`detail`/`reason` includes it is dropped.
 *   - Over-promising recovery/yield claims are redacted.
 *   - When confidence is below `LOW_CONFIDENCE_THRESHOLD`, `missingInformation`
 *     is non-empty (a cautious default is injected if needed).
 *   - Unrecoverably malformed input returns `{ diagnosis: CAUTIOUS_FALLBACK }`.
 */
export function validateAndSanitizeDiagnosis(input: unknown): SanitizeReport {
  const notes: string[] = [];

  if (!isObject(input)) {
    return {
      diagnosis: CAUTIOUS_FALLBACK,
      notes: ["Input was not an object; using cautious fallback."],
    };
  }

  const summary =
    asTrimmedString(input.summary, 600) ?? CAUTIOUS_FALLBACK.summary;
  const likelyIssue = asTrimmedString(input.likelyIssue, 200);

  const rawConfidence = (input as { confidence?: unknown }).confidence;
  const confidence = clampConfidence(rawConfidence);
  if (
    typeof rawConfidence === "number" &&
    Number.isFinite(rawConfidence) &&
    (rawConfidence < 0 || rawConfidence > 1)
  ) {
    notes.push("Confidence clamped to [0, 1].");
  }

  const evidence = asStringArray(input.evidence, 12, 400).map((s) =>
    redactDeviceControl(stripOverPromises(s)),
  );

  let missingInformation = asStringArray(input.missingInformation, 12, 400).map(
    (s) => stripOverPromises(s),
  );

  const possibleCauses = asStringArray(input.possibleCauses, 10, 400).map((s) =>
    redactDeviceControl(stripOverPromises(s)),
  );

  let immediateAction = asTrimmedString(input.immediateAction, 400);
  if (immediateAction && containsDeviceControl(immediateAction)) {
    notes.push(
      "Immediate action contained device-control language; replaced with null.",
    );
    immediateAction = null;
  }
  if (immediateAction) {
    immediateAction = stripOverPromises(immediateAction);
  }

  const whatNotToDo = asStringArray(input.whatNotToDo, 10, 400).map((s) =>
    stripOverPromises(s),
  );

  const followUp24h = coerceFollowUp(
    input.followUp24h,
    CAUTIOUS_FALLBACK.followUp24h,
  );
  const recoveryPlan3d = coerceFollowUp(
    input.recoveryPlan3d,
    CAUTIOUS_FALLBACK.recoveryPlan3d,
  );

  const riskLevel = coerceRiskLevel(input.riskLevel);

  // ---- Suggested actions ---------------------------------------------------
  const rawActions = Array.isArray(input.suggestedActions)
    ? input.suggestedActions
    : [];
  const sanitizedActions: DiagnosisSuggestedAction[] = [];
  let droppedForDeviceControl = 0;
  for (const raw of rawActions) {
    if (sanitizedActions.length >= MAX_SUGGESTED_ACTIONS) break;
    if (!isObject(raw)) continue;
    const title = asTrimmedString(raw.title, 120);
    const detail = asTrimmedString(raw.detail, 400);
    const reason = asTrimmedString(raw.reason, 400);
    if (!title || !detail) continue;
    const blob = `${title} ${detail} ${reason ?? ""}`;
    if (containsDeviceControl(blob)) {
      droppedForDeviceControl += 1;
      continue;
    }
    sanitizedActions.push({
      type: coerceActionType(raw.type),
      title: stripOverPromises(title),
      detail: stripOverPromises(detail),
      priority: coercePriority(raw.priority),
      reason: stripOverPromises(reason ?? ""),
      approvalRequired: true,
    });
  }
  if (Array.isArray(input.suggestedActions) && input.suggestedActions.length > MAX_SUGGESTED_ACTIONS) {
    notes.push(
      `Suggested actions trimmed from ${input.suggestedActions.length} to ${MAX_SUGGESTED_ACTIONS}.`,
    );
  }
  if (droppedForDeviceControl > 0) {
    notes.push(
      `${droppedForDeviceControl} suggested action(s) dropped for device-control language.`,
    );
  }

  // ---- Low-confidence guard -----------------------------------------------
  if (confidence < LOW_CONFIDENCE_THRESHOLD && missingInformation.length === 0) {
    missingInformation = [
      "Evidence is limited — add a fresh photo, recent diary note, or sensor snapshot before acting.",
    ];
    notes.push("Low confidence: injected default missing-information note.");
  }

  return {
    diagnosis: {
      summary: redactDeviceControl(stripOverPromises(summary)),
      likelyIssue: likelyIssue ? stripOverPromises(likelyIssue) : null,
      confidence,
      evidence,
      missingInformation,
      possibleCauses,
      immediateAction,
      whatNotToDo,
      followUp24h,
      recoveryPlan3d,
      riskLevel,
      suggestedActions: sanitizedActions,
    },
    notes,
  };
}

/** Convenience: returns true when the sanitized diagnosis has any actionable signal. */
export function hasUsefulDiagnosis(d: Diagnosis | null | undefined): boolean {
  if (!d) return false;
  return (
    !!d.likelyIssue ||
    d.evidence.length > 0 ||
    d.possibleCauses.length > 0 ||
    !!d.immediateAction ||
    d.suggestedActions.length > 0
  );
}
