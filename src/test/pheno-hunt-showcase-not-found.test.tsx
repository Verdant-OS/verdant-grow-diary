/**
 * pheno-hunt-showcase-not-found.test — the live showcase must never dress a
 * missing hunt in demo data.
 *
 * Five states, five behaviors:
 *  - signed-in + hunt id + workspace settled with zero candidates → explicit
 *    not-found notice (source "not_found"), NO demo sections beneath;
 *  - signed-in + hunt id + either read failed → retryable unavailable notice,
 *    never not-found and never demo;
 *  - signed-in + hunt id + reads still in flight → loading, never a premature
 *    not-found verdict or demo fixture rows;
 *  - requested hunt + auth still resolving → the same empty loading shell,
 *    never a public-demo flash before the session hydrates;
 *  - signed out → the labeled demo, unchanged.
 *
 * usePhenoHuntWorkspace / usePhenoKeepers / auth are mocked the same way the
 * other showcase-adjacent suites mock their read hooks — no Supabase.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const harness = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authLoading: false,
  ws: {} as Record<string, unknown>,
  kp: {} as Record<string, unknown>,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: harness.user, session: null, loading: harness.authLoading }),
}));

vi.mock("@/hooks/usePhenoHuntWorkspace", () => ({
  usePhenoHuntWorkspace: () => harness.ws,
}));

vi.mock("@/hooks/usePhenoKeepers", () => ({
  usePhenoKeepers: () => harness.kp,
}));

import PhenoHuntShowcase from "@/pages/PhenoHuntShowcase";

/** The fields usePhenoHuntView actually reads off the workspace hook. */
function wsState(over: Record<string, unknown> = {}) {
  return {
    status: "ok",
    hunt: null,
    candidates: [],
    totalCandidateCount: 0,
    decisionsByPlant: {},
    scoresByPlant: {},
    smokeByPlant: {},
    roundsByKey: {},
    roundLoadStates: {},
    loadRound: vi.fn(),
    reload: vi.fn(),
    ...over,
  };
}

/** The fields usePhenoHuntView actually reads off the keepers hook. */
function kpState(over: Record<string, unknown> = {}) {
  return {
    status: "ok",
    hunt: null,
    keepers: [],
    reversedKeeperIds: [],
    reversals: [],
    clonesByKeeper: {},
    crosses: [],
    reload: vi.fn(),
    ...over,
  };
}

function renderShowcase() {
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/hunt-1/showcase"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/showcase" element={<PhenoHuntShowcase />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  harness.user = null;
  harness.authLoading = false;
  harness.ws = {};
  harness.kp = {};
});

describe("PhenoHuntShowcase — missing hunt is never demo", () => {
  it("signed-in + hunt id + loaded empty → explicit not-found, zero demo sections", () => {
    harness.user = { id: "grower-1" };
    harness.ws = wsState(); // status "ok", zero candidates
    harness.kp = kpState();
    renderShowcase();

    expect(screen.getByRole("main")).toBe(screen.getByTestId("pheno-hunt-showcase-page"));
    expect(screen.getByRole("heading", { level: 1, name: "Pheno Hunt" })).toBeInTheDocument();
    const banner = screen.getByTestId("pheno-hunt-showcase-source");
    expect(banner.textContent).toMatch(/not found or has no candidates/i);
    expect(banner.textContent).not.toMatch(/demo|sample data/i);
    expect(screen.getByTestId("pheno-hunt-showcase-not-found-link")).toHaveAttribute(
      "href",
      "/pheno-hunts",
    );

    // No demo data may stand in for a specific missing hunt.
    expect(screen.queryByTestId("pheno-hunt-showcase-pack")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-fight")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-contenders")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-family-tree")).not.toBeInTheDocument();
  });

  it("signed-in + hunt id + read failure → unavailable with retry, not not-found or demo", () => {
    harness.user = { id: "grower-1" };
    const reloadWorkspace = vi.fn();
    const reloadKeepers = vi.fn();
    harness.ws = wsState({ status: "error", reload: reloadWorkspace });
    harness.kp = kpState({ reload: reloadKeepers });
    renderShowcase();

    expect(screen.getByTestId("pheno-hunt-showcase-source")).toHaveTextContent(
      /temporarily unavailable/i,
    );
    expect(screen.queryByTestId("pheno-hunt-showcase-not-found-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-hunt-showcase-pack")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-fight")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-contenders")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-family-tree")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pheno-hunt-showcase-retry"));
    expect(reloadWorkspace).toHaveBeenCalledTimes(1);
    expect(reloadKeepers).toHaveBeenCalledTimes(1);
  });

  it("signed-in + hunt id + reads in flight → loading with no demo fixture leak", () => {
    harness.user = { id: "grower-1" };
    harness.ws = wsState({ status: "loading" });
    harness.kp = kpState({ status: "loading" });
    renderShowcase();

    const banner = screen.getByTestId("pheno-hunt-showcase-source");
    expect(banner.textContent).toMatch(/loading your hunt/i);
    expect(banner.textContent).not.toMatch(/not found/i);
    expect(screen.queryByTestId("pheno-hunt-showcase-pack")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-fight")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-contenders")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-family-tree")).not.toBeInTheDocument();
  });

  it("signed-in + hunt id + pre-effect mount (both hooks idle) still counts as loading", () => {
    harness.user = { id: "grower-1" };
    harness.ws = wsState({ status: "idle" });
    harness.kp = kpState({ status: "idle" });
    renderShowcase();

    expect(screen.getByRole("main")).toBe(screen.getByTestId("pheno-hunt-showcase-page"));
    expect(screen.getByRole("heading", { level: 1, name: "Pheno Hunt" })).toBeInTheDocument();
    const banner = screen.getByTestId("pheno-hunt-showcase-source");
    expect(banner.textContent).toMatch(/loading your hunt/i);
    expect(banner.textContent).not.toMatch(/not found/i);
  });

  it("hunt id + auth still resolving → loading with no public demo flash", () => {
    harness.authLoading = true;
    harness.ws = wsState({ status: "idle" });
    harness.kp = kpState({ status: "idle" });
    renderShowcase();

    expect(screen.getByTestId("pheno-hunt-showcase-source")).toHaveTextContent(
      /loading your hunt/i,
    );
    expect(screen.queryByTestId("pheno-hunt-showcase-pack")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-fight")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-contenders")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-family-tree")).not.toBeInTheDocument();
  });

  it("signed out → the labeled demo, unchanged", () => {
    harness.user = null;
    harness.ws = wsState({ status: "idle" }); // null hunt id → reads never fire
    harness.kp = kpState({ status: "idle" });
    renderShowcase();

    const banner = screen.getByTestId("pheno-hunt-showcase-source");
    expect(banner.textContent).toMatch(/^Demo — /);
    expect(banner.textContent).toMatch(/sample data/i);
    expect(banner.textContent).not.toMatch(/not found/i);

    // The demo walkthrough still renders in full, without the not-found link.
    expect(screen.getByTestId("pheno-hunt-showcase-pack")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-fight")).toBeInTheDocument();
    expect(screen.queryByTestId("pheno-hunt-showcase-not-found-link")).not.toBeInTheDocument();
  });
});
