/**
 * AI Doctor Readiness UI v1.7 — read-only hardening pass.
 *
 * Scope:
 *  1. Disabled quick-action explanations are specific, non-empty, calm,
 *     and contain no certainty/automation/device-control wording.
 *  2. Section/header + source-badge ordering is deterministic when
 *     evidence is partial, invalid, or missing.
 *  3. Keyboard focus order across enabled quick actions is deterministic
 *     and disabled actions do not fire navigation on click / Enter / Space
 *     / Escape.
 *
 * Hard constraints (V0):
 *  - No Supabase reads/writes, no fetch, no functions.invoke, no model
 *    calls, no Action Queue writes, no device control, no localStorage
 *    mutation. Render-time mocks throw on supabase / fetch /
 *    functions.invoke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import AiDoctorContextQuickActions from "@/components/AiDoctorContextQuickActions";
import { buildAiDoctorContextQuickActions } from "@/lib/aiDoctorContextQuickActionsViewModel";
import {
  buildReadingForSource,
  buildReadinessContext,
  readinessFixtureAgo,
  READINESS_FIXTURE_HOUR_MS,
} from "@/test/utils/aiDoctorReadinessFixtures";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in v1.7 test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in v1.7 test");
      },
    },
  },
}));

const fetchSpy = vi
  .spyOn(globalThis, "fetch" as never)
  .mockImplementation((() => {
    throw new Error("fetch not allowed in v1.7 test");
  }) as never);

const storageSetSpy = vi.spyOn(Storage.prototype, "setItem");

beforeEach(() => {
  fetchSpy.mockClear();
  storageSetSpy.mockClear();
});

const HOUR = READINESS_FIXTURE_HOUR_MS;
const ago = readinessFixtureAgo;

/**
 * Words and phrases that must NEVER appear in disabled-action explanatory
 * copy. These imply certainty, automation, or device control — all
 * forbidden by V0 safety rules.
 */
const BANNED_DISABLED_COPY = [
  "auto-execute",
  "automatically",
  "we will",
  "we'll run",
  "guaranteed",
  "certain",
  "definitely",
  "turn on",
  "turn off",
  "set fan",
  "set the fan",
  "open valve",
  "close valve",
  "execute",
  "device control",
];

function assertCalm(text: string, label: string): void {
  const lc = text.toLowerCase();
  for (const banned of BANNED_DISABLED_COPY) {
    expect(
      lc.includes(banned),
      `${label} must not contain "${banned}" — got: ${text}`,
    ).toBe(false);
  }
}

function headersInPanel(): string[] {
  const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
  return Array.from(panel.querySelectorAll("h2, h3")).map(
    (h) => (h.textContent ?? "").trim(),
  );
}

function sourceBadgesInPanel(): string[] {
  const list = screen.queryByTestId(
    "ai-doctor-context-readiness-panel-sources",
  );
  if (!list) return [];
  return Array.from(list.querySelectorAll("li")).map(
    (li) =>
      `${li.getAttribute("data-source")}|${li.getAttribute(
        "data-trustworthy",
      )}`,
  );
}

// ---------------------------------------------------------------------------
// 1. Disabled quick-action explanations
// ---------------------------------------------------------------------------

