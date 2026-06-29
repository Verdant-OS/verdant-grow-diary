// Diagnostics Audience Split v1 — static safety scan.
//
// Confirms src/pages/Diagnostics.tsx no longer renders raw user identifiers,
// raw inserted row IDs, raw payloads, tokens, or other operator-sensitive
// values in result detail copy. The page is operator-only and gated by
// <RequireOperatorRole />, but defense-in-depth still applies: we keep
// status copy human-readable and free of raw UUIDs / emails / secrets.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../pages/Diagnostics.tsx"),
  "utf8",
);

describe("Diagnostics UI — raw identifier exposure safety", () => {
  it("does not interpolate raw user_id or email into result detail strings", () => {
    expect(SRC).not.toMatch(/user_id=\$\{/);
    expect(SRC).not.toMatch(/email=\$\{/);
    expect(SRC).not.toMatch(/\$\{data\.session\.user\.id\}/);
    expect(SRC).not.toMatch(/data\.session\.user\.email/);
  });

  it("does not interpolate raw inserted row id into result detail strings", () => {
    expect(SRC).not.toMatch(/\$\{inserted\.id\}/);
    expect(SRC).not.toMatch(/row \$\{/);
  });

  it("does not expose raw profile column values (tier, level, nugs) in result detail", () => {
    expect(SRC).not.toMatch(/\$\{data\.tier\}/);
    expect(SRC).not.toMatch(/\$\{data\.level\}/);
    expect(SRC).not.toMatch(/\$\{data\.nugs_total\}/);
  });

  it("does not reference secrets, tokens, raw_payload, prompts, or completions", () => {
    const banned = [
      "service_role",
      "access_token",
      "refresh_token",
      "raw_payload",
      "JWT",
      "completion",
      "prompt(",
    ];
    for (const term of banned) {
      expect(SRC.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it("retains safe operator-only status copy", () => {
    expect(SRC).toContain("Authenticated session detected.");
    expect(SRC).toContain("Profile ownership check passed.");
    expect(SRC).toContain("RLS round-trip insert/delete check passed.");
    expect(SRC.replace(/\s+/g, " ")).toContain("No operator secrets or raw payloads are shown.");
  });
});
