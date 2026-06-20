/**
 * EcoWitt Live Bring-Up — pure deterministic view model.
 *
 * Provides a static operator checklist, manual commands, evidence fields,
 * GO/NO-GO rules, and source-truth warnings used to validate real
 * EcoWitt / MQTT → Verdant ingest by hand. Does NOT query sensors, call
 * Supabase, write data, create alerts, create Action Queue items, run a
 * model, or perform any device control.
 *
 * The default overall_status is intentionally "blocked": live proof remains
 * blocked until the grower physically compares EcoWitt/controller readings
 * against backend evidence (step 8).
 */

export type EcowittBringupStatus = "blocked" | "partial" | "ready" | "mismatch";

export interface EcowittBringupStep {
  readonly id: string;
  readonly label: string;
  readonly status: EcowittBringupStatus;
  readonly operator_action: string;
  readonly expected_evidence: string;
  readonly success_criteria: string;
  readonly blocked_if: string;
  readonly safety_notes: string;
}

export interface EcowittBringupCommand {
  readonly id: string;
  readonly label: string;
  readonly environment: string;
  readonly command: string;
  readonly purpose: string;
  readonly safety_note: string;
}

export interface EcowittEvidenceField {
  readonly id: string;
  readonly label: string;
  readonly example: string;
  readonly required_for_ready: boolean;
  readonly why_it_matters: string;
}

export interface EcowittGoNoGoRule {
  readonly id: string;
  readonly status: EcowittBringupStatus;
  readonly label: string;
  readonly criteria: readonly string[];
  readonly operator_decision: string;
}

export interface EcowittLiveBringupViewModel {
  readonly title: string;
  readonly subtitle: string;
  readonly badges: readonly string[];
  readonly overall_status: EcowittBringupStatus;
  readonly top_note: string;
  readonly steps: readonly EcowittBringupStep[];
  readonly commands: readonly EcowittBringupCommand[];
  readonly evidence_fields: readonly EcowittEvidenceField[];
  readonly go_no_go_rules: readonly EcowittGoNoGoRule[];
  readonly source_truth_warnings: readonly string[];
  readonly tonight_notes: readonly string[];
  readonly generated_at: string;
}

