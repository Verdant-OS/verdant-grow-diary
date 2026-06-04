/**
 * Read-only safety + UX regression tests for the Ingest Normalizer page
 * (`/sensors/ingest-normalizer`).
 *
 * These tests assert two things in one place:
 *
 *   1. The page is strictly read-only. Across the full interaction
 *      surface — initial render, example selection, valid JSON parse,
 *      invalid JSON parse, clear — the page MUST NOT call:
 *        - global `fetch`
 *        - `XMLHttpRequest`
 *        - any Supabase client method (`from`, `rpc`, `auth`, `storage`,
 *          `functions.invoke`)
 *        - any write helper (`insert`, `update`, `upsert`, `delete`)
 *
 *   2. The Normalization Results UX shows before/after source/vendor,
 *      accepted/skipped/rejected groups, ignored unsafe fields, and an
 *      empty state before parsing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SensorsIngestNormalizer from "@/pages/SensorsIngestNormalizer";

const writeMethodSpies = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  select: vi.fn(),
}));

const supabaseSpies = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
  },
  storage: { from: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseSpies,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/sensors/ingest-normalizer"]}>
      <SensorsIngestNormalizer />
    </MemoryRouter>,
  );
}

function expectNoNetworkOrWrites(
  fetchSpy: ReturnType<typeof vi.spyOn> | null,
  xhrSpy: ReturnType<typeof vi.spyOn> | null,
) {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  expect(supabaseSpies.from).not.toHaveBeenCalled();
  expect(supabaseSpies.rpc).not.toHaveBeenCalled();
  expect(supabaseSpies.functions.invoke).not.toHaveBeenCalled();
  expect(supabaseSpies.auth.getSession).not.toHaveBeenCalled();
  expect(supabaseSpies.auth.getUser).not.toHaveBeenCalled();
  expect(supabaseSpies.auth.signInWithPassword).not.toHaveBeenCalled();
  expect(supabaseSpies.storage.from).not.toHaveBeenCalled();
  expect(writeMethodSpies.insert).not.toHaveBeenCalled();
  expect(writeMethodSpies.update).not.toHaveBeenCalled();
  expect(writeMethodSpies.upsert).not.toHaveBeenCalled();
  expect(writeMethodSpies.delete).not.toHaveBeenCalled();
}

describe("SensorsIngestNormalizer — read-only safety", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;
  let xhrSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    Object.values(writeMethodSpies).forEach((s) => s.mockReset());
    supabaseSpies.from.mockReset();
    supabaseSpies.rpc.mockReset();
    supabaseSpies.functions.invoke.mockReset();
    supabaseSpies.auth.getSession.mockReset();
    supabaseSpies.auth.getUser.mockReset();
    supabaseSpies.auth.signInWithPassword.mockReset();
    supabaseSpies.storage.from.mockReset();

    // Any from() call returns a write-spy-laden builder so we can detect
    // accidental write attempts even if the page mistakenly chains one.
    supabaseSpies.from.mockImplementation(() => writeMethodSpies);

    fetchSpy = vi
      .spyOn(globalThis, "fetch" as never)
      .mockImplementation(() => {
        throw new Error("fetch must not be called by the normalizer screen");
      }) as never;

    xhrSpy = vi
      .spyOn(XMLHttpRequest.prototype, "open")
      .mockImplementation(() => {
        throw new Error("XMLHttpRequest must not be opened by the normalizer screen");
      }) as never;
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    xhrSpy?.mockRestore();
    fetchSpy = null;
    xhrSpy = null;
  });

  it("initial render performs zero network/write activity", () => {
    renderPage();
    expect(screen.getByTestId("webhook-normalizer-textarea")).toBeInTheDocument();
    expect(screen.getByTestId("webhook-normalizer-empty-state")).toBeInTheDocument();
    expectNoNetworkOrWrites(fetchSpy, xhrSpy);
  });

  it("selecting an example performs zero network/write activity", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("webhook-normalizer-example-ecowitt-mqtt"));
    fireEvent.click(screen.getByTestId("webhook-normalizer-example-generic-mqtt"));
    fireEvent.click(
      screen.getByTestId("webhook-normalizer-example-home-assistant-webhook"),
    );
    expectNoNetworkOrWrites(fetchSpy, xhrSpy);
  });

  it("pasting valid JSON and parsing performs zero network/write activity", () => {
    renderPage();
    const payload = {
      tent_id: "00000000-0000-4000-8000-000000000001",
      source: "mqtt",
      vendor: "ecowitt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24, humidity_pct: 55 },
    };
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: JSON.stringify(payload) },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    expect(screen.getByTestId("webhook-normalizer-result")).toBeInTheDocument();
    expectNoNetworkOrWrites(fetchSpy, xhrSpy);
  });

  it("clearing the form performs zero network/write activity", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("webhook-normalizer-example-ecowitt-mqtt"));
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    fireEvent.click(screen.getByTestId("webhook-normalizer-clear"));
    expect(screen.getByTestId("webhook-normalizer-empty-state")).toBeInTheDocument();
    expectNoNetworkOrWrites(fetchSpy, xhrSpy);
  });

  it("invalid JSON path performs zero network/write activity", () => {
    renderPage();
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: "{ not json" },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-testid",
      "webhook-normalizer-json-error",
    );
    expectNoNetworkOrWrites(fetchSpy, xhrSpy);
  });
});

describe("SensorsIngestNormalizer — Normalization Results UX", () => {
  beforeEach(() => {
    supabaseSpies.from.mockImplementation(() => writeMethodSpies);
  });

  it("shows an empty state before parsing", () => {
    renderPage();
    const empty = screen.getByTestId("webhook-normalizer-empty-state");
    expect(empty.textContent?.toLowerCase()).toContain(
      "paste a payload and run normalization",
    );
    expect(screen.queryByTestId("webhook-normalizer-result")).toBeNull();
  });

  it("renders 'Normalization Results' heading after parse", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("webhook-normalizer-example-ecowitt-mqtt"));
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    const heading = screen.getByTestId("webhook-normalizer-results-heading");
    expect(heading.textContent).toBe("Normalization Results");
  });

  it("renders before/after source and vendor fields", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("webhook-normalizer-example-ecowitt-mqtt"));
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    const srcBlock = screen.getByTestId("webhook-normalizer-source-beforeafter");
    expect(srcBlock.textContent).toContain("mqtt");
    expect(srcBlock.textContent?.toLowerCase()).toContain("raw source");
    const vendorBlock = screen.getByTestId("webhook-normalizer-vendor-beforeafter");
    expect(vendorBlock.textContent).toContain("ecowitt");
    expect(vendorBlock.textContent?.toLowerCase()).toContain("lineage");
  });

  it("renders accepted, skipped, and rejected field groups clearly", () => {
    renderPage();
    const payload = {
      tent_id: "00000000-0000-4000-8000-000000000001",
      source: "mqtt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 999, humidity_pct: 55, made_up_metric: 1 },
    };
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: JSON.stringify(payload) },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    expect(screen.getByTestId("webhook-normalizer-accepted").textContent).toMatch(
      /humidity_pct/,
    );
    expect(screen.getByTestId("webhook-normalizer-skipped").textContent).toMatch(
      /made_up_metric/,
    );
    expect(screen.getByTestId("webhook-normalizer-rejected").textContent).toMatch(
      /temp_c/,
    );
  });

  it("surfaces unsafe ignored fields under 'Ignored unsafe fields' (not 'trusted')", () => {
    renderPage();
    const payload = {
      tent_id: "00000000-0000-4000-8000-000000000001",
      source: "mqtt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24 },
      user_id: "evil-uid",
      api_key: "abc",
    };
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: JSON.stringify(payload) },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    const block = screen.getByTestId("webhook-normalizer-ignored-unsafe-fields");
    const text = block.textContent ?? "";
    expect(text.toLowerCase()).toContain("ignored unsafe fields");
    expect(text.toLowerCase()).toContain("user_id");
    expect(text.toLowerCase()).toContain("api_key");
    // Sanitized preview must not contain the unsafe keys verbatim.
    const sanitized =
      screen.getByTestId("webhook-normalizer-sanitized").textContent ?? "";
    expect(sanitized).not.toContain("user_id");
    expect(sanitized).not.toContain("api_key");
  });

  it("never labels a non-live source as 'Live' in the results header", () => {
    renderPage();
    const payload = {
      tent_id: "00000000-0000-4000-8000-000000000001",
      source: "mqtt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24 },
    };
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: JSON.stringify(payload) },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    const result = screen.getByTestId("webhook-normalizer-result");
    expect(result.textContent).not.toContain("Live");
  });
});
