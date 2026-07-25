import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOWS_DIR = path.resolve(__dirname, "../../.github/workflows");

function workflowFiles(): string[] {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function actionReference(line: string): string | null {
  const match = line.match(/^\s*(?:-\s*)?uses:\s*([^#]+?)(?:\s+#.*)?$/);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

describe("GitHub Actions reference policy", () => {
  it("recognizes both mapping and compact list-step uses syntax", () => {
    expect(actionReference("      uses: owner/action@0123456789012345678901234567890123456789")).toBe(
      "owner/action@0123456789012345678901234567890123456789",
    );
    expect(
      actionReference(
        "      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4",
      ),
    ).toBe("actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5");
  });

  it("pins every external action to an immutable commit SHA", () => {
    const violations: string[] = [];

    for (const fileName of workflowFiles()) {
      const lines = fs
        .readFileSync(path.join(WORKFLOWS_DIR, fileName), "utf8")
        .replace(/\r\n?/g, "\n")
        .split("\n");

      lines.forEach((line, index) => {
        const reference = actionReference(line);
        if (!reference) return;
        if (reference.startsWith("./")) return;

        const pinned = reference.startsWith("docker://")
          ? /@sha256:[0-9a-f]{64}$/i.test(reference)
          : /@[0-9a-f]{40}$/i.test(reference);

        if (!pinned) {
          violations.push(`${fileName}:${index + 1} ${reference}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