const STEPS: readonly EcowittBringupStep[] = Object.freeze([
  {
    id: "mosquitto-running",
    label: "Confirm Mosquitto broker is running",
    status: "blocked",
    operator_action:
      "Start the local Mosquitto broker in verbose mode in its own terminal.",
    expected_evidence:
      "Verbose broker log shows listener bound on the expected port and ready to accept client connections.",
    success_criteria:
      "Broker prints 'mosquitto version ... starting' and 'Opening ... listen socket on port'.",
    blocked_if:
      "Broker process is not running, port is in use, or no listener is bound.",
    safety_notes:
      "Broker logs may include client IPs. Do not share screenshots that reveal home network details.",
  },
  {
    id: "ecowitt-app-diy",
    label: "Confirm EcoWitt app DIY/upload settings",
    status: "blocked",
    operator_action:
      "Open the EcoWitt mobile app and verify DIY/custom upload is enabled and points at the local listener or bridge.",
    expected_evidence:
      "App screenshot showing DIY/custom server URL, path, and upload interval.",
    success_criteria:
      "App shows upload destination matching the operator's listener and a recent upload timestamp.",
    blocked_if:
      "DIY upload is disabled, points at a stale URL, or has not uploaded recently.",
    safety_notes:
      "Screenshots may contain WAN IPs or tokens. Redact secrets before sharing.",
  },
  {
    id: "listener-reachable",
    label: "Confirm listener or bridge is reachable",
    status: "blocked",
    operator_action:
      "From the operator workstation, verify the listener/bridge endpoint responds on the LAN.",
    expected_evidence:
      "Local health endpoint or TCP connect returns a 2xx / open-socket response.",
    success_criteria:
      "Listener responds within a reasonable LAN latency window.",
    blocked_if:
      "Endpoint is unreachable, firewalled, or returns a non-2xx status.",
    safety_notes:
      "Do not expose the listener to the public internet during bring-up.",
  },
  {
    id: "mqtt-subscribe",
    label: "Subscribe to MQTT topic",
    status: "blocked",
    operator_action:
      "Open a second terminal and subscribe to the EcoWitt MQTT topic tree.",
    expected_evidence:
      "Subscriber prints retained or live messages with EcoWitt payload keys.",
    success_criteria:
      "Subscriber shows at least one raw payload arriving from the broker.",
    blocked_if:
      "No messages appear within a reasonable wait window or auth is rejected.",
    safety_notes:
      "Raw payloads can include MAC addresses. Treat as private network data.",
  },
  {
    id: "local-valid-payload",
    label: "Send a valid local test payload",
    status: "blocked",
    operator_action:
      "Use the local sender script to publish a known-valid EcoWitt-shaped payload.",
    expected_evidence:
      "Subscriber sees the payload; backend log shows an accepted normalization.",
    success_criteria:
      "Backend records the payload with source label 'live' or 'manual' as appropriate and a present captured_at.",
    blocked_if:
      "Backend rejects a valid payload or no record appears.",
    safety_notes:
      "Use the bundled fixture payload only. Do not paste live secrets into test data.",
  },
  {
    id: "local-invalid-payload",
    label: "Send an invalid local test payload",
    status: "blocked",
    operator_action:
      "Use the local sender script with the invalid fixture to publish a malformed payload.",
    expected_evidence:
      "Backend logs show a rejection with a clear validation reason.",
    success_criteria:
      "Backend refuses the payload and does not classify it as healthy or live.",
    blocked_if:
      "Backend silently accepts a malformed payload or stores it as healthy.",
    safety_notes:
      "Confirm rejection does not still produce an alert or Action Queue suggestion.",
  },
  {
    id: "backend-accept-reject",
    label: "Check backend accept/reject evidence",
    status: "blocked",
    operator_action:
      "Review backend ingest logs or the operator inspector for the two prior payloads.",
    expected_evidence:
      "Two log entries: one accepted with normalized fields, one rejected with reason.",
    success_criteria:
      "Accept/reject behavior matches the operator's expectation for each payload.",
    blocked_if:
      "Backend evidence is missing, ambiguous, or contradicts the local sender.",
    safety_notes:
      "Do not paste log excerpts containing tokens, MAC addresses, or WAN IPs.",
  },
  {
    id: "controller-vs-backend",
    label: "Compare EcoWitt/controller display against backend values",
    status: "blocked",
    operator_action:
      "Read the live values shown on the physical EcoWitt controller and EcoWitt app, then compare each one against the backend's normalized/stored value for the same captured_at.",
    expected_evidence:
      "Side-by-side notes or screenshots: controller value, app value, backend normalized value, backend stored value, captured_at, source label.",
    success_criteria:
      "Each metric matches within a small tolerance; units agree; captured_at is recent; no metric is suspiciously stuck at 0 or 100.",
    blocked_if:
      "Operator is not physically near the tent, or controller/app readings are not available to compare against backend evidence.",
    safety_notes:
      "Without this real device comparison, the loop is not provably live. Do not mark live proof as ready from local sender evidence alone.",
  },
  {
    id: "go-no-go",
    label: "Decide GO/NO-GO",
    status: "blocked",
    operator_action:
      "Walk through the GO/NO-GO rules below and choose the matching status. Record the decision off-platform for now.",
    expected_evidence:
      "A written GO, NO-GO, or HOLD note tied to the captured_at window reviewed above.",
    success_criteria:
      "Decision is recorded with the evidence that supports it.",
    blocked_if:
      "Any required evidence field above is missing or ambiguous.",
    safety_notes:
      "Grower approval remains required for any future action. No automation or device control flows from this page.",
  },
]);

const COMMANDS: readonly EcowittBringupCommand[] = Object.freeze([
  {
    id: "mosquitto-verbose",
    label: "Mosquitto verbose broker",
    environment: "Operator workstation (PowerShell)",
    command: '& "C:\\Program Files\\mosquitto\\mosquitto.exe" -v',
    purpose: "Start the local MQTT broker with verbose logging.",
    safety_note:
      "Verbose logs may include client IPs. Keep the terminal local to the operator.",
  },
  {
    id: "mqtt-subscribe",
    label: "MQTT subscribe to EcoWitt topics",
    environment: "Operator workstation (any shell)",
    command: 'mosquitto_sub -t "ecowitt/#" -v',
    purpose: "Watch raw EcoWitt messages flowing through the broker.",
    safety_note:
      "Payloads may contain MAC addresses. Treat as private network data.",
  },
  {
    id: "local-sender-valid",
    label: "Local sender — valid payload",
    environment: "Repository root",
    command: "bun run dev:send-ecowitt",
    purpose:
      "Publish a known-valid EcoWitt-shaped fixture to the broker for end-to-end checks.",
    safety_note:
      "Fixture payload only. Do not embed live tokens or production data.",
  },
  {
    id: "local-sender-invalid",
    label: "Local sender — invalid payload",
    environment: "Repository root",
    command: "bun run dev:send-ecowitt:invalid",
    purpose:
      "Publish a malformed payload to confirm the backend rejects it cleanly.",
    safety_note:
      "Rejection must not produce an alert or Action Queue suggestion.",
  },
  {
    id: "edge-function-serve",
    label: "Local Edge Function serve (sensor ingest webhook)",
    environment: "Repository root",
    command: "supabase functions serve sensor-ingest-webhook",
    purpose:
      "Serve the ingest webhook locally so the bridge can target a local URL.",
    safety_note:
      "Local-only. Do not expose this port publicly. Tokens are loaded from local env files outside this page's scope.",
  },
  {
    id: "health-check",
    label: "Local listener health check",
    environment: "Operator workstation",
    command: "curl http://localhost:8787/health",
    purpose: "Confirm the local listener is up before sending payloads.",
    safety_note:
      "If this returns non-2xx, do not proceed with payload sends.",
  },
]);

