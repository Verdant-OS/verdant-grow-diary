import { describe, expect, it } from "vitest";
import { FREE_TENT_LIMIT_BLOCKED_COPY } from "@/lib/entitlements/freeTierGates";
import { hasTrimmedRequiredIdentity } from "@/lib/formIdentityFailClosedRules";
import {
  CREATE_GROW_NAME_HELPER,
  CREATE_GROW_NAME_REASON,
  CREATE_GROW_SAVING_REASON,
  CREATE_GROW_UNKNOWN_REASON,
  CREATE_PLANT_NAME_HELPER,
  CREATE_PLANT_NAME_REASON,
  CREATE_PLANT_SAVING_REASON,
  CREATE_PLANT_SETUP_REASON,
  CREATE_PLANT_TENT_HELPER,
  CREATE_PLANT_TENT_REASON,
  CREATE_PLANT_UNKNOWN_REASON,
  CREATE_TENT_GATE_FALLBACK_REASON,
  CREATE_TENT_GROW_REASON,
  CREATE_TENT_NAME_HELPER,
  CREATE_TENT_NAME_REASON,
  CREATE_TENT_SAVING_REASON,
  CREATE_TENT_UNKNOWN_REASON,
  PLANT_NO_TENTS_OPTIONAL_HINT,
  PLANT_NO_TENTS_REQUIRED_HINT,
  describeCreateGrowPrimaryButton,
  describeCreatePlantPrimaryButton,
  describeCreateTentPrimaryButton,
  plantCreateNoTentsHintCopy,
} from "@/lib/createDialogPrimaryButtonViewModel";

const readyTent = {
  busy: false,
  outcomeUnknown: false,
  gateAllowed: true,
  gateBlockedCopy: null,
  formBlocked: false,
  formBlockedDetail: null,
  name: "",
};

describe("describeCreateTentPrimaryButton", () => {
  it("stays disabled with a name reason until a non-blank name is typed", () => {
    const empty = describeCreateTentPrimaryButton(readyTent);
    expect(empty.disabled).toBe(true);
    expect(empty.reason).toBe(CREATE_TENT_NAME_REASON);
    expect(empty.helperText).toBe(CREATE_TENT_NAME_HELPER);

    const whitespace = describeCreateTentPrimaryButton({ ...readyTent, name: "   " });
    expect(whitespace.disabled).toBe(true);
    expect(whitespace.reason).toBe(CREATE_TENT_NAME_REASON);

    const named = describeCreateTentPrimaryButton({ ...readyTent, name: "  Flower tent  " });
    expect(named.disabled).toBe(false);
    expect(named.reason).toBeNull();
    expect(named.helperText).toBe(CREATE_TENT_NAME_HELPER);
    expect(hasTrimmedRequiredIdentity("  Flower tent  ")).toBe(true);
  });

  it("names the plan limit when a valid name still leaves Create tent disabled", () => {
    const gated = describeCreateTentPrimaryButton({
      ...readyTent,
      name: "Flower tent",
      gateAllowed: false,
      gateBlockedCopy: FREE_TENT_LIMIT_BLOCKED_COPY,
    });
    expect(gated.disabled).toBe(true);
    expect(gated.reason).toBe(FREE_TENT_LIMIT_BLOCKED_COPY);
    expect(gated.helperText).toBe(FREE_TENT_LIMIT_BLOCKED_COPY);
    expect(gated.helperText).not.toBe(CREATE_TENT_NAME_HELPER);
  });

  it("uses a fallback plan reason when the gate copy is blank", () => {
    const gated = describeCreateTentPrimaryButton({
      ...readyTent,
      name: "Flower tent",
      gateAllowed: false,
      gateBlockedCopy: "  ",
    });
    expect(gated.reason).toBe(CREATE_TENT_GATE_FALLBACK_REASON);
    expect(gated.helperText).toBe(CREATE_TENT_GATE_FALLBACK_REASON);
  });

  it("names the missing grow when the form is blocked, ahead of a blank name", () => {
    const blocked = describeCreateTentPrimaryButton({
      ...readyTent,
      formBlocked: true,
      formBlockedDetail: null,
    });
    expect(blocked.disabled).toBe(true);
    expect(blocked.reason).toBe(CREATE_TENT_GROW_REASON);
  });

  it("prefers the refresh reason over a blank name", () => {
    const unknown = describeCreateTentPrimaryButton({ ...readyTent, outcomeUnknown: true });
    expect(unknown.reason).toBe(CREATE_TENT_UNKNOWN_REASON);
  });

  it("names the save itself only after the name is valid", () => {
    const saving = describeCreateTentPrimaryButton({
      ...readyTent,
      name: "Flower tent",
      busy: true,
    });
    expect(saving.disabled).toBe(true);
    expect(saving.reason).toBe(CREATE_TENT_SAVING_REASON);
  });

  it("treats null and non-strings as a missing name", () => {
    expect(describeCreateTentPrimaryButton({ ...readyTent, name: null }).reason).toBe(
      CREATE_TENT_NAME_REASON,
    );
    expect(describeCreateTentPrimaryButton({ ...readyTent, name: undefined }).disabled).toBe(true);
  });
});

