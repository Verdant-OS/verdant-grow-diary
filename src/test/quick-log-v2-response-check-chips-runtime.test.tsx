/**
 * D7 — Better/Same/Worse chips in the Quick Log V2 sheet, at runtime.
 *
 * The sibling `quick-log-v2-response-check-chips.test.ts` is a source scan; it
 * cannot tell a reachable chip from an unreachable one, a correct payload from
 * a wrong one, or a guard that fires from one that is merely written down.
 * This file renders the sheet and drives it.
 *
 * Scope: the DESKTOP opener. The mobile entry point lives in `AppShell` and is
 * owned by Tranche A slice A5 — see the PR body's scope note. Nothing here
 * claims mobile behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { RESPONSE_CHECK_STATUSES, applyResponseCheck } from "@/lib/tenSecondQuickCheckRules";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
      { id: "plant-2", name: "Plant 2", tent_id: "tent-1", grow_id: "grow-1" },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const NOTE_LIMIT = 500;

// Radix's Select relies on pointer-capture APIs jsdom does not implement.
const elementPrototype = Element.prototype as Element & {
  hasPointerCapture?: () => boolean;
  setPointerCapture?: () => void;
  releasePointerCapture?: () => void;
  scrollIntoView?: () => void;
};
elementPrototype.hasPointerCapture ??= () => false;
elementPrototype.setPointerCapture ??= () => {};
elementPrototype.releasePointerCapture ??= () => {};
elementPrototype.scrollIntoView ??= () => {};

function renderSheet(defaultTargetKey: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey={defaultTargetKey} />
    </QueryClientProvider>,
  );
}

function noteTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;
}
const chip = (status: string) => screen.getByTestId(`qlv2-response-chip-${status}`);

async function savedNote(): Promise<string | null> {
  await waitFor(() => expect(rpcMock).toHaveBeenCalled());
  const [fn, payload] = rpcMock.mock.calls[0] as [string, { p_note: string | null }];
  expect(fn).toBe("quicklog_save_manual");
  return payload.p_note;
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "ge-1" }, error: null });
});
afterEach(() => cleanup());

describe("D7 chips — target gating", () => {
  it("offers the chips on a plant-scoped draft", () => {
    renderSheet("plant:plant-1");
    expect(screen.getByTestId("qlv2-response-chips")).toBeInTheDocument();
    for (const status of ["better", "same", "worse"]) {
      expect(chip(status)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("withholds the chips on a tent-scoped draft", () => {
    renderSheet("tent:tent-1");
    // Positive control: the sheet rendered, it just has no plant to ask about.
    expect(noteTextarea()).toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-response-chips")).not.toBeInTheDocument();
  });
});

describe("D7 chips — selection and payload", () => {
  it("marks the chosen chip pressed and writes the exact response line", async () => {
    renderSheet("plant:plant-1");

    fireEvent.click(chip("better"));

    expect(chip("better")).toHaveAttribute("aria-pressed", "true");
    expect(chip("same")).toHaveAttribute("aria-pressed", "false");
    expect(chip("worse")).toHaveAttribute("aria-pressed", "false");
    expect(noteTextarea().value).toBe("Response check: Better.");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await savedNote()).toBe("Response check: Better.");
  });

  it("switching status replaces the line instead of stacking one", () => {
    renderSheet("plant:plant-1");

    fireEvent.click(chip("better"));
    fireEvent.click(chip("worse"));

    expect(noteTextarea().value).toBe("Response check: Worse.");
    expect(noteTextarea().value.match(/Response check:/g)).toHaveLength(1);
    expect(chip("better")).toHaveAttribute("aria-pressed", "false");
    expect(chip("worse")).toHaveAttribute("aria-pressed", "true");
  });

  it("preserves the grower's own prose alongside the response line", async () => {
    renderSheet("plant:plant-1");

    fireEvent.change(noteTextarea(), { target: { value: "Watered 1L, runoff clear." } });
    fireEvent.click(chip("same"));

    expect(noteTextarea().value).toContain("Response check: Same.");
    expect(noteTextarea().value).toContain("Watered 1L, runoff clear.");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const note = await savedNote();
    expect(note).toContain("Response check: Same.");
    expect(note).toContain("Watered 1L, runoff clear.");
  });
});

describe("D7 chips — note-length boundary", () => {
  it("refuses the chip rather than pushing the note past the save limit", () => {
    renderSheet("plant:plant-1");

    const long = "x".repeat(NOTE_LIMIT);
    fireEvent.change(noteTextarea(), { target: { value: long } });

    for (const status of ["better", "same", "worse"]) {
      expect(chip(status)).toBeDisabled();
    }
    expect(screen.getByTestId("qlv2-response-chips")).toHaveTextContent(
      "Your note is too long to add a response line. Shorten it first.",
    );

    // Belt and braces: even a forced click cannot exceed the limit.
    fireEvent.click(chip("better"));
    expect(noteTextarea().value).toBe(long);
    expect(noteTextarea().value.length).toBeLessThanOrEqual(NOTE_LIMIT);
  });

  it("disables only the statuses that would overflow, never the ones that fit", () => {
    // The three lines are different lengths ("Better." 7, "Same." 5,
    // "Worse." 6), so near the limit one status can overflow while the others
    // still fit. Find a note where they genuinely disagree — computed from the
    // shipped rule, not from a hardcoded guess that could drift.
    let split: string | null = null;
    for (let n = NOTE_LIMIT; n > NOTE_LIMIT - 40 && split === null; n -= 1) {
      const candidate = "x".repeat(n);
      const overflowing = RESPONSE_CHECK_STATUSES.filter(
        (status) => applyResponseCheck(candidate, status).length > NOTE_LIMIT,
      );
      if (overflowing.length > 0 && overflowing.length < RESPONSE_CHECK_STATUSES.length) {
        split = candidate;
      }
    }
    expect(split, "no note length makes the statuses disagree").not.toBeNull();

    renderSheet("plant:plant-1");
    fireEvent.change(noteTextarea(), { target: { value: split as string } });

    let anyEnabled = false;
    for (const status of RESPONSE_CHECK_STATUSES) {
      const wouldOverflow = applyResponseCheck(split as string, status).length > NOTE_LIMIT;
      const element = chip(status.toLowerCase());
      if (wouldOverflow) {
        expect(element, `${status} should be disabled`).toBeDisabled();
      } else {
        expect(element, `${status} should stay available`).toBeEnabled();
        anyEnabled = true;
      }
    }
    expect(anyEnabled).toBe(true);

    // And the "shorten it first" copy is reserved for when NOTHING fits.
    expect(screen.getByTestId("qlv2-response-chips")).not.toHaveTextContent(
      "Your note is too long to add a response line",
    );
  });

  it("lets a still-fitting status be chosen at that boundary", () => {
    let split: string | null = null;
    let fitting: string | null = null;
    for (let n = NOTE_LIMIT; n > NOTE_LIMIT - 40 && split === null; n -= 1) {
      const candidate = "x".repeat(n);
      const ok = RESPONSE_CHECK_STATUSES.filter(
        (status) => applyResponseCheck(candidate, status).length <= NOTE_LIMIT,
      );
      if (ok.length > 0 && ok.length < RESPONSE_CHECK_STATUSES.length) {
        split = candidate;
        fitting = ok[0];
      }
    }
    expect(split).not.toBeNull();

    renderSheet("plant:plant-1");
    fireEvent.change(noteTextarea(), { target: { value: split as string } });
    fireEvent.click(chip((fitting as string).toLowerCase()));

    expect(noteTextarea().value).toContain(`Response check: ${fitting}.`);
    expect(noteTextarea().value.length).toBeLessThanOrEqual(NOTE_LIMIT);
    expect(chip((fitting as string).toLowerCase())).toHaveAttribute("aria-pressed", "true");
  });

  it("re-enables the chips once the note is short enough again", () => {
    renderSheet("plant:plant-1");

    fireEvent.change(noteTextarea(), { target: { value: "x".repeat(NOTE_LIMIT) } });
    expect(chip("better")).toBeDisabled();

    fireEvent.change(noteTextarea(), { target: { value: "short" } });
    expect(chip("better")).toBeEnabled();

    fireEvent.click(chip("better"));
    expect(noteTextarea().value).toContain("Response check: Better.");
    expect(noteTextarea().value.length).toBeLessThanOrEqual(NOTE_LIMIT);
  });
});

describe("D7 chips — a plant response never survives a switch to a tent", () => {
  it("strips the response line when the grower retargets to the tent", async () => {
    renderSheet("plant:plant-1");

    fireEvent.change(noteTextarea(), { target: { value: "Watered 1L, runoff clear." } });
    fireEvent.click(chip("better"));
    expect(noteTextarea().value).toContain("Response check: Better.");

    // Retarget through the sheet's own Select — a prop change would reset the
    // whole draft and prove nothing about this rule.
    fireEvent.click(screen.getByLabelText("Target"));
    fireEvent.click(await screen.findByRole("option", { name: /Tent 1/ }));

    await waitFor(() =>
      expect(screen.queryByTestId("qlv2-response-chips")).not.toBeInTheDocument(),
    );
    // The plant-response marker is gone; the grower's own prose survives.
    await waitFor(() => expect(noteTextarea().value).not.toContain("Response check:"));
    expect(noteTextarea().value).toContain("Watered 1L, runoff clear.");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const note = await savedNote();
    expect(note).not.toContain("Response check:");
    expect(note).toContain("Watered 1L, runoff clear.");
  });

  it("never rewrites ordinary prose the grower types into a tent note", () => {
    // The cleanup exists to undo what a CHIP wrote, not to police the grower's
    // words. `readResponseCheckStatus` matches anywhere in the note, so a
    // cleanup that ran whenever the chips are merely absent would silently
    // edit this sentence down to "Previous after watering".
    renderSheet("tent:tent-1");
    const prose = "Previous response check: better after watering. Runoff clear.";
    fireEvent.change(noteTextarea(), { target: { value: prose } });

    expect(screen.queryByTestId("qlv2-response-chips")).not.toBeInTheDocument();
    expect(noteTextarea().value).toBe(prose);
  });

  it("leaves the same prose alone on a plant draft too", () => {
    renderSheet("plant:plant-1");
    const prose = "Previous response check: better after watering. Runoff clear.";
    fireEvent.change(noteTextarea(), { target: { value: prose } });

    expect(noteTextarea().value).toBe(prose);
  });

  it("strips the marker when the grower retargets to a DIFFERENT plant", async () => {
    // The chips stay visible across plant A -> plant B, so a guard keyed only
    // on visibility skips cleanup and silently reattributes A's response to B.
    renderSheet("plant:plant-1");

    fireEvent.change(noteTextarea(), { target: { value: "Watered 1L, runoff clear." } });
    fireEvent.click(chip("better"));
    expect(noteTextarea().value).toContain("Response check: Better.");

    fireEvent.click(screen.getByLabelText("Target"));
    fireEvent.click(await screen.findByRole("option", { name: /Plant 2/ }));

    // Chips are still offered — it is still a plant — but A's response is gone.
    await waitFor(() => expect(noteTextarea().value).not.toContain("Response check:"));
    expect(screen.getByTestId("qlv2-response-chips")).toBeInTheDocument();
    expect(noteTextarea().value).toContain("Watered 1L, runoff clear.");
    for (const status of ["better", "same", "worse"]) {
      expect(chip(status)).toHaveAttribute("aria-pressed", "false");
    }

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const note = await savedNote();
    expect(note).not.toContain("Response check:");
    expect(note).toContain("Watered 1L, runoff clear.");
  });

  it("leaves the marker alone while the grower stays on the same plant", () => {
    renderSheet("plant:plant-1");
    fireEvent.click(chip("same"));
    expect(noteTextarea().value).toBe("Response check: Same.");

    // An unrelated edit re-runs the effect; the plant has not changed.
    fireEvent.change(noteTextarea(), {
      target: { value: `${noteTextarea().value} Leaves perked up.` },
    });

    expect(noteTextarea().value).toContain("Response check: Same.");
    expect(noteTextarea().value).toContain("Leaves perked up.");
  });
});
