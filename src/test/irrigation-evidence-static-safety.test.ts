/**
 * irrigation-evidence-static-safety
 *
 * Gate I12: the isolated irrigation modules add zero device-control, alert-write,
 * Action-Queue-write, AI-call, client service-role, or fake-live surface. Scans
 * every irrigation source file (comments/strings included — a hard fail on any
 * occurrence).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function collect(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, name.name);
    if (name.isDirectory()) out.push(...collect(full));
    else if (/\.(ts|tsx)$/.test(name.name)) out.push(full);
  }
  return out;
}

const FILES = [
  ...collect(resolve(process.cwd(), "src/components/irrigation")),
  ...collect(resolve(process.cwd(), "src/lib/irrigation")),
  ...collect(resolve(process.cwd(), "src/hooks/irrigation")),
];

const BANNED: ReadonlyArray<[string, RegExp]> = [
  ["device-control", /\b(actuator|relay|fan_on|light_on_cmd|pump|dosing|dose|valve|switch_on|switch_off|device_control|mqtt_publish|home_assistant|pi_bridge|turn\s+(on|off)|autopilot|automation)\b/i],
  ["alert/action-queue write", /\.from\(\s*["'`](alerts|action_queue|ai_doctor_sessions)["'`]\s*\)/i],
  ["ai call", /\b(ai_doctor|aiDoctor|openai|anthropic|functions\.invoke)\b/i],
  ["client service-role / secret", /\b(SUPABASE_SERVICE_ROLE_KEY|service_role|BRIDGE_TOKEN|VITE_SUPABASE_SERVICE)\b/i],
  ["fake-live", /\blive\s+(reading|data)\b|\bconnected\s+sensor\b|\bsynced\b/i],
];

describe("irrigation evidence static safety", () => {
  it("scans at least the shipped irrigation files", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  for (const file of FILES) {
    const rel = file.split(/[\\/]src[\\/]/).pop() ?? file;
    it(`src/${rel} has no forbidden surface`, () => {
      const src = readFileSync(file, "utf8");
      for (const [label, re] of BANNED) {
        expect(re.test(src), `src/${rel} must not contain ${label}`).toBe(false);
      }
    });
  }
});
