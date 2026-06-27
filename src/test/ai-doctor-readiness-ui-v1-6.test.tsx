/**
 * AI Doctor Readiness UI v1.6 — read-only regression coverage for:
 *  1. Evidence/badge tie-ordering determinism (duplicates, same-timestamp ties)
 *  2. Accessibility semantics (accessible names, roles, headings, visible
 *     trust copy, focusable controls)
 *  3. Quick-action click + keyboard (Enter/Space) interaction at the panel layer
 *
 * Hard constraints (V0):
 *  - No Supabase reads/writes, no fetch, no functions.invoke, no model calls,
 *    no Action Queue writes, no device control, no localStorage mutation.
 *  - Render-time mocks throw on supabase / fetch / functions.invoke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import {
  SOURCE_BADGE_CASES,
  buildReadingForSource,
  buildReadinessContext,
  readinessFixtureAgo,
  READINESS_FIXTURE_HOUR_MS,
} from "@/test/utils/aiDoctorReadinessFixtures";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in v1.6 test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in v1.6 test");
      },
    },
  },
}));

const fetchSpy = vi
  .spyOn(globalThis, "fetch" as never)
  .mockImplementation((() => {
    throw new Error("fetch not allowed in v1.6 test");
  }) as never);

beforeEach(() => {
  fetchSpy.mockClear();
});

const HOUR = READINESS_FIXTURE_HOUR_MS;
const ago = readinessFixtureAgo;

// Helper — serialize visible structural state used for tie-order asserts.
function snapshotPanelStructure(): {
  sourceBadges: string[];
  limitations: string[];
  headers: string[];
  quickActions: string[];
} {
  const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
  const sources = panel.querySelector(
    '[data-testid="ai-doctor-context-readiness-panel-sources"]',
  );
  const sourceBadges = sources
    ? Array.from(sources.querySelectorAll("li")).map(
        (li) => `${li.getAttribute("data-source")}|${(li.textContent ?? "").trim()}`,
      )
    : [];
  const limList = panel.querySelector(
    '[data-testid="ai-doctor-context-readiness-panel-limitations"]',
  );
  const limitations = limList
    ? Array.from(limList.querySelectorAll("li")).map(
        (li) => li.getAttribute("data-testid") ?? "",
      )
    : [];
  const headers = Array.from(panel.querySelectorAll("h2, h3")).map(
    (h) => (h.textContent ?? "").trim(),
  );
  const qa = panel.querySelector(
    '[data-testid="ai-doctor-context-readiness-panel-quick-actions"]',
  );
  const quickActions = qa
    ? Array.from(qa.querySelectorAll("button")).map(
        (b) => b.getAttribute("data-quick-action") ?? "",
      )
    : [];
  return { sourceBadges, limitations, headers, quickActions };
}

// ---------------------------------------------------------------------------
// 1. Tie-ordering determinism
// ---------------------------------------------------------------------------

describe("AI Doctor Readiness UI v1.6 — tie ordering determinism", () => {
  it("aggregates duplicate same-source readings into a single badge with cumulative sampleCount", () => {
    const readings = [
      buildReadingForSource("manual", { metric: "temperature_c", value: 24, captured_at: ago(HOUR) }),
      buildReadingForSource("manual", { metric: "humidity_pct", value: 55, captured_at: ago(HOUR) }),
      buildReadingForSource("manual", { metric: "vpd_kpa", value: 1.1, captured_at: ago(HOUR) }),
    ];
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ sensorReadings: readings })}
      />,
    );
    const badges = screen.getAllByTestId(/^ai-doctor-context-readiness-panel-source-/);
    // Exactly one badge for the manual source — no duplicate badges.
    const manualBadges = badges.filter(
      (b) => b.getAttribute("data-source") === "manual",
    );
    expect(manualBadges).toHaveLength(1);
    expect(manualBadges[0]!.textContent ?? "").toMatch(/·\s*3\b/);
  });

  it("renders deterministic order across re-renders for mixed source-quality readings with tied timestamps", () => {
    const ts = ago(HOUR);
    const mixed = [
      buildReadingForSource("invalid", { metric: "temperature_c", captured_at: ts }),
      buildReadingForSource("demo", { metric: "humidity_pct", captured_at: ts }),
      buildReadingForSource("csv", { metric: "vpd_kpa", captured_at: ts }),
      buildReadingForSource("manual", { metric: "soil_moisture_pct", captured_at: ts }),
      buildReadingForSource("live", { metric: "co2_ppm", captured_at: ts }),
      buildReadingForSource("stale", { metric: "leaf_temp_c", captured_at: ts }),
    ];

    const ctx = buildReadinessContext({ sensorReadings: mixed });
    const { unmount } = render(<AiDoctorContextReadinessPanel context={ctx} />);
    const first = snapshotPanelStructure();
    unmount();
    render(<AiDoctorContextReadinessPanel context={ctx} />);
    const second = snapshotPanelStructure();

    expect(second).toEqual(first);
    // No untrusted source mis-labeled as live/healthy.
    for (const entry of first.sourceBadges) {
      const text = entry.toLowerCase();
      expect(text).not.toContain("healthy");
    }
  });

  it("never renders the same source badge twice (no duplicate badges per source key)", () => {
    const sameCsv = Array.from({ length: 4 }).map((_, i) =>
      buildReadingForSource("csv", {
        metric: `metric_${i}`,
        captured_at: ago(HOUR),
      }),
    );
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ sensorReadings: sameCsv })}
      />,
    );
    const csvBadges = screen
      .getAllByTestId(/^ai-doctor-context-readiness-panel-source-/)
      .filter((b) => b.getAttribute("data-source") === "csv");
    expect(csvBadges).toHaveLength(1);
    expect(csvBadges[0]!.textContent ?? "").toMatch(/·\s*4\b/);
  });

  it("ties in tied-timestamp grow events do not reorder limitations between renders", () => {
    const ts = ago(HOUR);
    const events = [
      { occurred_at: ts, event_type: "watering", source: "manual" },
      { occurred_at: ts, event_type: "feeding", source: "manual" },
      { occurred_at: ts, event_type: "photo", source: "manual" },
    ];
    const ctx = buildReadinessContext({ growEvents: events, plant: { stage: null } });
    const { unmount } = render(<AiDoctorContextReadinessPanel context={ctx} />);
    const first = snapshotPanelStructure();
    unmount();
    render(<AiDoctorContextReadinessPanel context={ctx} />);
    const second = snapshotPanelStructure();
    expect(second.limitations).toEqual(first.limitations);
    expect(second.headers).toEqual(first.headers);
  });
});

// ---------------------------------------------------------------------------
// 2. Accessibility semantics
// ---------------------------------------------------------------------------

describe("AI Doctor Readiness UI v1.6 — accessibility semantics", () => {
  it("panel exposes a stable accessible name via aria-labelledby heading", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ plant: { stage: null } })}
      />,
    );
    const region = screen.getByRole("region", {
      name: /AI Doctor Context Readiness/i,
    });
    expect(region).toBeTruthy();
    // Single H2 — the panel heading; never demoted to H3/H4.
    const h2 = region.querySelector("h2");
    expect(h2?.textContent ?? "").toMatch(/AI Doctor Context Readiness/);
  });

  it("source badges expose readable label + count + trust state via text and data-trustworthy", () => {
    for (const cse of SOURCE_BADGE_CASES) {
      const { unmount } = render(
        <AiDoctorContextReadinessPanel
          context={buildReadinessContext({
            sensorReadings: [buildReadingForSource(cse.source)],
          })}
        />,
      );
      const badge = screen.getByTestId(
        `ai-doctor-context-readiness-panel-source-${cse.source}`,
      );
      const text = (badge.textContent ?? "").trim();
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain(cse.label);
      expect(text).toMatch(/·\s*\d+/);
      expect(badge.getAttribute("data-trustworthy")).toBe(
        cse.isTrustworthy ? "true" : "false",
      );
      unmount();
    }
  });

  it("trust warnings on stale/invalid telemetry are visible text, not color-only", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({
          sensorReadings: [buildReadingForSource("invalid")],
        })}
      />,
    );
    const limitation = screen.getByTestId(
      "ai-doctor-context-readiness-panel-limitation-stale_or_invalid",
    );
    const text = (limitation.textContent ?? "").toLowerCase();
    expect(text).toContain("untrusted");
    expect(text).not.toContain("healthy");
  });

  it("quick-action buttons have non-empty accessible names and are reachable by role", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ plant: { stage: null } })}
        quickActions={{
          onFastAddPhoto: () => {},
          onAddWatering: () => {},
          onAddFeeding: () => {},
        }}
      />,
    );
    const fastPhoto = screen.getByRole("button", { name: /Fast Add Photo/i });
    const watering = screen.getByRole("button", { name: /Add Watering/i });
    const feeding = screen.getByRole("button", { name: /Add Feeding/i });
    for (const btn of [fastPhoto, watering, feeding]) {
      expect((btn.textContent ?? "").trim().length).toBeGreaterThan(0);
      expect(btn.tagName.toLowerCase()).toBe("button");
      expect(btn.getAttribute("aria-disabled")).toBe("false");
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it("disabled quick-action buttons expose aria-disabled=true and disabled prop", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ plant: { stage: null } })}
      />,
    );
    const btn = screen.getByTestId(
      "ai-doctor-context-readiness-panel-quick-action-fast-add-photo",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    // Still has a visible, non-empty accessible name.
    expect((btn.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("limitations and missing-information sections are discoverable by role/text", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ plant: { stage: null } })}
      />,
    );
    expect(screen.getByRole("heading", { name: /Limitations/i })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /Missing information/i }),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. Quick-action click + keyboard interaction
// ---------------------------------------------------------------------------

describe("AI Doctor Readiness UI v1.6 — quick-action click + keyboard", () => {
  it("mouse click on Add Watering fires exactly one handler call", async () => {
    const onAddWatering = vi.fn();
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ plant: { stage: null } })}
        quickActions={{ onAddWatering }}
      />,
    );
    const btn = screen.getByRole("button", { name: /Add Watering/i });
    fireEvent.click(btn);
    expect(onAddWatering).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Enter key on focused Add Watering fires exactly one handler call", async () => {
    const user = userEvent.setup();
    const onAddWatering = vi.fn();
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ plant: { stage: null } })}
        quickActions={{ onAddWatering }}
      />,
    );
    const btn = screen.getByRole("button", { name: /Add Watering/i });
    btn.focus();
    expect(document.activeElement).toBe(btn);
    await user.keyboard("{Enter}");
    expect(onAddWatering).toHaveBeenCalledTimes(1);
  });

  it("Space key on focused Add Feeding fires exactly one handler call", async () => {
    const user = userEvent.setup();
    const onAddFeeding = vi.fn();
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ plant: { stage: null } })}
        quickActions={{ onAddFeeding }}
      />,
    );
    const btn = screen.getByRole("button", { name: /Add Feeding/i });
    btn.focus();
    await user.keyboard(" ");
    expect(onAddFeeding).toHaveBeenCalledTimes(1);
  });

  it("disabled quick-action: click and Enter both dispatch zero handler calls and no fetch", async () => {
    const user = userEvent.setup();
    const onFastAddPhoto = vi.fn();
    // No handler wired → button is disabled by the panel.
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ plant: { stage: null } })}
      />,
    );
    const btn = screen.getByTestId(
      "ai-doctor-context-readiness-panel-quick-action-fast-add-photo",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    btn.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onFastAddPhoto).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
