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
    expect(step![0]).toContain('getAttribute("data-target-plant-id")');
    expect(step![0]).toMatch(/expect\.poll\(\(\)\s*=>\s*observedRpcTargetId\)/);
    expect(step![0]).toMatch(/toBe\(displayedTargetId\)/);
    expect(step![0]).toContain('getByTestId("quick-log-save").click()');
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
