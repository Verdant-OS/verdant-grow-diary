/**
 * PHENOHUNT product sampling — section renders with structured tester
 * feedback fields, a coherent 1–10 rating, and safety wording that avoids
 * overclaiming ash color or oil ring quality.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PhenoProductSamplingSection from "@/components/PhenoProductSamplingSection";
import { PhenoSamplingProvider } from "@/context/PhenoSamplingContext";
import {
  PHENO_SAMPLING_COMPARISON_POINTS,
  PHENO_SAMPLING_OBSERVATION_DISCLAIMER,
  PHENO_SAMPLING_RATING_MIN,
  PHENO_SAMPLING_RATING_MAX,
} from "@/constants/phenoProductSamplingCopy";

const REQUIRED_FIELDS = [
  "pheno-sampling-tester",
  "pheno-sampling-candidate",
  "pheno-sampling-format",
  "pheno-sampling-dry-hit",
  "pheno-sampling-flavor",
  "pheno-sampling-burn",
  "pheno-sampling-ash",
  "pheno-sampling-oil-ring",
  "pheno-sampling-effect",
  "pheno-sampling-overall",
  "pheno-sampling-notes",
];

function renderSamplingSection() {
  return render(
    <PhenoSamplingProvider>
      <PhenoProductSamplingSection />
    </PhenoSamplingProvider>,
  );
}

describe("PhenoProductSamplingSection", () => {
  it("warns before entry that feedback is session-only and lost on leave or reload", () => {
    renderSamplingSection();

    const disclosure = screen.getByTestId("pheno-sampling-session-only-disclosure");
    expect(disclosure).toHaveTextContent(/session only/i);
    expect(disclosure).toHaveTextContent(/not saved to your Verdant account/i);
    expect(disclosure).toHaveTextContent(/leave or reload/i);
  });

  it("renders the sampling section with heading and all comparison points", () => {
    renderSamplingSection();
    expect(screen.getByTestId("pheno-product-sampling")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /pheno.*sampling/i, level: 2 })).toBeInTheDocument();
    for (const p of PHENO_SAMPLING_COMPARISON_POINTS) {
      expect(screen.getByTestId(`pheno-sampling-point-${p.key}`)).toBeInTheDocument();
    }
  });

  it("exposes every structured tester feedback field", () => {
    renderSamplingSection();
    for (const id of REQUIRED_FIELDS) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it("uses a coherent 1–10 rating scale on the overall rating", () => {
    renderSamplingSection();
    const overall = screen.getByTestId("pheno-sampling-overall") as HTMLInputElement;
    expect(overall.type).toBe("number");
    expect(overall.min).toBe(String(PHENO_SAMPLING_RATING_MIN));
    expect(overall.max).toBe(String(PHENO_SAMPLING_RATING_MAX));
  });

  it("keeps ash and oil-ring wording observational (no overclaims)", () => {
    renderSamplingSection();
    const disclaimer = screen.getByTestId("pheno-sampling-disclaimer");
    expect(disclaimer.textContent).toBe(PHENO_SAMPLING_OBSERVATION_DISCLAIMER);

    const ashPoint = screen.getByTestId("pheno-sampling-point-ash").textContent ?? "";
    const oilPoint = screen.getByTestId("pheno-sampling-point-oil_ring").textContent ?? "";
    const allText = document.body.textContent ?? "";

    // Observation framing must be present.
    expect(ashPoint.toLowerCase()).toContain("observation");
    expect(oilPoint.toLowerCase()).toContain("observation");

    // Overclaiming phrases must NOT appear anywhere in the section.
    const forbidden = [
      /white ash proves/i,
      /oil ring proves/i,
      /proves? (?:quality|superiority|potency)/i,
      /guarantees? (?:quality|superiority)/i,
    ];
    for (const re of forbidden) {
      expect(allText).not.toMatch(re);
    }
  });

  it("records tester feedback locally on submit (no side effects)", () => {
    renderSamplingSection();
    fireEvent.change(screen.getByTestId("pheno-sampling-tester"), {
      target: { value: "T-01" },
    });
    fireEvent.change(screen.getByTestId("pheno-sampling-overall"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByTestId("pheno-sampling-record"));
    expect(screen.getByTestId("pheno-sampling-recorded")).toHaveTextContent(
      /added to this session only/i,
    );
    expect(
      screen.getByRole("button", { name: "Add feedback to this session" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pheno-sampling-recorded")).toHaveAttribute("role", "status");
  });

  it("does not claim feedback was recorded when the session provider is unavailable", () => {
    render(<PhenoProductSamplingSection />);

    const submit = screen.getByRole("button", { name: "Session recording unavailable" });
    expect(submit).toBeDisabled();
    expect(screen.queryByTestId("pheno-sampling-recorded")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/open this form from a Pheno Hunt/i);
  });
});
