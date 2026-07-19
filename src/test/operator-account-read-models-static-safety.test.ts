import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = [
  "src/lib/operatorAccountReadModels.ts",
  "src/lib/operatorAccountReadModelsViewModel.ts",
  "src/lib/operatorWateringContextViewModel.ts",
  "src/hooks/useOperatorAccountReadModels.ts",
  "src/components/OperatorAccountReadModelsPanel.tsx",
  "src/pages/OperatorDemoPreview.tsx",
];

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function codeOnly(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
}

describe("owner-scoped Operator read-model safety", () => {
  it.each(FILES)("%s contains no mutation, edge invoke, or irrigation command", (path) => {
    const code = codeOnly(source(path));
    expect(code).not.toMatch(/\.insert\s*\(/);
    expect(code).not.toMatch(/\.update\s*\(/);
    expect(code).not.toMatch(/\.upsert\s*\(/);
    expect(code).not.toMatch(/\.delete\s*\(/);
    expect(code).not.toMatch(/\.rpc\s*\(/);
    expect(code).not.toMatch(/functions\.invoke/);
    expect(code).not.toMatch(/service[_-]?role/i);
    expect(code).not.toMatch(/\b(?:start|run|open|close|set)\s+(?:pump|valve|irrigation)\b/i);
  });

  it("keeps raw sensor provenance inside the shared acquisition boundary", () => {
    const shared = source("src/lib/operatorAccountReadModels.ts");
    expect(shared).toMatch(/SENSOR_COLUMNS[\s\S]*raw_payload/);
    expect(shared).toMatch(/withoutDiagnosticSensorRows/);
    expect(shared).toMatch(/satisfies McpSensorReading/);

    for (const path of [
      "src/lib/operatorAccountReadModelsViewModel.ts",
      "src/lib/operatorWateringContextViewModel.ts",
      "src/hooks/useOperatorAccountReadModels.ts",
      "src/components/OperatorAccountReadModelsPanel.tsx",
      "src/pages/OperatorDemoPreview.tsx",
    ]) {
      expect(codeOnly(source(path))).not.toMatch(/\braw_payload\b/);
    }
  });

  it("never emits watering decisions or equipment instructions", () => {
    const combined = FILES.map(source).join("\n").toLowerCase();
    for (const phrase of [
      "water now",
      "skip watering",
      "start pump",
      "open valve",
      "set irrigation",
      "automatic watering",
      "auto-water",
    ]) {
      expect(combined).not.toContain(phrase);
    }
  });
});
