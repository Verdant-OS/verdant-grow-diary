/**
 * View-model + UI tests for the read-only AI Doctor "VPD Drift" section.
 *
 * Display-only transparency block:
 *  - Never recommends nutrient, irrigation, or equipment changes.
 *  - Never creates alerts or Action Queue rows.
 *  - Never invokes fetch / supabase / edge functions.
 *  - VPD is always "Derived VPD", never "Live VPD".
 *  - No duplicated VPD target tables in JSX.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import {
  buildAiDoctorVpdDriftSectionViewModel,
  VPD_DRIFT_INSUFFICIENT_COPY,
  VPD_DRIFT_REVIEW_COPY,
  VPD_DRIFT_SAFETY_NOTE,
  VPD_DRIFT_VPD_LABEL,
} from "@/lib/aiDoctorVpdDriftContextViewModel";
import AiDoctorVpdDriftSection from "@/components/AiDoctorVpdDriftSection";
import type { AiDoctorVpdDriftContext } from "@/lib/vpdDriftRules";

function ctx(
  overrides: Partial<AiDoctorVpdDriftContext> = {},
): AiDoctorVpdDriftContext {
  return {
    classification: "in_band",
    ewmaKpa: 1.05,
    sampleCount: 12,
    lowKpa: 0.8,
    highKpa: 1.2,
    summary: "VPD EWMA 1.05 kPa is inside band",
    safetyNotes: ["advisory only"],
    suggestReview: false,
    ...overrides,
  };
}

describe("buildAiDoctorVpdDriftSectionViewModel", () => {
  it("returns invisible view-model when vpdDrift is missing", () => {
    expect(buildAiDoctorVpdDriftSectionViewModel(undefined).visible).toBe(
      false,
    );
    expect(buildAiDoctorVpdDriftSectionViewModel(null).visible).toBe(false);
  });

  it("maps in_band to ok tone with band + current vpd", () => {
    const vm = buildAiDoctorVpdDriftSectionViewModel(ctx());
    expect(vm.visible).toBe(true);
    expect(vm.status).toBe("in_band");
    expect(vm.statusTone).toBe("ok");
    expect(vm.currentVpdLabel).toBe("1.05 kPa");
    expect(vm.targetBandLabel).toBe("0.80–1.20 kPa");
    expect(vm.reviewCopy).toBe("");
    expect(vm.vpdLabel).toBe(VPD_DRIFT_VPD_LABEL);
  });

  it("maps insufficient to muted with insufficient copy", () => {
    const vm = buildAiDoctorVpdDriftSectionViewModel(
      ctx({ classification: "insufficient", sampleCount: 2, ewmaKpa: null }),
    );
    expect(vm.status).toBe("insufficient_data");
    expect(vm.statusTone).toBe("muted");
    expect(vm.primaryCopy).toBe(VPD_DRIFT_INSUFFICIENT_COPY);
    expect(vm.currentVpdLabel).toBeNull();
    expect(vm.reviewCopy).toBe("");
  });

  it("maps sustained_high with review-first copy", () => {
    const vm = buildAiDoctorVpdDriftSectionViewModel(
      ctx({ classification: "sustained_high", ewmaKpa: 1.55, suggestReview: true }),
    );
    expect(vm.status).toBe("sustained_high");
    expect(vm.statusTone).toBe("warn");
    expect(vm.reviewCopy).toBe(VPD_DRIFT_REVIEW_COPY);
    expect(vm.suggestReview).toBe(true);
  });

  it("maps sustained_low with review-first copy", () => {
    const vm = buildAiDoctorVpdDriftSectionViewModel(
      ctx({ classification: "sustained_low", ewmaKpa: 0.55, suggestReview: true }),
    );
    expect(vm.status).toBe("sustained_low");
    expect(vm.reviewCopy).toBe(VPD_DRIFT_REVIEW_COPY);
  });

  it("never recommends nutrient/irrigation/equipment changes", () => {
    const cases: AiDoctorVpdDriftContext[] = [
      ctx({ classification: "sustained_high", suggestReview: true }),
      ctx({ classification: "sustained_low", suggestReview: true }),
      ctx({ classification: "insufficient" }),
      ctx({ classification: "in_band" }),
    ];
    for (const c of cases) {
      const vm = buildAiDoctorVpdDriftSectionViewModel(c);
      const blob = `${vm.primaryCopy} ${vm.reviewCopy} ${vm.safetyNote}`.toLowerCase();
      for (const banned of [
        "nutrient",
        "feed",
        "irrigat",
        "water now",
        "dose",
        "ec ",
        "ph ",
        "fan on",
        "fan off",
        "turn on",
        "turn off",
        "switch on",
        "switch off",
        "dehumidif",
        "humidifier",
      ]) {
        expect(
          blob.includes(banned),
          `unexpected term "${banned}" in: ${blob}`,
        ).toBe(false);
      }
    }
  });

  it("always exposes the safety note", () => {
    const vm = buildAiDoctorVpdDriftSectionViewModel(ctx());
    expect(vm.safetyNote).toBe(VPD_DRIFT_SAFETY_NOTE);
  });

  it("handles non-finite band/ewma values without throwing", () => {
    const vm = buildAiDoctorVpdDriftSectionViewModel(
      ctx({
        ewmaKpa: Number.NaN as unknown as number,
        lowKpa: Number.POSITIVE_INFINITY as unknown as number,
        highKpa: 1.2,
      }),
    );
    expect(vm.currentVpdLabel).toBeNull();
    expect(vm.targetBandLabel).toBeNull();
  });
});

describe("AiDoctorVpdDriftSection (UI)", () => {
  it("renders nothing when vpdDrift is missing", () => {
    const { container } = render(<AiDoctorVpdDriftSection vpdDrift={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders section when vpdDrift is present and uses 'Derived VPD' label", () => {
    render(<AiDoctorVpdDriftSection vpdDrift={ctx()} />);
    expect(screen.getByTestId("ai-doctor-vpd-drift-section")).toBeInTheDocument();
    expect(screen.getByText("Derived VPD")).toBeInTheDocument();
    expect(screen.queryByText(/Live VPD/i)).toBeNull();
  });

  it("shows current kPa and target band when available", () => {
    render(<AiDoctorVpdDriftSection vpdDrift={ctx()} />);
    expect(screen.getByTestId("ai-doctor-vpd-drift-section-current")).toHaveTextContent(
      "1.05 kPa",
    );
    expect(screen.getByTestId("ai-doctor-vpd-drift-section-band")).toHaveTextContent(
      "0.80–1.20 kPa",
    );
  });

  it("shows insufficient-data copy when classification is insufficient", () => {
    render(
      <AiDoctorVpdDriftSection
        vpdDrift={ctx({ classification: "insufficient", ewmaKpa: null })}
      />,
    );
    expect(screen.getByTestId("ai-doctor-vpd-drift-section-primary")).toHaveTextContent(
      VPD_DRIFT_INSUFFICIENT_COPY,
    );
    expect(screen.queryByTestId("ai-doctor-vpd-drift-section-review")).toBeNull();
  });

  it("shows review-first copy for sustained high drift", () => {
    render(
      <AiDoctorVpdDriftSection
        vpdDrift={ctx({ classification: "sustained_high", suggestReview: true })}
      />,
    );
    expect(screen.getByTestId("ai-doctor-vpd-drift-section-review")).toHaveTextContent(
      VPD_DRIFT_REVIEW_COPY,
    );
  });

  it("shows review-first copy for sustained low drift", () => {
    render(
      <AiDoctorVpdDriftSection
        vpdDrift={ctx({ classification: "sustained_low", suggestReview: true })}
      />,
    );
    expect(screen.getByTestId("ai-doctor-vpd-drift-section-review")).toHaveTextContent(
      VPD_DRIFT_REVIEW_COPY,
    );
  });

  it("always renders the safety note", () => {
    render(<AiDoctorVpdDriftSection vpdDrift={ctx()} />);
    expect(screen.getByTestId("ai-doctor-vpd-drift-section-safety")).toHaveTextContent(
      VPD_DRIFT_SAFETY_NOTE,
    );
  });
});

describe("Static safety — VPD Drift context UI", () => {
  const VIEW_MODEL_PATH = path.resolve(
    __dirname,
    "../lib/aiDoctorVpdDriftContextViewModel.ts",
  );
  const SECTION_PATH = path.resolve(
    __dirname,
    "../components/AiDoctorVpdDriftSection.tsx",
  );
  const VM_SRC = fs.readFileSync(VIEW_MODEL_PATH, "utf-8");
  const UI_SRC = fs.readFileSync(SECTION_PATH, "utf-8");

  const BANNED: Array<[string, RegExp]> = [
    ["service_role", /service_role/i],
    ["functions.invoke", /functions\s*\.\s*invoke/],
    ["supabase client", /from\s+["']@\/integrations\/supabase\/client["']/],
    ["fetch(", /\bfetch\s*\(/],
    ["action_queue", /action_queue/i],
    ["alerts table", /\balerts\b/i],
    ["device on/off", /\b(turn|switch)\s+(on|off)\b/i],
  ];

  it("view-model has no I/O or automation strings", () => {
    for (const [name, re] of BANNED) {
      expect(re.test(VM_SRC), `view-model contains banned term: ${name}`).toBe(
        false,
      );
    }
  });

  it("presenter has no I/O or automation strings", () => {
    for (const [name, re] of BANNED) {
      expect(re.test(UI_SRC), `presenter contains banned term: ${name}`).toBe(
        false,
      );
    }
  });

  it("presenter does NOT duplicate VPD stage target band tables in JSX", () => {
    // No literal numeric stage band tuples / arrays in JSX
    expect(/0\.\d+\s*,\s*1\.\d+/.test(UI_SRC)).toBe(false);
    expect(/seedling|veg|flower|late_flower/i.test(UI_SRC)).toBe(false);
  });
});
