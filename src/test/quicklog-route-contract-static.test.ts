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

  it("registers the exact V1/V2 RPC observer before navigation and retains only a safe target id", () => {
    const observer = SMOKE.indexOf('page.on("request"');
    const navigation = SMOKE.indexOf("await page.goto(PLANT_URL!)");
    expect(observer).toBeGreaterThan(0);
    expect(observer).toBeLessThan(navigation);
    expect(SMOKE).toContain('endsWith("/rpc/quicklog_save_manual")');
    expect(SMOKE).toContain('endsWith("/rpc/quicklog_save_event")');
    expect(SMOKE).toMatch(/body\.p_target_id/);
    expect(SMOKE).toMatch(/body\.p_target_id\s*\?\?\s*body\.p_plant_id/);
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
    expect(step![0]).toContain("if (!selectedTarget)");
    expect(step![0]).toContain('getByTestId("qlv2-target-panel-plant-value")');
    expect(step![0]).toContain("toHaveText(");
    expect(step![0]).toMatch(/expect\.poll\(\(\)\s*=>\s*observedRpcTargetId\)/);
    expect(step![0]).toMatch(/toBe\(selectedTarget\.plantId\)/);
    expect(step![0]).toContain('getByTestId("qlv2-save").click()');
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
