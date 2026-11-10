import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldNotebook from "@/components/FieldNotebook";
import FieldNotebookTimelineRecovery from "@/components/FieldNotebookTimelineRecovery";
import { clearPrivateClientStateBeforeAuthIdentityChange } from "@/lib/authIdentityTransitionFence";
import {
  acknowledgeFound,
  draftAfterTimelineCheck,
  emptyDraft,
  type FieldNotebookServerEntry,
} from "@/lib/fieldNotebookOutcomeRules";
import { reflectionFromEvidence, sameRecentActivityId } from "@/lib/fieldNotebookReflection";
import {
  adoptNotebookSessionOwner,
  clearNotebookSession,
  notebookDrafts,
  readNotebookDraft,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";

const entry: FieldNotebookServerEntry = {
  growEventId: "11111111-1111-4111-8111-111111111111",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "Bud sites are building.",
  occurredAt: "2025-01-08T15:24:00.000Z",
};

const attempt = {
  attemptId: "a1",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: entry.note,
  idempotencyKey: "idem-1",
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-path">{location.pathname}</div>;
}

describe("field notebook account recovery guards", () => {
  it("keeps recovery drafts inside the active account", () => {
    clearNotebookSession();
    adoptNotebookSessionOwner("account-a");
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "account A private note",
      phase: "uncertain",
      writeBlocked: true,
      recoverySurface: "timeline",
    });
    adoptNotebookSessionOwner("account-b");
    expect(readNotebookDraft("flower").note).toBe("");
    expect(notebookDrafts().some((draft) => draft.note.includes("account A"))).toBe(false);
    expect(
      writeNotebookDraft({ ...emptyDraft("flower"), note: "late write from A" }, "account-a"),
    ).toBe(false);
    expect(readNotebookDraft("flower").note).toBe("");
  });

  it("clears the previous account when the identity fence resolves the next one", () => {
    adoptNotebookSessionOwner("account-a");
    writeNotebookDraft({ ...emptyDraft("flower"), note: "still signed in" });
    const client = { clear: vi.fn() };
    clearPrivateClientStateBeforeAuthIdentityChange(client, null);
    expect(client.clear).toHaveBeenCalledOnce();
    expect(readNotebookDraft("flower").note).toBe("");
    writeNotebookDraft({ ...emptyDraft("flower"), note: "signed out leftover" });
    clearPrivateClientStateBeforeAuthIdentityChange(client, "account-b");
    expect(readNotebookDraft("flower").note).toBe("");
  });

  it("matches last activity through the grow-event id prefix", () => {
    expect(sameRecentActivityId(`grow-event-${entry.growEventId}`, entry.growEventId)).toBe(true);
    expect(sameRecentActivityId(`diary-${entry.growEventId}`, entry.growEventId)).toBe(false);
    const flags = reflectionFromEvidence({
      timelineCaches: [],
      recentItems: [{ id: `grow-event-${entry.growEventId}` }],
      growEventId: entry.growEventId,
    });
    expect(flags.lastActivityIncludesEntry).toBe(true);
  });

  it("keeps text typed while Timeline is checked and confirmed", async () => {
    let finish: (value: FieldNotebookServerEntry[]) => void = () => {};
    const onFindEntry = vi.fn(
      () =>
        new Promise<FieldNotebookServerEntry[]>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <FieldNotebook
        tents={[
          { id: "flower", name: "Flower Tent 2", weekLabel: "—", ageLabel: "—", startedLabel: "—" },
        ]}
        readingsByTent={{}}
        onSave={vi.fn().mockResolvedValue({
          transport: { kind: "acknowledged", entry },
          reflection: {
            timelineHasEntry: false,
            countIncludesEntry: false,
            lastActivityIncludesEntry: false,
          },
        })}
        onFindEntry={onFindEntry}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: entry.note },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    const box = screen.getByPlaceholderText("Add what you observed.") as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    fireEvent.change(box, {
      target: { value: "typed while checking" },
    });
    expect(box).toHaveValue(entry.note);
    finish([entry]);
    expect(await screen.findByRole("button", { name: "Yes, that's it" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, that's it" }));
    expect(await screen.findByPlaceholderText("Add what you observed.")).toHaveValue("");
  });

  it("navigates to Timeline without dropping the in-memory draft", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <LocationProbe />
        <Routes>
          <Route
            path="/"
            element={
              <FieldNotebook
                tents={[
                  {
                    id: "flower",
                    name: "Flower Tent 2",
                    weekLabel: "—",
                    ageLabel: "—",
                    startedLabel: "—",
                  },
                ]}
                readingsByTent={{}}
                onSave={vi.fn().mockResolvedValue({
                  transport: { kind: "dispatched_no_receipt" },
                  reflection: {
                    timelineHasEntry: false,
                    countIncludesEntry: false,
                    lastActivityIncludesEntry: false,
                  },
                })}
                onFindEntry={vi.fn()}
              />
            }
          />
          <Route path="/timeline" element={<FieldNotebookTimelineRecovery />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "maybe saved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("link", { name: "Open Timeline" }));
    expect(await screen.findByTestId("location-path")).toHaveTextContent("/timeline");
    expect(readNotebookDraft("flower").note).toBe("maybe saved");
    expect(readNotebookDraft("flower").writeBlocked).toBe(true);
  });

  it("preserves a newer note when the pure confirm helper clears the attempt", () => {
    const started = {
      ...emptyDraft("flower"),
      note: entry.note,
      attempt,
      phase: "uncertain" as const,
      writeBlocked: true,
    };
    const checked = draftAfterTimelineCheck(started, "newer unsaved text", {
      status: "found",
      entry,
    });
    expect(checked.note).toBe("newer unsaved text");
    expect(checked.phase).toBe("check_found");
    expect(acknowledgeFound(checked).note).toBe("newer unsaved text");
    expect(acknowledgeFound({ ...checked, note: entry.note }).note).toBe("");
  });
});
