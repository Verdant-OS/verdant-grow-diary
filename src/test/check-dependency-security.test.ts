/**
 * Dependency-security parser, policy, and reviewed-exception contracts.
 * Fixtures only: no live audit calls or network access.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLOCKED_PACKAGES,
  BLOCKED_SEVERITIES,
  evaluateExceptionLockResolutions,
  evaluateExceptionManifestReachability,
  evaluateExceptionNpmLockResolutions,
  evaluateExceptionRootAncestors,
  evaluateExceptionSourceImports,
  evaluateFindings,
  evaluateReviewedExceptions,
  npmAuditInvocation,
  parseAuditOutput,
  parseReviewedExceptions,
  redactSecrets,
} from "../../scripts/check-dependency-security.mjs";

const CLEAN_JSON = JSON.stringify({ advisories: {} });

const VALID_EXCEPTION = {
  package: "ajv",
  advisoryId: "1113714",
  severity: "moderate",
  expectedNpmAdvisoryUrl: "https://github.com/advisories/GHSA-example",
  expectedNpmVulnerableRange: "<=6.15.0",
  owner: "Verdant dependency security",
  reason: "No patched release exists in the constrained major.",
  reachability: "The affected copy is used only by repository lint tooling.",
  recheckOn: "2026-08-08",
  expiresOn: "2026-08-25",
  expectedLockResolutions: [{ key: "ajv", version: "6.15.0" }],
  expectedBunAffectedKeys: ["ajv"],
  expectedNpmLockResolutions: [{ path: "node_modules/ajv", version: "6.15.0" }],
  expectedParentKeys: ["eslint"],
  expectedNpmParentPaths: ["node_modules/eslint"],
  expectedNpmAffectedPaths: ["node_modules/ajv"],
  allowedImportPaths: [],
  allowedScriptNames: [],
  expectedBunDirectRootAncestors: [{ package: "eslint", group: "devDependencies", spec: "^9.0.0" }],
  expectedNpmDirectRootAncestors: [{ package: "eslint", group: "devDependencies", spec: "^9.0.0" }],
};

function exceptionDocument(exceptions = [VALID_EXCEPTION]) {
  return JSON.stringify({ schemaVersion: 1, exceptions });
}

function finding(overrides: Record<string, unknown> = {}) {
  return {
    package: "ajv",
    id: "1113714",
    severity: "moderate",
    title: "AJV $data ReDoS",
    ...overrides,
  };
}

describe("check-dependency-security audit parser", () => {
  it("parses a clean npm-compatible audit", () => {
    expect(parseAuditOutput(CLEAN_JSON)).toEqual([]);
  });

  it("parses Bun's package-keyed advisory arrays without dropping findings", () => {
    const parsed = parseAuditOutput(
      JSON.stringify({
        ajv: [
          {
            id: 1113714,
            severity: "moderate",
            title: "AJV issue",
          },
        ],
        minimatch: [
          { id: 1113465, severity: "high", title: "first" },
          { id: 1113544, severity: "high", title: "second" },
        ],
      }),
    );

    expect(parsed).toEqual([
      { package: "ajv", id: "1113714", severity: "moderate", title: "AJV issue" },
      { package: "minimatch", id: "1113465", severity: "high", title: "first" },
      { package: "minimatch", id: "1113544", severity: "high", title: "second" },
    ]);
  });

  it("normalizes npm propagation metadata to atomic advisories with affected paths", () => {
    const parsed = parseAuditOutput(
      JSON.stringify({
        vulnerabilities: {
          ajv: {
            name: "ajv",
            severity: "moderate",
            nodes: ["node_modules/ajv"],
            via: [
              {
                source: 1113714,
                name: "ajv",
                severity: "moderate",
                title: "AJV issue",
                url: "https://github.com/advisories/GHSA-example",
                range: "<=6.15.0",
              },
            ],
          },
          eslint: {
            name: "eslint",
            severity: "moderate",
            nodes: ["node_modules/eslint"],
            via: ["ajv"],
          },
        },
      }),
    );

    expect(parsed).toEqual([
      {
        package: "ajv",
        id: "1113714",
        severity: "moderate",
        title: "AJV issue",
        url: "https://github.com/advisories/GHSA-example",
        range: "<=6.15.0",
        paths: ["node_modules/ajv"],
      },
    ]);
  });

  it("fails closed when npm propagation references a missing atomic package", () => {
    expect(() =>
      parseAuditOutput(
        JSON.stringify({
          vulnerabilities: {
            eslint: {
              severity: "high",
              nodes: ["node_modules/eslint"],
              via: ["missing-vulnerable-package"],
            },
          },
        }),
      ),
    ).toThrow(/references missing propagated package/);
  });

  it("rejects an inner package name that disagrees with Bun's authoritative key", () => {
    expect(() =>
      parseAuditOutput(
        JSON.stringify({
          "@lovable.dev/mcp-js": [
            {
              id: 9999999,
              name: "harmless-package",
              severity: "low",
              title: "attempted reclassification",
            },
          ],
        }),
      ),
    ).toThrow(/disagrees with authoritative/);
  });

  it.each([
    ["empty output", ""],
    ["unknown JSON object", JSON.stringify({ metadata: { vulnerabilities: 0 } })],
    ["unexpected JSON array", JSON.stringify([])],
    [
      "Bun advisory without an id",
      JSON.stringify({ ajv: [{ severity: "moderate", title: "missing id" }] }),
    ],
    [
      "unknown severity",
      JSON.stringify({ ajv: [{ id: 1, severity: "mystery", title: "bad severity" }] }),
    ],
    ["unrecognized text", "audit completed somehow"],
    ["clean text mixed with an error", "No vulnerabilities found\nERROR: registry unavailable"],
  ])("fails closed for %s", (_label, raw) => {
    expect(() => parseAuditOutput(raw)).toThrow();
  });

  it("supports recognized text findings but never treats arbitrary text as clean", () => {
    const parsed = parseAuditOutput(`
      | moderate | esbuild 0.27.7 | GHSA-xxxx |
      | high     | somepkg 1.0.0  | GHSA-yyyy |
    `);
    expect(parsed).toHaveLength(2);
    expect(evaluateFindings(parsed).blocked).toHaveLength(2);
    expect(parseAuditOutput("No vulnerabilities found")).toEqual([]);
  });
});

describe("check-dependency-security core policy", () => {
  it.each(["@lovable.dev/mcp-js", "@hono/node-server", "hono", "esbuild", "ajv"])(
    "blocks %s at every severity",
    (packageName) => {
      expect(
        evaluateFindings([finding({ package: packageName, severity: "low", id: "example" })])
          .blocked,
      ).toHaveLength(1);
    },
  );

  it.each(["high", "critical"])("blocks every %s finding", (severity) => {
    expect(
      evaluateFindings([finding({ package: "unrelated-package", severity, id: "example" })])
        .blocked,
    ).toHaveLength(1);
  });

  it("allows low and moderate findings on otherwise unblocked packages", () => {
    const result = evaluateFindings([
      finding({ package: "unrelated-package", severity: "low" }),
      finding({ package: "another-package", severity: "moderate" }),
    ]);
    expect(result.blocked).toHaveLength(0);
  });

  it("exposes the expected package and severity policy", () => {
    expect(BLOCKED_PACKAGES).toEqual([
      "@lovable.dev/mcp-js",
      "@hono/node-server",
      "hono",
      "esbuild",
      "ajv",
    ]);
    expect(BLOCKED_SEVERITIES).toEqual(["high", "critical"]);
  });
});

describe("check-dependency-security reviewed exceptions", () => {
  it("accepts a complete schema and rejects malformed or duplicate entries", () => {
    expect(parseReviewedExceptions(exceptionDocument())).toEqual([VALID_EXCEPTION]);

    expect(() =>
      parseReviewedExceptions(JSON.stringify({ schemaVersion: 2, exceptions: [] })),
    ).toThrow(/schemaVersion 1/);
    expect(() =>
      parseReviewedExceptions(exceptionDocument([{ ...VALID_EXCEPTION, reachability: "" }])),
    ).toThrow(/reachability/);
    expect(() =>
      parseReviewedExceptions(exceptionDocument([{ ...VALID_EXCEPTION, expiresOn: "2026-02-30" }])),
    ).toThrow(/valid calendar date/);
    expect(() =>
      parseReviewedExceptions(
        exceptionDocument([{ ...VALID_EXCEPTION, expectedLockResolutions: [] }]),
      ),
    ).toThrow(/expectedLockResolutions/);
    expect(() =>
      parseReviewedExceptions(
        exceptionDocument([{ ...VALID_EXCEPTION, expectedNpmLockResolutions: [] }]),
      ),
    ).toThrow(/expectedNpmLockResolutions/);
    expect(() =>
      parseReviewedExceptions(exceptionDocument([{ ...VALID_EXCEPTION, expectedParentKeys: [] }])),
    ).toThrow(/expectedParentKeys/);
    expect(() =>
      parseReviewedExceptions(
        exceptionDocument([
          { ...VALID_EXCEPTION, expectedBunDirectRootAncestors: undefined as never },
        ]),
      ),
    ).toThrow(/expectedBunDirectRootAncestors/);
    expect(() =>
      parseReviewedExceptions(exceptionDocument([VALID_EXCEPTION, VALID_EXCEPTION])),
    ).toThrow(/Duplicate/);
  });

  it("accepts only an exact package, advisory id, and severity match", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    const accepted = evaluateReviewedExceptions([finding()], exceptions, {
      today: "2026-07-25",
    });
    expect(accepted.reviewed).toHaveLength(1);
    expect(accepted.blocked).toHaveLength(0);
    expect(accepted.stale).toHaveLength(0);

    for (const mismatched of [
      finding({ package: "other-package" }),
      finding({ id: "different-id" }),
      finding({ severity: "high" }),
    ]) {
      const result = evaluateReviewedExceptions([mismatched], exceptions, {
        today: "2026-07-25",
      });
      expect(result.blocked.length + result.stale.length).toBeGreaterThan(0);
      expect(result.reviewed).toHaveLength(0);
    }
  });

  it("requires npm advisory identity, range, and affected paths to match exactly", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    const npmFinding = {
      ...finding(),
      url: VALID_EXCEPTION.expectedNpmAdvisoryUrl,
      range: VALID_EXCEPTION.expectedNpmVulnerableRange,
      paths: VALID_EXCEPTION.expectedNpmAffectedPaths,
    };
    expect(
      evaluateReviewedExceptions([npmFinding], exceptions, {
        today: "2026-07-25",
        auditSource: "npm",
      }).blocked,
    ).toHaveLength(0);

    for (const drift of [
      { url: "https://github.com/advisories/GHSA-different" },
      { range: "<=99.0.0" },
      { paths: ["node_modules/new-runtime-path/ajv"] },
    ]) {
      const result = evaluateReviewedExceptions([{ ...npmFinding, ...drift }], exceptions, {
        today: "2026-07-25",
        auditSource: "npm",
      });
      expect(result.blocked).toHaveLength(1);
      expect(result.reasons.join(" ")).toContain("drifted");
    }
  });

  it("allows an exception through its expiry date and blocks it afterward", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    expect(
      evaluateReviewedExceptions([finding()], exceptions, {
        today: VALID_EXCEPTION.expiresOn,
      }).blocked,
    ).toHaveLength(0);

    const expired = evaluateReviewedExceptions([finding()], exceptions, {
      today: "2026-08-26",
    });
    expect(expired.blocked).toHaveLength(1);
    expect(expired.expired).toHaveLength(1);
    expect(expired.reasons.join(" ")).toContain("expired");
  });

  it("never lets a reviewed exception cover a new high or critical advisory", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    const result = evaluateReviewedExceptions(
      [
        finding(),
        finding({
          package: "new-package",
          id: "new-advisory",
          severity: "critical",
        }),
      ],
      exceptions,
      { today: "2026-07-25" },
    );

    expect(result.reviewed).toHaveLength(1);
    expect(result.blocked).toEqual([
      expect.objectContaining({ package: "new-package", id: "new-advisory" }),
    ]);
  });

  it("fails closed when the excepted package's lockfile paths or versions drift", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    const expectedLock = [
      '"ajv": ["ajv@6.15.0", "", {}]',
      '"eslint": ["eslint@9.0.0", "", { "dependencies": { "ajv": "^6.0.0" } }]',
    ].join("\n");
    expect(evaluateExceptionLockResolutions(expectedLock, exceptions)).toEqual({
      ok: true,
      errors: [],
    });

    const versionDrift = evaluateExceptionLockResolutions(
      '"ajv": ["ajv@6.12.6", "", {}]',
      exceptions,
    );
    expect(versionDrift.ok).toBe(false);
    expect(versionDrift.errors.join(" ")).toContain("drifted");
    expect(
      evaluateExceptionLockResolutions(
        `${expectedLock}\n"other/ajv": ["ajv@6.15.0", "", {}]`,
        exceptions,
      ).ok,
    ).toBe(false);
  });

  it.each(["optionalDependencies", "peerDependencies"])(
    "fails closed when a new %s parent reuses an excepted resolution",
    (group) => {
      const exceptions = parseReviewedExceptions(exceptionDocument());
      const lock = [
        '"ajv": ["ajv@6.15.0", "", {}]',
        '"eslint": ["eslint@9.0.0", "", { "dependencies": { "ajv": "^6.0.0" } }]',
        `"runtime-parent": ["runtime-parent@1.0.0", "", { "${group}": { "ajv": "^6.0.0" } }]`,
      ].join("\n");
      expect(evaluateExceptionLockResolutions(lock, exceptions)).toEqual(
        expect.objectContaining({
          ok: false,
          errors: [expect.stringContaining("Dependency parents")],
        }),
      );
    },
  );

  it("binds npm exception resolutions and parents to exact package-lock paths", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    const npmLock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "node_modules/ajv": { version: "6.15.0" },
        "node_modules/eslint": {
          version: "9.0.0",
          dependencies: { ajv: "^6.0.0" },
        },
      },
    });
    expect(evaluateExceptionNpmLockResolutions(npmLock, exceptions)).toEqual({
      ok: true,
      errors: [],
    });

    const drifted = npmLock.replace(
      '"node_modules/ajv":{"version":"6.15.0"}',
      '"node_modules/runtime/ajv":{"version":"6.15.0"}',
    );
    expect(evaluateExceptionNpmLockResolutions(drifted, exceptions).ok).toBe(false);
  });

  it("fails closed when exception reachability becomes direct or a package script invokes it", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    const baseline = {
      dependencies: {},
      devDependencies: { eslint: "^9.0.0" },
      scripts: {},
    };
    expect(evaluateExceptionManifestReachability(baseline, exceptions)).toEqual({
      ok: true,
      errors: [],
    });

    expect(
      evaluateExceptionManifestReachability(
        { ...baseline, dependencies: { ajv: "6.15.0" } },
        exceptions,
      ),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        errors: [expect.stringContaining("became a direct package.json declaration")],
      }),
    );

    expect(
      evaluateExceptionManifestReachability(
        {
          ...baseline,
          scripts: { unsafe: `node -e "require('ajv')"` },
        },
        exceptions,
      ),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        errors: [expect.stringContaining("script reachability")],
      }),
    );
  });

  it("pins complete direct-root ancestor closure in both lock graphs", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    const bunLock = [
      '"ajv": ["ajv@6.15.0", "", {}]',
      '"eslint": ["eslint@9.0.0", "", { "dependencies": { "ajv": "^6.0.0" } }]',
    ].join("\n");
    const npmLockDocument = {
      lockfileVersion: 3,
      packages: {
        "": {},
        "node_modules/ajv": { version: "6.15.0" },
        "node_modules/eslint": {
          version: "9.0.0",
          dependencies: { ajv: "^6.0.0" },
        },
      },
    };
    const packageJson = {
      dependencies: {},
      devDependencies: { eslint: "^9.0.0" },
    };
    expect(
      evaluateExceptionRootAncestors({
        bunLockText: bunLock,
        npmLockText: JSON.stringify(npmLockDocument),
        packageJson,
        exceptions,
      }),
    ).toEqual({ ok: true, errors: [] });

    for (const edgeGroup of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
      const driftedBunLock = [
        bunLock,
        `"runtime-parent": ["runtime-parent@1.0.0", "", { "${edgeGroup}": { "eslint": "^9.0.0" } }]`,
      ].join("\n");
      const driftedNpmLock = {
        ...npmLockDocument,
        packages: {
          ...npmLockDocument.packages,
          "node_modules/runtime-parent": {
            version: "1.0.0",
            [edgeGroup]: { eslint: "^9.0.0" },
          },
        },
      };
      const drifted = evaluateExceptionRootAncestors({
        bunLockText: driftedBunLock,
        npmLockText: JSON.stringify(driftedNpmLock),
        packageJson: {
          dependencies: { "runtime-parent": "1.0.0" },
          devDependencies: { eslint: "^9.0.0" },
        },
        exceptions,
      });
      expect(drifted.ok, edgeGroup).toBe(false);
      expect(drifted.errors.join(" "), edgeGroup).toContain("runtime-parent");
    }
  });

  it("fails closed when production code directly imports an excepted transitive", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    const root = resolve("virtual-repo");
    const safePath = resolve(root, "src/safe.ts");
    const unsafePath = resolve(root, "src/unsafe.ts");
    const readFile = (path: string) =>
      path === unsafePath ? 'import Ajv from "ajv";' : 'import React from "react";';

    expect(
      evaluateExceptionSourceImports({
        repoRoot: root,
        exceptions,
        readFile,
        listFiles: () => [safePath],
      }),
    ).toEqual({ ok: true, errors: [] });
    expect(
      evaluateExceptionSourceImports({
        repoRoot: root,
        exceptions,
        readFile,
        listFiles: () => [safePath, unsafePath],
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        errors: [expect.stringContaining("src/unsafe.ts")],
      }),
    );
  });

  it("fails on a stale exception and surfaces deterministic recheck dates", () => {
    const exceptions = parseReviewedExceptions(exceptionDocument());
    const stale = evaluateReviewedExceptions([], exceptions, { today: "2026-07-25" });
    expect(stale.stale).toHaveLength(1);

    const first = evaluateReviewedExceptions([finding()], exceptions, {
      today: VALID_EXCEPTION.recheckOn,
    });
    const second = evaluateReviewedExceptions([finding()], exceptions, {
      today: VALID_EXCEPTION.recheckOn,
    });
    expect(first).toEqual(second);
    expect(first.recheckDue).toHaveLength(1);
  });
});

describe("check-dependency-security CLI", () => {
  it("uses cmd.exe for npm audit on Windows without spawning npm.cmd directly", () => {
    expect(npmAuditInvocation("win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" })).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm audit --package-lock-only --json"],
    });
    expect(npmAuditInvocation("linux", {})).toEqual({
      command: "npm",
      args: ["audit", "--package-lock-only", "--json"],
    });
  });

  it("executes on Windows and uses the explicit exception file", () => {
    const root = mkdtempSync(join(tmpdir(), "verdant-dependency-audit-"));
    const auditPath = join(root, "audit.json");
    const exceptionsPath = join(root, "exceptions.json");
    const script = resolve(__dirname, "../../scripts/check-dependency-security.mjs");

    try {
      writeFileSync(auditPath, CLEAN_JSON, "utf8");
      writeFileSync(exceptionsPath, exceptionDocument([]), "utf8");
      const result = spawnSync(
        process.execPath,
        [script, "--input", auditPath, "--exceptions", exceptionsPath],
        { cwd: root, encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "OK (0 advisory findings parsed, 0 reviewed blocked findings, 0 unreviewed blocked)",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns tooling-error exit 2 for parser drift", () => {
    const root = mkdtempSync(join(tmpdir(), "verdant-dependency-audit-"));
    const auditPath = join(root, "audit.json");
    const exceptionsPath = join(root, "exceptions.json");
    const script = resolve(__dirname, "../../scripts/check-dependency-security.mjs");

    try {
      writeFileSync(auditPath, JSON.stringify({ newAuditShape: true }), "utf8");
      writeFileSync(exceptionsPath, exceptionDocument([]), "utf8");
      const result = spawnSync(
        process.execPath,
        [script, "--input", auditPath, "--exceptions", exceptionsPath],
        { cwd: root, encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("TOOLING ERROR");
      expect(result.stderr).toContain("not recognized");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("check-dependency-security log redaction", () => {
  it("removes JWT, GitHub, npm, Bearer, and key-shaped tokens", () => {
    const raw = [
      "Bearer abcdef1234567890abcdef",
      "ghp_ABCDEFGHIJKLMNOPQRSTUVWX",
      "npm_ABCDEFGHIJKLMNOPQRSTUVWX",
      "aaaaaaaaaa.bbbbbbbbbb.cccccccccc",
      "sk_ABCDEFGHIJKLMNOP",
    ].join(" ");
    const redacted = redactSecrets(raw);
    expect(redacted).not.toContain("abcdef1234567890abcdef");
    expect(redacted).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWX");
    expect(redacted).not.toContain("npm_ABCDEFGHIJKLMNOPQRSTUVWX");
    expect(redacted).not.toContain("aaaaaaaaaa.bbbbbbbbbb.cccccccccc");
    expect(redacted).toContain("[REDACTED_KEY]");
  });
});
