import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  stageReply: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  created: vi.fn(),
  message: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    from: () => ({
      update: (...args: unknown[]) => {
        mocks.update(...args);
        const query = {
          eq: (...eqArgs: unknown[]) => {
            mocks.eq(...eqArgs);
            return query;
          },
          select: (...selectArgs: unknown[]) => {
            mocks.select(...selectArgs);
            return query;
          },
          maybeSingle: () => {
            mocks.single();
            return mocks.stageReply();
          },
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            mocks.stageReply().then(resolve, reject),
        };
        return query;
      },
    }),
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Grow One", stage: "veg" }],
    activeGrow: { id: "g1", name: "Grow One", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "Plant A", tent_id: "t1", grow_id: "g1", stage: "veg" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent One", grow_id: "g1" }] }),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.success(...args),
    error: vi.fn(),
    message: (...args: unknown[]) => mocks.message(...args),
  },
}));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));

import QuickLog from "@/components/QuickLog";
import { QUICK_LOG_GROW_STAGE_UNCONFIRMED_MESSAGE } from "@/lib/quickLogGrowStageWritebackRules";

function renderQuickLog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <QuickLog
        open
        onOpenChange={() => {}}
        onCreated={mocks.created}
        prefill={{ plantId: "p1", growId: "g1", tentId: "t1" }}
      />
    </QueryClientProvider>,
  );
}

async function submitStageChange() {
  renderQuickLog();
  const trigger = screen.getByTestId("quick-log-stage-select");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: "Flowering" }));
  fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
    target: { value: "Observed first flowers on Plant A." },
  });
  fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({
    data: { ok: true, grow_event_id: "11111111-1111-4111-8111-111111111111" },
    error: null,
  });
  mocks.stageReply.mockResolvedValue({ data: { id: "g1", stage: "flower" }, error: null });
});
afterEach(cleanup);

describe("Quick Log confirmed diary save and separate grow stage write", () => {
  it("confirms the requested grow stage and preserves the diary's selected stage", async () => {
    await submitStageChange();
    await screen.findByTestId("quick-log-post-save");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_target_type: "plant",
      p_target_id: "p1",
      p_stage: "flower",
    });
    expect(mocks.update).toHaveBeenCalledWith({ stage: "flower" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "g1");
    expect(mocks.single).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("quick-log-stage-save-unconfirmed")).not.toBeInTheDocument();
    expect(mocks.created).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.message).not.toHaveBeenCalled();
  });

  it.each([
    ["returned error", { data: null, error: { message: "Stage write denied" } }],
    ["no updated row", { data: null, error: null }],
    ["wrong grow receipt", { data: { id: "other-grow", stage: "flower" }, error: null }],
    ["wrong stage receipt", { data: { id: "g1", stage: "veg" }, error: null }],
  ])("keeps the saved entry and warns after %s", async (_label, reply) => {
    mocks.stageReply.mockResolvedValue(reply);
    await submitStageChange();
    await screen.findByTestId("quick-log-post-save");
    expect(await screen.findByTestId("quick-log-stage-save-unconfirmed")).toHaveTextContent(
      "Your log was saved, but the grow's stage update wasn't confirmed.",
    );
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_target_type: "plant",
      p_target_id: "p1",
      p_stage: "flower",
    });
    expect(screen.getByTestId("quick-log-post-save-description")).toHaveTextContent("Grow One");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.created).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("quick-log-save-error")).not.toBeInTheDocument();
    expect(mocks.message).toHaveBeenCalledWith(QUICK_LOG_GROW_STAGE_UNCONFIRMED_MESSAGE, {
      duration: 12_000,
    });
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("a thrown stage request cannot relabel the confirmed diary save as failed", async () => {
    mocks.stageReply.mockRejectedValue(new Error("Stage response lost"));
    await submitStageChange();
    expect(await screen.findByTestId("quick-log-post-save")).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-stage-save-unconfirmed")).toBeInTheDocument();
    expect(mocks.created).toHaveBeenCalledTimes(1);
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("quick-log-save-error")).not.toBeInTheDocument();
  });

  it("does not attempt stage writeback when the diary save fails", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, reason: "save_failed" }, error: null });
    await submitStageChange();
    await screen.findByTestId("quick-log-save-error");
    await waitFor(() => expect(screen.getByTestId("quick-log-save")).not.toBeDisabled());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.created).not.toHaveBeenCalled();
    expect(screen.queryByTestId("quick-log-post-save")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-stage-save-unconfirmed")).not.toBeInTheDocument();
  });

  it("keeps the partial-outcome notice when the caller unmounts the saved dialog", async () => {
    mocks.stageReply.mockResolvedValue({ data: null, error: { message: "Stage denied" } });
    mocks.created.mockImplementationOnce(() => cleanup());
    await submitStageChange();
    await waitFor(() => expect(mocks.created).toHaveBeenCalledTimes(1));
    expect(mocks.message).toHaveBeenCalledWith(QUICK_LOG_GROW_STAGE_UNCONFIRMED_MESSAGE, {
      duration: 12_000,
    });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("quick-log-post-save")).not.toBeInTheDocument();
  });

  it("clears the stage warning when the grower starts a different log", async () => {
    mocks.stageReply.mockResolvedValue({ data: null, error: { message: "Stage denied" } });
    await submitStageChange();
    await screen.findByTestId("quick-log-stage-save-unconfirmed");
    fireEvent.click(screen.getByTestId("quick-log-post-save-another"));
    expect(screen.queryByTestId("quick-log-stage-save-unconfirmed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-post-save")).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
