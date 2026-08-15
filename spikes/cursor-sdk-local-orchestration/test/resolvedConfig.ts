import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SPIKE_ROOT = join(fileURLToPath(new URL("..", import.meta.url)));

export async function resolvedVitestEnvironment(): Promise<string> {
  const config = await import(join(SPIKE_ROOT, "vitest.config.ts"));
  return config.default.test.environment;
}

export function readSpikeManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SPIKE_ROOT, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
}
