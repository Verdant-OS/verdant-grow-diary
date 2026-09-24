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

/**
 * True when `script` runs the guard AND a guard failure fails the script. The guard is
 * its own command, `node scripts/check-no-src-lib-imports.mjs` with optional arguments;
 * it is not reached through `||`, which skips it when the command before succeeds; and
 * every operator after it is `&&`. A later `;` or `||` lets another command's exit
 * status replace the guard's: `guard; echo build` and `guard || true` both exit 0 when
 * the guard fails. A bare mention (`echo check-no-src-lib-imports.mjs`) runs nothing
 * (CodeRabbit, #1221 rounds 13 and 15). A script holding `#` is rejected outright: the
 * shell drops a comment's text, which this split would still read as commands (round 16).
 */
function invokesGuard(script: string | undefined): boolean {
  if ((script ?? "").includes("#")) return false;
  // Commands and the operators between them, alternating: [cmd, op, cmd, op, cmd].
  const parts = (script ?? "").trim().split(/\s*(&&|\|\||;)\s*/);
  return parts.some(
    (command, i) =>
      i % 2 === 0 &&
      /^node\s+(?:\.\/)?scripts\/check-no-src-lib-imports\.mjs(?:\s+[^|&;]*)?$/.test(command) &&
      parts[i - 1] !== "||" &&
      parts.slice(i + 1).every((op, k) => k % 2 === 1 || op === "&&"),
  );
}

describe("invokesGuard — a script runs the guard, not merely names it (CodeRabbit, #1221 round 13)", () => {
  it("accepts the guard as a command, alone or chained with &&", () => {
    expect(invokesGuard("node scripts/check-no-src-lib-imports.mjs")).toBe(true);
    expect(
      invokesGuard(
        "node scripts/a.mjs && node scripts/check-no-src-lib-imports.mjs && node scripts/b.mjs",
      ),
    ).toBe(true);
  });

  it("rejects a mention, a command after ||, a swallowed failure, and a missing script", () => {
    expect(invokesGuard("echo check-no-src-lib-imports.mjs")).toBe(false);
    expect(invokesGuard("echo node scripts/check-no-src-lib-imports.mjs")).toBe(false);
    expect(invokesGuard("true || node scripts/check-no-src-lib-imports.mjs")).toBe(false);
    expect(invokesGuard("node scripts/check-no-src-lib-imports.mjs || true")).toBe(false);
    expect(invokesGuard(undefined)).toBe(false);
  });

  it("rejects a later `;` or `||` that replaces the guard's exit status (CodeRabbit, #1221 round 15)", () => {
    // `false; echo build` exits 0: after `;` the last command's status is the script's.
    expect(invokesGuard("node scripts/check-no-src-lib-imports.mjs; echo build")).toBe(false);
    expect(
      invokesGuard("node scripts/check-no-src-lib-imports.mjs && node scripts/b.mjs; echo x"),
    ).toBe(false);
    expect(
      invokesGuard("node scripts/check-no-src-lib-imports.mjs && node scripts/b.mjs || true"),
    ).toBe(false);
    // A `;` BEFORE the guard is harmless: the guard runs, and its status is the script's.
    expect(invokesGuard("echo start; node scripts/check-no-src-lib-imports.mjs")).toBe(true);
  });

  it("rejects a guard behind a shell comment (CodeRabbit, #1221 round 16)", () => {
    // After `#` the rest of the line is a comment, so the shell never runs the guard.
    expect(invokesGuard("echo setup # && node scripts/check-no-src-lib-imports.mjs")).toBe(false);
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
    // The script named after the guard must run it too; truthiness admitted "echo skip"
    // (CodeRabbit, #1221 round 17).
    for (const name of [
      "check:no-src-lib-imports",
      "prebuild",
      "predeploy:functions",
      "predeploy:functions:all",
    ]) {
      expect(invokesGuard(scripts[name]), `${name} must invoke the guard: ${scripts[name]}`).toBe(
        true,
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
