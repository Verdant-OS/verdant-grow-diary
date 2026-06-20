import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PostGrowReflectionCandidatePasteValidator } from "@/components/PostGrowReflectionCandidatePasteValidator";
import { createValidPostGrowReflectionOutput } from "@/lib/ai/postGrowReflectionOutputFixtures";

describe("PostGrowReflectionCandidatePasteValidator summary panel", () => {
  it("renders a sanitized summary after raw candidate validation", () => {
    render(<PostGrowReflectionCandidatePasteValidator />);

    fireEvent.change(screen.getByLabelText("Candidate JSON"), {
      target: { value: JSON.stringify(createValidPostGrowReflectionOutput()) },
    });
    fireEvent.click(screen.getByText("Validate pasted candidate"));

    expect(screen.getByText("Sanitized validation summary")).toBeTruthy();
    expect(screen.getAllByText("Validated locally").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Raw candidate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not saved").length).toBeGreaterThan(0);
    expect(screen.getByText(/excludes raw pasted JSON/i)).toBeTruthy();
  });

  it("renders envelope summary rows after valid sample validation", () => {
    render(<PostGrowReflectionCandidatePasteValidator />);

    fireEvent.click(screen.getByText("Load valid envelope sample"));
    fireEvent.click(screen.getByText("Validate pasted candidate"));

    expect(screen.getByText("Sanitized validation summary")).toBeTruthy();
    expect(screen.getAllByText("Envelope").length).toBeGreaterThan(0);
    expect(screen.getByText("Envelope source")).toBeTruthy();
    expect(screen.getByText("local deterministic envelope sample")).toBeTruthy();
    expect(screen.getByText("Envelope format")).toBeTruthy();
    expect(screen.getByText("object")).toBeTruthy();
  });

  it("renders contract rejection in the summary panel", () => {
    render(<PostGrowReflectionCandidatePasteValidator />);

    fireEvent.click(screen.getByText("Load rejected envelope sample"));
    fireEvent.click(screen.getByText("Validate pasted candidate"));

    expect(screen.getByText("Sanitized validation summary")).toBeTruthy();
    expect(screen.getAllByText("Rejected by envelope contract").length).toBeGreaterThan(0);
    expect(screen.getAllByText("missing_candidate").length).toBeGreaterThan(0);
  });

  it("does not show the summary while idle", () => {
    render(<PostGrowReflectionCandidatePasteValidator />);
    expect(screen.queryByText("Sanitized validation summary")).toBeNull();
  });
});
