import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import type { ManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";

const mocks = vi.hoisted(() => ({
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rpc: vi.fn(),
  batch: vi.fn(),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: mocks.owner } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/useInsertSensorReadings", () => ({
  useInsertSensorReadings: () => ({ mutateAsync: mocks.batch, isPending: false }),
}));
vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useInsertManualSnapshotEdit", () => ({
  insertManualSnapshotEdit: vi.fn(),
  useInsertManualSnapshotEdit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/insertManualSensorReadingReturningId", () => ({
  insertManualSensorReadingReturningId: vi.fn(),
}));

import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import { createManualCorrectionJournal } from "@/lib/manualSensorCorrectionPendingStore";
import { decodeManualCorrectionHash } from "@/lib/manualSensorCorrectionContext";
import { getPendingCorrectionRecovery } from "@/lib/manualSensorCorrectionRecoveryRules";
import {
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherTent = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const observedAt = "2026-09-16T08:00:00.000Z";
function pendingOperation(): ManualCorrectionOperation {
  const result = buildManualCorrectionOperation({
    operationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    correction: {
      tentId,
      originalCapturedAt: observedAt,
      originalReadingIds: {
        temperature_c: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        humidity_pct: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
      originalValues: { temperature_c: 24, humidity_pct: 55 },
    },
    metrics: [
      { metric: "temperature_c", value: 26 },
      { metric: "humidity_pct", value: 60 },
    ],
  });
  if (!result.ok) throw new Error("invalid correction fixture");
  return result.operation;
}

function Harness() {
  const location = useLocation();
  return (
    <ManualSensorReadingCard
      tents={[
        { id: tentId, name: "Original tent" },
        { id: otherTent, name: "Other tent" },
      ]}
      defaultTentId={new URLSearchParams(location.search).get("tentId") ?? otherTent}
      correction={decodeManualCorrectionHash(location.hash)}
    />
  );
}

function mount(entry = "/sensors?tentId=" + otherTent) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness />
    </MemoryRouter>,
  );
}

function correctionRecoveryHref() {
  const recovery = getPendingCorrectionRecovery(
    createManualCorrectionJournal().read(mocks.owner),
    [tentId, otherTent],
    null,
  );
  if (recovery.status !== "available") throw new Error("expected pending correction recovery link");
  return recovery.href;
}

/** Deep-link with a stale tentId query but the correction hash already present. */
function wrongTentCorrectionRecoveryHref() {
  const url = new URL(correctionRecoveryHref(), "https://example.invalid");
  url.searchParams.set("tentId", otherTent);
  return `${url.pathname}${url.search}${url.hash}`;
}

beforeEach(() => {
  sessionStorage.clear();
  removeLocalStorageItemForTest("verdant:temperatureUnit");
  vi.clearAllMocks();
  mocks.owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  expect(createManualCorrectionJournal().claim(mocks.owner, pendingOperation()).status).toBe(
    "claimed",
  );
});
afterEach(cleanup);

describe("correction recovery under default Fahrenheit preference", () => {
  it("reopens canonical 26°C as digits 26 with C active, not 78.8°F", async () => {
    const view = mount();
    fireEvent.click(view.getByRole("link", { name: "Reopen pending correction" }));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-correction-banner")).toBeInTheDocument(),
    );
    const airTemp = view.container.querySelector("#m-air-temp") as HTMLInputElement;
    expect(airTemp.value).toBe("26");
    expect(airTemp.value).not.toBe("78.8");
    expect(view.getByTestId("manual-reading-temp-unit-C")).toHaveAttribute("aria-pressed", "true");
    expect(view.getByTestId("manual-reading-temp-unit-F")).toHaveAttribute("aria-pressed", "false");
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(60);
    expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
  });

  it("auto-retargets to the correction tent and keeps 26°C when tentId query is stale", async () => {
    setLocalStorageItemForTest("verdant:temperatureUnit", "fahrenheit");
    const view = mount(wrongTentCorrectionRecoveryHref());
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-correction-banner")).toBeInTheDocument(),
    );
    const airTemp = view.container.querySelector("#m-air-temp") as HTMLInputElement;
    expect(airTemp.value).toBe("26");
    expect(airTemp.value).not.toBe("78.8");
    expect(view.getByTestId("manual-reading-temp-unit-C")).toHaveAttribute("aria-pressed", "true");
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(60);
  });

  it("prefills canonical Celsius digits when the correction hash is already in the URL", async () => {
    const view = mount(correctionRecoveryHref());
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-correction-banner")).toBeInTheDocument(),
    );
    const airTemp = view.container.querySelector("#m-air-temp") as HTMLInputElement;
    expect(airTemp.value).toBe("26");
    expect(airTemp.value).not.toBe("78.8");
    expect(view.getByTestId("manual-reading-temp-unit-C")).toHaveAttribute("aria-pressed", "true");
    expect(view.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
    expect(view.queryByTestId("manual-reading-pending-correction")).not.toBeInTheDocument();
  });

  it("keeps Celsius digits when the grower explicitly prefers Fahrenheit", async () => {
    setLocalStorageItemForTest("verdant:temperatureUnit", "fahrenheit");
    const view = mount();
    fireEvent.click(view.getByRole("link", { name: "Reopen pending correction" }));
    await waitFor(() =>
      expect(view.getByTestId("manual-reading-correction-banner")).toBeInTheDocument(),
    );
    const airTemp = view.container.querySelector("#m-air-temp") as HTMLInputElement;
    expect(airTemp.value).toBe("26");
    expect(view.getByTestId("manual-reading-temp-unit-C")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps Celsius digits when Restore pending correction reruns on the same identity", async () => {
    const view = mount();
    fireEvent.click(view.getByRole("link", { name: "Reopen pending correction" }));
    await waitFor(() =>
      expect(view.getByRole("button", { name: "Restore pending correction" })).toBeInTheDocument(),
    );
    fireEvent.click(view.getByTestId("manual-reading-temp-unit-F"));
    expect((view.container.querySelector("#m-air-temp") as HTMLInputElement).value).toBe("78.8");
    fireEvent.click(view.getByRole("button", { name: "Restore pending correction" }));
    expect((view.container.querySelector("#m-air-temp") as HTMLInputElement).value).toBe("26");
    expect(view.getByTestId("manual-reading-temp-unit-C")).toHaveAttribute("aria-pressed", "true");
    expect(view.getByLabelText(/Humidity/i)).toHaveValue(60);
  });
});
