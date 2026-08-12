/**
 * Pure-lib tests for the MCP status page support features:
 * local per-tool preferences, the OAuth attempt log, the connection
 * status JSON export, and the issuer-context setup-guide mapping.
 *
 * All storage and clocks are injected — no real localStorage, no real
 * time, no network.
 */
import { describe, it, expect } from "vitest";
import { MCP_MANIFEST, containsSecretLikeValue } from "@/lib/mcp/manifestView";
import {
  LOCAL_TOOL_PREFS_KEY,
  readLocalToolPreferences,
  setLocalToolPreference,
} from "@/lib/mcp/localToolPreferences";
import {
  OAUTH_ATTEMPT_LOG_KEY,
  readLastOAuthAttempt,
  recordOAuthAttemptFailure,
  recordOAuthAttemptStart,
  recordOAuthAttemptSuccess,
  sanitizeAttemptReason,
} from "@/lib/mcp/oauthAttemptLog";
import {
  buildConnectionStatusExport,
  deriveProjectRef,
  serializeConnectionStatusExport,
  type ConnectionStatusExport,
  type ConnectionStatusExportInput,
} from "@/lib/mcp/connectionStatusExport";
import { getIssuerSetupGuideLink, type IssuerContext } from "@/lib/mcp/issuerSetupGuide";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    dump: () => Object.fromEntries(map.entries()),
  };
}

const TOOL_NAMES = MCP_MANIFEST.tools.map((t) => t.name);

