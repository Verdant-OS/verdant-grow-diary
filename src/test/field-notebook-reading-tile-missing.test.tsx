import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldNotebook from "@/components/FieldNotebook";
import {
  FIELD_NOTEBOOK_READING_ABSENT,
  formatReadingValue,
  type ReadingSlot,
} from "@/lib/fieldNotebookViewModel";

// Live check 2026-11-23 on a fresh Free account: the dashboard tent card showed
// a bare "—" in all four reading tiles (TEMP, RH, VPD, PPFD) while the tent
// panel right under it said "Missing" for the same readings.

const tent = {
  id: "tent-1",
  name: "Tent 1",
  weekLabel: "Week 1",
  ageLabel: "Age: started today",
  startedLabel: "Nov 23, 2026",
};

function slot(partial: Partial<ReadingSlot> & Pick<ReadingSlot, "label">): ReadingSlot {
  return {
    value: null,
    source: null,
    ageLabel: null,
    capturedAtMs: null,
    ...partial,
  };
}

function tiles() {
  const grid = screen.getByTestId("field-notebook-readings");
  return Array.from(grid.children) as HTMLElement[];
}

function renderNotebook(readings: ReadingSlot[]) {
  render(
    <FieldNotebook
      tents={[tent]}
      readingsByTent={{ [tent.id]: readings }}
      onSave={vi.fn()}
      onFindEntry={vi.fn()}
    />,
  );
}

describe("field notebook reading tiles with no reading", () => {
  it("names an absent reading Missing, and keeps zero as a real value", () => {
    expect(FIELD_NOTEBOOK_READING_ABSENT).toBe("Missing");
    expect(formatReadingValue(null)).toBe("Missing");
    expect(formatReadingValue("   ")).toBe("Missing");
    expect(formatReadingValue("0")).toBe("0");
    expect(formatReadingValue("75.2 °F")).toBe("75.2 °F");
  });

  it("shows Missing, never a bare dash, in every tile of a tent with no readings", () => {
    renderNotebook([]);
    const shown = tiles();
    expect(shown).toHaveLength(4);
    for (const [index, label] of ["TEMP", "RH", "VPD", "PPFD"].entries()) {
      const tile = within(shown[index]);
      expect(tile.getByText(label)).toBeInTheDocument();
      expect(tile.getByText("Missing")).toBeInTheDocument();
    }
    expect(screen.getByTestId("field-notebook-readings").textContent).not.toContain("—");
  });

  it("keeps a real reading and marks only the absent ones Missing", () => {
    renderNotebook([
      slot({
        label: "TEMP",
        value: "75.2 °F",
        source: "Manual",
        ageLabel: "3 min ago",
        capturedAtMs: 1_000,
      }),
    ]);
    const [temp, rh, vpd, ppfd] = tiles();
    expect(within(temp).getByText("75.2 °F")).toBeInTheDocument();
    expect(within(temp).getByText("Manual · 3 min ago")).toBeInTheDocument();
    expect(within(temp).queryByText("Missing")).not.toBeInTheDocument();
    for (const tile of [rh, vpd, ppfd]) {
      expect(within(tile).getByText("Missing")).toBeInTheDocument();
    }
  });
});
