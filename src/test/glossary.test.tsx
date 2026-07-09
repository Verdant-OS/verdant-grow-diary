/**
 * Glossary page — targeted tests.
 *
 * Proves the page renders, alphabet navigation exists, search filters,
 * every required term is present, the "Strain" definition prefers the
 * term "cultivar", and no forbidden surfaces are introduced in the new
 * files.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Glossary from "@/pages/Glossary";
import { GLOSSARY_TERMS } from "@/constants/glossaryTerms";

const REQUIRED_TERMS = [
  "Aseptic Culture",
  "Aseptic Technique",
  "Autoclave",
  "Autoflower",
  "Auxins",
  "Backcross (BX)",
  "Bag Seed",
  "Base Pair",
  "Biennial",
  "Biosynthesis",
  "Bract",
  "Broad Leaf Drug Varieties",
  "Bro Science",
  "Bubble Hash",
  "Progeny",
  "Protoplast Fusion",
  "Purebred",
  "P-Value",
  "Qualitative Genetics",
  "Quantitative Genetics",
  "Quantitative Trait Locus (QTL)",
  "Receiver",
  "Reciprocal Cross",
  "Recombination",
  "Respiration",
  "Rodelization",
  "Ruderalis",
  "S1",
  "Sativa",
  "Scarification",
  "Screen of Green (SCROG)",
  "Segregation",
  "Selection",
  "Selection Pressure",
  "Selective Breeding",
  "Selfing",
  "Senescence",
  "Shoot Tip Culture",
  "Single Seed Descent (SSD)",
  "Skatole",
  "Solvent-Based Extraction",
  "Solventless Extraction",
  "Somaclonal Variation",
  "Sterilization",
  "Strain",
  "Strain Fatigue",
  "Stratification",
  "Subculture",
  "Substrate",
  "Super Cropping",
  "Synthetic Cannabis",
  "Synthetic Seeds",
  "Terpenes",
  "Testa",
  "Thiols",
  "Topping",
  "Totipotency",
  "Training",
  "Traits",
  "Transgenic",
  "Transpiration",
  "Transplanting",
  "Trichome",
  "Tropical Volatile Sulfur Compounds",
  "True-to-Seed",
  "Vapor Pressure Deficit (VPD)",
  "Variety",
  "Vegetative Stage",
  "Washer",
  "Xylem",
];

function renderGlossary() {
  return render(
    <MemoryRouter>
      <Glossary />
    </MemoryRouter>,
  );
}

describe("Glossary constants", () => {
  it("contains every required term (deduplicated)", () => {
    const set = new Set(GLOSSARY_TERMS.map((t) => t.term));
    for (const term of REQUIRED_TERMS) {
      expect(set.has(term)).toBe(true);
    }
    // No duplicates in the exported list.
    expect(GLOSSARY_TERMS.length).toBe(set.size);
  });

  it("Strain definition explains that 'cultivar' is preferred", () => {
    const strain = GLOSSARY_TERMS.find((t) => t.term === "Strain");
    expect(strain).toBeDefined();
    expect(strain!.definition.toLowerCase()).toContain("cultivar");
    expect(strain!.definition.toLowerCase()).toContain("prefer");
  });
});

describe("Glossary page", () => {
  it("renders the page, disclaimer, and alphabet navigation", () => {
    renderGlossary();
    expect(screen.getByTestId("glossary-page")).toBeInTheDocument();
    expect(screen.getByTestId("glossary-alphabet-nav")).toBeInTheDocument();
    // A representative jump link exists.
    expect(screen.getByTestId("glossary-jump-A")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Glossary entries are educational reference content/i,
      ),
    ).toBeInTheDocument();
    cleanup();
  });

  it("renders every required term as a card by default", () => {
    renderGlossary();
    for (const term of REQUIRED_TERMS) {
      expect(screen.getByTestId(`glossary-term-${term}`)).toBeInTheDocument();
    }
    cleanup();
  });

  it("search filters visible terms", () => {
    renderGlossary();
    const search = screen.getByTestId("glossary-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "trichome" } });
    expect(screen.getByTestId("glossary-term-Trichome")).toBeInTheDocument();
    // A non-matching term must be gone.
    expect(screen.queryByTestId("glossary-term-Autoclave")).toBeNull();
    cleanup();
  });

  it("shows an empty state when no term matches", () => {
    renderGlossary();
    fireEvent.change(screen.getByTestId("glossary-search"), {
      target: { value: "zzzzz-no-match" },
    });
    expect(screen.getByTestId("glossary-empty")).toBeInTheDocument();
    cleanup();
  });

  it("category chip filters to that category", () => {
    renderGlossary();
    fireEvent.click(screen.getByTestId("glossary-category-Extraction"));
    expect(screen.getByTestId("glossary-term-Bubble Hash")).toBeInTheDocument();
    expect(screen.queryByTestId("glossary-term-Autoflower")).toBeNull();
    cleanup();
  });
});

describe("Glossary — safety scan", () => {
  const files = ["src/pages/Glossary.tsx", "src/constants/glossaryTerms.ts"];
  const FORBIDDEN = [
    "action_queue",
    "actionqueue",
    "openai",
    "anthropic",
    "gemini",
    "sensor_readings",
    "sensoringest",
    "mqtt",
    "webhook",
    "service_role",
  ];
  for (const f of files) {
    it(`${f} avoids AI / Action Queue / automation / device / sensor-ingest surfaces`, () => {
      const src = readFileSync(path.resolve(process.cwd(), f), "utf8").toLowerCase();
      for (const needle of FORBIDDEN) {
        expect(src).not.toContain(needle);
      }
    });
  }
});