describe("v1.7 — disabled quick-action explanations", () => {
  it("readiness panel disabled buttons expose a specific, non-empty title and aria-disabled", () => {
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext()}
        openAlertsCount={0}
        // No quickActions wired → all buttons render disabled.
      />,
    );
    const buttons = Array.from(
      screen
        .getByTestId("ai-doctor-context-readiness-panel-quick-actions")
        .querySelectorAll("button"),
    ) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute("aria-disabled")).toBe("true");
      const title = btn.getAttribute("title") ?? "";
      expect(title.trim().length).toBeGreaterThan(8);
      assertCalm(title, `panel disabled title for ${btn.dataset.quickAction}`);
      // Visible label is also non-empty.
      expect((btn.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("readiness panel disabled click/Enter/Space do not invoke a handler or navigate", async () => {
    const user = userEvent.setup();
    const calls = vi.fn();
    // Wire NO handlers — all buttons are disabled. We spy on document-level
    // clicks/keydown to prove no synthetic activation reaches the page.
    document.addEventListener("click", calls);
    document.addEventListener("submit", calls);
    try {
      render(
        <AiDoctorContextReadinessPanel
          context={buildReadinessContext()}
          openAlertsCount={0}
        />,
      );
      const btn = screen.getByTestId(
        "ai-doctor-context-readiness-panel-quick-action-fast-add-photo",
      ) as HTMLButtonElement;
      const before = calls.mock.calls.length;
      await user.click(btn);
      btn.focus();
      await user.keyboard("{Enter}");
      await user.keyboard(" ");
      await user.keyboard("{Escape}");
      // Disabled buttons don't dispatch click events in browsers/jsdom.
      expect(calls.mock.calls.length).toBe(before);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(storageSetSpy).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("click", calls);
      document.removeEventListener("submit", calls);
    }
  });

  it("AiDoctorContextQuickActions exposes a specific aria-label when plantId is missing", () => {
    const actions = buildAiDoctorContextQuickActions({
      missing: ["plant-photo", "recent-watering-or-feeding"],
      plantId: null,
      growId: null,
      tentId: null,
    });
    // Confirm at least one descriptor is disabled with a specific reason.
    const disabledDescriptors = actions.filter((a) => a.disabled);
    expect(disabledDescriptors.length).toBeGreaterThan(0);
    for (const d of disabledDescriptors) {
      expect((d.disabledReason ?? "").trim().length).toBeGreaterThan(8);
      assertCalm(d.disabledReason ?? "", `descriptor ${d.kind}`);
      // Reason must name what is missing — "plant context" / "plant" / "context".
      expect(/plant|context/i.test(d.disabledReason ?? "")).toBe(true);
    }

    render(
      <MemoryRouter>
        <AiDoctorContextQuickActions actions={actions} />
      </MemoryRouter>,
    );
    for (const d of disabledDescriptors) {
      const btn = screen.getByTestId(d.testId);
      const aria = btn.getAttribute("aria-label") ?? "";
      expect(aria).toContain("unavailable");
      expect(aria).toContain(d.disabledReason ?? "");
      assertCalm(aria, `aria-label for ${d.kind}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Section / header / source-badge ordering with partial / invalid context
// ---------------------------------------------------------------------------

describe("v1.7 — deterministic section/header ordering for partial context", () => {
  function renderWith(
    sensorReadings: ReadonlyArray<Record<string, unknown>>,
    growEvents: ReadonlyArray<Record<string, unknown>> = [],
  ): ReturnType<typeof render> {
    return render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext({ sensorReadings, growEvents })}
        openAlertsCount={0}
      />,
    );
  }


  const cases: Array<{
    name: string;
    sensors: ReadonlyArray<Record<string, unknown>>;
    grow?: ReadonlyArray<Record<string, unknown>>;
  }> = [
    {
      name: "live + manual only",
      sensors: [
        buildReadingForSource("live"),
        buildReadingForSource("manual"),
      ],
    },
    {
      name: "invalid/stale only",
      sensors: [
        buildReadingForSource("invalid"),
        buildReadingForSource("stale"),
      ],
    },
    {
      name: "demo only",
      sensors: [buildReadingForSource("demo")],
    },
    {
      name: "logs only, no sensors",
      sensors: [],
      grow: [
        { occurred_at: ago(HOUR), event_type: "watering", source: "manual" },
        { occurred_at: ago(HOUR), event_type: "feeding", source: "manual" },
      ],
    },
    {
      name: "photos only",
      sensors: [],
      grow: [
        { occurred_at: ago(HOUR), event_type: "photo", source: "manual" },
      ],
    },
    {
      name: "sensors only, no diary/logs",
      sensors: [buildReadingForSource("live")],
    },
  ];

  for (const c of cases) {
    it(`renders deterministic headers + badges (${c.name})`, () => {
      const view1 = renderWith(c.sensors, c.grow ?? []);
      const headersA = headersInPanel();
      const badgesA = sourceBadgesInPanel();
      expect(headersA[0]).toBe("AI Doctor Context Readiness");
      // Re-render and confirm identical structural output.
      view1.unmount();
      renderWith(c.sensors, c.grow ?? []);

      expect(headersInPanel()).toEqual(headersA);
      expect(sourceBadgesInPanel()).toEqual(badgesA);

      // Any non-trusted source must render as data-trustworthy="false".
      for (const b of sourceBadgesInPanel()) {
        const [src, trust] = b.split("|");
        if (src === "live" || src === "manual") {
          expect(trust).toBe("true");
        } else if (src) {
          expect(trust).toBe("false");
        }
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it("invalid/stale/demo never present as live or trusted", () => {
    renderWith([
      buildReadingForSource("invalid"),
      buildReadingForSource("stale"),
      buildReadingForSource("demo"),
    ]);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    const sourceList = panel.querySelector(
      '[data-testid="ai-doctor-context-readiness-panel-sources"]',
    );
    expect(sourceList).toBeTruthy();
    const trustVals = Array.from(
      sourceList!.querySelectorAll("li"),
    ).map((li) => li.getAttribute("data-trustworthy"));
    expect(trustVals.every((v) => v === "false")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Keyboard focus / tab order regressions
// ---------------------------------------------------------------------------

describe("v1.7 — keyboard focus + interaction regressions", () => {
  it("tab order reaches enabled quick-action buttons in deterministic order; disabled buttons are skipped", async () => {
    const user = userEvent.setup();
    const onFastAddPhoto = vi.fn();
    const onAddWatering = vi.fn();
    const onAddFeeding = vi.fn();
    // Intentionally do NOT wire onAddSensorSnapshot → it renders disabled.
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext()}
        openAlertsCount={0}
        quickActions={{ onFastAddPhoto, onAddWatering, onAddFeeding }}
      />,
    );
    const row = screen.getByTestId(
      "ai-doctor-context-readiness-panel-quick-actions",
    );
    const buttons = Array.from(
      row.querySelectorAll("button"),
    ) as HTMLButtonElement[];
    const enabledIds = buttons
      .filter((b) => !b.disabled)
      .map((b) => b.dataset.quickAction ?? "");
    expect(enabledIds).toEqual([
      "fast-add-photo",
      "add-watering",
      "add-feeding",
    ]);
    // Every interactive control has a non-empty accessible name.
    for (const b of buttons) {
      const name =
        (b.textContent ?? "").trim() || (b.getAttribute("aria-label") ?? "");
      expect(name.length).toBeGreaterThan(0);
    }
    // Tab through the document and capture focus stops landing on our buttons.
    const focused: string[] = [];
    for (let i = 0; i < 20 && focused.length < enabledIds.length; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement | null;
      const id = el?.dataset?.quickAction;
      if (id && enabledIds.includes(id) && !focused.includes(id)) {
        focused.push(id);
      }
    }
    expect(focused).toEqual(enabledIds);
  });

  it("Enter / Space on focused enabled button fires exactly one handler", async () => {
    const user = userEvent.setup();
    const onAddWatering = vi.fn();
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext()}
        openAlertsCount={0}
        quickActions={{ onAddWatering }}
      />,
    );
    const btn = screen.getByTestId(
      "ai-doctor-context-readiness-panel-quick-action-add-watering",
    ) as HTMLButtonElement;
    btn.focus();
    expect(document.activeElement).toBe(btn);
    await user.keyboard("{Enter}");
    expect(onAddWatering).toHaveBeenCalledTimes(1);
    onAddWatering.mockClear();
    await user.keyboard(" ");
    expect(onAddWatering).toHaveBeenCalledTimes(1);
  });

  it("Enter/Space with focus elsewhere does not trigger quick-action handlers; Escape never does", async () => {
    const user = userEvent.setup();
    const onAddWatering = vi.fn();
    const onFastAddPhoto = vi.fn();
    render(
      <div>
        <input data-testid="sink" aria-label="unrelated" />
        <AiDoctorContextReadinessPanel
          context={buildReadinessContext()}
          openAlertsCount={0}
          quickActions={{ onAddWatering, onFastAddPhoto }}
        />
      </div>,
    );
    const sink = screen.getByTestId("sink") as HTMLInputElement;
    sink.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onAddWatering).not.toHaveBeenCalled();
    expect(onFastAddPhoto).not.toHaveBeenCalled();
    // Focus a real button, then Escape — must not navigate.
    const btn = screen.getByTestId(
      "ai-doctor-context-readiness-panel-quick-action-add-watering",
    ) as HTMLButtonElement;
    btn.focus();
    await user.keyboard("{Escape}");
    expect(onAddWatering).not.toHaveBeenCalled();
    expect(onFastAddPhoto).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fireEvent click on disabled quick-action button does not invoke handler", () => {
    const onFastAddPhoto = vi.fn();
    render(
      <AiDoctorContextReadinessPanel
        context={buildReadinessContext()}
        openAlertsCount={0}
        // Only wire watering — fast-add-photo stays disabled.
        quickActions={{ onAddWatering: () => {} }}
      />,
    );
    const btn = screen.getByTestId(
      "ai-doctor-context-readiness-panel-quick-action-fast-add-photo",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onFastAddPhoto).not.toHaveBeenCalled();
  });
});
