import { describe, expect, it } from "vitest";
import {
  SENSORS_TENT_INTENT_MODE_QUERY_PARAM,
  SENSORS_TENT_INTENT_MODE_REQUIRED,
  SENSORS_TENT_INTENT_QUERY_PARAM,
  buildSensorsRequiredTentGate,
  buildSensorsTentRouteIntentKey,
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
    ).toEqual({ tentId: TENT_B, requireExactMatch: false });
  });

  it("builds and reads an exact-match tent intent for safety-critical handoffs", () => {
    const href = buildSensorsTentRouteHref(TENT_B, { requireExactMatch: true });
    expect(href).toBe(
      `/sensors?${SENSORS_TENT_INTENT_QUERY_PARAM}=${TENT_B}&${SENSORS_TENT_INTENT_MODE_QUERY_PARAM}=${SENSORS_TENT_INTENT_MODE_REQUIRED}`,
    );
    expect(readSensorsTentRouteIntent(new URL(href, "https://verdant.test").searchParams)).toEqual({
      tentId: TENT_B,
      requireExactMatch: true,
    });
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

  it("returns no target when an exact-match UUID is not authenticated", () => {
    expect(
      resolveSensorsTentRouteSelection({
        intent: { tentId: TENT_C, requireExactMatch: true },
        currentTentId: TENT_B,
        tents: TENTS,
      }),
    ).toBeNull();
  });

  it("keeps exact-match UI gated across route changes and tent-list refreshes", () => {
    const intent = { tentId: TENT_C, requireExactMatch: true };
    const intentKey = buildSensorsTentRouteIntentKey(intent);

    expect(
      buildSensorsRequiredTentGate({
        intent,
        intentKey,
        appliedIntentKey: buildSensorsTentRouteIntentKey({ tentId: TENT_A }),
        currentTentId: TENT_A,
        tents: TENTS,
        tentsLoaded: true,
      }),
    ).toEqual({
      requiredSelectionId: null,
      reselectionRequired: true,
      resolutionPending: false,
    });

    expect(
      buildSensorsRequiredTentGate({
        intent,
        intentKey,
        appliedIntentKey: null,
        currentTentId: TENT_A,
        tents: [...TENTS, { id: TENT_C }],
        tentsLoaded: true,
      }),
    ).toEqual({
      requiredSelectionId: TENT_C,
      reselectionRequired: false,
      resolutionPending: true,
    });

    expect(
      buildSensorsRequiredTentGate({
        intent,
        intentKey,
        appliedIntentKey: intentKey,
        currentTentId: TENT_C,
        tents: TENTS,
        tentsLoaded: true,
      }),
    ).toEqual({
      requiredSelectionId: null,
      reselectionRequired: true,
      resolutionPending: false,
    });

    expect(
      buildSensorsRequiredTentGate({
        intent,
        intentKey,
        appliedIntentKey: intentKey,
        currentTentId: TENT_B,
        explicitTentId: TENT_B,
        tents: TENTS,
        tentsLoaded: true,
      }),
    ).toEqual({
      requiredSelectionId: TENT_B,
      reselectionRequired: false,
      resolutionPending: false,
    });
  });

  it("scopes exact-match grower overrides to a navigation instance", () => {
    const intent = { tentId: TENT_A, requireExactMatch: true };

    expect(buildSensorsTentRouteIntentKey(intent, "entry-a")).not.toBe(
      buildSensorsTentRouteIntentKey(intent, "entry-b"),
    );
    expect(buildSensorsTentRouteIntentKey(intent, "entry-a")).toBe(
      buildSensorsTentRouteIntentKey(intent, "entry-a"),
    );
  });

  it("falls back deterministically when the URL intent is missing or malformed", () => {
    expect(readSensorsTentRouteIntent(new URLSearchParams())).toEqual({
      tentId: null,
      requireExactMatch: false,
    });
    expect(
      readSensorsTentRouteIntent(
        new URLSearchParams(`${SENSORS_TENT_INTENT_QUERY_PARAM}=not-a-persisted-tent`),
      ),
    ).toEqual({ tentId: null, requireExactMatch: false });
    expect(buildSensorsTentRouteHref("not-a-persisted-tent")).toBe("/sensors");

    expect(resolveSensorsTentRouteSelection({ intent: { tentId: null }, tents: TENTS })).toBe(
      TENT_A,
    );
  });

  it("fails closed when a required intent is malformed", () => {
    const intent = readSensorsTentRouteIntent(
      new URLSearchParams(
        `${SENSORS_TENT_INTENT_QUERY_PARAM}=not-a-persisted-tent&${SENSORS_TENT_INTENT_MODE_QUERY_PARAM}=${SENSORS_TENT_INTENT_MODE_REQUIRED}`,
      ),
    );

    expect(intent).toEqual({ tentId: null, requireExactMatch: true });
    expect(resolveSensorsTentRouteSelection({ intent, tents: TENTS })).toBeNull();
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
