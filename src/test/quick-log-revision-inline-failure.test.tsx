import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quickLogRevisionFailureCopy } from "@/lib/quick-log/quickLogRevisionRules";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  owner: "owner-a" as string | null,
  success: vi.fn(),
  error: vi.fn(),
  plants: [{ id: "plant-a", name: "Plant A" }],
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mocks.owner ? { id: mocks.owner } : null }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: mocks.plants, error: null }),
      };
      return query;
    },
  },
}));

import QuickLogEntryIntegrityControls from "@/components/QuickLogEntryIntegrityControls";

type Kind = "correction" | "retraction";

const UNAVAILABLE_COPY = quickLogRevisionFailureCopy("rpc_unavailable");
const AMBIGUOUS_COPY = quickLogRevisionFailureCopy("rpc_error");

const receipt = {
  data: {
    ok: true,
    revision_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    revision_no: 1,
    grow_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    diary_entry_ids: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
  },
  error: null,
};

const unavailable = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the function public.quicklog_correct_entry" },
};

const ambiguous = {
  data: null,
  error: { code: "08006", message: "connection failure" },
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const changed = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <QuickLogEntryIntegrityControls
        handle={{ growEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }}
        currentNote="Original"
        currentPlantId="plant-a"
        onChanged={changed}
      />
    </QueryClientProvider>,
  );
  return { ...view, changed };
}

function openAndSubmit(kind: Kind) {
  if (kind === "correction") {
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    fireEvent.click(screen.getByTestId("quicklog-correct-reason-typo"));
    fireEvent.change(screen.getByTestId("quicklog-correct-note-input"), {
      target: { value: "Corrected note" },
    });
    fireEvent.change(screen.getByTestId("quicklog-correct-explain-input"), {
      target: { value: "Fixed a typo" },
    });
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    return;
  }

  fireEvent.click(screen.getByTestId("quicklog-entry-retract-button"));
  fireEvent.click(screen.getByTestId("quicklog-retract-reason-accidental"));
  fireEvent.change(screen.getByTestId("quicklog-retract-explain-input"), {
    target: { value: "Logged the wrong tent" },
  });
  fireEvent.click(screen.getByTestId("quicklog-retract-confirm"));
}

function dialogFor(kind: Kind) {
  return screen.getByTestId(
    kind === "correction" ? "quicklog-entry-correct-dialog" : "quicklog-entry-retract-dialog",
  );
}

function inlineError(kind: Kind) {
  return within(dialogFor(kind)).queryByRole("alert");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReset();
  mocks.owner = "owner-a";
  mocks.plants = [{ id: "plant-a", name: "Plant A" }];
});

