import { describe, expect, it } from "vitest";
import {
  applyQuickLogActionChip,
  hasQuickLogActionChip,
  removeQuickLogActionChip,
  toggleQuickLogActionChip,
  type QuickLogActionChip,
} from "@/lib/tenSecondQuickCheckRules";

const actionCases: { chip: QuickLogActionChip; line: string }[] = [
  { chip: "Watered", line: "Watered." },
  { chip: "Fed", line: "Fed." },
  { chip: "Photo only", line: "Photo only." },
  { chip: "Issue spotted", line: "Issue spotted." },
  { chip: "Environment changed", line: "Environment changed." },
  { chip: "Training / pruning", line: "Training / pruning." },
  { chip: "Note", line: "Note." },
];

describe("Quick Log action chip selection", () => {
  it.each(actionCases)("recognizes the standalone $chip action", ({ chip, line }) => {
    expect(hasQuickLogActionChip(line, chip)).toBe(true);
    expect(
      hasQuickLogActionChip(`Grower observation.\r\n${line}\nResponse check: Same.`, chip),
    ).toBe(true);
  });

  it.each(actionCases)("reflects normalized manual edits to $chip", ({ chip, line }) => {
    expect(hasQuickLogActionChip(`\t ${chip.toUpperCase()}!!.. \t`, chip)).toBe(true);
    expect(hasQuickLogActionChip(chip, chip)).toBe(true);
    expect(hasQuickLogActionChip(`${line} after lights-on`, chip)).toBe(false);
    expect(hasQuickLogActionChip(`${chip}?`, chip)).toBe(false);
  });

  it.each([null, undefined, "", " \t\r\n\n"])("has no action in an empty note %j", (note) => {
    expect(hasQuickLogActionChip(note, "Watered")).toBe(false);
  });

  it.each([
    "Watered yesterday and the pot still feels heavy.",
    "Watered yesterday…",
    "I watered. Leaves look settled.",
    "Watered. Response check: Better.",
    "Response check: Better. Watered.",
    "Response: Response check: Same. Watered.",
    "Quick check: Worse. Watered less yesterday.",
    "Previous response check: Better after watering.",
  ])("does not select Watered from grower or response prose %j", (note) => {
    expect(hasQuickLogActionChip(note, "Watered")).toBe(false);
  });

  it("reads independent simultaneous selections without inventing another action", () => {
    const note = "Response check: Better.\nWatered.\nFed.\nTraining / pruning.";
    expect(hasQuickLogActionChip(note, "Watered")).toBe(true);
    expect(hasQuickLogActionChip(note, "Fed")).toBe(true);
    expect(hasQuickLogActionChip(note, "Training / pruning")).toBe(true);
    expect(hasQuickLogActionChip(note, "Note")).toBe(false);
  });
});

describe("Quick Log standalone action removal", () => {
  it.each(actionCases)("removes $chip and allows it to be added again", ({ chip, line }) => {
    expect(removeQuickLogActionChip(line, chip)).toBe("");
    expect(toggleQuickLogActionChip(line, chip)).toBe("");
    expect(toggleQuickLogActionChip(removeQuickLogActionChip(line, chip), chip)).toBe(line);
  });

  it("removes all matching normalized lines while preserving prose and other selections", () => {
    const note =
      "  Canopy looks even. \r\n\t WATERED!! \nFed.\r\nwatered\nWatered yesterday…\r\nWatered.";
    expect(removeQuickLogActionChip(note, "Watered")).toBe(
      "  Canopy looks even. \r\nFed.\r\nWatered yesterday…",
    );
  });

  it.each([
    ["Watered.\nObservation.", "Observation."],
    ["Watered.\r\nObservation.", "Observation."],
    ["Watered.\rObservation.", "Observation."],
    ["Observation.\nWatered.", "Observation."],
    ["Observation.\r\nWatered.", "Observation."],
    ["Observation.\rWatered.", "Observation."],
    ["Before.\r\nWatered.\nAfter.", "Before.\r\nAfter."],
    ["Before.\nWatered.\r\nAfter.", "Before.\nAfter."],
    ["Before.\rWatered.\nAfter.", "Before.\rAfter."],
    ["Before.\nWatered.\r\n", "Before.\n"],
    ["Watered.\n\nAfter.", "\nAfter."],
    ["Before.\n\nWatered.", "Before.\n"],
    ["Before.\r\n\r\nWatered.\n\nAfter.\r\n", "Before.\r\n\r\n\nAfter.\r\n"],
    ["\nWatered.\n", "\n"],
    ["Watered.\r\nwatered\nWATERED!", ""],
  ])("preserves retained line bytes and separators in %j", (note, expected) => {
    expect(removeQuickLogActionChip(note, "Watered")).toBe(expected);
  });

  it("keeps response-check text, repeated prose, indentation and blank lines exactly", () => {
    const note =
      "Response check: Better.\r\n\n  Watered yesterday…  \nWatered.\r\nFed.\n\n" +
      "Previous response check: Better after watering.\r\nWatered. Response check: Same.\n";
    const expected =
      "Response check: Better.\r\n\n  Watered yesterday…  \nFed.\n\n" +
      "Previous response check: Better after watering.\r\nWatered. Response check: Same.\n";
    expect(removeQuickLogActionChip(note, "Watered")).toBe(expected);
  });

  it("is an exact no-op when only action-looking prose is present", () => {
    const note =
      "\n  Watered yesterday… \r\nResponse check: Better. Watered.\nFed. after watering\r\n\n";
    expect(removeQuickLogActionChip(note, "Watered")).toBe(note);
    expect(removeQuickLogActionChip(note, "Fed")).toBe(note);
  });

  it.each([null, undefined, ""])("removes no action from an empty note %j", (note) => {
    expect(removeQuickLogActionChip(note, "Watered")).toBe("");
  });

  it("preserves whitespace-only notes when no matching action exists", () => {
    expect(removeQuickLogActionChip(" \t\r\n\n", "Watered")).toBe(" \t\r\n\n");
  });
});

