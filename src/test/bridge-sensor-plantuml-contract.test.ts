/**
 * Source-to-diagram contract for the bridge sensor PlantUML architecture pack.
 * Pins load-bearing truths only — not layout aesthetics.
 *
 * Two-sided by design (review finding on #718): the "diagram claims" blocks
 * pin the .puml text, and the "source grounding" block pins the SAME facts
 * in the actual handler/auth/migration sources. If either side drifts —
 * handler behavior changes, or a diagram quietly rewrites reality — one
 * half of the pair fails and names the divergence.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ARCH = join(process.cwd(), "docs/plantuml/architecture");
const SRC = {
  webhook: "supabase/functions/sensor-ingest-webhook/index.ts",
  sharedAuth: "supabase/functions/_shared/sensorIngestAuth.ts",
  freshness: "supabase/functions/_shared/sensorIngestFreshness.ts",
  revoke: "supabase/functions/revoke-bridge-token/index.ts",
  mint: "supabase/functions/mint-bridge-token/index.ts",
} as const;

function readSource(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const REQUIRED_DIAGRAMS = [
  "bridge-token-mint-use-revoke-sequence.puml",
  "sensor-ingest-verification-activity.puml",
  "bridge-token-lifecycle-state.puml",
  "sensor-ingest-trust-boundaries-component.puml",
  "ingest-auth-sibling-isolation.puml",
] as const;

function read(name: string): string {
  return readFileSync(join(ARCH, name), "utf8");
}

function allDiagramText(): string {
  return REQUIRED_DIAGRAMS.map((n) => read(n)).join("\n\n");
}

/** Affirmative side-effect patterns (not "No AI Doctor" safety prose). */
const FORBIDDEN_SIDE_EFFECT_ARROWS = [
  /(?<!No\s)(?<!no\s)AI Doctor\s*(invocation|->|→)/i,
  /->\s*[^:\n]*AI Doctor/i,
  /(?<!No\s)(?<!no\s)alert creation/i,
  /->\s*[^:\n]*Action Queue/i,
  /(?<!No\s)(?<!no\s)Action Queue write/i,
  /->\s*[^:\n]*\bautomation\b/i,
  /(?<!No\s)(?<!no\s)device control/i,
  /irrigation command/i,
  /lighting command/i,
  /setpoint change/i,
];

