import { describe, expect, it } from "vitest";
import { resolvePlantQuickLogRouteTarget } from "@/lib/quickLogRouteTargetRules";
import {
  resolveReturningQuickLogStartTarget,
  resolveReturningSignInRoute,
  type QuickLogStartPlant,
} from "@/lib/quickLogStartScreenTargetRules";
import { plantDetailQuickLogHref } from "@/lib/startYourRoomRules";

const PLANT_A = "11111111-1111-4111-8111-111111111111";
const PLANT_B = "22222222-2222-4222-8222-222222222222";
const TENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GROW_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GROW_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function plant(
  overrides: Partial<QuickLogStartPlant> & Pick<QuickLogStartPlant, "id">,
): QuickLogStartPlant {
  return {
    tent_id: TENT_A,
    grow_id: GROW_A,
    is_archived: false,
    updated_at: "2026-10-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const room = {
  tents: [
    { id: TENT_A, grow_id: GROW_A, is_archived: false },
    { id: TENT_B, grow_id: GROW_B, is_archived: false },
  ],
  grows: [
    { id: GROW_A, is_archived: false },
    { id: GROW_B, is_archived: false },
  ],
};

describe("returning Quick Log start screen", () => {
  it("opens Quick Log on the only active plant, with its tent and grow", () => {
    const plants = [
      plant({ id: PLANT_A, tent_id: TENT_A, grow_id: GROW_A }),
      plant({ id: PLANT_B, is_archived: true, tent_id: TENT_B, grow_id: GROW_B }),
    ];
    const target = resolveReturningQuickLogStartTarget({ plants, ...room });

    expect(resolveReturningSignInRoute({ savedChoice: "quickLog", plants, ...room })).toBe(
      `/plants/${PLANT_A}?open=quick-log`,
    );
    expect(target).toEqual({
      route: `/plants/${PLANT_A}?open=quick-log`,
      plantId: PLANT_A,
      tentId: TENT_A,
      growId: GROW_A,
      opensQuickLog: true,
    });
    expect(resolvePlantQuickLogRouteTarget(`/plants/${PLANT_A}`)).toBe(PLANT_A);
  });

  it("opens Quick Log on the most recently updated plant when several are active", () => {
    const plants = [
      plant({
        id: PLANT_A,
        tent_id: TENT_A,
        grow_id: GROW_A,
        updated_at: "2026-10-01T00:00:00.000Z",
      }),
      plant({
        id: PLANT_B,
        tent_id: TENT_B,
        grow_id: GROW_B,
        updated_at: "2026-10-20T12:00:00.000Z",
      }),
    ];
    const target = resolveReturningQuickLogStartTarget({ plants, ...room });

    expect(resolveReturningSignInRoute({ savedChoice: "quickLog", plants, ...room })).toBe(
      `/plants/${PLANT_B}?open=quick-log`,
    );
    expect(target.plantId).toBe(PLANT_B);
    expect(target.tentId).toBe(TENT_B);
    expect(target.growId).toBe(GROW_B);
    expect(target.opensQuickLog).toBe(true);
  });

  it("lands on the Dashboard without opening Quick Log when no plant can be resolved", () => {
    const cases: QuickLogStartPlant[][] = [
      [],
      [plant({ id: PLANT_A, tent_id: null, grow_id: GROW_A })],
      [plant({ id: PLANT_A, tent_id: TENT_A, grow_id: null })],
      [plant({ id: PLANT_A, is_archived: true })],
    ];

    for (const plants of cases) {
      const target = resolveReturningQuickLogStartTarget({ plants, ...room });
      expect(target.opensQuickLog).toBe(false);
      expect(target.plantId).toBeNull();
      expect(resolveReturningSignInRoute({ savedChoice: "quickLog", plants, ...room })).toBe(
        "/dashboard",
      );
    }

    const namedPlant = [plant({ id: PLANT_A, tent_id: TENT_A, grow_id: GROW_A })];
    expect(
      resolveReturningQuickLogStartTarget({
        plants: namedPlant,
        tents: [],
        grows: room.grows,
      }).opensQuickLog,
    ).toBe(false);
    expect(
      resolveReturningQuickLogStartTarget({
        plants: namedPlant,
        tents: room.tents,
        grows: [{ id: GROW_A, is_archived: true }],
      }).opensQuickLog,
    ).toBe(false);
  });

  it("keeps the post-setup plant Quick Log path", () => {
    expect(plantDetailQuickLogHref(PLANT_A)).toBe(`/plants/${PLANT_A}?open=quick-log`);
    expect(resolvePlantQuickLogRouteTarget(plantDetailQuickLogHref(PLANT_A).split("?")[0])).toBe(
      PLANT_A,
    );
  });
});
