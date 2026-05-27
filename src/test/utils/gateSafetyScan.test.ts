/**
 * Regression tests for the shared gate safety-scan utility.
 *
 * Proves:
 *  - line comments are stripped
 *  - block comments are stripped
 *  - banned token inside comment does not fail
 *  - banned token inside real code/string still fails
 *  - allowed CSV identifiers pass Gate 2A scanner
 *  - unsafe strings still fail Gate 2A scanner
 *  - utility supports gate-specific banned token sets
 */
import { describe, it, expect } from "vitest";
import {
  stripComments,
  createGateSafetyScanner,
  assertNoBannedTokens,
  assertAllowedStringsPass,
  assertBannedStringsFail,
  GATE_2A_BANNED_TOKENS,
  ACTION_QUEUE_DEVICE_CONTROL_TOKENS,
  ACTION_QUEUE_AUTO_EXECUTE_TOKENS,
} from "./gateSafetyScan";

describe("stripComments", () => {
  it("strips line comments", () => {
    const src = `const x = 1; // this is a comment\nconst y = 2;`;
    const result = stripComments(src);
    expect(result).toContain("const x = 1;");
    expect(result).toContain("const y = 2;");
    expect(result).not.toContain("this is a comment");
  });

  it("strips block comments", () => {
    const src = `const x = 1; /* block comment with service_role */ const y = 2;`;
    const result = stripComments(src);
    expect(result).toContain("const x = 1;");
    expect(result).toContain("const y = 2;");
    expect(result).not.toContain("service_role");
    expect(result).not.toContain("block comment");
  });

  it("strips multi-line block comments", () => {
    const src = `/**\n * no service_role on the client\n * no mqtt here\n */\nconst safe = true;`;
    const result = stripComments(src);
    expect(result).not.toContain("service_role");
    expect(result).not.toContain("mqtt");
    expect(result).toContain("const safe = true;");
  });

  it("preserves single-quoted string literals", () => {
    const src = `const s = 'service_role'; // comment`;
    const result = stripComments(src);
    expect(result).toContain("'service_role'");
    expect(result).not.toContain("comment");
  });

  it("preserves double-quoted string literals", () => {
    const src = `const s = "mqtt.connect"; /* no mqtt */`;
    const result = stripComments(src);
    expect(result).toContain('"mqtt.connect"');
    expect(result).not.toContain("no mqtt");
  });

  it("preserves template literal strings", () => {
    const src = "const s = `home_assistant`; // not real";
    const result = stripComments(src);
    expect(result).toContain("`home_assistant`");
    expect(result).not.toContain("not real");
  });

  it("does not strip URL protocols (https://)", () => {
    const src = `const url = "https://example.com";`;
    const result = stripComments(src);
    expect(result).toContain("https://example.com");
  });

  it("handles escaped quotes in strings", () => {
    const src = `const s = "she said \\"hi\\""; // end`;
    const result = stripComments(src);
    expect(result).toContain('she said \\"hi\\"');
    expect(result).not.toContain("end");
  });
});

describe("assertNoBannedTokens", () => {
  const options = { bannedTokens: GATE_2A_BANNED_TOKENS, gateName: "Gate 2A" };

  it("passes for clean source code", () => {
    expect(() => assertNoBannedTokens("const csv = parseCsv(file);", options)).not.toThrow();
  });

  it("catches banned words in executable/source strings", () => {
    expect(() => assertNoBannedTokens('const key = "service_role";', options)).toThrow(
      /service_role/,
    );
  });

  it("ignores banned words inside comments (after stripping)", () => {
    const src = `// no service_role on the client\nconst x = 1;`;
    const stripped = stripComments(src);
    expect(() => assertNoBannedTokens(stripped, options)).not.toThrow();
  });
});

describe("assertAllowedStringsPass — Gate 2A CSV identifiers", () => {
  const options = { bannedTokens: GATE_2A_BANNED_TOKENS, gateName: "Gate 2A" };

  it("allows legitimate CSV import identifiers", () => {
    const allowed = [
      "csv",
      "CSV",
      "csv_import_ac_infinity",
      "csv_import_trolmaster",
      "CSV Import",
      "CSV Import – AC Infinity",
      "CSV Import - AC Infinity",
      "Import Sensor History (CSV)",
      "Import Sensor History",
      "Parse & Preview",
      "Import Data",
      "rows parsed",
      "rows skipped",
      "metrics detected",
      "source = csv_import_ac_infinity",
      "csvSensorImportRules",
      "parseCsvSensorImport",
      "normalizeCsvSensorRows",
      "AC Infinity",
      "TrolMaster",
      "Other",
      "Papa Parse",
      "papaparse",
      "parseCsv",
      "buildCsvInsertRows",
      "normalizeAcInfinityRows",
      "planColumns",
      "csvSourceTagFor",
      "isCsvImportSource",
    ];
    expect(() => assertAllowedStringsPass(allowed, options)).not.toThrow();
  });
});

describe("assertBannedStringsFail — unsafe tokens", () => {
  const options = { bannedTokens: GATE_2A_BANNED_TOKENS, gateName: "Gate 2A" };

  it("still rejects unsafe automation/device-control tokens", () => {
    const unsafe = [
      "service_role",
      "mqtt",
      "home_assistant",
      "home-assistant",
      "Home Assistant",
      "webhook",
      "relay",
      "actuator",
      "autopilot",
      "auto-execute",
      "dispatch_command",
      "openai",
      "anthropic",
      "ai-doctor",
      'fetch("https://evil.example.com")',
    ];
    expect(() => assertBannedStringsFail(unsafe, options)).not.toThrow();
  });
});

describe("createGateSafetyScanner", () => {
  it("creates a bound scanner with all methods", () => {
    const scanner = createGateSafetyScanner({
      bannedTokens: GATE_2A_BANNED_TOKENS,
      gateName: "Gate 2A",
    });
    expect(scanner.stripComments).toBeDefined();
    expect(scanner.assertNoBannedTokens).toBeDefined();
    expect(scanner.assertAllowedStringsPass).toBeDefined();
    expect(scanner.assertBannedStringsFail).toBeDefined();
    expect(scanner.assertSourceSafe).toBeDefined();
  });

  it("assertSourceSafe strips comments before scanning", () => {
    const scanner = createGateSafetyScanner({
      bannedTokens: GATE_2A_BANNED_TOKENS,
      gateName: "Gate 2A",
    });
    // service_role in comment — should pass
    expect(() => scanner.assertSourceSafe("// never use service_role\nconst x = 1;")).not.toThrow();
    // service_role in code — should fail
    expect(() => scanner.assertSourceSafe('const key = "service_role";')).toThrow();
  });

  it("supports gate-specific banned token sets", () => {
    const deviceScanner = createGateSafetyScanner({
      bannedTokens: ACTION_QUEUE_DEVICE_CONTROL_TOKENS,
      gateName: "Action Queue",
    });
    // CSV identifiers should pass device-control scanner
    expect(() => deviceScanner.assertNoBannedTokens("csv_import_ac_infinity")).not.toThrow();
    // Device control should fail
    expect(() => deviceScanner.assertNoBannedTokens("mqtt://broker")).toThrow();

    const autoScanner = createGateSafetyScanner({
      bannedTokens: ACTION_QUEUE_AUTO_EXECUTE_TOKENS,
      gateName: "Action Queue Auto",
    });
    expect(() => autoScanner.assertNoBannedTokens("autopilot mode enabled")).toThrow();
    expect(() => autoScanner.assertNoBannedTokens("normal safe code")).not.toThrow();
  });
});
