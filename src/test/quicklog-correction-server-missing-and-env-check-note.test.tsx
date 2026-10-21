/**
 * QA 2026-10-21 (production 05f5138d, 2/2): every Quick Log correction,
 * including a note-only "Typo", failed with "…isn't available right now…
 * Try again later." The client always calls the keyed quicklog_correct_entry
 * overload; production answers PGRST202 because that server function is not
 * there (docs/quicklog-revision-idempotent-replay-operator-runbook.md), so a
 * retry can never succeed. The copy now says so.
 *
 * Same report: an Environment Check's correction dialog showed no
 * temperature/humidity fields. For a check whose readings live only in
 * details.environment_check, the correction RPC rejects sensor changes
 * (20261014210000 → "unsupported_change"), so fields could never save. The
 * dialog now explains instead of silently omitting them.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  QUICKLOG_CORRECTION_ENVIRONMENT_CHECK_READINGS_NOTE,
  quickLogCorrectionEnvironmentCheckReadingsNote,
  quickLogRevisionFailureCopy,
} from "@/lib/quick-log/quickLogRevisionRules";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-a" } }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: [{ id: "plant-a", name: "Plant A" }], error: null }),
      };
      return query;
    },
  },
}));

import QuickLogEntryIntegrityControls from "@/components/QuickLogEntryIntegrityControls";

const ENV_CHECK_ONLY = {
  event_type: "environment_check",
  linked_grow_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  environment_check: { checkType: "airflow", temp_c: 24.5, humidity_pct: 58 },
};

function mount(props: Partial<Parameters<typeof QuickLogEntryIntegrityControls>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const changed = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <QuickLogEntryIntegrityControls
        handle={{ growEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }}
        currentNote="Original"
        currentPlantId="plant-a"
        onChanged={changed}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { changed };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReset();
});

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});

describe("missing correction server function", () => {
  it("says retrying won't help, and that nothing changed", () => {
    const copy = quickLogRevisionFailureCopy("rpc_unavailable");
    expect(copy).toBe(
      "Correcting or retracting entries isn't set up on the server yet. Nothing was changed. Trying again won't help until the server is updated.",
    );
    expect(copy).not.toMatch(/try again later/i);
  });

  it("shows that copy for a note-only Typo correction answered with PGRST202, and writes nothing", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.quicklog_correct_entry",
      },
    });
    const { changed } = mount();
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    fireEvent.click(screen.getByTestId("quicklog-correct-reason-typo"));
    fireEvent.change(screen.getByTestId("quicklog-correct-note-input"), {
      target: { value: "Corrected note" },
    });
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));

    const alert = await within(screen.getByTestId("quicklog-entry-correct-dialog")).findByRole(
      "alert",
    );
    expect(alert).toHaveTextContent("isn't set up on the server yet");
    expect(alert).toHaveTextContent("Trying again won't help until the server is updated.");
    expect(alert).not.toHaveTextContent("Try again later");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("leaves other failure copy unchanged", () => {
    expect(quickLogRevisionFailureCopy("rpc_error")).toBe(
      "We could not confirm whether this change saved. Try again to confirm the same change.",
    );
    expect(quickLogRevisionFailureCopy("unsupported_change")).toBe(
      "That change is not supported for this entry.",
    );
  });
});

describe("Environment Check readings note", () => {
  it("explains readings that live only in details.environment_check", () => {
    expect(quickLogCorrectionEnvironmentCheckReadingsNote(ENV_CHECK_ONLY)).toBe(
      "Temperature and humidity on this Environment check can't be corrected yet. You can still correct the note, time, or plant.",
    );
  });

  it("is null when the check also carries a sensor snapshot the RPC can correct", () => {
    expect(
      quickLogCorrectionEnvironmentCheckReadingsNote({
        ...ENV_CHECK_ONLY,
        sensor_snapshot: { temperature_c: 24.5, humidity_pct: 58 },
      }),
    ).toBeNull();
  });

  it("is null for a check with no recorded readings, other entries, and bad input", () => {
    expect(
      quickLogCorrectionEnvironmentCheckReadingsNote({
        event_type: "environment_check",
        environment_check: { checkType: "smell" },
      }),
    ).toBeNull();
    expect(
      quickLogCorrectionEnvironmentCheckReadingsNote({ event_type: "watering", watering: {} }),
    ).toBeNull();
    expect(quickLogCorrectionEnvironmentCheckReadingsNote(null)).toBeNull();
    expect(quickLogCorrectionEnvironmentCheckReadingsNote("x")).toBeNull();
  });

  it("renders the note in the correction dialog instead of absent fields", () => {
    mount({
      readingsNote: quickLogCorrectionEnvironmentCheckReadingsNote(ENV_CHECK_ONLY),
      correctionValues: null,
    });
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect(screen.getByTestId("quicklog-correct-readings-note")).toHaveTextContent(
      QUICKLOG_CORRECTION_ENVIRONMENT_CHECK_READINGS_NOTE,
    );
    expect(screen.queryByTestId("quicklog-correct-temperature-input")).toBeNull();
  });

  it("does not show the note where sensor fields are offered", () => {
    mount({
      readingsNote: QUICKLOG_CORRECTION_ENVIRONMENT_CHECK_READINGS_NOTE,
      correctionValues: { kind: "sensor", sensor: { temperature_c: 24.5, humidity_pct: 58 } },
    });
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect(screen.getByTestId("quicklog-correct-temperature-input")).toBeInTheDocument();
    expect(screen.queryByTestId("quicklog-correct-readings-note")).toBeNull();
  });
});
