/**
 * EcoWitt Real Ingest — Phase 1.5 parity fixtures.
 *
 * Test-only data. No runtime imports from production code, no secrets,
 * no real device identifiers, no real tokens. Drives future parity
 * tests between `src/lib/ecowittRealIngest*` and any eventual
 * `supabase/functions/_shared/ecowittRealIngest*` mirror.
 *
 * UUIDs use the all-`1`s / all-`2`s pattern already used by Phase 0
 * validator tests so fixtures remain visibly synthetic. The "sensitive"
 * raw_payload fields below are obvious dummies, kept ONLY so the
 * redaction parity check has something to mask.
 */

export interface PhaseOneFixture {
  /** Stable, human-readable id for assertion messages. */
  id: string;
  /** What this fixture is supposed to demonstrate. */
  description: string;
  /** Injected reference time used by the validator/handler. */
  reference_time: string;
  freshness_window_ms: number;
  payload: Record<string, unknown>;
  /** Expected endpoint status (string), not an HTTP code. */
  expected_status:
    | "accepted_candidate"
    | "rejected_candidate";
  /** Subset of expected blocked-reason codes. Empty for accepted. */
  expected_blocked_reasons_subset: string[];
  /** Strings that MUST NOT appear anywhere in the serialized response. */
  must_not_appear_in_response: string[];
}

const REF = "2026-06-04T12:00:00.000Z";
const FRESH_MS = 5 * 60 * 1000;

const FAKE_UUID_TENT = "11111111-1111-4111-8111-111111111111";
const FAKE_UUID_PLANT = "22222222-2222-4222-8222-222222222222";

/** Strings used only inside fixture raw_payload to prove redaction works. */
export const FIXTURE_DUMMY_SENSITIVE_STRINGS = {
  passkey: "DUMMY-PASSKEY-DO-NOT-USE",
  mac: "00:11:22:33:44:55",
  ip: "10.0.0.250",
  station: "FixtureStation-A",
  gateway: "fixture-gateway-001",
} as const;

const sensitiveRawPayload = () => ({
  passkey: FIXTURE_DUMMY_SENSITIVE_STRINGS.passkey,
  mac: FIXTURE_DUMMY_SENSITIVE_STRINGS.mac,
  ip: FIXTURE_DUMMY_SENSITIVE_STRINGS.ip,
  station: FIXTURE_DUMMY_SENSITIVE_STRINGS.station,
  nested: { gateway: FIXTURE_DUMMY_SENSITIVE_STRINGS.gateway, safe_inner: "ok" },
  safe_top: "fine",
});

export const PHASE_ONE_FIXTURES: PhaseOneFixture[] = [
  {
    id: "valid_live_candidate",
    description: "Fresh, live, UUID-bound candidate with required metrics.",
    reference_time: REF,
    freshness_window_ms: FRESH_MS,
    payload: {
      tent_id: FAKE_UUID_TENT,
      plant_id: FAKE_UUID_PLANT,
      source: "live",
      captured_at: "2026-06-04T11:59:30.000Z",
      device_identity: "FIXTURE-DEVICE-AAAA",
      source_identity: "fixture-cloud",
      confidence: "high",
      readings: { air_temp_f: 75, humidity_pct: 55, vpd_kpa: 1.1 },
      raw_payload: sensitiveRawPayload(),
    },
    expected_status: "accepted_candidate",
    expected_blocked_reasons_subset: [],
    must_not_appear_in_response: Object.values(FIXTURE_DUMMY_SENSITIVE_STRINGS),
  },
  {
    id: "rejected_manual_candidate",
    description: "Source 'manual' must never be upgraded to live ingest.",
    reference_time: REF,
    freshness_window_ms: FRESH_MS,
    payload: {
      tent_id: FAKE_UUID_TENT,
      plant_id: FAKE_UUID_PLANT,
      source: "manual",
      captured_at: "2026-06-04T11:59:30.000Z",
      device_identity: "FIXTURE-DEVICE-AAAA",
      source_identity: "fixture-cloud",
      readings: { air_temp_f: 75, humidity_pct: 55 },
      raw_payload: sensitiveRawPayload(),
    },
    expected_status: "rejected_candidate",
    expected_blocked_reasons_subset: ["source_not_live"],
    must_not_appear_in_response: Object.values(FIXTURE_DUMMY_SENSITIVE_STRINGS),
  },
  {
    id: "stale_candidate",
    description: "captured_at older than freshness window must reject.",
    reference_time: REF,
    freshness_window_ms: FRESH_MS,
    payload: {
      tent_id: FAKE_UUID_TENT,
      plant_id: FAKE_UUID_PLANT,
      source: "live",
      captured_at: "2026-06-04T11:00:00.000Z",
      device_identity: "FIXTURE-DEVICE-AAAA",
      source_identity: "fixture-cloud",
      readings: { air_temp_f: 75, humidity_pct: 55 },
      raw_payload: sensitiveRawPayload(),
    },
    expected_status: "rejected_candidate",
    expected_blocked_reasons_subset: ["stale_snapshot"],
    must_not_appear_in_response: Object.values(FIXTURE_DUMMY_SENSITIVE_STRINGS),
  },
  {
    id: "non_uuid_tent_id",
    description: "Placeholder / non-UUID tent_id must reject.",
    reference_time: REF,
    freshness_window_ms: FRESH_MS,
    payload: {
      tent_id: "demo-tent",
      source: "live",
      captured_at: "2026-06-04T11:59:30.000Z",
      device_identity: "FIXTURE-DEVICE-AAAA",
      source_identity: "fixture-cloud",
      readings: { air_temp_f: 75, humidity_pct: 55 },
      raw_payload: sensitiveRawPayload(),
    },
    expected_status: "rejected_candidate",
    expected_blocked_reasons_subset: ["non_uuid_tent_id"],
    must_not_appear_in_response: Object.values(FIXTURE_DUMMY_SENSITIVE_STRINGS),
  },
];

/** Fake UUIDs the fixtures are allowed to use. */
export const FIXTURE_ALLOWED_UUIDS: readonly string[] = [
  FAKE_UUID_TENT,
  FAKE_UUID_PLANT,
];
