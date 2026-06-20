import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PostGrowReflectionReviewPacketCard } from "@/components/PostGrowReflectionReviewPacketCard";
import { validatePostGrowReflectionCandidatePaste } from "@/lib/ai/postGrowReflectionCandidatePasteValidator";
import { findPostGrowReflectionEnvelopeSample } from "@/lib/ai/postGrowReflectionEnvelopeSamples";
import { createValidPostGrowReflectionOutput } from "@/lib/ai/postGrowReflectionOutputFixtures";
import { buildPostGrowReflectionReviewPacket } from "@/lib/ai/postGrowReflectionReviewPacket";

function validatedPacket() {
  return buildPostGrowReflectionReviewPacket(
    validatePostGrowReflectionCandidatePaste(JSON.stringify(createValidPostGrowReflectionOutput())),
  );
}

function envelopeRejectedPacket() {
  const sample = findPostGrowReflectionEnvelopeSample("contract_rejected_missing_candidate");
  return buildPostGrowReflectionReviewPacket(
    validatePostGrowReflectionCandidatePaste(sample.jsonText),
  );
}

function idlePacket() {
  return buildPostGrowReflectionReviewPacket(validatePostGrowReflectionCandidatePaste());
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PostGrowReflectionReviewPacketCard", () => {
  it("renders nothing for idle packet", () => {
    const { container } = render(<PostGrowReflectionReviewPacketCard packet={idlePacket()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders safety labels for validated packet", () => {
    render(<PostGrowReflectionReviewPacketCard packet={validatedPacket()} />);
    expect(screen.getByText("Operator review packet")).toBeTruthy();
    expect(screen.getByText("Sanitized")).toBeTruthy();
    expect(screen.getByText("Manual review only")).toBeTruthy();
    expect(screen.getAllByText("Not saved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No live AI call").length).toBeGreaterThan(0);
  });

  it("renders combined row nodes for validated packet", () => {
    render(<PostGrowReflectionReviewPacketCard packet={validatedPacket()} />);
    expect(screen.getByText("Outcome — Validated locally")).toBeTruthy();
    expect(screen.getByText("Input kind — Raw candidate")).toBeTruthy();
    expect(screen.getByText("Confidence — High")).toBeTruthy();
  });

  it("renders section summary counts without body text", () => {
    render(<PostGrowReflectionReviewPacketCard packet={validatedPacket()} />);
    expect(screen.getAllByText(/\d+ items/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/flower VPD averaged 1\.21 kPa/)).toBeNull();
  });

  it("renders rejection details for rejected packet as combined nodes", () => {
    render(<PostGrowReflectionReviewPacketCard packet={envelopeRejectedPacket()} />);
    expect(screen.getByText("Outcome — Rejected by envelope contract")).toBeTruthy();
    expect(screen.getByText(/Issue codes — missing_candidate/)).toBeTruthy();
  });

  it("renders copy and download buttons", () => {
    render(<PostGrowReflectionReviewPacketCard packet={validatedPacket()} />);
    expect(screen.getByText("Copy sanitized packet")).toBeTruthy();
    expect(screen.getByText("Download sanitized packet")).toBeTruthy();
  });

  it("calls clipboard.writeText with sanitized packet text when clipboard is available", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(<PostGrowReflectionReviewPacketCard packet={validatedPacket()} />);
    fireEvent.click(screen.getByText("Copy sanitized packet"));

    expect(writeText).toHaveBeenCalledOnce();
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).not.toContain("flower VPD averaged 1.21 kPa");
    expect(() => JSON.parse(arg)).not.toThrow();

    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it("handles missing clipboard without crashing and shows fallback", () => {
    render(<PostGrowReflectionReviewPacketCard packet={validatedPacket()} />);
    expect(() => {
      fireEvent.click(screen.getByText("Copy sanitized packet"));
    }).not.toThrow();
    expect(screen.getByText("Clipboard not available")).toBeTruthy();
  });

  it("download triggers blob creation and anchor click without network requests", () => {
    const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const mockRevokeObjectURL = vi.fn();

    // URL.createObjectURL does not exist in jsdom; define it before use
    Object.defineProperty(URL, "createObjectURL", {
      value: mockCreateObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: mockRevokeObjectURL,
      configurable: true,
      writable: true,
    });

    const mockClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        const anchor = originalCreateElement(tag);
        anchor.click = mockClick;
        return anchor;
      }
      return originalCreateElement(tag);
    });

    try {
      render(<PostGrowReflectionReviewPacketCard packet={validatedPacket()} />);
      fireEvent.click(screen.getByText("Download sanitized packet"));

      expect(mockCreateObjectURL).toHaveBeenCalledOnce();
      expect(mockClick).toHaveBeenCalledOnce();
      expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(URL, "createObjectURL", { value: undefined, configurable: true });
      Object.defineProperty(URL, "revokeObjectURL", { value: undefined, configurable: true });
    }
  });

  it("does not render raw candidate body text in any state", () => {
    render(<PostGrowReflectionReviewPacketCard packet={validatedPacket()} />);
    expect(screen.queryByText(/flower VPD averaged 1\.21 kPa/)).toBeNull();
  });
});
