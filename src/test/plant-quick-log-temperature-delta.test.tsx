import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const historyState = vi.hoisted(() => ({
  logs: [] as Array<{
    capturedAt: string;
    source: "manual";
    metrics: { temp_f: number };
  }>,
}));

vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: historyState.logs }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn(),
        remove: vi.fn(),
      }),
    },
    from: () => ({
      insert: vi.fn(),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import PlantQuickLog from "@/components/PlantQuickLog";

function renderQuickLog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={() => {}}
        plantId="plant-1"
        plantName="Plant 1"
        growId="grow-1"
        tentId="tent-1"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clearLocalStorageForTest();
  historyState.logs = [
    {
      capturedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      source: "manual",
      metrics: { temp_f: 75 },
    },
  ];
});

afterEach(() => {
  cleanup();
  clearLocalStorageForTest();
  historyState.logs = [];
});

describe("PlantQuickLog temperature delta display preference", () => {
  it("defaults to a Fahrenheit label and delta", () => {
    renderQuickLog();

    expect(screen.getByLabelText("Temp (°F)")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("plant-quick-log-temp"), {
      target: { value: "77" },
    });

    expect(screen.getByTestId("plant-quick-log-temp-delta")).toHaveTextContent("+2°F 2 hours ago");
  });

  it("uses the saved Celsius unit for the label and displayed delta", () => {
    setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
    renderQuickLog();

    expect(screen.getByLabelText("Temp (°C)")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("plant-quick-log-temp"), {
      target: { value: "25" },
    });

    expect(screen.getByTestId("plant-quick-log-temp-delta")).toHaveTextContent(
      "+1.1°C 2 hours ago",
    );
  });

  it("does not render a temperature delta for an empty value", () => {
    setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
    renderQuickLog();

    expect(screen.queryByTestId("plant-quick-log-temp-delta")).not.toBeInTheDocument();
  });
});
