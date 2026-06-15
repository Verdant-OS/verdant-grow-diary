/**
 * Quick Log Environment Check form — UI integration tests.
 *
 * Verifies:
 *  - environment preset renders the Environment Check form
 *  - calm helper copy shows when no measurements entered
 *  - note-only save is allowed (no fields required to clear validation)
 *  - measurements are forwarded under details.environment_check via the
 *    EXISTING quicklog_save_manual seam (mocked)
 *  - valid EC + water temp shows read-only EC @25°C preview (tone=ok)
 *  - suspicious EC magnitude shows "Needs unit review"
 *  - preview is NOT stored as a canonical value (no `ec_25c` field on
 *    the saved envelope)
 *  - no Supabase write path, no Action Queue, no automation/device
 *    strings, no raw_payload/service_role/token leakage
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";

const saveMock = vi.fn();
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...a: unknown[]) => saveMock(...a),
    saving: false,
    error: null,
  }),
}));

const insertMock = vi.fn();
const uploadMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: insertMock,
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: uploadMock, remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Verdant Test Plant", tent_id: "tent-1", grow_id: "grow-1" },
    ],
  }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastMessage = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    message: (...a: unknown[]) => toastMessage(...a),
  },
}));

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true, eventId: "ev-1" });
  insertMock.mockReset();
  uploadMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  toastMessage.mockReset();
});

function openEnvironmentForm() {
  renderWithClient(
    <QuickLog
      open={true}
      onOpenChange={vi.fn()}
      prefill={{ plantId: "plant-1", growId: "grow-1", eventType: "environment" }}
    />,
  );
  return screen.getByRole("dialog");
}

describe("Quick Log Environment Check — preset renders the form", () => {
  it("renders Environment Check section with measurement fields", () => {
    const dialog = openEnvironmentForm();
    const section = within(dialog).getByTestId("quick-log-environment-check-section");
    expect(section).toBeInTheDocument();
    expect(within(section).getByTestId("quick-log-env-room-temp-f")).toBeInTheDocument();
    expect(within(section).getByTestId("quick-log-env-humidity")).toBeInTheDocument();
    expect(within(section).getByTestId("quick-log-env-vpd")).toBeInTheDocument();
    expect(within(section).getByTestId("quick-log-env-ec")).toBeInTheDocument();
    expect(within(section).getByTestId("quick-log-env-water-temp")).toBeInTheDocument();
    expect(within(section).getByTestId("quick-log-env-water-temp-unit")).toBeInTheDocument();
    // EC unit is labeled mS/cm (never silently uS/cm).
    expect(within(section).getByLabelText(/EC \(mS\/cm\)/i)).toBeInTheDocument();
  });

  it("shows calm helper copy when no measurement is entered", () => {
    const dialog = openEnvironmentForm();
    expect(within(dialog).getByTestId("quick-log-env-helper")).toHaveTextContent(
      "Add any measurements you have. A note alone is okay.",
    );
  });

  it("hides the EC preview until both EC and water temp are entered", () => {
    const dialog = openEnvironmentForm();
    expect(within(dialog).queryByTestId("quick-log-env-ec-preview")).toBeNull();
  });
});

describe("Quick Log Environment Check — save behavior", () => {
  it("saves with note alone (no measurements required)", async () => {
    const dialog = openEnvironmentForm();
    const ta = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "Tent feels stable today." } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.p_action).toBe("note");
    // No environment_check envelope when nothing measured.
    expect(payload.p_details).toBeNull();
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/^Saved environment check for Verdant Test Plant$/),
    );
  });

  it("forwards room temp / humidity / VPD under details.environment_check", async () => {
    const dialog = openEnvironmentForm();
    const ta = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "Reading." } });
    fireEvent.change(within(dialog).getByTestId("quick-log-env-room-temp-f"), {
      target: { value: "76" },
    });
    fireEvent.change(within(dialog).getByTestId("quick-log-env-humidity"), {
      target: { value: "55" },
    });
    fireEvent.change(within(dialog).getByTestId("quick-log-env-vpd"), {
      target: { value: "1.1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const details = (payload.p_details ?? {}) as Record<string, unknown>;
    const env = details.environment_check as Record<string, unknown>;
    expect(env).toMatchObject({
      room_temp_f: 76,
      humidity_pct: 55,
      vpd_kpa: 1.1,
    });
  });
});

describe("Quick Log Environment Check — read-only EC preview", () => {
  it("shows EC @25°C preview when EC + water temp (°F) are entered", () => {
    const dialog = openEnvironmentForm();
    fireEvent.change(within(dialog).getByTestId("quick-log-env-ec"), {
      target: { value: "1.4" },
    });
    fireEvent.change(within(dialog).getByTestId("quick-log-env-water-temp"), {
      target: { value: "68" },
    });
    const preview = within(dialog).getByTestId("quick-log-env-ec-preview");
    expect(preview).toHaveAttribute("data-tone", "ok");
    expect(preview).toHaveTextContent(/EC @25°C preview/i);
    expect(preview).toHaveTextContent(/Not stored/i);
    expect(preview).toHaveTextContent(/mS\/cm/);
  });

  it("flags suspicious EC magnitude as Needs unit review", () => {
    const dialog = openEnvironmentForm();
    fireEvent.change(within(dialog).getByTestId("quick-log-env-ec"), {
      target: { value: "9.9" }, // valid range; trigger suspicious via huge magnitude
    });
    // Force a suspicious EC by pushing it past the plausible bound.
    fireEvent.change(within(dialog).getByTestId("quick-log-env-ec"), {
      target: { value: "9" },
    });
    fireEvent.change(within(dialog).getByTestId("quick-log-env-water-temp"), {
      target: { value: "68" },
    });
    const preview = within(dialog).getByTestId("quick-log-env-ec-preview");
    expect(preview).toHaveAttribute("data-tone", "review");
    expect(preview).toHaveTextContent(/Needs unit review/i);
  });

  it("does not persist the preview as a canonical ec_25c field", async () => {
    const dialog = openEnvironmentForm();
    const ta = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "Saving EC + water temp." } });
    fireEvent.change(within(dialog).getByTestId("quick-log-env-ec"), {
      target: { value: "1.4" },
    });
    fireEvent.change(within(dialog).getByTestId("quick-log-env-water-temp"), {
      target: { value: "68" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = JSON.stringify(saveMock.mock.calls[0]?.[0] ?? {});
    expect(payload).not.toMatch(/ec_25c/i);
    expect(payload).not.toMatch(/compensated/i);
  });
});

describe("Quick Log Environment Check — safety boundary", () => {
  it("introduces no Supabase insert, upload, Action Queue, automation or relay strings", async () => {
    const dialog = openEnvironmentForm();
    const ta = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "Reading." } });
    fireEvent.change(within(dialog).getByTestId("quick-log-env-ec"), {
      target: { value: "1.4" },
    });
    fireEvent.change(within(dialog).getByTestId("quick-log-env-water-temp"), {
      target: { value: "68" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    const html = dialog.innerHTML.toLowerCase();
    expect(html).not.toContain("raw_payload");
    expect(html).not.toContain("service_role");
    expect(html).not.toContain("bearer ");
    expect(html).not.toMatch(/\baction[_-]?queue\b/);
    expect(html).not.toMatch(/\bautomation\b/);
    expect(html).not.toMatch(/\brelay\b/);
    const payload = JSON.stringify(saveMock.mock.calls[0]?.[0] ?? {});
    expect(payload).not.toMatch(/raw_payload/);
    expect(payload).not.toMatch(/service_role/);
  });
});
