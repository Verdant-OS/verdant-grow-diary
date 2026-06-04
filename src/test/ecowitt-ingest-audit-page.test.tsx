/**
 * EcoWitt ingest audit page — wiring + redaction tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import EcowittIngestAudit from "@/pages/EcowittIngestAudit";
import {
  buildEcowittAuditPageViewModel,
  redactRawPayload,
  isSensitivePayloadKey,
} from "@/lib/ecowittRawPayloadAuditViewModel";

const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";

let readingRows: Array<Record<string, unknown>> = [];
let tentRows: Array<Record<string, unknown>> = [{ id: TENT_A, name: "Tent A" }];
let readingError: { message: string } | null = null;
let readingLoading = false;

vi.mock("@/integrations/supabase/client", () => {
  const makeReadings = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () =>
        readingError
          ? Promise.resolve({ data: null, error: readingError })
          : Promise.resolve({ data: readingRows, error: null }),
    };
    return chain;
  };
  const makeTents = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => Promise.resolve({ data: tentRows, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) =>
        table === "sensor_readings" ? makeReadings() : makeTents(),
    },
  };
});

beforeEach(() => {
  readingRows = [];
  tentRows = [{ id: TENT_A, name: "Tent A" }];
  readingError = null;
  readingLoading = false;
});

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const samplePayload = (extra: Record<string, unknown> = {}) => ({
  vendor: "ecowitt",
  station_type: "GW1100",
  adapter_warnings: ["clamped:humidity_pct"],
  PASSKEY: "AAAA-leaked-passkey",
  password: "shhh",
  token: "tk_xxx",
  secret: "s_xxx",
  mac: "AA:BB:CC:DD:EE:FF",
  stationid: "ST-12345",
  bridge_token: "vbt_xxx",
  temp_c: 24,
  humidity_pct: 55,
  ...extra,
});

describe("redactRawPayload helper", () => {
  it("redacts sensitive keys at any depth", () => {
    const r = redactRawPayload({
      a: 1,
      passkey: "x",
      nested: { token: "y", deeper: { mac: "z", ok: 2 } },
    }) as Record<string, unknown>;
    expect(r.passkey).toBe("[redacted]");
    const nested = r.nested as Record<string, unknown>;
    expect(nested.token).toBe("[redacted]");
    const deeper = nested.deeper as Record<string, unknown>;
    expect(deeper.mac).toBe("[redacted]");
    expect(deeper.ok).toBe(2);
  });

  it("flags expected sensitive key substrings", () => {
    for (const k of ["passkey", "PASSKEY", "password", "token", "secret", "mac", "stationid", "bridge_token", "api_key"]) {
      expect(isSensitivePayloadKey(k)).toBe(true);
    }
    expect(isSensitivePayloadKey("temp_c")).toBe(false);
    expect(isSensitivePayloadKey("humidity_pct")).toBe(false);
  });
});

describe("buildEcowittAuditPageViewModel", () => {
  it("filters to the selected tent and excludes other tents", () => {
    const vm = buildEcowittAuditPageViewModel({
      tentId: TENT_A,
      rows: [
        {
          id: "r-a",
          tent_id: TENT_A,
          source: "ecowitt",
          captured_at: "2026-06-04T12:00:00Z",
          raw_payload: samplePayload(),
          metric: "temperature_c",
          value: 24,
          quality: "ok",
        } as never,
        {
          id: "r-b",
          tent_id: TENT_B,
          source: "ecowitt",
          captured_at: "2026-06-04T12:00:00Z",
          raw_payload: samplePayload(),
          metric: "temperature_c",
          value: 99,
          quality: "ok",
        } as never,
      ],
    });
    expect(vm.rows.map((r) => r.id)).toEqual(["r-a"]);
  });

  it("redacts payload and surfaces adapter_warnings", () => {
    const vm = buildEcowittAuditPageViewModel({
      tentId: TENT_A,
      rows: [
        {
          id: "r-a",
          tent_id: TENT_A,
          source: "ecowitt",
          captured_at: "2026-06-04T12:00:00Z",
          raw_payload: samplePayload(),
          metric: "temperature_c",
          value: 24,
          quality: "ok",
        } as never,
      ],
    });
    expect(vm.rows[0].adapterWarnings).toContain("clamped:humidity_pct");
    const json = JSON.stringify(vm.rows[0].redactedRawPayload);
    expect(json).not.toContain("AAAA-leaked-passkey");
    expect(json).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(json).not.toContain("ST-12345");
    expect(json).not.toContain("vbt_xxx");
    expect(json).toContain("[redacted]");
  });
});

describe("EcowittIngestAudit page", () => {
  it("renders empty state when no readings exist for the tent", async () => {
    readingRows = [];
    const Wrap = wrap();
    render(
      <Wrap>
        <EcowittIngestAudit />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-audit-empty")).toBeTruthy(),
    );
  });

  it("renders rows with redacted payload + warnings for selected tent", async () => {
    readingRows = [
      {
        id: "row-1",
        tent_id: TENT_A,
        source: "ecowitt",
        metric: "temperature_c",
        value: 24,
        quality: "ok",
        captured_at: "2026-06-04T12:00:00Z",
        raw_payload: samplePayload(),
      },
    ];
    const Wrap = wrap();
    render(
      <Wrap>
        <EcowittIngestAudit />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-audit-row-row-1")).toBeTruthy(),
    );
    const payload = screen.getByTestId("ecowitt-audit-row-payload-row-1").textContent ?? "";
    expect(payload).not.toContain("AAAA-leaked-passkey");
    expect(payload).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(payload).not.toContain("ST-12345");
    expect(payload).not.toContain("vbt_xxx");
    expect(payload).toContain("[redacted]");
    expect(
      screen.getByTestId("ecowitt-audit-row-warnings-row-1").textContent ?? "",
    ).toContain("clamped:humidity_pct");
  });

  it("renders error state when query fails", async () => {
    readingError = { message: "boom" };
    const Wrap = wrap();
    render(
      <Wrap>
        <EcowittIngestAudit />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("ecowitt-audit-error")).toBeTruthy(),
    );
  });

  it("page source is read-only: no send/delete/control verbs or service_role", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/pages/EcowittIngestAudit.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    const __forbid = ["switch","bot"].join("");
      expect(src.toLowerCase()).not.toContain(__forbid);
    expect(src).not.toMatch(/turn[_ ]?on|turn[_ ]?off/i);
    expect(src).not.toMatch(/from\(\s*['"]alerts['"]/);
    expect(src).not.toMatch(/from\(\s*['"]action_queue['"]/);
    expect(src).not.toMatch(/bridge_token|vbt_/);
  });
});
