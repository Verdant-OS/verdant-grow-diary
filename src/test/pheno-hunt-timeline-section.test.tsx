/**
 * Pheno Hunt timeline section — candidate plant links + two-step delete.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import PhenoHuntTimelineSection from "@/components/PhenoHuntTimelineSection";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

const deleteHuntMock = vi.fn();
vi.mock("@/lib/phenoHuntService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/phenoHuntService")>();
  return {
    ...actual,
    deletePhenoHunt: (...a: unknown[]) => deleteHuntMock(...a),
  };
});

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    error: (m: string) => toastError(m),
  },
}));

// The read-only activity hook is exercised via its own view-model + hook wiring;
// here we mock it so the section test stays deterministic and offline.
const activityMock = vi.fn((..._a: unknown[]) => ({ status: "ok", entries: [] as unknown[] }));
vi.mock("@/hooks/usePhenoHuntActivity", () => ({
  usePhenoHuntActivity: (...a: unknown[]) => activityMock(...a),
}));

interface SetupOpts {
  hunt?: { id: string; name: string } | null;
  candidates?: {
    id: string;
    name: string;
    strain: string | null;
    candidate_label: string | null;
    tent_id: string | null;
  }[];
}

function setup({ hunt = { id: "h1", name: "Hunt A" }, candidates = [] }: SetupOpts) {
  fromMock.mockImplementation((table: string) => {
    if (table === "pheno_hunts") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: hunt, error: null }),
              }),
            }),
          }),
        }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === "plants") {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: candidates, error: null }),
          }),
        }),
      };
    }
    return {} as never;
  });
}

function renderSection() {
  return render(
    <MemoryRouter>
      <PhenoHuntTimelineSection growId="grow-1" />
    </MemoryRouter>,
  );
}

describe("PhenoHuntTimelineSection", () => {
  beforeEach(() => {
    fromMock.mockReset();
    deleteHuntMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    activityMock.mockReset();
    activityMock.mockReturnValue({ status: "ok", entries: [] });
  });

  it("renders candidate plant links pointing to plant detail routes", async () => {
    setup({
      candidates: [
        {
          id: "p1",
          name: "Blueberry Auto",
          strain: "Blueberry",
          candidate_label: "#1",
          tent_id: "t1",
        },
      ],
    });
    renderSection();
    const link = (await screen.findByTestId("pheno-hunt-candidate-link-p1")) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/plants/p1?tentId=t1");
    expect(link.textContent).toContain("#1");
    expect(link.textContent).toContain("Blueberry Auto");
  });

  it("requires two-step confirmation before deleting", async () => {
    setup({ candidates: [] });
    renderSection();
    fireEvent.click(await screen.findByTestId("pheno-hunt-delete-btn"));
    expect(screen.getByTestId("pheno-hunt-delete-confirm")).toBeInTheDocument();
    expect(deleteHuntMock).not.toHaveBeenCalled();
  });

  it("cancel exits the confirmation without calling delete", async () => {
    setup({ candidates: [] });
    renderSection();
    fireEvent.click(await screen.findByTestId("pheno-hunt-delete-btn"));
    fireEvent.click(screen.getByTestId("pheno-hunt-delete-cancel-btn"));
    expect(screen.queryByTestId("pheno-hunt-delete-confirm")).toBeNull();
    expect(deleteHuntMock).not.toHaveBeenCalled();
  });

  it("confirm calls deletePhenoHunt exactly once and shows success", async () => {
    deleteHuntMock.mockResolvedValueOnce({
      huntId: "h1",
      untaggedPlantIds: [],
    });
    setup({ candidates: [] });
    renderSection();
    fireEvent.click(await screen.findByTestId("pheno-hunt-delete-btn"));
    fireEvent.click(screen.getByTestId("pheno-hunt-delete-confirm-btn"));
    await waitFor(() => expect(deleteHuntMock).toHaveBeenCalledTimes(1));
    expect(deleteHuntMock).toHaveBeenCalledWith({ huntId: "h1" });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/untagged/i)),
    );
  });

  it("shows failure copy when delete throws", async () => {
    deleteHuntMock.mockRejectedValueOnce(new Error("denied"));
    setup({ candidates: [] });
    renderSection();
    fireEvent.click(await screen.findByTestId("pheno-hunt-delete-btn"));
    fireEvent.click(screen.getByTestId("pheno-hunt-delete-confirm-btn"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/Could not delete/i)),
    );
  });

  it("renders the pheno activity timeline for the resolved hunt", async () => {
    activityMock.mockReturnValue({
      status: "ok",
      entries: [
        {
          id: "cross:x1",
          kind: "cross",
          occurredAt: "2026-07-06",
          title: "Cross recorded — GasCake S1",
          detail: "♀ Gas × Self (Gas)",
          badge: "S1 / Selfed",
        },
      ],
    });
    setup({ candidates: [] });
    renderSection();
    // The activity block appears once the hunt resolves...
    const block = await screen.findByTestId("pheno-hunt-activity");
    expect(block).toHaveTextContent(/Cross recorded/);
    expect(screen.getByTestId("pheno-timeline-entry-cross:x1")).toBeInTheDocument();
    // ...and the hook is scoped to the resolved hunt id, not the grow id.
    await waitFor(() => expect(activityMock).toHaveBeenCalledWith("h1"));
  });

  it("omits the activity block when the hunt has no pheno activity", async () => {
    activityMock.mockReturnValue({ status: "ok", entries: [] });
    setup({
      candidates: [{ id: "p1", name: "Plant", strain: null, candidate_label: "#1", tent_id: null }],
    });
    renderSection();
    // Wait for the section to render (candidate link present), then assert no activity.
    await screen.findByTestId("pheno-hunt-candidate-link-p1");
    expect(screen.queryByTestId("pheno-hunt-activity")).toBeNull();
  });
});
