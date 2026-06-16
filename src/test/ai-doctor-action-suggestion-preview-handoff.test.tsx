/**
 * AI Doctor Action Suggestion Preview → Action Queue handoff coverage.
 *
 * Proves the preview surface keeps the Action Queue handoff disabled and
 * never invokes a write helper:
 *   - Disabled "Add to Action Queue" button is rendered.
 *   - Clicking it does nothing — no Supabase, no fetch, no functions.invoke.
 *   - The preview surface module text contains no Supabase / write-path
 *     imports or write helper references.
 *   - Demo/stale/invalid-only and ineligible contexts also render disabled.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

const supabaseFrom = vi.fn(() => {
  throw new Error("supabase.from must not be called from preview");
});
const supabaseFunctionsInvoke = vi.fn(() => {
  throw new Error("supabase.functions.invoke must not be called from preview");
});
const supabaseRpc = vi.fn(() => {
  throw new Error("supabase.rpc must not be called from preview");
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: supabaseFrom,
    rpc: supabaseRpc,
    functions: { invoke: supabaseFunctionsInvoke },
  },
}));

const fetchSpy = vi
  .spyOn(globalThis, "fetch" as never)
  .mockImplementation((() => {
    throw new Error("fetch must not be called from preview");
  }) as never);

const NOW = new Date("2026-06-10T12:00:00Z");
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const plant = {
  id: "p1",
  name: "Plant A",
  strain: "NL",
  stage: "veg" as const,
  grow_id: "g1",
  tent_id: "t1",
};

function ctxFrom(
  events: ReadonlyArray<Record<string, unknown>>,
  readings: ReadonlyArray<Record<string, unknown>>,
) {
  return compileAiDoctorContextFromRows({
    plant,
    growEvents: events,
    sensorReadings: readings,
    now: NOW,
  });
}

function expectDisabledHandoff() {
  const btn = screen.getByTestId(
    "ai-doctor-action-suggestion-preview-handoff-button",
  ) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  expect(btn.getAttribute("aria-disabled")).toBe("true");
  const note = screen.getByTestId(
    "ai-doctor-action-suggestion-preview-handoff-note",
  );
  expect(note.textContent ?? "").toMatch(
    /Action Queue write path not enabled for AI Doctor previews\./,
  );
  return btn;
}

describe("AI Doctor preview → Action Queue handoff (disabled)", () => {
  it("renders a disabled handoff button with the not-enabled note (eligible context)", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={ctxFrom(
          [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
          [
            { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
            { metric: "humidity_pct", value: 55, captured_at: ago(HOUR), source: "live" },
          ],
        )}
      />,
    );
    expect(
      screen
        .getByTestId("ai-doctor-action-suggestion-preview")
        .getAttribute("data-status"),
    ).toBe("eligible");
    expectDisabledHandoff();
  });

  it("clicking the disabled button does not invoke any write helper or show success", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={ctxFrom(
          [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
          [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" }],
        )}
      />,
    );
    const btn = expectDisabledHandoff();
    supabaseFrom.mockClear();
    supabaseRpc.mockClear();
    supabaseFunctionsInvoke.mockClear();
    fetchSpy.mockClear();

    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(supabaseFrom).not.toHaveBeenCalled();
    expect(supabaseRpc).not.toHaveBeenCalled();
    expect(supabaseFunctionsInvoke).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    const panel = screen.getByTestId("ai-doctor-action-suggestion-preview");
    const text = panel.textContent ?? "";
    expect(text).not.toMatch(/\bapproved\b/i);
    expect(text).not.toMatch(/\b(queued|added to the queue)\b/i);
    expect(text).not.toMatch(/\b(was|is|has been|have been) executed\b/i);
    expect(text).not.toMatch(/success/i);
  });

  it("demo/stale/invalid-only telemetry still renders the disabled handoff", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={ctxFrom(
          [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
          [
            { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "invalid" },
          ],
        )}
      />,
    );
    expect(
      screen
        .getByTestId("ai-doctor-action-suggestion-preview")
        .getAttribute("data-status"),
    ).toBe("blocked_invalid_data");
    expectDisabledHandoff();
  });

  it("missing-context (ineligible) preview also keeps the handoff disabled", () => {
    const context = compileAiDoctorContextFromRows({
      plant: { id: "p1", name: "Plant A", strain: "X", stage: null, grow_id: null, tent_id: "t1" },
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    render(<AiDoctorContextReadinessPanel context={context} />);
    expect(
      screen
        .getByTestId("ai-doctor-action-suggestion-preview")
        .getAttribute("data-status"),
    ).toBe("missing_context");
    expectDisabledHandoff();
  });
});

describe("AI Doctor preview surface — static no-write guard", () => {
  const files = [
    "src/lib/aiDoctorActionSuggestionPreviewRules.ts",
    "src/components/AiDoctorContextReadinessPanel.tsx",
  ];

  for (const rel of files) {
    it(`${rel} imports no Supabase client and references no Action Queue write helpers`, () => {
      const text = readFileSync(join(process.cwd(), rel), "utf8");
      const stripped = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");

      expect(stripped).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
      expect(stripped).not.toMatch(/\bsupabase\s*\.\s*from\s*\(/);
      expect(stripped).not.toMatch(/\bsupabase\s*\.\s*rpc\s*\(/);
      expect(stripped).not.toMatch(/\bfunctions\s*\.\s*invoke\s*\(/);
      expect(stripped).not.toMatch(/\b(insert|update|upsert|delete)\s*\(/);
      expect(stripped).not.toMatch(/useAddAiDoctorSessionSuggestionToActionQueue/);
      expect(stripped).not.toMatch(/buildActionQueueDraftFromAiDoctorSession/);
      expect(stripped).not.toMatch(/AiDoctorSessionActionQueueButton/);
      expect(stripped).not.toMatch(/\bfetch\s*\(/);
    });
  }
});
