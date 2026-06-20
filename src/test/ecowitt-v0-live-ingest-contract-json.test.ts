import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const JSON_PATH = resolve(__dirname, "../../docs/ecowitt-v0-live-ingest-contract.json");
const MD_PATH = resolve(__dirname, "../../docs/ecowitt-v0-live-ingest-contract.md");

const contract = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const md = readFileSync(MD_PATH, "utf8").toLowerCase();
const jsonText = readFileSync(JSON_PATH, "utf8");

describe("ecowitt v0 machine-readable contract", () => {
  it("lists canonical stored sources matching the markdown doc", () => {
    expect(contract.canonical_stored_sources).toEqual([
      "live",
      "manual",
      "csv",
      "demo",
      "stale",
      "invalid",
    ]);
    for (const s of contract.canonical_stored_sources) {
      expect(md).toContain(s);
    }
  });

  it("documents EcoWitt as transport/lineage with stored source=live", () => {
    expect(contract.transport_sources.ecowitt.stored_source_for_live_ecowitt).toBe("live");
    expect(contract.transport_sources.ecowitt.lineage_fields).toEqual(
      expect.arrayContaining([
        "raw_payload.vendor",
        "raw_payload.metadata.transport_source",
      ]),
    );
    expect(md).toContain("raw_payload.vendor");
    expect(md).toContain("transport_source");
  });

  it("agrees on no-goals with markdown doc", () => {
    for (const g of [
      "no fake live data",
      "no device control",
      "no action queue writes",
      "no alert creation",
    ]) {
      expect(contract.no_goals.map((s: string) => s.toLowerCase())).toContain(g);
    }
    expect(md).toContain("no fake live data");
    expect(md).toContain("no device control");
  });

  it("forbids secret-shaped strings in its own JSON text", () => {
    expect(jsonText).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
    expect(jsonText).not.toMatch(/vbt_[A-Za-z0-9]{6,}/);
    expect(jsonText).not.toMatch(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    );
    // PASSKEY should appear only as a label in forbidden_render_strings, never
    // as `PASSKEY=value`.
    expect(jsonText).not.toMatch(/PASSKEY\s*[:=]\s*[A-Za-z0-9]/);
  });
});
