import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SymptomReferenceTable from "@/components/SymptomReferenceTable";
import {
  CANNABIS_SYMPTOM_REFERENCE_TABLE,
  SYMPTOM_NO_STACK_RULE,
} from "@/constants/cannabisSymptomReference";
import { findGuideBySlug } from "@/constants/verdantSeoContent";

const SLUGS = [
  "cannabis-plant-symptoms",
  "cannabis-leaves-turning-yellow",
  "cannabis-leaf-spots-lesions",
  "cannabis-burnt-crispy-leaf-tips",
] as const;

describe("public symptom hub and guides", () => {
  it.each(SLUGS)(
    "publishes %s with editorial provenance, Quick Log CTA, and cautious language",
    (slug) => {
      const guide = findGuideBySlug(slug)!;
      expect(guide).not.toBeNull();
      expect(guide.publishedOn).toBe("2026-08-01");
      expect(guide.modifiedOn).toBe("2026-08-01");
      expect(guide.cta?.to).toBe("/quick-log");
      expect(guide.referenceTable?.rows.length).toBeGreaterThan(0);
      const copy = JSON.stringify(guide);
      expect(copy).toMatch(/not a diagnosis|does not|do not|without/i);
      expect(copy).not.toMatch(
        /auto[- ]?(?:diagnos|treat|adjust|control)|guaranteed cure|definitely deficient/i,
      );
    },
  );

  it("uses one shared accessible table and one exact no-stack rule", () => {
    render(<SymptomReferenceTable table={CANNABIS_SYMPTOM_REFERENCE_TABLE} />);
    expect(
      screen.getByRole("table", { name: CANNABIS_SYMPTOM_REFERENCE_TABLE.caption }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(SYMPTOM_NO_STACK_RULE).toMatch(/change one variable at a time/i);
    expect(SYMPTOM_NO_STACK_RULE).toMatch(/record the change/i);
  });

  it("cross-links the symptom hub and all three focused guides", () => {
    const hub = findGuideBySlug("cannabis-plant-symptoms")!;
    expect(hub.related).toEqual(expect.arrayContaining(SLUGS.slice(1)));
    for (const slug of SLUGS.slice(1)) {
      expect(findGuideBySlug(slug)?.related).toContain("cannabis-plant-symptoms");
    }
  });
});
