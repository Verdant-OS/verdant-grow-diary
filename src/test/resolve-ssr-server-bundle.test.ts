/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  formatBlockedMessage,
  resolveSsrServerBundle,
} from "../../scripts/resolve-ssr-server-bundle.mjs";

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "ssr-bundle-"));
}

describe("resolveSsrServerBundle", () => {
  it("finds .output/server/index.mjs (current Nitro layout)", () => {
    const cwd = tempWorkspace();
    try {
      const file = join(cwd, ".output/server/index.mjs");
      mkdirSync(join(cwd, ".output/server"), { recursive: true });
      writeFileSync(file, "export default { fetch() {} }\n");
      const result = resolveSsrServerBundle({ cwd });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toBe(file);
        expect(result.source).toBe("nitro_output");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("finds legacy dist/server/index.mjs when Nitro path is absent", () => {
    const cwd = tempWorkspace();
    try {
      const file = join(cwd, "dist/server/index.mjs");
      mkdirSync(join(cwd, "dist/server"), { recursive: true });
      writeFileSync(file, "export default { fetch() {} }\n");
      const result = resolveSsrServerBundle({ cwd, distDir: join(cwd, "dist") });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toBe(file);
        expect(result.source).toBe("legacy_dist");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prefers an explicit bundle path over defaults", () => {
    const cwd = tempWorkspace();
    try {
      const nitro = join(cwd, ".output/server/index.mjs");
      const explicit = join(cwd, "custom/server.mjs");
      mkdirSync(join(cwd, ".output/server"), { recursive: true });
      mkdirSync(join(cwd, "custom"), { recursive: true });
      writeFileSync(nitro, "export default {}\n");
      writeFileSync(explicit, "export default {}\n");
      const result = resolveSsrServerBundle({ cwd, explicitPath: explicit });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toBe(explicit);
        expect(result.source).toBe("explicit");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("returns a clear blocked result listing every path checked", () => {
    const cwd = tempWorkspace();
    try {
      const result = resolveSsrServerBundle({ cwd });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.checked.length).toBeGreaterThanOrEqual(2);
        expect(result.checked.some((p) => p.includes(".output/server/index.mjs"))).toBe(true);
        expect(result.checked.some((p) => p.includes("server/index.mjs"))).toBe(true);
        const msg = formatBlockedMessage(result);
        expect(msg).toMatch(/BLOCKED/);
        expect(msg).toMatch(/Checked:/);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("does not accept a directory as a server bundle", () => {
    const cwd = tempWorkspace();
    try {
      // Create directory where a file is expected
      mkdirSync(join(cwd, ".output/server/index.mjs"), { recursive: true });
      const result = resolveSsrServerBundle({ cwd });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/not a file/);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
