/**
 * Source↔diagram contract for the bridge sensor PlantUML architecture pack.
 *
 * Assertions read both the diagram text and the live Edge/config/migration
 * sources so handler drift fails this gate (not diagram self-consistency alone).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ARCH = join(ROOT, "docs/plantuml/architecture");

const REQUIRED_DIAGRAMS = [
  "bridge-token-mint-use-revoke-sequence.puml",
  "sensor-ingest-verification-activity.puml",
  "bridge-token-lifecycle-state.puml",
  "sensor-ingest-trust-boundaries-component.puml",
  "ingest-auth-sibling-isolation.puml",
] as const;

const SRC = {
  auth: "supabase/functions/_shared/sensorIngestAuth.ts",
  freshness: "supabase/functions/_shared/sensorIngestFreshness.ts",
  entitlement: "supabase/functions/_shared/liveSensorEntitlementGate.ts",
  webhook: "supabase/functions/sensor-ingest-webhook/index.ts",
  mint: "supabase/functions/mint-bridge-token/index.ts",
  revoke: "supabase/functions/revoke-bridge-token/index.ts",
  config: "supabase/config.toml",
  pi: "supabase/functions/pi-ingest-readings/index.ts",
  ecowitt: "supabase/functions/ecowitt-ingest/index.ts",
  ecowittReal: "supabase/functions/ecowitt-real-ingest/index.ts",
  revMig: "supabase/migrations/20260804213000_bridge_tokens_revocation_integrity.sql",
  insertMig: "supabase/migrations/20260804220000_bridge_tokens_insert_integrity.sql",
} as const;

function readArch(name: string): string {
  return readFileSync(join(ARCH, name), "utf8");
}

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function allDiagramText(): string {
  return REQUIRED_DIAGRAMS.map((n) => readArch(n)).join("\n\n");
}

/** Affirmative side-effect patterns (not "No …" safety prose). */
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
      const text = readArch(name);
      expect(text, name).toMatch(/@startuml\b/);
      expect(text, name).toMatch(/@enduml\b/);
      expect(text, name).toContain("!include ../style.puml");
      expect(text, name).not.toContain("!include docs/plantuml/style.puml");
      expect(text, name).toMatch(/^title\s+\S+/m);
    }
  });

  it("grounds load-bearing auth facts in both source and diagrams", () => {
    const auth = readSrc(SRC.auth);
    const webhook = readSrc(SRC.webhook);
    const config = readSrc(SRC.config);
    const mint = readSrc(SRC.mint);
    const freshness = readSrc(SRC.freshness);

    const seq = readArch("bridge-token-mint-use-revoke-sequence.puml");
    const act = readArch("sensor-ingest-verification-activity.puml");
    const all = allDiagramText();

    // Source: prefix + allowJwt false on webhook
    expect(auth).toMatch(/export const BRIDGE_PREFIX = "vbt_"/);
    expect(webhook).toMatch(/allowJwt:\s*false/);
    expect(mint).toMatch(/TOKEN_PREFIX = "vbt_"/);
    expect(mint).toMatch(/getRandomValues|Uint8Array\(32\)/);

    // Diagrams must state the same
    expect(all).toMatch(/vbt_/);
    expect(seq).toMatch(/allowJwt:\s*false/);
    expect(act).toMatch(/allowJwt:\s*false/);

    // verify_jwt posture in config and diagrams
    expect(config).toMatch(/\[functions\.mint-bridge-token\]\s*\n\s*verify_jwt\s*=\s*true/);
    expect(config).toMatch(/\[functions\.revoke-bridge-token\]\s*\n\s*verify_jwt\s*=\s*true/);
    expect(config).toMatch(/\[functions\.sensor-ingest-webhook\]\s*\n\s*verify_jwt\s*=\s*false/);
    expect(seq).toMatch(/verify_jwt\s*=\s*true/);
    expect(seq).toMatch(/verify_jwt\s*=\s*false/);

    // Freshness 30m both sides
    expect(freshness).toMatch(/LIVE_INGEST_FRESHNESS_WINDOW_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
    expect(act).toMatch(/30/);
    expect(act).toMatch(/minute|60 \* 1000|FRESHNESS_WINDOW/i);

    // Hash + once
    expect(mint).toMatch(/sha256Hex|SHA-256|subtle\.digest/);
    expect(seq).toMatch(/SHA-256/i);
    expect(seq).toMatch(/once/i);
  });

  it("grounds unauthorized / revoked / expired status mapping on activity diagram", () => {
    const auth = readSrc(SRC.auth);
    const webhook = readSrc(SRC.webhook);
    const act = readArch("sensor-ingest-verification-activity.puml");

    // Source error vocabulary
    expect(auth).toMatch(/"unauthorized"/);
    expect(auth).toMatch(/"bridge_required"/);
    expect(auth).toMatch(/"token_revoked"/);
    expect(auth).toMatch(/"token_expired"/);
    expect(auth).toMatch(/rawToken\.length\s*<\s*BRIDGE_PREFIX\.length\s*\+\s*16/);

    // Webhook maps bridge_required → 403, lookup fails → 503, else 401
    expect(webhook).toMatch(/bridge_required[\s\S]{0,80}403/);
    expect(webhook).toMatch(/auth_lookup_failed|server_misconfigured/);

    // Diagram must include unauthorized for short/unknown vbt_ (not only missing Bearer)
    expect(act).toMatch(/401 unauthorized/);
    expect(act).toMatch(/too-short|unknown vbt_|missing hash|short token/i);
    expect(act).toMatch(/403 bridge_required/);
    expect(act).toMatch(/401 token_revoked/);
    expect(act).toMatch(/401 token_expired/);
  });

  it("grounds usage bump + audit as webhook-handler side effects after upsert", () => {
    const webhook = readSrc(SRC.webhook);
    const bounds = readArch("sensor-ingest-trust-boundaries-component.puml");
    const seq = readArch("bridge-token-mint-use-revoke-sequence.puml");
    const act = readArch("sensor-ingest-verification-activity.puml");

    // Source: bump only if insertedCount > 0, then audit insert
    const bumpIdx = webhook.search(/bump_bridge_token_usage/);
    const upsertIdx = webhook.search(/\.upsert\(/);
    const auditIdx = webhook.search(/sensor_ingest_audit_log/);
    expect(upsertIdx).toBeGreaterThanOrEqual(0);
    expect(bumpIdx).toBeGreaterThan(upsertIdx);
    expect(auditIdx).toBeGreaterThan(bumpIdx);
    expect(webhook).toMatch(/if\s*\(\s*insertedCount\s*>\s*0\s*\)/);

    // Diagrams: usage + audit owned by webhook/handler path, not DB-triggered
    expect(bounds).toMatch(/Webhook\s*-->\s*Usage|webhook.*bump_bridge_token_usage/i);
    expect(bounds).toMatch(/Webhook\s*-->\s*Audit|webhook.*audit/i);
    expect(bounds).not.toMatch(/SR\s*-->\s*Usage/);
    expect(bounds).not.toMatch(/Gates\s*-->\s*Audit/);
    expect(seq).toMatch(/insertedCount\s*>\s*0/);
    expect(act).toMatch(/insertedCount\s*>\s*0/);
    expect(act).toMatch(/best-effort/i);
  });

  it("grounds lifecycle: Expired → Revoked allowed; Revoked → Active forbidden", () => {
    const revoke = readSrc(SRC.revoke);
    const auth = readSrc(SRC.auth);
    const life = readArch("bridge-token-lifecycle-state.puml");
    const revMig = readSrc(SRC.revMig);
    const insertMig = readSrc(SRC.insertMig);

    // Revoke only filters revoked_at IS NULL — no expires_at filter
    expect(revoke).toMatch(/\.is\(\s*["']revoked_at["']\s*,\s*null\s*\)/);
    expect(revoke).not.toMatch(/expires_at/);
    expect(revoke).toMatch(/already_revoked/);

    // Auth checks revoked before expired (runtime ifs, not type fields)
    const revCheck = auth.search(/if\s*\(\s*data\.revoked_at\s*\)/);
    const expCheck = auth.search(/new Date\(\s*data\.expires_at\s*\)|data\.expires_at\)\.getTime/);
    expect(revCheck).toBeGreaterThanOrEqual(0);
    expect(expCheck).toBeGreaterThan(revCheck);

    // Diagram encodes Expired → Revoked and forbids reverse un-revoke
    expect(life).toMatch(/Expired\s*-->\s*Revoked/);
    expect(life).toMatch(/still revocable|NOT terminal|Expired is NOT terminal/i);
    expect(life).not.toMatch(/Revoked\s*-->\s*(Active|NeverUsed|Used|Expired)/);
    expect(life).toMatch(/Forbidden|one-way|Revoked → Active/i);
    expect(life).toMatch(/born-clean/i);

    // Migrations support one-way + born-clean claims
    expect(revMig).toMatch(/revoked_at|one-way|immutab/i);
    expect(insertMig).toMatch(/ingest_count|first_used_at|revoked_at/i);
  });

  it("grounds entitlement separation and stale accept:false contract", () => {
    const entitlement = readSrc(SRC.entitlement);
    const webhook = readSrc(SRC.webhook);
    const act = readArch("sensor-ingest-verification-activity.puml");
    const seq = readArch("bridge-token-mint-use-revoke-sequence.puml");

    expect(entitlement).toMatch(/liveSensors/);
    expect(entitlement).toMatch(/upgrade_required/);
    expect(webhook).toMatch(/requireLiveSensorEntitlement/);
    expect(webhook).toMatch(/accepted:\s*false|timestamp_stale/);
    expect(webhook).toMatch(/classifyIngestTimestampFreshness/);

    expect(act).toMatch(/upgrade_required/);
    expect(act).toMatch(/accepted:false/);
    expect(act).toMatch(/timestamp_stale|stale/i);
    expect(act).toMatch(/zero live writes/i);
    expect(act).toMatch(/user_id not ownership|body user_id ignored/i);
    expect(seq).toMatch(/body user_id ignored/i);
    expect(webhook).toMatch(/Caller-supplied `user_id` in the body is ignored|user_id from auth/i);
  });

  it("grounds sibling isolation against Pi / EcoWitt sources", () => {
    const pi = readSrc(SRC.pi);
    const ecowitt = readSrc(SRC.ecowitt);
    const ecowittReal = readSrc(SRC.ecowittReal);
    const siblings = readArch("ingest-auth-sibling-isolation.puml");

    expect(pi).toMatch(/x-bridge-signature|HMAC/i);
    expect(pi).not.toMatch(/allowJwt:\s*false/);
    expect(ecowitt).toMatch(/allowJwt:\s*false|vbt_/);
    expect(ecowittReal).toMatch(/validation-only|does not persist|ECOWITT_BRIDGE_TOKEN/i);

    expect(siblings).toMatch(/HMAC/i);
    expect(siblings).toMatch(/Do not mix Pi HMAC/i);
    expect(siblings).toMatch(/vbt_/);
    expect(siblings).toMatch(/validation-only|validate only|no sensor_readings write/i);
  });

  it("preserves verification order: auth before entitlement before tent before freshness before persistence", () => {
    const act = readArch("sensor-ingest-verification-activity.puml");
    const webhook = readSrc(SRC.webhook);
    const idx = (hay: string, re: RegExp) => {
      const m = hay.search(re);
      expect(m, String(re)).toBeGreaterThanOrEqual(0);
      return m;
    };
    // Diagram order
    const iAuth = idx(act, /1\.\s*Authenticate|authenticateBearer/);
    const iEnt = idx(act, /2\.\s*Entitlement|requireLiveSensorEntitlement/);
    const iParse = idx(act, /3\.\s*Parse|normalizeWebhookIngestPayload/);
    const iTent = idx(act, /4\.\s*Tent|tentScopeMatches/);
    const iFresh = idx(act, /5\.\s*Freshness|classifyIngestTimestampFreshness|30/);
    const iPersist = idx(act, /6\.\s*Persistence|upsert sensor_readings/);
    expect(iAuth).toBeLessThan(iEnt);
    expect(iEnt).toBeLessThan(iParse);
    expect(iParse).toBeLessThan(iTent);
    expect(iTent).toBeLessThan(iFresh);
    expect(iFresh).toBeLessThan(iPersist);

    // Source call order mirrors spine (match call sites, not imports)
    const sAuth = idx(webhook, /authenticateBearer\(/);
    const sEnt = idx(webhook, /requireLiveSensorEntitlement\(/);
    const sNorm = idx(webhook, /normalizeWebhookIngestPayload\(/);
    const sTent = idx(webhook, /tentScopeMatches\(/);
    const sFresh = idx(webhook, /classifyIngestTimestampFreshness\(/);
    const sUpsert = idx(webhook, /\.upsert\(/);
    expect(sAuth).toBeLessThan(sEnt);
    expect(sEnt).toBeLessThan(sNorm);
    expect(sNorm).toBeLessThan(sTent);
    expect(sTent).toBeLessThan(sFresh);
    expect(sFresh).toBeLessThan(sUpsert);
  });

  it("rejects affirmative ingest side-effect arrows (allows textual No … bans)", () => {
    const all = allDiagramText();
    for (const re of FORBIDDEN_SIDE_EFFECT_ARROWS) {
      expect(all, String(re)).not.toMatch(re);
    }
    expect(all).toMatch(/No AI Doctor/i);
    expect(all).toMatch(/Action Queue/i);
  });

  it("rejects secret-shaped content", () => {
    const all = allDiagramText();
    expect(all).not.toMatch(/vbt_[A-Za-z0-9_-]{20,}/);
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(all).not.toMatch(/service_role\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/i);
    expect(all).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(all).not.toMatch(/\b192\.168\.\d{1,3}\.\d{1,3}\b/);
    expect(all).toMatch(/<user JWT>|user JWT/i);
  });

  it("does not launder BLOCKED harness evidence as PASS", () => {
    const all = allDiagramText() + readFileSync(join(ARCH, "README.md"), "utf8");
    expect(all).toMatch(/BLOCKED/);
    expect(all).not.toMatch(/strict[^\n]{0,80}\bPASS\b(?![a-z])/i);
    expect(all).not.toMatch(/zero-skip[^\n]{0,80}\bPASS\b(?![a-z])/i);
    expect(all).not.toMatch(/BLOCKED[^\n]{0,40}\bas PASS\b/i);
  });
});
