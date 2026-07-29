import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = path.resolve(__dirname, "../../.github/workflows/seo-monitoring.yml");
const workflow = fs.readFileSync(workflowPath, "utf8").replace(/\r\n?/g, "\n");

const NODE_24_ACTION_REFS = [
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  "dawidd6/action-download-artifact@b6e2e70617bc3265edd6dab6c906732b2f1ae151",
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
] as const;

describe("SEO monitoring workflow contract", () => {
  it("uses the supported setup-node input and the repository Node 22 baseline", () => {
    expect(workflow).toContain('node-version: "22"');
    expect(workflow).not.toMatch(/\bnode_version\s*:/);
  });

  it("pins every JavaScript action in the job to its reviewed Node 24 release", () => {
    for (const reference of NODE_24_ACTION_REFS) {
      expect(workflow).toContain(`uses: ${reference}`);
    }

    const externalReferences = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^#\s]+)/gm)].map(
      ([, reference]) => reference,
    );
    expect(externalReferences).toEqual(NODE_24_ACTION_REFS);
  });

  it("keeps previous-report download failure-tolerant and excludes it from the new artifact", () => {
    expect(workflow).toMatch(
      /name: Download previous SEO artifacts \(for diff\)[\s\S]*?continue-on-error: true[\s\S]*?workflow: seo-monitoring\.yml/,
    );
    expect(workflow).toContain("!artifacts/seo/previous/**");
    expect(workflow).toContain("if-no-files-found: ignore");
  });
});
