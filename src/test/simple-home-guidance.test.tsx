/**
 * SimpleHomeGuidance — the one tip card and What next? (Simple View Phase 3).
 *
 * The card offers its action, Not now and Remind me later; acting replaces it
 * with an announced status for the rest of the visit (no second tip pops up),
 * the third Not now says the tip is retired, a failed save says so, and focus
 * moves to What next?. What next? lists every step on demand.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import SimpleHomeGuidance from "@/components/SimpleHomeGuidance";
import { buildWhatNextSteps, GUIDANCE_COPY } from "@/lib/simpleHomeGuidanceRules";

const GROW = "11111111-1111-4111-8111-111111111111";
const steps = buildWhatNextSteps({
  growId: GROW,
  plants: [{ name: "Blue", href: "/plants/p1", quickLogTargetKey: "plant:p1" }],
  observationTimes: [],
  now: new Date("2026-10-29T12:00:00.000Z"),
});
const firstObservation = steps[0];

afterEach(cleanup);

function renderGuidance(props: Partial<Parameters<typeof SimpleHomeGuidance>[0]> = {}) {
  const onAct = vi.fn(async () => true);
  const onQuickLog = vi.fn();
  render(
    <MemoryRouter>
      <SimpleHomeGuidance
        steps={steps}
        cardStep={firstObservation}
        cardDismissCount={0}
        onAct={onAct}
        onQuickLog={onQuickLog}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onAct, onQuickLog };
}

describe("SimpleHomeGuidance", () => {
  it("renders the card with its action, Not now and Remind me later", () => {
    const { onQuickLog } = renderGuidance();
    const card = screen.getByTestId("simple-home-tip");
    expect(card).toHaveAttribute("data-step-id", "first-observation");
    expect(screen.getByRole("region", { name: firstObservation.title })).toBe(card);
    fireEvent.click(screen.getByRole("button", { name: firstObservation.actionLabel }));
    expect(onQuickLog).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: GUIDANCE_COPY.notNow })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: GUIDANCE_COPY.remindLater })).toBeInTheDocument();
  });

  it("no card step renders no card, but What next? is still there", () => {
    renderGuidance({ cardStep: null });
    expect(screen.queryByTestId("simple-home-tip")).toBeNull();
    expect(screen.getByTestId("simple-home-what-next")).toBeInTheDocument();
  });

  it("Not now writes a dismiss, announces it, removes the card and focuses What next?", async () => {
    const { onAct } = renderGuidance();
    fireEvent.click(screen.getByTestId("simple-home-tip-dismiss"));
    await waitFor(() =>
      expect(screen.getByTestId("simple-home-tip-status")).toHaveTextContent(
        GUIDANCE_COPY.hiddenForNow,
      ),
    );
    expect(onAct).toHaveBeenCalledWith("first-observation", "dismiss");
    expect(screen.queryByTestId("simple-home-tip")).toBeNull();
    expect(screen.getByTestId("simple-home-what-next")).toHaveFocus();
    expect(screen.getByTestId("simple-home-tip-status")).toHaveAttribute("aria-live", "polite");
  });

  it("the third Not now says the tip won't come back", async () => {
    renderGuidance({ cardDismissCount: 2 });
    fireEvent.click(screen.getByTestId("simple-home-tip-dismiss"));
    await waitFor(() =>
      expect(screen.getByTestId("simple-home-tip-status")).toHaveTextContent(GUIDANCE_COPY.retired),
    );
  });

  it("Remind me later snoozes; a failed save says it may come back", async () => {
    const { onAct } = renderGuidance();
    fireEvent.click(screen.getByTestId("simple-home-tip-snooze"));
    await waitFor(() =>
      expect(screen.getByTestId("simple-home-tip-status")).toHaveTextContent(GUIDANCE_COPY.snoozed),
    );
    expect(onAct).toHaveBeenCalledWith("first-observation", "snooze");

    cleanup();
    renderGuidance({ onAct: vi.fn(async () => false) });
    fireEvent.click(screen.getByTestId("simple-home-tip-dismiss"));
    await waitFor(() =>
      expect(screen.getByTestId("simple-home-tip-status")).toHaveTextContent(
        GUIDANCE_COPY.saveFailed,
      ),
    );
  });

  it("What next? toggles a list of every step", () => {
    renderGuidance();
    const button = screen.getByTestId("simple-home-what-next");
    const panel = screen.getByTestId("simple-home-what-next-panel");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", panel.id);
    expect(panel).not.toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
    expect(
      screen.getAllByTestId("simple-home-what-next-step").map((el) => el.dataset.stepId),
    ).toEqual(steps.map((s) => s.id));
  });

  it("What next? with nothing to suggest says so", () => {
    renderGuidance({ steps: [], cardStep: null });
    fireEvent.click(screen.getByTestId("simple-home-what-next"));
    expect(screen.getByText(GUIDANCE_COPY.whatNextEmpty)).toBeVisible();
  });
});
