/**
 * Guardrails for the expanded Quick Log smoke surface:
 *   - .jpeg / .gif media coverage
 *   - bootstrap step gated by vars.E2E_ALLOW_FIXTURE_BOOTSTRAP == 'true'
 *   - bootstrap source safety (no delete/cleanup/service_role/auth bypass)
 *   - bootstrap gate logic (env requires explicit flags + E2E/Test names)
 *   - account rotation docs (no hardcoded credentials)
 *   - fixture checklist docs (screenshots + redaction guidance)
 *   - summary includes bootstrap status, downloads-only artifact links
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluateBootstrapGate } from "../../e2e/lib/fixtureBootstrap";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const VALID_GATE_ENV = {
  E2E_FIXTURE_MODE: "true",
  E2E_ALLOW_FIXTURE_BOOTSTRAP: "true",
  E2E_FIXTURE_EXPECTED_GROW_NAME: "E2E Test Grow",
  E2E_FIXTURE_EXPECTED_TENT_NAME: "E2E Test Tent",
  E2E_FIXTURE_EXPECTED_PLANT_NAME: "E2E Test Plant",
  E2E_GROW_1_PLANT_URL: "https://test-account.example.com/plants/e2e",
};

describe("Bootstrap gate (pure)", () => {
  it("allows bootstrap only with both flags + E2E/Test names", () => {
    expect(evaluateBootstrapGate(VALID_GATE_ENV).allowed).toBe(true);
  });
  it("refuses when E2E_ALLOW_FIXTURE_BOOTSTRAP is not exactly 'true'", () => {
    for (const v of [undefined, "", "false", "1", "TRUE", "yes"]) {
      const r = evaluateBootstrapGate({
        ...VALID_GATE_ENV,
        E2E_ALLOW_FIXTURE_BOOTSTRAP: v,
      });
      expect(r.allowed, `allow=${String(v)}`).toBe(false);
      expect(r.errors.join("\n")).toMatch(/E2E_ALLOW_FIXTURE_BOOTSTRAP/);
    }
  });
  it("refuses when E2E_FIXTURE_MODE is not exactly 'true'", () => {
    const r = evaluateBootstrapGate({
      ...VALID_GATE_ENV,
      E2E_FIXTURE_MODE: "false",
    });
    expect(r.allowed).toBe(false);
    expect(r.errors.join("\n")).toMatch(/E2E_FIXTURE_MODE/);
  });
  it("refuses names without E2E or Test markers", () => {
    const r = evaluateBootstrapGate({
      ...VALID_GATE_ENV,
      E2E_FIXTURE_EXPECTED_PLANT_NAME: "Granddaddy Purple",
    });
    expect(r.allowed).toBe(false);
    expect(r.errors.join("\n")).toMatch(/E2E.*Test/);
  });
  it("refuses known-real plant URLs even when other flags are set", () => {
    const r = evaluateBootstrapGate({
      ...VALID_GATE_ENV,
      E2E_GROW_1_PLANT_URL: "https://verdantgrowdiary.com/plants/x",
    });
    expect(r.allowed).toBe(false);
    expect(r.errors.join("\n")).toMatch(/real|production/i);
  });
});

describe("Bootstrap source safety", () => {
  const files = [
    "e2e/lib/fixtureBootstrap.ts",
    "e2e/fixture-bootstrap.spec.ts",
  ];
  it("files exist", () => {
    for (const f of files)
      expect(fs.existsSync(path.join(ROOT, f)), `${f} missing`).toBe(true);
  });
  it("bootstrap source has no delete/cleanup/destructive calls", () => {
    for (const f of files) {
      const body = read(f);
      expect(body, `${f} delete`).not.toMatch(
        /\bDELETE\b|\.delete\(|\bdrop\s+table\b|\btruncate\b|\bcleanup\b|\.remove\(|\.destroy\(/i,
      );
      expect(body, `${f} rename/overwrite`).not.toMatch(
        /\brename\b|update\s+plants|update\s+grows|update\s+tents/i,
      );
      expect(body, `${f} service_role`).not.toMatch(/service_role/i);
      expect(body, `${f} auth bypass`).not.toMatch(
        /skipAuth|bypassAuth|AUTH_BYPASS/,
      );
      expect(body, `${f} hardcoded password`).not.toMatch(
        /password\s*[:=]\s*["'][^"']+["']/i,
      );
      expect(body, `${f} bearer token`).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    }
  });
  it("bootstrap source references only the exact expected E2E names from env (no hardcoded plant names)", () => {
    const body = read("e2e/lib/fixtureBootstrap.ts");
    // Names come from expected.* (env-derived). Bootstrap source must not
    // hardcode product plant names like "Granddaddy Purple".
    expect(body).not.toMatch(/Granddaddy/i);
    expect(body).toMatch(/expected\.grow/);
    expect(body).toMatch(/expected\.tent/);
    expect(body).toMatch(/expected\.plant/);
  });
  it("bootstrap requires both E2E_FIXTURE_MODE and E2E_ALLOW_FIXTURE_BOOTSTRAP in source", () => {
    const body = read("e2e/lib/fixtureBootstrap.ts");
    expect(body).toContain("E2E_FIXTURE_MODE");
    expect(body).toContain("E2E_ALLOW_FIXTURE_BOOTSTRAP");
  });
});

describe("Workflow: bootstrap step + media expansion + summary", () => {
  const wf = read(".github/workflows/quicklog-smoke.yml");

  it("has a Bootstrap step gated by vars.E2E_ALLOW_FIXTURE_BOOTSTRAP == 'true'", () => {
    const m = wf.match(
      /-\s*name:\s*Bootstrap disposable E2E fixture[\s\S]*?(?=\n {6}- name:)/,
    );
    expect(m, "Bootstrap step missing").toBeTruthy();
    const block = m![0];
    expect(block).toMatch(/id:\s*bootstrap_fixture/);
    expect(block).toMatch(
      /if:\s*steps\.e2e_config\.outputs\.should_run\s*==\s*'true'\s*&&\s*vars\.E2E_ALLOW_FIXTURE_BOOTSTRAP\s*==\s*'true'/,
    );
    expect(block).toContain("bun run e2e:bootstrap-fixture");
  });

  it("bootstrap is not required for fixture verification — verify step runs without bootstrap gating", () => {
    const m = wf.match(
      /-\s*name:\s*Verify disposable E2E fixture[\s\S]*?(?=\n {6}- name:)/,
    );
    const block = m![0];
    expect(block).not.toMatch(/E2E_ALLOW_FIXTURE_BOOTSTRAP/);
    expect(block).toMatch(
      /if:\s*steps\.e2e_config\.outputs\.should_run\s*==\s*'true'/,
    );
  });

  it("smoke still gated by fixture verification success (not by bootstrap)", () => {
    const m = wf.match(
      /-\s*name:\s*Run Quick Log Playwright smoke[\s\S]*?(?=\n {6}- name:)/,
    );
    const block = m![0];
    expect(block).toMatch(/steps\.verify_fixture\.outcome\s*==\s*'success'/);
    expect(block).not.toMatch(/steps\.bootstrap_fixture/);
  });

  it("media artifact includes .png, .jpg, .jpeg, .gif, .webm, .mp4", () => {
    const m = wf.match(
      /name:\s*quicklog-playwright-media[\s\S]*?path:\s*\|\n([\s\S]*?)retention-days:/,
    );
    expect(m, "media path block missing").toBeTruthy();
    const block = m![1];
    for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webm", ".mp4"]) {
      expect(block, `media missing ${ext}`).toMatch(
        new RegExp(`test-results/\\*\\*/\\*\\${ext}`),
      );
    }
    expect(block).toContain("playwright-report/data/**");
  });

  it("Playwright HTML report artifact includes playwright-report/", () => {
    const m = wf.match(
      /name:\s*quicklog-playwright-report[\s\S]*?(?=\n {6}- name:)/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/path:\s*playwright-report\//);
  });

  it("traces artifact keeps test-results/**/*.zip", () => {
    const m = wf.match(
      /name:\s*quicklog-playwright-traces[\s\S]*?(?=\n {6}- name:)/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/test-results\/\*\*\/\*\.zip/);
  });

  it("all dedicated upload artifact steps use v4 + retention 30 + warn", () => {
    const ids = [
      "upload_playwright_report",
      "upload_playwright_traces",
      "upload_playwright_media",
      "upload_smoke_report_json",
      "upload_smoke_report_txt",
    ];
    for (const id of ids) {
      const m = wf.match(
        new RegExp(`id:\\s*${id}[\\s\\S]*?(?=\\n {6}- name:|\\n*$)`),
      );
      expect(m, `${id} missing`).toBeTruthy();
      const block = m![0];
      expect(block, `${id} uses v4`).toMatch(
        /uses:\s*actions\/upload-artifact@v4/,
      );
      expect(block, `${id} retention 30`).toMatch(/retention-days:\s*30/);
      expect(block, `${id} warn`).toMatch(/if-no-files-found:\s*warn/);
      expect(block, `${id} always() && should_run`).toMatch(
        /if:\s*always\(\)\s*&&\s*steps\.e2e_config\.outputs\.should_run\s*==\s*'true'/,
      );
    }
  });

  it("summary surfaces bootstrap status and downloads-only language", () => {
    const m = wf.match(
      /-\s*name:\s*Write Quick Log smoke run summary[\s\S]*?(?=\n {6}- name:|\n*$)/,
    );
    const block = m![0];
    expect(block).toContain("BOOTSTRAP_ALLOW");
    expect(block).toContain("BOOTSTRAP_STEP_OUTCOME");
    expect(block).toContain("Bootstrap status");
    expect(block).toContain("not enabled");
    expect(block).toContain("passed");
    expect(block).toContain("failed");
    expect(block).toContain("skipped");
    // Downloads-only language; no invented raw URLs
    expect(block).toMatch(/downloads/i);
    expect(block).not.toMatch(/runs\/\d{3,}/);
    expect(block).not.toMatch(/\/artifacts\/\d+/);
  });

  it("workflow still has no schedule/cron/pull_request_target/service_role and no checked-in storageState", () => {
    expect(wf).not.toMatch(/^\s*schedule\s*:/m);
    expect(wf).not.toMatch(/-\s*cron\s*:/);
    expect(wf).not.toMatch(/pull_request_target/);
    expect(wf).not.toMatch(/service_role/i);
    expect(wf).not.toMatch(/password\s*:\s*["'][^"'$]+["']/i);
    expect(fs.existsSync(path.join(ROOT, "e2e/.auth/user.json"))).toBe(false);
  });
});

describe("Docs: rotation + fixture setup + screenshots", () => {
  it("README documents rotation with no hardcoded credentials", () => {
    const readme = read("e2e/README.md");
    expect(readme).toMatch(/##\s+Rotate or recreate the disposable E2E account/);
    expect(readme.toLowerCase()).toContain("no hardcoded credentials");
    expect(readme).toContain("secrets.E2E_TEST_EMAIL");
    expect(readme).toContain("secrets.E2E_TEST_PASSWORD");
    expect(readme).toContain("E2E_FIXTURE_EXPECTED_ACCOUNT_HINT");
    expect(readme).toContain("workflow_dispatch");
    // Bootstrap is referenced and gated
    expect(readme).toContain("E2E_ALLOW_FIXTURE_BOOTSTRAP");
    expect(readme).toContain("bun run e2e:bootstrap-fixture");
    expect(readme).toContain("bun run e2e:fixture-checklist");
    // Media coverage documented
    for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webm", ".mp4"])
      expect(readme, `media ext doc: ${ext}`).toContain(ext);
  });

  it("FIXTURE_SETUP.md exists with checklist + screenshots + redaction guidance", () => {
    const p = path.join(ROOT, "e2e/FIXTURE_SETUP.md");
    expect(fs.existsSync(p)).toBe(true);
    const doc = fs.readFileSync(p, "utf8");
    for (const tok of [
      "E2E Test Grow",
      "E2E Test Tent",
      "E2E Test Plant",
      "505 Headbanger",
      "E2E_TEST_EMAIL",
      "E2E_TEST_PASSWORD",
      "E2E_FIXTURE_MODE",
      "E2E_FIXTURE_EXPECTED_ACCOUNT_HINT",
      "E2E_ALLOW_FIXTURE_BOOTSTRAP",
      "Rotate or recreate",
      "screenshot",
      "redact",
    ]) {
      expect(doc, `FIXTURE_SETUP.md missing: ${tok}`).toMatch(
        new RegExp(tok, "i"),
      );
    }
    expect(doc.toLowerCase()).toContain("never");
    expect(doc).toMatch(/no hardcoded credentials/i);
  });

  it("screenshots README warns against real-grow screenshots", () => {
    const p = path.join(ROOT, "e2e/docs/screenshots/README.md");
    expect(fs.existsSync(p)).toBe(true);
    const doc = fs.readFileSync(p, "utf8");
    expect(doc.toLowerCase()).toContain("never");
    expect(doc.toLowerCase()).toMatch(/real|production/);
    expect(doc.toLowerCase()).toContain("redact");
  });

  it("checklist script exists, calls no network, prints no secret values", () => {
    const p = "e2e/scripts/print-fixture-config-checklist.ts";
    expect(fs.existsSync(path.join(ROOT, p))).toBe(true);
    const body = read(p);
    expect(body).not.toMatch(/process\.env\.E2E_TEST_PASSWORD/);
    expect(body).not.toMatch(/process\.env\.E2E_TEST_EMAIL/);
    expect(body).not.toMatch(/fetch\(|http\.|https\.|supabase/i);
    expect(body).not.toMatch(/service_role/i);
    expect(body).not.toMatch(/\.delete\(|\bDELETE\b/);
  });

  it("package.json exposes e2e:bootstrap-fixture and e2e:fixture-checklist", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["e2e:bootstrap-fixture"]).toContain(
      "e2e/fixture-bootstrap.spec.ts",
    );
    expect(pkg.scripts["e2e:fixture-checklist"]).toContain(
      "print-fixture-config-checklist.ts",
    );
  });
});
