import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ECOWITT_CUSTOM_HTTP_CHANNEL_FIELD_MAP,
  ECOWITT_CUSTOM_HTTP_FIELD_MAP,
  ECOWITT_CUSTOM_HTTP_METRIC_UNITS,
} from "@/lib/ecowittCustomHttpBridgeIngestRules";

// -I -S disables site packages and environment-driven imports. Only the Python
// standard library reads AST literals; Flask is not imported and site packages
// remain disabled even when the testbench's own environment contains them.
const literalReader = `
import ast, json, sys
result = {}
for path, name in zip(sys.argv[1::2], sys.argv[2::2]):
    with open(path, encoding="utf-8-sig") as handle:
        tree = ast.parse(handle.read(), filename=path)
    assignment = next(
        node for node in tree.body if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == name for target in node.targets)
    )
    result[name] = ast.literal_eval(assignment.value)
print(json.dumps(result, sort_keys=True))
`;
const testbench = join(process.cwd(), "tools", "ecowitt-testbench");
const args = [
  "-I",
  "-S",
  "-c",
  literalReader,
  join(testbench, "ecowitt_listener.py"),
  "FIELD_MAP",
  join(testbench, "ecowitt_multitent.py"),
  "CHANNEL_FIELD_MAP",
  join(testbench, "ecowitt_multitent.py"),
  "UNITS",
];

function readPythonLiterals(): Record<string, unknown> {
  const configured = process.env.ECOWITT_PARITY_PYTHON;
  const candidates = configured ? [configured] : ["python3", "python"];
  for (const executable of candidates) {
    const result = spawnSync(executable, args, { encoding: "utf8", timeout: 15_000 });
    if (!configured && result.error?.message.includes("ENOENT")) continue;
    if (result.error || result.status !== 0) {
      throw new Error(
        `Python AST parity failed (${executable}): ${result.error?.message ?? result.stderr}`,
      );
    }
    return JSON.parse(result.stdout) as Record<string, unknown>;
  }
  throw new Error("Python is required for AST parity; set ECOWITT_PARITY_PYTHON if needed.");
}

describe("EcoWitt custom HTTP bridge field contracts", () => {
  const python = readPythonLiterals();

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
    expect(fields.some((field) => /^ec|soilad/.test(field))).toBe(false);
  });
});
