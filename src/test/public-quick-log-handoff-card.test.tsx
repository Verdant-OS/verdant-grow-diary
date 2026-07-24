/**
 * PublicQuickLogHandoffCard — authenticated resume surface for the public
 * starter draft. Render coverage + zero-write guarantees + a11y + static
 * safety fences.
 *
 * The card must NEVER write anywhere: rendering, "Review and save", and
 * "Not now" all leave the on-device draft untouched; only an explicitly
 * CONFIRMED "Discard draft" clears it (locally). The only outbound signal
 * is the established in-memory `verdant:open-quicklog` prefill event.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { axe } from "vitest-axe";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const usePlantsMock = vi.fn();
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => usePlantsMock(),
}));

const useTentsMock = vi.fn();
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => useTentsMock(),
}));

import PublicQuickLogHandoffCard from "@/components/PublicQuickLogHandoffCard";
import {
  PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
  serializePublicQuickLogStarterDraft,
  type PublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterRules";
import { PUBLIC_QUICK_LOG_HANDOFF_DRAFT_STATUS_LINE } from "@/lib/publicQuickLogHandoffViewModel";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

// The dispatch-time revalidation inside the card reads the REAL clock,
// so all freshness-sensitive fixtures are derived from it — fixed dates
// would rot into the lapsed branch as wall time passes.
const NOW = new Date();
const HOURS = 3_600_000;
const FRESH_UPDATED_AT = new Date(NOW.getTime() - 2 * HOURS).toISOString();
const STALE_UPDATED_AT = new Date(NOW.getTime() - 25 * HOURS).toISOString();
const NOT_NOW_KEY = "verdant.quickLogHandoff.notNow.v1";

const ROOT = resolve(__dirname, "../..");
const NEW_SURFACE_FILES = [
  "src/lib/publicQuickLogHandoffRules.ts",
  "src/lib/publicQuickLogHandoffViewModel.ts",
  "src/components/PublicQuickLogHandoffCard.tsx",
];

function draft(overrides: Partial<PublicQuickLogStarterDraft> = {}): PublicQuickLogStarterDraft {
  return {
    v: 1,
    id: "draft-1",
    createdAt: FRESH_UPDATED_AT,
    updatedAt: FRESH_UPDATED_AT,
    plantNickname: "Blue Dream #1",
    stage: "veg",
    logType: "observation",
    note: "First true leaves look healthy.",
    wateringVolumeMl: null,
    attribution: { utm_source: "organic_guide" },
    ...overrides,
  };
}

function seedDraft(d: PublicQuickLogStarterDraft = draft()) {
  setLocalStorageItemForTest(
    PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
    serializePublicQuickLogStarterDraft(d),
  );
}

function storedDraftRaw(): string | null {
  return getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY);
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderCard(props: { now?: Date } = {}) {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <PublicQuickLogHandoffCard now={props.now ?? NOW} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const PLANT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Blue Dream #1",
  tent_id: "t1",
  grow_id: "g1",
  is_archived: false,
  last_note: null,
};

describe("<PublicQuickLogHandoffCard />", () => {
  beforeEach(() => {
    clearLocalStorageForTest();
    usePlantsMock.mockReset();
    usePlantsMock.mockReturnValue({ data: [PLANT] });
    useTentsMock.mockReset();
    useTentsMock.mockReturnValue({ data: [] });
  });

  it("renders nothing when no draft exists", () => {
    const { container } = renderCard();
    expect(screen.queryByTestId("public-quick-log-handoff-card")).toBeNull();
    expect(container.querySelector("section")).toBeNull();
  });

  it("renders nothing for a stale draft and retains it in storage", () => {
    seedDraft(draft({ updatedAt: STALE_UPDATED_AT }));
    renderCard();
    expect(screen.queryByTestId("public-quick-log-handoff-card")).toBeNull();
    expect(storedDraftRaw()).not.toBeNull();
  });

  it("renders nothing for malformed storage content without crashing", () => {
    setLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY, "{corrupt");
    renderCard();
    expect(screen.queryByTestId("public-quick-log-handoff-card")).toBeNull();
  });

  it("shows the drafted values, the honest draft-status line, and the match hint", () => {
    seedDraft();
    renderCard();
    const card = screen.getByTestId("public-quick-log-handoff-card");
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId("public-quick-log-handoff-status-line").textContent).toBe(
      PUBLIC_QUICK_LOG_HANDOFF_DRAFT_STATUS_LINE,
    );
    expect(screen.getByTestId("public-quick-log-handoff-row-plant").textContent).toContain(
      "Blue Dream #1",
    );
    expect(screen.getByTestId("public-quick-log-handoff-row-type").textContent).toContain("Note");
    expect(screen.getByTestId("public-quick-log-handoff-row-note").textContent).toContain(
      "First true leaves look healthy.",
    );
    expect(screen.getByTestId("public-quick-log-handoff-match-hint").textContent).toMatch(
      /matched your plant/i,
    );
    // Never a fake success: no diary/saved language anywhere on the card.
    expect(card.textContent).not.toMatch(/saved|in your diary now|logged/i);
  });

  it("watering drafts show the amount row", () => {
    seedDraft(draft({ logType: "watering", note: "", wateringVolumeMl: 500 }));
    renderCard();
    expect(screen.getByTestId("public-quick-log-handoff-row-volume").textContent).toContain(
      "500 ml",
    );
  });

  it("rendering + remounting performs zero writes and leaves the draft byte-identical", () => {
    seedDraft();
    const before = storedDraftRaw();
    const first = renderCard();
    first.unmount();
    renderCard();
    expect(screen.getByTestId("public-quick-log-handoff-card")).toBeInTheDocument();
    expect(storedDraftRaw()).toBe(before);
  });

  it("does not steal focus on mount", () => {
    seedDraft();
    renderCard();
    const card = screen.getByTestId("public-quick-log-handoff-card");
    expect(card.contains(document.activeElement)).toBe(false);
  });

  it("'Review and save' dispatches ONE in-memory prefill event, retains the draft, and keeps grower content out of the URL", () => {
    seedDraft();
    const before = storedDraftRaw();
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    renderCard();
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-review-save"));
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);

    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({
      plantId: PLANT.id,
      plantName: "Blue Dream #1",
      growId: "g1",
      tentId: "t1",
      eventType: "observation",
      note: "First true leaves look healthy.",
      wateringVolumeMl: null,
      suggestSnapshot: false,
      source: "public-starter",
      publicStarterDraftId: "draft-1",
      publicStarterDraftUpdatedAt: FRESH_UPDATED_AT,
      suppressPlantDefault: false,
    });
    // Draft untouched: display/handoff never consumes it.
    expect(storedDraftRaw()).toBe(before);
    // Stay inside the current AppShell so its listener receives the event.
    // The nickname/note never travel through a URL.
    expect(screen.getByTestId("location-probe").textContent).toBe("/onboarding");
  });

  it("'Not now' retains the draft, performs zero writes to it, and hides only this draft", () => {
    seedDraft();
    const before = storedDraftRaw();
    renderCard();
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-not-now"));
    expect(screen.queryByTestId("public-quick-log-handoff-card")).toBeNull();
    expect(storedDraftRaw()).toBe(before);
    expect(getLocalStorageItemForTest(NOT_NOW_KEY)).toBe("draft-1");
  });

  it("a NEW draft id shows the card again after an earlier 'Not now'", () => {
    setLocalStorageItemForTest(NOT_NOW_KEY, "draft-0");
    seedDraft();
    renderCard();
    expect(screen.getByTestId("public-quick-log-handoff-card")).toBeInTheDocument();
  });

  it("'Discard draft' asks first; cancel keeps the draft", () => {
    seedDraft();
    const before = storedDraftRaw();
    renderCard();
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-discard"));
    expect(screen.getByTestId("public-quick-log-handoff-discard-question")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-discard-cancel"));
    expect(storedDraftRaw()).toBe(before);
    expect(screen.getByTestId("public-quick-log-handoff-review-save")).toBeInTheDocument();
  });

  it("'Discard draft' clears locally ONLY after explicit confirmation", () => {
    seedDraft();
    renderCard();
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-discard"));
    expect(storedDraftRaw()).not.toBeNull();
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-discard-confirm"));
    expect(storedDraftRaw()).toBeNull();
    expect(screen.queryByTestId("public-quick-log-handoff-card")).toBeNull();
  });

  it("zero eligible plants → setup link to the existing flow, draft retained, no review button", () => {
    usePlantsMock.mockReturnValue({ data: [] });
    seedDraft();
    renderCard();
    const setup = screen.getByTestId("public-quick-log-handoff-setup-link");
    expect(setup.getAttribute("href")).toBe("/grows");
    expect(screen.queryByTestId("public-quick-log-handoff-review-save")).toBeNull();
    expect(screen.getByTestId("public-quick-log-handoff-match-hint").textContent).toMatch(
      /draft stays on this device/i,
    );
    expect(storedDraftRaw()).not.toBeNull();
  });

  it("ambiguous plants → no preselection; the grower chooses during review", () => {
    usePlantsMock.mockReturnValue({
      data: [PLANT, { ...PLANT, id: "22222222-2222-4222-8222-222222222222" }],
    });
    seedDraft();
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    renderCard();
    expect(screen.getByTestId("public-quick-log-handoff-match-hint").textContent).toMatch(
      /pick which one/i,
    );
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-review-save"));
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    expect(events[0].detail.plantId).toBeNull();
    expect(events[0].detail.plantName).toBeNull();
    expect(events[0].detail.suppressPlantDefault).toBe(true);
  });

  it("feeding drafts state the 'Coming soon' caveat up front", () => {
    seedDraft(draft({ logType: "feeding", note: "Fed 2ml/L grow nutes" }));
    renderCard();
    expect(screen.getByTestId("public-quick-log-handoff-type-caveat").textContent).toMatch(
      /not saveable from Quick Log yet/i,
    );
  });

  it("while the plant inventory loads, never claims 'no plants' and never offers setup", () => {
    usePlantsMock.mockReturnValue({ data: undefined, isLoading: true });
    seedDraft();
    renderCard();
    const checking = screen.getByTestId("public-quick-log-handoff-checking");
    expect(checking).toBeDisabled();
    expect(screen.queryByTestId("public-quick-log-handoff-setup-link")).toBeNull();
    expect(screen.queryByTestId("public-quick-log-handoff-review-save")).toBeNull();
    expect(screen.getByTestId("public-quick-log-handoff-match-hint").textContent).toMatch(
      /checking your plants/i,
    );
  });

  it("a failed inventory read still allows review (no suggestion, defaults suppressed) — never the setup CTA", () => {
    usePlantsMock.mockReturnValue({ data: undefined, isError: true });
    seedDraft();
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    renderCard();
    expect(screen.queryByTestId("public-quick-log-handoff-setup-link")).toBeNull();
    expect(screen.getByTestId("public-quick-log-handoff-match-hint").textContent).toMatch(
      /couldn't check your plants/i,
    );
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-review-save"));
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    expect(events).toHaveLength(1);
    expect(events[0].detail.plantId).toBeNull();
    expect(events[0].detail.suppressPlantDefault).toBe(true);
  });

  it("moves focus into the discard confirmation (safe action) and back on cancel", () => {
    seedDraft();
    renderCard();
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-discard"));
    expect(document.activeElement).toBe(
      screen.getByTestId("public-quick-log-handoff-discard-cancel"),
    );
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-discard-cancel"));
    expect(document.activeElement).toBe(screen.getByTestId("public-quick-log-handoff-discard"));
  });

  it("re-validates at dispatch time: a draft past the 24h cap while mounted is never dispatched", () => {
    // The `now` prop keeps the RENDER-time freshness check happy, but the
    // draft is >24h old against the real clock the dispatch guard uses —
    // simulating a card left mounted across the expiry boundary.
    seedDraft(draft({ updatedAt: STALE_UPDATED_AT }));
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    renderCard({ now: new Date(new Date(STALE_UPDATED_AT).getTime() + 1 * HOURS) });
    expect(screen.getByTestId("public-quick-log-handoff-card")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-review-save"));
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    expect(events).toHaveLength(0);
    // The card hides itself and the draft is RETAINED (stale ≠ discarded).
    expect(screen.queryByTestId("public-quick-log-handoff-card")).toBeNull();
    expect(storedDraftRaw()).not.toBeNull();
  });

  it("has no automated axe accessibility violations", async () => {
    seedDraft();
    renderCard();
    const card = screen.getByTestId("public-quick-log-handoff-card");
    // jsdom performs no layout, so color-contrast cannot be evaluated.
    const results = await axe(card, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("discard confirmation state is also axe-clean", async () => {
    seedDraft();
    renderCard();
    fireEvent.click(screen.getByTestId("public-quick-log-handoff-discard"));
    const card = screen.getByTestId("public-quick-log-handoff-card");
    const results = await axe(card, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

describe("static safety fences — the handoff surface cannot write, automate, or call AI", () => {
  const FORBIDDEN = [
    /from\s+["']@\/integrations\/supabase/i,
    /from\s+["']@supabase\//i,
    /\.insert\s*\(/,
    /\.upsert\s*\(/,
    /\.rpc\s*\(/,
    /functions\.invoke/i,
    /\bfetch\s*\(/,
    /XMLHttpRequest|WebSocket|EventSource/,
    /action[_-]?queue/i,
    /openai|anthropic|aiClient|modelClient|ai-gateway/i,
    /\bauto[-\s]?(execute|run|control)\b/i,
    /control (fan|light|pump|heater|humidifier|dehumidifier)/i,
  ];
  it("new handoff files contain no forbidden write/automation/AI patterns", () => {
    for (const rel of NEW_SURFACE_FILES) {
      const src = readFileSync(resolve(ROOT, rel), "utf8");
      for (const pat of FORBIDDEN) {
        expect(pat.test(src), `${rel} matched ${pat}`).toBe(false);
      }
    }
  });

  it("mount sites are wired (Onboarding + Dashboard) without new routes", () => {
    const onboarding = readFileSync(resolve(ROOT, "src/pages/Onboarding.tsx"), "utf8");
    const dashboard = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
    expect(onboarding).toContain("<PublicQuickLogHandoffCard");
    expect(dashboard).toContain("<PublicQuickLogHandoffCard");
  });
});
