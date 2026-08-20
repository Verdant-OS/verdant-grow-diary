import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../components/LocalDataHealthPanel.tsx"),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = SOURCE.indexOf(start);
  const endIndex = SOURCE.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return SOURCE.slice(startIndex, endIndex);
}

describe("LocalDataHealthPanel — JSON parser detail redaction", () => {
  it("routes both rendered diagnostics paths through one exception-hiding parser", () => {
    const checksPath = sourceBetween(
      "function checkLocalSchema",
      "async function checkDiaryAccess",
    );
    const drawerPath = sourceBetween("function buildRemediationEntry", "function categoryLabel");

    expect(checksPath).toContain("parseStoredJson(raw)");
    expect(drawerPath).toContain("parseStoredJson(raw)");
    expect(checksPath).not.toContain("JSON.parse(raw)");
    expect(drawerPath).not.toContain("JSON.parse(raw)");
  });

  it("discards the parser exception and exposes only fixed copy", () => {
    const parserBoundary = sourceBetween("function parseStoredJson", "function safeStorage");

    expect(parserBoundary).toContain("JSON.parse(raw)");
    expect(parserBoundary).toContain("catch {");
    expect(parserBoundary).not.toMatch(/catch\s*\([^)]*\)/);
    expect(parserBoundary).not.toMatch(/\.message|String\s*\(/);
    expect(SOURCE).toContain(
      '"Stored value is not valid JSON. The parser error is withheld because it can quote the stored value."',
    );
  });
});
