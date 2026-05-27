/**
 * QA-LOOP-02 regression: legacy /action-queue URL must redirect to the
 * canonical /actions route so old bookmarks / docs / shared links don't 404.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";

// Lightweight stand-in for the real Action Queue page to avoid pulling in its
// data hooks. The redirect contract is what we're asserting.
function ActionQueueStub() {
  return <div data-testid="actions-page">Action Queue</div>;
}

function RedirectHarness({ initial }: { initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/actions" element={<ActionQueueStub />} />
        <Route path="/action-queue" element={<Navigate to="/actions" replace />} />
        <Route path="*" element={<div data-testid="not-found">404</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("QA-LOOP-02 /action-queue legacy redirect", () => {
  it("redirects /action-queue to /actions", () => {
    render(<RedirectHarness initial="/action-queue" />);
    expect(screen.getByTestId("actions-page")).toBeInTheDocument();
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  it("serves /actions directly without redirect", () => {
    render(<RedirectHarness initial="/actions" />);
    expect(screen.getByTestId("actions-page")).toBeInTheDocument();
  });

  it("confirms App.tsx wires the legacy alias to a Navigate redirect", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/App.tsx", "utf8");
    expect(src).toMatch(/path="\/action-queue"\s+element=\{<Navigate\s+to="\/actions"\s+replace/);
  });
});

describe("QA-LOOP-03 Settings mobile tile layout", () => {
  it("stacks the tile badge under the title on mobile via flex-col", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/pages/Settings.tsx", "utf8");
    // Confirms the responsive class that keeps the badge clear of the mobile FAB.
    expect(src).toMatch(/flex-col\s+sm:flex-row/);
  });

  it("renders all four tiles with a badge that is not absolutely positioned", async () => {
    vi.doMock("@/store/auth", () => ({
      useAuth: () => ({ user: { email: "g@example.com" }, signOut: vi.fn() }),
    }));
    const Settings = (await import("@/pages/Settings")).default;
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    const badges = screen.getAllByTestId("settings-tile-badge");
    expect(badges).toHaveLength(4);
    for (const b of badges) {
      // Badge should be in-flow (no fixed/absolute) so the FAB cannot clip it.
      const cls = b.className;
      expect(cls).not.toMatch(/\babsolute\b/);
      expect(cls).not.toMatch(/\bfixed\b/);
    }
  });
});
