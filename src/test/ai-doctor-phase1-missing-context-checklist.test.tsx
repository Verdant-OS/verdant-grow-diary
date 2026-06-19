/**
 * AI Doctor Phase 1 — Missing-context checklist tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  AiDoctorPhase1MissingContextChecklist,
  buildAiDoctorPhase1Checklist,
} from "@/components/AiDoctorPhase1MissingContextChecklist";
import type {
  AiDoctorContextPayload,
  AiDoctorMetricKey,
} from "@/lib/aiDoctorEnginePhase1Foundation";

const CTA_CTX = { plantId: "plant-a", growId: "grow-1", tentId: "tent-1" };

function emptyContext(): AiDoctorContextPayload {
  return {
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-a",
    plant_name: "Plant A",
    strain: null,
    stage: null,
    medium: null,
    pot_size: null,
    recent_logs: [],
    recent_photos_count: 0,
    recent_watering_events: 0,
    recent_feeding_events: 0,
    sensor_summary: [],
    source_breakdown: [],
    missing_context: [],
    context_trust_level: "low",
  };
}

function metric(
  m: AiDoctorMetricKey,
  overrides: Partial<AiDoctorContextPayload["sensor_summary"][number]> = {},
) {
  return {
    metric: m,
    latest_value: 22,
    latest_source: "live" as const,
    latest_captured_at: "2026-06-19T00:00:00Z",
    is_stale: false,
    is_invalid: false,
    is_degraded: false,
    sample_count_7d: 1,
    ...overrides,
  };
}

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("buildAiDoctorPhase1Checklist — status derivation", () => {
  it("returns all seven items in a stable order", () => {
    const items = buildAiDoctorPhase1Checklist({
      context: emptyContext(),
      ctaContext: CTA_CTX,
    });
    expect(items.map((i) => i.id)).toEqual([
      "recent_photo",
      "recent_diary",
      "fresh_sensor",
      "watering_feeding",
      "stage",
      "medium",
      "pot_size",
    ]);
  });

  it("marks fresh live telemetry as available", () => {
    const ctx = {
      ...emptyContext(),
      sensor_summary: [metric("temperature_c")],
    };
    const items = buildAiDoctorPhase1Checklist({ context: ctx, ctaContext: CTA_CTX });
    expect(items.find((i) => i.id === "fresh_sensor")?.status).toBe("available");
  });

  it("never classifies stale/invalid telemetry as available", () => {
    const stale = {
      ...emptyContext(),
      sensor_summary: [
        metric("temperature_c", {
          latest_source: "stale",
          is_stale: true,
          is_degraded: true,
        }),
      ],
    };
    expect(
      buildAiDoctorPhase1Checklist({ context: stale, ctaContext: CTA_CTX }).find(
        (i) => i.id === "fresh_sensor",
      )?.status,
    ).toBe("needs_review");

    const invalid = {
      ...emptyContext(),
      sensor_summary: [
        metric("temperature_c", {
          latest_source: "invalid",
          latest_value: null,
          is_invalid: true,
          is_degraded: true,
        }),
      ],
    };
    expect(
      buildAiDoctorPhase1Checklist({ context: invalid, ctaContext: CTA_CTX }).find(
        (i) => i.id === "fresh_sensor",
      )?.status,
    ).toBe("needs_review");
  });

  it("marks photo/diary/watering as available when counts > 0", () => {
    const ctx = {
      ...emptyContext(),
      recent_photos_count: 2,
      recent_logs: [
        { occurred_at: "2026-06-18T00:00:00Z", event_type: "note", source: "manual", note: null },
      ],
      recent_watering_events: 1,
    };
    const items = buildAiDoctorPhase1Checklist({ context: ctx, ctaContext: CTA_CTX });
    expect(items.find((i) => i.id === "recent_photo")?.status).toBe("available");
    expect(items.find((i) => i.id === "recent_diary")?.status).toBe("available");
    expect(items.find((i) => i.id === "watering_feeding")?.status).toBe("available");
  });

  it("marks plant context items missing when not provided", () => {
    const items = buildAiDoctorPhase1Checklist({
      context: emptyContext(),
      ctaContext: CTA_CTX,
    });
    for (const id of ["stage", "medium", "pot_size"]) {
      expect(items.find((i) => i.id === id)?.status).toBe("missing");
    }
  });

  it("treats a null context as fully missing", () => {
    const items = buildAiDoctorPhase1Checklist({
      context: null,
      ctaContext: CTA_CTX,
    });
    for (const item of items) {
      expect(item.status).toBe("missing");
    }
  });

  it("omits plant-scoped CTAs when no plantId is available (only Check Environment remains)", () => {
    const items = buildAiDoctorPhase1Checklist({
      context: emptyContext(),
      ctaContext: { plantId: null },
    });
    const ctaIds = items.map((i) => i.cta?.id ?? null).filter(Boolean);
    expect(ctaIds).toEqual(["check-environment"]);
  });
});

describe("AiDoctorPhase1MissingContextChecklist — render", () => {
  it("renders status badges and CTAs for representative state", () => {
    const ctx = {
      ...emptyContext(),
      sensor_summary: [
        metric("temperature_c", {
          latest_source: "stale",
          is_stale: true,
          is_degraded: true,
        }),
      ],
    };
    renderWithRouter(
      <AiDoctorPhase1MissingContextChecklist
        context={ctx}
        ctaContext={CTA_CTX}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-phase1-checklist-status-recent_photo")
        .textContent,
    ).toBe("Missing");
    expect(
      screen.getByTestId("ai-doctor-phase1-checklist-status-recent_diary")
        .textContent,
    ).toBe("Missing");
    expect(
      screen.getByTestId("ai-doctor-phase1-checklist-status-fresh_sensor")
        .textContent,
    ).toBe("Needs review");
    expect(
      screen.getByTestId(
        "ai-doctor-phase1-checklist-cta-recent_photo-add-photo",
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        "ai-doctor-phase1-checklist-cta-recent_diary-add-quick-log",
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        "ai-doctor-phase1-checklist-cta-fresh_sensor-check-environment",
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        "ai-doctor-phase1-checklist-cta-stage-update-plant-context",
      ),
    ).toBeTruthy();
  });

  it("renders no aggressive nutrient/equipment/stress advice", () => {
    const { container } = renderWithRouter(
      <AiDoctorPhase1MissingContextChecklist
        context={emptyContext()}
        ctaContext={CTA_CTX}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(
      /increase|raise (?:nutrients|EC|N|P|K)|defoliate|transplant|flush|nute|ppm boost|aggressive/i,
    );
  });

  it("CTAs preserve plantId/growId/tentId", () => {
    renderWithRouter(
      <AiDoctorPhase1MissingContextChecklist
        context={emptyContext()}
        ctaContext={CTA_CTX}
      />,
    );
    const photoHref =
      screen
        .getByTestId("ai-doctor-phase1-checklist-cta-recent_photo-add-photo")
        .getAttribute("href") ?? "";
    expect(photoHref).toContain("plantId=plant-a");
    expect(photoHref).toContain("growId=grow-1");
    expect(photoHref).toContain("tentId=tent-1");
  });
});

describe("static safety — AiDoctorPhase1MissingContextChecklist", () => {
  const SRC = readFileSync(
    resolve(
      __dirname,
      "../components/AiDoctorPhase1MissingContextChecklist.tsx",
    ),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("no Supabase/fetch/model/write/device-control surface", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|ai-gateway/i);
    expect(SRC).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/alert.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
    expect(SRC).not.toMatch(/service_role|bridge[_-]?token/i);
  });
});

describe("helperTextForChecklistItem — local-facts-only helper copy", () => {
  it("renders the expected helper for each missing item and stale sensor", async () => {
    const { helperTextForChecklistItem } = await import(
      "@/components/AiDoctorPhase1MissingContextChecklist"
    );
    const cases: Array<[string, "missing" | "needs_review", RegExp]> = [
      ["recent_photo", "missing", /No recent plant photo/i],
      ["recent_diary", "missing", /No recent diary or Quick Log entry/i],
      ["fresh_sensor", "missing", /No fresh live or manual sensor snapshot/i],
      ["fresh_sensor", "needs_review", /stale, invalid, or degraded/i],
      ["watering_feeding", "missing", /No recent watering or feeding/i],
      ["stage", "missing", /Plant stage is not available/i],
      ["medium", "missing", /Medium is not available/i],
      ["pot_size", "missing", /Pot size is not available/i],
    ];
    for (const [id, status, re] of cases) {
      const helper = helperTextForChecklistItem({
        id: id as never,
        label: id,
        status,
        next_step: "",
        cta: null,
      });
      expect(helper, `helper for ${id}/${status}`).toMatch(re);
    }
  });

  it("returns null for available items", async () => {
    const { helperTextForChecklistItem } = await import(
      "@/components/AiDoctorPhase1MissingContextChecklist"
    );
    const helper = helperTextForChecklistItem({
      id: "recent_photo",
      label: "x",
      status: "available",
      next_step: "",
      cta: null,
    });
    expect(helper).toBeNull();
  });

  it("contains no nutrient/equipment/stress/action advice", async () => {
    const { helperTextForChecklistItem } = await import(
      "@/components/AiDoctorPhase1MissingContextChecklist"
    );
    const ids = [
      "recent_photo",
      "recent_diary",
      "fresh_sensor",
      "watering_feeding",
      "stage",
      "medium",
      "pot_size",
    ] as const;
    for (const id of ids) {
      for (const status of ["missing", "needs_review"] as const) {
        const helper = helperTextForChecklistItem({
          id,
          label: id,
          status,
          next_step: "",
          cta: null,
        });
        if (helper) {
          expect(helper).not.toMatch(
            /\b(increase|raise|defoliate|transplant|flush|nute|ppm|EC|train|topping|fimming)\b|turn on|turn off|switch off|run pump/i,
          );
        }
      }
    }
  });
});

describe("AiDoctorPhase1MissingContextChecklist — helper text rendering + mobile CTA", () => {
  it("renders helper text for each missing item and stale sensor", () => {
    const ctx = {
      ...emptyContext(),
      sensor_summary: [
        metric("temperature_c", {
          latest_source: "stale",
          is_stale: true,
          is_degraded: true,
        }),
      ],
    };
    renderWithRouter(
      <AiDoctorPhase1MissingContextChecklist context={ctx} ctaContext={CTA_CTX} />,
    );
    for (const id of [
      "recent_photo",
      "recent_diary",
      "fresh_sensor",
      "watering_feeding",
      "stage",
      "medium",
      "pot_size",
    ]) {
      expect(
        screen.getByTestId(`ai-doctor-phase1-checklist-helper-${id}`),
      ).toBeTruthy();
    }
    expect(
      screen.getByTestId("ai-doctor-phase1-checklist-helper-fresh_sensor")
        .textContent,
    ).toMatch(/stale, invalid, or degraded/i);
  });

  it("does not render helper text for available items", () => {
    const ctx = {
      ...emptyContext(),
      stage: "veg",
      medium: "soil",
      pot_size: "5gal",
      recent_photos_count: 1,
      recent_logs: [
        { occurred_at: "2026-06-18T00:00:00Z", event_type: "note", source: "manual", note: null },
      ],
      recent_watering_events: 1,
      sensor_summary: [metric("temperature_c")],
    };
    renderWithRouter(
      <AiDoctorPhase1MissingContextChecklist context={ctx} ctaContext={CTA_CTX} />,
    );
    for (const id of [
      "recent_photo",
      "recent_diary",
      "fresh_sensor",
      "watering_feeding",
      "stage",
      "medium",
      "pot_size",
    ]) {
      expect(
        screen.queryByTestId(`ai-doctor-phase1-checklist-helper-${id}`),
      ).toBeNull();
    }
  });

  it("safely renders helpers under a null context", () => {
    renderWithRouter(
      <AiDoctorPhase1MissingContextChecklist context={null} ctaContext={CTA_CTX} />,
    );
    expect(
      screen.getByTestId("ai-doctor-phase1-checklist-helper-recent_photo"),
    ).toBeTruthy();
  });

  it("CTAs use mobile-stacking, full-width, thumb-friendly classes", () => {
    renderWithRouter(
      <AiDoctorPhase1MissingContextChecklist context={emptyContext()} ctaContext={CTA_CTX} />,
    );
    const cta = screen.getByTestId(
      "ai-doctor-phase1-checklist-cta-recent_photo-add-photo",
    );
    const cls = cta.getAttribute("class") ?? "";
    expect(cls).toMatch(/\bw-full\b/);
    expect(cls).toMatch(/\bsm:w-auto\b/);
    expect(cls).toMatch(/\bmin-h-10\b/);
  });
});
