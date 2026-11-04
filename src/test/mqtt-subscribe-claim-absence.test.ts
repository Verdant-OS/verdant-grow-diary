/**
 * VER-341: public pages must not claim Verdant subscribes to MQTT topic streams.
 * The sentences live inline in the page modules, so this reads those sources.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readPage = (name: string) => readFileSync(resolve(__dirname, "..", "pages", name), "utf8");

const PAGES = ["HardwareIntegrations.tsx", "Pricing.tsx"] as const;

// Every phrasing VER-341 removed. `\s+` spans the JSX line wraps in the visible FAQ.
const REMOVED_CLAIMS = [
  /subscribe\s+to\s+topic\s+streams/i,
  /connect\s+sensors\s+over\s+webhook,\s+MQTT/i,
  /bring\s+sensors\s+over\s+webhook,\s+MQTT/i,
] as const;

describe("public MQTT copy does not claim a topic subscription", () => {
  it.each(PAGES)("%s carries none of the removed MQTT claims", (page) => {
    const source = readPage(page);
    for (const claim of REMOVED_CLAIMS) {
      expect(source).not.toMatch(claim);
    }
  });
});
