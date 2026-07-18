/**
 * PhenoBreedingObjectiveEditor — render/interaction coverage.
 *
 * Covers add/remove/save, threshold bounds validation, axis-exclusion
 * once used, save failure surfacing, external target updates (the hunt
 * loading async after mount) not clobbering in-progress edits, and the
 * always-visible caveat.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PhenoBreedingObjectiveEditor from "@/components/PhenoBreedingObjectiveEditor";
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";
import {
  BREEDING_OBJECTIVE_CAVEAT,
  type BreedingObjectiveTarget,
} from "@/lib/phenoBreedingObjectiveRules";

function renderEditor(
  targets: BreedingObjectiveTarget[],
  onSave: (t: readonly BreedingObjectiveTarget[]) => Promise<boolean>,
  saving = false,
) {
  return render(<PhenoBreedingObjectiveEditor targets={targets} onSave={onSave} saving={saving} />);
}

describe("empty state", () => {
  it("shows the empty copy and every axis available", () => {
    renderEditor([], vi.fn());
    expect(screen.getByTestId("pheno-breeding-objective-empty")).toBeInTheDocument();
    const options = screen
      .getByTestId("pheno-breeding-objective-axis-select")
      .querySelectorAll("option");
    expect(options.length).toBe(LOUD_TRAIT_AXES.length);
  });

  it("always renders the suggest-only caveat", () => {
    renderEditor([], vi.fn());
    expect(screen.getByText(BREEDING_OBJECTIVE_CAVEAT)).toBeInTheDocument();
  });
});

describe("adding a target", () => {
  it("adds a valid target, marks dirty, and enables save", () => {
    renderEditor([], vi.fn());
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-axis-select"), {
      target: { value: "vigor" },
    });
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-threshold-input"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByTestId("pheno-breeding-objective-add-target"));

    expect(screen.getByTestId("pheno-breeding-objective-target-vigor")).toHaveTextContent(
      "Vigor at least 4",
    );
    expect(
      (screen.getByTestId("pheno-breeding-objective-save") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("rejects an out-of-range threshold with an inline error and does not add it", () => {
    renderEditor([], vi.fn());
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-axis-select"), {
      target: { value: "vigor" }, // 1..5
    });
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-threshold-input"), {
      target: { value: "99" },
    });
    fireEvent.click(screen.getByTestId("pheno-breeding-objective-add-target"));

    expect(screen.getByTestId("pheno-breeding-objective-error")).toBeInTheDocument();
    expect(screen.queryByTestId("pheno-breeding-objective-target-vigor")).not.toBeInTheDocument();
  });

  it("removes an axis from the picker once it has a target, and re-adds it after removal", () => {
    renderEditor([{ axisKey: "vigor", comparator: "gte", threshold: 3 }], vi.fn());
    const axisOptionValues = Array.from(
      screen.getByTestId("pheno-breeding-objective-axis-select").querySelectorAll("option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(axisOptionValues).not.toContain("vigor");

    fireEvent.click(screen.getByTestId("pheno-breeding-objective-remove-vigor"));
    const afterRemoval = Array.from(
      screen.getByTestId("pheno-breeding-objective-axis-select").querySelectorAll("option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(afterRemoval).toContain("vigor");
  });
});

describe("saving", () => {
  it("calls onSave with the current draft and clears dirty on success", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderEditor([], onSave);
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-axis-select"), {
      target: { value: "stretch" },
    });
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-threshold-input"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByTestId("pheno-breeding-objective-add-target"));
    fireEvent.click(screen.getByTestId("pheno-breeding-objective-save"));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith([
        { axisKey: "stretch", comparator: "gte", threshold: 2 },
      ]),
    );
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
  });

  it("surfaces an inline error and keeps the draft when save fails", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    renderEditor([], onSave);
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-axis-select"), {
      target: { value: "stretch" },
    });
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-threshold-input"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByTestId("pheno-breeding-objective-add-target"));
    fireEvent.click(screen.getByTestId("pheno-breeding-objective-save"));

    await waitFor(() =>
      expect(screen.getByTestId("pheno-breeding-objective-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("pheno-breeding-objective-target-stretch")).toBeInTheDocument();
  });

  it("disables save while a save is in flight", () => {
    renderEditor([{ axisKey: "vigor", comparator: "gte", threshold: 3 }], vi.fn(), true);
    expect(
      (screen.getByTestId("pheno-breeding-objective-save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId("pheno-breeding-objective-save")).toHaveTextContent("Saving…");
  });
});

describe("external target updates", () => {
  it("adopts a later-loaded targets prop when the grower has no unsaved edits", () => {
    const { rerender } = renderEditor([], vi.fn());
    expect(screen.getByTestId("pheno-breeding-objective-empty")).toBeInTheDocument();

    rerender(
      <PhenoBreedingObjectiveEditor
        targets={[{ axisKey: "vigor", comparator: "gte", threshold: 3 }]}
        onSave={vi.fn()}
        saving={false}
      />,
    );
    expect(screen.getByTestId("pheno-breeding-objective-target-vigor")).toBeInTheDocument();
  });

  it("never clobbers an in-progress unsaved edit when the prop updates", () => {
    const { rerender } = renderEditor([], vi.fn());
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-axis-select"), {
      target: { value: "stretch" },
    });
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-threshold-input"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByTestId("pheno-breeding-objective-add-target"));

    // Simulate the parent's hunt data resolving mid-edit with a DIFFERENT
    // saved value — the grower's unsaved "stretch" target must survive.
    rerender(
      <PhenoBreedingObjectiveEditor
        targets={[{ axisKey: "vigor", comparator: "gte", threshold: 3 }]}
        onSave={vi.fn()}
        saving={false}
      />,
    );
    expect(screen.getByTestId("pheno-breeding-objective-target-stretch")).toBeInTheDocument();
    expect(screen.queryByTestId("pheno-breeding-objective-target-vigor")).not.toBeInTheDocument();
  });

  it("moves the pending picker off an axis consumed by a later-loaded target", async () => {
    const { rerender } = renderEditor([], vi.fn());
    expect(screen.getByTestId("pheno-breeding-objective-axis-select")).toHaveValue("nose_loudness");
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-threshold-input"), {
      target: { value: "4" },
    });

    rerender(
      <PhenoBreedingObjectiveEditor
        targets={[{ axisKey: "nose_loudness", comparator: "gte", threshold: 7 }]}
        onSave={vi.fn()}
        saving={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("pheno-breeding-objective-axis-select")).toHaveValue("vigor"),
    );
    expect(screen.getByTestId("pheno-breeding-objective-threshold-input")).toHaveValue(null);
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-threshold-input"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByTestId("pheno-breeding-objective-add-target"));
    expect(screen.getByTestId("pheno-breeding-objective-target-vigor")).toBeInTheDocument();
    expect(screen.getAllByTestId(/pheno-breeding-objective-target-/)).toHaveLength(2);
  });

  it("selects a newly available axis after removing from an all-axes objective", async () => {
    const allTargets = LOUD_TRAIT_AXES.map((axis) => ({
      axisKey: axis.key,
      comparator: "gte" as const,
      threshold: axis.min,
    }));
    renderEditor(allTargets, vi.fn());
    expect(screen.queryByTestId("pheno-breeding-objective-axis-select")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pheno-breeding-objective-remove-nose_loudness"));
    await waitFor(() =>
      expect(screen.getByTestId("pheno-breeding-objective-axis-select")).toHaveValue(
        "nose_loudness",
      ),
    );
    fireEvent.change(screen.getByTestId("pheno-breeding-objective-threshold-input"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByTestId("pheno-breeding-objective-add-target"));
    expect(screen.getByTestId("pheno-breeding-objective-target-nose_loudness")).toBeInTheDocument();
  });
});
