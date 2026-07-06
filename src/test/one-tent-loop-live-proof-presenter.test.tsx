/**
 * OneTentLoopLiveProof presenter tests.
 *
 * Mocks all data hooks to return empty; verifies:
 *  - Renders all 10 loop step cards
 *  - Renders banner and safety summary
 *  - Renders missing/blocked flags without "healthy" language
 *  - Contains zero write controls (button/form/input/select/textarea)
 *  - Renders approval-required + no-device-command copy for Action Queue
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: null,
    activeGrowId: null,
    grows: [],
    setActiveGrowId: () => {},
    refresh: async () => {},
    loading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: [] }) }));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: [] }) }));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => ({ data: [] }) }));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({
    status: "ok",
    snapshot: {
      source: "unavailable",
      ts: null,
      temp: null,
      rh: null,
      vpd: null,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
    },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ status: "ok", alerts: [], error: null, reload: () => {} }),
}));
vi.mock("@/hooks/use-ai-doctor-sessions", () => ({
  useAiDoctorSessions: () => ({ data: [] }),
}));
vi.mock("@/hooks/usePlantAssignedTentActions", () => ({
  usePlantAssignedTentActions: () => ({ rows: [], isLoading: false, isError: false, error: null }),
}));

import OneTentLoopLiveProof from "@/pages/OneTentLoopLiveProof";
import { LOOP_STEP_IDS } from "@/lib/oneTentLoopProofRules";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/one-tent-loop-proof"]}>
      <Routes>
        <Route path="/one-tent-loop-proof" element={<OneTentLoopLiveProof />} />
      </Routes>
    </MemoryRouter>,
  );
}

const FORBIDDEN_HEALTH_COPY = [
  " healthy ",
  " ok ",
  " normal ",
  " verified ",
  " success",
  " all good",
  " no issues detected",
];

describe("OneTentLoopLiveProof page", () => {
  it("renders at /one-tent-loop-proof", () => {
    renderPage();
    expect(screen.getByTestId("one-tent-loop-live-proof-page")).toBeTruthy();
  });

  it("renders the read-only proof banner", () => {
    renderPage();
    const banner = screen.getByTestId("one-tent-loop-live-proof-banner");
    expect((banner.textContent ?? "").toLowerCase()).toMatch(/read-only proof view/);
    expect((banner.textContent ?? "").toLowerCase()).toMatch(
      /does not create logs, alerts, actions, ai results, or device commands/,
    );
  });

  it("renders all 10 loop step cards", () => {
    renderPage();
    expect(LOOP_STEP_IDS.length).toBe(10);
    for (const id of LOOP_STEP_IDS) {
      expect(screen.getByTestId(`loop-live-proof-step-${id}`)).toBeTruthy();
    }
  });

  it("renders missing/blocked flags without healthy language", () => {
    const { container } = renderPage();
    const text = " " + (container.textContent ?? "").toLowerCase() + " ";
    for (const forbidden of FORBIDDEN_HEALTH_COPY) {
      expect(text.includes(forbidden)).toBe(false);
    }
    expect(text).toMatch(/missing evidence/);
    expect(text).toMatch(/blocked/);
  });

  it("renders approval-required + no-device-command copy for Action Queue", () => {
    renderPage();
    const card = screen.getByTestId("loop-live-proof-step-action-queue");
    const t = (card.textContent ?? "").toLowerCase();
    expect(t).toMatch(/approval required/);
    expect(t).toMatch(/no device command/);
  });

  it("renders zero write controls (button/form/input/select/textarea)", () => {
    renderPage();
    expect(document.querySelectorAll("button").length).toBe(0);
    expect(document.querySelectorAll("form").length).toBe(0);
    expect(document.querySelectorAll("input").length).toBe(0);
    expect(document.querySelectorAll("select").length).toBe(0);
    expect(document.querySelectorAll("textarea").length).toBe(0);
  });

  it("renders the safety summary", () => {
    renderPage();
    const s = screen.getByTestId("one-tent-loop-live-proof-safety-summary");
    const t = (s.textContent ?? "").toLowerCase();
    expect(t).toMatch(/never shown as healthy/);
    expect(t).toMatch(/approval-required/);
    expect(t).toMatch(/no device command/);
  });

  it("renders the copyable text report block", () => {
    renderPage();
    const pre = screen.getByTestId("one-tent-loop-live-proof-report-text");
    expect((pre.textContent ?? "").toLowerCase()).toMatch(/one-tent loop/);
  });
});

/**
 * TopGapPanel ↔ report parity + never-healthy DOM regression.
 *
 * This is the DETERMINISTIC browser-DOM layer for the never-healthy contract.
 * The Playwright spec's rich proof-branch assertions only run when
 * /one-tent-loop-proof renders authenticated; unauthenticated (and CI-mocked)
 * loads redirect to /auth, so those assertions are effectively skipped there.
 * Here the real presenter renders in jsdom with mocked-empty hooks (no auth),
 * which resolves a top gap of "grow missing" whose entire evidence checklist is
 * unknown-equivalent (missing / blocked) — the exact rows this contract guards.
 */
