import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const SMOKE = read("e2e/quicklog-smoke.spec.ts");

describe("Quick Log authenticated route target contract", () => {
  it("uses checklist steps 1-3 for route, resolved target, and selected-target transition", () => {
    expect(SMOKE).toMatch(/report\.run\(1,\s*"Validate initial plant route target"/);
    expect(SMOKE).toMatch(/report\.run\(2,\s*"Resolve exact Quick Log target card"/);
    expect(SMOKE).toMatch(/report\.run\(3,\s*"Change the selected target tuple"/);
  });

  it("registers the exact RPC observer before navigation and retains only p_target_id", () => {
    const observer = SMOKE.indexOf('page.on("request"');
    const navigation = SMOKE.indexOf("await page.goto(PLANT_URL!)");
    expect(observer).toBeGreaterThan(0);
    expect(observer).toBeLessThan(navigation);
    expect(SMOKE).toContain('endsWith("/rpc/quicklog_save_manual")');
    expect(SMOKE).toMatch(/body\.p_target_id/);
    expect(SMOKE).toMatch(/observedRpcTargetId\s*=\s*candidate/);
    expect(SMOKE).not.toMatch(
      /(?:console\.log|writeFileSync)\([^\n]*(?:postData|requestBody|requestPayload|rawPayload)/,
    );
  });

  it("compares step 15's RPC target with the target card immediately before Save", () => {
    const step = SMOKE.match(
      /report\.run\(15,\s*"Save uses displayed target"[\s\S]*?(?=report\.run\(16,)/,
    );
    expect(step, "step 15 target assertion missing").toBeTruthy();
    expect(step![0]).toContain("const displayedTarget = await readTargetTuple(dialog)");
    expect(step![0]).toContain("const displayedTargetId = displayedTarget.plantId");
    expect(step![0]).toMatch(/expect\.poll\(\(\)\s*=>\s*observedRpcTargetId\)/);
    expect(step![0]).toMatch(/toBe\(displayedTargetId\)/);
    expect(step![0]).toContain('getByTestId("quick-log-save").click()');
  });

  it("revalidates the fixture boundary before structured handoff and both successful saves", () => {
    const cases = [
      {
        step: 12,
        next: 13,
        action: 'getByRole("button", { name: /^watering$/i, exact: true }).click()',
      },
      {
        step: 15,
        next: 16,
        action: 'getByTestId("quick-log-save").click()',
      },
      {
        step: 21,
        next: 22,
        action: 'getByTestId("quick-log-save").click()',
      },
    ] as const;

    for (const { step, next, action } of cases) {
      const block = SMOKE.match(
        new RegExp(`report\\.run\\(${step},[\\s\\S]*?(?=report\\.run\\(${next},)`),
      );
      expect(block, `step ${step} fixture-boundary assertion missing`).toBeTruthy();
      const guard = block![0].indexOf("assertSameQuickLogFixtureBoundary(initialTarget,");
      const actionIndex = block![0].indexOf(action);
      expect(guard, `step ${step} must invoke the tested fixture-boundary guard`).toBeGreaterThan(
        0,
      );
      expect(actionIndex, `step ${step} action missing`).toBeGreaterThan(guard);
    }
  });

  it("keeps Watering on the structured Quick Log v2 handoff instead of the legacy Event select", () => {
    const step = SMOKE.match(
      /report\.run\(12,\s*"Watering opens the structured Quick Log"[\s\S]*?(?=report\.run\(13,)/,
    );
    expect(step, "step 12 structured Watering handoff assertion missing").toBeTruthy();
    expect(step![0]).toMatch(/getByRole\("button",\s*\{\s*name:\s*\/\^watering\$\/i/);
    expect(step![0]).toContain('getByTestId("qlv2-watering-form")');
    expect(step![0]).toContain('getByLabel("Volume (ml)")');
    expect(step![0]).not.toContain('locator("#quick-log-event-type")');
    expect(step![0]).not.toMatch(/getByRole\("option",\s*\{\s*name:\s*\/\^watering/);
  });

  it("never serializes intercepted request data into the smoke reports", () => {
    expect(SMOKE).not.toMatch(
      /report\.(?:run|skip)\([^\n]*(?:postData|requestBody|requestPayload|rawPayload)/,
    );
    expect(SMOKE).not.toMatch(
      /JSON\.stringify\([^\n]*(?:postData|requestBody|requestPayload|rawPayload)/,
    );
  });
});
