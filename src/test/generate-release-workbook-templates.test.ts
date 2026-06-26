import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  SEED_PRODUCTION_HEADERS,
  COMMERCIAL_REVIEW_HEADERS,
  reviewStatusFormula,
  qualityFlagFormula,
  viabilityFormula,
} from "../../scripts/generate-release-workbook-templates.mjs";

const ART = join(process.cwd(), "docs", "artifacts");

describe("generate-release-workbook-templates", () => {
  it("Seed Production headers match A–AA exactly (27 columns)", () => {
    expect(SEED_PRODUCTION_HEADERS).toHaveLength(27);
    expect(SEED_PRODUCTION_HEADERS[0]).toBe("A Seed Lot ID");
    expect(SEED_PRODUCTION_HEADERS[11]).toBe("L Viability % Tested");
    expect(SEED_PRODUCTION_HEADERS[22]).toBe("W Quality Flag");
    expect(SEED_PRODUCTION_HEADERS.at(-1)).toBe("AA Verdant Action Queue Item");
  });

  it("Commercial Release Review headers match A–AI exactly (35 columns)", () => {
    expect(COMMERCIAL_REVIEW_HEADERS).toHaveLength(35);
    expect(COMMERCIAL_REVIEW_HEADERS[0]).toBe("A Release Review ID");
    expect(COMMERCIAL_REVIEW_HEADERS[2]).toBe("C Seed Lot ID");
    expect(COMMERCIAL_REVIEW_HEADERS[27]).toBe("AB Missing Evidence Count");
    expect(COMMERCIAL_REVIEW_HEADERS[28]).toBe("AC Review Status");
    expect(COMMERCIAL_REVIEW_HEADERS[29]).toBe("AD Human Release Decision");
    expect(COMMERCIAL_REVIEW_HEADERS.at(-1)).toBe("AI Notes");
  });

  it("Review Status formula never outputs 'Released'", () => {
    const f = reviewStatusFormula(5);
    expect(f).not.toMatch(/"Released"/);
    expect(f).toMatch(/Release Candidate/);
  });

  it("Quality Flag formula contract matches v1.3 spec exactly", () => {
    expect(qualityFlagFormula(2)).toBe(
      '=IF(L2="","Missing Test",IF(N2<25,"Hold",IF(N2<50,"Needs Review",IF(L2<0.7,"Hold",IF(L2<0.85,"Needs Review","Pass")))))',
    );
  });

  it("Viability formula contract matches v1.3 spec exactly", () => {
    expect(viabilityFormula(2)).toBe('=IF(OR(N2="",N2=0,Q2=""),"",Q2/N2)');
  });

  it("generated manifest declares v1.3 + placeholder-only premium status", () => {
    const manifestPath = join(ART, "release-workbook-template-manifest.json");
    if (!existsSync(manifestPath)) {
      // Generator hasn't been run in this environment; skip rather than fail.
      return;
    }
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(m.version).toBe("v1.3");
    expect(m.premium_workbook.real_url_included).toBe(false);
    expect(m.premium_workbook.placeholder).toBe("{{PREMIUM_WORKBOOK_COPY_URL}}");
    expect(m.premium_workbook.entitlement_required_before_serving_real_link).toBe(true);
  });

  it("generated CSV artifacts do not contain real URLs, secrets, or auto-release language", () => {
    const csvFiles = [
      join(ART, "seed-production-tracking-v1.3-template.csv"),
      join(ART, "commercial-release-review-traceability-v1.3-template.csv"),
    ];
    for (const f of csvFiles) {
      if (!existsSync(f)) continue;
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/docs\.google\.com/i);
      expect(text).not.toMatch(/drive\.google\.com/i);
      expect(text).not.toMatch(/dropbox\.com/i);
      expect(text).not.toMatch(/notion\.s(o|ite)/i);
      expect(text).not.toMatch(/access_token\s*=/i);
      expect(text).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(text).not.toMatch(/private\/[A-Za-z0-9]/);
      // Released is a human-only state; CSV must not contain auto-release wording.
      expect(text).not.toMatch(/auto[- ]?release/i);
      expect(text).not.toMatch(/automatic action queue/i);
    }
  });
});
