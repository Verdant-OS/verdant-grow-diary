import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook from "@/components/FieldNotebook";
import { backToNote, emptyDraft } from "@/lib/fieldNotebookOutcomeRules";
import { formatServerClockLabel } from "@/lib/fieldNotebookViewModel";
import {
  adoptNotebookSessionOwner,
  clearNotebookSession,
  forgetNotebookMemory,
  readNotebookDraft,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";

const tent = {
  id: "flower",
  name: "Flower Tent 2",
  weekLabel: "Week 3",
  ageLabel: "Age: 22 days",
  startedLabel: "Jan 8, 2025",
};

const MAY_NOT = "This note may not have saved. Check Timeline. It stays here so you can copy it.";

describe("a note that may not have saved stays with the signed-in account", () => {
  beforeEach(() => {
    clearNotebookSession();
    adoptNotebookSessionOwner("account-a");
  });

  async function landUncertain(reason: string) {
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "dispatched_no_receipt", reason },
      reflection: {
        timelineHasEntry: false,
        countIncludesEntry: false,
        lastActivityIncludesEntry: false,
      },
    });
    const onFindEntry = vi.fn().mockResolvedValue({ availability: "unavailable" });
    render(
      <FieldNotebook
        tents={[tent]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={onFindEntry}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByText(MAY_NOT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    expect(await screen.findByText(MAY_NOT)).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledOnce();
    const box = screen.getByPlaceholderText("Add what you observed.") as HTMLTextAreaElement;
    expect(box.value).toBe("leaves are pale");
    expect(box.readOnly).toBe(false);
    const again = screen.getByRole("button", { name: "Save again (won't duplicate)" });
    expect(again).toBeEnabled();
    const firstKey = onSave.mock.calls[0][0].idempotencyKey;
    fireEvent.click(again);
    expect(await screen.findByText(MAY_NOT)).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][0].idempotencyKey).toBe(firstKey);
    expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    return { onSave };
  }

  it("offers Save again for an offline note and keeps the text", async () => {
    await landUncertain("offline");
  });

  it("offers Save again for a non-definitive rejection and keeps the text", async () => {
    await landUncertain("save_failed");
  });

  it("reloads the note for the same account and hides it from another", () => {
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "uncertain",
      writeBlocked: true,
    });
    forgetNotebookMemory();
    adoptNotebookSessionOwner("account-a");
    expect(readNotebookDraft("flower").note).toBe("leaves are pale");
    expect(readNotebookDraft("flower").writeBlocked).toBe(true);
    adoptNotebookSessionOwner("account-b");
    expect(readNotebookDraft("flower").note).toBe("");
    adoptNotebookSessionOwner("account-a");
    expect(readNotebookDraft("flower").note).toBe("leaves are pale");
  });

  it("renders the saved time in local time", () => {
    const label = formatServerClockLabel("2025-01-08T15:24:00.000Z");
    expect(label).toBeTruthy();
    expect(label).not.toMatch(/UTC/);
    const local = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(Date.parse("2025-01-08T15:24:00.000Z"));
    expect(label).toBe(local);
  });

  it("restores a persisted saving draft as uncertain", () => {
    localStorage.setItem(
      "verdant.fieldNotebook.v1:account-a",
      JSON.stringify([
        {
          ...emptyDraft("flower"),
          note: "leaves are pale",
          phase: "saving",
          attempt: {
            attemptId: "attempt-1",
            tentId: "flower",
            tentName: "Flower Tent 2",
            note: "leaves are pale",
            idempotencyKey: "same-key",
          },
        },
      ]),
    );
    forgetNotebookMemory();
    adoptNotebookSessionOwner("account-a");
    render(
      <FieldNotebook tents={[tent]} readingsByTent={{}} onSave={vi.fn()} onFindEntry={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Saving..." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check Timeline" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save again (won't duplicate)" })).toBeEnabled();
    expect(screen.getByPlaceholderText("Add what you observed.")).toHaveValue("leaves are pale");
  });

  it("keeps typing when storage setItem throws", () => {
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "uncertain",
      writeBlocked: true,
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    render(
      <FieldNotebook tents={[tent]} readingsByTent={{}} onSave={vi.fn()} onFindEntry={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "still typing" },
    });
    expect(screen.getByPlaceholderText("Add what you observed.")).toHaveValue("still typing");
    expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeDisabled();
    setItem.mockRestore();
  });

  it("persists only an uncertain note and clears it on sign-out", () => {
    writeNotebookDraft({ ...emptyDraft("flower"), note: "draft only", phase: "editing" });
    expect(localStorage.getItem("verdant.fieldNotebook.v1:account-a")).toBeNull();
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "uncertain",
      writeBlocked: true,
    });
    expect(localStorage.getItem("verdant.fieldNotebook.v1:account-a")).toContain("leaves are pale");
    adoptNotebookSessionOwner(null);
    expect(localStorage.getItem("verdant.fieldNotebook.v1:account-a")).toBeNull();
  });

  it("Back to note keeps the text visible", () => {
    const returned = backToNote({
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "check_none",
      writeBlocked: true,
    });
    expect(returned.note).toBe("leaves are pale");
    expect(returned.phase).toBe("uncertain");
    expect(returned.writeBlocked).toBe(true);
  });
});