const EVIDENCE_FIELDS: readonly EcowittEvidenceField[] = Object.freeze([
  {
    id: "ecowitt-app-temperature",
    label: "EcoWitt app/controller temperature",
    example: "24.7 °C",
    required_for_ready: true,
    why_it_matters:
      "Anchors the live comparison. Backend reading must match within tolerance and units.",
  },
  {
    id: "ecowitt-app-humidity",
    label: "EcoWitt app/controller humidity",
    example: "58 %RH",
    required_for_ready: true,
    why_it_matters:
      "Humidity stuck at 0 or 100 is a sensor failure, never a healthy reading.",
  },
  {
    id: "ecowitt-app-soil-moisture",
    label: "EcoWitt app/controller soil moisture (if available)",
    example: "32 %VWC",
    required_for_ready: false,
    why_it_matters:
      "Soil moisture stuck at 0 or 100 is a sensor failure. Required for soil-equipped tents.",
  },
  {
    id: "ecowitt-app-co2",
    label: "EcoWitt app/controller CO2 (if available)",
    example: "820 ppm",
    required_for_ready: false,
    why_it_matters: "Out-of-range CO2 must be flagged, not normalized away.",
  },
  {
    id: "mqtt-raw-timestamp",
    label: "MQTT raw payload timestamp",
    example: "2026-06-09T22:14:03Z",
    required_for_ready: true,
    why_it_matters:
      "Timestamp anchors captured_at. Stale payloads must not display as current.",
  },
  {
    id: "mqtt-raw-values",
    label: "MQTT raw payload values",
    example: "tempc=24.7, humidity=58, soilmoisture1=32",
    required_for_ready: true,
    why_it_matters:
      "Raw values are the ground truth against which normalization is checked.",
  },
  {
    id: "normalized-payload",
    label: "Normalized backend payload",
    example: "{ temperature_c: 24.7, humidity_pct: 58, ... }",
    required_for_ready: true,
    why_it_matters:
      "Normalization must preserve units. Celsius/Fahrenheit or µS/cm vs mS/cm drift is a mismatch.",
  },
  {
    id: "accept-reject-result",
    label: "Backend accept/reject result",
    example: "accepted (id=...) | rejected: reason=schema_invalid",
    required_for_ready: true,
    why_it_matters:
      "Operators must see explicit accept or reject — silent acceptance of bad data is forbidden.",
  },
  {
    id: "stored-source-label",
    label: "Backend stored source label",
    example: "live | manual | csv | demo | stale | invalid",
    required_for_ready: true,
    why_it_matters:
      "Source label must never default to 'live' for demo, CSV, or local sender data.",
  },
  {
    id: "backend-captured-at",
    label: "Backend captured_at",
    example: "2026-06-09T22:14:03Z",
    required_for_ready: true,
    why_it_matters:
      "Captured_at must match the payload timestamp and be recent enough to be current.",
  },
  {
    id: "backend-confidence",
    label: "Backend confidence",
    example: "0.0 – 1.0",
    required_for_ready: true,
    why_it_matters:
      "Confidence is required context for AI Doctor; missing confidence is a bring-up gap.",
  },
  {
    id: "tent-id-present",
    label: "Tent ID present",
    example: "tent_abc123",
    required_for_ready: true,
    why_it_matters:
      "Readings without a tent are not actionable and must not be silently dropped.",
  },
  {
    id: "plant-id-present",
    label: "Plant ID present (when relevant)",
    example: "plant_xyz789",
    required_for_ready: false,
    why_it_matters:
      "Plant-scoped sensors must carry a plant_id to power AI Doctor context.",
  },
  {
    id: "operator-screenshot",
    label: "Operator screenshot/photo note",
    example: "controller_24.7C.png; redact MAC/WAN/tokens",
    required_for_ready: false,
    why_it_matters:
      "Screenshots are the durable artifact of tonight's check. Do not include private tokens.",
  },
]);

