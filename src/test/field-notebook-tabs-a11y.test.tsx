import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, { type FieldNotebookSaveResponse } from "@/components/FieldNotebook";
import { clearNotebookSession } from "@/lib/fieldNotebookSession";

const tents = [
  { id: "veg", name: "Veg", weekLabel: "Week 1", ageLabel: "Age: —", startedLabel: "—" },
  {
    id: "flower",
    name: "Flower",
    weekLabel: "Week 3",
    ageLabel: "Age: 22 days",
    startedLabel: "—",
  },
  { id: "dry", name: "Dry", weekLabel: "Week 9", ageLabel: "Age: 60 days", startedLabel: "—" },
];

const saved: FieldNotebookSaveResponse = {
  transport: {
    kind: "acknowledged",
    entry: {
      growEventId: "11111111-1111-4111-8111-111111111111",
      tentId: "veg",
      tentName: "Veg",
      note: "Leaves praying.",
      occurredAt: "2025-01-08T15:24:00.000Z",
    },
  },
  reflection: { timelineHasEntry: true, countIncludesEntry: true, lastActivityIncludesEntry: true },
};

function renderNotebook(onSave = vi.fn()) {
  return render(
    <FieldNotebook tents={tents} readingsByTent={{}} onSave={onSave} onFindEntry={vi.fn()} />,
  );
}

describe("FieldNotebook tabs and status accessibility (VER-508)", () => {
  beforeEach(() => {
    clearNotebookSession();
  });

  it("keeps one tab stop and moves selection and focus with arrow, Home and End keys", () => {
    renderNotebook();
    const tab = (name: string) => screen.getByRole("tab", { name });

    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([0, -1, -1]);

    tab("Veg").focus();
    fireEvent.keyDown(tab("Veg"), { key: "ArrowRight" });
    expect(tab("Flower")).toHaveAttribute("aria-selected", "true");
    expect(tab("Flower")).toHaveFocus();
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(tab("Flower"), { key: "End" });
    expect(tab("Dry")).toHaveFocus();
    fireEvent.keyDown(tab("Dry"), { key: "ArrowRight" });
    expect(tab("Veg")).toHaveFocus();
    fireEvent.keyDown(tab("Veg"), { key: "ArrowLeft" });
    expect(tab("Dry")).toHaveFocus();
    fireEvent.keyDown(tab("Dry"), { key: "Home" });
    expect(tab("Veg")).toHaveFocus();
    expect(tab("Veg")).toHaveAttribute("aria-selected", "true");
  });

  it("links each tab to a tabpanel labelled by the selected tab", () => {
    renderNotebook();
    fireEvent.click(screen.getByRole("tab", { name: "Flower" }));

    const panel = screen.getByRole("tabpanel");
    const selected = screen.getByRole("tab", { selected: true });
    expect(panel).toHaveAccessibleName("Flower");
    expect(panel).toHaveTextContent("Flower · Week 3");
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("aria-controls", panel.id);
    }
    expect(panel).toHaveAttribute("aria-labelledby", selected.id);
  });

  it("announces the save result through a polite status region that exists before the save", async () => {
    let resolve: (value: FieldNotebookSaveResponse) => void = () => {};
    const onSave = vi.fn(
      () => new Promise<FieldNotebookSaveResponse>((settle) => (resolve = settle)),
    );
    renderNotebook(onSave);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toBeEmptyDOMElement();

    fireEvent.change(screen.getByLabelText("Observation"), {
      target: { value: "Leaves praying." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Veg" }));
    await act(async () => resolve(saved));

    await waitFor(() => expect(status).toHaveTextContent(/Saved to Veg/));
    expect(screen.getByRole("status")).toBe(status);
  });

  it("gives the note and actions the shared focus ring and a 44px minimum height", () => {
    renderNotebook();
    const controls = [
      ...screen.getAllByRole("tab"),
      screen.getByLabelText("Observation"),
      screen.getByRole("button", { name: "Save to Veg" }),
    ];
    for (const control of controls) {
      expect(control).toHaveClass("focus-visible:ring-2", "focus-visible:ring-ring");
    }
    for (const control of [...screen.getAllByRole("tab"), controls.at(-1)!]) {
      expect(control).toHaveClass("min-h-11");
      expect(control.className).not.toMatch(/(^|\s)h-(9|10)(\s|$)/);
    }
  });
});
