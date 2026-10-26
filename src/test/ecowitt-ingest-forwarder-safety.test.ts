/**
 * Static safety scan for scripts/dev/ecowitt-ingest-forwarder.ts.
 *
 * @source-scan-justified: forbidden imports, call sites and log sinks are
 *   properties of the source text, not of any exported runtime value.
 *
 * The forwarder must NEVER:
 *   - import the supabase client / SDK
 *   - perform direct DB writes (.insert/.upsert/.update/.delete)
 *   - reference service_role
 *   - reference action_queue or device-control identifiers
 *   - post to the generic sensor-ingest-webhook (it is an ecowitt-ingest client only)
 *   - call fetch() on a path that is not behind the `--live` guard
 *   - log anything that has not passed through redactForLog
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_MQTT_TOPIC, DEFAULT_MQTT_URL } from "../../scripts/dev/ecowitt-ingest-forwarder";

const SCRIPT_PATH = resolve(__dirname, "../../scripts/dev/ecowitt-ingest-forwarder.ts");
const SRC = readFileSync(SCRIPT_PATH, "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("ecowitt-ingest-forwarder — static safety", () => {
  it("does not import the supabase SDK", () => {
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });

  it("never performs DB writes", () => {
    expect(CODE).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(CODE).not.toMatch(/\.from\(\s*["']sensor_readings/);
  });

  it("never references service_role", () => {
    expect(CODE).not.toMatch(/service[_-]?role/i);
  });

  it("does not reference action_queue or device-control identifiers", () => {
    expect(CODE).not.toMatch(/action_queue/i);
    expect(CODE).not.toMatch(/device_command|relay_on|valve_open|light_on/i);
  });

  it("is an ecowitt-ingest client only, never the generic webhook", () => {
    expect(CODE).not.toMatch(/sensor-ingest-webhook/);
    expect(CODE).toMatch(/\/ecowitt-ingest\\\/\?\$\//);
  });

  it("calls fetch only inside handleMessage, after the dry-run return", () => {
    const fetchCalls = CODE.match(/\bfetchImpl\s*\(/g) ?? [];
    expect(fetchCalls).toHaveLength(1);
    expect(CODE).not.toMatch(/\bfetch\s*\((?!\s*\))/);
    const body = CODE.slice(CODE.indexOf("export async function handleMessage"));
    expect(body.indexOf("if (!args.flags.live) return")).toBeGreaterThan(-1);
    expect(body.indexOf("if (!args.flags.live) return")).toBeLessThan(body.indexOf("fetchImpl("));
  });

  it("never follows a redirect with the credential-bearing POST", () => {
    // `manual` hands a 3xx back instead of following it; the loop then returns
    // before any retry (Codex P2 at efeae597).
    expect(CODE).toMatch(/redirect: "manual"/);
    expect(CODE).not.toMatch(/redirect: "follow"/);
    expect(CODE).toMatch(/redirect_refused_/);
  });

  it("claims the --once message synchronously, before the first await", () => {
    const body = CODE.slice(CODE.indexOf("export function createMessageHandler"));
    const claim = body.indexOf("claimed = true");
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(body.indexOf("await"));
  });

  it("pins the approved-origin, size-bound and timeout guards (Codex at 79ce2801)", () => {
    expect(CODE).toMatch(/APPROVED_INGEST_URLS\.includes\(/);
    expect(CODE).toMatch(/MAX_MESSAGE_BYTES/);
    expect(CODE).toMatch(/new AbortController\(\)/);
    expect(CODE).toMatch(/status >= 200 && status < 300/);
  });

  it("requires the vbt_ token shape and https before going live", () => {
    expect(CODE).toMatch(/\^vbt_/);
    expect(CODE).toMatch(/protocol !== "https:"/);
  });

  it("routes every console.log through the redacting logger", () => {
    const logs = CODE.match(/console\.log\(/g) ?? [];
    expect(logs).toHaveLength(1);
    expect(CODE).toMatch(
      /console\.log\(`\[ecowitt-forwarder\] \$\{event\}`, redactForLog\(fields\)\)/,
    );
  });

  it("cannot write files or bring back the report sink (Codex P2 at ed548103; CodeQL 280-282)", () => {
    expect(SRC).not.toMatch(/["'](?:node:)?fs(?:\/promises)?["']/);
    expect(CODE).not.toMatch(/\bBun\.(?:write|file)\b/);
    expect(CODE).not.toMatch(
      /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rename|renameSync|openSync)\s*\(/,
    );
    expect(CODE).not.toMatch(/write-report|writeReport|DEFAULT_REPORT_PATH/);
  });

  it("uses the documented default broker and topic", () => {
    // Resolved values, not source text (AGENTS.md; Codex P2 on #2335 at ac8be57b).
    expect(DEFAULT_MQTT_URL).toBe("mqtt://127.0.0.1:1883");
    expect(DEFAULT_MQTT_TOPIC).toBe("ecowitt/grow");
  });
});
