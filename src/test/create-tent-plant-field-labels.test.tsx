/**
 * Audit 2026-11-03 finding 12, follow-up to New Grow (#2823): the Create Tent
 * and Create Plant forms had visible labels that were not tied to their
 * controls, so assistive tech announced those fields without a name. Every
 * field label in both forms now points at its control, as Name already did.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const IDS = {
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  grow: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  tent: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
} as const;

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: IDS.owner }, loading: false }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: IDS.grow, name: "Grow" }],
    activeGrowId: IDS.grow,
    loading: false,
    error: null,
    refresh: vi.fn(),
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: IDS.tent, name: "Tent One", grow_id: IDS.grow, growId: IDS.grow }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: FREE_CAPABILITIES },
    refetch: vi.fn(async () => undefined),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CreateTentDialog from "@/components/CreateTentDialog";
import CreatePlantDialog from "@/components/CreatePlantDialog";

/** Every <label> in the form names a control, and every control id is distinct. */
function expectEveryLabelTied(form: HTMLElement) {
  const labels = Array.from(form.querySelectorAll("label"));
  expect(labels.length).toBeGreaterThan(0);
  const ids = labels.map((label) => {
    const target = label.htmlFor ? form.ownerDocument.getElementById(label.htmlFor) : null;
    expect(target, `label "${label.textContent?.trim()}" names no control`).not.toBeNull();
    return label.htmlFor;
  });
  expect(new Set(ids).size).toBe(ids.length);
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("Create Tent form field labels", () => {
  function renderTent() {
    render(
      <MemoryRouter>
        <CreateTentDialog initiallyOpen defaultGrowId={IDS.grow} />
      </MemoryRouter>,
    );
  }

  it("names Size, Brand and Stage by their visible labels", () => {
    renderTent();
    expect(screen.getByLabelText("Size (optional)")).toHaveAttribute("placeholder", "4x4");
    expect(screen.getByLabelText("Brand (optional)")).toHaveAttribute("placeholder", "Gorilla");
    expect(screen.getByLabelText("Stage (optional)")).toHaveAttribute("role", "combobox");
  });

  it("ties every label in the form to a control", () => {
    renderTent();
    expectEveryLabelTied(screen.getByTestId("create-tent-form"));
  });
});

describe("Create Plant form field labels", () => {
  function renderPlant() {
    render(
      <MemoryRouter>
        <CreatePlantDialog initiallyOpen defaultGrowId={IDS.grow} />
      </MemoryRouter>,
    );
  }

  it("names Stage, Type, Tent and Health pickers by their visible labels", () => {
    renderPlant();
    expect(screen.getByLabelText("Stage")).toHaveAttribute("role", "combobox");
    expect(screen.getByLabelText("Type (optional)")).toBe(
      screen.getByTestId("create-plant-type-select"),
    );
    expect(screen.getByLabelText(/^Tent/)).toBe(screen.getByTestId("create-plant-tent-select"));
    expect(screen.getByLabelText("Health")).toBe(screen.getByTestId("create-plant-health"));
  });

  it("names Strain and Started at by their visible labels", () => {
    renderPlant();
    expect(screen.getByLabelText("Strain (optional)")).toHaveAttribute("placeholder", "Blue Dream");
    expect(screen.getByLabelText("Started at (optional)")).toHaveAttribute("type", "date");
  });

  it("ties every label in the form to a control", () => {
    renderPlant();
    expectEveryLabelTied(screen.getByTestId("create-plant-form"));
  });
});
