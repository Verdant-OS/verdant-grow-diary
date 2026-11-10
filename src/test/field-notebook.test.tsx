import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, { type FieldNotebookSaveResponse } from "@/components/FieldNotebook";
import type { FieldNotebookServerEntry } from "@/lib/fieldNotebookOutcomeRules";
import { clearNotebookSession } from "@/lib/fieldNotebookSession";
import type { ReadingSlot } from "@/lib/fieldNotebookViewModel";

const tents = [
  { id: "veg", name: "Veg", weekLabel: "Week 1", ageLabel: "Age: —", startedLabel: "—" },
  {
    id: "flower",
    name: "Flower Tent 2",
    weekLabel: "Week 3",
    ageLabel: "Age: 22 days",
    startedLabel: "Jan 8, 2025",
  },
];

const temp: ReadingSlot = {
  label: "TEMP",
  value: "76°F",
  source: "EcoWitt",
  ageLabel: "3 min ago",
  capturedAtMs: 5_000,
};
const rh: ReadingSlot = {
  label: "RH",
  value: "52%",
  source: "EcoWitt",
  ageLabel: "3 min ago",
  capturedAtMs: 5_000,
};
const vpd: ReadingSlot = {
  label: "VPD",
  value: "1.2 kPa",
  source: "EcoWitt",
  ageLabel: "3 min ago",
  capturedAtMs: 5_000,
};

const entry: FieldNotebookServerEntry = {
  growEventId: "11111111-1111-4111-8111-111111111111",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "Bud sites are building.",
  occurredAt: "2025-01-08T15:24:00.000Z",
};

const reflected: FieldNotebookSaveResponse = {
  transport: { kind: "acknowledged", entry },
  reflection: {
    timelineHasEntry: true,
    countIncludesEntry: true,
    lastActivityIncludesEntry: true,
  },
};

describe("FieldNotebook", () => {
  beforeEach(() => {
    clearNotebookSession();
  });

  it("names the save button with the selected tent and shows source only for present readings", () => {
    render(
      <FieldNotebook
        tents={tents}
        readingsByTent={{ flower: [temp, rh, vpd] }}
        onSave={vi.fn()}
        onFindEntry={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Flower Tent 2" }));
    expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeInTheDocument();
    expect(screen.getAllByText("EcoWitt · 3 min ago").length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Add what you observed.")).toBeInTheDocument();
  });

  it("shows the saved line only after a server timestamp and a completed reflection", async () => {
    const onSave = vi.fn().mockResolvedValue(reflected);
    render(
      <FieldNotebook
        tents={[tents[1]]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: entry.note },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByTestId("field-notebook-status")).toHaveTextContent(
      /Saved to Flower Tent 2/,
    );
    expect(screen.getAllByRole("link", { name: "View in Timeline" })).toHaveLength(1);
    expect(screen.getByTestId("field-notebook-status")).not.toHaveTextContent("View in Timeline");
  });

  it("offers one Retry on a definitive rejection and keeps the note", async () => {
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "definitive_rejection", reason: "target_not_owned" },
      reflection: {
        timelineHasEntry: false,
        countIncludesEntry: false,
        lastActivityIncludesEntry: false,
      },
    });
    render(
      <FieldNotebook
        tents={[tents[1]]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "still here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add what you observed.")).toHaveValue("still here");
    expect(screen.queryByRole("button", { name: "Check Timeline" })).not.toBeInTheDocument();
  });

  it("keeps an uncertain note without Retry and blocks a second save after Back to note", async () => {
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "timeout_after_dispatch" },
      reflection: {
        timelineHasEntry: false,
        countIncludesEntry: false,
        lastActivityIncludesEntry: false,
      },
    });
    const onFindEntry = vi.fn().mockResolvedValue([]);
    render(
      <FieldNotebook
        tents={[tents[1]]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={onFindEntry}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "maybe saved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    expect(screen.getByRole("button", { name: "Check Timeline" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add what you observed.")).toHaveValue("maybe saved");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("clears the draft only after Yes, that's it", async () => {
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "acknowledged", entry },
      reflection: {
        timelineHasEntry: false,
        countIncludesEntry: false,
        lastActivityIncludesEntry: false,
      },
    });
    const onFindEntry = vi.fn().mockResolvedValue([entry]);
    render(
      <FieldNotebook
        tents={[tents[1]]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={onFindEntry}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: entry.note },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    expect(await screen.findByRole("button", { name: "Yes, that's it" })).toBeInTheDocument();
    expect(screen.getByText("Entry found")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Add what you observed.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, that's it" }));
    expect(await screen.findByPlaceholderText("Add what you observed.")).toHaveValue("");
  });
});