describe("OneTentLoopLiveProof — TopGapPanel unknown/equivalent never-healthy DOM", () => {
  const UNKNOWN_EQUIVALENT_STATES = new Set([
    "missing",
    "weak",
    "stale",
    "invalid",
    "demo_only",
    "unknown",
    "blocked",
  ]);

  // Forbidden for unknown/equivalent checklist rows (scoped to those rows only,
  // NOT truly-`present` rows elsewhere). Honest negations are not banned.
  const FORBIDDEN_ROW_WORDS =
    /\bpresent\b|\bok\b|\bsuccess(ful)?\b|\bverified\b|\bhealthy\b|all good|no issues detected|confirmed safe|validated live|\bcheck(ed)?\b|\bcomplete(d)?\b|\bpassed\b|\bready\b/i;

  const FORBIDDEN_CLASS =
    /bg-green|text-green|border-green|ring-green|bg-success|text-success|success-tone|check-?mark|healthy-tone/i;

  function checklistItems(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-testid^="one-tent-loop-live-proof-top-gap-checklist-item-"][data-state]',
      ),
    );
  }

  it("renders a top-gap panel whose checklist is entirely unknown-equivalent (empty app state)", () => {
    const { container } = renderPage();
    const panel = screen.getByTestId("one-tent-loop-live-proof-top-gap");
    // The gap is real (not resolved): a status attribute is present and is not
    // a healthy/passed claim.
    const status = panel.getAttribute("data-status");
    expect(status).toBeTruthy();
    expect(status).not.toBe("resolved");
    expect(status).not.toBe("passed");

    const items = checklistItems(container);
    expect(items.length).toBeGreaterThan(0);
    // Empty app state → no checklist row may be `present`.
    for (const li of items) {
      expect(li.getAttribute("data-state")).not.toBe("present");
    }
  });

  it("unknown/equivalent checklist rows never render success/present/checkmark wording, classes, or aria", () => {
    const { container } = renderPage();
    const items = checklistItems(container);
    expect(items.length).toBeGreaterThan(0);

    for (const li of items) {
      const state = li.getAttribute("data-state") ?? "";
      if (!UNKNOWN_EQUIVALENT_STATES.has(state)) continue;

      // data-state itself is honest.
      expect(state).not.toBe("present");

      // The visible state badge must read an honest label, never "Present"/success.
      const badge = li.querySelector<HTMLElement>('[data-testid$="-state"]');
      const badgeText = (badge?.textContent ?? "").trim();
      expect(badgeText.length).toBeGreaterThan(0);
      expect(badgeText).not.toBe("Present");
      expect(FORBIDDEN_ROW_WORDS.test(badgeText)).toBe(false);

      // The whole row's visible text carries no success/checkmark wording.
      const rowText = li.textContent ?? "";
      expect(
        FORBIDDEN_ROW_WORDS.test(rowText),
        `row for state=${state} contained forbidden wording: "${rowText}"`,
      ).toBe(false);

      // No success/checkmark/green classes anywhere in the row markup.
      expect(FORBIDDEN_CLASS.test(li.outerHTML)).toBe(false);

      // No check/success/verified icon or aria hooks.
      for (const el of li.querySelectorAll<HTMLElement>("*")) {
        const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
        expect(/check|success|verified|complete|passed/.test(aria)).toBe(false);
        for (const attr of ["data-icon", "data-lucide"]) {
          const v = (el.getAttribute(attr) ?? "").toLowerCase();
          expect(/check|check-circle|success/.test(v)).toBe(false);
        }
      }
    }
  });

  it("rendered checklist order + states exactly match the sanitized report text block (req-1 parity)", () => {
    const { container } = renderPage();
    const items = checklistItems(container);
    expect(items.length).toBeGreaterThan(0);

    // DOM: ordered [{ label, state }] straight from the rendered panel.
    const dom = items.map((li) => ({
      label: (li.querySelector("span")?.textContent ?? "").trim(),
      state: li.getAttribute("data-state") ?? "",
    }));

    // Report: the checklist sub-block parsed out of the copyable <pre>.
    const reportText = screen.getByTestId("one-tent-loop-live-proof-report-text").textContent ?? "";
    const lines = reportText.split("\n");
    const ci = lines.indexOf("- Evidence checklist for this gap:");
    expect(ci, "report is missing the evidence checklist block").toBeGreaterThanOrEqual(0);
    const reportLines: string[] = [];
    for (let i = ci + 1; i < lines.length && lines[i].startsWith("    - "); i += 1) {
      reportLines.push(lines[i]);
    }

    // Same count (nothing dropped/added between panel and report).
    expect(reportLines.length).toBe(dom.length);

    // Same order + same label + same state, item by item.
    for (let i = 0; i < dom.length; i += 1) {
      expect(dom[i].label, `panel row ${i} missing label text`).not.toBe("");
      expect(dom[i].state, `panel row ${i} missing data-state`).not.toBe("");
      expect(
        reportLines[i].includes(dom[i].label),
        `panel row ${i} label "${dom[i].label}" not at report line ${i}: "${reportLines[i]}"`,
      ).toBe(true);
      expect(
        reportLines[i].includes(`[${dom[i].state}]`),
        `panel row ${i} state "[${dom[i].state}]" not at report line ${i}: "${reportLines[i]}"`,
      ).toBe(true);
    }
  });
});
