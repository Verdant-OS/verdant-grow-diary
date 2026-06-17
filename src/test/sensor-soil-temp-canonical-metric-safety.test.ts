/**
 * Static safety: no app/lib code may emit `metric: "soil_temperature_c"`.
 *
 * The DB validate_sensor_reading() trigger only accepts the canonical
 * `soil_temp_c` metric. Emitting `soil_temperature_c` would be silently
 * rejected at insert time. Input aliases (incoming payload keys) are
 * still allowed — only canonical metric *output* is policed here.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === "test" || entry === "__tests__") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(p);
    }
  }
  return acc;
}

describe("sensor soil temperature canonical metric (safety)", () => {
  const files = walk(ROOT);

  it("no app/lib code emits metric: \"soil_temperature_c\" as a string literal value", () => {
    const offenders: string[] = [];
    // Matches: metric: "soil_temperature_c"  or  metric: 'soil_temperature_c'
    const re = /metric\s*:\s*["']soil_temperature_c["']/;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (re.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("long-form converter emits canonical soil_temp_c, not soil_temperature_c", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/sensors/sensorReadingLongForm.ts"),
      "utf8",
    );
    expect(src).toMatch(/["']soil_temp_c["']/);
    expect(src).not.toMatch(/\[\s*["']soil_temperature_c["']\s*,/);
  });
});
