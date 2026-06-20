import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CanonicalSourceBadge from "@/components/CanonicalSourceBadge";
import {
  buildCanonicalSourceBadge,
  CANONICAL_BADGE_SOURCES,
} from "@/lib/canonicalSourceBadgeViewModel";

describe("CanonicalSourceBadge view model", () => {
  for (const s of CANONICAL_BADGE_SOURCES) {
    it(`renders canonical label for ${s}`, () => {
      const vm = buildCanonicalSourceBadge({ source: s });
      expect(vm.isUnknown).toBe(false);
      expect(vm.normalizedSource).toBe(s);
    });
  }

  it("renders 'Unknown source' for ecowitt", () => {
    const vm = buildCanonicalSourceBadge({ source: "ecowitt" });
    expect(vm.isUnknown).toBe(true);
    expect(vm.tone).toBe("unknown");
    expect(vm.label).toBe("Unknown source");
  });

  it("renders 'Unknown source' for arbitrary strings", () => {
    expect(buildCanonicalSourceBadge({ source: "mqtt" }).isUnknown).toBe(true);
    expect(buildCanonicalSourceBadge({ source: "" }).isUnknown).toBe(true);
    expect(buildCanonicalSourceBadge({ source: null }).isUnknown).toBe(true);
  });

  it("demo/stale/invalid are degraded", () => {
    expect(buildCanonicalSourceBadge({ source: "demo" }).isDegraded).toBe(true);
    expect(buildCanonicalSourceBadge({ source: "stale" }).isDegraded).toBe(true);
    expect(buildCanonicalSourceBadge({ source: "invalid" }).isDegraded).toBe(true);
  });

  it("live is not degraded", () => {
    expect(buildCanonicalSourceBadge({ source: "live" }).isDegraded).toBe(false);
  });

  it("formats provider label when known", () => {
    expect(
      buildCanonicalSourceBadge({ source: "live", provider: "ecowitt" }).providerLabel,
    ).toBe("EcoWitt");
  });

  it("does not let provider become canonical source", () => {
    const vm = buildCanonicalSourceBadge({ source: "ecowitt", provider: "ecowitt" });
    expect(vm.isUnknown).toBe(true);
    expect(vm.providerLabel).toBe("EcoWitt");
  });
});

describe("CanonicalSourceBadge component", () => {
  it("renders source + provider chips", () => {
    render(<CanonicalSourceBadge source="live" provider="ecowitt" />);
    expect(screen.getByTestId("canonical-source-badge-source").textContent).toBe("Live");
    expect(screen.getByTestId("canonical-source-badge-provider").textContent).toBe("EcoWitt");
  });

  it("ecowitt source renders as Unknown source", () => {
    render(<CanonicalSourceBadge source="ecowitt" />);
    const badge = screen.getByTestId("canonical-source-badge");
    expect(badge.getAttribute("data-source")).toBe("ecowitt");
    expect(badge.getAttribute("data-tone")).toBe("unknown");
    expect(screen.getByTestId("canonical-source-badge-source").textContent).toBe("Unknown source");
  });

  it("hides provider when hideProvider is set", () => {
    render(<CanonicalSourceBadge source="live" provider="ecowitt" hideProvider />);
    expect(screen.queryByTestId("canonical-source-badge-provider")).toBeNull();
  });
});