describe("bridge-sensor PlantUML architecture pack", () => {
  it("contains exactly the five required diagrams plus README", () => {
    expect(existsSync(ARCH)).toBe(true);
    for (const name of REQUIRED_DIAGRAMS) {
      expect(existsSync(join(ARCH, name)), name).toBe(true);
    }
    expect(existsSync(join(ARCH, "README.md"))).toBe(true);
    const puml = readdirSync(ARCH).filter((f) => f.endsWith(".puml"));
    expect(puml.sort()).toEqual([...REQUIRED_DIAGRAMS].sort());
  });

  it("each diagram has @startuml/@enduml, relative style include, and a title", () => {
    for (const name of REQUIRED_DIAGRAMS) {
      const text = read(name);
      expect(text, name).toMatch(/@startuml\b/);
      expect(text, name).toMatch(/@enduml\b/);
      expect(text, name).toContain("!include ../style.puml");
      expect(text, name).not.toContain("!include docs/plantuml/style.puml");
      expect(text, name).toMatch(/^title\s+\S+/m);
    }
  });

  it("pins load-bearing auth and storage facts", () => {
    const seq = read("bridge-token-mint-use-revoke-sequence.puml");
    const act = read("sensor-ingest-verification-activity.puml");
    const life = read("bridge-token-lifecycle-state.puml");
    const bounds = read("sensor-ingest-trust-boundaries-component.puml");
    const siblings = read("ingest-auth-sibling-isolation.puml");
    const all = allDiagramText();

    // Prefix + placeholders only
    expect(all).toMatch(/vbt_/);
    expect(seq).toMatch(/vbt_/);

    // JWT mint/revoke vs webhook
    expect(seq).toMatch(/verify_jwt\s*=\s*true/);
    expect(seq).toMatch(/verify_jwt\s*=\s*false/);
    expect(seq).toMatch(/allowJwt:\s*false/);
    expect(act).toMatch(/allowJwt:\s*false/);

    // Hash storage + once
    expect(seq).toMatch(/SHA-256/i);
    expect(seq).toMatch(/once/i);
    expect(seq).toMatch(/32 random bytes|getRandomValues/i);

    // Entitlement separate
    expect(seq).toMatch(/liveSensors|requireLiveSensorEntitlement|Entitlement/i);
    expect(act).toMatch(/separate from token|Entitlement/i);
    expect(act).toMatch(/upgrade_required/);

    // Body user_id not ownership
    expect(act).toMatch(/user_id not ownership|body user_id ignored/i);
    expect(seq).toMatch(/body user_id ignored/i);

    // Tent
    expect(seq).toMatch(/tentScopeMatches|forbidden_tent/i);
    expect(act).toMatch(/tentScopeMatches|forbidden_tent/i);

    // 30-minute ingest window
    expect(act).toMatch(/30/);
    expect(act).toMatch(/minute|60 \* 1000|FRESHNESS_WINDOW/i);
    expect(seq).toMatch(/30 minute/i);

    // Stale contract
    expect(act).toMatch(/accepted:false/);
    expect(act).toMatch(/timestamp_stale|stale/i);
    expect(act).toMatch(/zero live writes/i);

    // Service role persistence
    expect(act).toMatch(/service_role/i);
    expect(bounds).toMatch(/service_role/i);

    // Usage condition
    expect(seq).toMatch(/insertedCount\s*>\s*0/);
    expect(act).toMatch(/insertedCount\s*>\s*0/);
    expect(life).toMatch(/insertedCount\s*>\s*0/);

    // Audit best-effort
    expect(seq).toMatch(/best-effort/i);
    expect(act).toMatch(/best-effort/i);

    // One-way revoke
    expect(seq).toMatch(/already_revoked|revoked_at IS NULL/i);
    expect(life).toMatch(/Forbidden|one-way|Revoked → Active/i);
    expect(life).not.toMatch(/Revoked\s*-->\s*(Active|NeverUsed|Used)/);

    // Born-clean
    expect(life).toMatch(/born-clean/i);

    // Gateway note
    expect(bounds).toMatch(/not public live-write/i);
    expect(bounds).toMatch(/handler-owned bridge authentication/i);

    // Sibling isolation
    expect(siblings).toMatch(/HMAC/i);
    expect(siblings).toMatch(/Do not mix Pi HMAC/i);
    expect(siblings).toMatch(/vbt_/);
    expect(siblings).toMatch(/validation-only|validate only|no sensor_readings write/i);

    // Telemetry-only safety statement allowed
    expect(bounds).toMatch(/No AI Doctor|Telemetry storage only/i);
  });

  it("grounds every load-bearing diagram claim in the actual sources (drift on either side fails)", () => {
    const webhook = readSource(SRC.webhook);
    const auth = readSource(SRC.sharedAuth);
    const freshness = readSource(SRC.freshness);
    const revoke = readSource(SRC.revoke);
    const mint = readSource(SRC.mint);
    const act = read("sensor-ingest-verification-activity.puml");
    const life = read("bridge-token-lifecycle-state.puml");
    const bounds = read("sensor-ingest-trust-boundaries-component.puml");

    // Bridge-only auth: source AND diagrams.
    expect(webhook).toMatch(/allowJwt:\s*false/);
    expect(webhook).toMatch(/auth\.kind !== "bridge"/);

    // Status mapping: 403 bridge_required, 503 config/lookup, 401 otherwise
    // (unauthorized / token_revoked / token_expired) — the diagram's outcome
    // matrix must carry ALL of these branches, including plain unauthorized.
    expect(webhook).toMatch(/bridge_required"\s*\?\s*403/);
    expect(webhook).toMatch(/auth_lookup_failed"\s*\n?\s*\?\s*503/);
    expect(auth).toMatch(/error: "unauthorized"/);
    expect(act).toMatch(/401 unauthorized/);
    expect(act).toMatch(/403 bridge_required/);
    expect(act).toMatch(/503/);

    // Freshness window: single source constant, diagram states the value.
    expect(freshness).toMatch(/LIVE_INGEST_FRESHNESS_WINDOW_MS = 30 \* 60 \* 1000/);
    expect(act).toMatch(/30 \* 60 \* 1000|30-minute|30 minute/);

    // Persistence order in the handler: upsert -> usage bump -> audit.
    const iUpsert = webhook.indexOf(".upsert(");
    const iBump = webhook.indexOf("bump_bridge_token_usage");
    const iAudit = webhook.indexOf("sensor_ingest_audit_log");
    expect(iUpsert).toBeGreaterThan(-1);
    expect(iBump).toBeGreaterThan(iUpsert);
    expect(iAudit).toBeGreaterThan(iBump);
    // The webhook handler owns those writes — the component diagram must
    // attribute them to the webhook, never to the database or the checks.
    expect(webhook).toMatch(/insertedCount > 0/);
    expect(bounds).toMatch(/Webhook --> Usage/);
    expect(bounds).toMatch(/Webhook --> Audit/);
    expect(bounds).not.toMatch(/SR --> Usage/);
    expect(bounds).not.toMatch(/Gates --> Audit/);
    expect(bounds).not.toMatch(/Gates --> SR/);

    // Verification order in the handler source mirrors the diagram order.
    const at = (needle: string) => {
      const i = webhook.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    expect(at("authenticateBearer(")).toBeLessThan(at("requireLiveSensorEntitlement("));
    expect(at("requireLiveSensorEntitlement(")).toBeLessThan(at("normalizeWebhookIngestPayload("));
    expect(at("normalizeWebhookIngestPayload(")).toBeLessThan(at("tentScopeMatches("));
    expect(at("tentScopeMatches(")).toBeLessThan(at("classifyIngestTimestampFreshness("));
    expect(at("classifyIngestTimestampFreshness(")).toBeLessThan(iUpsert);

    // Lifecycle: revoke filters only owner + revoked_at IS NULL — expiry
    // does not block revocation, so Expired is NOT terminal; and auth
    // checks revoked_at BEFORE expires_at.
    expect(revoke).toMatch(/\.is\("revoked_at", null\)/);
    expect(revoke).not.toMatch(/expires_at/);
    expect(revoke).toMatch(/already_revoked/);
    expect(auth.indexOf("token_revoked")).toBeLessThan(auth.indexOf("token_expired"));
    expect(life).toMatch(/Expired --> Revoked/);
    expect(life).not.toMatch(/Expired --> \[\*\]/);

    // Mint: hash-only at rest, CSPRNG entropy.
    expect(mint).toMatch(/token_hash: tokenHash/);
    expect(mint).toMatch(/crypto\.getRandomValues/);
  });

  it("preserves verification order: auth before entitlement before tent before freshness before persistence", () => {
    const act = read("sensor-ingest-verification-activity.puml");
    const idx = (re: RegExp) => {
      const m = act.search(re);
      expect(m, String(re)).toBeGreaterThanOrEqual(0);
      return m;
    };
    const iAuth = idx(/1\.\s*Authenticate|authenticateBearer/);
    const iEnt = idx(/2\.\s*Entitlement|requireLiveSensorEntitlement/);
    const iParse = idx(/3\.\s*Parse|normalizeWebhookIngestPayload/);
    const iTent = idx(/4\.\s*Tent|tentScopeMatches/);
    const iFresh = idx(/5\.\s*Freshness|classifyIngestTimestampFreshness|30/);
    const iPersist = idx(/6\.\s*Persistence|upsert sensor_readings/);
    expect(iAuth).toBeLessThan(iEnt);
    expect(iEnt).toBeLessThan(iParse);
    expect(iParse).toBeLessThan(iTent);
    expect(iTent).toBeLessThan(iFresh);
    expect(iFresh).toBeLessThan(iPersist);
  });

  it("rejects affirmative ingest side-effect arrows (allows textual No … bans)", () => {
    const all = allDiagramText();
    for (const re of FORBIDDEN_SIDE_EFFECT_ARROWS) {
      expect(all, String(re)).not.toMatch(re);
    }
    // Explicit ban prose is required somewhere
    expect(all).toMatch(/No AI Doctor/i);
    expect(all).toMatch(/Action Queue/i);
  });

  it("rejects secret-shaped content", () => {
    const all = allDiagramText();
    // Real-looking vbt tokens: vbt_ + long base64url-ish run
    expect(all).not.toMatch(/vbt_[A-Za-z0-9_-]{20,}/);
    // JWT-shaped triple base64
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    // service_role jwt-ish or long secrets
    expect(all).not.toMatch(/service_role\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/i);
    // Private IPv4
    expect(all).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(all).not.toMatch(/\b192\.168\.\d{1,3}\.\d{1,3}\b/);
    // Placeholder JWT label is OK
    expect(all).toMatch(/<user JWT>|user JWT/i);
  });

  it("does not launder BLOCKED harness evidence as PASS", () => {
    const all = allDiagramText() + readFileSync(join(ARCH, "README.md"), "utf8");
    expect(all).toMatch(/BLOCKED/);
    // Must not claim strict harness PASS
    expect(all).not.toMatch(/strict[^\n]{0,40}PASS/i);
    expect(all).not.toMatch(/zero-skip[^\n]{0,40}PASS/i);
  });
});
