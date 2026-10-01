import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import TonightTentHomeCard from "@/components/TonightTentHomeCard";
import {
  buildTonightLastLog,
  buildTonightTentMetrics,
  TONIGHT_TENT_HOME_COPY,
  type TonightTentSelection,
} from "@/lib/tonightTentHomeViewModel";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const ago = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const TENT: TonightTentSelection = {
  kind: "tent",
  basis: "only",
  tent: { id: "tent-a", name: "Veg Tent", growId: "g1" },
};

function renderCard(props: Partial<Parameters<typeof TonightTentHomeCard>[0]> = {}) {
  const metrics =
    props.metrics ??
    buildTonightTentMetrics({
      rows: [],
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    });
  return render(
    <MemoryRouter>
      <TonightTentHomeCard
        selection={props.selection ?? TENT}
        metrics={metrics}
        lastLog={
          props.lastLog ??
          buildTonightLastLog({ applies: true, status: "ok", latestAt: null, now: NOW })
        }
        logHref={props.logHref ?? "/daily-check?growId=g1"}
      />
    </MemoryRouter>,
  );
}

describe("TonightTentHomeCard", () => {
  it("renders nothing for an account with no tent", () => {
    const { container } = renderCard({ selection: { kind: "none" } });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the tent name, three metrics as Missing, No log today, and one Log control", () => {
    renderCard();
    const card = screen.getByTestId("tonight-tent-home");
    expect(within(card).getByRole("link", { name: "Veg Tent" })).toHaveAttribute(
      "href",
      "/tents/tent-a",
    );
    for (const key of ["temp", "rh", "vpd"]) {
      const metric = screen.getByTestId(`tonight-tent-home-metric-${key}`);
      expect(metric).toHaveTextContent(TONIGHT_TENT_HOME_COPY.missing);
      expect(metric).toHaveAttribute("data-state", "missing");
    }
    expect(screen.getByTestId("tonight-tent-home-last-log")).toHaveTextContent("No log today");
    const logLinks = within(card).getAllByRole("link", { name: /^Log$/ });
    expect(logLinks).toHaveLength(1);
    expect(logLinks[0]).toHaveAttribute("href", "/daily-check?growId=g1");
  });

  it("attaches source and age to each value and labels demo visibly", () => {
    const metrics = buildTonightTentMetrics({
      rows: [],
      rowsRead: { status: "success" },
      snapshot: {
        status: "ok",
        snapshot: { source: "sim", ts: ago(5), temp: null, rh: 55, vpd: null },
      },
      now: NOW,
    });
    renderCard({ metrics });
    const rh = screen.getByTestId("tonight-tent-home-metric-rh");
    expect(rh).toHaveTextContent("55%");
    expect(rh).toHaveTextContent("Demo data · 5m ago");
    expect(screen.getByTestId("tonight-tent-home-demo")).toHaveTextContent("Demo");
  });

  it("never shows the words healthy, live now, or a score", () => {
    const metrics = buildTonightTentMetrics({
      rows: [],
      rowsRead: { status: "success" },
      snapshot: {
        status: "ok",
        snapshot: { source: "live", ts: ago(1), temp: 24, rh: 55, vpd: 1.1 },
      },
      now: NOW,
    });
    renderCard({ metrics });
    const text = (screen.getByTestId("tonight-tent-home").textContent ?? "").toLowerCase();
    for (const banned of ["healthy", "all good", "score", "live now"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("lists tents to choose from instead of picking one", () => {
    renderCard({
      selection: {
        kind: "choose",
        tents: [
          { id: "b", name: "Flower" },
          { id: "a", name: "Veg" },
        ],
      },
    });
    const card = screen.getByTestId("tonight-tent-home-choose");
    expect(
      within(card)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Flower", "Veg"]);
    expect(screen.queryByTestId("tonight-tent-home-log")).toBeNull();
  });
});
