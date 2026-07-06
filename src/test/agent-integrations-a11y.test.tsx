/**
 * Agent Integrations — keyboard navigation + axe accessibility audit.
 *
 * Covers:
 *  1. Connect-an-agent checklist keyboard focus order (Tab reaches every
 *     interactive control in visual order; Enter/Space activate).
 *  2. Axe audit of the full page and of the View MCP manifest modal
 *     open state (dialog labeling, accessible names, focus movement).
 *
 * Presenter-only; no Supabase calls. Uses the repo's existing vitest-axe
 * pattern (see settings-start-screen-a11y.test.tsx / auth-axe.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { axe } from "vitest-axe";

/**
 * Install a clipboard spy that survives `userEvent.setup()`.
 *
 * `userEvent.setup()` attaches its own `navigator.clipboard` stub, which
 * clobbers a spy defined earlier. Call this AFTER setup() so the app's
 * `navigator.clipboard.writeText` resolves to our spy at click time.
 */
function installClipboardSpy(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: () => undefined,
}));

import AgentIntegrations from "@/pages/AgentIntegrations";

function renderAgentIntegrations() {
  return render(
    <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
      <Routes>
        <Route path="/settings/agent-integrations" element={<AgentIntegrations />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Checklist interactive controls in visual/logical (DOM) order. */
const CHECKLIST_TAB_ORDER = [
  "open-oauth-consent-link",
  "view-mcp-manifest-link",
  "view-tool-reference-link",
  "checklist-copy-connection-details",
  "checklist-open-manifest-summary-modal",
] as const;

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("Connect-an-agent checklist — keyboard navigation", () => {
  it("Tab moves through the checklist controls in visual order", async () => {
    const user = userEvent.setup();
    renderAgentIntegrations();

    const first = screen.getByTestId(CHECKLIST_TAB_ORDER[0]);
    first.focus();
    expect(document.activeElement).toBe(first);

    for (const testId of CHECKLIST_TAB_ORDER.slice(1)) {
      await user.tab();
      expect(document.activeElement, `Tab should land on ${testId} next`).toBe(
        screen.getByTestId(testId),
      );
    }
  });

  it("every required control is reachable via Tab from the top of the page, in order", async () => {
    const user = userEvent.setup();
    renderAgentIntegrations();

    // Walk the page's whole tab sequence and record test ids as we go.
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) break;
      const id = el.getAttribute("data-testid");
      if (id) seen.push(id);
    }

    // The required controls must appear as an in-order subsequence —
    // robust to additional focusables, strict about relative order.
    const required = [
      "mcp-manifest-link",
      "copy-connection-details",
      "open-manifest-summary-modal",
      "verify-tool-access-button",
      ...CHECKLIST_TAB_ORDER,
    ];
    let cursor = 0;
    for (const id of seen) {
      if (id === required[cursor]) cursor += 1;
      if (cursor === required.length) break;
    }
    expect(
      cursor,
      `tab sequence missing (in order): ${required.slice(cursor).join(", ")} — saw: ${seen.join(" → ")}`,
    ).toBe(required.length);
  });

  it("Enter and Space activate the checklist copy button", async () => {
    const user = userEvent.setup();
    // Install AFTER setup() so our spy wins over userEvent's clipboard stub.
    const writeText = installClipboardSpy();
    renderAgentIntegrations();

    screen.getByTestId("checklist-copy-connection-details").focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));

    await user.keyboard(" ");
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  });

  it("Enter on the View MCP manifest summary button opens the modal", async () => {
    const user = userEvent.setup();
    renderAgentIntegrations();

    screen.getByTestId("checklist-open-manifest-summary-modal").focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByTestId("manifest-summary-modal")).toBeTruthy();
    });
  });

  it("Enter activates the tool reference anchor link", async () => {
    const user = userEvent.setup();
    renderAgentIntegrations();

    const link = screen.getByTestId("view-tool-reference-link");
    const clicked = vi.fn();
    link.addEventListener("click", (e) => {
      clicked();
      e.preventDefault(); // jsdom cannot perform hash navigation
    });

    link.focus();
    expect(document.activeElement).toBe(link);
    await user.keyboard("{Enter}");
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("checklist steps are plain content, not forced into the tab order", () => {
    renderAgentIntegrations();
    const steps = screen.getByTestId("connect-agent-steps").querySelectorAll("li");
    expect(steps.length).toBe(7);
    for (const li of steps) {
      expect(li.hasAttribute("tabindex"), "checklist <li> must not be tabbable").toBe(false);
    }
  });
});

describe("Agent Integrations — axe accessibility audit", () => {
  it("page has no detectable axe violations", async () => {
    const { container } = renderAgentIntegrations();
    const results = await axe(container);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("View MCP manifest modal open state has no detectable axe violations", async () => {
    const user = userEvent.setup();
    renderAgentIntegrations();
    await user.click(screen.getByTestId("open-manifest-summary-modal"));
    const dialog = await screen.findByRole("dialog");

    // Audit the dialog itself (the page behind it is aria-hidden by the
    // dialog library while open, which is expected modal behavior).
    const results = await axe(dialog);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

describe("View MCP manifest modal — dialog accessibility contract", () => {
  it("dialog exposes an accessible title", async () => {
    const user = userEvent.setup();
    renderAgentIntegrations();
    await user.click(screen.getByTestId("open-manifest-summary-modal"));

    const dialog = await screen.findByRole("dialog", {
      name: /safe mcp manifest summary/i,
    });
    expect(dialog).toBeInTheDocument();
  });

  it("close and copy buttons have accessible names", async () => {
    const user = userEvent.setup();
    renderAgentIntegrations();
    await user.click(screen.getByTestId("open-manifest-summary-modal"));
    const dialog = await screen.findByRole("dialog");

    const copy = within(dialog).getByTestId("manifest-summary-copy");
    expect(copy).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/copy safe mcp manifest summary/i),
    );

    const close = within(dialog).getByTestId("manifest-summary-close");
    expect(close).toHaveAttribute("aria-label", expect.stringMatching(/close/i));

    // The dialog library's built-in X close also carries an accessible name.
    const namedCloseButtons = within(dialog).getAllByRole("button", {
      name: /close/i,
    });
    expect(namedCloseButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("focus moves into the modal on open and returns to the trigger on close", async () => {
    renderAgentIntegrations();

    const trigger = screen.getByTestId("open-manifest-summary-modal");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");

    // Focus is moved into the dialog after opening (Radix focus trap).
    await waitFor(() => {
      expect(dialog.contains(document.activeElement), "focus should move into the open modal").toBe(
        true,
      );
    });

    // Closing returns focus to the trigger (Radix onCloseAutoFocus default).
    fireEvent.click(within(dialog).getByTestId("manifest-summary-close"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // Flush Radix's focus-restore microtask (see ai-doctor citation a11y test).
    await new Promise((r) => queueMicrotask(() => r(null)));
    await waitFor(() => {
      expect(document.activeElement, "focus should return to the View MCP manifest trigger").toBe(
        trigger,
      );
    });
  });
});
