import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AllowlistConfigError,
  DEFAULT_ALLOWLIST_PATH,
  KNOWN_TARGETS,
  PREVIEW_IDENTIFIER_MARKERS,
  RULES,
  discoverTargets,
  escapeAnnotation,
  formatAnnotation,
  formatViolation,
  loadAllowlist,
  scanText,
} from "../../scripts/assert-ai-doctor-preview-safety.mjs";
import { pickRelevantStaged } from "../../scripts/precommit-ai-doctor-preview-safety.mjs";

const ALLOWLIST = loadAllowlist();
const SCAN_OPTS = {
  allowedPhrases: [...ALLOWLIST.allowedPhrases],
  allowedLineMarkers: [...ALLOWLIST.allowedLineMarkers],
};
const ALLOW_MARKER = ALLOWLIST.allowedLineMarkers[0];

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "ai-doctor-preview-safety-"));
}

describe("ai-doctor preview safety scanner", () => {
  it("passes clean preview text with safe phrases", () => {
    const text = [
      "const summary = 'Context is sufficient for a cautious, approval-required suggestion.';",
      "const note = 'Approval required — grower must approve any action before it runs.';",
      "const dev = 'No device control — Verdant will not run equipment commands.';",
      "const ui = 'Preview only — no Action Queue item is created.';",
    ].join("\n");
    expect(scanText(text, SCAN_OPTS)).toEqual([]);
  });

  it("flags 'queued' language", () => {
    const v = scanText(`const s = "Suggestion was queued for approval";`, SCAN_OPTS);
    expect(v.map((x) => x.rule)).toContain("no-queued-language");
  });

  it("flags 'approved' language", () => {
    const v = scanText(`const s = "Action was approved automatically";`, SCAN_OPTS);
    expect(v.map((x) => x.rule)).toContain("no-approved-language");
  });

  it("flags 'executed' / 'execute' language", () => {
    const v = scanText(`const s = "Action was executed by Verdant";`, SCAN_OPTS);
    expect(v.map((x) => x.rule)).toContain("no-executed-language");
  });

  it("flags Supabase action_queue write paths", () => {
    const v = scanText(`await supabase.from("action_queue").insert({});`, SCAN_OPTS);
    expect(v.map((x) => x.rule)).toContain("no-action-queue-write");
  });

  it("flags functions.invoke calls", () => {
    const v = scanText(`await supabase.functions.invoke("ai-doctor");`, SCAN_OPTS);
    expect(v.map((x) => x.rule)).toContain("no-functions-invoke");
  });

  it("flags service_role references", () => {
    const v = scanText(`const k = "uses service_role from env";`, SCAN_OPTS);
    expect(v.map((x) => x.rule)).toContain("no-service-role");
  });

  it("flags device/mqtt/turn-on/pump/dose/set/control/automation language", () => {
    const samples = [
      `const a = "send device command to fan";`,
      `const b = "mqtt publish climate/cmd";`,
      `const c = "turn on the pump";`,
      `const d = "pump on at 6am";`,
      `const e = "auto dose nutrients";`,
      `const f = "set temp 25C";`,
      `const g = "set humidity 60";`,
      `const h = "control equipment from preview";`,
      `const i = "automation enabled by default";`,
    ];
    for (const text of samples) {
      expect(scanText(text, SCAN_OPTS).length, text).toBeGreaterThan(0);
    }
  });

  it("allows the configured safety phrases verbatim", () => {
    for (const phrase of ALLOWLIST.allowedPhrases) {
      const text = `const s = "${phrase} — safety note";`;
      expect(scanText(text, SCAN_OPTS), `phrase: ${phrase}`).toEqual([]);
    }
  });

  it("skips JS/TS comment lines", () => {
    const text = [
      "// turn on the pump — describing what we do NOT do",
      "/* approved/queued/executed language reference */",
      " * service_role appears in jsdoc only",
    ].join("\n");
    expect(scanText(text, SCAN_OPTS)).toEqual([]);
  });

  it("skips regex-literal pattern declaration lines", () => {
    const text = [
      "  /\\bturn[_\\s-]?on\\b/i,",
      "  /\\bpump[_\\s-]?(on|off)\\b/i,",
      "  /\\bexecute\\b/i,",
    ].join("\n");
    expect(scanText(text, SCAN_OPTS)).toEqual([]);
  });

  it("honours the allow marker on the same line", () => {
    const text = `const s = "Suggestion was queued"; // ${ALLOW_MARKER} — test fixture`;
    expect(scanText(text, SCAN_OPTS)).toEqual([]);
  });

  it("treats denial / safety-context lines as safe", () => {
    const text = [
      `const s = "Preview must never emit device commands";`,
      `const t = "Blocked — device-command risk";`,
      `const u = "Safety filter drops approved/queued language";`,
    ].join("\n");
    expect(scanText(text, SCAN_OPTS)).toEqual([]);
  });

  it("does not scan test files", () => {
    const text = `const s = "Suggestion was queued and executed";`;
    expect(scanText(text, { ...SCAN_OPTS, isTestFile: true })).toEqual([]);
  });

  it("formatViolation includes file, line, rule, and matched text", () => {
    const v = {
      line: 12,
      rule: "no-queued-language",
      explanation: "Preview must never claim queued.",
      text: 'const s = "queued";',
    };
    const out = formatViolation("src/foo.ts", v);
    expect(out).toContain("src/foo.ts:12");
    expect(out).toContain("[no-queued-language]");
    expect(out).toContain('"const s = "queued";"');
    expect(out).toContain("Preview must never claim queued.");
  });

  it("RULES export is non-empty and well-formed", () => {
    expect(RULES.length).toBeGreaterThan(0);
    for (const r of RULES) {
      expect(typeof r.name).toBe("string");
      expect(r.pattern).toBeInstanceOf(RegExp);
      expect(typeof r.explanation).toBe("string");
    }
  });
});

