/**
 * PHENOHUNT documentation defaults — targeted tests.
 *
 * Proves:
 *  - all default sections and fields render with exact labels
 *  - edited values persist to storage
 *  - existing saved values are not overwritten by defaults
 *  - optional diary reference renders when supported
 *  - no AI, Action Queue, automation, device-control, or sensor-ingest
 *    code is introduced in the new files.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PhenoDocumentationSections from "@/components/PhenoDocumentationSections";
import {
  PHENO_DOCUMENTATION_DEFAULTS,
  mergeDocumentationValues,
} from "@/constants/phenoDocumentationDefaults";

const EXPECTED_SECTION_TITLES = [
  "Receiver cultivar information",
  "Breeding information",
  "Seedling information",
  "Phenotype characteristics",
  "Harvest information",
  "Cloning and further generational growth",
];

const EXPECTED_LABELS: readonly string[] = [
  // Receiver cultivar
  "Receiver cultivar name",
  "Breeder",
  "Genetics",
  "Growth characteristics",
  "Flowering time",
  "Yield",
  "Flavor profile",
  "Other relevant information",
  // Breeding
  "Date of pollination",
  "Date of seed harvest",
  "Total number of seeds",
  // Seedling
  "Growth rate",
  "Observable traits",
  "Abnormalities",
  // Phenotype
  "Phenotype performance notes",
  "Unique traits",
  // Harvest
  "Trichome development",
  "Flavor",
  "Effect",
  // Cloning
  "Clone viability",
  "Number of clones taken",
  "Number of clones rooted",
  "Phenotypic variation across generations",
  "Stability across generations",
];

describe("PHENOHUNT documentation defaults — constants", () => {
  it("exposes all six default sections with exact titles", () => {
    expect(PHENO_DOCUMENTATION_DEFAULTS.map((s) => s.title)).toEqual(EXPECTED_SECTION_TITLES);
  });

  it("mergeDocumentationValues never overwrites existing saved values", () => {
    const saved = {
      receiver_cultivar: {
        fields: { receiver_cultivar_name: "GG#4", breeder: "" },
        diaryEntryId: "diary-1",
      },
    };
    const merged = mergeDocumentationValues(saved);
    expect(merged.receiver_cultivar.fields.receiver_cultivar_name).toBe("GG#4");
    expect(merged.receiver_cultivar.diaryEntryId).toBe("diary-1");
    // empty saved value must NOT clobber default empty; other sections still present
    expect(merged.receiver_cultivar.fields.breeder).toBe("");
    expect(merged.harvest.fields.yield).toBe("");
    // all default section keys present
    for (const s of PHENO_DOCUMENTATION_DEFAULTS) {
      expect(merged[s.key]).toBeDefined();
    }
  });
});

describe("PhenoDocumentationSections — rendering & persistence", () => {
  it("discloses before entry that documentation is saved on this device only", () => {
    render(<PhenoDocumentationSections recordId="cand-device" recordType="candidate" />);

    expect(screen.getByText(/saved on this device only/i)).toBeInTheDocument();
    expect(screen.getByText(/not saved to your Verdant account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save on this device" })).toBeInTheDocument();
    cleanup();
  });

  it("renders every default section title and every listed field label", () => {
    render(<PhenoDocumentationSections recordId="cand-1" recordType="candidate" />);
    for (const title of EXPECTED_SECTION_TITLES) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    for (const label of EXPECTED_LABELS) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    cleanup();
  });

  it("persists edited values and re-hydrates from storage without overwriting them", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };

    const { unmount } = render(
      <PhenoDocumentationSections recordId="cand-42" recordType="candidate" storage={storage} />,
    );

    const input = screen.getByTestId(
      "pheno-doc-field-receiver_cultivar-receiver_cultivar_name",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Banana Cough" } });
    fireEvent.click(screen.getByTestId("pheno-doc-save-candidate-cand-42"));
    expect(screen.getByTestId("pheno-doc-saved-candidate-cand-42")).toHaveAttribute(
      "role",
      "status",
    );
    unmount();

    // Remount: saved value must be present, defaults must NOT overwrite it.
    render(
      <PhenoDocumentationSections recordId="cand-42" recordType="candidate" storage={storage} />,
    );
    const reInput = screen.getByTestId(
      "pheno-doc-field-receiver_cultivar-receiver_cultivar_name",
    ) as HTMLInputElement;
    expect(reInput.value).toBe("Banana Cough");
    // A field that was never edited stays at the default empty string.
    const untouched = screen.getByTestId(
      "pheno-doc-field-breeding-date_of_pollination",
    ) as HTMLInputElement;
    expect(untouched.value).toBe("");
    cleanup();
  });

  it("shows a calm failure and never shows saved when device storage rejects the write", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };

    render(
      <PhenoDocumentationSections
        recordId="cand-storage-failure"
        recordType="candidate"
        storage={storage}
      />,
    );

    fireEvent.click(screen.getByTestId("pheno-doc-save-candidate-cand-storage-failure"));

    expect(
      screen.getByTestId("pheno-doc-save-failed-candidate-cand-storage-failure"),
    ).toHaveTextContent(/could not save on this device/i);
    expect(
      screen.queryByTestId("pheno-doc-saved-candidate-cand-storage-failure"),
    ).not.toBeInTheDocument();
    cleanup();
  });

  it("shows a calm failure when access to device storage itself is blocked", () => {
    const ownDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });

    try {
      render(<PhenoDocumentationSections recordId="cand-storage-blocked" recordType="candidate" />);
      fireEvent.click(screen.getByTestId("pheno-doc-save-candidate-cand-storage-blocked"));

      expect(
        screen.getByTestId("pheno-doc-save-failed-candidate-cand-storage-blocked"),
      ).toHaveTextContent(/could not save on this device/i);
      expect(
        screen.queryByTestId("pheno-doc-saved-candidate-cand-storage-blocked"),
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
      if (ownDescriptor) {
        Object.defineProperty(window, "localStorage", ownDescriptor);
      } else {
        delete (window as unknown as { localStorage?: Storage }).localStorage;
      }
    }
  });

  it("renders optional diary reference selector when diaryOptions are provided", () => {
    render(
      <PhenoDocumentationSections
        recordId="cand-7"
        recordType="candidate"
        diaryOptions={[
          { id: "d1", label: "Day 21 photo" },
          { id: "d2", label: "Day 35 note" },
        ]}
      />,
    );
    const selector = screen.getByTestId("pheno-doc-diary-receiver_cultivar") as HTMLSelectElement;
    expect(selector).toBeInTheDocument();
    expect(screen.getAllByText("Day 21 photo").length).toBeGreaterThan(0);
    cleanup();
  });
});

describe("PHENOHUNT documentation defaults — safety scan", () => {
  const files = [
    "src/components/PhenoDocumentationSections.tsx",
    "src/constants/phenoDocumentationDefaults.ts",
  ];
  const FORBIDDEN = [
    /action_queue/i,
    /actionQueue/,
    /ai-doctor/i,
    /aiDoctor/,
    /openai|anthropic|gemini/i,
    /sensor_readings|sensorIngest/i,
    /device[_-]?control|controlDevice|DeviceCommandClient/i,
    /executeDevice(?:Action|Command)|sendDeviceCommand|dispatchDeviceCommand/i,
    /sendCommand|switchRelay|relayCommand|actuator/i,
    /mqtt|home.?assistant|webhook|service_role/i,
    /autopilot|auto[- ]?(?:execute|run)|hidden automation/i,
  ];
  for (const f of files) {
    it(`${f} contains no AI / Action Queue / automation / device-control / sensor-ingest code`, () => {
      const src = readFileSync(path.resolve(process.cwd(), f), "utf8");
      for (const pattern of FORBIDDEN) {
        expect(src).not.toMatch(pattern);
      }
    });
  }
});
