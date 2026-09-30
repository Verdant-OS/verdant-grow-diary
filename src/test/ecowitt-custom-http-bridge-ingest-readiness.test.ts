import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ECOWITT_CUSTOM_HTTP_CHANNEL_FIELD_MAP,
  ECOWITT_CUSTOM_HTTP_FIELD_MAP,
  ECOWITT_CUSTOM_HTTP_METRIC_UNITS,
} from "@/lib/ecowittCustomHttpBridgeIngestRules";

// -I -S disables site packages and environment-driven imports. The routing
// module owns these constants and imports only the Python standard library.
const runtimeReader = `
import json, sys
sys.path.insert(0, sys.argv[1])
import ecowitt_multitent as routing
print(json.dumps({name: getattr(routing, name) for name in
                 ("FIELD_MAP", "CHANNEL_FIELD_MAP", "UNITS")}, sort_keys=True))
`;
const testbench = join(process.cwd(), "tools", "ecowitt-testbench");
const args = ["-I", "-S", "-c", runtimeReader, testbench];

function readPythonConstants(directory = testbench): Record<string, unknown> {
  const configured = process.env.ECOWITT_PARITY_PYTHON;
  const candidates = configured ? [configured] : ["python3", "python"];
  for (const executable of candidates) {
    const result = spawnSync(executable, [...args.slice(0, -1), directory], {
      encoding: "utf8", timeout: 15_000,
    });
    if (!configured && result.error?.message.includes("ENOENT")) continue;
    if (result.error || result.status !== 0) {
      throw new Error(
        `Python import parity failed (${executable}): ${result.error?.message ?? result.stderr}`,
      );
    }
    return JSON.parse(result.stdout) as Record<string, unknown>;
  }
  throw new Error("Python is required for import parity; set ECOWITT_PARITY_PYTHON if needed.");
}

describe("EcoWitt custom HTTP bridge field contracts", () => {
  const python = readPythonConstants();

  it("reads effective values after reassignment and mutation during import", () => {
    const fixture = mkdtempSync(join(tmpdir(), "ecowitt-parity-"));
    try {
      const source = readFileSync(join(testbench, "ecowitt_multitent.py"), "utf8");
      writeFileSync(join(fixture, "ecowitt_multitent.py"),
        `${source}\nFIELD_MAP = {"changed": ("late_field",)}\nUNITS["temp_f"] = "changed"\n`);
      const effective = readPythonConstants(fixture);
      expect(effective.FIELD_MAP).toEqual({ changed: ["late_field"] });
      expect(effective.UNITS).toMatchObject({ temp_f: "changed" });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("preserves the legacy first-match FIELD_MAP, read without importing Flask", () => {
    expect(python.FIELD_MAP).toEqual(ECOWITT_CUSTOM_HTTP_FIELD_MAP);
    expect(ECOWITT_CUSTOM_HTTP_FIELD_MAP.temp_f).toEqual(["temp1f", "tempf", "tempinf"]);
    expect(ECOWITT_CUSTOM_HTTP_FIELD_MAP.soil_moisture_pct).toEqual([
      "soilmoisture1",
      "soilmoisture2",
    ]);
  });

  it("mirrors the mapped channel templates independently of the legacy candidates", () => {
    expect(python.CHANNEL_FIELD_MAP).toEqual(ECOWITT_CUSTOM_HTTP_CHANNEL_FIELD_MAP);
  });

  it("keeps Celsius, Fahrenheit and conductivity units explicit", () => {
    expect(python.UNITS).toEqual(ECOWITT_CUSTOM_HTTP_METRIC_UNITS);
    expect(ECOWITT_CUSTOM_HTTP_METRIC_UNITS.soil_temp_f).toBe("F");
    expect(ECOWITT_CUSTOM_HTTP_METRIC_UNITS.soil_temp_c).toBe("C");
    expect(ECOWITT_CUSTOM_HTTP_METRIC_UNITS.ec_ms_cm).toBe("mS/cm");
  });

  it("does not enable guessed EC or WH52 field names", () => {
    const fields = Object.values(ECOWITT_CUSTOM_HTTP_CHANNEL_FIELD_MAP).flatMap((map) =>
      Object.values(map),
    );
    expect(fields).not.toContain("ec1");
    expect(fields).not.toContain("soilad1");
    expect(fields.some((field) => /^(?:ec|soilad)/.test(field))).toBe(false);
  });
});
