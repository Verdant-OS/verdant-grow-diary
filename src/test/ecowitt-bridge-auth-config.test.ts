/**
 * ECOWITT bridge authentication boundary.
 *
 * Platform JWT verification must be off for tent-scoped vbt_ bridge tokens,
 * but each handler must retain its own strict Bearer authentication path.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIG = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
const SENSOR_INGEST_WEBHOOK = readFileSync(
  resolve(process.cwd(), "supabase/functions/sensor-ingest-webhook/index.ts"),
  "utf8",
);
const ECOWITT_INGEST = readFileSync(
  resolve(process.cwd(), "supabase/functions/ecowitt-ingest/index.ts"),
  "utf8",
);

describe("ECOWITT bridge authentication configuration", () => {
  it("lets both custom-token functions reach their handler-level verifier", () => {
    expect(CONFIG).toMatch(/\[functions\.sensor-ingest-webhook\]\s*\n\s*verify_jwt = false/);
    expect(CONFIG).toMatch(/\[functions\.ecowitt-ingest\]\s*\n\s*verify_jwt = false/);
  });

  it.each([
    ["sensor-ingest-webhook", SENSOR_INGEST_WEBHOOK],
    ["ecowitt-ingest", ECOWITT_INGEST],
  ])("%s still requires and verifies a Bearer credential", (_name, source) => {
    expect(source).toMatch(/req\.headers\.get\("Authorization"\)/);
    expect(source).toMatch(/startsWith\("Bearer "\)/);
    expect(source).toMatch(/authenticateBearer\(rawToken,/);
    expect(source).toMatch(/unauthorized/);
  });

  it.each([
    ["sensor-ingest-webhook", SENSOR_INGEST_WEBHOOK],
    ["ecowitt-ingest", ECOWITT_INGEST],
  ])("%s rejects ordinary user JWTs for trusted telemetry", (_name, source) => {
    expect(source).toMatch(/allowJwt:\s*false/);
    expect(source).toMatch(/bridge_required/);
    expect(source).not.toMatch(/anonForJwt/);
  });
});
