/**
 * Static safety scans for the One-Tent Loop Live Proof surface.
 *
 * Ensures:
 *  - Presenter contains no Supabase writes (.insert/.update/.delete/.upsert/.rpc)
 *  - Presenter contains no fetch/XHR/sendBeacon/WebSocket/EventSource
 *  - Presenter contains no functions.invoke (AI/edge calls)
 *  - Presenter contains no service_role or bridge token references
 *  - Rules + view model contain no I/O primitives
 *  - Rules + view model contain no forbidden overconfident/device copy
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PRESENTER = fs.readFileSync(
  path.resolve(__dirname, "../pages/OneTentLoopLiveProof.tsx"),
  "utf8",
);
const RULES = fs.readFileSync(path.resolve(__dirname, "../lib/oneTentLoopProofRules.ts"), "utf8");
const CURRENT_LIVE_RULES = fs.readFileSync(
  path.resolve(__dirname, "../lib/currentLiveSensorTruthRules.ts"),
  "utf8",
);
const VM = fs.readFileSync(
  path.resolve(__dirname, "../lib/oneTentLoopLiveProofViewModel.ts"),
  "utf8",
);

const WRITE_PATTERNS = [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("];
const NETWORK_PATTERNS = [
  "fetch(",
  "XMLHttpRequest",
  "sendBeacon",
  "new WebSocket",
  "new EventSource",
  "functions.invoke",
];
const SECRET_PATTERNS = [
  "service_role",
  "SERVICE_ROLE",
  "SUPABASE_SERVICE_ROLE",
  "bridge_token",
  "bridge-token",
  "raw_payload",
];
const FORBIDDEN_COPY = [
  "execute",
  "run command",
  "send command",
  "control device",
  "turn on",
  "turn off",
  "set fan",
  "set light",
  "flush immediately",
  "guaranteed",
  "definitely",
  "certainly",
];

function assertNone(src: string, needles: readonly string[], where: string) {
  for (const n of needles) {
    expect(src.includes(n), `${where} must not contain ${n}`).toBe(false);
  }
}

describe("OneTentLoopLiveProof — static safety", () => {
  it("presenter has no Supabase writes", () => {
    assertNone(PRESENTER, WRITE_PATTERNS, "OneTentLoopLiveProof.tsx");
  });
  it("presenter has no direct network calls", () => {
    assertNone(PRESENTER, NETWORK_PATTERNS, "OneTentLoopLiveProof.tsx");
  });
  it("presenter has no secret / bridge token / raw payload references", () => {
    assertNone(PRESENTER, SECRET_PATTERNS, "OneTentLoopLiveProof.tsx");
  });
  it("presenter has no forbidden device-control / overconfidence copy", () => {
    assertNone(PRESENTER.toLowerCase(), FORBIDDEN_COPY, "OneTentLoopLiveProof.tsx");
  });

  it("rules module has no I/O primitives", () => {
    assertNone(RULES, [...WRITE_PATTERNS, ...NETWORK_PATTERNS], "oneTentLoopProofRules.ts");
    assertNone(
      CURRENT_LIVE_RULES,
      [...WRITE_PATTERNS, ...NETWORK_PATTERNS],
      "currentLiveSensorTruthRules.ts",
    );
    expect(RULES.includes("supabase")).toBe(false);
    expect(CURRENT_LIVE_RULES.includes("supabase")).toBe(false);
    expect(RULES.includes("Date.now(")).toBe(false);
    expect(CURRENT_LIVE_RULES.includes("Date.now(")).toBe(false);
  });

  it("view model has no I/O primitives", () => {
    assertNone(VM, [...WRITE_PATTERNS, ...NETWORK_PATTERNS], "oneTentLoopLiveProofViewModel.ts");
    expect(VM.includes("supabase")).toBe(false);
  });

  it("rules + view model contain no forbidden device-control / overconfidence copy", () => {
    assertNone(RULES.toLowerCase(), FORBIDDEN_COPY, "oneTentLoopProofRules.ts");
    assertNone(CURRENT_LIVE_RULES.toLowerCase(), FORBIDDEN_COPY, "currentLiveSensorTruthRules.ts");
    assertNone(VM.toLowerCase(), FORBIDDEN_COPY, "oneTentLoopLiveProofViewModel.ts");
  });
});
