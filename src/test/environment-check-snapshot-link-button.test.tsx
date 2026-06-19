import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EnvironmentCheckSnapshotLinkButton from "@/components/EnvironmentCheckSnapshotLinkButton";

describe("EnvironmentCheckSnapshotLinkButton", () => {
  it("renders 'View sensor snapshot' link on exact ID match", () => {
    render(
      <EnvironmentCheckSnapshotLinkButton
        entry={{ id: "e", tentId: "t", sensorSnapshotId: "snap-1", capturedAt: "2026-06-19T12:00:00Z", source: "live", provider: "ecowitt" }}
        snapshots={[{ id: "snap-1", tentId: "t", capturedAt: "2026-06-19T12:00:00Z", vpdKpa: 1.2, source: "live", provider: "ecowitt", transport: "mqtt" }]}
      />,
    );
    const cta = screen.getByTestId("env-check-snapshot-cta") as HTMLAnchorElement;
    expect(cta.textContent).toMatch(/View sensor snapshot/);
    expect(cta.getAttribute("href")).toContain("tent=t");
  });

  it("shows 'Sensor snapshot not linked' when no candidates", () => {
    render(
      <EnvironmentCheckSnapshotLinkButton
        entry={{ id: "e", tentId: "t", capturedAt: "2026-06-19T12:00:00Z", source: "manual" }}
        snapshots={[]}
      />,
    );
    expect(screen.getByTestId("env-check-snapshot-not-linked")).toBeTruthy();
    expect(screen.queryByTestId("env-check-snapshot-cta")).toBeNull();
  });

  it("does not link on ambiguous matches", () => {
    render(
      <EnvironmentCheckSnapshotLinkButton
        entry={{ id: "e", tentId: "t", capturedAt: "2026-06-19T12:00:00Z" }}
        snapshots={[
          { id: "a", tentId: "t", capturedAt: "2026-06-19T12:00:10Z" },
          { id: "b", tentId: "t", capturedAt: "2026-06-19T12:00:20Z" },
        ]}
      />,
    );
    expect(screen.queryByTestId("env-check-snapshot-cta")).toBeNull();
    expect(screen.getByTestId("env-check-snapshot-not-linked")).toBeTruthy();
  });

  it("uses VPD formatter; missing VPD renders 'Not available' (never 0)", () => {
    render(
      <EnvironmentCheckSnapshotLinkButton
        entry={{ id: "e", tentId: "t", sensorSnapshotId: "s" }}
        snapshots={[{ id: "s", tentId: "t", capturedAt: "2026-06-19T12:00:00Z", vpdKpa: 0 }]}
      />,
    );
    expect(screen.getByTestId("env-check-vpd").textContent).toMatch(/Not available/);
  });

  it("rejects 'ecowitt' as canonical source — displays as unknown", () => {
    render(
      <EnvironmentCheckSnapshotLinkButton
        entry={{ id: "e", tentId: "t", capturedAt: "2026-06-19T12:00:00Z", source: "ecowitt" }}
        snapshots={[]}
      />,
    );
    const wrap = screen.getByTestId("env-check-snapshot-link");
    expect(wrap.getAttribute("data-source")).toBe("unknown");
    expect(screen.getByTestId("env-check-source-badge").textContent).toMatch(/Unknown source/i);
  });
});
