/**
 * GDP-BREEDING-NAV-GROWID-001 — Breeding Programs index/create/detail
 * growId retention render pins.
 *
 * Soft #1604 wired Labs *into* `/breeding?growId=`. These pins prove the
 * program pages themselves keep that query on intra-flow navigation.
 * Fail closed: never invent a growId from store or program.grow_id.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";
const PROGRAM_ID = "b7e1c2a0-1111-4000-8000-000000000099";
/** Stored on a program row — must never be invented into hrefs without URL grow context. */
const STORED_GROW = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

const api = vi.hoisted(() => ({
  listBreedingPrograms: vi.fn(),
  createBreedingProgram: vi.fn(),
  getBreedingProgram: vi.fn(),
  listOwnDiaryEntries: vi.fn(),
}));

vi.mock("@/lib/breeding/breedingProgramApi", () => ({
  listBreedingPrograms: (...args: unknown[]) => api.listBreedingPrograms(...args),
  createBreedingProgram: (...args: unknown[]) => api.createBreedingProgram(...args),
  getBreedingProgram: (...args: unknown[]) => api.getBreedingProgram(...args),
  listOwnDiaryEntries: (...args: unknown[]) => api.listOwnDiaryEntries(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) } },
}));

import BreedingProgramsIndex from "@/pages/BreedingProgramsIndex";
import BreedingProgramNew from "@/pages/BreedingProgramNew";
import BreedingProgramDetail from "@/pages/BreedingProgramDetail";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="nav-location">{`${loc.pathname}${loc.search}`}</div>;
}

function hrefForTestId(testId: string): string | null {
  const node = screen.getByTestId(testId);
  const anchor = node.tagName === "A" ? node : node.querySelector("a");
  return anchor?.getAttribute("href") ?? null;
}

function renderIndex(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BreedingProgramsIndex />
    </MemoryRouter>,
  );
}

function renderNew(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <BreedingProgramNew />
    </MemoryRouter>,
  );
}

