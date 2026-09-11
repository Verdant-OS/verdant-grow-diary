/**
 * ASSIGN_TENT_EMPTY_CREATE_CTA_LIVE_MISS
 *
 * Live path: Plants list → plant overflow → Move Plant → Assign to tent empty
 * modal. #1311 pinned AssignTentDialog in isolation; production still missed
 * the Create tent CTA because Move kept Assign nested under DropdownMenuContent
 * with preventDefault (menu stayed open / nested DialogTrigger failed to show).
 *
 * Pins the Plants-list Move entry path: menu item closes the menu, Assign is
 * controlled outside DropdownMenuContent, empty grow shows Create tent CTA.
 */
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const mocks = vi.hoisted(() => ({
  tentQueryRuns: 0,
  tentRowsByCall: null as Array<Array<Record<string, unknown>>> | null,
  createTentDefaultGrowIds: [] as string[],
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      update: () => ({ eq: async () => ({ error: null }) }),
      order: async () => {
        mocks.tentQueryRuns += 1;
        const idx = mocks.tentQueryRuns - 1;
        const data =
          mocks.tentRowsByCall && mocks.tentRowsByCall[idx] !== undefined
            ? mocks.tentRowsByCall[idx]
            : [];
        return { data, error: null };
      },
    };
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "tents" || table === "plants") return makeBuilder();
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  };
});

vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Content = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  const Dialog = ({
    children,
    open,
  }: {
    children?: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    if (open === false) return null;
    return <>{children}</>;
  };
  return {
    Dialog,
    DialogTrigger: Pass,
    DialogContent: Content,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});

vi.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Div = ({ children, ...props }: { children?: ReactNode; [k: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  return {
    Select: Div,
    SelectContent: Pass,
    SelectGroup: Pass,
    SelectItem: Div,
    SelectLabel: Pass,
    SelectTrigger: Div,
    SelectValue: Pass,
  };
});

vi.mock("@/components/EditPlantDialog", () => ({
  default: ({ trigger }: { trigger?: ReactNode }) => <>{trigger}</>,
}));
vi.mock("@/components/PlantMergeDialog", () => ({
  default: ({ trigger }: { trigger?: ReactNode }) => <>{trigger}</>,
}));

vi.mock("@/components/CreateTentDialog", () => ({
  default: ({ defaultGrowId }: { defaultGrowId?: string }) => {
    if (defaultGrowId) mocks.createTentDefaultGrowIds.push(defaultGrowId);
    return (
      <div data-testid="create-tent-dialog-stub" data-grow-id={defaultGrowId ?? ""}>
        Create tent dialog
      </div>
    );
  },
}));

import PlantCardActionsMenu from "@/components/PlantCardActionsMenu";

const orphanPlant = {
  id: "plant-junk-hunt",
  name: "JUNK-HUNT-20260907",
  strain: null,
  stage: "veg",
  health: "good",
  startedAt: null,
  tentId: null,
  growId: "4cad3cae-21e3-42f8-8372-2f6237205db3",
  lastNote: null,
  photo: null,
  isArchived: false,
};

function renderMenu() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantCardActionsMenu plant={orphanPlant} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.tentQueryRuns = 0;
  mocks.tentRowsByCall = [[], []];
  mocks.createTentDefaultGrowIds.length = 0;
});

describe("PlantCardActionsMenu · Plants list Move → empty Assign Create tent CTA", () => {
  it("keeps menu-variant AssignTentDialog outside DropdownMenuContent (source contract)", () => {
    // @source-scan-justified: structural placement relative to DropdownMenuContent
    // cannot be proven by rendering alone without brittle DOM ancestry asserts;
    // the live miss was nesting Assign under the open menu. Row variant still
    // uses an earlier <AssignTentDialog trigger=…> — pin the controlled menu one.
    const src = readFileSync(
      resolve(process.cwd(), "src/components/PlantCardActionsMenu.tsx"),
      "utf8",
    );
    const menuEnd = src.indexOf("</DropdownMenuContent>");
    const controlledAssignIdx = src.indexOf("open={assignOpen}");
    expect(menuEnd).toBeGreaterThan(0);
    expect(controlledAssignIdx).toBeGreaterThan(menuEnd);
    expect(src).toMatch(/onSelect=\{\(\)\s*=>\s*setAssignOpen\(true\)\}/);
    expect(src).toMatch(/onOpenChange=\{setAssignOpen\}/);
    // Move item must not wrap AssignTentDialog / preventDefault (old dead path).
    expect(src).not.toMatch(
      /AssignTentDialog[\s\S]{0,200}plant-card-action-move[\s\S]{0,120}preventDefault/,
    );
  });

  it("Move Plant opens empty Assign modal with Create tent CTA for the plant growId", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByTestId("plant-card-actions-trigger"));
    const menu = await screen.findByTestId("plant-card-actions-menu");
    await user.click(within(menu).getByTestId("plant-card-action-move"));

    await waitFor(() => expect(mocks.tentQueryRuns).toBe(2));
    expect(await screen.findByTestId("assign-tent-dialog")).toBeInTheDocument();
    expect(screen.getByText("Assign to tent")).toBeInTheDocument();
    expect(screen.getByText("No tents available in this grow.")).toBeInTheDocument();

    const cta = await screen.findByTestId("assign-tent-create-tent-cta");
    expect(cta).toHaveAttribute("data-grow-id", orphanPlant.growId);
    const button = screen.getByTestId("assign-tent-create-tent-button");
    expect(button).toBeInTheDocument();

    await user.click(button);
    const createStub = await screen.findByTestId("create-tent-dialog-stub");
    expect(createStub).toHaveAttribute("data-grow-id", orphanPlant.growId);
    expect(mocks.createTentDefaultGrowIds).toContain(orphanPlant.growId);
  });
});
