import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(
  path.resolve(__dirname, "../components/TentBridgeTokensCard.tsx"),
  "utf8",
);

describe("TentBridgeTokensCard — safe load failure handling", () => {
  it("does not leak raw DB error.message into the toast", () => {
    expect(SRC).not.toMatch(/description:\s*error\.message/);
  });

  it("uses calm, non-leaking copy on failure", () => {
    expect(SRC).toMatch(/Bridge token status unavailable/);
    expect(SRC).toMatch(/Token secrets were not loaded/);
  });

  it("guards against non-UUID tent ids before querying bridge_tokens", () => {
    expect(SRC).toMatch(/isUuid\(tentId\)/);
  });

  it("never selects token_hash, ciphertext, nonce, or secret material", () => {
    expect(SRC).not.toMatch(/token_hash/);
    expect(SRC).not.toMatch(/secret_ciphertext|secret_nonce|secret_hash/);
  });

  it("never references service_role in client code", () => {
    expect(SRC).not.toMatch(/service_role|SERVICE_ROLE_KEY/);
  });

  it("offers a retry that re-calls the same metadata load path", () => {
    expect(SRC).toMatch(/data-testid="bridge-token-load-failed"/);
    expect(SRC).toMatch(/onClick=\{load\}/);
  });

  it("does not write to sensor tables or invoke device control", () => {
    expect(SRC).not.toMatch(/sensor_readings/);
    expect(SRC).not.toMatch(/device[_-]?control/i);
  });
});
