import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createVerdantSkillManifest,
  VERDANT_SKILL_MANIFEST_SCHEMA_VERSION,
  VERDANT_SKILL_V1_CAPABILITIES,
  VERDANT_SKILL_V1_POLICY_TAGS,
} from "@/lib/verdantSkillManifest";
import {
  evaluateVerdantSkillPostExecutionPolicy,
  evaluateVerdantSkillPreExecutionPolicy,
} from "@/lib/verdantSkillPolicyRules";

function extractStaticDependencySpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  const fromPattern = /\bfrom\s+["']([^"']+)["']/g;
  let fromMatch = fromPattern.exec(source);
  while (fromMatch) {
    specifiers.push(fromMatch[1]);
    fromMatch = fromPattern.exec(source);
  }

  const sideEffectPattern = /(?:^|\r?\n)\s*import\s+["']([^"']+)["']/g;
  let sideEffectMatch = sideEffectPattern.exec(source);
  while (sideEffectMatch) {
    specifiers.push(sideEffectMatch[1]);
    sideEffectMatch = sideEffectPattern.exec(source);
  }

  const requirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  let requireMatch = requirePattern.exec(source);
  while (requireMatch) {
    specifiers.push(requireMatch[1]);
    requireMatch = requirePattern.exec(source);
  }
  return Object.freeze(specifiers);
}

const validManifest = () =>
  createVerdantSkillManifest({
    schemaVersion: VERDANT_SKILL_MANIFEST_SCHEMA_VERSION,
    id: "policy-test",
    version: "1.0.0",
    title: "Policy test",
    description: "Pure deterministic policy fixture.",
    inputKind: "policy-test-input.v1",
    outputKind: "policy-test-output.v1",
    activation: "explicit",
    sideEffects: "none",
    capabilities: VERDANT_SKILL_V1_CAPABILITIES,
    policyTags: VERDANT_SKILL_V1_POLICY_TAGS,
    fixtureSet: "policy-test-golden-cases.v1",
  });

describe("Verdant skill pre-execution policy", () => {
  it("allows only the exact engine-only v1 manifest", () => {
    expect(evaluateVerdantSkillPreExecutionPolicy(validManifest())).toEqual({
      allowed: true,
      phase: "pre_execution",
      findings: [],
    });
  });

  it.each([
    ["writes", { sideEffects: "database_write" }, "policy.manifest_side_effects_invalid"],
    [
      "model capability",
      { capabilities: ["read_supplied_context", "model"] },
      "policy.manifest_capabilities_invalid",
    ],
    [
      "missing safety fence",
      { policyTags: VERDANT_SKILL_V1_POLICY_TAGS.slice(0, -1) },
      "policy.manifest_policy_tags_invalid",
    ],
    [
      "unrecognized metadata",
      { endpoint: "https://example.invalid" },
      "policy.manifest_shape_invalid",
    ],
  ])("blocks %s before execution", (_label, patch, expectedCode) => {
    const candidate = { ...validManifest(), ...patch };
    const result = evaluateVerdantSkillPreExecutionPolicy(candidate);
    expect(result.allowed).toBe(false);
    expect(result.findings.map((item) => item.code)).toContain(expectedCode);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.findings)).toBe(true);
  });
});

describe("Verdant skill post-execution policy", () => {
  it("allows bounded advisory output and a structurally null queue suggestion", () => {
    const result = evaluateVerdantSkillPostExecutionPolicy({
      status: "needs_context",
      summary: "Log another observation before drawing a conclusion.",
      findings: [{ code: "sensor_evidence_missing", severity: "info" }],
      nextDataToLog: ["canopy_temperature"],
      actionQueueSuggestion: null,
    });
    expect(result).toEqual({
      allowed: true,
      phase: "post_execution",
      findings: [],
    });
  });

  it.each([
    [
      "Action Queue shape",
      { actionQueueSuggestion: { title: "Create an item" } },
      "policy.action_queue_write_forbidden",
    ],
    ["persistence shape", { insert: { table: "events" } }, "policy.persistence_forbidden"],
    ["hardware shape", { deviceCommand: "noop" }, "policy.hardware_control_forbidden"],
    ["network shape", { endpoint: "local" }, "policy.network_forbidden"],
    ["model shape", { prompt: "diagnose" }, "policy.model_integration_forbidden"],
    ["code shape", { callback: "run" }, "policy.arbitrary_code_forbidden"],
    ["alert write shape", { alertWrite: true }, "policy.alert_write_forbidden"],
    [
      "camel-case sensitive data",
      { serviceRole: "private" },
      "policy.data_sensitive_key_forbidden",
    ],
    [
      "device imperative",
      { guidance: "Turn on the irrigation pump." },
      "policy.hardware_control_forbidden",
    ],
    [
      "network reference",
      { evidence: "Review https://example.invalid/private" },
      "policy.network_reference_forbidden",
    ],
  ])("blocks %s", (_label, outcome, expectedCode) => {
    const result = evaluateVerdantSkillPostExecutionPolicy(outcome);
    expect(result.allowed).toBe(false);
    expect(result.findings.map((item) => item.code)).toContain(expectedCode);
  });

  it("permits explicit negative safety guidance without turning it into a command", () => {
    expect(
      evaluateVerdantSkillPostExecutionPolicy({
        whatNotToDo: "Do not turn on the irrigation pump from this review.",
      }).allowed,
    ).toBe(true);
  });

  it.each([
    "Do not turn off the fan and turn on the irrigation pump.",
    "Never switch off the light but start the dosing pump.",
    "Do not wait to turn on the irrigation pump.",
  ])("blocks a positive device command after a locally negated command: %s", (guidance) => {
    const result = evaluateVerdantSkillPostExecutionPolicy({ guidance });
    expect(result.allowed).toBe(false);
    expect(result.findings.map((item) => item.code)).toContain("policy.hardware_control_forbidden");
  });

  it("returns stable code-point ordered findings", () => {
    const outcome = {
      prompt: "diagnose",
      endpoint: "remote",
      insert: {},
    };
    const first = evaluateVerdantSkillPostExecutionPolicy(outcome);
    const second = evaluateVerdantSkillPostExecutionPolicy(outcome);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.findings.map((item) => item.code)).toEqual(
      [...first.findings.map((item) => item.code)].sort(),
    );
  });
});

