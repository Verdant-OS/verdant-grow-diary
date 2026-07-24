/**
 * pheno-hunt-showcase-not-found.test — the live showcase must never dress a
 * missing hunt in demo data.
 *
 * Three states, three behaviors:
 *  - signed-in + hunt id + workspace settled with zero candidates → explicit
 *    not-found notice (source "not_found"), NO demo sections beneath;
 *  - signed-in + hunt id + reads still in flight → loading, never a premature
 *    not-found (and never a premature "Demo" verdict);
 *  - signed out → the labeled demo, unchanged.
 *
 * usePhenoHuntWorkspace / usePhenoKeepers / auth are mocked the same way the
 * other showcase-adjacent suites mock their read hooks — no Supabase.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const harness = vi.hoisted(() => ({
  user: null as { id: string } | null,
  ws: {} as Record<string, unknown>,
  kp: {} as Record<string, unknown>,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: harness.user, session: null, loading: false }),
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
    loadRound: vi.fn(),
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
  harness.ws = {};
  harness.kp = {};
});

describe("PhenoHuntShowcase — missing hunt is never demo", () => {
  it("signed-in + hunt id + loaded empty → explicit not-found, zero demo sections", () => {
    harness.user = { id: "grower-1" };
    harness.ws = wsState(); // status "ok", zero candidates
    harness.kp = kpState();
    renderShowcase();

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

  it("signed-in + hunt id + workspace error (e.g. no pheno_hunts row) → not-found, not demo", () => {
    harness.user = { id: "grower-1" };
    harness.ws = wsState({ status: "error" });
    harness.kp = kpState({ status: "error" });
    renderShowcase();

    expect(screen.getByTestId("pheno-hunt-showcase-source").textContent).toMatch(
      /not found or has no candidates/i,
    );
    expect(screen.queryByTestId("pheno-hunt-showcase-pack")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pheno-fight")).not.toBeInTheDocument();
  });

  it("signed-in + hunt id + reads in flight → loading, no premature not-found", () => {
    harness.user = { id: "grower-1" };
    harness.ws = wsState({ status: "loading" });
    harness.kp = kpState({ status: "loading" });
    renderShowcase();

    const banner = screen.getByTestId("pheno-hunt-showcase-source");
    expect(banner.textContent).toMatch(/loading your hunt/i);
    expect(banner.textContent).not.toMatch(/not found/i);
  });

  it("signed-in + hunt id + pre-effect mount (both hooks idle) still counts as loading", () => {
    harness.user = { id: "grower-1" };
    harness.ws = wsState({ status: "idle" });
    harness.kp = kpState({ status: "idle" });
    renderShowcase();

    const banner = screen.getByTestId("pheno-hunt-showcase-source");
    expect(banner.textContent).toMatch(/loading your hunt/i);
    expect(banner.textContent).not.toMatch(/not found/i);
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