describe("describeCreatePlantPrimaryButton", () => {
  const readyPlant = {
    busy: false,
    outcomeUnknown: false,
    formBlocked: false,
    formBlockedDetail: null,
    tentCompatible: true,
    tentRequired: false,
    tentBlockedDetail: null,
    name: "",
  };

  it("enables on a valid name when a tent is optional and stage is already set", () => {
    const empty = describeCreatePlantPrimaryButton(readyPlant);
    expect(empty.disabled).toBe(true);
    expect(empty.reason).toBe(CREATE_PLANT_NAME_REASON);
    expect(empty.helperText).toBe(CREATE_PLANT_NAME_HELPER);
    expect(empty.helperText).not.toContain("stage are required");

    const named = describeCreatePlantPrimaryButton({ ...readyPlant, name: "Plant A" });
    expect(named.disabled).toBe(false);
    expect(named.reason).toBeNull();
  });

  it("names the tent when a required tent is missing, even after a valid name", () => {
    const missingTent = describeCreatePlantPrimaryButton({
      ...readyPlant,
      name: "Plant A",
      tentRequired: true,
      tentCompatible: false,
      tentBlockedDetail: "Choose a tent",
    });
    expect(missingTent.disabled).toBe(true);
    expect(missingTent.reason).toBe("Choose a tent");
    expect(missingTent.helperText).toBe(CREATE_PLANT_TENT_HELPER);
  });

  it("falls back when a blocked tent has no detail", () => {
    const missing = describeCreatePlantPrimaryButton({
      ...readyPlant,
      name: "Plant A",
      tentCompatible: false,
      tentBlockedDetail: "",
    });
    expect(missing.reason).toBe(CREATE_PLANT_TENT_REASON);
  });

  it("names the setup block before the blank name", () => {
    const blocked = describeCreatePlantPrimaryButton({
      ...readyPlant,
      formBlocked: true,
    });
    expect(blocked.reason).toBe(CREATE_PLANT_SETUP_REASON);
  });

  it("names an unknown save outcome and a save in progress", () => {
    expect(
      describeCreatePlantPrimaryButton({
        ...readyPlant,
        name: "Plant A",
        outcomeUnknown: true,
        formBlocked: true,
      }).reason,
    ).toBe(CREATE_PLANT_UNKNOWN_REASON);
    expect(
      describeCreatePlantPrimaryButton({ ...readyPlant, name: "Plant A", busy: true }).reason,
    ).toBe(CREATE_PLANT_SAVING_REASON);
  });
});

describe("describeCreateGrowPrimaryButton", () => {
  it("disables until a name is typed and clears the reason once it is", () => {
    const empty = describeCreateGrowPrimaryButton({
      busy: false,
      outcomeUnknown: false,
      name: "",
    });
    expect(empty.disabled).toBe(true);
    expect(empty.reason).toBe(CREATE_GROW_NAME_REASON);
    expect(empty.helperText).toBe(CREATE_GROW_NAME_HELPER);

    const named = describeCreateGrowPrimaryButton({
      busy: false,
      outcomeUnknown: false,
      name: "Spring Veg",
    });
    expect(named.disabled).toBe(false);
    expect(named.reason).toBeNull();
  });

  it("names refresh and saving ahead of the name field", () => {
    expect(
      describeCreateGrowPrimaryButton({ busy: false, outcomeUnknown: true, name: "" }).reason,
    ).toBe(CREATE_GROW_UNKNOWN_REASON);
    expect(
      describeCreateGrowPrimaryButton({ busy: true, outcomeUnknown: false, name: "Spring Veg" })
        .reason,
    ).toBe(CREATE_GROW_SAVING_REASON);
  });
});

describe("plantCreateNoTentsHintCopy", () => {
  it("does not tell the grower a tent is required when the write allows tentless plants", () => {
    expect(plantCreateNoTentsHintCopy(false)).toBe(PLANT_NO_TENTS_OPTIONAL_HINT);
    expect(plantCreateNoTentsHintCopy(true)).toBe(PLANT_NO_TENTS_REQUIRED_HINT);
  });
});
