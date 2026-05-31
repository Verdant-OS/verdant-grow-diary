/**
 * First-run Tent and Plant creation simplification — static guardrails.
 *
 * Verdant principle: "Capture now, enrich later." First-run forms must
 * require only the minimum fields needed to start building plant memory.
 *
 * Audit (against current public.tents / public.plants schema):
 *  - tents: only `name` truly required (user_id from auth; stage has default).
 *  - plants: only `name` truly required (stage has default; strain is nullable).
 *  - First-run UI requires: Tent → name; Plant → name + stage.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const CREATE_TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const CREATE_PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

const FORBIDDEN_CLAIMS = [
  "autopilot",
  "ai grows for you",
  "guaranteed yield",
  "fake live data",
];

const FORBIDDEN_SURFACES = [
  "action_queue",
  "alert_events",
  "service_role",
  "target_device",
  "device_command",
  "automation",
];

function countRequiredInputs(src: string): number {
  // Count `<Input required ...>` occurrences — these are HTML-enforced required fields.
  return (src.match(/<Input\s+required\b/g) ?? []).length;
}

describe("CreateTentDialog — first-run simplification", () => {
  it("requires only the tent name (single HTML-required input)", () => {
    expect(countRequiredInputs(CREATE_TENT)).toBe(1);
    expect(CREATE_TENT).toMatch(/<Input\s+required[\s\S]*?placeholder="Tent #1"/);
  });


  it("shows 'Enrich later' guidance copy", () => {
    expect(CREATE_TENT).toMatch(/Start simple\./);
    expect(CREATE_TENT).toMatch(/add size, brand, and stage later/);
    expect(CREATE_TENT).toMatch(/Verdant works best once your first plant memory exists\./);
  });

  it("marks optional fields as optional in the UI", () => {
    expect(CREATE_TENT).toMatch(/Size \(optional\)/);
    expect(CREATE_TENT).toMatch(/Brand \(optional\)/);
    expect(CREATE_TENT).toMatch(/Stage \(optional\)/);
  });

  it("collapses optional details into an 'enrich later' disclosure", () => {
    expect(CREATE_TENT).toMatch(/Optional details \(enrich later\)/);
    expect(CREATE_TENT).toMatch(/<details/);
  });

  it("does not seed fake/demo defaults into the real workspace", () => {
    // Initial form state must keep enrichment fields empty.
    expect(CREATE_TENT).toMatch(/name:\s*"",\s*size:\s*"",\s*brand:\s*""/);
    // Demo-labeled sample values must not be injected.
    expect(CREATE_TENT.toLowerCase()).not.toContain("demo data");
    expect(CREATE_TENT.toLowerCase()).not.toContain("sample tent");
  });

  it("sends null (not empty strings) for blank optional fields", () => {
    expect(CREATE_TENT).toMatch(/size:\s*form\.size\.trim\(\)\s*\|\|\s*null/);
    expect(CREATE_TENT).toMatch(/brand:\s*form\.brand\.trim\(\)\s*\|\|\s*null/);
  });

  it("does not introduce forbidden claims", () => {
    const lower = CREATE_TENT.toLowerCase();
    for (const term of FORBIDDEN_CLAIMS) expect(lower).not.toContain(term);
  });

  it("does not touch automation / device / alert-persistence surfaces", () => {
    const lower = CREATE_TENT.toLowerCase();
    for (const term of FORBIDDEN_SURFACES) expect(lower).not.toContain(term);
  });
});

describe("CreatePlantDialog — first-run simplification", () => {
  it("requires only the plant name as an HTML-required input", () => {
    // Stage is required-by-default via a controlled <Select> with a default value;
    // only `name` should remain an HTML-`required` text Input.
    expect(countRequiredInputs(CREATE_PLANT)).toBe(1);
    expect(CREATE_PLANT).toMatch(/<Input\s+required[^>]*placeholder="Plant A"/);
  });

  it("does NOT require strain, breeder, medium, dates, or pot size", () => {
    // Strain input must not be required.
    expect(CREATE_PLANT).not.toMatch(/<Input\s+required[^>]*placeholder="Blue Dream"/);
    // Strain field must be explicitly labelled optional.
    expect(CREATE_PLANT).toMatch(/Strain \(optional\)/);
    // started_at must remain optional.
    expect(CREATE_PLANT).toMatch(/Started at \(optional\)/);
  });

  it("seeds null (not empty string) into the strain column when blank", () => {
    expect(CREATE_PLANT).toMatch(/strain:\s*trimmedStrain\s*\|\|\s*null/);
  });

  it("keeps stage selectable with a safe default value", () => {
    // Stage select must remain in the form with a non-empty default.
    expect(CREATE_PLANT).toMatch(/stage:\s*"seedling"/);
    expect(CREATE_PLANT).toMatch(/value=\{form\.stage\}/);
  });

  it("shows 'Enrich later' guidance copy", () => {
    expect(CREATE_PLANT).toMatch(/Start simple\./);
    expect(CREATE_PLANT).toMatch(/add genetics, medium, dates, and notes later/);
    expect(CREATE_PLANT).toMatch(/Verdant works best once your first plant memory exists\./);
  });

  it("collapses optional enrichment fields into a disclosure", () => {
    expect(CREATE_PLANT).toMatch(/Optional details \(enrich later\)/);
    expect(CREATE_PLANT).toMatch(/<details/);
  });

  it("does not seed fake/demo defaults into the real workspace", () => {
    expect(CREATE_PLANT).toMatch(/name:\s*"",\s*strain:\s*""/);
    expect(CREATE_PLANT.toLowerCase()).not.toContain("demo data");
    expect(CREATE_PLANT.toLowerCase()).not.toContain("sample plant");
  });

  it("preserves existing richer fields (health, started_at, tent picker) for editing", () => {
    expect(CREATE_PLANT).toMatch(/Health/);
    expect(CREATE_PLANT).toMatch(/Tent \(optional\)/);
    expect(CREATE_PLANT).toMatch(/Add new tent/);
  });

  it("does not introduce forbidden claims", () => {
    const lower = CREATE_PLANT.toLowerCase();
    for (const term of FORBIDDEN_CLAIMS) expect(lower).not.toContain(term);
  });

  it("does not touch automation / device / alert-persistence surfaces", () => {
    const lower = CREATE_PLANT.toLowerCase();
    for (const term of FORBIDDEN_SURFACES) expect(lower).not.toContain(term);
  });
});
