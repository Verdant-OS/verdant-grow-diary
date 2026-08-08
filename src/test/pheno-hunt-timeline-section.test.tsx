/**
 * Pheno Hunt timeline section — candidate plant links + two-step delete.
 * #568: every hunt on the grow is listed (not only newest).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

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

const activityMock = vi.fn((..._a: unknown[]) => ({ status: "ok", entries: [] as unknown[] }));
vi.mock("@/hooks/usePhenoHuntActivity", () => ({
  usePhenoHuntActivity: (...a: unknown[]) => activityMock(...a),
}));

interface SetupOpts {
  hunts?: { id: string; name: string }[];
  candidatesByHunt?: Record<
    string,
    {
      id: string;
      name: string;
      strain: string | null;
      candidate_label: string | null;
      tent_id: string | null;
    }[]
  >;
}

function setup({ hunts = [{ id: "h1", name: "Hunt A" }], candidatesByHunt = {} }: SetupOpts = {}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "pheno_hunts") {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: hunts, error: null }),
          }),
        }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === "plants") {
      return {
        select: () => ({
          eq: (_col: string, huntId: string) => ({
            order: async () => ({
              data: candidatesByHunt[huntId] ?? [],
              error: null,
            }),
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
      candidatesByHunt: {
        h1: [
          {
            id: "p1",
            name: "Blueberry Auto",
            strain: "Blueberry",
            candidate_label: "#1",
            tent_id: "t1",
          },
        ],
      },
    });
    renderSection();
    const link = (await screen.findByTestId("pheno-hunt-candidate-link-p1")) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/plants/p1?tentId=t1");
    expect(link.textContent).toContain("#1");
    expect(link.textContent).toContain("Blueberry Auto");
  });

  it("lists every hunt on the grow, not only the newest (#568)", async () => {
    setup({
      hunts: [
        { id: "h-new", name: "Newer Hunt" },
        { id: "h-old", name: "Older Hunt" },
      ],
      candidatesByHunt: {
        "h-new": [],
        "h-old": [
          {
            id: "p-old",
            name: "Legacy Plant",
            strain: null,
            candidate_label: "#1",
            tent_id: null,
          },
        ],
      },
    });
    renderSection();
    const section = await screen.findByTestId("pheno-hunt-timeline-section");
    expect(section.getAttribute("data-hunt-count")).toBe("2");
    expect(await screen.findByTestId("pheno-hunt-timeline-hunt-h-new")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-hunt-timeline-hunt-h-old")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-hunt-name-h-old")).toHaveTextContent("Older Hunt");
    expect(screen.getByTestId("pheno-hunt-candidate-link-p-old")).toBeInTheDocument();
  });

  it("requires two-step confirmation before deleting", async () => {
    setup();
    renderSection();
    fireEvent.click(await screen.findByTestId("pheno-hunt-delete-btn-h1"));
    expect(screen.getByTestId("pheno-hunt-delete-confirm-h1")).toBeInTheDocument();
    expect(deleteHuntMock).not.toHaveBeenCalled();
  });

  it("cancel exits the confirmation without calling delete", async () => {
    setup();
    renderSection();
    fireEvent.click(await screen.findByTestId("pheno-hunt-delete-btn-h1"));
    fireEvent.click(screen.getByTestId("pheno-hunt-delete-cancel-btn-h1"));
    expect(screen.queryByTestId("pheno-hunt-delete-confirm-h1")).toBeNull();
    expect(deleteHuntMock).not.toHaveBeenCalled();
  });

  it("confirm calls deletePhenoHunt exactly once and shows success", async () => {
    deleteHuntMock.mockResolvedValueOnce({
      huntId: "h1",
      untaggedPlantIds: [],
    });
    setup();
    renderSection();
    fireEvent.click(await screen.findByTestId("pheno-hunt-delete-btn-h1"));
    fireEvent.click(screen.getByTestId("pheno-hunt-delete-confirm-btn-h1"));
    await waitFor(() => expect(deleteHuntMock).toHaveBeenCalledTimes(1));
    expect(deleteHuntMock).toHaveBeenCalledWith({ huntId: "h1" });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/untagged/i)),
    );
  });

  it("shows failure copy when delete throws", async () => {
    deleteHuntMock.mockRejectedValueOnce(new Error("denied"));
    setup();
    renderSection();
    fireEvent.click(await screen.findByTestId("pheno-hunt-delete-btn-h1"));
    fireEvent.click(screen.getByTestId("pheno-hunt-delete-confirm-btn-h1"));
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
    setup();
    renderSection();
    const block = await screen.findByTestId("pheno-hunt-activity-h1");
    expect(block).toHaveTextContent(/Cross recorded/);
    expect(screen.getByTestId("pheno-timeline-entry-cross:x1")).toBeInTheDocument();
    await waitFor(() => expect(activityMock).toHaveBeenCalledWith("h1"));
  });

  it("omits the activity block when the hunt has no pheno activity", async () => {
    activityMock.mockReturnValue({ status: "ok", entries: [] });
    setup({
      candidatesByHunt: {
        h1: [{ id: "p1", name: "Plant", strain: null, candidate_label: "#1", tent_id: null }],
      },
    });
    renderSection();
    await screen.findByTestId("pheno-hunt-candidate-link-p1");
    expect(screen.queryByTestId("pheno-hunt-activity-h1")).toBeNull();
  });
});
