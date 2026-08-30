/**
 * Regression fence for scripts/check-no-src-lib-imports.mjs.
 *
 * Proves the CI guard still rejects @/ aliases, src escapes, Windows
 * absolute paths, browser bare modules, and dynamic import() forms —
 * and that package.json + CI workflows still invoke the script.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  classifyForbiddenSpecifier,
  findForbiddenImportsInSource,
  scanFunctionsTree,
  REASONS,
} from "../../scripts/check-no-src-lib-imports.mjs";

const ROOT = resolve(__dirname, "../..");

describe("classifyForbiddenSpecifier", () => {
  it("flags Vite aliases and npm:@/ leaks", () => {
    expect(classifyForbiddenSpecifier("@/lib/ecUnits")).toBe("vite_alias");
    expect(classifyForbiddenSpecifier("npm:@/lib/ecUnits")).toBe("vite_alias");
    expect(classifyForbiddenSpecifier("@/components/ui/button")).toBe("vite_alias");
  });

  it("allows scoped npm packages that are not @/", () => {
    expect(classifyForbiddenSpecifier("npm:@supabase/supabase-js")).toBeNull();
    expect(classifyForbiddenSpecifier("@supabase/supabase-js")).toBeNull();
  });

  it("flags relative escapes into src/**", () => {
    expect(classifyForbiddenSpecifier("../../../src/lib/foo")).toBe("src_escape");
    expect(classifyForbiddenSpecifier("../../src/hooks/useX")).toBe("src_escape");
  });

  it("flags Windows absolute and npm:C: forms", () => {
    expect(classifyForbiddenSpecifier("C:\\Users\\a\\proj\\src\\lib\\x.ts")).toBe(
      "windows_absolute",
    );
    expect(classifyForbiddenSpecifier("npm:C:/Users/a/x.ts")).toBe("windows_absolute");
  });

  it("flags browser bare modules", () => {
    expect(classifyForbiddenSpecifier("react")).toBe("browser_bare");
    expect(classifyForbiddenSpecifier("react-dom/client")).toBe("browser_bare");
    expect(classifyForbiddenSpecifier("npm:react")).toBe("browser_bare");
  });

  it("allows normal edge-safe specs", () => {
    expect(classifyForbiddenSpecifier("../_shared/lib/lib/foo.ts")).toBeNull();
    expect(classifyForbiddenSpecifier("npm:@supabase/supabase-js")).toBeNull();
    expect(classifyForbiddenSpecifier("jsr:@std/assert")).toBeNull();
    expect(classifyForbiddenSpecifier("node:fs")).toBeNull();
    expect(classifyForbiddenSpecifier("https://esm.sh/zod")).toBeNull();
  });
});

describe("findForbiddenImportsInSource", () => {
  it("catches static and dynamic forms", () => {
    const src = `
      import x from "@/lib/ecUnits";
      export { y } from "../../../src/lib/y";
      const z = await import("react");
      import "npm:@/lib/leak";
    `;
    const hits = findForbiddenImportsInSource(src);
    const specs = hits.map((h) => h.spec).sort();
    expect(specs).toEqual(
      expect.arrayContaining(["@/lib/ecUnits", "../../../src/lib/y", "react", "npm:@/lib/leak"]),
    );
  });

  it("ignores clean edge entry sources", () => {
    const src = `
      import { createClient } from "npm:@supabase/supabase-js@2";
      import { rule } from "../_shared/lib/lib/sensorTruthCanon.ts";
    `;
    expect(findForbiddenImportsInSource(src)).toEqual([]);
  });
});

describe("scanFunctionsTree (fixture)", () => {
  it("reports offenders under a synthetic functions tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "edge-import-guard-"));
    const fnDir = join(dir, "mcp");
    mkdirSync(fnDir, { recursive: true });
    writeFileSync(
      join(fnDir, "index.ts"),
      `import { x } from "@/lib/ecUnits";\nexport const n = 1;\n`,
      "utf8",
    );
    writeFileSync(join(fnDir, "ok.ts"), `import { a } from "../_shared/lib/a.ts";\n`, "utf8");

    const offenders = scanFunctionsTree(dir);
    expect(offenders.length).toBeGreaterThanOrEqual(1);
    expect(offenders.some((o) => o.spec === "@/lib/ecUnits" && o.reason === "vite_alias")).toBe(
      true,
    );
  });
});

describe("CI / package wiring cannot drop the guard", () => {
  const pkg = readFileSync(join(ROOT, "package.json"), "utf8");
  const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const preview = readFileSync(join(ROOT, ".github/workflows/deployment-preview.yml"), "utf8");
  const edgeWf = readFileSync(join(ROOT, ".github/workflows/edge-shared-sync.yml"), "utf8");
  const script = readFileSync(join(ROOT, "scripts/check-no-src-lib-imports.mjs"), "utf8");

  it("package.json prebuild + predeploy + check script invoke the guard", () => {
    // Asserted on the PARSED manifest. The previous source regexes could not
    // distinguish `scripts.prebuild` from any other key spelled "prebuild"
    // elsewhere in the file, and matched a substring of the value rather than
    // proving the guard is actually invoked by that script.
    const scripts = JSON.parse(pkg).scripts as Record<string, string>;
    expect(scripts["check:no-src-lib-imports"]).toBeTruthy();
    for (const name of ["prebuild", "predeploy:functions", "predeploy:functions:all"]) {
      expect(scripts[name], `${name} must invoke the guard`).toContain(
        "check-no-src-lib-imports.mjs",
      );
    }
  });

  it("CI preflight, deployment-preview, and edge-shared-sync run the guard", () => {
    expect(ci).toMatch(/node scripts\/check-no-src-lib-imports\.mjs/);
    expect(ci).toMatch(/edge-shared-sync-preflight/);
    expect(preview).toMatch(/node scripts\/check-no-src-lib-imports\.mjs/);
    expect(edgeWf).toMatch(/node scripts\/check-no-src-lib-imports\.mjs/);
  });

  it("script still encodes all four forbidden classes", () => {
    expect(script).toMatch(/ALIAS_RE|vite_alias/);
    expect(script).toMatch(/SRC_ESCAPE_RE|src_escape/);
    expect(script).toMatch(/WINDOWS_ABSOLUTE_RE|windows_absolute/);
    expect(script).toMatch(/browser_bare|BROWSER_BARE/);
    expect(script).toMatch(/DYNAMIC_IMPORT_RE/);
    expect(Object.keys(REASONS).sort()).toEqual(
      ["browser_bare", "src_escape", "vite_alias", "windows_absolute"].sort(),
    );
  });

  it("CLI exits 0 on the real tree (current tip is clean)", () => {
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/check-no-src-lib-imports.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(r.status, r.stderr || r.stdout).toBe(0);
    expect(r.stdout).toMatch(/OK/);
  });
});
