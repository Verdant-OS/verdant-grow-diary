/**
 * Friction follow-up 2026-11-04, finding #1 (High): "Review sensor snapshot"
 * on a Skunk Gas Run Timeline sent `/sensors?growId=<grow>`, but Sensors
 * ignored `growId` and opened the account's first tent (a QA test tent) from
 * another grow; its AI Doctor link then targeted that wrong grow/tent.
 *
 * A carried growId now limits the route-driven tent choice to that grow. A
 * grow with no tents selects nothing rather than borrowing another grow's tent.
 */
import { describe, expect, it } from "vitest";
import {
  buildSensorsRequiredTentGate,
  buildSensorsTentRouteIntentKey,
  readSensorsTentRouteIntent,
  resolveSensorsTentRouteSelection,
} from "@/lib/sensorRouteTentIntentRules";
import { createSensorsPageSession, reconcileSensorsSelection } from "@/lib/sensorsPageSessionRules";
import { sensorsPath, withGrowId } from "@/lib/routes";

const GROW_QA = "aaaaaaaa-0000-4000-8000-000000000001";
const GROW_SKUNK = "bbbbbbbb-0000-4000-8000-000000000002";
const GROW_EMPTY = "cccccccc-0000-4000-8000-000000000003";
const QA_TENT = "00000000-0000-4000-8000-00000000000a";
const FLOWER = "00000000-0000-4000-8000-00000000000b";
const BRAVO = "00000000-0000-4000-8000-00000000000c";
// Repository order puts the QA tent first, as on the live account.
const TENTS = [
  { id: QA_TENT, growId: GROW_QA },
  { id: FLOWER, growId: GROW_SKUNK },
  { id: BRAVO, growId: GROW_SKUNK },
];
const read = (href: string) =>
  readSensorsTentRouteIntent(new URL(href, "https://verdant.test").searchParams);

describe("Sensors keeps the carried grow scope", () => {
  it("reads a normalized growId from the Timeline handoff URL", () => {
    expect(read(sensorsPath(GROW_SKUNK.toUpperCase())).growId).toBe(GROW_SKUNK);
    expect(read("/sensors?growId=not-a-grow").growId ?? null).toBeNull();
  });

  it("opens a tent in the carried grow, not the account's first tent", () => {
    const intent = read(sensorsPath(GROW_SKUNK));
    expect(resolveSensorsTentRouteSelection({ intent, tents: TENTS })).toBe(FLOWER);
  });

  it("drops a remembered tent from another grow when the grow intent applies", () => {
    const intent = read(sensorsPath(GROW_SKUNK));
    expect(resolveSensorsTentRouteSelection({ intent, currentTentId: QA_TENT, tents: TENTS })).toBe(
      FLOWER,
    );
    expect(resolveSensorsTentRouteSelection({ intent, currentTentId: BRAVO, tents: TENTS })).toBe(
      BRAVO,
    );
  });

  it("selects nothing when the carried grow has no tents", () => {
    const intent = read(sensorsPath(GROW_EMPTY));
    expect(
      resolveSensorsTentRouteSelection({ intent, currentTentId: QA_TENT, tents: TENTS }),
    ).toBeNull();
  });

  it("keeps an in-grow tent intent and refuses a tent from another grow", () => {
    expect(
      resolveSensorsTentRouteSelection({
        intent: read(withGrowId(`/sensors?tentId=${BRAVO}`, GROW_SKUNK)),
        tents: TENTS,
      }),
    ).toBe(BRAVO);
    expect(
      resolveSensorsTentRouteSelection({
        intent: read(withGrowId(`/sensors?tentId=${QA_TENT}`, GROW_SKUNK)),
        tents: TENTS,
      }),
    ).toBe(FLOWER);
  });

  it("re-applies when only the grow changes", () => {
    expect(buildSensorsTentRouteIntentKey(read(sensorsPath(GROW_SKUNK)))).not.toBe(
      buildSensorsTentRouteIntentKey(read(sensorsPath(GROW_QA))),
    );
  });

  it("a required handoff still honours the grower's explicit pick in another grow", () => {
    const intent = read(withGrowId(`/sensors?tentId=${FLOWER}&tentIntent=required`, GROW_SKUNK));
    expect(
      buildSensorsRequiredTentGate({
        intent,
        intentKey: "k",
        appliedIntentKey: "k",
        currentTentId: QA_TENT,
        explicitTentId: QA_TENT,
        tents: TENTS,
        tentsLoaded: true,
      }),
    ).toEqual({
      requiredSelectionId: QA_TENT,
      reselectionRequired: false,
      resolutionPending: false,
    });
  });

  it("the persisted page session does not carry a QA tent into a grow-scoped visit", () => {
    const first = reconcileSensorsSelection(createSensorsPageSession(1), {
      intent: read("/sensors"),
      intentKey: "visit-1",
      tents: TENTS,
      tentsLoaded: true,
    });
    expect(first.selection.tentId).toBe(QA_TENT);
    const second = reconcileSensorsSelection(first, {
      intent: read(sensorsPath(GROW_SKUNK)),
      intentKey: "visit-2",
      tents: TENTS,
      tentsLoaded: true,
    });
    expect(second.selection.tentId).toBe(FLOWER);
  });
});
