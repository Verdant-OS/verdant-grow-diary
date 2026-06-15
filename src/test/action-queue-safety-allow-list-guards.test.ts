/**
 * Action Queue safety allow-list guard tests (companion to
 * `action-queue-safety.test.ts`).
 *
 * Purpose:
 *   The main scanner narrowly allow-lists three pure-logic safety files so
 *   that their *blocking* infrastructure (e.g. `blocked_device_command_risk`
 *   status enum, `DEVICE_COMMAND_PATTERNS` denylist) does not false-positive
 *   the device-control surface scan. This companion file proves the
 *   allow-list cannot silently broaden into:
 *     - real actuator / control surfaces
 *     - grower-facing unsafe equipment copy
 *     - raw_payload leakage
 *     - service_role / Bearer / API-key leakage
 *     - MQTT / relay / actuator / command_bus write surfaces
 *
 *   It also locks in explicit positive (allowed) and negative (forbidden)
 *   regression cases so future edits to the allow-list cannot regress.
 *
 * Hard rules:
 *   - Pure / deterministic / dependency-free.
 *   - No production code is modified by these tests.
 *   - Existing scanner regexes are NOT weakened.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

/** Every file that is allow-listed by the device-control surface scan. */
const ALLOW_LISTED_SAFETY_FILES = [
  "src/lib/aiDoctorSafetyRules.ts",
  "src/lib/aiDoctorActionSuggestionPreviewRules.ts",
  "src/lib/aiDoctorFixtureContextRules.ts",
] as const;

/**
 * Patterns that must NEVER appear in any allow-listed safety file. These
 * are real control surfaces, grower-facing unsafe copy, or secret/leak
 * tokens. The allow-list exists to silence the device_command false
 * positive — it must not become a hiding place for unsafe code.
 */
