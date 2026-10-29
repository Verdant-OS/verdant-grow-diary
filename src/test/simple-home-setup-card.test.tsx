/**
 * SimpleHomeSetupCard — presenter for Start / Continue setup.
 *
 * Renders the checklist with done markers, the primary and secondary routes,
 * the allowance line only when present, and the rename flow: text kept on a
 * failed save, the button disabled while saving, a confirmed save closes the
 * form and notifies the caller, and no rename is offered when not allowed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import SimpleHomeSetupCard from "@/components/SimpleHomeSetupCard";
import type { SimpleHomeSetupProgress } from "@/lib/simpleHomeSetupRules";

const GROW = "11111111-1111-4111-8111-111111111111";

function progress(overrides: Partial<SimpleHomeSetupProgress> = {}): SimpleHomeSetupProgress {
  return {
    kind: "continue",
    title: "Continue setup",
    body: "You are part-way through.",
    steps: [
      { key: "grow", label: "Grow", done: true, detail: "My grow" },
      { key: "tent", label: "Tent", done: false, detail: "Where the plants live" },
      { key: "plant", label: "Plant", done: false, detail: "Where your notes go" },
    ],
    nextStep: "tent",
    primary: { label: "Continue setup", href: "/start-room" },
    secondary: { label: "Or add a tent on the Tents page", href: `/tents?growId=${GROW}` },
    growId: GROW,
    growName: "My grow",
    growHref: `/grows/${GROW}`,
    allowance: "Your plan includes 1 active grow, and “My grow” is it.",
    canRename: true,
    ...overrides,
  };
}

function renderCard(p: SimpleHomeSetupProgress, props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <SimpleHomeSetupCard progress={p} testId="setup" {...props} />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe("SimpleHomeSetupCard", () => {
  it("renders the checklist, routes and allowance", () => {
    renderCard(progress(), { onRename: vi.fn() });
    expect(screen.getByTestId("setup")).toHaveAttribute("data-setup-next", "tent");
    expect(screen.getByTestId("setup-step-grow")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("setup-step-tent")).toHaveAttribute("data-done", "false");
    expect(screen.getByTestId("setup-cta")).toHaveAttribute("href", "/start-room");
    expect(screen.getByTestId("setup-secondary")).toHaveAttribute("href", `/tents?growId=${GROW}`);
    expect(screen.getByTestId("setup-allowance")).toHaveTextContent(/1 active grow/);
    expect(screen.getByTestId("setup-rename-toggle")).toBeInTheDocument();
  });

  it("omits the allowance line, the secondary link and the rename offer when absent", () => {
    renderCard(progress({ allowance: null, secondary: null, canRename: false }), {
      onRename: vi.fn(),
    });
    expect(screen.queryByTestId("setup-allowance")).toBeNull();
    expect(screen.queryByTestId("setup-secondary")).toBeNull();
    expect(screen.queryByTestId("setup-rename")).toBeNull();
  });

  it("a confirmed rename closes the form and notifies the caller", async () => {
    const onRename = vi.fn(async (_id: string, name: string) => ({
      ok: true as const,
      name: name.trim(),
    }));
    const onRenamed = vi.fn();
    renderCard(progress(), { onRename, onRenamed });
    fireEvent.click(screen.getByTestId("setup-rename-toggle"));
    const input = screen.getByTestId("setup-rename-input") as HTMLInputElement;
    expect(input.value).toBe("My grow");
    fireEvent.change(input, { target: { value: "Veg room 2026" } });
    fireEvent.click(screen.getByTestId("setup-rename-save"));
    await waitFor(() => expect(onRenamed).toHaveBeenCalledTimes(1));
    expect(onRename).toHaveBeenCalledWith(GROW, "Veg room 2026");
    expect(screen.queryByTestId("setup-rename-input")).toBeNull();
    expect(screen.getByTestId("setup-rename-status")).toHaveTextContent("Name saved.");
  });

  it("a failed rename keeps the grower's text and reports the reason; saving disables the button", async () => {
    let release: (v: { ok: false; message: string }) => void = () => {};
    const onRename = vi.fn(
      () => new Promise<{ ok: false; message: string }>((resolve) => (release = resolve)),
    );
    const onRenamed = vi.fn();
    renderCard(progress(), { onRename, onRenamed });
    fireEvent.click(screen.getByTestId("setup-rename-toggle"));
    fireEvent.change(screen.getByTestId("setup-rename-input"), { target: { value: "New name" } });
    fireEvent.click(screen.getByTestId("setup-rename-save"));
    expect(screen.getByTestId("setup-rename-save")).toBeDisabled();
    expect(screen.getByTestId("setup-rename-save")).toHaveTextContent("Saving…");
    await act(async () => {
      release({
        ok: false,
        message: "Couldn't save the name. Your text is still here; try again.",
      });
    });
    expect(screen.getByTestId("setup-rename-status")).toHaveAttribute("role", "alert");
    expect((screen.getByTestId("setup-rename-input") as HTMLInputElement).value).toBe("New name");
    expect(screen.getByTestId("setup-rename-save")).not.toBeDisabled();
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("a blank name is refused on the card before any write", async () => {
    const onRename = vi.fn();
    renderCard(progress(), { onRename });
    fireEvent.click(screen.getByTestId("setup-rename-toggle"));
    fireEvent.change(screen.getByTestId("setup-rename-input"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("setup-rename-save"));
    expect(await screen.findByTestId("setup-rename-status")).toHaveTextContent(/between 1 and 80/);
    expect(onRename).not.toHaveBeenCalled();
  });
});
