import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PostGrowReflectionCandidatePasteValidator } from "@/components/PostGrowReflectionCandidatePasteValidator";
import {
  createUnsafeAutomationPostGrowReflectionOutput,
  createValidPostGrowReflectionOutput,
} from "@/lib/ai/postGrowReflectionOutputFixtures";

describe("PostGrowReflectionCandidatePasteValidator", () => {
  it("renders textarea and validation controls", () => {
    render(<PostGrowReflectionCandidatePasteValidator />);

    expect(screen.getByLabelText("Candidate JSON")).toBeTruthy();
    expect(screen.getByText("Validate pasted candidate")).toBeTruthy();
    expect(screen.getByText("Clear")).toBeTruthy();
    expect(screen.getByText("Manual paste")).toBeTruthy();
    expect(screen.getByText("Not saved")).toBeTruthy();
    expect(screen.getByText("No live AI call")).toBeTruthy();
  });

  it("rejects invalid JSON visibly", () => {
    render(<PostGrowReflectionCandidatePasteValidator />);

    fireEvent.change(screen.getByLabelText("Candidate JSON"), {
      target: { value: "{not-json" },
    });
    fireEvent.click(screen.getByText("Validate pasted candidate"));

    expect(screen.getByText("Invalid JSON")).toBeTruthy();
    expect(screen.getByText("Pasted candidate is not valid JSON.")).toBeTruthy();
  });

  it("validates a known good candidate and renders all major sections", () => {
    render(<PostGrowReflectionCandidatePasteValidator />);

    fireEvent.change(screen.getByLabelText("Candidate JSON"), {
      target: { value: JSON.stringify(createValidPostGrowReflectionOutput()) },
    });
    fireEvent.click(screen.getByText("Validate pasted candidate"));

    expect(screen.getAllByText("Manual paste").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not saved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No live AI call").length).toBeGreaterThan(0);
    expect(screen.getByText("Validated output")).toBeTruthy();
    expect(screen.getByText("Confidence: High")).toBeTruthy();
    expect(screen.getByText("Executive reflection")).toBeTruthy();
    expect(screen.getByText("Key wins")).toBeTruthy();
    expect(screen.getByText("Repeat next run")).toBeTruthy();
    expect(screen.getByText("Adjust or avoid")).toBeTruthy();
    expect(screen.getByText("Post-harvest specific insights")).toBeTruthy();
    expect(screen.getByText("Pheno / strain notes")).toBeTruthy();
    expect(screen.getByText("Low-risk experiments")).toBeTruthy();
    expect(screen.getByText("Gaps")).toBeTruthy();
  });

  it("shows issue codes for rejected candidate text", () => {
    render(<PostGrowReflectionCandidatePasteValidator />);

    fireEvent.change(screen.getByLabelText("Candidate JSON"), {
      target: { value: JSON.stringify(createUnsafeAutomationPostGrowReflectionOutput()) },
    });
    fireEvent.click(screen.getByText("Validate pasted candidate"));

    expect(screen.getAllByText("Rejected candidate").length).toBeGreaterThan(0);
    expect(screen.getByText(/unsafe_language/)).toBeTruthy();
    expect(screen.getByText(/Pasted candidate was rejected/)).toBeTruthy();
  });

  it("clear button resets the state", () => {
    render(<PostGrowReflectionCandidatePasteValidator />);

    fireEvent.change(screen.getByLabelText("Candidate JSON"), {
      target: { value: "{not-json" },
    });
    fireEvent.click(screen.getByText("Validate pasted candidate"));
    expect(screen.getByText("Invalid JSON")).toBeTruthy();

    fireEvent.click(screen.getByText("Clear"));
    expect(screen.queryByText("Invalid JSON")).toBeNull();
    expect(screen.getByText(/Paste a candidate ReflectionOutput JSON/)).toBeTruthy();
    expect((screen.getByLabelText("Candidate JSON") as HTMLTextAreaElement).value).toBe("");
  });
});
