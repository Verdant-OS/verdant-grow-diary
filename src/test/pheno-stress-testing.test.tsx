/**
 * PHENOHUNT Stress Testing — renders as a factor, exposes all stress
 * factor options, stores planned/observed status, warns against
 * excessive stress, and introduces no automation / device / AI /
 * Action Queue / sensor-ingest code.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PhenoStressTestingSection from "@/components/PhenoStressTestingSection";
import {
  PHENO_STRESS_FACTOR_OPTIONS,
  PHENO_STRESS_STATUS_OPTIONS,
} from "@/constants/phenoStressTestingCopy";

describe("PhenoStressTestingSection", () => {
  it("appears as a PHENOHUNT factor with the Stress Testing label", () => {
    render(<PhenoStressTestingSection />);
    const section = screen.getByTestId("pheno-stress-testing");
    expect(section).toBeInTheDocument();
    expect(section.getAttribute("data-pheno-factor-id")).toBe("stress_testing");
    expect(
      screen.getByRole("heading", { name: /stress testing/i, level: 2 }),
    ).toBeInTheDocument();
  });

  it("renders every listed stress factor option", () => {
    render(<PhenoStressTestingSection />);
    const optionsList = screen.getByTestId("pheno-stress-factor-options");
    for (const f of PHENO_STRESS_FACTOR_OPTIONS) {
      expect(within(optionsList).getByText(new RegExp(f, "i"))).toBeInTheDocument();
    }
    // Also present in the factor <select>.
    const select = screen.getByTestId("pheno-stress-factor") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    for (const f of PHENO_STRESS_FACTOR_OPTIONS) {
      expect(values).toContain(f);
    }
  });

  it("stores planned vs observed status on a candidate stress observation", () => {
    render(
      <PhenoStressTestingSection
        candidates={[{ candidateId: "c-1", candidateLabel: "Cand 1" }]}
      />,
    );
    fireEvent.change(screen.getByTestId("pheno-stress-candidate"), {
      target: { value: "c-1" },
    });
    fireEvent.change(screen.getByTestId("pheno-stress-status"), {
      target: { value: "planned" },
    });
    fireEvent.change(screen.getByTestId("pheno-stress-start"), {
      target: { value: "2026-07-07" },
    });
    fireEvent.click(screen.getByTestId("pheno-stress-record"));

    const entry = screen.getByTestId("pheno-stress-entry-0");
    expect(entry.getAttribute("data-status")).toBe("planned");
    // Status option list must include both planned and observed.
    expect([...PHENO_STRESS_STATUS_OPTIONS]).toEqual(["planned", "observed"]);
  });

  it("warns against excessive or prolonged stress", () => {
    render(<PhenoStressTestingSection />);
    const caution = screen.getByTestId("pheno-stress-caution").textContent ?? "";
    expect(caution.toLowerCase()).toContain("excessive");
    expect(caution.toLowerCase()).toContain("prolonged");
    expect(caution.toLowerCase()).toMatch(/damage|reduce yield/);
  });

  it("introduces no automation, device-control, AI, Action Queue, or sensor-ingest code", () => {
    const files = [
      "src/components/PhenoStressTestingSection.tsx",
      "src/constants/phenoStressTestingCopy.ts",
    ].map((p) => readFileSync(resolve(process.cwd(), p), "utf-8"));

    const forbidden = [
      /action[_-]?queue/i,
      /queueAction|enqueue|dispatchAction/,
      /device[_-]?control|sendCommand|switchRelay|controlDevice/i,
      /openai|anthropic|lovable-ai|invokeAi|callModel|aiGateway/i,
      /sensor[_-]?ingest|ingestReading|writeSensor/i,
      /supabase\.(from|rpc|functions)/,
    ];
    for (const src of files) {
      for (const re of forbidden) {
        expect(src).not.toMatch(re);
      }
    }
  });
});