describe("Skill Runtime v1 static safety boundary", () => {
  const runtimeFiles = [
    "verdantSkillManifest.ts",
    "verdantSkillApplicabilityRules.ts",
    "verdantSkillPolicyRules.ts",
    "verdantSkillOutcomeRules.ts",
    "plantEventReviewSkill.ts",
    "verdantSkillRegistry.ts",
    "verdantSkillRuntime.ts",
  ] as const;

  const forbiddenSourcePatterns = [
    /\bfetch\s*\(/,
    /\baxios\b/i,
    /\bWebSocket\b/,
    /\blocalStorage\b/,
    /\bindexedDB\b/,
    /\.\s*(?:insert|update|upsert|delete|rpc)\s*\(/,
    /\bfunctions\.invoke\s*\(/,
    /\b(?:Date\.now|Math\.random|crypto\.randomUUID)\s*\(/,
    /\b(?:performance\.now|crypto\.getRandomValues|setTimeout|setInterval)\s*\(/,
    /\bnew\s+Date\s*\(\s*\)/,
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\bimport\s*\(/,
    /\bWebAssembly\b/,
    /\b(?:Worker|SharedWorker|ServiceWorker|BroadcastChannel|EventSource|XMLHttpRequest)\b/,
    /\bchild_process\b/,
    /\bnode:vm\b/,
    /from\s+["']node:/,
    /from\s+["']@\/(?:hooks|integrations)\//,
    /\bprocess\.env\b/,
    /\bimport\.meta\.env\b/,
    /\bnavigator\.(?:bluetooth|usb|serial)\b/i,
    /\b(?:openai|anthropic|gemini)\b/i,
    /from\s+["'][^"']*supabase[^"']*["']/i,
    /\.from\s*\(\s*["'](?:action_queue|alerts)["']\s*\)/i,
  ] as const;

  it("contains no I/O, persistence, model, clock, randomness, arbitrary-code, or device integration", () => {
    for (const filename of runtimeFiles) {
      const source = readFileSync(resolve(process.cwd(), "src/lib", filename), "utf8");
      for (const pattern of forbiddenSourcePatterns) {
        expect(source, `${filename} matched forbidden source pattern ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });

  it("keeps the registry dependency closure inside the approved pure engine modules", () => {
    const approvedSpecifiers = new Set(
      runtimeFiles.map((filename) => `@/lib/${filename.replace(/\.ts$/, "")}`),
    );

    for (const filename of runtimeFiles) {
      const source = readFileSync(resolve(process.cwd(), "src/lib", filename), "utf8");
      const importedSpecifiers = extractStaticDependencySpecifiers(source);
      expect(
        importedSpecifiers.filter((specifier) => !approvedSpecifiers.has(specifier)),
        `${filename} imported outside the approved runtime closure`,
      ).toEqual([]);
    }
  });

  it("recognizes and rejects every supported static dependency form", () => {
    const source = `
      import type { Safe } from "@/lib/verdantSkillManifest";
      import helper from "./relative-helper";
      import value from "third-party-package";
      import { readFileSync } from "node:fs";
      import "bare-side-effect";
      const commonJsHelper = require("./commonjs-helper");
      import legacyHelper = require("legacy-package");
    `;
    const approved = new Set(["@/lib/verdantSkillManifest"]);
    const specifiers = extractStaticDependencySpecifiers(source);

    expect(specifiers).toEqual([
      "@/lib/verdantSkillManifest",
      "./relative-helper",
      "third-party-package",
      "node:fs",
      "bare-side-effect",
      "./commonjs-helper",
      "legacy-package",
    ]);
    expect(specifiers.filter((specifier) => !approved.has(specifier))).toEqual([
      "./relative-helper",
      "third-party-package",
      "node:fs",
      "bare-side-effect",
      "./commonjs-helper",
      "legacy-package",
    ]);
  });

  it("does not expose a dynamic production registration surface", () => {
    const registrySource = readFileSync(
      resolve(process.cwd(), "src/lib/verdantSkillRegistry.ts"),
      "utf8",
    );
    expect(registrySource).not.toMatch(
      /export\s+(?:function|const)\s+(?:register|add|install|load)VerdantSkill/i,
    );
    expect(registrySource).not.toMatch(/\bimport\s*\(/);
  });
});
