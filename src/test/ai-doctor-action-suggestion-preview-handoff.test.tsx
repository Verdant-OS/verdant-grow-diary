/**
 * AI Doctor Action Suggestion Preview has no placeholder Action Queue handoff.
 *
 * Proves the preview surface stays read-only without advertising a dead
 * write path:
 *   - No "Add to Action Queue" control or not-enabled placeholder is rendered.
 *   - Rendering never invokes Supabase, fetch, or functions.invoke.
 *   - The preview surface module text contains no Supabase / write-path
 *     imports or write helper references.
 *   - Eligible, invalid, and ineligible contexts all keep the same fence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
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

function expectNoHandoff() {
  const preview = screen.getByTestId("ai-doctor-action-suggestion-preview");
  expect(preview.querySelectorAll("button")).toHaveLength(0);
  expect(screen.queryByTestId("ai-doctor-action-suggestion-preview-handoff-button")).toBeNull();
  expect(screen.queryByTestId("ai-doctor-action-suggestion-preview-handoff-note")).toBeNull();
  expect(preview).not.toHaveTextContent("Add to Action Queue");
  expect(preview).not.toHaveTextContent("write path not enabled");
}

describe("AI Doctor preview → Action Queue handoff fence", () => {
  it("renders no handoff placeholder for an eligible context", () => {
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
      screen.getByTestId("ai-doctor-action-suggestion-preview").getAttribute("data-status"),
    ).toBe("eligible");
    expectNoHandoff();
  });

  it("rendering the read-only preview does not invoke a write helper or show success", () => {
    supabaseFrom.mockClear();
    supabaseRpc.mockClear();
    supabaseFunctionsInvoke.mockClear();
    fetchSpy.mockClear();

    render(
      <AiDoctorContextReadinessPanel
        context={ctxFrom(
          [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
          [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" }],
        )}
      />,
    );
    expectNoHandoff();

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

  it("invalid telemetry still renders no handoff placeholder", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={ctxFrom(
          [{ occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" }],
          [{ metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "invalid" }],
        )}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-action-suggestion-preview").getAttribute("data-status"),
    ).toBe("blocked_invalid_data");
    expectNoHandoff();
  });

  it("missing-context preview also renders no handoff placeholder", () => {
    const context = compileAiDoctorContextFromRows({
      plant: { id: "p1", name: "Plant A", strain: "X", stage: null, grow_id: null, tent_id: "t1" },
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    render(<AiDoctorContextReadinessPanel context={context} />);
    expect(
      screen.getByTestId("ai-doctor-action-suggestion-preview").getAttribute("data-status"),
    ).toBe("missing_context");
    expectNoHandoff();
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
