/**
 * "Add candidates" in the hunt workspace and "Add to pheno hunt" on the plant
 * page. Mirrors the 2026-10-21 report: a hunt with 16 candidates from setup,
 * and two plants created later in the same grow that could not be added.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const service = vi.hoisted(() => ({
  listPhenoHuntGrowPlants: vi.fn(),
  addPhenoHuntCandidates: vi.fn(),
  loadPlantPhenoHuntOffer: vi.fn(),
}));
vi.mock("@/lib/phenoHuntAddCandidatesService", () => service);
const access = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/hooks/useMyEntitlements", () => ({ useMyEntitlements: () => ({ entitlement: {} }) }));
vi.mock("@/lib/featureEntitlements", () => ({ canWriteFeatureData: () => access.canWrite }));

import PhenoHuntAddCandidatesDialog from "@/components/PhenoHuntAddCandidatesDialog";
import AddToPhenoHuntButton from "@/components/AddToPhenoHuntButton";
import { PHENO_HUNT_ADD_CANDIDATES_COPY } from "@/lib/phenoHuntAddCandidatesRules";

const HUNT = "78523688-2baf-4124-9706-ab03ad6ca7b7";
const GROW = "grow-tray";

const plant = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  grow_id: GROW,
  pheno_hunt_id: null,
  is_archived: false,
  ...over,
});

const SIXTEEN = Array.from({ length: 16 }, (_, i) =>
  plant(`cand-${i + 1}`, `Candidate ${i + 1}`, { pheno_hunt_id: HUNT }),
);
const GROW_PLANTS = [
  ...SIXTEEN,
  plant("ashato-3", "Ashato #3"),
  plant("ozp-3", "Original Z x Platinum #3"),
  plant("other-grow", "Other grow plant", { grow_id: "grow-other" }),
  plant("other-hunt", "In another hunt", { pheno_hunt_id: "hunt-other" }),
  plant("archived", "Archived plant", { is_archived: true }),
];

beforeEach(() => {
  service.listPhenoHuntGrowPlants.mockReset();
  service.addPhenoHuntCandidates.mockReset();
  service.loadPlantPhenoHuntOffer.mockReset();
  access.canWrite = true;
});
afterEach(() => cleanup());

describe("workspace Add candidates dialog", () => {
  it("lists only the grow's plants that are not candidates and adds the picked ones", async () => {
    service.listPhenoHuntGrowPlants.mockResolvedValue({ ok: true, plants: GROW_PLANTS });
    service.addPhenoHuntCandidates.mockResolvedValue({
      added: [
        { plantId: "ashato-3", candidateNumber: 17, candidateLabel: "#17" },
        { plantId: "ozp-3", candidateNumber: 18, candidateLabel: "#18" },
      ],
      failed: [],
    });
    const onAdded = vi.fn();
    render(<PhenoHuntAddCandidatesDialog huntId={HUNT} growId={GROW} onAdded={onAdded} />);
    fireEvent.click(screen.getByTestId("pheno-add-candidates-open"));

    const list = await screen.findByTestId("pheno-add-candidates-list");
    const options = within(list).getAllByRole("checkbox");
    expect(options.map((o) => o.closest("label")?.textContent)).toEqual([
      "Ashato #3",
      "Original Z x Platinum #3",
    ]);
    expect(service.listPhenoHuntGrowPlants).toHaveBeenCalledWith(GROW);

    const submit = screen.getByTestId("pheno-add-candidates-submit");
    expect(submit).toBeDisabled();
    // Click order does not change numbering: ids go to the service in list order.
    fireEvent.click(within(list).getByLabelText("Original Z x Platinum #3"));
    fireEvent.click(within(list).getByLabelText("Ashato #3"));
    fireEvent.click(submit);

    await waitFor(() =>
      expect(screen.getByTestId("pheno-add-candidates-result")).toHaveTextContent(
        "Added 2 candidates: #17, #18.",
      ),
    );
    expect(service.addPhenoHuntCandidates).toHaveBeenCalledTimes(1);
    expect(service.addPhenoHuntCandidates).toHaveBeenCalledWith({
      huntId: HUNT,
      plantIds: ["ashato-3", "ozp-3"],
    });
    expect(screen.getByTestId("pheno-add-candidates-empty")).toBeInTheDocument();
    // The workspace reload unmounts this subtree, so it waits until the grower
    // has read the results and closed the dialog.
    expect(onAdded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it("reloads on close after a partial failure, and not at all after a clean failure", async () => {
    service.listPhenoHuntGrowPlants.mockResolvedValue({ ok: true, plants: GROW_PLANTS });
    service.addPhenoHuntCandidates.mockResolvedValue({
      added: [],
      failed: [{ plantId: "ashato-3", reason: "cleanup_unconfirmed" }],
    });
    const onAdded = vi.fn();
    render(<PhenoHuntAddCandidatesDialog huntId={HUNT} growId={GROW} onAdded={onAdded} />);
    fireEvent.click(screen.getByTestId("pheno-add-candidates-open"));
    fireEvent.click(await screen.findByLabelText("Ashato #3"));
    fireEvent.click(screen.getByTestId("pheno-add-candidates-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("pheno-add-candidates-result")).toHaveTextContent(
        PHENO_HUNT_ADD_CANDIDATES_COPY.cleanup_unconfirmed,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it("shows why a plant was not added and does not reload when nothing was added", async () => {
    service.listPhenoHuntGrowPlants.mockResolvedValue({ ok: true, plants: GROW_PLANTS });
    service.addPhenoHuntCandidates.mockResolvedValue({
      added: [],
      failed: [{ plantId: "ashato-3", reason: "entitlement" }],
    });
    const onAdded = vi.fn();
    render(<PhenoHuntAddCandidatesDialog huntId={HUNT} growId={GROW} onAdded={onAdded} />);
    fireEvent.click(screen.getByTestId("pheno-add-candidates-open"));
    fireEvent.click(await screen.findByLabelText("Ashato #3"));
    fireEvent.click(screen.getByTestId("pheno-add-candidates-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("pheno-add-candidates-result")).toHaveTextContent(
        `Ashato #3: ${PHENO_HUNT_ADD_CANDIDATES_COPY.entitlement}`,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("stays open while an add is in flight, then reloads when closed after it lands", async () => {
    service.listPhenoHuntGrowPlants.mockResolvedValue({ ok: true, plants: GROW_PLANTS });
    let finish: (value: unknown) => void = () => {};
    service.addPhenoHuntCandidates.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const onAdded = vi.fn();
    render(<PhenoHuntAddCandidatesDialog huntId={HUNT} growId={GROW} onAdded={onAdded} />);
    fireEvent.click(screen.getByTestId("pheno-add-candidates-open"));
    fireEvent.click(await screen.findByLabelText("Ashato #3"));
    fireEvent.click(screen.getByTestId("pheno-add-candidates-submit"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("pheno-add-candidates-dialog")).toBeInTheDocument();
    await act(async () =>
      finish({
        added: [{ plantId: "ashato-3", candidateNumber: 17, candidateLabel: "#17" }],
        failed: [],
      }),
    );
    expect(screen.getByTestId("pheno-add-candidates-result")).toHaveTextContent(
      "Added 1 candidate: #17.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it("says nothing was changed when the grow's plants cannot be read", async () => {
    service.listPhenoHuntGrowPlants.mockResolvedValue({ ok: false });
    render(<PhenoHuntAddCandidatesDialog huntId={HUNT} growId={GROW} onAdded={vi.fn()} />);
    fireEvent.click(screen.getByTestId("pheno-add-candidates-open"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was changed");
    expect(service.addPhenoHuntCandidates).not.toHaveBeenCalled();
  });
});

describe("plant page Add to pheno hunt", () => {
  const hunt = { id: HUNT, grow_id: GROW, name: "Tray Pheno Hunt Oct 2026" };

  it("is offered for a plant of the hunt's grow that is not a candidate, and adds it", async () => {
    service.loadPlantPhenoHuntOffer.mockResolvedValue({
      plant: plant("ashato-3", "Ashato #3"),
      hunt,
    });
    service.addPhenoHuntCandidates.mockResolvedValue({
      added: [{ plantId: "ashato-3", candidateNumber: 17, candidateLabel: "#17" }],
      failed: [],
    });
    render(<AddToPhenoHuntButton plantId="ashato-3" />);
    fireEvent.click(await screen.findByTestId("add-to-pheno-hunt"));
    await waitFor(() =>
      expect(screen.getByTestId("add-to-pheno-hunt-result")).toHaveTextContent(
        "Added 1 candidate: #17.",
      ),
    );
    expect(service.addPhenoHuntCandidates).toHaveBeenCalledWith({
      huntId: HUNT,
      plantIds: ["ashato-3"],
    });
  });

  it("keeps the button after a failed add so the grower can retry", async () => {
    service.loadPlantPhenoHuntOffer.mockResolvedValue({
      plant: plant("ashato-3", "Ashato #3"),
      hunt,
    });
    service.addPhenoHuntCandidates
      .mockResolvedValueOnce({ added: [], failed: [{ plantId: "ashato-3", reason: "network" }] })
      .mockResolvedValueOnce({
        added: [{ plantId: "ashato-3", candidateNumber: 17, candidateLabel: "#17" }],
        failed: [],
      });
    render(<AddToPhenoHuntButton plantId="ashato-3" />);
    fireEvent.click(await screen.findByTestId("add-to-pheno-hunt"));
    await waitFor(() =>
      expect(screen.getByTestId("add-to-pheno-hunt-result")).toHaveTextContent(
        PHENO_HUNT_ADD_CANDIDATES_COPY.network,
      ),
    );
    fireEvent.click(screen.getByTestId("add-to-pheno-hunt"));
    await waitFor(() =>
      expect(screen.getByTestId("add-to-pheno-hunt-result")).toHaveTextContent(
        "Added 1 candidate: #17.",
      ),
    );
    expect(screen.queryByTestId("add-to-pheno-hunt")).toBeNull();
    expect(service.addPhenoHuntCandidates).toHaveBeenCalledTimes(2);
  });

  it("ignores an add that finishes after the page moved to another plant", async () => {
    service.loadPlantPhenoHuntOffer.mockImplementation(async (id: string) => ({
      plant: plant(id, id === "ashato-3" ? "Ashato #3" : "Original Z x Platinum #3"),
      hunt,
    }));
    let finish: (value: unknown) => void = () => {};
    service.addPhenoHuntCandidates.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { rerender } = render(<AddToPhenoHuntButton plantId="ashato-3" />);
    fireEvent.click(await screen.findByTestId("add-to-pheno-hunt"));
    rerender(<AddToPhenoHuntButton plantId="ozp-3" />);
    await waitFor(() => expect(service.loadPlantPhenoHuntOffer).toHaveBeenCalledWith("ozp-3"));
    await act(async () =>
      finish({
        added: [{ plantId: "ashato-3", candidateNumber: 17, candidateLabel: "#17" }],
        failed: [],
      }),
    );
    expect(screen.queryByTestId("add-to-pheno-hunt-result")).toBeNull();
    expect(await screen.findByTestId("add-to-pheno-hunt")).toBeEnabled();
  });

  it("is not offered without Pheno Tracker write access", async () => {
    access.canWrite = false;
    service.loadPlantPhenoHuntOffer.mockResolvedValue({
      plant: plant("ashato-3", "Ashato #3"),
      hunt,
    });
    render(<AddToPhenoHuntButton plantId="ashato-3" />);
    await waitFor(() => expect(service.loadPlantPhenoHuntOffer).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByTestId("add-to-pheno-hunt")).toBeNull();
    expect(service.addPhenoHuntCandidates).not.toHaveBeenCalled();
  });

  it.each([
    [
      "already a candidate",
      { plant: plant("cand-1", "Candidate 1", { pheno_hunt_id: HUNT }), hunt },
    ],
    ["archived", { plant: plant("archived", "Archived plant", { is_archived: true }), hunt }],
    ["no single hunt for the grow", null],
  ])("is not offered when the plant is %s", async (_label, offer) => {
    service.loadPlantPhenoHuntOffer.mockResolvedValue(offer);
    render(<AddToPhenoHuntButton plantId="p" />);
    await waitFor(() => expect(service.loadPlantPhenoHuntOffer).toHaveBeenCalledWith("p"));
    expect(screen.queryByTestId("add-to-pheno-hunt")).toBeNull();
  });
});
