import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PANEL = readFileSync(
  resolve(__dirname, "../components/SensorsTestbenchPanel.tsx"),
  "utf8",
);

describe("SensorsTestbenchPanel diagnostics static safety", () => {
  it("renders Supabase URL and ingest URL diagnostics", () => {
    expect(PANEL).toMatch(/sensors-diag-supabase-url/);
    expect(PANEL).toMatch(/sensors-diag-ingest-url/);
    expect(PANEL).toMatch(/sensors-diag-tent-uuid/);
  });

  it("shows token identity via prefix, never full plaintext", () => {
    expect(PANEL).toMatch(/sensors-diag-token-identity/);
    // The diagnostics block must render token_prefix, not reveal.
    expect(PANEL).toMatch(/activeToken\.token_prefix/);
  });

  it("renders env match checklist and result classifier", () => {
    expect(PANEL).toMatch(/sensors-diag-env-match/);
    expect(PANEL).toMatch(/sensors-testbench-result-headline/);
    expect(PANEL).toMatch(/sensors-testbench-result-detail/);
  });

  it("test payload matches the operator-specified contract", () => {
    expect(PANEL).toMatch(/temp_f: 77\.4/);
    expect(PANEL).toMatch(/soil_moisture_pct: 33/);
    expect(PANEL).toMatch(/co2_ppm: 721/);
    expect(PANEL).toMatch(/verdant-ui-ingest-test/);
    expect(PANEL).toMatch(/sensors_ui_test_button/);
  });

  it("never persists token plaintext to storage", () => {
    expect(PANEL).not.toMatch(/localStorage[\s\S]{0,40}reveal/);
    expect(PANEL).not.toMatch(/sessionStorage[\s\S]{0,40}reveal/);
  });

  it("does not contain SERVICE_ROLE in panel source", () => {
    expect(PANEL).not.toMatch(/SERVICE_ROLE/);
  });
});
