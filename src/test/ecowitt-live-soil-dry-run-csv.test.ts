import { describe, it, expect } from "vitest";
import { readFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  runEcowittDryRun,
  buildDryRunCsv,
  writeDryRunCsv,
} from "../../scripts/ecowitt-live-soil-dry-run";

const TENT = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../fixtures/ecowitt-live-soil-sample.json"),
    "utf8",
  ),
) as Record<string, unknown>;

function cleanFixture(extra: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(FIXTURE)) if (!k.startsWith("_")) out[k] = v;
  return { ...out, ...extra };
}

const NOW = new Date(`${(FIXTURE.dateutc as string).replace(" ", "T")}Z`);

describe("ecowitt-live-soil dry-run CSV export", () => {
  it("writes CSV with humidity, soil moisture, derived vpd_kpa, canonical source=live", () => {
    const out = runEcowittDryRun({
      payload: cleanFixture(),
      defaultTentId: TENT,
      channelMap: { soilmoisture1: { tent_id: TENT_B, label: "front_left_pot" } },
      now: NOW,
    });
    const csv = buildDryRunCsv(out);
    const lines = csv.trim().split("\n");
    const header = lines[0].split(",");
    expect(header).toContain("humidity_pct");
    expect(header).toContain("soil_moisture_pct");
    expect(header).toContain("vpd_kpa");
    expect(header).toContain("source");
    expect(header).toContain("provider");
    expect(header).toContain("transport");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // Every accepted row uses canonical source=live, provider=ecowitt
    for (const row of lines.slice(1)) {
      const cells = row.split(",");
      const acceptedIdx = header.indexOf("accepted");
      if (cells[acceptedIdx] === "true") {
        expect(cells[header.indexOf("source")]).toBe("live");
        expect(cells[header.indexOf("provider")]).toBe("ecowitt");
        expect(cells[header.indexOf("transport")]).toBe("mqtt");
      }
    }
    // Air row has a numeric vpd
    const airRow = lines
      .slice(1)
      .find((r) => r.split(",")[header.indexOf("air_temperature_f")] !== "");
    expect(airRow).toBeDefined();
    const vpdCell = airRow!.split(",")[header.indexOf("vpd_kpa")];
    expect(Number(vpdCell)).toBeGreaterThan(0);
  });

  it("missing VPD exports blank, never 0", () => {
    const out = runEcowittDryRun({
      payload: cleanFixture({ humidity: undefined }),
      defaultTentId: TENT,
      now: NOW,
    });
    const csv = buildDryRunCsv(out);
    const lines = csv.trim().split("\n");
    const header = lines[0].split(",");
    const vpdIdx = header.indexOf("vpd_kpa");
    for (const row of lines.slice(1)) {
      const cells = row.split(",");
      expect(cells[vpdIdx]).not.toBe("0");
      // blank is "" — accept that
      if (cells[vpdIdx] !== "") {
        expect(Number(cells[vpdIdx])).toBeGreaterThan(0);
      }
    }
  });

  it("redacted fields stay redacted in CSV", () => {
    const out = runEcowittDryRun({
      payload: cleanFixture({
        PASSKEY: "DEADBEEFCAFE1234",
        MAC: "AA:BB:CC:DD:EE:FF",
        token: "secret-token-xyz",
      }),
      defaultTentId: TENT,
      now: NOW,
    });
    const csv = buildDryRunCsv(out);
    expect(csv).not.toContain("DEADBEEFCAFE1234");
    expect(csv).not.toContain("secret-token-xyz");
    expect(csv).toContain("[redacted]");
  });

  it("invalid normalized payload exports an accepted=false row with reason", () => {
    const out = runEcowittDryRun({
      payload: { tempf: 9999, humidity: 250 },
      defaultTentId: TENT,
      now: NOW,
    });
    const csv = buildDryRunCsv(out);
    const lines = csv.trim().split("\n");
    const header = lines[0].split(",");
    expect(lines.length).toBe(2);
    const row = lines[1].split(",");
    expect(row[header.indexOf("accepted")]).toBe("false");
    expect(row[header.indexOf("reason")].length).toBeGreaterThan(0);
  });

  it("writes CSV to disk and creates parent folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "ecowitt-csv-"));
    const path = join(dir, "nested", "out.csv");
    try {
      const out = runEcowittDryRun({
        payload: cleanFixture(),
        defaultTentId: TENT,
        now: NOW,
      });
      writeDryRunCsv(path, out);
      expect(existsSync(path)).toBe(true);
      const written = readFileSync(path, "utf8");
      expect(written).toContain("captured_at");
      expect(written).not.toContain("vbt_");
      expect(written).not.toContain("Bearer ");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CSV export does not post to the network", () => {
    // Pure function — assert by inspecting the source file.
    const src = readFileSync(
      resolve(__dirname, "../../scripts/ecowitt-live-soil-dry-run.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/http\.request|https\.request/);
    expect(src).not.toMatch(/@supabase\/supabase-js/);
  });
});
