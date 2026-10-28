/**
 * Cross-surface contract: EcoWitt bridge tooling must tell operators to install
 * the optional `mqtt` npm package with `bun add --no-save mqtt` so package.json
 * and bun.lock stay unchanged in the repo checkout.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONFIG_ERROR_FIX_HINTS } from "../../scripts/ecowitt-live-soil-bridge";

const repoRoot = resolve(__dirname, "..", "..");

const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

const MQTT_INSTALL_SCRIPTS = [
  "scripts/dev/ecowitt-http-local-bridge.ts",
  "scripts/dev/ecowitt-local-bridge-smoke.ts",
  "scripts/dev/ecowitt-mqtt-runner.ts",
  "scripts/dev/ecowitt-windows-fast-path.ts",
  "scripts/ecowitt-live-soil-bridge.ts",
] as const;

const MQTT_INSTALL_DOCS = [
  "docs/ecowitt-bridge-startup-validation.md",
  "docs/ecowitt-live-soil-bridge.md",
  "docs/integrations/ecowitt-mqtt-local-bridge.md",
  "docs/integrations/ecowitt-pc-dry-run-runbook.md",
] as const;

describe("EcoWitt mqtt install — --no-save contract", () => {
  it("CONFIG_ERROR_FIX_HINTS.mqtt_package_missing recommends --no-save", () => {
    expect(CONFIG_ERROR_FIX_HINTS.mqtt_package_missing).toMatch(/bun add --no-save mqtt/);
    expect(CONFIG_ERROR_FIX_HINTS.mqtt_package_missing).toMatch(/package\.json.*bun\.lock|bun\.lock.*package\.json/i);
  });

  for (const rel of MQTT_INSTALL_SCRIPTS) {
    it(`${rel} error text uses bun add --no-save mqtt`, () => {
      const src = read(rel);
      expect(src).toMatch(/bun add --no-save mqtt/);
      expect(src).not.toMatch(/Run `bun add mqtt`/);
      expect(src).not.toMatch(/run `bun add mqtt`/);
    });
  }

  for (const rel of MQTT_INSTALL_DOCS) {
    it(`${rel} documents bun add --no-save mqtt for operators`, () => {
      const body = read(rel);
      expect(body).toContain("bun add --no-save mqtt");
    });
  }
});
