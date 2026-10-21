/**
 * #2159 (still failing after #2272 and #2278): the plant-page Quick Log Feed
 * form's "EC in" accepted -1 with no message and Save enabled. #2272 guarded
 * the older PlantQuickLog EC field; this pins the V2 sheet's feeding EC fields.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { clearTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const rpcMock = vi.fn();
const storageRemove = vi.fn().mockResolvedValue({ data: null, error: null });
const storageUpload = vi.fn();
const tableMethods = {
  insert: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: {
      from: () => ({ upload: storageUpload, remove: storageRemove }),
    },
    from: () => tableMethods,
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const writeFeedingMock = vi.fn();
vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: (...a: unknown[]) => writeFeedingMock(...a),
}));

vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));

vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));

function renderSheet(defaultTargetKey: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={true}
        onOpenChange={onOpenChange}
        defaultTargetKey={defaultTargetKey}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function clickFeed() {
  fireEvent.click(screen.getByRole("button", { name: "Feed" }));
}

function fillRequiredFeedingFields() {
  fireEvent.change(screen.getByLabelText("Nutrient line"), {
    target: { value: "veg-week-3" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 name"), {
    target: { value: "Base A" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 amount"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Applied volume (ml)"), {
    target: { value: "750" },
  });
}

function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  clearLocalStorageForTest();
  clearTemperatureUnitPreference();
  rpcMock.mockReset();
  storageRemove.mockReset();
  storageUpload.mockReset();
  tableMethods.insert.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  writeFeedingMock.mockReset();
});

const READY = "Ready to save when this log matches what happened.";

function openOptionalMetrics() {
  fireEvent.click(screen.getByText("Optional metrics"));
}

function typeAndTab(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
}

const saveButton = () => screen.getByRole("button", { name: "Save" });
const saveHelper = () => document.getElementById("qlv2-save-helper");

describe("QuickLogV2Sheet — feeding EC cannot be negative (#2159)", () => {
  it("names a negative EC in under the field, blocks Save and says why in the footer", () => {
    renderSheet("plant:plant-1");
    clickFeed();
    fillRequiredFeedingFields();
    openOptionalMetrics();
    expect(saveButton()).toBeEnabled();
    const input = typeAndTab("EC in", "-1");
    const error = screen.getByTestId("qlv2-feed-ec-in-error");
    expect(error).toHaveTextContent("EC can't be negative.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("qlv2-feed-ec-in-error");
    expect(saveButton()).toBeDisabled();
    expect(saveHelper()).toHaveTextContent("EC can't be negative.");
    expect(saveHelper()).not.toHaveTextContent(READY);
    clickSave();
    expect(writeFeedingMock).not.toHaveBeenCalled();
  });

  it.each([
    ["EC out", "qlv2-feed-ec-out-error", "Output EC can't be negative."],
    ["Runoff EC", "qlv2-feed-runoff-ec-error", "Runoff EC can't be negative."],
  ])("guards %s the same way", (label, testId, message) => {
    renderSheet("plant:plant-1");
    clickFeed();
    fillRequiredFeedingFields();
    typeAndTab(label, "-0.5");
    expect(screen.getByTestId(testId)).toHaveTextContent(message);
    expect(saveButton()).toBeDisabled();
  });

  it("clears the message and re-enables Save once the EC is corrected", () => {
    renderSheet("plant:plant-1");
    clickFeed();
    fillRequiredFeedingFields();
    typeAndTab("EC in", "-1");
    expect(saveButton()).toBeDisabled();
    const input = typeAndTab("EC in", "1.2");
    expect(screen.queryByTestId("qlv2-feed-ec-in-error")).toBeNull();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(saveButton()).toBeEnabled();
    expect(saveHelper()).toHaveTextContent(READY);
  });

  it.each([
    ["0", 0],
    ["1.2", 1.2],
    ["", undefined],
  ])("still saves EC in %j", async (typed, saved) => {
    writeFeedingMock.mockResolvedValue({ ok: true, eventId: "evt-ec", reused: false });
    renderSheet("plant:plant-1");
    clickFeed();
    fillRequiredFeedingFields();
    typeAndTab("EC in", typed);
    expect(screen.queryByTestId("qlv2-feed-ec-in-error")).toBeNull();
    expect(saveButton()).toBeEnabled();
    clickSave();
    await waitFor(() => expect(writeFeedingMock).toHaveBeenCalledTimes(1));
    expect(writeFeedingMock.mock.calls[0][0].ec_in).toBe(saved);
  });
});
