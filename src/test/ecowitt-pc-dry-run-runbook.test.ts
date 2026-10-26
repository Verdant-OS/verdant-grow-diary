/**
 * Operator contract for docs/integrations/ecowitt-pc-dry-run-runbook.md.
 *
 * Pins the Windows HTTP-bridge dry-run sequence and fail-closed expectations
 * introduced when the runbook was corrected to start the MQTT consumer before
 * the sanity POST and to install mqtt without mutating tracked lockfiles.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RUNBOOK = readFileSync(
  resolve(__dirname, "../../docs/integrations/ecowitt-pc-dry-run-runbook.md"),
  "utf8",
);

describe("docs/integrations/ecowitt-pc-dry-run-runbook.md", () => {
  it("documents installing mqtt with --no-save and warns against plain bun add mqtt", () => {
    expect(RUNBOOK).toMatch(
      /Before you start — install the MQTT client without touching tracked files/,
    );
    expect(RUNBOOK).toContain("bun add --no-save mqtt");
    expect(RUNBOOK).toMatch(/Do not run plain `bun add mqtt`/);
    expect(RUNBOOK).toMatch(/`git status` should show nothing new/);
  });

  it("installs and starts Mosquitto only when 1883 is free, bound to localhost", () => {
    const broker = RUNBOOK.indexOf("### Before you start — install and start the Mosquitto broker");
    const client = RUNBOOK.indexOf(
      "### Before you start — install the MQTT client without touching tracked files",
    );
    expect(broker).toBeGreaterThan(-1);
    expect(client).toBeGreaterThan(broker);
    const section = RUNBOOK.slice(broker, client);
    expect(section).toMatch(/Get-Service mosquitto/);
    expect(section).toMatch(/netstat -ano \| findstr :1883/);
    expect(section).toMatch(/systemctl is-active mosquitto/);
    expect(section).toMatch(/ss -ltn 'sport = :1883'/);
    expect(section).toMatch(/lsof -iTCP:1883 -sTCP:LISTEN/);
    expect(section).toMatch(/listener 1883 127\.0\.0\.1/);
    expect(section).toMatch(/\$env:TEMP\\verdant-mosquitto\.conf/);
    expect(section).toMatch(/mosquitto\.exe" -v -c "\$env:TEMP\\verdant-mosquitto\.conf"/);
    expect(section).toMatch(/mosquitto -v -c \/tmp\/verdant-mosquitto-local\.conf/);
    const winget = section.indexOf("winget install EclipseFoundation.Mosquitto");
    const windowsManual = section.indexOf("$env:TEMP\\verdant-mosquitto.conf");
    expect(winget).toBeGreaterThan(-1);
    expect(windowsManual).toBeGreaterThan(winget);
    expect(section.slice(winget, windowsManual)).toMatch(/```/);
    expect(section.slice(0, windowsManual)).not.toMatch(/mosquitto\.exe" -v -c/);
    expect(section.indexOf("sudo apt-get update")).toBeLessThan(
      section.indexOf("brew install mosquitto"),
    );
    expect(section.indexOf("brew install mosquitto")).toBeLessThan(
      section.indexOf("mosquitto -v -c /tmp/verdant-mosquitto-local.conf"),
    );
  });

  it("starts the dry-run consumer (Terminal 3) before the sanity POST (Terminal 4)", () => {
    const t3 = RUNBOOK.indexOf("### Terminal 3 — Verdant dry-run consumer");
    const t4 = RUNBOOK.indexOf("### Terminal 4 — local sanity POST");
    expect(t3).toBeGreaterThan(-1);
    expect(t4).toBeGreaterThan(t3);
    expect(RUNBOOK.slice(t3, t4)).toMatch(/Start this \*\*before\*\* the sanity POST/);
    expect(RUNBOOK.slice(t3, t4)).toMatch(/\$env:UPSTREAM_MODE="ecowitt_raw"/);
    expect(RUNBOOK.slice(t3, t4)).toMatch(/export UPSTREAM_MODE=ecowitt_raw/);
    expect(RUNBOOK.slice(t3, t4)).toContain(
      "bun run dev:ecowitt-mqtt:dry-run -- --once --write-report",
    );
    expect(RUNBOOK.slice(t3, t4)).toMatch(/subscribed ecowitt\/grow/);
  });

  it("documents fail-closed report shape for hand-made vs real gateway payloads", () => {
    expect(RUNBOOK).toMatch(/payload_kind: "unknown"/);
    expect(RUNBOOK).toMatch(/missing_captured_at/);
    expect(RUNBOOK).toMatch(/payload_kind: "real_ecowitt_gateway"/);
    expect(RUNBOOK).toMatch(/fail-closed result, not a healthy reading/);
  });

  it("keeps live ingest gated after dry-run review", () => {
    expect(RUNBOOK).toMatch(/Live ingest remains gated/);
    expect(RUNBOOK).toMatch(/only after the dry-run report is[\s\S]*reviewed/);
    expect(RUNBOOK).toMatch(/NOT[\s\S]{0,80}require `VERDANT_BRIDGE_TOKEN`/);
  });

  it("stops a Debian mosquitto service only when this dry run installed it", () => {
    expect(RUNBOOK).toMatch(/only if you installed Mosquitto for this/);
    expect(RUNBOOK).toMatch(/sudo systemctl disable --now mosquitto/);
  });
});
