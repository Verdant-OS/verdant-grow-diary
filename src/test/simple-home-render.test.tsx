/**
 * Simple home — rendered behaviour.
 *
 * The big button opens Quick Log with no preselected target; a plant row's own
 * button opens it on that plant (explicit, never remembered). Recent entries
 * link to their own Timeline anchor and refresh after a confirmed save. Setup,
 * error and loading states are honest and recoverable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const GROW = "11111111-1111-4111-8111-111111111111";
const TENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const growsState = vi.hoisted(() => ({
  grows: [{ id: "11111111-1111-4111-8111-111111111111", name: "Grow one" }] as {
    id: string;
    name: string;
  }[],
  loading: false,
  error: null as string | null,
  activeGrowId: null as string | null,
  refresh: vi.fn(async () => {}),
}));
const tentsQuery = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  data: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Veg tent",
      brand: "",
      size: "",
      stage: "veg",
      light: { on: true, schedule: "", wattage: 0 },
      alertCount: 0,
      growId: "11111111-1111-4111-8111-111111111111",
    },
  ] as unknown[] | undefined,
  refetch: vi.fn(),
}));
const plantsQuery = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  data: [
    {
      id: "p1",
      name: "Bertha",
      strain: "Blue Dream",
      tentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      stage: "veg",
      startedAt: "2026-10-01",
      health: "unknown",
      photo: "",
      lastNote: "",
      growId: "11111111-1111-4111-8111-111111111111",
    },
    {
      id: "p2",
      name: "Agnes",
      strain: "GG4",
      tentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      stage: "flower",
      startedAt: "2026-10-01",
      health: "unknown",
      photo: "",
      lastNote: "",
      growId: "11111111-1111-4111-8111-111111111111",
    },
  ] as unknown[] | undefined,
  refetch: vi.fn(),
}));
const PLANTS_DEFAULT = JSON.stringify(plantsQuery.data);
const scoped = vi.hoisted(() => ({
  recent: { status: "ok", items: [] as unknown[] } as Record<string, unknown>,
  reload: vi.fn(async () => {}),
}));
const sheetProps = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
const entitlements = vi.hoisted(() => ({
  loading: false,
  lookupFailed: false,
  maxActiveGrows: 1 as number | null,
}));
const rename = vi.hoisted(() => ({ renameGrow: vi.fn() }));
const viewPreference = vi.hoisted(() => ({
  view: "simple",
  source: "default",
  explicit: false,
  status: "ready",
  save: { kind: "idle" },
  setView: vi.fn(async () => true),
  retryRead: vi.fn(async () => {}),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1", user_metadata: {} }, loading: false, signOut: vi.fn() }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: growsState.grows,
    loading: growsState.loading,
    error: growsState.error,
    activeGrowId: growsState.activeGrowId,
    activeGrow: null,
    setActiveGrowId: vi.fn(),
    refresh: growsState.refresh,
  }),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => tentsQuery,
  useGrowPlants: () => plantsQuery,
}));
vi.mock("@/hooks/useDashboardScopedData", () => ({
  useDashboardScopedData: () => ({
    recent: scoped.recent,
    pending: { status: "idle" },
    reload: scoped.reload,
  }),
}));
const guidance = vi.hoisted(() => ({
  state: { tips: "on", notices: {} as Record<string, unknown> },
  status: "ready",
  save: { kind: "idle" },
  act: vi.fn(async () => true),
  setTips: vi.fn(async () => true),
  restoreAll: vi.fn(async () => true),
  retryRead: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useGuidance", () => ({
  useGuidance: () => guidance,
}));
vi.mock("@/hooks/useUiViewPreference", () => ({
  useUiViewPreference: () => viewPreference,
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: entitlements.loading,
    lookupFailed: entitlements.lookupFailed,
    entitlement: { capabilities: { maxActiveGrows: entitlements.maxActiveGrows } },
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/growRenameService", () => ({
  renameGrow: (...args: unknown[]) => rename.renameGrow(...args),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/components/PublicQuickLogHandoffCard", () => ({
  default: () => <div data-testid="public-quick-log-handoff-stub" />,
}));
vi.mock("@/components/QuickLogV2Sheet", () => ({
  default: (props: Record<string, unknown>) => {
    sheetProps.calls.push(props);
    return props.open ? (
      <div
        data-testid="qlv2-stub"
        data-target={String(props.defaultTargetKey)}
        data-action={String(props.defaultAction)}
      />
    ) : null;
  },
}));

import SimpleHome from "@/pages/SimpleHome";

function renderHome(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SimpleHome />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  growsState.grows = [{ id: GROW, name: "Grow one" }];
  growsState.loading = false;
  growsState.error = null;
  growsState.activeGrowId = null;
  tentsQuery.isPending = false;
  tentsQuery.isError = false;
  tentsQuery.data = [
    {
      id: TENT,
      name: "Veg tent",
      brand: "",
      size: "",
      stage: "veg",
      light: { on: true, schedule: "", wattage: 0 },
      alertCount: 0,
      growId: GROW,
    },
  ];
  plantsQuery.isPending = false;
  plantsQuery.isError = false;
  plantsQuery.data = JSON.parse(PLANTS_DEFAULT) as unknown[];
  scoped.recent = { status: "ok", items: [] };
  scoped.reload.mockClear();
  growsState.refresh.mockClear();
  tentsQuery.refetch.mockClear();
  plantsQuery.refetch.mockClear();
  sheetProps.calls.length = 0;
  entitlements.loading = false;
  entitlements.lookupFailed = false;
  entitlements.maxActiveGrows = 1;
  rename.renameGrow.mockReset();
  guidance.state = { tips: "on", notices: {} };
  guidance.status = "ready";
  guidance.act.mockClear();
});

afterEach(() => cleanup());

describe("SimpleHome — ready", () => {
  it("lists plants with tent context and marks the surface ready", () => {
    renderHome();
    expect(screen.getByTestId("simple-home")).toHaveAttribute("data-simple-home-state", "ready");
    expect(screen.getByTestId("dashboard-ready")).toBeInTheDocument();
    const rows = screen.getAllByTestId("simple-home-plant");
    expect(rows).toHaveLength(2);
    // Deterministic order: Agnes before Bertha.
    expect(rows[0]).toHaveAttribute("data-plant-id", "p2");
    expect(within(rows[0]).getByRole("link", { name: "Agnes" })).toHaveAttribute(
      "href",
      `/plants/p2?tentId=${TENT}`,
    );
    expect(within(rows[0]).getByRole("link", { name: "in Veg tent" })).toHaveAttribute(
      "href",
      `/tents/${TENT}`,
    );
    expect(screen.getByText(/Working in Grow one/)).toBeInTheDocument();
  });

  it("the big button opens Quick Log with no preselected target", () => {
    renderHome();
    expect(screen.queryByTestId("qlv2-stub")).toBeNull();
    fireEvent.click(screen.getByTestId("simple-home-add-observation"));
    const stub = screen.getByTestId("qlv2-stub");
    expect(stub).toHaveAttribute("data-target", "null");
    expect(stub).toHaveAttribute("data-action", "note");
  });

  it("a plant row's own button opens Quick Log on exactly that plant", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Add an observation for Bertha" }));
    expect(screen.getByTestId("qlv2-stub")).toHaveAttribute("data-target", "plant:p1");
  });

  it("tentless plants stay loggable instead of hiding behind an Add a tent card", () => {
    tentsQuery.data = [];
    plantsQuery.data = [{ ...(plantsQuery.data![0] as Record<string, unknown>), tentId: null }];
    renderHome();
    expect(screen.getByTestId("simple-home")).toHaveAttribute("data-simple-home-state", "ready");
    expect(screen.queryByTestId("simple-home-no-tent")).toBeNull();
    expect(screen.getByText("Tent not set")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add an observation for Bertha" }));
    expect(screen.getByTestId("qlv2-stub")).toHaveAttribute("data-target", "plant:p1");
  });

  it("a legacy plant with no grow of its own shows the repair link, not a Quick Log button", () => {
    plantsQuery.data = [
      { ...(plantsQuery.data![0] as Record<string, unknown>), growId: null },
      plantsQuery.data![1],
    ];
    renderHome();
    const rows = screen.getAllByTestId("simple-home-plant");
    expect(rows).toHaveLength(2);
    const legacy = rows.find((row) => row.getAttribute("data-plant-id") === "p1")!;
    expect(within(legacy).queryByTestId("simple-home-plant-log")).toBeNull();
    expect(
      within(legacy).getByRole("link", { name: /Link to a grow before logging/ }),
    ).toHaveAttribute("href", `/plants/p1?tentId=${TENT}`);
    expect(screen.getAllByTestId("simple-home-plant-log")).toHaveLength(1);
  });

  it("offers a saved public Quick Log draft for review, in the ready and the setup states", () => {
    renderHome();
    expect(screen.getByTestId("public-quick-log-handoff-stub")).toBeInTheDocument();
    cleanup();
    tentsQuery.data = [];
    plantsQuery.data = [];
    renderHome();
    expect(screen.getByTestId("simple-home-no-tent")).toBeInTheDocument();
    expect(screen.getByTestId("public-quick-log-handoff-stub")).toBeInTheDocument();
  });

  it("closing the sheet clears the launch target so nothing is remembered", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Add an observation for Bertha" }));
    const last = sheetProps.calls[sheetProps.calls.length - 1];
    act(() => {
      (last.onOpenChange as (v: boolean) => void)(false);
    });
    fireEvent.click(screen.getByTestId("simple-home-add-observation"));
    expect(screen.getByTestId("qlv2-stub")).toHaveAttribute("data-target", "null");
  });

  it("renders recent entries with a link to the saved entry's Timeline anchor", () => {
    scoped.recent = {
      status: "ok",
      items: [
        {
          id: "grow-event-ge1",
          kind: "diary",
          ts: new Date().toISOString(),
          title: "Quick log (Note)",
          detail: "Leaves perky",
        },
        {
          id: "event-1",
          kind: "action_event",
          ts: new Date().toISOString(),
          title: "approved",
          href: "/actions/1",
        },
      ],
    };
    renderHome();
    const links = screen.getAllByTestId("simple-home-recent-open");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", `/timeline?growId=${GROW}#timeline-entry-ge1`);
    expect(screen.getByText("Leaves perky")).toBeInTheDocument();
    expect(screen.getByTestId("simple-home-view-timeline")).toHaveAttribute(
      "href",
      `/timeline?growId=${GROW}`,
    );
  });

  it("with no observations yet, one tip offers the first observation and acts through the hook", async () => {
    renderHome();
    const tip = screen.getByTestId("simple-home-tip");
    expect(tip).toHaveAttribute("data-step-id", "first-observation");
    fireEvent.click(within(tip).getByRole("button", { name: "Add an observation" }));
    expect(screen.getByTestId("qlv2-stub")).toHaveAttribute("data-target", "null");
    fireEvent.click(screen.getByTestId("simple-home-tip-dismiss"));
    await waitFor(() => expect(guidance.act).toHaveBeenCalledWith("first-observation", "dismiss"));
  });

  it("no tip while the tips read is pending or failed, or with tips off; What next? stays", () => {
    for (const setup of [
      () => (guidance.status = "loading"),
      () => (guidance.status = "unavailable"),
      () => (guidance.state = { tips: "off", notices: {} }),
    ]) {
      setup();
      renderHome();
      expect(screen.queryByTestId("simple-home-tip")).toBeNull();
      expect(screen.getByTestId("simple-home-what-next")).toBeInTheDocument();
      cleanup();
      guidance.status = "ready";
      guidance.state = { tips: "on", notices: {} };
    }
  });

  it("an unavailable recent read adds no observation tip", () => {
    scoped.recent = { status: "unavailable" };
    renderHome();
    expect(screen.queryByTestId("simple-home-tip")).toBeNull();
  });

  it("an empty recent read says so; an unavailable one offers a retry", () => {
    renderHome();
    expect(screen.getByTestId("simple-home-recent-empty")).toBeInTheDocument();
    cleanup();
    scoped.recent = { status: "unavailable" };
    renderHome();
    fireEvent.click(
      within(screen.getByTestId("simple-home-recent-unavailable")).getByRole("button", {
        name: "Try again",
      }),
    );
    expect(scoped.reload).toHaveBeenCalledTimes(1);
  });

  it("reloads recent entries after a confirmed save event", () => {
    renderHome();
    window.dispatchEvent(new Event("verdant:entry-created"));
    expect(scoped.reload).toHaveBeenCalledTimes(1);
  });

  it("offers the Advanced view switch and writes through the preference setter", async () => {
    renderHome();
    await act(async () => {
      fireEvent.click(screen.getByTestId("ui-view-switch-to-advanced"));
    });
    await waitFor(() => expect(viewPreference.setView).toHaveBeenCalledWith("advanced"));
  });
});

describe("SimpleHome — setup, loading and error states", () => {
  it("no grow leads into the existing setup flow, not an invented record", () => {
    growsState.grows = [];
    renderHome();
    expect(screen.getByTestId("simple-home-no-grow-cta")).toHaveAttribute("href", "/start-room");
    expect(screen.queryByTestId("simple-home-add-observation")).toBeNull();
    expect(screen.queryByTestId("dashboard-ready")).toBeNull();
  });

  it("several grows with no selection asks which one", () => {
    growsState.grows = [
      { id: GROW, name: "Grow one" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Grow two" },
    ];
    renderHome();
    expect(screen.getByTestId("simple-home-choose-grow")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Grow two/ })).toHaveAttribute(
      "href",
      "/?growId=22222222-2222-4222-8222-222222222222",
    );
  });

  it("a URL grow scope the grower owns selects that grow", () => {
    growsState.grows = [
      { id: GROW, name: "Grow one" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Grow two" },
    ];
    renderHome(`/?growId=${GROW}`);
    expect(screen.getByTestId("simple-home")).toHaveAttribute("data-simple-home-state", "ready");
  });

  it("no tent and no plant each resume the existing setup flow, with the plain page second", () => {
    tentsQuery.data = [];
    plantsQuery.data = [];
    renderHome();
    expect(screen.getByTestId("simple-home-no-tent")).toHaveAttribute(
      "data-setup-kind",
      "continue",
    );
    expect(screen.getByTestId("simple-home-no-tent-step-grow")).toHaveAttribute(
      "data-done",
      "true",
    );
    expect(screen.getByTestId("simple-home-no-tent-cta")).toHaveAttribute("href", "/start-room");
    expect(screen.getByTestId("simple-home-no-tent-secondary")).toHaveAttribute(
      "href",
      `/tents?growId=${GROW}`,
    );
    expect(screen.getByTestId("simple-home-no-tent-allowance")).toHaveTextContent(
      "“Grow one” is it",
    );
    cleanup();
    tentsQuery.data = [
      {
        id: TENT,
        name: "Veg tent",
        brand: "",
        size: "",
        stage: "veg",
        light: { on: true, schedule: "", wattage: 0 },
        alertCount: 0,
        growId: GROW,
      },
    ];
    plantsQuery.data = [];
    renderHome();
    expect(screen.getByTestId("simple-home-no-plant-step-tent")).toHaveAttribute(
      "data-done",
      "true",
    );
    expect(screen.getByTestId("simple-home-no-plant-cta")).toHaveAttribute("href", "/start-room");
    expect(screen.getByTestId("simple-home-no-plant-secondary")).toHaveAttribute(
      "href",
      `/plants?growId=${GROW}`,
    );
  });

  it("with several grows the setup card sends to the scoped plain page, not the wizard", () => {
    growsState.grows = [
      { id: GROW, name: "Grow one" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Grow two" },
    ];
    growsState.activeGrowId = GROW;
    tentsQuery.data = [];
    plantsQuery.data = [];
    renderHome();
    expect(screen.getByTestId("simple-home-no-tent-cta")).toHaveAttribute(
      "href",
      `/tents?growId=${GROW}`,
    );
    expect(screen.queryByTestId("simple-home-no-tent-secondary")).toBeNull();
    expect(screen.queryByTestId("simple-home-no-tent-rename")).toBeNull();
  });

  it("an unknown plan makes no allowance claim; the no-grow card says nothing is created by visiting", () => {
    entitlements.lookupFailed = true;
    growsState.grows = [];
    renderHome();
    expect(screen.getByTestId("simple-home-no-grow")).toHaveAttribute("data-setup-kind", "start");
    expect(screen.queryByTestId("simple-home-no-grow-allowance")).toBeNull();
    expect(screen.getByTestId("simple-home-no-grow")).toHaveTextContent(
      /Nothing is created by visiting this page/,
    );
    expect(screen.getByTestId("simple-home-no-grow-cta")).toHaveAttribute("href", "/start-room");
  });

  it("renaming the one existing grow writes through the service and refreshes the grows read", async () => {
    tentsQuery.data = [];
    plantsQuery.data = [];
    rename.renameGrow.mockResolvedValue({ ok: true, name: "Veg room" });
    renderHome();
    fireEvent.click(screen.getByTestId("simple-home-no-tent-rename-toggle"));
    fireEvent.change(screen.getByTestId("simple-home-no-tent-rename-input"), {
      target: { value: "Veg room" },
    });
    fireEvent.click(screen.getByTestId("simple-home-no-tent-rename-save"));
    await waitFor(() => expect(growsState.refresh).toHaveBeenCalledTimes(1));
    expect(rename.renameGrow).toHaveBeenCalledWith(GROW, "Veg room");
  });

  it("loading never reads as empty", () => {
    growsState.loading = true;
    renderHome();
    expect(screen.getByTestId("simple-home-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("simple-home-no-grow")).toBeNull();
    cleanup();
    growsState.loading = false;
    plantsQuery.isPending = true;
    renderHome();
    expect(screen.getByTestId("simple-home-loading")).toHaveTextContent(/plants/i);
    expect(screen.queryByTestId("simple-home-no-plant")).toBeNull();
  });

  it("read errors are errors with a working retry", () => {
    growsState.error = "grows-read-failed";
    renderHome();
    fireEvent.click(screen.getByTestId("simple-home-grows-error-retry"));
    expect(growsState.refresh).toHaveBeenCalledTimes(1);
    cleanup();
    growsState.error = null;
    tentsQuery.isError = true;
    renderHome();
    fireEvent.click(screen.getByTestId("simple-home-tents-error-retry"));
    expect(tentsQuery.refetch).toHaveBeenCalledTimes(1);
    cleanup();
    tentsQuery.isError = false;
    plantsQuery.isError = true;
    renderHome();
    fireEvent.click(screen.getByTestId("simple-home-plants-error-retry"));
    expect(plantsQuery.refetch).toHaveBeenCalledTimes(1);
  });
});
