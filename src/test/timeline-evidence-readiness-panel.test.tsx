/**
 * Presenter tests for TimelineEvidenceReadinessPanel.
 *
 * Covers: counts surface, source badges per type, missing flags,
 * ready/limited/untrusted tone copy, no raw_payload leak, no
 * AI/Supabase/automation imports triggered, mobile-readable layout.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import TimelineEvidenceReadinessPanel from "@/components/TimelineEvidenceReadinessPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";
import {
  READINESS_LIMITED_COPY,
  READINESS_READY_COPY,
  READINESS_UNTRUSTED_COPY,
} from "@/lib/timelineEvidenceReadinessViewModel";

// Spy fetch so we can prove the panel never triggers an AI/network call.
const fetchSpy = vi.spyOn(globalThis, "fetch" as never);

const NOW = new Date("2026-06-10T12:00:00Z");
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const plant = {
  id: "p1",
  name: "Plant A",
  strain: "Northern Lights",
  stage: "veg" as const,
  grow_id: "g1",
  tent_id: "t1",
};

function ctx(opts: {
  growEvents?: ReadonlyArray<Record<string, unknown>>;
  sensorReadings?: ReadonlyArray<Record<string, unknown>>;
  stage?: string | null;
}) {
  return compileAiDoctorContextFromRows({
    plant: { ...plant, stage: ("stage" in opts ? opts.stage : plant.stage) as never },
    growEvents: opts.growEvents ?? [],
    sensorReadings: opts.sensorReadings ?? [],
    now: NOW,
  });
}

describe("TimelineEvidenceReadinessPanel — counts & badges", () => {
  it("renders counts for logs/photos/snapshots/watering/feeding/alerts", () => {
    const context = ctx({
      growEvents: [
        { occurred_at: ago(HOUR), event_type: "watering", source: "manual" },
        { occurred_at: ago(2 * HOUR), event_type: "feeding", source: "manual" },
        { occurred_at: ago(3 * HOUR), event_type: "observation", source: "manual" },
      ],
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "manual" },
      ],
    });
    render(
      <TimelineEvidenceReadinessPanel
        context={context}
        extras={{ recentPhotoCount: 2, openAlertsCount: 1 }}
      />,
    );
    expect(
      screen.getByTestId("timeline-evidence-readiness-count-recent-logs")
        .getAttribute("data-count"),
    ).toBe("3");
    expect(
      screen.getByTestId("timeline-evidence-readiness-count-recent-watering")
        .getAttribute("data-count"),
    ).toBe("1");
    expect(
      screen.getByTestId("timeline-evidence-readiness-count-recent-feeding")
        .getAttribute("data-count"),
    ).toBe("1");
    expect(
      screen.getByTestId("timeline-evidence-readiness-count-recent-photos")
        .getAttribute("data-count"),
    ).toBe("2");
    expect(
      screen.getByTestId("timeline-evidence-readiness-count-open-alerts")
        .getAttribute("data-count"),
    ).toBe("1");
    // Sensor snapshot count present (engine derives the rolling group).
    expect(
      Number(
        screen
          .getByTestId("timeline-evidence-readiness-count-recent-snapshots")
          .getAttribute("data-count"),
      ),
    ).toBeGreaterThan(0);
  });

  it("renders the source badge for each canonical type and never relabels demo/csv as live", () => {
    for (const src of ["manual", "live", "csv", "demo", "stale", "invalid"] as const) {
      const { unmount } = render(
        <TimelineEvidenceReadinessPanel
          context={ctx({
            sensorReadings: [
              { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: src },
            ],
          })}
        />,
      );
      const node = screen.getByTestId(`timeline-evidence-readiness-source-${src}`);
      expect(node.getAttribute("data-source")).toBe(src);
      if (src === "live" || src === "manual") {
        expect(node.getAttribute("data-trustworthy")).toBe("true");
      } else {
        expect(node.getAttribute("data-trustworthy")).toBe("false");
      }
      unmount();
    }
  });
});

describe("TimelineEvidenceReadinessPanel — missing flags & tone copy", () => {
  it("renders missing-photo / sensor / watering / feeding flags when absent", () => {
    render(<TimelineEvidenceReadinessPanel context={ctx({})} />);
    expect(
      screen.getByTestId("timeline-evidence-readiness-missing-no_recent_photos"),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        "timeline-evidence-readiness-missing-no_recent_sensor_snapshot",
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId("timeline-evidence-readiness-missing-no_recent_watering"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("timeline-evidence-readiness-missing-no_recent_feeding"),
    ).toBeTruthy();
  });

  it("renders unknown stage / medium / pot size flags when caller marks them unknown", () => {
    render(
      <TimelineEvidenceReadinessPanel
        context={ctx({ stage: null })}
        extras={{ mediumKnown: false, potSizeKnown: false }}
      />,
    );
    expect(
      screen.getByTestId("timeline-evidence-readiness-missing-unknown_stage"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("timeline-evidence-readiness-missing-unknown_medium"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("timeline-evidence-readiness-missing-unknown_pot_size"),
    ).toBeTruthy();
  });

  it("shows limited-confidence copy when context is thin but not untrusted", () => {
    render(
      <TimelineEvidenceReadinessPanel
        context={ctx({
          growEvents: [
            { occurred_at: ago(HOUR), event_type: "watering", source: "manual" },
          ],
          sensorReadings: [
            { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "manual" },
          ],
        })}
      />,
    );
    const panel = screen.getByTestId("timeline-evidence-readiness-panel");
    expect(panel.getAttribute("data-tone")).toBe("limited");
    expect(
      screen.getByTestId("timeline-evidence-readiness-headline").textContent,
    ).toBe(READINESS_LIMITED_COPY);
  });

  it("shows ready copy when sensor + logs + photo are present", () => {
    render(
      <TimelineEvidenceReadinessPanel
        context={ctx({
          growEvents: [
            { occurred_at: ago(HOUR), event_type: "watering", source: "manual" },
            { occurred_at: ago(2 * HOUR), event_type: "feeding", source: "manual" },
          ],
          sensorReadings: [
            { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "live" },
          ],
        })}
        extras={{ recentPhotoCount: 2 }}
      />,
    );
    const panel = screen.getByTestId("timeline-evidence-readiness-panel");
    expect(panel.getAttribute("data-tone")).toBe("ready");
    expect(
      screen.getByTestId("timeline-evidence-readiness-headline").textContent,
    ).toBe(READINESS_READY_COPY);
  });

  it("shows untrusted caution copy and not-healthy treatment for stale/invalid/demo", () => {
    render(
      <TimelineEvidenceReadinessPanel
        context={ctx({
          sensorReadings: [
            { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "stale" },
          ],
        })}
      />,
    );
    const panel = screen.getByTestId("timeline-evidence-readiness-panel");
    expect(panel.getAttribute("data-tone")).toBe("untrusted");
    expect(panel.getAttribute("data-untrusted")).toBe("true");
    expect(
      screen.getByTestId("timeline-evidence-readiness-headline").textContent,
    ).toBe(READINESS_UNTRUSTED_COPY);
    const badge = screen.getByTestId("timeline-evidence-readiness-source-stale");
    expect(badge.getAttribute("data-trustworthy")).toBe("false");
  });
});

describe("TimelineEvidenceReadinessPanel — safety", () => {
  it("never exposes raw_payload, private IDs, or vendor metadata in rendered DOM", () => {
    const context = ctx({
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: ago(HOUR), source: "manual" },
      ],
    });
    // Even if we pass tainted extras, presenter must not surface them.
    const tainted = {
      recentPhotoCount: 1,
      ...({
        raw_payload: { token: "SECRET-TOKEN-123" },
        private_id: "private-user-id-abc",
        vendor_metadata: { api_key: "k_live_xyz" },
      } as Record<string, unknown>),
    } as never;
    render(
      <TimelineEvidenceReadinessPanel context={context} extras={tainted} />,
    );
    const html = screen
      .getByTestId("timeline-evidence-readiness-panel")
      .outerHTML;
    expect(html).not.toMatch(/raw_payload/i);
    expect(html).not.toMatch(/SECRET-TOKEN-123/);
    expect(html).not.toMatch(/private-user-id-abc/);
    expect(html).not.toMatch(/k_live_xyz/);
  });

  it("rendering does NOT trigger a fetch (no AI call)", () => {
    fetchSpy.mockClear();
    render(<TimelineEvidenceReadinessPanel context={ctx({})} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("static safety: presenter source contains no Supabase/fetch/AI/Action-Queue imports", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/TimelineEvidenceReadinessPanel.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/\bfetch\(/);
    // Type-only imports of AiDoctorContext are OK; runtime AI/network code is not.
    expect(src).not.toMatch(/generateAiDoctorResult|callAiDoctor|runAiDoctor/);
    expect(src).not.toMatch(/action_queue/);
    expect(src).not.toMatch(/insertAlert|createAlert/);
    expect(src).not.toMatch(/deviceControl|device_control/);
  });

  it("mobile layout: counts grid uses 2-column baseline so cells stay visible at narrow widths", () => {
    render(<TimelineEvidenceReadinessPanel context={ctx({})} />);
    const grid = screen.getByTestId("timeline-evidence-readiness-counts");
    expect(grid.className).toMatch(/grid-cols-2/);
  });
});
