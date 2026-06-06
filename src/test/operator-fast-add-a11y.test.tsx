/**
 * Operator Fast Add accessibility tests.
 *
 * Lightweight a11y assertions using React Testing Library role/name
 * queries. Verifies the gated Fast Add menu exposes accessible names,
 * correct ARIA semantics, and screen-reader-reachable helper text on
 * mobile-sized renders.
 *
 * No Supabase, no model calls, no automation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GlobalFastAddButton from "@/components/GlobalFastAddButton";
import {
  FAST_ADD_ACTIONS,
  FAST_ADD_NO_CONTEXT_COPY,
} from "@/lib/fastAddActionRules";

// Force a mobile-shaped viewport on jsdom so any tap-target/visibility
// assertions reflect the constrained surface.
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    value: 360,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 740,
    configurable: true,
    writable: true,
  });
});
afterEach(() => cleanup());

function renderFastAdd(ctx: Parameters<typeof GlobalFastAddButton>[0]["context"] = null) {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <GlobalFastAddButton context={ctx} />
    </MemoryRouter>,
  );
}

describe("Global Fast Add — accessible names", () => {
  it("trigger button has an accessible name 'Fast Add'", () => {
    renderFastAdd();
    const trigger = screen.getByRole("button", { name: /fast add/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens a menu with role='menu' and an aria-label", () => {
    renderFastAdd();
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(menu.getAttribute("aria-label")).toMatch(/fast add/i);
    expect(
      screen.getByTestId("global-fast-add-trigger").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it.each(FAST_ADD_ACTIONS.map((a) => [a.id, a.label] as const))(
    "menu item '%s' renders as role='menuitem' with accessible name '%s'",
    (_id, label) => {
      renderFastAdd();
      fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
      const item = screen.getByRole("menuitem", { name: label });
      expect(item).toBeInTheDocument();
    },
  );
});

describe("Global Fast Add — gated helper text + CTAs (screen-reader reachable)", () => {
  it("the needs-context notice exposes role='status' with aria-live='polite'", () => {
    renderFastAdd();
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-watering"));
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(FAST_ADD_NO_CONTEXT_COPY);
    expect(notice.getAttribute("aria-live")).toBe("polite");
  });

  it("CTA buttons in the gated state are reachable by accessible name", () => {
    renderFastAdd();
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-feeding"));
    expect(
      screen.getByRole("button", { name: /choose plant/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose tent/i }),
    ).toBeInTheDocument();
  });

  it("static sr-only helper text ships in the DOM for screen readers even before interaction", () => {
    renderFastAdd();
    const srOnly = screen.getByTestId("global-fast-add-needs-context-copy");
    expect(srOnly).toHaveTextContent(FAST_ADD_NO_CONTEXT_COPY);
    // The sr-only class hides the element visually but not from the AT.
    expect(srOnly.className).toMatch(/sr-only/);
  });

  it("the gated state explains why an action is unavailable (calm, specific copy)", () => {
    renderFastAdd();
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-action-photo"));
    const notice = screen.getByRole("status");
    expect(notice.textContent).toMatch(/select a plant or tent/i);
  });
});

describe("Global Fast Add — interactive controls are reachable on mobile-sized render", () => {
  it("every menu item exposes a focusable button element", () => {
    renderFastAdd();
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    for (const a of FAST_ADD_ACTIONS) {
      const item = screen.getByRole("menuitem", { name: a.label });
      // <button> elements are inherently focusable; the tabIndex must
      // not be set to -1 which would remove them from the tab order.
      expect(item.tagName.toLowerCase()).toBe("button");
      const tabindex = item.getAttribute("tabindex");
      expect(tabindex === null || Number(tabindex) >= 0).toBe(true);
    }
  });
});
