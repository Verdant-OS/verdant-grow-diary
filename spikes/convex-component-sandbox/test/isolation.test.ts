// @vitest-environment node
/**
 * @source-scan-justified: P5/P6 are compile-negative fixtures. This test must
 * prove the deliberately forbidden expressions remain present before tsc can
 * prove that the generated data models reject them.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const COMPONENT_ROOT = resolve(ROOT, "convex/components/abuse_guard");
const LOCAL_PROOF_RECEIPT = resolve(ROOT, "artifacts/anonymous-local-proof-2026-08-13.json");

function listFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root).sort()) {
    if (name === "node_modules" || name === "_generated") continue;
    const path = join(root, name);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

describe("physical-isolation compile and leakage fences", () => {
  it("P5/P6 compile-negative probes remain rejected by their data models", () => {
    const componentProbe = readFileSync(resolve(COMPONENT_ROOT, "isolationProbe.ts"), "utf8");
    const parentProbe = readFileSync(resolve(ROOT, "convex/componentMutationProbe.ts"), "utf8");
    expect(componentProbe).toContain('ctx.db.query("grower_notes")');
    expect(parentProbe).toContain("ctx.db.patch(componentBucketId");

    const result = spawnSync("bun", ["x", "tsc", "-p", "tsconfig.boundaries.json", "--noEmit"], {
      cwd: ROOT,
      encoding: "utf8",
    });

    expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
      status: 0,
      stderr: "",
      stdout: "",
    });
  });

  it("P7 keeps grower-note bodies out of component arguments and returns", () => {
    const source = listFiles(COMPONENT_ROOT)
      .filter((path) => /\.ts$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\bbody\b/);
  });

  it("P8 keeps the synthetic parent secret out of the component tree", () => {
    const source = listFiles(COMPONENT_ROOT)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(source).not.toContain("PARENT_SECRET_MUST_NOT_LEAK");
  });

  it("keeps the anonymous-local P5/P6 receipt sanitized and explicit", () => {
    const source = readFileSync(LOCAL_PROOF_RECEIPT, "utf8");
    const receipt = JSON.parse(source) as {
      environment: { cloud_deployment_used: boolean; convex_account_used: boolean };
      source_binding: {
        repository_base_commit: string;
        hash_algorithm: string;
        files: Record<string, string>;
      };
      proofs: {
        P5: { component_result: unknown; parent_rows_before: number; parent_rows_after: number };
        P6: {
          component_id_non_null: boolean;
          patch_error_category: string;
          component_count_before: number;
          component_count_after: number;
          parent_rows_before: number;
          parent_rows_after: number;
        };
      };
    };

    expect(receipt.environment).toMatchObject({
      cloud_deployment_used: false,
      convex_account_used: false,
    });
    expect(receipt.source_binding).toMatchObject({
      repository_base_commit: "68c0098176f1755d129fe4d1d5e382c494ae1aac",
      hash_algorithm: "sha256",
    });
    expect(Object.keys(receipt.source_binding.files).sort()).toEqual([
      "convex.json",
      "convex/_generated/api.d.ts",
      "convex/_generated/dataModel.d.ts",
      "convex/componentMutationProbe.ts",
      "convex/components/abuse_guard/_generated/api.ts",
      "convex/components/abuse_guard/_generated/component.ts",
      "convex/components/abuse_guard/_generated/dataModel.ts",
      "convex/components/abuse_guard/_generated/server.ts",
      "convex/components/abuse_guard/check.ts",
      "convex/components/abuse_guard/convex.config.ts",
      "convex/components/abuse_guard/isolationProbe.ts",
      "convex/components/abuse_guard/schema.ts",
      "convex/convex.config.ts",
      "convex/guardBridge.ts",
      "convex/notes.ts",
      "convex/schema.ts",
      "package.json",
    ]);
    for (const [path, expectedHash] of Object.entries(receipt.source_binding.files)) {
      const actualHash = createHash("sha256")
        .update(readFileSync(resolve(ROOT, path)))
        .digest("hex");
      expect(actualHash, `${path} changed after the local proof was recorded`).toBe(expectedHash);
    }
    expect(receipt.proofs.P5.component_result).toBeNull();
    expect(receipt.proofs.P5.parent_rows_before).toBeGreaterThan(0);
    expect(receipt.proofs.P5.parent_rows_after).toBe(receipt.proofs.P5.parent_rows_before);
    expect(receipt.proofs.P6.component_id_non_null).toBe(true);
    expect(receipt.proofs.P6.patch_error_category).toBe("nonexistent_document");
    expect(receipt.proofs.P6.component_count_before).toBeGreaterThan(0);
    expect(receipt.proofs.P6.component_count_after).toBe(receipt.proofs.P6.component_count_before);
    expect(receipt.proofs.P6.parent_rows_after).toBe(receipt.proofs.P6.parent_rows_before);
    expect(source).not.toContain("PARENT_SECRET_MUST_NOT_LEAK");
    expect(source).not.toMatch(/\bj[0-9a-z]{20,}\b/);
  });
});
