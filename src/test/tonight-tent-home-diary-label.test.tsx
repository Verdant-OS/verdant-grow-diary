import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import TonightTentHomeCard from "@/components/TonightTentHomeCard";
import {
  buildTonightLastLog,
  buildTonightTentMetrics,
  type TonightTentSelection,
} from "@/lib/tonightTentHomeViewModel";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const ago = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const TENT: TonightTentSelection = {
  kind: "tent",
  basis: "only",
  tent: { id: "tent-a", name: "Veg Tent", growId: "g1" },
};

function renderCard({ metrics }: { metrics: ReturnType<typeof buildTonightTentMetrics> }) {
  return render(
    <MemoryRouter>
      <TonightTentHomeCard
        selection={TENT}
        metrics={metrics}
        lastLog={buildTonightLastLog({ applies: true, status: "ok", latestAt: null, now: NOW })}
        logHref="/daily-check?growId=g1"
      />
    </MemoryRouter>,
  );
}

describe("a generic diary snapshot reads as a diary note, never Manual (Codex P1 on #2303 at 0994ea2a)", () => {
  const blob = (source: "diary" | "manual") =>
    buildTonightTentMetrics({
      rows: [],
      rowsRead: { status: "success" },
      snapshot: {
        status: "ok",
        snapshot: {
          source,
          ts: ago(30),
          temp: (80 - 32) / 1.8,
          rh: 50,
          vpd: null,
        } as never,
      },
      now: NOW,
    });

  it("labels each metric of a diary blob as a diary note", () => {
    renderCard({ metrics: blob("diary") });
    for (const key of ["temp", "rh", "vpd"]) {
      const metric = screen.getByTestId(`tonight-tent-home-metric-${key}`);
      expect(metric).toHaveTextContent("Diary note");
      expect(metric).not.toHaveTextContent(/Manual/);
    }
  });

  it("keeps a real manual envelope labelled Manual", () => {
    renderCard({ metrics: blob("manual") });
    // This manual envelope carries no VPD, so only temperature and RH show a source.
    for (const key of ["temp", "rh"]) {
      const metric = screen.getByTestId(`tonight-tent-home-metric-${key}`);
      expect(metric).toHaveTextContent(/Manual/);
      expect(metric).not.toHaveTextContent("Diary note");
    }
  });
});
