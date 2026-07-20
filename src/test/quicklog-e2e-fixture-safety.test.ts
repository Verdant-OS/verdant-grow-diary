/**
 * Disposable E2E fixture safety guardrails.
 *
 * The Quick Log Playwright smoke writes real diary entries. These tests
 * assert that:
 *   - the fixture validator helpers enforce E2E_FIXTURE_MODE + expected
 *     grow/tent/plant names
 *   - they refuse to run against known real/production plant URLs
 *   - the Playwright fixture spec and helpers contain no delete/cleanup
 *     calls, no service_role, and no auth bypass
 *   - the workflow runs e2e:verify-fixture before e2e:quicklog-smoke and
 *     gates the smoke step on fixture-verification success
 *   - the workflow precheck requires the fixture safety vars
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  fixturePageRelationshipMatchesExpected,
  validateFixtureEnv,
  pageTextMatchesFixture,
  isLikelyRealPlantUrl,
} from "../../e2e/lib/fixtureSafety";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const VALID_ENV = {
  E2E_FIXTURE_MODE: "true",
  E2E_GROW_1_PLANT_URL: "https://test-account.example.com/plants/e2e-test-plant",
  E2E_FIXTURE_EXPECTED_GROW_NAME: "E2E Test Grow",
  E2E_FIXTURE_EXPECTED_TENT_NAME: "E2E Test Tent",
  E2E_FIXTURE_EXPECTED_PLANT_NAME: "E2E Test Plant",
};

describe("Disposable E2E fixture safety helpers", () => {
  it("accepts a fully configured E2E fixture env", () => {
    const r = validateFixtureEnv(VALID_ENV);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.expected).toEqual({
      grow: "E2E Test Grow",
      tent: "E2E Test Tent",
      plant: "E2E Test Plant",
    });
  });

  it("requires E2E_FIXTURE_MODE === 'true' exactly", () => {
    for (const mode of [undefined, "", "false", "1", "yes", "TRUE"]) {
      const r = validateFixtureEnv({ ...VALID_ENV, E2E_FIXTURE_MODE: mode });
      expect(r.ok, `mode=${String(mode)} should fail`).toBe(false);
      expect(r.errors.join("\n")).toMatch(/E2E_FIXTURE_MODE/);
    }
  });

  it("requires non-blank tent + plant expected names with E2E or Test markers; grow is optional", () => {
    for (const key of [
      "E2E_FIXTURE_EXPECTED_TENT_NAME",
      "E2E_FIXTURE_EXPECTED_PLANT_NAME",
    ] as const) {
      const blank = validateFixtureEnv({ ...VALID_ENV, [key]: "" });
      expect(blank.ok).toBe(false);
      expect(blank.errors.join("\n")).toMatch(new RegExp(key));

      const realLooking = validateFixtureEnv({
        ...VALID_ENV,
        [key]: "Granddaddy Purple",
      });
      expect(realLooking.ok).toBe(false);
      expect(realLooking.errors.join("\n")).toMatch(/E2E.*Test/);
    }

    // Grow is OPTIONAL — blank must NOT fail.
    const blankGrow = validateFixtureEnv({
      ...VALID_ENV,
      E2E_FIXTURE_EXPECTED_GROW_NAME: "",
    });
    expect(blankGrow.ok).toBe(true);
    expect(blankGrow.expected.grow).toBe("");

    // …but a supplied non-E2E grow name still fails.
    const badGrow = validateFixtureEnv({
      ...VALID_ENV,
      E2E_FIXTURE_EXPECTED_GROW_NAME: "Granddaddy Purple",
    });
    expect(badGrow.ok).toBe(false);
    expect(badGrow.errors.join("\n")).toMatch(/E2E.*Test/);
  });

  it("refuses blank or known-real plant URLs", () => {
    const blank = validateFixtureEnv({ ...VALID_ENV, E2E_GROW_1_PLANT_URL: "" });
    expect(blank.ok).toBe(false);
    expect(blank.errors.join("\n")).toMatch(/E2E_GROW_1_PLANT_URL/);

    const realProd = validateFixtureEnv({
      ...VALID_ENV,
      E2E_GROW_1_PLANT_URL: "https://verdantgrowdiary.com/plants/real-plant-id",
    });
    expect(realProd.ok).toBe(false);
    expect(realProd.errors.join("\n")).toMatch(/real|production/i);
  });

  it("isLikelyRealPlantUrl flags verdantgrowdiary.com and ignores empty/test hosts", () => {
    expect(isLikelyRealPlantUrl("https://verdantgrowdiary.com/plants/x")).toBe(true);
    expect(isLikelyRealPlantUrl("https://www.verdantgrowdiary.com/plants/x")).toBe(true);
    expect(isLikelyRealPlantUrl("")).toBe(false);
    expect(isLikelyRealPlantUrl("https://staging.example.com/plants/x")).toBe(false);
  });

  it("pageTextMatchesFixture requires E2E/Test markers and expected tent+plant; grow optional", () => {
    const expected = {
      grow: "E2E Test Grow",
      tent: "E2E Test Tent",
      plant: "E2E Test Plant",
    };
    const good = pageTextMatchesFixture(
      "Welcome to E2E Test Grow / E2E Test Tent / E2E Test Plant dashboard",
      expected,
    );
    expect(good.ok).toBe(true);

    const noMarkers = pageTextMatchesFixture(
      "Granddaddy Purple — Tent A — Grow Spring 2025",
      expected,
    );
    expect(noMarkers.ok).toBe(false);
    expect(noMarkers.errors.join("\n")).toMatch(/E2E.*Test|markers/i);

    const missingPlant = pageTextMatchesFixture(
      "E2E Test Grow / E2E Test Tent — but no plant name here",
      expected,
    );
    expect(missingPlant.ok).toBe(false);
    expect(missingPlant.errors.join("\n")).toContain("E2E Test Plant");

    // Grow optional: with no grow expected, a page that only shows
    // tent + plant must pass.
    const noGrowExpected = pageTextMatchesFixture("E2E Test Tent — E2E Test Plant detail", {
      grow: "",
      tent: "E2E Test Tent",
      plant: "E2E Test Plant",
    });
    expect(noGrowExpected.ok).toBe(true);

    // Grow optional: when grow IS expected and missing from the page,
    // verification must fail.
    const missingGrow = pageTextMatchesFixture("E2E Test Tent — E2E Test Plant detail", expected);
    expect(missingGrow.ok).toBe(false);
    expect(missingGrow.errors.join("\n")).toContain("E2E Test Grow");

    // Fails on generic "Test" / "Test" without expected names visible.
    const genericTest = pageTextMatchesFixture("Test / Test", expected);
    expect(genericTest.ok).toBe(false);
  });

  it("rejects a Plant Detail heading that only prefix-matches the configured plant", () => {
    const result = fixturePageRelationshipMatchesExpected(
      {
        plantHeading: "E2E Test Plant Clone",
        relatedTentName: "E2E Test Tent",
      },
      validateFixtureEnv(VALID_ENV).expected,
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/exact plant detail heading/i);
  });

  it("rejects the expected tent elsewhere when Plant Detail relates the plant to another tent", () => {
    const result = fixturePageRelationshipMatchesExpected(
      {
        plantHeading: "E2E Test Plant",
        relatedTentName: "E2E Test Tent Overflow",
      },
      validateFixtureEnv(VALID_ENV).expected,
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/related tent/i);
  });
});

describe("E2E fixture safety: source-level guardrails", () => {
  const files = ["e2e/lib/fixtureSafety.ts", "e2e/lib/authedTest.ts", "e2e/fixture-safety.spec.ts"];

  it("fixture helpers and spec exist", () => {
    for (const f of files) {
      expect(fs.existsSync(path.join(ROOT, f)), `${f} missing`).toBe(true);
    }
  });

  it("fixture sources never delete data, use service_role, or bypass auth", () => {
    for (const f of files) {
      const body = read(f);
      expect(body, `${f} must not delete`).not.toMatch(
        /\bDELETE\b|\.delete\(|\bdrop\s+table\b|\btruncate\b/i,
      );
      expect(body, `${f} must not overwrite names`).not.toMatch(
        /update\s+plants|update\s+grows|update\s+tents|rename/i,
      );
      expect(body, `${f} must not use service_role`).not.toMatch(/service_role/i);
      expect(body, `${f} must not bypass auth`).not.toMatch(/skipAuth|bypassAuth|AUTH_BYPASS/);
      expect(body, `${f} must not hardcode credentials`).not.toMatch(
        /password\s*[:=]\s*["'][^"']+["']/i,
      );
      expect(body, `${f} must not embed bearer tokens`).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    }
  });

  it("fixture spec relies on normal login (replayed via authedTest) and not on token injection", () => {
    const spec = read("e2e/fixture-safety.spec.ts");
    // The spec imports the shared authed test base, which replays the
    // sessionStorage snapshot captured by auth.setup.ts's REAL /auth UI
    // login (the app intentionally keeps its Supabase session in
    // sessionStorage — see docs/auth-security.md — which Playwright's
    // storageState cannot carry). No fabricated or hardcoded tokens.
    expect(spec).toMatch(/from\s+["']\.\/lib\/authedTest["']/);
    // Uses normal page.goto + assertions, no localStorage token poke
    expect(spec).not.toMatch(/localStorage[\s\S]{0,40}(token|session|auth)/i);
    expect(spec).toContain("validateQuickLogFixturePage");
    // The authed base itself must come from @playwright/test and must only
    // replay the auth.setup snapshot — never mint or embed tokens.
    const base = read("e2e/lib/authedTest.ts");
    expect(base).toMatch(/from\s+["']@playwright\/test["']/);
    expect(base).toContain("session-storage.json");
    expect(base).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
  });

  it("the standalone smoke validates the visible fixture immediately after navigation and before any write", () => {
    const smoke = read("e2e/quicklog-smoke.spec.ts");
    const helper = read("e2e/lib/fixtureSafety.ts");
    const fixtureSpec = read("e2e/fixture-safety.spec.ts");
    const goto = smoke.indexOf("await page.goto(PLANT_URL!)");
    const validate = smoke.indexOf("await validateQuickLogFixturePage(page");
    const reconsent = smoke.indexOf("await acceptReconsentGateIfShown(page)");
    const openQuickLog = smoke.indexOf("await openQuickLogDialog(page)");
    const firstSave = smoke.indexOf('getByTestId("quick-log-save").click()');

    expect(smoke).toMatch(
      /import\s*\{[^}]*validateQuickLogFixturePage[^}]*\}\s*from\s*["']\.\/lib\/fixtureSafety["']/s,
    );
    expect(goto).toBeGreaterThan(0);
    expect(validate).toBeGreaterThan(goto);
    expect(smoke.slice(goto, validate)).toMatch(/await page\.goto\(PLANT_URL!\);\s*$/);
    expect(validate).toBeLessThan(reconsent);
    expect(validate).toBeLessThan(openQuickLog);
    expect(validate).toBeLessThan(firstSave);

    expect(helper).toContain("export async function validateQuickLogFixturePage");
    expect(helper).toContain("validateFixtureEnv");
    expect(helper).toContain("pageTextMatchesFixture");
    expect(helper).toMatch(
      /getByRole\("heading",\s*\{[\s\S]*?level:\s*1,[\s\S]*?name:\s*envCheck\.expected\.plant,[\s\S]*?exact:\s*true/,
    );
    expect(helper).toContain('getByTestId("plant-detail-tent")');
    expect(helper).toMatch(
      /plant-detail-tent[\s\S]*?getByText\(envCheck\.expected\.tent,\s*\{\s*exact:\s*true\s*\}\)/,
    );
    expect(helper).not.toMatch(
      /getByText\(envCheck\.expected\.(?:plant|tent),\s*\{\s*exact:\s*false\s*\}\)/,
    );

    const fixtureGoto = fixtureSpec.indexOf("await page.goto(env.E2E_GROW_1_PLANT_URL!)");
    const fixtureValidate = fixtureSpec.indexOf("await validateQuickLogFixturePage(page, env)");
    expect(fixtureSpec).toMatch(
      /import\s*\{[^}]*validateQuickLogFixturePage[^}]*\}\s*from\s*["']\.\/lib\/fixtureSafety["']/s,
    );
    expect(fixtureValidate).toBeGreaterThan(fixtureGoto);
  });
});

describe("Workflow: fixture verification gates smoke", () => {
  const wf = read(".github/workflows/quicklog-smoke.yml");

  it("runs the non-writing checklist before optional bootstrap, verification, and smoke", () => {
    const checklist = wf.indexOf("- name: Print disposable E2E fixture checklist");
    const bootstrap = wf.indexOf("- name: Bootstrap disposable E2E fixture");
    const verify = wf.indexOf("- name: Verify disposable E2E fixture");
    const smoke = wf.indexOf("- name: Run Quick Log Playwright smoke");

    expect(checklist).toBeGreaterThan(0);
    expect(checklist).toBeLessThan(bootstrap);
    expect(bootstrap).toBeLessThan(verify);
    expect(verify).toBeLessThan(smoke);
    expect(wf).toMatch(
      /- name: Print disposable E2E fixture checklist[\s\S]*?if: steps\.e2e_config\.outputs\.should_run == 'true'[\s\S]*?run: bun run e2e:fixture-checklist/,
    );
  });

  it("precheck requires the fixture safety vars by sanitized name (grow optional)", () => {
    for (const name of [
      '"vars.E2E_FIXTURE_MODE"',
      '"vars.E2E_FIXTURE_EXPECTED_TENT_NAME"',
      '"vars.E2E_FIXTURE_EXPECTED_PLANT_NAME"',
    ]) {
      expect(wf).toContain(name);
    }
    // Grow name must NOT be in the missing[] precheck — current UI has
    // no Grow page in the setup flow.
    expect(wf).not.toMatch(/missing\+=\("vars\.E2E_FIXTURE_EXPECTED_GROW_NAME"\)/);
    // No secret VALUES are echoed
    expect(wf).not.toMatch(/echo[^\n]*\$E2E_FIXTURE_/);
  });

  it("verify_fixture step runs before smoke and gates it", () => {
    const verify = wf.match(/-\s*name:\s*Verify disposable E2E fixture[\s\S]*?(?=\n {6}- name:)/);
    expect(verify, "Verify disposable E2E fixture step missing").toBeTruthy();
    const vBlock = verify![0];
    expect(vBlock).toMatch(/id:\s*verify_fixture/);
    expect(vBlock).toContain("bun run e2e:verify-fixture");
    expect(vBlock).toMatch(/if:\s*steps\.e2e_config\.outputs\.should_run\s*==\s*'true'/);

    const smoke = wf.match(/-\s*name:\s*Run Quick Log Playwright smoke[\s\S]*?(?=\n {6}- name:)/);
    const sBlock = smoke![0];
    // Smoke is gated on fixture success
    expect(sBlock).toMatch(/steps\.verify_fixture\.outcome\s*==\s*'success'/);
  });

  it("summary reports fixture validation status", () => {
    const summary = wf.match(
      /-\s*name:\s*Write Quick Log smoke run summary[\s\S]*?(?=\n {6}- name:|\n*$)/,
    );
    const block = summary![0];
    expect(block).toMatch(/FIXTURE_STEP_OUTCOME/);
    expect(block).toMatch(/Fixture validation/);
    expect(block).toContain("not run");
    expect(block).toContain("passed");
    expect(block).toContain("failed");
    expect(block).toContain("skipped due missing config");
  });

  it("summary names Tent + Plant as required and Grow as optional", () => {
    const summary = wf.match(
      /-\s*name:\s*Write Quick Log smoke run summary[\s\S]*?(?=\n {6}- name:|\n*$)/,
    );
    const block = summary![0];
    expect(block).toContain("Tent + Plant fixture names are required; Grow name is optional.");

    const requiredStart = block.indexOf("Required configuration (names only");
    const optionalStart = block.indexOf("Optional configuration (names only");
    expect(requiredStart).toBeGreaterThanOrEqual(0);
    expect(optionalStart).toBeGreaterThan(requiredStart);
    const required = block.slice(requiredStart, optionalStart);
    const optional = block.slice(optionalStart);
    expect(required).toContain("E2E_FIXTURE_EXPECTED_TENT_NAME");
    expect(required).toContain("E2E_FIXTURE_EXPECTED_PLANT_NAME");
    expect(required).not.toContain("E2E_FIXTURE_EXPECTED_GROW_NAME");
    expect(optional).toContain("E2E_FIXTURE_EXPECTED_GROW_NAME");
  });

  it("smoke transitions to a named second plant in the routed plant's current grow", () => {
    const smoke = read("e2e/quicklog-smoke.spec.ts");
    const checklist = read("e2e/scripts/print-fixture-config-checklist.ts");
    expect(smoke).toContain("E2E_GROW_1_SECOND_PLANT_NAME");
    expect(smoke).not.toContain("E2E_GROW_2_PLANT_NAME");
    expect(smoke).toContain("getByText(TARGET_NAME, { exact: true })");
    expect(smoke).toMatch(/getByRole\("option"\)\.filter\(\{\s*has:\s*exactPlantName/);
    expect(smoke).toContain("await expect(targetOption).toHaveCount(1)");
    expect(smoke).not.toContain("exactAccessibleNameOptions");
    expect(smoke).not.toContain("new RegExp(TARGET_NAME");
    expect(smoke).toMatch(/selectedTarget\.growId\s*!==\s*initialTarget\.growId/);
    expect(smoke).toContain("One-Tent Loop card's CTA dispatches the canonical global prefill");
    expect(smoke).not.toContain("simplified Target/Action/Photo");
    expect(checklist).toContain("second plant in the same tent/grow");
    expect(checklist).toContain("E2E Test Plant 2");
  });

  it("uses an exact nested name locator instead of inferring a strain suffix", () => {
    const smoke = read("e2e/quicklog-smoke.spec.ts");
    const quickLog = read("src/components/QuickLog.tsx");
    expect(quickLog).toContain('data-testid="quick-log-plant-option-name"');
    expect(smoke).toContain("const exactPlantName = page.getByText(TARGET_NAME, { exact: true });");
    expect(smoke).toContain('const targetOption = page.getByRole("option").filter({');
    expect(smoke).toContain("has: exactPlantName");
    expect(smoke).not.toMatch(/TARGET_NAME.*(?:RegExp| · )/);
  });

  it("no schedule, no cron, no pull_request_target, no service_role, no checked-in storageState", () => {
    expect(wf).not.toMatch(/^\s*schedule\s*:/m);
    expect(wf).not.toMatch(/-\s*cron\s*:/);
    expect(wf).not.toMatch(/pull_request_target/);
    expect(wf).not.toMatch(/service_role/i);
    expect(fs.existsSync(path.join(ROOT, "e2e/.auth/user.json"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "e2e/.auth/session-storage.json"))).toBe(false);
  });
});

describe("Workflow: deep-link artifact uploads", () => {
  const wf = read(".github/workflows/quicklog-smoke.yml");

  const cases: { name: string; id: string; path: RegExp }[] = [
    {
      name: "quicklog-playwright-traces",
      id: "upload_playwright_traces",
      path: /test-results\/\*\*\/\*\.zip/,
    },
    {
      name: "quicklog-playwright-media",
      id: "upload_playwright_media",
      path: /test-results\/\*\*\/\*\.png/,
    },
    {
      name: "quicklog-smoke-report-json",
      id: "upload_smoke_report_json",
      path: /e2e\/results\/quicklog-smoke-report\.json/,
    },
    {
      name: "quicklog-smoke-report-txt",
      id: "upload_smoke_report_txt",
      path: /e2e\/results\/quicklog-smoke-report\.txt/,
    },
  ];

  for (const c of cases) {
    it(`uploads ${c.name} with stable id, always() && should_run, 30d retention, warn on missing`, () => {
      const re = new RegExp(
        `-\\s*name:\\s*Upload[\\s\\S]*?name:\\s*${c.name}[\\s\\S]*?(?=\\n {6}- name:|\\n*$)`,
      );
      const m = wf.match(re);
      expect(m, `upload step for ${c.name} missing`).toBeTruthy();
      const block = m![0];
      expect(block).toMatch(new RegExp(`id:\\s*${c.id}`));
      expect(block).toMatch(/uses:\s*actions\/upload-artifact@[0-9a-f]{40} # v4/);
      expect(block).toMatch(
        /if:\s*always\(\)\s*&&\s*steps\.e2e_config\.outputs\.should_run\s*==\s*'true'/,
      );
      expect(block).toMatch(/retention-days:\s*30/);
      expect(block).toMatch(/if-no-files-found:\s*warn/);
      expect(block).toMatch(c.path);
    });
  }

  it("summary links each dedicated artifact via artifact-url with fallback to ARTIFACTS_URL", () => {
    const summary = wf.match(
      /-\s*name:\s*Write Quick Log smoke run summary[\s\S]*?(?=\n {6}- name:|\n*$)/,
    );
    const block = summary![0];
    for (const env of [
      "PLAYWRIGHT_TRACES_ARTIFACT_URL",
      "PLAYWRIGHT_MEDIA_ARTIFACT_URL",
      "SMOKE_REPORT_JSON_ARTIFACT_URL",
      "SMOKE_REPORT_TXT_ARTIFACT_URL",
    ]) {
      expect(block).toContain(env);
      expect(block).toMatch(new RegExp(`\\$\\{${env}:-\\$fallback\\}`));
    }
    expect(block).toContain("[Playwright traces](${pw_traces_url})");
    expect(block).toContain("[Playwright media (screenshots/videos)](${pw_media_url})");
    expect(block).toContain("[Smoke report JSON](${smoke_json_url})");
    expect(block).toContain("[Smoke report TXT](${smoke_txt_url})");
    // No invented direct file URLs / no hardcoded run or artifact ids
    expect(block).not.toMatch(/runs\/\d{3,}/);
    expect(block).not.toMatch(/\/artifacts\/\d+/);
    // Downloads-not-hosted guidance
    expect(block).toMatch(/downloads,\s*not hosted/i);
  });
});

describe("Package + docs wiring", () => {
  it("package.json exposes e2e:verify-fixture script", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["e2e:verify-fixture"]).toBeTruthy();
    expect(pkg.scripts["e2e:verify-fixture"]).toContain("e2e/fixture-safety.spec.ts");
  });

  it("README documents the disposable E2E fixture and new artifacts", () => {
    const readme = read("e2e/README.md");
    expect(readme).toMatch(/##\s+Disposable E2E fixture/);
    for (const tok of [
      "E2E_FIXTURE_MODE",
      "E2E_FIXTURE_EXPECTED_GROW_NAME",
      "E2E_FIXTURE_EXPECTED_TENT_NAME",
      "E2E_FIXTURE_EXPECTED_PLANT_NAME",
      "E2E Test Grow",
      "E2E Test Tent",
      "E2E Test Plant",
      "bun run e2e:verify-fixture",
      "quicklog-playwright-traces",
      "quicklog-playwright-media",
      "quicklog-smoke-report-json",
      "quicklog-smoke-report-txt",
    ]) {
      expect(readme, `README missing token: ${tok}`).toContain(tok);
    }
    // No automated bootstrap promise
    expect(readme.toLowerCase()).toContain("deferred");
    // Reaffirm no scheduled smoke
    expect(readme).toMatch(/no scheduled or nightly/i);
  });

  it("README says direct smoke invocation performs the same internal fixture validation", () => {
    const readme = read("e2e/README.md");
    expect(readme).toMatch(
      /bun run e2e:quicklog-smoke[\s\S]{0,500}(?:internally|itself)[\s\S]{0,200}(?:fixture validation|validates the fixture)/i,
    );
    expect(readme).toMatch(/Tent \+ Plant[^\n]*required[^\n]*Grow[^\n]*optional/i);
  });

  it("README direct local smoke snippets include every required fixture guard", () => {
    const readme = read("e2e/README.md");
    const directSmokeBlocks = [...readme.matchAll(/```(?:bash|powershell)\r?\n([\s\S]*?)```/g)]
      .map((match) => match[1])
      .filter((block) => /(?:^|\r?\n)bun run e2e:quicklog-smoke\r?\n?$/.test(block));

    expect(directSmokeBlocks).toHaveLength(4);
    for (const block of directSmokeBlocks) {
      expect(block).toContain("E2E_FIXTURE_MODE");
      expect(block).toContain("E2E_FIXTURE_EXPECTED_TENT_NAME");
      expect(block).toContain("E2E_FIXTURE_EXPECTED_PLANT_NAME");
    }
  });
});