describe("allowlist config loader", () => {
  it("loads the default allowlist with required arrays", () => {
    const cfg = loadAllowlist();
    expect(Array.isArray(cfg.allowedPhrases)).toBe(true);
    expect(Array.isArray(cfg.allowedLineMarkers)).toBe(true);
    expect(cfg.allowedPhrases.length).toBeGreaterThan(0);
    expect(cfg.allowedLineMarkers.length).toBeGreaterThan(0);
  });

  it("default allowlist path points at the JSON config", () => {
    expect(DEFAULT_ALLOWLIST_PATH).toMatch(
      /scripts[\\/]config[\\/]ai-doctor-preview-safety-allowlist\.json$/,
    );
  });

  it("fails closed when the file is missing", () => {
    expect(() => loadAllowlist("/tmp/does-not-exist-xyz.json")).toThrow(
      AllowlistConfigError,
    );
  });

  it("fails closed on invalid JSON", () => {
    const dir = makeTempRoot();
    try {
      const p = join(dir, "bad.json");
      writeFileSync(p, "{ not valid json");
      expect(() => loadAllowlist(p)).toThrow(AllowlistConfigError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when arrays are missing", () => {
    const dir = makeTempRoot();
    try {
      const p = join(dir, "bad.json");
      writeFileSync(p, JSON.stringify({ allowedPhrases: ["x"] }));
      expect(() => loadAllowlist(p)).toThrow(AllowlistConfigError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when an array contains a non-string", () => {
    const dir = makeTempRoot();
    try {
      const p = join(dir, "bad.json");
      writeFileSync(
        p,
        JSON.stringify({ allowedPhrases: [""], allowedLineMarkers: ["m"] }),
      );
      expect(() => loadAllowlist(p)).toThrow(AllowlistConfigError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("target discovery", () => {
  function setupTree(): { root: string; cleanup: () => void } {
    const root = makeTempRoot();
    mkdirSync(join(root, "src", "lib"), { recursive: true });
    mkdirSync(join(root, "src", "components"), { recursive: true });
    // Known targets — minimal stub content
    writeFileSync(
      join(root, "src", "lib", "aiDoctorActionSuggestionPreviewRules.ts"),
      "// previewActionSuggestion stub\n",
    );
    writeFileSync(
      join(root, "src", "components", "AiDoctorContextReadinessPanel.tsx"),
      "// ActionSuggestionPreview stub\n",
    );
    // Future preview-related file
    writeFileSync(
      join(root, "src", "lib", "FutureActionSuggestionPreviewView.ts"),
      "export const k = 'previewActionSuggestion future helper';\n",
    );
    // Unrelated file — must be ignored
    writeFileSync(
      join(root, "src", "components", "RandomUnrelatedCard.tsx"),
      "export default function RandomUnrelatedCard() { return null; }\n",
    );
    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  }

  it("always includes the known preview targets", () => {
    const { root, cleanup } = setupTree();
    try {
      const targets = discoverTargets(root);
      for (const known of KNOWN_TARGETS) expect(targets).toContain(known);
    } finally {
      cleanup();
    }
  });

  it("includes future files matching a preview-identifier marker", () => {
    const { root, cleanup } = setupTree();
    try {
      const targets = discoverTargets(root);
      expect(targets).toContain("src/lib/FutureActionSuggestionPreviewView.ts");
    } finally {
      cleanup();
    }
  });

  it("ignores unrelated component files", () => {
    const { root, cleanup } = setupTree();
    try {
      const targets = discoverTargets(root);
      expect(targets).not.toContain("src/components/RandomUnrelatedCard.tsx");
    } finally {
      cleanup();
    }
  });

  it("exports a non-empty list of preview-identifier markers", () => {
    expect(PREVIEW_IDENTIFIER_MARKERS.length).toBeGreaterThan(0);
  });
});

describe("GitHub Actions annotation formatting", () => {
  it("escapes %, :, ',', \\r, \\n per workflow-command spec", () => {
    const out = escapeAnnotation("a%b:c,d\re\nf");
    expect(out).toBe("a%25b%3Ac%2Cd%0De%0Af");
  });

  it("formatAnnotation produces ::error with file/line/title and escaped message", () => {
    const v = {
      line: 7,
      rule: "no-queued-language",
      explanation: "Preview must never claim queued — see docs.",
      text: 'const s = "queued, now";',
    };
    const out = formatAnnotation("src/lib/foo.ts", v);
    expect(out).toMatch(/^::error file=src\/lib\/foo\.ts,line=7,title=no-queued-language::/);
    // colon and comma inside message must be escaped
    expect(out).toContain("%3A");
    expect(out).toContain("%2C");
    // message preserves the matched text marker
    expect(out).toContain("matched");
  });
});

describe("precommit hook helper", () => {
  it("returns empty when no relevant files are staged", () => {
    const picked = pickRelevantStaged(
      ["README.md", "src/pages/Home.tsx", "src/lib/somethingElse.ts"],
      ["src/lib/aiDoctorActionSuggestionPreviewRules.ts"],
    );
    expect(picked).toEqual([]);
  });

  it("picks the scanner script, config, test, and any discovered target", () => {
    const picked = pickRelevantStaged(
      [
        "scripts/assert-ai-doctor-preview-safety.mjs",
        "scripts/config/ai-doctor-preview-safety-allowlist.json",
        "src/test/ai-doctor-preview-safety-scanner.test.ts",
        "src/components/AiDoctorContextReadinessPanel.tsx",
        "README.md",
      ],
      ["src/components/AiDoctorContextReadinessPanel.tsx"],
    );
    expect(picked).toEqual([
      "scripts/assert-ai-doctor-preview-safety.mjs",
      "scripts/config/ai-doctor-preview-safety-allowlist.json",
      "src/test/ai-doctor-preview-safety-scanner.test.ts",
      "src/components/AiDoctorContextReadinessPanel.tsx",
    ]);
  });
});