describe("localToolPreferences", () => {
  it("defaults every advertised tool to enabled with empty or null storage", () => {
    const fromEmpty = readLocalToolPreferences(fakeStorage());
    const fromNull = readLocalToolPreferences(null);
    for (const name of TOOL_NAMES) {
      expect(fromEmpty[name]).toBe(true);
      expect(fromNull[name]).toBe(true);
    }
    expect(Object.keys(fromEmpty).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("falls back to defaults on corrupt or non-object JSON", () => {
    for (const raw of ["not-json{", "[]", "null", '"string"']) {
      const prefs = readLocalToolPreferences(fakeStorage({ [LOCAL_TOOL_PREFS_KEY]: raw }));
      for (const name of TOOL_NAMES) expect(prefs[name]).toBe(true);
    }
  });

  it("ignores unknown keys and non-boolean values from storage", () => {
    const storage = fakeStorage({
      [LOCAL_TOOL_PREFS_KEY]: JSON.stringify({
        evil_tool: false,
        list_grows: "nope",
        list_recent_diary_entries: false,
      }),
    });
    const prefs = readLocalToolPreferences(storage);
    expect(prefs).not.toHaveProperty("evil_tool");
    expect(prefs.list_grows).toBe(true); // non-boolean rejected
    expect(prefs.list_recent_diary_entries).toBe(false);
  });

  it("threads the caller's in-memory map so a failed write is not reverted by a stale re-read", () => {
    // Storage that never persists (privacy mode / quota exhausted).
    const brokenStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const afterFirst = setLocalToolPreference("list_grows", false, brokenStorage);
    expect(afterFirst.list_grows).toBe(false);
    // Without `current`, the second update would re-read defaults and
    // silently re-enable list_grows. Threading the map preserves it.
    const afterSecond = setLocalToolPreference(
      "get_latest_sensor_snapshot",
      false,
      brokenStorage,
      afterFirst,
    );
    expect(afterSecond.list_grows).toBe(false);
    expect(afterSecond.get_latest_sensor_snapshot).toBe(false);
    expect(afterSecond.list_recent_diary_entries).toBe(true);
  });

  it("round-trips a preference write and refuses unknown tool names", () => {
    const storage = fakeStorage();
    const afterSet = setLocalToolPreference("list_grows", false, storage);
    expect(afterSet.list_grows).toBe(false);
    expect(readLocalToolPreferences(storage).list_grows).toBe(false);

    const before = storage.dump();
    const afterUnknown = setLocalToolPreference("made_up_tool", false, storage);
    expect(afterUnknown).not.toHaveProperty("made_up_tool");
    expect(storage.dump()).toEqual(before); // nothing written
  });
});

describe("oauthAttemptLog", () => {
  const clock = (iso: string) => () => iso;

  it("records start → failure keeping the original start time", () => {
    const storage = fakeStorage();
    recordOAuthAttemptStart(clock("2026-08-12T10:00:00.000Z"), storage);
    const failed = recordOAuthAttemptFailure(
      "Token exchange failed (500)",
      clock("2026-08-12T10:01:00.000Z"),
      storage,
    );
    expect(failed).toEqual({
      startedAt: "2026-08-12T10:00:00.000Z",
      completedAt: "2026-08-12T10:01:00.000Z",
      outcome: "failed",
      reason: "Token exchange failed (500)",
    });
    expect(readLastOAuthAttempt(storage)).toEqual(failed);
  });

  it("records start → success", () => {
    const storage = fakeStorage();
    recordOAuthAttemptStart(clock("2026-08-12T10:00:00.000Z"), storage);
    const ok = recordOAuthAttemptSuccess(clock("2026-08-12T10:00:30.000Z"), storage);
    expect(ok.outcome).toBe("success");
    expect(ok.startedAt).toBe("2026-08-12T10:00:00.000Z");
    expect(ok.completedAt).toBe("2026-08-12T10:00:30.000Z");
    expect(ok.reason).toBeUndefined();
  });

  it("sanitizes secret-like, oversized, and non-string reasons", () => {
    expect(sanitizeAttemptReason("Bearer abc.def.ghi leaked")).toMatch(/withheld/i);
    expect(sanitizeAttemptReason({ message: "obj" })).toMatch(/withheld/i);
    expect(sanitizeAttemptReason("")).toMatch(/withheld/i);
    const long = "x".repeat(500);
    expect(sanitizeAttemptReason(long).length).toBeLessThanOrEqual(160);
    expect(sanitizeAttemptReason("Consent denied")).toBe("Consent denied");
  });

  it("scans BEFORE truncating so a secret straddling the cut cannot leak a fragment", () => {
    // The secret starts near the 160-char boundary; truncating first
    // would leave "Bearer abc" (too short for the pattern) and pass.
    const straddling = `${"x".repeat(155)} Bearer abcdefghijklmnopqrstuvwxyz012345`;
    const sanitized = sanitizeAttemptReason(straddling);
    expect(sanitized).toMatch(/withheld/i);
    expect(containsSecretLikeValue(sanitized)).toBe(false);
  });

  it("re-sanitizes on read: storage contents are untrusted", () => {
    const storage = fakeStorage({
      [OAUTH_ATTEMPT_LOG_KEY]: JSON.stringify({
        startedAt: "2026-08-12T10:00:00.000Z",
        completedAt: "2026-08-12T10:01:00.000Z",
        outcome: "failed",
        reason: "echoed Bearer abc.def.ghi in error body",
      }),
    });
    const record = readLastOAuthAttempt(storage);
    expect(record?.reason).toMatch(/withheld/i);
    expect(containsSecretLikeValue(record?.reason ?? "")).toBe(false);
  });

  it("returns null for corrupt, partial, or missing records", () => {
    expect(readLastOAuthAttempt(fakeStorage())).toBeNull();
    expect(readLastOAuthAttempt(null)).toBeNull();
    for (const raw of ["{", "null", "[]", JSON.stringify({ outcome: "failed" })]) {
      expect(readLastOAuthAttempt(fakeStorage({ [OAUTH_ATTEMPT_LOG_KEY]: raw }))).toBeNull();
    }
  });
});

function exportInput(
  overrides: Partial<ConnectionStatusExportInput> = {},
): ConnectionStatusExportInput {
  return {
    supabaseOrigin: "https://knkwiiywfkbqznbxwqfh.supabase.co",
    appOrigin: "https://verdantgrowdiary.com",
    issuerContext: "configured",
    manifestFingerprint: "abcd1234ef",
    connectedInThisBrowser: false,
    localToolPreferences: readLocalToolPreferences(fakeStorage()),
    lastOAuthAttempt: null,
    exportedAt: "2026-08-12T12:00:00.000Z",
    ...overrides,
  };
}

describe("connectionStatusExport", () => {
  it("builds a complete, presenter-safe export", () => {
    const prefs = readLocalToolPreferences(fakeStorage());
    prefs.list_grows = false;
    const exp = buildConnectionStatusExport(
      exportInput({
        localToolPreferences: prefs,
        lastOAuthAttempt: {
          startedAt: "2026-08-12T10:00:00.000Z",
          completedAt: "2026-08-12T10:01:00.000Z",
          outcome: "failed",
          reason: "Consent denied",
        },
      }),
    );
    expect(exp.exportKind).toBe("verdant-mcp-connection-status");
    expect(exp.endpoints.mcpEndpoint).toBe(
      "https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp",
    );
    expect(exp.endpoints.consentUrl).toBe("https://verdantgrowdiary.com/.lovable/oauth/consent");
    expect(exp.oauth.issuer).toBe(MCP_MANIFEST.oauthIssuer);
    expect(exp.oauth.acceptedAudiences).toEqual(["authenticated"]);
    expect(exp.oauth.lastAttempt?.outcome).toBe("failed");
    expect(exp.orgContext.projectRef).toBe("knkwiiywfkbqznbxwqfh");
    expect(exp.tools).toHaveLength(MCP_MANIFEST.tools.length);
    const grows = exp.tools.find((t) => t.name === "list_grows");
    expect(grows?.enabledInThisBrowser).toBe(false);
    expect(grows?.authorization).toBe("integration-wide-oauth-grant");
    const others = exp.tools.filter((t) => t.name !== "list_grows");
    for (const t of others) expect(t.enabledInThisBrowser).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const a = serializeConnectionStatusExport(buildConnectionStatusExport(exportInput()));
    const b = serializeConnectionStatusExport(buildConnectionStatusExport(exportInput()));
    expect(a.ok && b.ok && a.json === b.json).toBe(true);
  });

  it("falls back to bare paths when origins are unset", () => {
    const exp = buildConnectionStatusExport(exportInput({ supabaseOrigin: "", appOrigin: "" }));
    expect(exp.endpoints.mcpEndpoint).toBe(MCP_MANIFEST.path);
    expect(exp.endpoints.consentUrl).toBe(MCP_MANIFEST.consentPath);
    expect(exp.orgContext.appOrigin).toBe("");
  });

  it("serializes with a timestamped filename and no secret-like content", () => {
    const serialized = serializeConnectionStatusExport(buildConnectionStatusExport(exportInput()));
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(serialized.filename).toBe("verdant-mcp-connection-status-2026-08-12T12-00-00-000Z.json");
    const parsed = JSON.parse(serialized.json) as ConnectionStatusExport;
    expect(parsed.exportVersion).toBe(1);
    expect(containsSecretLikeValue(serialized.json)).toBe(false);
  });

  it("fails closed when secret-like content slips into the payload", () => {
    const exp = buildConnectionStatusExport(exportInput());
    const poisoned = {
      ...exp,
      notes: [...exp.notes, "debug: Bearer abc.def.ghi"],
    } as ConnectionStatusExport;
    const serialized = serializeConnectionStatusExport(poisoned);
    expect(serialized.ok).toBe(false);
    if (serialized.ok) return;
    expect(serialized.error).toMatch(/blocked/i);
  });

  it("derives the project ref only for *.supabase.co issuer hosts", () => {
    expect(deriveProjectRef("https://knkwiiywfkbqznbxwqfh.supabase.co/auth/v1")).toBe(
      "knkwiiywfkbqznbxwqfh",
    );
    expect(deriveProjectRef("not a url")).toBeNull();
    expect(deriveProjectRef("")).toBeNull();
    // Non-Supabase hosts must not yield confident nonsense in a support file.
    expect(deriveProjectRef("https://localhost:54321/auth/v1")).toBeNull();
    expect(deriveProjectRef("https://127.0.0.1:54321/auth/v1")).toBeNull();
    expect(deriveProjectRef("https://auth.example.com/auth/v1")).toBeNull();
    expect(deriveProjectRef("https://evil.supabase.co.attacker.dev/auth/v1")).toBeNull();
  });
});

describe("issuerSetupGuide", () => {
  it("maps each issuer context to a distinct anchored guide section", () => {
    const contexts: IssuerContext[] = ["configured", "not_configured", "unverified"];
    const hrefs = contexts.map((c) => getIssuerSetupGuideLink(c).href);
    expect(new Set(hrefs).size).toBe(3);
    for (const href of hrefs) {
      expect(href).toMatch(/^\/docs\/mcp-api#issuer-/);
    }
  });

  it("falls back to the unverified section for unknown contexts", () => {
    const link = getIssuerSetupGuideLink("mystery" as IssuerContext);
    expect(link.href).toBe("/docs/mcp-api#issuer-unverified");
  });
});
