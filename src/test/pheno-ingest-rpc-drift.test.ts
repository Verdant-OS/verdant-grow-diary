/**
 * Drift guard: the pheno_ingest RPC's inline SQL transforms must stay identical
 * to the pure TS mapping (src/lib/phenoIdIngestMapping.ts). If the TS rules move,
 * the anchor assertions below change and force the SQL — pinned in the same test —
 * to move with them, so the server ingest and the client/importer can't diverge.
 *
 * Static analysis only — reads the migration text; no DB connection.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  stageToRound,
  rescale0to10to1to5,
  verdictToDecision,
} from "@/lib/phenoIdIngestMapping";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function ingestSql(): string {
  for (const n of readdirSync(MIG_DIR)) {
    const sql = readFileSync(join(MIG_DIR, n), "utf8");
    if (/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.pheno_ingest/i.test(sql)) return sql;
  }
  return "";
}
const sql = existsSync(MIG_DIR) ? ingestSql() : "";

describe("pheno_ingest RPC — discoverable", () => {
  it("the migration defines public.pheno_ingest", () => {
    expect(sql.length).toBeGreaterThan(500);
  });
});

describe("SQL stage→round CASE matches phenoIdIngestMapping.stageToRound", () => {
  const cases: [string, string][] = [
    ["veg", "veg"],
    ["early flower", "early_flower"],
    ["flower", "mid_flower"],
    ["late flower", "late_flower"],
    ["flush", "late_flower"],
    ["dry", "post_cure"],
  ];
  for (const [k, round] of cases) {
    it(`${k} → ${round} (TS + SQL)`, () => {
      // TS is the source of truth.
      expect(stageToRound(k)).toBe(round);
      // SQL CASE contains the same pairing.
      const re = new RegExp(`WHEN\\s+'${k}'\\s+THEN\\s+'${round}'`, "i");
      expect(sql).toMatch(re);
    });
  }
  it("fallback is mid_flower on both sides", () => {
    expect(stageToRound("whatever")).toBe("mid_flower");
    expect(sql).toMatch(/ELSE\s+'mid_flower'/i);
  });
});

describe("SQL rescale matches phenoIdIngestMapping.rescale0to10to1to5", () => {
  it("uses the × 0.4 formula clamped to 1..5", () => {
    expect(rescale0to10to1to5(0)).toBe(1);
    expect(rescale0to10to1to5(5)).toBe(3);
    expect(rescale0to10to1to5(10)).toBe(5);
    // SQL: least(5, greatest(1, 1 + round(... * 0.4)))
    expect(sql).toMatch(/least\(5,\s*greatest\(1,\s*1\s*\+\s*round\(/i);
    expect(sql).toMatch(/\*\s*0\.4\)/);
  });
});

describe("SQL verdict→decision matches phenoIdIngestMapping.verdictToDecision", () => {
  it("keep→keep, maybe→hold, cull→cull", () => {
    expect(verdictToDecision("keep")).toBe("keep");
    expect(verdictToDecision("maybe")).toBe("hold");
    expect(verdictToDecision("cull")).toBe("cull");
    expect(sql).toMatch(/WHEN\s+'keep'\s+THEN\s+'keep'/i);
    expect(sql).toMatch(/WHEN\s+'maybe'\s+THEN\s+'hold'/i);
    expect(sql).toMatch(/WHEN\s+'cull'\s+THEN\s+'cull'/i);
  });
});
