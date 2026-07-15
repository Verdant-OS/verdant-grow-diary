import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));

import { buildAiDoctorContextShareData } from "@/lib/aiDoctorContextCheckRules";
import AiDoctorContextCheck from "@/pages/AiDoctorContextCheck";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");

function renderPage() {
  return render(
    <MemoryRouter>
      <AiDoctorContextCheck />
    </MemoryRouter>,
  );
}

beforeEach(() => mocks.track.mockReset());

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
  if (originalShare) Object.defineProperty(navigator, "share", originalShare);
  else delete (navigator as Navigator & { share?: Navigator["share"] }).share;
});

describe("AI Doctor Context Check page", () => {
  it("renders all categories and returns a closed, no-diagnosis result for empty context", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getAllByRole("checkbox")).toHaveLength(12);
    expect(screen.getByText(/Nothing is uploaded or saved/)).toBeInTheDocument();
    expect(screen.getByText(/No diagnosis or cultivation instruction/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Check my context/ }));

    expect(screen.getByText("More context needed")).toBeInTheDocument();
    expect(screen.getByTestId("context-check-coverage")).toHaveTextContent("0/12 · 0%");
    expect(screen.getByTestId("context-check-result")).toHaveTextContent(
      /before acting on a diagnosis/i,
    );
    expect(mocks.track).toHaveBeenCalledWith("context_check_completed", {
      item: "insufficient",
      source: "0_of_12",
    });
  });

  it("reaches strong coverage only after the core, current, and historical contract is present", () => {
    renderPage();

    const selectedCheckboxes = [
      [0, /Plant stage/],
      [1, /Strain or cultivar/],
      [2, /Growing medium/],
      [3, /Pot size or reservoir volume/],
      [4, /Recent watering/],
      [5, /Recent feeding/],
      [7, /Recent photos/],
      [8, /Diary entries/],
      [10, /Grow targets/],
    ] as const;
    const checkboxes = screen.getAllByRole("checkbox");
    for (const [index, name] of selectedCheckboxes) {
      expect(checkboxes[index]).toHaveAccessibleName(name);
      fireEvent.click(checkboxes[index]);
    }
    fireEvent.click(screen.getByRole("button", { name: /Check my context/ }));

    expect(screen.getByText("Strong context coverage")).toBeInTheDocument();
    expect(screen.getByTestId("context-check-coverage")).toHaveTextContent("9/12 · 75%");
    expect(screen.getByRole("link", { name: "Start a free grow memory" })).toHaveAttribute(
      "href",
      "/auth?mode=signup&utm_source=context_check&utm_medium=owned&utm_campaign=context_check",
    );
    expect(screen.getByRole("link", { name: "Compare Free and Pro" })).toHaveAttribute(
      "href",
      "/pricing?utm_source=context_check&utm_medium=owned&utm_campaign=context_check",
    );
  });

  it("shares only the blank fixed check and emits PII-free events", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPage();

    await user.click(screen.getByRole("checkbox", { name: /Plant stage/ }));
    await user.click(screen.getByRole("button", { name: /Check my context/ }));
    await user.click(screen.getByRole("button", { name: /Share this check/ }));

    expect(writeText).toHaveBeenCalledWith(buildAiDoctorContextShareData().url);
    expect(await screen.findByText(/Your selections were not included/)).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith("context_check_share_clicked", {
      source: "copy_link",
    });
    expect(mocks.track).toHaveBeenCalledWith("context_check_share_completed", {
      source: "copy_link",
    });
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(/email|user_?id|token|plant_stage/i);
  });

  it("resets selections and result deterministically", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("checkbox", { name: /Plant stage/ }));
    await user.click(screen.getByRole("button", { name: /Check my context/ }));
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByTestId("context-check-running-count")).toHaveTextContent(
      "0 of 12 categories",
    );
    expect(screen.queryByTestId("context-check-result")).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith("context_check_reset");
  });
});
