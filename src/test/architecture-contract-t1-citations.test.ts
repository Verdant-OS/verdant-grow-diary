/**
 * T1 runner (partial) for docs/architecture-contract.md — GDP-ARCH-CITE-001.
 *
 * Soft #1088 inserted comment lines that drifted five sensorSourceRules.ts
 * line cites while the old line numbers still existed. Existence-only checks
 * would have stayed green; these tests require the cited snippet on the line.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GDP_ARCH_CITE_001_SENSOR_SOURCE_RULES_PINS,
  expandArchitectureContractLineSpec,
  normalizeArchitectureContractSnippet,
  parseArchitectureContractSnippetCitations,
  validateArchitectureContractCitationPins,
  validateArchitectureContractSnippetCitations,
} from "@/lib/architectureContractT1Rules";

const ROOT = resolve(__dirname, "../..");
const CONTRACT_PATH = resolve(ROOT, "docs/architecture-contract.md");

describe("architecture contract — T1 GDP-ARCH-CITE-001 sensorSourceRules pins", () => {
  it("contract doc exists", () => {
    expect(existsSync(CONTRACT_PATH)).toBe(true);
  });

  it("amended T1 requires snippet match, not existence-only", () => {
    const doc = readFileSync(CONTRACT_PATH, "utf8");
    expect(doc).toMatch(/existence-only T1 would have stayed green/i);
    expect(doc).toMatch(/short expected snippet appears on the cited line/i);
  });

  it("pinned sensorSourceRules cites resolve at the current repo tip", () => {
    const failures = validateArchitectureContractCitationPins(
      GDP_ARCH_CITE_001_SENSOR_SOURCE_RULES_PINS,
      ROOT,
    );
    expect(failures).toEqual([]);
  });

  it("fails when a pinned line number drifts but the file still exists", () => {
    const drifted = GDP_ARCH_CITE_001_SENSOR_SOURCE_RULES_PINS.map((pin) =>
      pin.snippet === 'ALIAS[v] ?? "invalid"'
        ? { ...pin, lineNumbers: [pin.lineNumbers[0] - 2] }
        : pin,
    );
    const failures = validateArchitectureContractCitationPins(drifted, ROOT);
    expect(failures.some((f) => f.snippet === 'ALIAS[v] ?? "invalid"')).toBe(true);
  });

  it("architecture-contract _Source cites include the pinned sensorSourceRules snippets", () => {
    const doc = readFileSync(CONTRACT_PATH, "utf8");
    const parsed = parseArchitectureContractSnippetCitations(doc).filter((cite) =>
      cite.file.endsWith("sensor/sensorSourceRules.ts"),
    );

    for (const pin of GDP_ARCH_CITE_001_SENSOR_SOURCE_RULES_PINS) {
      expect(
        parsed.some(
          (cite) =>
            cite.snippet === pin.snippet &&
            cite.lineNumbers.join(",") === pin.lineNumbers.join(","),
        ),
        `missing doc cite for ${pin.snippet} @ ${pin.lineNumbers.join(",")}`,
      ).toBe(true);
    }
  });
});

describe("architectureContractT1Rules helpers", () => {
  it("expands comma and range line specs", () => {
    expect(expandArchitectureContractLineSpec("16")).toEqual([16]);
    expect(expandArchitectureContractLineSpec("21-23")).toEqual([21, 22, 23]);
    expect(expandArchitectureContractLineSpec("24-28,88")).toEqual([24, 25, 26, 27, 28, 88]);
  });

  it("strips decorative backticks from contract parentheticals", () => {
    expect(normalizeArchitectureContractSnippet("`SENSOR_SOURCES`")).toBe("SENSOR_SOURCES");
  });
});

describe("architecture contract — code-snippet cites parsed from doc", () => {
  it("validates sensorSourceRules code-snippet cites without failures", () => {
    const doc = readFileSync(CONTRACT_PATH, "utf8");
    const failures = validateArchitectureContractSnippetCitations(doc, ROOT).filter((failure) =>
      failure.file.endsWith("sensor/sensorSourceRules.ts"),
    );
    expect(failures).toEqual([]);
  });
});
