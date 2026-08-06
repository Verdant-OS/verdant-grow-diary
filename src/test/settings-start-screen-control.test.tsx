// Settings start-screen control — user-scoped localStorage preference UI.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  clearLocalStorageForTest,
  ensureLocalStorageForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-settings-1", email: "x@example.invalid" },
    session: {},
    loading: false,
    signOut: vi.fn(),
  }),
}));

import Settings from "@/pages/Settings";
import { getStartScreenChoice, DEFAULT_START_SCREEN } from "@/lib/startScreenPreferences";

beforeEach(() => {
  try {
    clearLocalStorageForTest();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings start-screen control", () => {
  it("renders the start-screen control for a signed-in user", () => {
    renderSettings();
    expect(screen.getByRole("heading", { name: /^start screen$/i })).toBeInTheDocument();
    expect(screen.getByText(/choose where verdant opens after sign-in/i)).toBeInTheDocument();
    expect(screen.getByTestId("start-screen-option-quickLog")).toBeInTheDocument();
    expect(screen.getByTestId("start-screen-option-onboarding")).toBeInTheDocument();
    expect(screen.getByTestId("start-screen-option-welcome")).toBeInTheDocument();
  });

  it("defaults to diary-first when nothing is saved", () => {
    renderSettings();
    const quick = screen.getByTestId("start-screen-option-quickLog") as HTMLInputElement;
    expect(quick.checked).toBe(true);
    expect(DEFAULT_START_SCREEN).toBe("quickLog");
  });

  it("saves preference to the user-scoped localStorage key", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-option-onboarding"));
    fireEvent.click(screen.getByTestId("start-screen-save"));
    expect(getLocalStorageItemForTest("verdant:startScreen:user-settings-1")).toBe("onboarding");
    expect(getStartScreenChoice("user-settings-1")).toBe("onboarding");
    expect(screen.getByTestId("start-screen-saved")).toHaveAttribute("role", "status");
  });

  it("shows an honest storage error and recovers when Save is retried", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-option-timeline"));

    const storage = ensureLocalStorageForTest();
    const storagePrototype = Object.getPrototypeOf(storage) as Storage;
    const setItem = storagePrototype.setItem;
    vi.spyOn(storagePrototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("storage blocked");
      })
      .mockImplementation(function (this: Storage, key, value) {
        setItem.call(this, key, value);
      });

    fireEvent.click(screen.getByTestId("start-screen-save"));
    expect(screen.getByTestId("start-screen-saved")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("start-screen-saved")).toHaveTextContent(
      /couldn't save.+on this device.+try again/i,
    );
    expect(getLocalStorageItemForTest("verdant:startScreen:user-settings-1")).toBeNull();

    fireEvent.click(screen.getByTestId("start-screen-save"));
    expect(screen.getByTestId("start-screen-saved")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("start-screen-saved")).toHaveTextContent(/saved/i);
    expect(getStartScreenChoice("user-settings-1")).toBe("timeline");
  });

  it("welcome option stores safe internal value", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-option-welcome"));
    fireEvent.click(screen.getByTestId("start-screen-save"));
    expect(getStartScreenChoice("user-settings-1")).toBe("welcome");
  });

  it("reset button clears preference and re-selects diary-first", () => {
    setLocalStorageItemForTest("verdant:startScreen:user-settings-1", "timeline");
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-reset"));
    expect(getLocalStorageItemForTest("verdant:startScreen:user-settings-1")).toBeNull();
    const quick = screen.getByTestId("start-screen-option-quickLog") as HTMLInputElement;
    expect(quick.checked).toBe(true);
  });

  it("keeps the current choice and explains when Reset cannot clear storage", () => {
    setLocalStorageItemForTest("verdant:startScreen:user-settings-1", "timeline");
    renderSettings();
    const storage = ensureLocalStorageForTest();
    const storagePrototype = Object.getPrototypeOf(storage) as Storage;
    vi.spyOn(storagePrototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    fireEvent.click(screen.getByTestId("start-screen-reset"));

    expect(screen.getByTestId("start-screen-option-timeline")).toBeChecked();
    expect(screen.getByTestId("start-screen-saved")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("start-screen-saved")).toHaveTextContent(
      /couldn't reset.+current choice is unchanged.+try again/i,
    );
    expect(getStartScreenChoice("user-settings-1")).toBe("timeline");
  });

  it("never stores tokens/sessions/grow data under the start-screen key", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-option-timeline"));
    fireEvent.click(screen.getByTestId("start-screen-save"));
    const v = getLocalStorageItemForTest("verdant:startScreen:user-settings-1") ?? "";
    expect(v).not.toMatch(/token|session|password|hash|@/i);
    expect(v).toBe("timeline");
  });
});
