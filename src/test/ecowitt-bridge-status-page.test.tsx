import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import EcowittBridgeStatus from "@/pages/EcowittBridgeStatus";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

// IMPORTANT: return a STABLE object/toast identity. The real useToast hook
// memoizes `toast`; a mock that returns a fresh `{ toast: vi.fn() }` on every
// call makes `toast` change each render, which recreates the auto-refresh
// `useCallback` in EcowittLocalForwardingStatusWidget, which re-fires its mount
// `useEffect([autoFetch, refresh])` every render. Because those re-renders hop
// across the `await fetch` task boundary, React's max-update-depth guard never
// trips, so the loop is unbounded and OOMs the worker (the CI full-suite shard
// heap-limit crash). Keeping the identity stable makes the effect run once.
const { toastApi } = vi.hoisted(() => ({ toastApi: { toast: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => toastApi,
}));

function renderPage() {
  return render(
    <BrowserRouter>
      <EcowittBridgeStatus />
    </BrowserRouter>,
  );
}

const VALID_REPORT = JSON.stringify({
  status: "dry_run",
  classification: "dry_run",
  http_status: null,
  reasons: [],
  url: "https://example/functions/v1/sensor-ingest-webhook",
  tent_id: "00000000-0000-4000-8000-000000000000",
  plant_id: null,
  metric_keys: ["temp_f", "humidity_pct"],
  auth: "Bearer vbt_…(redacted, len=20)",
  transport: "mqtt_local_bridge",
  topic: "ecowitt/grow",
  note: "Nothing was stored",
});

describe("EcowittBridgeStatus page", () => {
  beforeEach(() => {
    clearLocalStorageForTest();
  });

  it("renders empty state when no attempts exist", () => {
    renderPage();
    expect(screen.getByTestId("ecowitt-bridge-status-empty")).toHaveTextContent(
      /No Ecowitt bridge attempts/i,
    );
  });

  it("renders trust example samples", () => {
    renderPage();
    expect(screen.getByTestId("ecowitt-trust-sample-accepted")).toBeInTheDocument();
    expect(screen.getByTestId("ecowitt-trust-sample-stale")).toBeInTheDocument();
    expect(screen.getByTestId("ecowitt-trust-sample-invalid")).toBeInTheDocument();
  });

  it("imports a valid pasted report and updates counts", () => {
    renderPage();
    const ta = screen.getByTestId("ecowitt-bridge-paste-input") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: VALID_REPORT } });
    fireEvent.click(screen.getByTestId("ecowitt-bridge-import"));
    expect(screen.getByTestId("stat-dry-run")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-last-classification")).toHaveTextContent(/dry_run/);
  });

  it("clear action removes local diagnostics", () => {
    renderPage();
    const ta = screen.getByTestId("ecowitt-bridge-paste-input") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: VALID_REPORT } });
    fireEvent.click(screen.getByTestId("ecowitt-bridge-import"));
    fireEvent.click(screen.getByTestId("ecowitt-bridge-clear"));
    expect(screen.getByTestId("ecowitt-bridge-status-empty")).toBeInTheDocument();
  });

  it("never displays raw bridge token text", () => {
    renderPage();
    const ta = screen.getByTestId("ecowitt-bridge-paste-input") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: VALID_REPORT } });
    fireEvent.click(screen.getByTestId("ecowitt-bridge-import"));
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/vbt_[A-Za-z0-9]{8,}/);
  });

  it("does not import supabase or write helpers", async () => {
    const src = (await import("node:fs")).readFileSync("src/pages/EcowittBridgeStatus.tsx", "utf8");
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(src).not.toMatch(/service[_-]?role/i);
    expect(src).not.toMatch(/action_queue/i);
  });
});

// Make beforeEach available without importing — vitest globals.
declare const beforeEach: (fn: () => void) => void;