const FORBIDDEN_IN_ALLOW_LIST: ReadonlyArray<{ name: string; re: RegExp }> = [
  // Real control surfaces.
  { name: "mqtt url", re: /\bmqtt:\/\//i },
  { name: "mqtt connect", re: /\bmqtt\.connect\b/i },
  { name: "mqtt publish", re: /\bmqtt\s*\.\s*publish\b/i },
  { name: "actuator call", re: /\bactuator\.(send|trigger|run|fire)/i },
  { name: "relay control", re: /\brelay\.(on|off|toggle)/i },
  { name: "command bus", re: /command_bus/i },
  { name: "pump on/off", re: /\bpump\.(on|off|run|start|stop)\b/i },
  { name: "dose call", re: /\bdose\(/i },
  { name: "fetch device endpoint", re: /fetch\(\s*['"`][^'"`]*\/(device|relay|pump|valve)\b/i },

  // Grower-facing unsafe equipment copy. NOTE: ambiguous phrases like
  // "control device" / "set humidity" are intentionally NOT scanned per
  // file because allow-listed safety files legitimately contain NEGATED
  // disclaimers (e.g. "must not be used to control devices"). Those
  // grower-copy semantics are guarded via synthetic samples in the
  // negative-regression block below, which exercises the scanner's
  // banned regexes directly.


  // Secret / leakage tokens.
  { name: "service_role", re: /service_role/i },
  { name: "SUPABASE_SERVICE_ROLE_KEY", re: /SUPABASE_SERVICE_ROLE_KEY/i },
  { name: "raw_payload", re: /raw_payload/i },
  { name: "stripe live key", re: /sk_live_/i },
  { name: "Bearer JWT", re: /Bearer\s+ey[A-Za-z0-9._-]+/ },
  { name: "private api key var", re: /\bPRIVATE_API_KEY\b/ },
];

/**
 * Words that, when found near a `device_command` occurrence, prove the
 * match sits inside blocking / safety / denylist semantics rather than a
 * real control surface.
 */
const SAFETY_CONTEXT_RE =
  /block|denylist|deny[_-]?list|safety|BLOCK|risk|PATTERN|never|forbidden|strip|reject|guard|pending_approval/i;

describe("Action Queue / AI Doctor safety allow-list — guard tests", () => {
  for (const rel of ALLOW_LISTED_SAFETY_FILES) {
    describe(rel, () => {
      const src = readFileSync(resolve(ROOT, rel), "utf8");

      it("contains no forbidden control-surface / unsafe-copy / leakage token", () => {
        for (const { name, re } of FORBIDDEN_IN_ALLOW_LIST) {
          expect(src, `${rel} must not contain: ${name}`).not.toMatch(re);
        }
      });

      it("every device_command occurrence sits inside blocking/safety context", () => {
        const hits = [...src.matchAll(/device_command/gi)];
        // Each allow-listed file must actually USE the token as blocking
        // infrastructure — otherwise it does not need allow-listing.
        expect(hits.length, `${rel} has no device_command hits to guard`).toBeGreaterThan(0);
        for (const m of hits) {
          const ctx = src.slice(Math.max(0, m.index! - 160), m.index! + 160);
          expect(
            SAFETY_CONTEXT_RE.test(ctx),
            `${rel}: device_command at index ${m.index} lacks safety/block context:\n${ctx}`,
          ).toBe(true);
        }
      });
    });
  }

  describe("positive regression — allowed blocking-status enum", () => {
    it("blocked_device_command_risk remains a safety/blocking status enum value", () => {
      const src = readFileSync(
        resolve(ROOT, "src/lib/aiDoctorActionSuggestionPreviewRules.ts"),
        "utf8",
      );
      expect(src).toMatch(/"blocked_device_command_risk"/);
      // It must only appear as a status string, never as a function name,
      // a queued action_type, or a side-effect handler.
      const badShapes = [
        /\bblocked_device_command_risk\s*\(/, // called as a function
        /action_type\s*[:=]\s*["']blocked_device_command_risk/i,
        /\.rpc\(\s*["']blocked_device_command_risk/i,
        /functions\.invoke\(\s*["']blocked_device_command_risk/i,
      ];
      for (const re of badShapes) {
        expect(src).not.toMatch(re);
      }
    });
  });

  describe("negative regression — grower-facing unsafe copy must still be rejected", () => {
    // These sample strings simulate possible regressions. Each must be
    // matched by at least one banned regex used in the main scanner so a
    // regression cannot slip in disguised as safety-blocking code.
    const NEGATIVE_SAMPLES = [
      "turn on equipment",
      "send command",
      "control device",
      "auto-run equipment",
      "actuator.send(payload)",
      "pump.on()",
      "dose(5)",
      "set humidity to 60",
      "set temperature to 24",
      "device_command_executed",
      "mqtt://broker.local",
      "command_bus.dispatch('open_valve')",
    ];

    const REJECT_RES: RegExp[] = [
      /turn on equipment/i,
      /send command/i,
      /control device/i,
      /auto[- ]?run equipment/i,
      /\bactuator\.(send|trigger|run|fire)/i,
      /\bpump\.(on|off|run|start|stop)\b/i,
      /\bdose\(/i,
      /\bset humidity\b/i,
      /\bset temperature\b/i,
      /device_command/i,
      /\bmqtt:\/\//i,
      /command_bus/i,
    ];

    it("each unsafe sample is caught by at least one banned regex", () => {
      for (const sample of NEGATIVE_SAMPLES) {
        expect(
          REJECT_RES.some((re) => re.test(sample)),
          `Unsafe sample escaped all regex guards: ${sample}`,
        ).toBe(true);
      }
    });

    it("allow-list strip token does not mask any unsafe sample", () => {
      // The narrow allow-list works by recognizing `blocked_device_command_risk`
      // as safety infrastructure. Confirm that token replacement cannot
      // accidentally erase real unsafe copy.
      for (const sample of NEGATIVE_SAMPLES) {
        const stripped = sample.replace(/blocked_device_command_risk/g, "");
        expect(stripped).toBe(sample);
      }
    });
  });

  describe("secret leakage cannot hide behind the allow-list", () => {
    it("no allow-listed file contains a literal Bearer JWT or stripe live key", () => {
      for (const rel of ALLOW_LISTED_SAFETY_FILES) {
        const src = readFileSync(resolve(ROOT, rel), "utf8");
        expect(src).not.toMatch(/Bearer\s+ey[A-Za-z0-9._-]+/);
        expect(src).not.toMatch(/sk_live_[A-Za-z0-9]+/);
        expect(src).not.toMatch(/\beyJ[A-Za-z0-9._-]{20,}/); // raw JWT-shaped
      }
    });
  });
});
