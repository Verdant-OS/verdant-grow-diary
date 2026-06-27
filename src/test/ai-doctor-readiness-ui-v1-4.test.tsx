/**
 * ai-doctor-readiness-ui-v1-4
 *
 * v1.4 regression coverage for the AI Doctor Context Readiness UI:
 *  - Source badge trust/caution styling per source (live/manual/csv/demo/
 *    stale/invalid), locking class hooks + data-* attrs that drive tone.
 *  - csv stays separate from live; demo/stale/invalid stay separate from
 *    trusted sources; "healthy" never appears on untrusted badges.
 *  - Mobile-viewport regression: deterministic H2/H3 header order and
 *    section presence under a mobile-sized window for both
 *    missing/limited and strong context panels. JSDOM cannot prove
 *    visual layout — these tests assert DOM order under a mobile-width
 *    `window.innerWidth`, which is the readable contract this panel
 *    actually exposes (Tailwind `sm:` is CSS-only and unobservable in
 *    JSDOM).
 *  - Quick actions remain reachable on a mobile-width viewport.
 *
 * Hard constraints:
 *  - Tests-only. No runtime code changes. No model/API calls. No
 *    Supabase writes. No alerts. No Action Queue writes.
 *  - Render-time mocks throw on supabase / fetch / functions.invoke.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
      throw new Error("Supabase access not allowed in v1.4 readiness test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in v1.4 readiness test");
      },
    },
  },
}));

const fetchSpy = vi
  .spyOn(globalThis, "fetch" as never)
  .mockImplementation((() => {
    throw new Error("fetch not allowed in v1.4 readiness test");
  }) as never);

beforeEach(() => {
  fetchSpy.mockClear();
});

// ---------------------------------------------------------------------------
// Source-badge trust/caution styling — locks the className tokens that drive
// the trust vs caution tone so untrusted sources cannot drift to the
// emerald/trusted palette and trusted sources cannot drift to amber/caution.
// ---------------------------------------------------------------------------

const TRUSTED_TONE_CLASSES = ["border-emerald-500/30", "text-emerald-200"];
const CAUTION_TONE_CLASSES = ["border-amber-500/30", "text-amber-200"];
const UNTRUSTED_FORBIDDEN_WORDS = ["healthy", "live sensor", "trusted"];

describe("AI Doctor Readiness UI v1.4 — source badge trust/caution styling", () => {
  for (const cse of SOURCE_BADGE_CASES) {
    it(`source=${cse.source} renders ${cse.trustCopy} tone classes + matching data-trustworthy`, () => {
      const context = buildReadinessContext({
        sensorReadings: [buildReadingForSource(cse.source)],
      });
      render(<AiDoctorContextReadinessPanel context={context} />);
      const badge = screen.getByTestId(
        `ai-doctor-context-readiness-panel-source-${cse.source}`,
      );

      // Stable data hooks
      expect(badge.getAttribute("data-source")).toBe(cse.source);
      expect(badge.getAttribute("data-trustworthy")).toBe(
        cse.isTrustworthy ? "true" : "false",
      );
      // Label + count
      expect(badge.textContent ?? "").toContain(cse.label);
      expect(badge.textContent ?? "").toMatch(/·\s*1\b/);

      // Tone classes — exactly one palette per trust state, never both.
      const cls = badge.className;
      const trusted = TRUSTED_TONE_CLASSES.every((c) => cls.includes(c));
      const caution = CAUTION_TONE_CLASSES.every((c) => cls.includes(c));
      if (cse.isTrustworthy) {
        expect(trusted).toBe(true);
        expect(caution).toBe(false);
      } else {
        expect(caution).toBe(true);
        expect(trusted).toBe(false);
      }

      // Untrusted sources must never use healthy/live-sensor wording.
      if (!cse.isTrustworthy) {
        const lower = (badge.textContent ?? "").toLowerCase();
        for (const word of UNTRUSTED_FORBIDDEN_WORDS) {
          expect(lower).not.toContain(word);
        }
      }
    });
  }

  it("csv badge stays distinct from a live badge (no shared tone, no shared label)", () => {
    const context = buildReadinessContext({
      sensorReadings: [
        buildReadingForSource("csv"),
        buildReadingForSource("live", { metric: "humidity_pct", value: 55 }),
      ],
    });
    render(<AiDoctorContextReadinessPanel context={context} />);
    const csv = screen.getByTestId("ai-doctor-context-readiness-panel-source-csv");
    const live = screen.getByTestId("ai-doctor-context-readiness-panel-source-live");

    expect(csv.getAttribute("data-trustworthy")).toBe("false");
    expect(live.getAttribute("data-trustworthy")).toBe("true");
    expect(csv.textContent).not.toBe(live.textContent);
    // csv carries caution palette; live carries trusted palette.
    expect(CAUTION_TONE_CLASSES.every((c) => csv.className.includes(c))).toBe(true);
    expect(TRUSTED_TONE_CLASSES.every((c) => live.className.includes(c))).toBe(true);
  });

  it("demo / stale / invalid never share trusted palette with live in the same panel", () => {
    const context = buildReadinessContext({
      sensorReadings: [
        buildReadingForSource("live"),
        buildReadingForSource("demo", { metric: "humidity_pct", value: 50 }),
        buildReadingForSource("stale", { metric: "vpd_kpa", value: 1.1 }),
        buildReadingForSource("invalid", { metric: "co2_ppm", value: 400 }),
      ],
    });
    render(<AiDoctorContextReadinessPanel context={context} />);
    for (const source of ["demo", "stale", "invalid"] as const) {
      const badge = screen.getByTestId(
        `ai-doctor-context-readiness-panel-source-${source}`,
      );
      expect(badge.getAttribute("data-trustworthy")).toBe("false");
      expect(CAUTION_TONE_CLASSES.every((c) => badge.className.includes(c))).toBe(
        true,
      );
      expect(TRUSTED_TONE_CLASSES.every((c) => badge.className.includes(c))).toBe(
        false,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Mobile viewport regression — JSDOM does not lay out responsive CSS, so we
// drive `window.innerWidth` and dispatch a resize to assert the panel's
// observable DOM contract (header order, section presence, quick-action
// reachability) does not depend on viewport width.
// ---------------------------------------------------------------------------

const MOBILE_WIDTH = 375;
const MOBILE_HEIGHT = 812;

function setMobileViewport() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: MOBILE_WIDTH,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: MOBILE_HEIGHT,
  });
  window.dispatchEvent(new Event("resize"));
}

function restoreViewport(prevW: number, prevH: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: prevW,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: prevH,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("AI Doctor Readiness UI v1.4 — mobile viewport regression (DOM order under mobile width)", () => {
  let prevW = 1024;
  let prevH = 768;
  beforeEach(() => {
    prevW = window.innerWidth;
    prevH = window.innerHeight;
    setMobileViewport();
  });
  afterEach(() => {
    restoreViewport(prevW, prevH);
  });

  it("missing/limited context: header order is deterministic on mobile width", () => {
    const context = buildReadinessContext({ plant: { stage: null } });
    render(<AiDoctorContextReadinessPanel context={context} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    const headers = Array.from(panel.querySelectorAll("h2, h3")).map((h) =>
      (h.textContent ?? "").trim(),
    );
    expect(headers).toMatchInlineSnapshot(`
      [
        "AI Doctor Context Readiness",
        "Next evidence to add",
        "Sensor source labels",
        "Current reading quality",
        "Limitations",
        "Missing information",
        "Preview AI Doctor output",
        "Action Queue suggestion preview",
      ]
    `);
    // Limitations + missing-info sections render under mobile width.
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-limitations"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-missing"),
    ).toBeTruthy();
    // Quick actions remain reachable.
    expect(
      screen.getByTestId(
        "ai-doctor-context-readiness-panel-quick-actions",
      ),
    ).toBeTruthy();
  });

  it("strong context: header order is deterministic on mobile width and omits Limitations/Missing", () => {
    const HOUR = READINESS_FIXTURE_HOUR_MS;
    const ago = readinessFixtureAgo;
    const context = buildReadinessContext({
      growEvents: [
        { occurred_at: ago(12 * HOUR), event_type: "watering", source: "manual" },
        { occurred_at: ago(8 * HOUR), event_type: "feeding", source: "manual" },
        { occurred_at: ago(4 * HOUR), event_type: "photo", source: "manual" },
      ],
      sensorReadings: [
        buildReadingForSource("live"),
        buildReadingForSource("live", { metric: "humidity_pct", value: 55 }),
      ],
    });
    render(<AiDoctorContextReadinessPanel context={context} openAlertsCount={0} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    const headers = Array.from(panel.querySelectorAll("h2, h3")).map((h) =>
      (h.textContent ?? "").trim(),
    );
    expect(headers).toMatchInlineSnapshot(`
      [
        "AI Doctor Context Readiness",
        "Next evidence to add",
        "Sensor source labels",
        "Current reading quality",
        "Preview AI Doctor output",
        "Action Queue suggestion preview",
      ]
    `);
    expect(
      screen.queryByTestId("ai-doctor-context-readiness-panel-limitations"),
    ).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-context-readiness-panel-missing"),
    ).toBeNull();
    // Sensor source labels list still renders the live badge under mobile.
    const sources = screen.getByTestId(
      "ai-doctor-context-readiness-panel-sources",
    );
    expect(sources.querySelectorAll("li").length).toBeGreaterThan(0);
  });

  it("mobile snapshot is stable across an innerWidth change (no width-dependent DOM branches)", () => {
    const context = buildReadinessContext({ plant: { stage: null } });
    const { rerender } = render(
      <AiDoctorContextReadinessPanel context={context} />,
    );
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    const before = Array.from(panel.querySelectorAll("h2, h3")).map((h) =>
      (h.textContent ?? "").trim(),
    );

    // Flip to a wider viewport mid-test; the panel's DOM contract must not
    // change in JSDOM. (Tailwind responsive utilities are CSS-only.)
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
    window.dispatchEvent(new Event("resize"));
    rerender(<AiDoctorContextReadinessPanel context={context} />);
    const after = Array.from(
      screen
        .getByTestId("ai-doctor-context-readiness-panel")
        .querySelectorAll("h2, h3"),
    ).map((h) => (h.textContent ?? "").trim());

    expect(after).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
