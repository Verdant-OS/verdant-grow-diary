import { describe, expect, it } from "vitest";
import {
  SENSORS_TENT_INTENT_QUERY_PARAM,
  buildSensorsTentRouteHref,
  readSensorsTentRouteIntent,
  resolveSensorsTentRouteSelection,
} from "@/lib/sensorRouteTentIntentRules";

const TENT_A = "00000000-0000-4000-8000-00000000000a";
const TENT_B = "00000000-0000-4000-8000-00000000000b";
const TENT_C = "00000000-0000-4000-8000-00000000000c";
const TENTS = [{ id: TENT_A }, { id: TENT_B }];

describe("sensorRouteTentIntentRules", () => {
  it("builds and reads a normalized UUID-only Sensors tent intent", () => {
    const href = buildSensorsTentRouteHref(` ${TENT_B.toUpperCase()} `);
    expect(href).toBe(`/sensors?${SENSORS_TENT_INTENT_QUERY_PARAM}=${TENT_B}`);

    expect(
      readSensorsTentRouteIntent(
        new URLSearchParams(`${SENSORS_TENT_INTENT_QUERY_PARAM}=${TENT_B}`),
      ),
    ).toEqual({ tentId: TENT_B });
  });

  it("selects a valid Timeline handoff only when it belongs to the authenticated tent list", () => {
    const selected = resolveSensorsTentRouteSelection({
      intent: { tentId: TENT_B },
      currentTentId: TENT_A,
      tents: TENTS,
    });

    expect(selected).toBe(TENT_B);
  });

  it("falls back to the existing selected tent when the requested UUID is not authenticated", () => {
    const selected = resolveSensorsTentRouteSelection({
      intent: { tentId: TENT_C },
      currentTentId: TENT_B,
      tents: TENTS,
    });

    expect(selected).toBe(TENT_B);
  });

  it("falls back deterministically when the URL intent is missing or malformed", () => {
    expect(readSensorsTentRouteIntent(new URLSearchParams())).toEqual({ tentId: null });
    expect(
      readSensorsTentRouteIntent(
        new URLSearchParams(`${SENSORS_TENT_INTENT_QUERY_PARAM}=not-a-persisted-tent`),
      ),
    ).toEqual({ tentId: null });
    expect(buildSensorsTentRouteHref("not-a-persisted-tent")).toBe("/sensors");

    expect(resolveSensorsTentRouteSelection({ intent: { tentId: null }, tents: TENTS })).toBe(
      TENT_A,
    );
  });

  it("returns no selection until an authenticated tent row exists", () => {
    expect(
      resolveSensorsTentRouteSelection({
        intent: { tentId: TENT_A },
        tents: [],
      }),
    ).toBeNull();
  });
});
