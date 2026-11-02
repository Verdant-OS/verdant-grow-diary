/**
 * VER-341: public pages must not claim Verdant subscribes to MQTT topic streams.
 * The sentences live inline in the page modules, so this reads those sources.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readPage = (name: string) => readFileSync(resolve(__dirname, "..", "pages", name), "utf8");

const PAGES = ["HardwareIntegrations.tsx", "Pricing.tsx"] as const;

describe("public MQTT copy does not claim a topic subscription", () => {
  it.each(PAGES)("%s does not say subscribe to topic streams", (page) => {
    expect(readPage(page)).not.toMatch(/subscribe to topic streams/i);
  });
});
