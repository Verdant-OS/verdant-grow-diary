import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSigningString,
  SIGNING_WINDOW_MS,
} from "@/lib/piIngestAuthRules";

const ROOT = process.cwd();
const README = readFileSync(
  join(ROOT, "docs/plantuml/architecture/README.md"),
  "utf8",
);
const PI_AUTH_SOURCE = readFileSync(
  join(ROOT, "src/lib/piIngestAuthRules.ts"),
  "utf8",
);

describe("bridge architecture Pi text alternative contract", () => {
  it("documents the exact canonical Pi signing message and trust gates", () => {
    expect(README).toContain("METHOD_UPPERCASE");
    expect(README).toContain("REQUEST_PATH");
    expect(README).toContain("ISO_8601_TIMESTAMP");
    expect(README).toContain("EXACT_RAW_BODY");
    expect(README).toMatch(/5 minutes old|5 minutes in the future|±5-minute/i);
    expect(README).toMatch(/allowed tent ids|tent allowlist/i);
    expect(README).toMatch(/server-derived owner|derives owner and tent identity/i);
    expect(README).toMatch(/re-serialized JSON body/i);
  });

  it("matches the executable signing-string and timestamp-window rules", () => {
    const timestamp = "2026-08-15T16:20:00.000Z";
    const rawBody = '{"tent_id":"tent-a","temperature_c":25.1}';

    expect(buildSigningString("post", "/functions/v1/pi-ingest-readings", timestamp, rawBody)).toBe(
      `POST\n/functions/v1/pi-ingest-readings\n${timestamp}\n${rawBody}`,
    );
    expect(SIGNING_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(PI_AUTH_SOURCE).toContain("cred.allowedTentIds.includes(tentId)");
    expect(PI_AUTH_SOURCE).toContain("ownerUserId: cred.ownerUserId");
    expect(PI_AUTH_SOURCE).toContain(
      "buildSigningString(req.method, req.path, timestamp, req.rawBody)",
    );
  });
});
