/**
 * Behavioral integration for grow-bound Create Tent / Create Plant dialogs.
 * Mocks RLS-loaded grow/tent state and Supabase; proves fail-closed UX and
 * exact insert payloads. Static source matching alone is not sufficient.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { growSetupMessages } from "@/constants/growSetupMessages";
import { CREATE_NO_SETUP_START_HREF } from "@/lib/createGrowBindingRules";

const GROW_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GROW_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_OTHER = "22222222-2222-2222-2222-222222222222";
const TENT_UNLINKED = "33333333-3333-3333-3333-333333333333";
const USER_ID = "99999999-9999-9999-9999-999999999999";

const growsState = {
  grows: [] as Array<{ id: string; name: string | null }>,
  activeGrowId: null as string | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(async () => undefined),
};

const tentsState = {
  data: [] as Array<{ id: string; name: string; grow_id: string | null }>,
};

const insertMock = vi.fn();
const selectMock = vi.fn();
const singleMock = vi.fn();

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: USER_ID } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => growsState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => tentsState,
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        insertMock(table, payload);
        return {
          select: (...args: unknown[]) => {
            selectMock(...args);
            return {
              single: () => singleMock(table, payload),
            };
          },
        };
      },
    }),
  },
}));

import CreateTentDialog from "@/components/CreateTentDialog";
import CreatePlantDialog from "@/components/CreatePlantDialog";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function openTent(props: Record<string, unknown> = {}) {
  wrap(<CreateTentDialog initiallyOpen {...props} />);
}

function openPlant(props: Record<string, unknown> = {}) {
  wrap(<CreatePlantDialog initiallyOpen {...props} />);
}

beforeEach(() => {
  insertMock.mockReset();
  selectMock.mockReset();
  singleMock.mockReset();
  growsState.grows = [];
  growsState.activeGrowId = null;
  growsState.loading = false;
  growsState.error = null;
  growsState.refresh = vi.fn(async () => undefined);
  tentsState.data = [];
  singleMock.mockResolvedValue({
    data: { id: TENT_A, name: "New" },
    error: null,
  });
});

describe("CreateTentDialog grow binding", () => {
  it("shows hard stop with activation route and no form when zero grows", () => {
    openTent();
    expect(screen.getByTestId("create-tent-no-setup")).toHaveTextContent(
      growSetupMessages.noSetup.title,
    );
    expect(screen.queryByTestId("create-tent-form")).not.toBeInTheDocument();
    const cta = screen.getByTestId("create-tent-start-room");
    expect(cta).toHaveAttribute("href", CREATE_NO_SETUP_START_HREF);
    expect(cta).toHaveAttribute("href", "/grows?intent=one_tent_activation");
  });

  it("shows retry on read error, not no-setup copy", () => {
    growsState.error = "boom";
    openTent();
    expect(screen.getByTestId("create-tent-binding-read-error")).toHaveTextContent(
      growSetupMessages.readError.title,
    );
    expect(screen.queryByText(growSetupMessages.noSetup.title)).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: growSetupMessages.readError.cta }));
    expect(growsState.refresh).toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("shows current setup name and inserts exact resolved grow_id", async () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    openTent();
    expect(screen.getByTestId("create-tent-setup-context")).toHaveTextContent(
      growSetupMessages.create.addingTo("Spring Veg"),
    );
    expect(screen.getByTestId("create-tent-setup-context")).not.toHaveTextContent(GROW_A);
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), { target: { value: "Canopy" } });
    fireEvent.click(screen.getByTestId("tent-create-submit"));
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    expect(insertMock).toHaveBeenCalledWith(
      "tents",
      expect.objectContaining({
        name: "Canopy",
        grow_id: GROW_A,
        user_id: USER_ID,
      }),
    );
  });

  it("does not fall back to active when requested grow is invalid", () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    openTent({ defaultGrowId: GROW_B });
    expect(screen.getByTestId("create-tent-choose-setup")).toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-form")).not.toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("performs zero inserts while loading", () => {
    growsState.loading = true;
    openTent();
    expect(screen.getByTestId("create-tent-binding-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-form")).not.toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("CreatePlantDialog grow binding", () => {
  it("shows hard stop with activation route and no form when zero grows", () => {
    openPlant();
    expect(screen.getByTestId("create-plant-no-setup")).toHaveTextContent(
      growSetupMessages.noSetup.title,
    );
    expect(screen.queryByTestId("create-plant-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("create-plant-start-room")).toHaveAttribute(
      "href",
      "/grows?intent=one_tent_activation",
    );
  });

  it("inserts exact resolved grow_id and allows tentless outside requireTent", async () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [
      { id: TENT_A, name: "Home", grow_id: GROW_A },
      { id: TENT_OTHER, name: "Other", grow_id: GROW_B },
    ];
    singleMock.mockResolvedValue({ data: { id: "plant-1", name: "P1" }, error: null });
    openPlant();
    expect(screen.getByTestId("create-plant-setup-context")).toHaveTextContent("Spring Veg");
    fireEvent.change(screen.getByPlaceholderText("Plant A"), { target: { value: "Alpha" } });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    expect(insertMock).toHaveBeenCalledWith(
      "plants",
      expect.objectContaining({
        name: "Alpha",
        grow_id: GROW_A,
        user_id: USER_ID,
      }),
    );
    const payload = insertMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.tent_id).toBeUndefined();
  });

  it("clears and blocks a null-grow default tent with zero inserts until fixed", async () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [{ id: TENT_UNLINKED, name: "Orphan", grow_id: null }];
    openPlant({ defaultTentId: TENT_UNLINKED, requireTent: true });
    expect(screen.getByTestId("create-plant-tent-conflict")).toHaveTextContent(
      growSetupMessages.mismatch.unlinkedTentTitle,
    );
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("clears and blocks a different-setup default tent", () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [{ id: TENT_OTHER, name: "Elsewhere", grow_id: GROW_B }];
    openPlant({ defaultTentId: TENT_OTHER });
    expect(screen.getByTestId("create-plant-tent-conflict")).toHaveTextContent(
      growSetupMessages.mismatch.tentTitle,
    );
    expect(screen.getByTestId("create-plant-tent-conflict")).toHaveTextContent("Spring Veg");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("retains a compatible default tent", async () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [{ id: TENT_A, name: "Home", grow_id: GROW_A }];
    singleMock.mockResolvedValue({ data: { id: "plant-1", name: "P1" }, error: null });
    openPlant({ defaultTentId: TENT_A });
    expect(screen.queryByTestId("create-plant-tent-conflict")).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), { target: { value: "Bound" } });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    expect(insertMock).toHaveBeenCalledWith(
      "plants",
      expect.objectContaining({ grow_id: GROW_A, tent_id: TENT_A }),
    );
  });

  it("lists only tents for the resolved setup", () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [
      { id: TENT_A, name: "Home", grow_id: GROW_A },
      { id: TENT_OTHER, name: "Other Setup Tent", grow_id: GROW_B },
    ];
    openPlant();
    fireEvent.click(screen.getByTestId("create-plant-tent-select"));
    const list = screen.getByRole("listbox");
    expect(within(list).getByText("Home")).toBeInTheDocument();
    expect(within(list).queryByText("Other Setup Tent")).not.toBeInTheDocument();
  });

  it("does not fall back to active when requested grow is invalid", () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    openPlant({ defaultGrowId: GROW_B });
    expect(screen.getByTestId("create-plant-choose-setup")).toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-form")).not.toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("nested Add new tent receives resolved grow id", async () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [];
    singleMock.mockResolvedValue({ data: { id: TENT_A, name: "Nested" }, error: null });
    openPlant();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), { target: { value: "Keep Me" } });
    fireEvent.click(screen.getByTestId("create-plant-add-tent"));
    expect(screen.getByTestId("create-tent-inline")).toBeInTheDocument();
    expect(screen.getByTestId("create-tent-setup-context")).toHaveTextContent("Spring Veg");
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "Nested" },
    });
    fireEvent.click(screen.getByTestId("tent-create-submit"));
    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(insertMock).toHaveBeenCalledWith(
      "tents",
      expect.objectContaining({ grow_id: GROW_A, name: "Nested" }),
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Plant A")).toHaveValue("Keep Me");
    });
  });

  it("close/reopen clears stale tent selection state", async () => {
    growsState.grows = [{ id: GROW_A, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [{ id: TENT_A, name: "Home", grow_id: GROW_A }];
    const { unmount } = wrap(
      <CreatePlantDialog initiallyOpen defaultTentId={TENT_OTHER} />,
    );
    // conflicting default — tents only has TENT_A so OTHER is unavailable
    expect(screen.getByTestId("create-plant-tent-conflict")).toBeInTheDocument();
    unmount();
    tentsState.data = [{ id: TENT_A, name: "Home", grow_id: GROW_A }];
    wrap(<CreatePlantDialog initiallyOpen defaultTentId={TENT_A} />);
    expect(screen.queryByTestId("create-plant-tent-conflict")).not.toBeInTheDocument();
  });

  it("never renders internal grow ids as setup names", () => {
    growsState.grows = [{ id: GROW_A, name: "" }];
    growsState.activeGrowId = GROW_A;
    openPlant();
    expect(screen.getByTestId("create-plant-setup-context")).toHaveTextContent(
      growSetupMessages.genericSetupName,
    );
    expect(screen.getByTestId("create-plant-setup-context")).not.toHaveTextContent(GROW_A);
  });
});

describe("create-dialog static safety fence", () => {
  it("catalog and dialogs avoid schema/internal terms in grower copy", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "../..");
    const messageFile = fs.readFileSync(
      path.resolve(root, "src/constants/growSetupMessages.ts"),
      "utf8",
    );
    // Strip block/line comments before scanning grower string values.
    const withoutComments = messageFile
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const term of [
      "orphan",
      "unbound",
      "lineage",
      "backfill",
      "migration",
      "constraint",
      "foreign key",
      "grow_id",
    ]) {
      expect(withoutComments.toLowerCase()).not.toContain(term);
    }
    const dialogs = [
      "src/components/CreateTentDialog.tsx",
      "src/components/CreatePlantDialog.tsx",
    ]
      .map((p) => fs.readFileSync(path.resolve(root, p), "utf8"))
      .join("\n");
    expect(dialogs).not.toMatch(/functions\.invoke|service_role|device[-_ ]command/i);
    expect(dialogs).not.toMatch(/from\("alerts"\)|from\("action_queue/);
  });
});
