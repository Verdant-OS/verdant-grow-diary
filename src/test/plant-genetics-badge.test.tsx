/**
 * Tests for GeneticsBadge presenter and HyperLogModal integration.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GeneticsBadge } from "@/components/GeneticsBadge";
import { HyperLogModal } from "@/components/HyperLogModal";

// Radix Dialog uses portals — jsdom handles them fine, but ensure no
// ResizeObserver crashes by stubbing if absent.
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe("GeneticsBadge", () => {
  it("renders genetics and lineage chips when present", () => {
    render(
      <GeneticsBadge
        source={{
          strain: {
            name: "Wedding Cake",
            genetics: "Triangle Kush x Animal Mints",
            lineage: ["Triangle Kush", "Animal Mints", "OG Kush", "Sour D", "Haze"],
          },
        }}
      />,
    );
    expect(screen.getByTestId("genetics-badge-strain")).toHaveTextContent("Wedding Cake");
    expect(screen.getByTestId("genetics-badge-genetics")).toHaveTextContent(
      "Triangle Kush x Animal Mints",
    );
    const lineage = screen.getByTestId("genetics-badge-lineage");
    expect(lineage).toHaveTextContent("Triangle Kush");
    expect(lineage).toHaveTextContent("Animal Mints");
    expect(screen.getByTestId("genetics-badge-hidden-count")).toHaveTextContent("+1 more");
  });

  it("renders nothing for empty / malformed lineage with no other fields", () => {
    const { container } = render(
      <GeneticsBadge source={{ strain: { name: "", lineage: ["", "  "] } }} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("genetics-badge")).toBeNull();
  });

  it("renders nothing for null/undefined source", () => {
    const { container } = render(<GeneticsBadge source={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HyperLogModal integration with GeneticsBadge", () => {
  it("renders the badge when strain context is provided", () => {
    render(
      <HyperLogModal
        open
        onOpenChange={vi.fn()}
        strain={{
          strain: {
            name: "Gelato",
            lineage: ["Sunset Sherbet", "Thin Mint GSC"],
          },
        }}
      />,
    );
    expect(screen.getByTestId("genetics-badge")).toBeTruthy();
    expect(screen.getByTestId("genetics-badge-strain")).toHaveTextContent("Gelato");
  });

  it("does not render the badge when no strain context is provided", () => {
    render(<HyperLogModal open onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId("genetics-badge")).toBeNull();
  });
});
