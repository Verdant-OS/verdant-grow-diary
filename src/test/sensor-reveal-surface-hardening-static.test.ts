/**
 * Bridge audit gap G6 — client reveal-surface hardening pins.
 *
 * Static source contracts for the two token-handling components (see
 * docs/bridge-sensor-ingest-security-audit-checklist.md §11):
 *
 *   1. The on-screen PowerShell listener snippet is placeholder-only; the
 *      one-time reveal box is the SINGLE DOM location for the plaintext.
 *   2. Every token-embedding copy path (curl, listener config, ingest
 *      script) goes through the shared confirm-before-copy gate.
 *   3. The testbench reveal has a Dismiss control (the header comment's
 *      claim is now true).
 *   4. On-screen response bodies render only through the redaction twin of
 *      the export path — never raw JSON.stringify of a server body.
 *   5. TentBridgeTokensCard toasts never render server-controlled text.
 *   6. Neither component touches storage or logs.
 *
 * Plus unit coverage for the fixed-copy failure mappers.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BRIDGE_TOKEN_MINT_FAILED_FALLBACK,
  BRIDGE_TOKEN_REVOKE_FAILED_FALLBACK,
  extractBridgeFailureCode,
  mintFailureDescription,
  revokeFailureDescription,
} from "@/lib/bridgeTokenRules";

const PANEL = readFileSync(resolve(__dirname, "../components/SensorsTestbenchPanel.tsx"), "utf8");
const CARD = readFileSync(resolve(__dirname, "../components/TentBridgeTokensCard.tsx"), "utf8");

describe("SensorsTestbenchPanel — reveal surface hardening (static)", () => {
  it("on-screen listener snippet is placeholder-only (display never embeds the reveal)", () => {
    // The display memo must build with a null token and depend only on the tent.
    expect(PANEL).toMatch(
      /powershellDisplay[\s\S]{0,220}bridgeTokenPlaintext:\s*null[\s\S]{0,120}\[tentId\]/,
    );
    // No render path may interpolate the raw reveal outside the reveal box:
    // the only JSX use of {reveal} is inside the token-reveal container.
    // (The lookbehind excludes `${reveal}` — the in-memory Authorization
    // header for the test POST is transport, not DOM.)
    const bareReveal = /(?<!\$)\{reveal\}/g;
    const jsxRevealUses = PANEL.match(bareReveal) ?? [];
    expect(jsxRevealUses).toHaveLength(1);
    const revealBox = PANEL.indexOf("sensors-testbench-token-reveal");
    const revealRender = bareReveal.exec(PANEL)?.index ?? -1;
    expect(revealBox).toBeGreaterThan(-1);
    expect(revealRender).toBeGreaterThan(revealBox);
  });

  it("all three token-embedding copy paths use the shared confirmation gate", () => {
    const gateUses = PANEL.match(/confirmTokenEmbeddingCopy\(/g) ?? [];
    // Definition + curl + listener config + ingest script.
    expect(gateUses.length).toBeGreaterThanOrEqual(4);
    expect(PANEL).toMatch(/copyCurl[\s\S]{0,200}confirmTokenEmbeddingCopy\("curl command"\)/);
    expect(PANEL).toMatch(
      /copyPowerShell\(\)[\s\S]{0,320}confirmTokenEmbeddingCopy\("PowerShell listener config"\)/,
    );
    expect(PANEL).toMatch(
      /copyPowerShellIngest[\s\S]{0,320}confirmTokenEmbeddingCopy\("PowerShell ingest script"\)/,
    );
  });

  it("the reveal box has a Dismiss control", () => {
    expect(PANEL).toMatch(/sensors-testbench-token-dismiss/);
    expect(PANEL).toMatch(/setReveal\(null\)/);
  });

  it("on-screen response bodies are redacted, never raw-stringified", () => {
    const redactedUses = PANEL.match(/redactedResponseBodyJson\(/g) ?? [];
    expect(redactedUses.length).toBeGreaterThanOrEqual(2);
    expect(PANEL).not.toMatch(/JSON\.stringify\(result\.body/);
    expect(PANEL).not.toMatch(/JSON\.stringify\(h\.body/);
  });
});

describe("TentBridgeTokensCard — toast + boundary hardening (static)", () => {
  it("failure toasts never render server-controlled text (both components)", () => {
    for (const source of [CARD, PANEL]) {
      expect(source).not.toMatch(/error\??\.message/);
      expect(source).not.toMatch(/data\??\.error\s*\?\?/);
      expect(source).toMatch(/mintFailureDescription\(extractBridgeFailureCode\(/);
    }
    expect(CARD).toMatch(/revokeFailureDescription\(extractBridgeFailureCode\(/);
  });

  it("never touches storage, IndexedDB, or console", () => {
    for (const source of [CARD, PANEL]) {
      expect(source).not.toMatch(/\blocalStorage\b/);
      expect(source).not.toMatch(/\bsessionStorage\b/);
      expect(source).not.toMatch(/\bindexedDB\b/i);
      expect(source).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });
});

describe("bridge token failure copy mappers (pure)", () => {
  it("maps known codes to fixed copy and everything else to the calm fallback", () => {
    expect(mintFailureDescription("upgrade_required")).toMatch(/paid plan/);
    expect(mintFailureDescription("forbidden_tent")).toMatch(/not yours/);
    expect(revokeFailureDescription("not_found")).toMatch(/already be revoked/);
    for (const hostile of [
      'PostgrestError: raw SQL near "bridge_tokens"',
      "vbt_stolenTokenValue1234567890abcd",
      { message: "object injection" },
      null,
      undefined,
      42,
      // Prototype-chain probes must hit the fallback, not inherited members.
      "__proto__",
      "constructor",
      "hasOwnProperty",
      "toString",
    ]) {
      expect(mintFailureDescription(hostile)).toBe(BRIDGE_TOKEN_MINT_FAILED_FALLBACK);
      expect(revokeFailureDescription(hostile)).toBe(BRIDGE_TOKEN_REVOKE_FAILED_FALLBACK);
    }
  });

  it("never echoes its input", () => {
    const hostile = "vbt_reflectedTokenValue1234567890";
    expect(mintFailureDescription(hostile)).not.toContain(hostile);
    expect(revokeFailureDescription(hostile)).not.toContain(hostile);
  });
});

describe("extractBridgeFailureCode (pure)", () => {
  it("prefers a 2xx data.error code", () => {
    expect(extractBridgeFailureCode(null, { error: "insert_failed" })).toBe("insert_failed");
  });

  it("reads the code from FunctionsHttpError context (string and object bodies)", () => {
    expect(
      extractBridgeFailureCode(
        { context: { body: JSON.stringify({ error: "upgrade_required" }) } },
        null,
      ),
    ).toBe("upgrade_required");
    expect(extractBridgeFailureCode({ context: { body: { error: "not_found" } } }, null)).toBe(
      "not_found",
    );
  });

  it("returns null (never throws, never fabricates) on hostile or absent shapes", () => {
    expect(extractBridgeFailureCode(null, null)).toBeNull();
    expect(extractBridgeFailureCode({ message: "boom" }, undefined)).toBeNull();
    expect(extractBridgeFailureCode({ context: { body: "not json {" } }, null)).toBeNull();
    expect(extractBridgeFailureCode({ context: { body: { error: 42 } } }, null)).toBeNull();
    expect(
      extractBridgeFailureCode({ context: { body: 7 } }, { error: { nested: true } }),
    ).toBeNull();
  });
});