async function cleanupRevisionFixture() {
  await act(async () => {
    cleanup();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(cleanupRevisionFixture);

describe("inline revision failure copy", () => {
  it.each<Kind>(["correction", "retraction"])(
    "shows the rpc_unavailable copy inside the open %s dialog and keeps the draft",
    async (kind) => {
      mocks.rpc.mockResolvedValueOnce(unavailable);
      const view = mount();
      openAndSubmit(kind);

      const alert = await within(dialogFor(kind)).findByRole("alert");
      expect(alert).toHaveTextContent(UNAVAILABLE_COPY);
      expect(alert).toHaveTextContent("Nothing was changed");
      expect(mocks.error).toHaveBeenCalledWith(UNAVAILABLE_COPY);
      expect(view.changed).not.toHaveBeenCalled();
      expect(mocks.success).not.toHaveBeenCalled();
      expect(dialogFor(kind)).toBeInTheDocument();

      if (kind === "correction") {
        expect(screen.getByTestId("quicklog-correct-note-input")).toHaveValue("Corrected note");
        expect(screen.getByTestId("quicklog-correct-explain-input")).toHaveValue("Fixed a typo");
        expect(screen.getByTestId("quicklog-correct-reason-typo")).toHaveAttribute(
          "aria-checked",
          "true",
        );
        expect(screen.getByTestId("quicklog-correct-save")).toBeEnabled();
      } else {
        expect(screen.getByTestId("quicklog-retract-explain-input")).toHaveValue(
          "Logged the wrong tent",
        );
        expect(screen.getByTestId("quicklog-retract-reason-accidental")).toHaveAttribute(
          "aria-checked",
          "true",
        );
        expect(screen.getByTestId("quicklog-retract-confirm")).toBeEnabled();
      }
    },
  );

  it("clears the correction alert when the grower edits the note", async () => {
    mocks.rpc.mockResolvedValueOnce(unavailable);
    mount();
    openAndSubmit("correction");
    await within(dialogFor("correction")).findByRole("alert");

    fireEvent.change(screen.getByTestId("quicklog-correct-note-input"), {
      target: { value: "Corrected note, revised" },
    });

    expect(inlineError("correction")).not.toBeInTheDocument();
    expect(screen.getByTestId("quicklog-correct-note-input")).toHaveValue(
      "Corrected note, revised",
    );
    expect(dialogFor("correction")).toBeInTheDocument();
  });

  it("clears the retraction alert when the grower edits the explanation", async () => {
    mocks.rpc.mockResolvedValueOnce(unavailable);
    mount();
    openAndSubmit("retraction");
    await within(dialogFor("retraction")).findByRole("alert");

    fireEvent.change(screen.getByTestId("quicklog-retract-explain-input"), {
      target: { value: "Logged the wrong tent, revised" },
    });

    expect(inlineError("retraction")).not.toBeInTheDocument();
    expect(screen.getByTestId("quicklog-retract-explain-input")).toHaveValue(
      "Logged the wrong tent, revised",
    );
    expect(dialogFor("retraction")).toBeInTheDocument();
  });

  it("clears the correction alert on retry and disables Save while the request is in flight", async () => {
    let finish!: (value: typeof unavailable) => void;
    mocks.rpc.mockResolvedValueOnce(unavailable).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    openAndSubmit("correction");
    await within(dialogFor("correction")).findByRole("alert");

    fireEvent.click(screen.getByTestId("quicklog-correct-save"));

    await waitFor(() => expect(inlineError("correction")).not.toBeInTheDocument());
    expect(screen.getByTestId("quicklog-correct-save")).toBeDisabled();
    expect(screen.getByTestId("quicklog-correct-note-input")).toHaveValue("Corrected note");

    await act(async () => finish(unavailable));
    expect(await within(dialogFor("correction")).findByRole("alert")).toHaveTextContent(
      UNAVAILABLE_COPY,
    );
    expect(screen.getByTestId("quicklog-correct-note-input")).toHaveValue("Corrected note");
  });

  it("clears the retraction alert on retry and disables confirm while the request is in flight", async () => {
    let finish!: (value: typeof unavailable) => void;
    mocks.rpc.mockResolvedValueOnce(unavailable).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    openAndSubmit("retraction");
    await within(dialogFor("retraction")).findByRole("alert");

    fireEvent.click(screen.getByTestId("quicklog-retract-confirm"));

    await waitFor(() => expect(inlineError("retraction")).not.toBeInTheDocument());
    expect(screen.getByTestId("quicklog-retract-confirm")).toBeDisabled();
    expect(screen.getByTestId("quicklog-retract-explain-input")).toHaveValue(
      "Logged the wrong tent",
    );

    await act(async () => finish(unavailable));
    expect(await within(dialogFor("retraction")).findByRole("alert")).toHaveTextContent(
      UNAVAILABLE_COPY,
    );
  });

  it.each<Kind>(["correction", "retraction"])(
    "shows the rpc_error status line inside the open %s dialog and no alert",
    async (kind) => {
      mocks.rpc.mockResolvedValueOnce(ambiguous);
      mount();
      openAndSubmit(kind);

      const dialog = dialogFor(kind);
      const status = await within(dialog).findByRole("status");
      expect(status).toHaveTextContent(AMBIGUOUS_COPY);
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
      expect(mocks.error).toHaveBeenCalledWith(AMBIGUOUS_COPY);
      expect(dialog).toBeInTheDocument();
    },
  );

  it.each<Kind>(["correction", "retraction"])(
    "clears the %s alert when the dialog closes",
    async (kind) => {
      mocks.rpc.mockResolvedValueOnce(unavailable);
      mount();
      openAndSubmit(kind);
      await within(dialogFor(kind)).findByRole("alert");

      fireEvent.click(
        screen.getByTestId(
          kind === "correction" ? "quicklog-correct-cancel" : "quicklog-retract-cancel",
        ),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId(
            kind === "correction"
              ? "quicklog-entry-correct-dialog"
              : "quicklog-entry-retract-dialog",
          ),
        ).not.toBeInTheDocument(),
      );

      fireEvent.click(
        screen.getByTestId(
          kind === "correction" ? "quicklog-entry-correct-button" : "quicklog-entry-retract-button",
        ),
      );
      expect(inlineError(kind)).not.toBeInTheDocument();
    },
  );

  it.each<Kind>(["correction", "retraction"])(
    "leaves the %s success path unchanged",
    async (kind) => {
      mocks.rpc.mockResolvedValueOnce(receipt);
      const view = mount();
      openAndSubmit(kind);

      await waitFor(() => expect(view.changed).toHaveBeenCalledOnce());
      expect(mocks.success).toHaveBeenCalledWith(
        kind === "correction"
          ? "Entry corrected. The original stays in its history."
          : "Entry retracted. It stays in your audit trail.",
      );
      expect(mocks.error).not.toHaveBeenCalled();
      expect(
        screen.queryByTestId(
          kind === "correction" ? "quicklog-entry-correct-dialog" : "quicklog-entry-retract-dialog",
        ),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );
});
