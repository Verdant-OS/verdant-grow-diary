import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const handler = readFileSync(
  resolve(root, "supabase/functions/pi-ingest-readings/index.ts"),
  "utf8",
);

describe("pi-ingest-readings authentication configuration", () => {
  it("lets HMAC-authenticated bridge requests reach the handler", () => {
    expect(config).toMatch(/\[functions\.pi-ingest-readings\]\s*\r?\n\s*verify_jwt\s*=\s*false/);
  });

  it("retains the handler-level bridge identity, timestamp, and signature checks", () => {
    expect(handler).toMatch(/req\.headers\.get\("x-bridge-id"\)/);
    expect(handler).toMatch(/req\.headers\.get\("x-bridge-signature"\)/);
    expect(handler).toMatch(/req\.headers\.get\("x-bridge-timestamp"\)/);
    expect(handler).toMatch(/verifyBridgeRequest\(/);
    expect(handler).toMatch(/buildUnauthorizedResponseBody\(\)/);
  });
});