const GO_NO_GO_RULES: readonly EcowittGoNoGoRule[] = Object.freeze([
  {
    id: "blocked",
    status: "blocked",
    label: "BLOCKED — do not call live",
    criteria: Object.freeze([
      "No real device comparison evidence is available.",
      "Backend evidence is missing for the captured_at window.",
      "Required evidence values are missing.",
      "Timestamps are stale relative to wall-clock.",
    ]),
    operator_decision:
      "Hold. Do not describe the loop as live. Resume after the grower is physically able to compare readings.",
  },
  {
    id: "partial",
    status: "partial",
    label: "PARTIAL — bring-up in progress",
    criteria: Object.freeze([
      "MQTT broker and local sender work end-to-end.",
      "Backend accepts a valid payload and rejects an invalid one.",
      "Real device/controller comparison is still missing.",
    ]),
    operator_decision:
      "Continue the checklist. Do not mark live proof complete until step 8 has real device evidence.",
  },
  {
    id: "ready",
    status: "ready",
    label: "READY — live proof candidate",
    criteria: Object.freeze([
      "Real EcoWitt/controller values match backend normalized and stored values within tolerance.",
      "captured_at is recent and consistent with the payload timestamp.",
      "Source label, captured_at, and confidence are present.",
      "No unit mismatch (C/F, µS/cm vs mS/cm) is detected.",
    ]),
    operator_decision:
      "Record GO with linked evidence. Live proof claim remains scoped to the captured_at window reviewed.",
  },
  {
    id: "mismatch",
    status: "mismatch",
    label: "MISMATCH — investigate before retry",
    criteria: Object.freeze([
      "Controller/app values disagree with backend values beyond tolerance.",
      "Units are wrong (Celsius shown as Fahrenheit, µS/cm shown as mS/cm).",
      "Stale or invalid data appears current.",
      "Humidity or soil moisture is stuck at 0 or 100.",
    ]),
    operator_decision:
      "Record NO-GO. Investigate normalization, units, and source labelling before another bring-up attempt.",
  },
]);

const SOURCE_TRUTH_WARNINGS: readonly string[] = Object.freeze([
  "Do not call data live until real device/controller values are compared against backend evidence.",
  "Demo, manual, and local sender evidence is not live proof.",
  "Stale readings must not be described as current.",
  "Invalid readings must not be described as healthy.",
  "Celsius/Fahrenheit and µS/cm vs mS/cm mismatches must block readiness.",
  "Humidity or soil moisture stuck at 0 or 100 must block readiness.",
  "pH outside a realistic range must be treated as invalid.",
  "No alerts or Action Queue suggestions should be created from unverified telemetry.",
  "Grower approval remains required for any future action.",
]);

const TONIGHT_NOTES: readonly string[] = Object.freeze([
  "This page is a checklist surface only — no readings are stored here.",
  "Capture evidence off-platform tonight (notes/screenshots). Redact secrets and network identifiers.",
  "Live proof remains blocked until the grower is physically present to compare controller readings against backend evidence.",
  "If any GO/NO-GO criterion is unmet, record HOLD and continue tomorrow.",
]);

const BADGES: readonly string[] = Object.freeze([
  "Operator checklist",
  "Read-only",
  "No live data queries",
  "No database writes",
  "No model calls",
  "No device control",
]);

function resolveGeneratedAt(now?: string | Date): string {
  if (now === undefined) return "static";
  if (typeof now === "string") return now;
  return now.toISOString();
}

export function buildEcowittLiveBringupViewModel(
  now?: string | Date,
): EcowittLiveBringupViewModel {
  const vm: EcowittLiveBringupViewModel = {
    title: "EcoWitt Live Bring-Up",
    subtitle:
      "Operator checklist for tonight's manual validation of EcoWitt / MQTT → Verdant ingest.",
    badges: BADGES,
    overall_status: "blocked",
    top_note:
      "This page prepares tonight's validation. It does not query sensors, prove live data, write readings, create alerts, create Action Queue items, or perform actions.",
    steps: STEPS,
    commands: COMMANDS,
    evidence_fields: EVIDENCE_FIELDS,
    go_no_go_rules: GO_NO_GO_RULES,
    source_truth_warnings: SOURCE_TRUTH_WARNINGS,
    tonight_notes: TONIGHT_NOTES,
    generated_at: resolveGeneratedAt(now),
  };
  return Object.freeze(vm);
}

export const ECOWITT_BRINGUP_STEP_IDS: readonly string[] = STEPS.map(
  (s) => s.id,
);
export const ECOWITT_BRINGUP_COMMAND_IDS: readonly string[] = COMMANDS.map(
  (c) => c.id,
);
export const ECOWITT_BRINGUP_EVIDENCE_IDS: readonly string[] =
  EVIDENCE_FIELDS.map((e) => e.id);
export const ECOWITT_BRINGUP_GO_NO_GO_IDS: readonly string[] =
  GO_NO_GO_RULES.map((r) => r.id);
