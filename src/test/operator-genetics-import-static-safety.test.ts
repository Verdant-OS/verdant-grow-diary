/**
 * operator-genetics-import-static-safety — lock the preview-only safety
 * boundary for /operator/genetics-import.
 *
 * Inspects the source text of the genetics import preview surface and
 * asserts no Supabase, network, persistence, Action Queue, automation,
 * or device-control paths have been introduced. Also asserts the
 * preview-only user-facing copy and local-only export/template helpers
 * remain in place.
 *
 * False-positive avoidance:
 *   - Blob downloads are allowed.
 *   - URL.createObjectURL is allowed.
 *   - FileReader / File / Blob are allowed.
 *   - The plain words "saved" and "batch" on their own are allowed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PREVIEW_FILES = [
  "src/lib/verdantGeneticsImportPreviewRules.ts",
  "src/components/VerdantGeneticsImportPreviewTable.tsx",
  "src/components/VerdantGeneticsXlsxImportPanel.tsx",
  "src/pages/OperatorGeneticsImportPage.tsx",
] as const;

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/** Strip JS/TS comments so safety doc strings don't trip pattern checks. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const SOURCES: Record<string, string> = Object.fromEntries(
  PREVIEW_FILES.map((p) => [p, stripComments(read(p))]),
);
const RAW_SOURCES: Record<string, string> = Object.fromEntries(
  PREVIEW_FILES.map((p) => [p, read(p)]),
);

interface ForbiddenPattern {
  name: string;
  test: (src: string) => boolean;
}

const forbidden: ForbiddenPattern[] = [
  {
    name: 'from "@/integrations/supabase"',
    test: (s) => /from\s+["']@\/integrations\/supabase/.test(s),
  },
  {
    name: 'from "../integrations/supabase"',
    test: (s) => /from\s+["']\.\.\/integrations\/supabase/.test(s),
  },
  { name: "supabase.", test: (s) => /\bsupabase\./.test(s) },
  { name: ".functions.invoke", test: (s) => /\.functions\.invoke\b/.test(s) },
  { name: "fetch(", test: (s) => /(^|[^.\w])fetch\s*\(/.test(s) },
  { name: "XMLHttpRequest", test: (s) => /\bXMLHttpRequest\b/.test(s) },
  { name: "navigator.sendBeacon", test: (s) => /navigator\.sendBeacon\b/.test(s) },
  { name: "localStorage.setItem", test: (s) => /localStorage\.setItem\b/.test(s) },
  { name: "sessionStorage.setItem", test: (s) => /sessionStorage\.setItem\b/.test(s) },
  { name: "service_role", test: (s) => /service_role/i.test(s) },
  { name: "SUPABASE_SERVICE_ROLE", test: (s) => /SUPABASE_SERVICE_ROLE/i.test(s) },
  { name: "action_queue", test: (s) => /\baction_queue\b/i.test(s) },
  // CRUD verbs as method calls. Avoid plain words. Require .verb( pattern.
  { name: ".insert(", test: (s) => /\.insert\s*\(/.test(s) },
  { name: ".update(", test: (s) => /\.update\s*\(/.test(s) },
  { name: ".upsert(", test: (s) => /\.upsert\s*\(/.test(s) },
  { name: ".delete(", test: (s) => /\.delete\s*\(/.test(s) },
  { name: ".rpc(", test: (s) => /\.rpc\s*\(/.test(s) },
  { name: "device_control", test: (s) => /device_control/i.test(s) },
  { name: "automation keyword", test: (s) => /\bautomation\b/i.test(s) },
  { name: "executeDevice", test: (s) => /executeDevice/i.test(s) },
  { name: "sendCommand", test: (s) => /sendCommand/i.test(s) },
  { name: "bridge token", test: (s) => /bridge[_\s-]*token/i.test(s) },
  { name: "VERDANT_BRIDGE_TOKEN", test: (s) => /VERDANT_BRIDGE_TOKEN/.test(s) },
];

describe("operator genetics import: static safety (preview-only boundary)", () => {
  for (const file of PREVIEW_FILES) {
    describe(file, () => {
      const src = SOURCES[file];
      for (const f of forbidden) {
        it(`does not contain forbidden pattern: ${f.name}`, () => {
          expect(f.test(src), `Forbidden pattern "${f.name}" found in ${file}`).toBe(false);
        });
      }
    });
  }

  it("preview panel renders preview-only headline copy", () => {
    const panel = RAW_SOURCES["src/components/VerdantGeneticsXlsxImportPanel.tsx"];
    expect(panel).toContain("XLSX genetics import preview");
    expect(panel).toContain("No data saved until confirmed");
    expect(panel).toMatch(
      /This tool validates genetics spreadsheets in-browser\.\s+Batch linking is\s+not enabled yet\./,
    );
    expect(panel).toContain(
      "Batch linking is not enabled yet. Preview is safe and no data has been saved.",
    );
  });

  it("operator page repeats the in-browser / batch-linking-not-enabled copy", () => {
    const page = RAW_SOURCES["src/pages/OperatorGeneticsImportPage.tsx"];
    expect(page).toMatch(
      /This tool validates genetics spreadsheets in-browser\.\s+Batch linking is\s+not enabled yet\./,
    );
    expect(page).toMatch(/No data\s+is saved until\s+confirmed/);
  });

  it("local-only export and template helpers remain in pure rules module", () => {
    const rules = RAW_SOURCES["src/lib/verdantGeneticsImportPreviewRules.ts"];
    expect(rules).toContain("buildGeneticsValidationReportCsv");
    expect(rules).toContain("buildGeneticsTemplateCsv");
    expect(rules).toContain("verdant-genetics-validation-report.csv");
    expect(rules).toContain("verdant-genetics-template.csv");
  });

  it("allowed local-only browser APIs are not mistakenly flagged (sanity)", () => {
    const panel = RAW_SOURCES["src/components/VerdantGeneticsXlsxImportPanel.tsx"];
    // These should be present and are explicitly allowed.
    expect(panel).toContain("URL.createObjectURL");
    expect(panel).toContain("Blob");
  });
});