function renderDetail(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/breeding/:programId" element={<BreedingProgramDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const listedProgram = {
  id: PROGRAM_ID,
  name: "Line-A resin",
  status: "active" as const,
  sop_version: "v1",
  starting_generation: "P1",
  p1_maternal_label: "Afghan #4",
  p1_paternal_label: "Colombian Gold",
  cross_pair_label: null,
  target_traits: [],
  grow_id: null,
  tent_id: null,
  current_step_id: null,
  notes: null,
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

describe("Breeding Programs index/create/detail retain growId", () => {
  beforeEach(() => {
    api.listBreedingPrograms.mockReset();
    api.createBreedingProgram.mockReset();
    api.getBreedingProgram.mockReset();
    api.listOwnDiaryEntries.mockReset();
    api.listOwnDiaryEntries.mockResolvedValue([]);
  });

  it("index header + empty-state CTAs carry growId when ?growId= is present", async () => {
    api.listBreedingPrograms.mockResolvedValue([]);
    renderIndex(`/breeding?growId=${GROW}`);

    expect(hrefForTestId("breeding-programs-new")).toBe(`/breeding/new?growId=${GROW}`);
    await screen.findByTestId("breeding-programs-empty");
    expect(hrefForTestId("breeding-programs-empty-create")).toBe(`/breeding/new?growId=${GROW}`);
  });

  it("index list links carry growId when ?growId= is present", async () => {
    api.listBreedingPrograms.mockResolvedValue([listedProgram]);
    renderIndex(`/breeding?growId=${GROW}`);

    await screen.findByTestId(`breeding-program-link-${PROGRAM_ID}`);
    expect(hrefForTestId(`breeding-program-link-${PROGRAM_ID}`)).toBe(
      `/breeding/${PROGRAM_ID}?growId=${GROW}`,
    );
  });

  it("index fail-closed without grow context keeps unscoped /breeding/new", async () => {
    api.listBreedingPrograms.mockResolvedValue([]);
    renderIndex("/breeding");

    expect(hrefForTestId("breeding-programs-new")).toBe("/breeding/new");
    await screen.findByTestId("breeding-programs-empty");
    expect(hrefForTestId("breeding-programs-empty-create")).toBe("/breeding/new");
  });

  it("index list links fail-closed without grow context when programs exist", async () => {
    api.listBreedingPrograms.mockResolvedValue([listedProgram]);
    renderIndex("/breeding");

    await screen.findByTestId(`breeding-program-link-${PROGRAM_ID}`);
    expect(hrefForTestId(`breeding-program-link-${PROGRAM_ID}`)).toBe(`/breeding/${PROGRAM_ID}`);
    expect(hrefForTestId("breeding-programs-new")).toBe("/breeding/new");
  });

  it("index does not invent growId from program.grow_id when URL lacks grow context", async () => {
    api.listBreedingPrograms.mockResolvedValue([{ ...listedProgram, grow_id: STORED_GROW }]);
    renderIndex("/breeding");

    await screen.findByTestId(`breeding-program-link-${PROGRAM_ID}`);
    expect(hrefForTestId(`breeding-program-link-${PROGRAM_ID}`)).toBe(`/breeding/${PROGRAM_ID}`);
    expect(hrefForTestId("breeding-programs-new")).toBe("/breeding/new");
  });

  it("index prefers URL growId over program.grow_id when both are present", async () => {
    api.listBreedingPrograms.mockResolvedValue([{ ...listedProgram, grow_id: STORED_GROW }]);
    renderIndex(`/breeding?growId=${GROW}`);

    await screen.findByTestId(`breeding-program-link-${PROGRAM_ID}`);
    expect(hrefForTestId(`breeding-program-link-${PROGRAM_ID}`)).toBe(
      `/breeding/${PROGRAM_ID}?growId=${GROW}`,
    );
  });

  it("index does not invent a growId from whitespace query", async () => {
    api.listBreedingPrograms.mockResolvedValue([]);
    renderIndex("/breeding?growId=%20");

    expect(hrefForTestId("breeding-programs-new")).toBe("/breeding/new");
    await screen.findByTestId("breeding-programs-empty");
  });

  it("new-program All programs and Cancel retain growId", async () => {
    const user = userEvent.setup();
    renderNew(`/breeding/new?growId=${GROW}`);

    expect(screen.getByTestId("nav-location")).toHaveTextContent(`/breeding/new?growId=${GROW}`);
    await user.click(screen.getByTestId("breeding-program-new-back"));
    await waitFor(() => {
      expect(screen.getByTestId("nav-location")).toHaveTextContent(`/breeding?growId=${GROW}`);
    });
  });

  it("new-program Cancel retains growId", async () => {
    const user = userEvent.setup();
    renderNew(`/breeding/new?growId=${GROW}`);

    await user.click(screen.getByTestId("breeding-program-new-cancel"));
    await waitFor(() => {
      expect(screen.getByTestId("nav-location")).toHaveTextContent(`/breeding?growId=${GROW}`);
    });
  });

  it("new-program post-create navigation retains growId", async () => {
    api.createBreedingProgram.mockResolvedValue({ programId: PROGRAM_ID });
    const user = userEvent.setup();
    renderNew(`/breeding/new?growId=${GROW}`);

    await user.type(screen.getByLabelText(/Program name/i), "Resin line");
    await user.click(screen.getByRole("button", { name: /Create program/i }));

    await waitFor(() => {
      expect(screen.getByTestId("nav-location")).toHaveTextContent(
        `/breeding/${PROGRAM_ID}?growId=${GROW}`,
      );
    });
  });

  it("new-program fail-closed without grow context stays unscoped", async () => {
    const user = userEvent.setup();
    renderNew("/breeding/new");

    await user.click(screen.getByTestId("breeding-program-new-cancel"));
    await waitFor(() => {
      expect(screen.getByTestId("nav-location")).toHaveTextContent("/breeding");
    });
    expect(screen.getByTestId("nav-location").textContent).not.toContain("growId");
  });

  it("new-program post-create navigation stays unscoped without grow context", async () => {
    api.createBreedingProgram.mockResolvedValue({ programId: PROGRAM_ID });
    const user = userEvent.setup();
    renderNew("/breeding/new");

    await user.type(screen.getByLabelText(/Program name/i), "Resin line");
    await user.click(screen.getByRole("button", { name: /Create program/i }));

    await waitFor(() => {
      expect(screen.getByTestId("nav-location")).toHaveTextContent(`/breeding/${PROGRAM_ID}`);
    });
    expect(screen.getByTestId("nav-location").textContent).not.toContain("growId");
  });

  it("detail All programs link retains growId when present", async () => {
    api.getBreedingProgram.mockResolvedValue({
      program: listedProgram,
      steps: [],
      evidence: [],
    });
    renderDetail(`/breeding/${PROGRAM_ID}?growId=${GROW}`);

    await screen.findByTestId("breeding-program-detail-back");
    expect(hrefForTestId("breeding-program-detail-back")).toBe(`/breeding?growId=${GROW}`);
  });

  it("detail fail-closed without grow context keeps /breeding", async () => {
    api.getBreedingProgram.mockResolvedValue({
      program: listedProgram,
      steps: [],
      evidence: [],
    });
    renderDetail(`/breeding/${PROGRAM_ID}`);

    await screen.findByTestId("breeding-program-detail-back");
    expect(hrefForTestId("breeding-program-detail-back")).toBe("/breeding");
  });

  it("detail does not invent growId from program.grow_id when URL lacks grow context", async () => {
    api.getBreedingProgram.mockResolvedValue({
      program: { ...listedProgram, grow_id: STORED_GROW },
      steps: [],
      evidence: [],
    });
    renderDetail(`/breeding/${PROGRAM_ID}`);

    await screen.findByTestId("breeding-program-detail-back");
    expect(hrefForTestId("breeding-program-detail-back")).toBe("/breeding");
  });

  it("detail prefers URL growId over program.grow_id when both are present", async () => {
    api.getBreedingProgram.mockResolvedValue({
      program: { ...listedProgram, grow_id: STORED_GROW },
      steps: [],
      evidence: [],
    });
    renderDetail(`/breeding/${PROGRAM_ID}?growId=${GROW}`);

    await screen.findByTestId("breeding-program-detail-back");
    expect(hrefForTestId("breeding-program-detail-back")).toBe(`/breeding?growId=${GROW}`);
  });
});