describe("Quick Log action toggling", () => {
  it.each([null, undefined, ""])("adds a canonical action to an empty note %j", (note) => {
    expect(toggleQuickLogActionChip(note, "Watered")).toBe("Watered.");
  });

  it.each([
    ["  Observation.  ", "  Observation.  \nFed."],
    ["\nObservation.\r\n\n", "\nObservation.\r\n\n\nFed."],
    ["Observation.\r\n", "Observation.\r\n\r\nFed."],
    ["Observation.\r", "Observation.\r\rFed."],
    [" \t\n", " \t\n\nFed."],
  ])("appends to raw prose without rewriting %j", (note, expected) => {
    expect(toggleQuickLogActionChip(note, "Fed")).toBe(expected);
  });

  it.each([
    "  Observation.  ",
    "Observation.\n",
    "Observation.\r\n",
    "Observation.\r",
    "\nObservation.\r\n\n",
    "Observation.\r\n  Fed! \n\r\n",
    " \t\r\n\n",
  ])("restores every original byte after an add/remove roundtrip for %j", (note) => {
    const selected = toggleQuickLogActionChip(note, "Watered");
    expect(hasQuickLogActionChip(selected, "Watered")).toBe(true);
    expect(toggleQuickLogActionChip(selected, "Watered")).toBe(note);
  });

  it("allows independent removal and re-add without rewriting the other selected line", () => {
    const note = "Response check: Same.\r\nWatered.\n  FED! \r\nObservation.  ";
    const removed = toggleQuickLogActionChip(note, "Watered");
    expect(removed).toBe("Response check: Same.\r\n  FED! \r\nObservation.  ");
    expect(hasQuickLogActionChip(removed, "Watered")).toBe(false);
    expect(hasQuickLogActionChip(removed, "Fed")).toBe(true);
    expect(toggleQuickLogActionChip(removed, "Watered")).toBe(`${removed}\r\nWatered.`);
  });

  it("deselects every action to an empty note", () => {
    const selected = actionCases.map(({ line }) => line).join("\n");
    const deselected = actionCases.reduce(
      (note, { chip }) => toggleQuickLogActionChip(note, chip),
      selected,
    );
    expect(deselected).toBe("");
    for (const { chip } of actionCases) expect(hasQuickLogActionChip(deselected, chip)).toBe(false);
  });

  it("adds rather than deletes a substring in a grower's sentence", () => {
    const note = "Watered yesterday…\r\nResponse check: Better. Watered.";
    expect(toggleQuickLogActionChip(note, "Watered")).toBe(`${note}\r\nWatered.`);
  });

  it("uses the current manually edited note as selection truth", () => {
    const edited = "Watered yesterday…\n  fed!! \nResponse check: Better.";
    expect(hasQuickLogActionChip(edited, "Watered")).toBe(false);
    expect(hasQuickLogActionChip(edited, "Fed")).toBe(true);
    expect(toggleQuickLogActionChip(edited, "Fed")).toBe(
      "Watered yesterday…\nResponse check: Better.",
    );
  });

  it("is deterministic and leaves its input untouched", () => {
    const note = "  Observation.\r\nWatered.\nFed.";
    expect(toggleQuickLogActionChip(note, "Watered")).toBe(
      toggleQuickLogActionChip(note, "Watered"),
    );
    expect(removeQuickLogActionChip(note, "Watered")).toBe(
      removeQuickLogActionChip(note, "Watered"),
    );
    expect(note).toBe("  Observation.\r\nWatered.\nFed.");
  });
});

describe("existing action append contract", () => {
  it("keeps existing append normalization and blank-line compaction", () => {
    expect(applyQuickLogActionChip("  Observation. \r\n\n Fed! \n", "Watered")).toBe(
      "Observation.\nFed!\nWatered.",
    );
  });

  it("keeps existing deduplication as an exact no-op instead of toggling", () => {
    const note = "  Observation. \r\n\n\t WATERED!! \r\n";
    expect(applyQuickLogActionChip(note, "Watered")).toBe(note);
    expect(applyQuickLogActionChip("Watered", "Watered")).toBe("Watered");
  });
});
