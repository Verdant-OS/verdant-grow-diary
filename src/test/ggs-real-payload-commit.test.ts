import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: state.invoke,
    },
  },
}));

import { commitGgsRealPayload, GGS_REAL_PAYLOAD_COMMIT_FUNCTION } from "@/lib/ggsRealPayloadCommit";

const TENT_ID = "33333333-3333-4333-8333-333333333333";
const BRIDGE_ID = "55555555-5555-4555-8555-555555555555";
const PAYLOAD_TEXT = JSON.stringify({
  timestamp: "2026-07-25T11:59:00.000Z",
  sensor_id: "GGS-PROBE-001",
  tent_id: TENT_ID,
  soil_moisture_pct: 42.5,
  soil_temp_c: 22.3,
  soil_ec: 1.6,
});

function args() {
  return {
    tentId: TENT_ID,
    bridgeId: BRIDGE_ID,
    deviceId: " GGS-PROBE-001 ",
    payloadText: PAYLOAD_TEXT,
    attested: true,
  };
}

describe("commitGgsRealPayload browser boundary", () => {
  beforeEach(() => {
    state.invoke.mockReset();
  });

  it("invokes the dedicated Edge boundary without client identity or rows", async () => {
    state.invoke.mockResolvedValue({
      data: { ok: true, inserted: 3, rejected: 0 },
      error: null,
    });

    await expect(commitGgsRealPayload(args())).resolves.toEqual({
      ok: true,
      inserted: 3,
      rejected: 0,
    });
    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.invoke).toHaveBeenCalledWith(GGS_REAL_PAYLOAD_COMMIT_FUNCTION, {
      body: {
        tentId: TENT_ID,
        bridgeId: BRIDGE_ID,
        deviceId: "GGS-PROBE-001",
        payload: JSON.parse(PAYLOAD_TEXT),
        attested: true,
      },
    });
    const sent = state.invoke.mock.calls[0][1].body;
    expect(sent).not.toHaveProperty("userId");
    expect(sent).not.toHaveProperty("rows");
  });

  it.each([
    { tentId: "not-a-uuid" },
    { bridgeId: "not-a-uuid" },
    { deviceId: " " },
    { payloadText: "{" },
    { payloadText: "[]" },
  ])("fails locally for invalid request %#", async (override) => {
    await expect(commitGgsRealPayload({ ...args(), ...override })).resolves.toEqual({
      ok: false,
      reason: "invalid_request",
    });
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it("requires attestation locally", async () => {
    await expect(commitGgsRealPayload({ ...args(), attested: false })).resolves.toEqual({
      ok: false,
      reason: "attestation_required",
    });
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it("never surfaces transport error details", async () => {
    state.invoke.mockResolvedValue({
      data: null,
      error: { message: "service role secret and SQL detail" },
    });
    await expect(commitGgsRealPayload(args())).resolves.toEqual({
      ok: false,
      reason: "commit_unavailable",
    });
  });

  it("passes only allowlisted server reason codes", async () => {
    state.invoke.mockResolvedValue({
      data: { error: "bridge_forbidden", detail: "private detail" },
      error: null,
    });
    await expect(commitGgsRealPayload(args())).resolves.toEqual({
      ok: false,
      reason: "bridge_forbidden",
    });

    state.invoke.mockResolvedValue({
      data: { error: "payload_too_large" },
      error: null,
    });
    await expect(commitGgsRealPayload(args())).resolves.toEqual({
      ok: false,
      reason: "payload_too_large",
    });

    state.invoke.mockResolvedValue({
      data: { error: "raw_postgres_error" },
      error: null,
    });
    await expect(commitGgsRealPayload(args())).resolves.toEqual({
      ok: false,
      reason: "commit_unavailable",
    });
  });
});
