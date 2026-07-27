import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const executable = (path: string) => stripSourceComments(read(path));

describe("live-sensor bridge security boundary", () => {
  it("has no frontend path that reads or interpolates a session JWT into cURL", () => {
    const component = executable("src/components/TentSensorWebhookSettingsCard.tsx");
    const rules = executable("src/lib/sensorWebhookSettingsRules.ts");

    expect(component).not.toMatch(
      /getSession|onAuthStateChange|access_token|sessionToken|revealToken|copyWithLiveToken/,
    );
    expect(rules).not.toMatch(/sessionToken|revealToken|YOUR_SESSION_TOKEN/);
    expect(`${component}\n${rules}`).toContain("VBT_BRIDGE_TOKEN");
  });

  it.each([
    "supabase/functions/mint-bridge-token/index.ts",
    "supabase/functions/sensor-ingest-webhook/index.ts",
    "supabase/functions/ecowitt-ingest/index.ts",
  ])("%s requires the server-side live-sensor capability before its protected write", (path) => {
    const source = executable(path);
    const gateAt = source.indexOf("requireLiveSensorEntitlement(");
    const protectedWriteAt = path.includes("mint-bridge-token")
      ? source.indexOf('.from("bridge_tokens")')
      : source.indexOf('.from("sensor_readings")');

    expect(gateAt).toBeGreaterThan(-1);
    expect(protectedWriteAt).toBeGreaterThan(gateAt);
    expect(source).not.toMatch(/profiles|\.tier\b|body\.(?:plan|plan_id|capabilities|liveSensors)/);
  });

  it("scopes service-role entitlement reads to the server-resolved token owner", () => {
    const lookup = executable("supabase/functions/_shared/unionEntitlementLookup.ts");
    const gate = executable("supabase/functions/_shared/liveSensorEntitlementGate.ts");

    expect(lookup).toMatch(/loadUnionEntitlementForUser/);
    expect(lookup).toMatch(/\.from\("billing_subscriptions"\)/);
    expect(lookup).toMatch(/\.eq\("user_id",\s*userId\)/);
    expect(gate).toMatch(/loadUnionEntitlementForUser/);
    expect(gate).toMatch(/capabilities\.liveSensors\s*!==\s*true/);
  });
});
