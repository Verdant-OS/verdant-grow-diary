/**
 * Ingest Inspector page render tests.
 *
 * Verifies the screen renders a read-only list, redacts secrets in the
 * raw payload, never labels csv/webhook/mqtt as live, exposes filters,
 * and supports loading/empty/error states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import IngestInspector from "@/pages/IngestInspector";

type Row = {
  id: string;
  ts: string;
  captured_at: string | null;
  source: string;
  metric: string;
  value: number | null;
  quality: string | null;
  tent_id: string | null;
  device_id: string | null;
  raw_payload: unknown;
};

const NOW = "2026-06-04T10:00:00Z";

let mode: "ok" | "empty" | "error" | "loading" = "ok";
let rows: Row[] = [];

const okRows: Row[] = [
  {
    id: "r1",
    ts: NOW,
    captured_at: NOW,
    source: "webhook",
    metric: "temperature_c",
    value: 24.2,
    quality: "ok",
    tent_id: "tent-1",
    device_id: null,
    raw_payload: {
      vendor: "EcoWitt",
      token: "should-be-hidden",
      Authorization: "Bearer secret",
      user_id: "u-should-be-hidden",
      readings: { temp_c: 24.2 },
    },
  },
  {
    id: "r2",
    ts: NOW,
    captured_at: NOW,
    source: "mqtt",
    metric: "humidity_pct",
    value: 55,
    quality: "ok",
    tent_id: "tent-2",
    device_id: null,
    raw_payload: { vendor: "MQTT-Bridge" },
  },
];

vi.mock("@/integrations/supabase/client", () => {
  const makeReadingsChain = () => {
    const promise = new Promise<{ data: unknown; error: unknown }>((res, rej) => {
      if (mode === "loading") return; // never resolve
      if (mode === "error")
        return res({ data: null, error: new Error("boom") });
      res({ data: mode === "empty" ? [] : rows, error: null });
    });
    const chain: Record<string, unknown> = {
      select: () => chain,
      gte: () => chain,
      order: () => chain,
      limit: () => promise,
    };
    return chain;
  };
  const makeTentsChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () =>
        Promise.resolve({
          data: [
            { id: "tent-1", name: "Tent One" },
            { id: "tent-2", name: "Tent Two" },
          ],
          error: null,
        }),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) =>
        table === "sensor_readings" ? makeReadingsChain() : makeTentsChain(),
    },
  };
});

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/ingest-inspector"]}>
        <IngestInspector />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  mode = "ok";
  rows = [...okRows];
});

describe("IngestInspector page", () => {
  it("renders disclosure and read-only safety copy", async () => {
    renderPage();
    expect(await screen.findByText(/Read-only inspector\./)).toBeInTheDocument();
    expect(screen.getByText(/No device control\./)).toBeInTheDocument();
    expect(
      screen.getByText(/No data is modified from this screen\./),
    ).toBeInTheDocument();
  });

  it("renders captured_at, source badge, and vendor badge for rows", async () => {
    renderPage();
    const items = await screen.findAllByTestId("ingest-inspector-row");
    expect(items.length).toBe(2);
    const sourceBadges = screen.getAllByTestId("ingest-inspector-source-badge");
    expect(sourceBadges[0].textContent).toBe("Webhook");
    expect(sourceBadges[1].textContent).toBe("MQTT");
    const vendorBadges = screen.getAllByTestId("ingest-inspector-vendor-badge");
    expect(vendorBadges[0].textContent).toBe("EcoWitt");
    expect(screen.getAllByTestId("ingest-inspector-captured-at").length).toBe(
      2,
    );
  });

  it("never labels webhook/mqtt rows as Live", async () => {
    renderPage();
    await screen.findAllByTestId("ingest-inspector-row");
    const badges = screen.getAllByTestId("ingest-inspector-source-badge");
    for (const b of badges) {
      expect(b.textContent?.toLowerCase()).not.toBe("live");
    }
  });

  it("raw payload is collapsed by default and redacts secrets/user_id when opened", async () => {
    renderPage();
    await screen.findAllByTestId("ingest-inspector-row");
    expect(screen.queryByTestId("ingest-inspector-raw-payload")).toBeNull();
    fireEvent.click(screen.getAllByTestId("ingest-inspector-raw-toggle")[0]);
    const pre = await screen.findByTestId("ingest-inspector-raw-payload");
    const txt = pre.textContent ?? "";
    expect(txt).toContain("[REDACTED]");
    expect(txt).not.toContain("Bearer secret");
    expect(txt).not.toContain("should-be-hidden");
    expect(txt).not.toContain("u-should-be-hidden");
  });

  it("does not render any edit/delete/resend/replay controls", async () => {
    renderPage();
    await screen.findAllByTestId("ingest-inspector-row");
    const bannedLabels = [/^edit$/i, /^delete$/i, /resend/i, /replay/i, /save/i];
    for (const re of bannedLabels) {
      expect(screen.queryByRole("button", { name: re })).toBeNull();
    }
  });

  it("filters by source", async () => {
    renderPage();
    await screen.findAllByTestId("ingest-inspector-row");
    const trigger = screen.getByTestId("ingest-inspector-source-filter");
    fireEvent.click(trigger);
    const opt = await screen.findByRole("option", { name: "MQTT" });
    fireEvent.click(opt);
    await waitFor(() => {
      expect(screen.getAllByTestId("ingest-inspector-row").length).toBe(1);
    });
    expect(
      screen.getByTestId("ingest-inspector-source-badge").textContent,
    ).toBe("MQTT");
  });

  it("filters by vendor", async () => {
    renderPage();
    await screen.findAllByTestId("ingest-inspector-row");
    const trigger = screen.getByTestId("ingest-inspector-vendor-filter");
    fireEvent.click(trigger);
    const opt = await screen.findByRole("option", { name: "EcoWitt" });
    fireEvent.click(opt);
    await waitFor(() => {
      expect(screen.getAllByTestId("ingest-inspector-row").length).toBe(1);
    });
    expect(
      screen.getByTestId("ingest-inspector-vendor-badge").textContent,
    ).toBe("EcoWitt");
  });

  it("renders empty state when there are no rows", async () => {
    mode = "empty";
    renderPage();
    expect(
      await screen.findByText(/No recent ingest readings\./),
    ).toBeInTheDocument();
  });

  it("renders loading skeleton while query is pending", () => {
    mode = "loading";
    renderPage();
    expect(screen.getByTestId("ingest-inspector-loading")).toBeInTheDocument();
  });

  it("renders error state with retry button", async () => {
    mode = "error";
    renderPage();
    expect(
      await screen.findByTestId("ingest-inspector-error"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ingest-inspector-retry")).toBeInTheDocument();
  });

  it("never renders any user_id value in the DOM", async () => {
    renderPage();
    await screen.findAllByTestId("ingest-inspector-row");
    fireEvent.click(screen.getAllByTestId("ingest-inspector-raw-toggle")[0]);
    await screen.findByTestId("ingest-inspector-raw-payload");
    expect(document.body.textContent ?? "").not.toContain("u-should-be-hidden");
  });
});
