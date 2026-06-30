import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import EcowittBridgeStatus from "@/pages/EcowittBridgeStatus";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Stub the local forwarding status widget. It auto-fetches
// http://localhost:8787 on mount via the real `fetch` (jsdom has no
// listener), which leaves dangling promises and DOM across the 6 render
// cycles in this suite — observed as >4GB OOM in CI batch chunking even
// when run alone. The stub keeps the page render path intact while
// removing the network/effect surface that isn't under test here.
vi.mock("@/components/EcowittLocalForwardingStatusWidget", () => ({
  default: () => null,
}));

// Stub the drawer too — it pulls in Radix Dialog + report panel and
// remounts on every render in this suite. The page-level button +
// `latestReport` plumbing remain covered by the import/clear tests.
vi.mock("@/components/IngestAttemptReportDrawer", () => ({
  default: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
    expect(screen.getByTestId("stat-last-classification")).toHaveTextContent(
      /dry_run/,
    );
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
    const src = (await import("node:fs")).readFileSync(
      "src/pages/EcowittBridgeStatus.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(src).not.toMatch(/service[_-]?role/i);
    expect(src).not.toMatch(/action_queue/i);
  });
});

// Make beforeEach available without importing — vitest globals.
declare const beforeEach: (fn: () => void) => void;
