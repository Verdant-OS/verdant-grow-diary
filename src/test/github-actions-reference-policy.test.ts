import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOWS_DIR = path.resolve(__dirname, "../../.github/workflows");

const REVIEWED_NODE_24_ACTIONS = new Map<string, string>([
  ["actions/cache", "55cc8345863c7cc4c66a329aec7e433d2d1c52a9"],
  ["actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1"],
  ["actions/download-artifact", "3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c"],
  ["actions/github-script", "3a2844b7e9c422d3c10d287c895573f7108da1b3"],
  ["actions/setup-node", "820762786026740c76f36085b0efc47a31fe5020"],
  ["actions/setup-python", "5fda3b95a4ea91299a34e894583c3862153e4b97"],
  ["actions/upload-artifact", "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"],
  ["DataDog/synthetics-ci-github-action", "c84a23515bda46d8a060f77a6ad88644377f90be"],
  ["dawidd6/action-download-artifact", "b6e2e70617bc3265edd6dab6c906732b2f1ae151"],
  ["denoland/setup-deno", "22d081ff2d3a40755e97629de92e3bcbfa7cf2ed"],
  ["dorny/paths-filter", "7b450fff21473bca461d4b92ce414b9d0420d706"],
  ["github/codeql-action/upload-sarif", "e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81"],
  ["marocchino/sticky-pull-request-comment", "5770ad5eb8f42dd2c4f34da00c94c5381e49af88"],
  ["oven-sh/setup-bun", "0c5077e51419868618aeaa5fe8019c62421857d6"],
]);

const REVIEWED_COMPOSITE_ACTIONS = new Map<string, string>([
  ["supabase/setup-cli", "3c2f5e2ae34c34e428e8e206e2c4d21fa2d20fbf"],
]);

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
    expect(
      actionReference("      uses: owner/action@0123456789012345678901234567890123456789"),
    ).toBe("owner/action@0123456789012345678901234567890123456789");
    expect(
      actionReference(
        "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
      ),
    ).toBe("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
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

  it("keeps JavaScript actions on the reviewed Node 24 releases", () => {
    const violations: string[] = [];

    for (const fileName of workflowFiles()) {
      const lines = fs
        .readFileSync(path.join(WORKFLOWS_DIR, fileName), "utf8")
        .replace(/\r\n?/g, "\n")
        .split("\n");

      lines.forEach((line, index) => {
        const reference = actionReference(line);
        if (!reference) return;

        const separator = reference.lastIndexOf("@");
        if (separator < 1) return;
        const action = reference.slice(0, separator);
        const reviewedSha =
          REVIEWED_NODE_24_ACTIONS.get(action) ?? REVIEWED_COMPOSITE_ACTIONS.get(action);
        if (!reviewedSha) {
          if (!reference.startsWith("./") && !reference.startsWith("docker://")) {
            violations.push(`${fileName}:${index + 1} has no reviewed runtime: ${reference}`);
          }
          return;
        }

        const expected = `${action}@${reviewedSha}`;
        if (reference !== expected) {
          violations.push(`${fileName}:${index + 1} expected ${expected}, found ${reference}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("does not configure retired Node 20 jobs or the unsupported node_version input", () => {
    const violations: string[] = [];

    for (const fileName of workflowFiles()) {
      const lines = fs
        .readFileSync(path.join(WORKFLOWS_DIR, fileName), "utf8")
        .replace(/\r\n?/g, "\n")
        .split("\n");

      lines.forEach((line, index) => {
        if (/\bnode_version\s*:/.test(line)) {
          violations.push(`${fileName}:${index + 1} uses node_version instead of node-version`);
        }
        if (/\bnode-version\s*:\s*["']?20["']?\s*(?:#.*)?$/.test(line)) {
          violations.push(`${fileName}:${index + 1} configures retired Node 20`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
