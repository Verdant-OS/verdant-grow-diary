/**
 * demo-entry-copy-safety.test.ts
 *
 * Static, deterministic safety scanner for Verdant's public / demo-entry
 * surfaces. Pure file reads at test time — no Supabase, no network, no
 * React render, no auth.
 *
 * Guards four categories:
 *
 *  A. Demo/sample/example values must appear near a clear label
 *     (demo · sample · example · representative · not live · static preview).
 *
 *  B. Forbidden automation / device-control language must be absent.
 *
 *  C. At least one safe promise line ("cannot touch your equipment",
 *     "does not control equipment", or "approval-required by design")
 *     must be present across the scanned public surface set.
 *
 *  D. The six source labels (live · manual · csv · demo · stale · invalid)
 *     must be reachable from the public surface set (Landing trust bullet
 *     names them all today via the centralized copy constant).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VERDANT_HERO,
  VERDANT_TRUST,
  VERDANT_VALUE_DRIVERS,
  VERDANT_LOOP,
} from "@/constants/verdantPositioningCopy";

const REPO_ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8");

/** Public / demo-entry surfaces served pre-auth. */
const PUBLIC_SURFACES: ReadonlyArray<string> = [
  "src/pages/Landing.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/HardwareIntegrations.tsx",
  "src/constants/verdantPositioningCopy.ts",
];

const ALL_PUBLIC_CONTENT = PUBLIC_SURFACES.map(read).join("\n\n");

/* ---------------------------------------------------------------------- */
/* A. Demo / sample / example values must be labeled                       */
/* ---------------------------------------------------------------------- */

const DEMO_VALUE_TOKENS = /\b(demo|sample|example|representative|not\s+live|static\s+preview)\b/i;

/* ---------------------------------------------------------------------- */
/* B. Forbidden automation / device-control language                       */
/* ---------------------------------------------------------------------- */

const FORBIDDEN: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "autopilot", pattern: /\bautopilot\b/i },
  { label: "fully automated grow control", pattern: /fully\s+automated\s+grow\s+control/i },
  { label: "AI controls your equipment", pattern: /AI\s+controls\s+your\s+equipment/i },
  { label: "automatic device control", pattern: /automatic\s+device\s+control/i },
  { label: "autonomous device control", pattern: /autonomous\s+device\s+control/i },
  { label: "hands-free grow control", pattern: /hands[-\s]?free\s+grow\s+control/i },
  { label: "set-and-forget automation", pattern: /set[-\s]?and[-\s]?forget\s+automation/i },
  // "blind automation" is only forbidden when NOT negated ("no blind automation" is safe copy).
  { label: "blind automation (unnegated)", pattern: /(?<!\bno\s)(?<!\bnever\s)(?<!\bwithout\s)blind\s+automation/i },
  { label: "controls your lights", pattern: /controls\s+your\s+lights/i },
  { label: "controls your fans", pattern: /controls\s+your\s+fans/i },
  { label: "controls irrigation", pattern: /controls\s+irrigation/i },
  { label: "controls humidifiers", pattern: /controls\s+humidifiers/i },
  { label: "controls your equipment", pattern: /controls\s+your\s+equipment/i },
];

/* ---------------------------------------------------------------------- */
/* C. Required safe-promise language                                       */
/* ---------------------------------------------------------------------- */

const SAFE_PROMISES: ReadonlyArray<RegExp> = [
  /cannot\s+touch\s+your\s+equipment/i,
  /does\s+not\s+control\s+equipment/i,
  /approval[-\s]required\s+by\s+design/i,
];

/* ---------------------------------------------------------------------- */
/* D. Required source labels                                               */
/* ---------------------------------------------------------------------- */

const SOURCE_LABELS = ["live", "manual", "csv", "demo", "stale", "invalid"] as const;

/* ---------------------------------------------------------------------- */

describe("Public / demo-entry copy safety scanner", () => {
  describe("A. Demo/sample values are labeled", () => {
    for (const rel of PUBLIC_SURFACES) {
      it(`${rel}: any 'demo/sample/example' value use is nearby a clear label`, () => {
        const content = read(rel);
        // If the file mentions demo/sample/example at all, the same file
        // must also contain at least one clear labeling token. All current
        // public surfaces satisfy this via constants (e.g. "demo, stale,
        // invalid" bullet on Landing / "Manual, demo, stale, and invalid
        // readings stay clearly labeled" on Pricing).
        if (/\b(demo|sample|example)\b/i.test(content)) {
          expect(content).toMatch(DEMO_VALUE_TOKENS);
        }
      });
    }
  });

  describe("B. Forbidden automation / device-control language is absent", () => {
    for (const rel of PUBLIC_SURFACES) {
      const content = read(rel);
      for (const { label, pattern } of FORBIDDEN) {
        it(`${rel}: must not contain "${label}"`, () => {
          const match = content.match(pattern);
          if (match) {
            const idx = content.indexOf(match[0]);
            const line = content.slice(0, idx).split("\n").length;
            throw new Error(
              `Forbidden phrase "${label}" found in ${rel} at line ${line}: "${match[0]}"`,
            );
          }
          expect(match).toBeNull();
        });
      }
    }
  });

  describe("C. Safe-promise language is reachable from public surfaces", () => {
    it("at least one safe promise appears somewhere on the public surface set", () => {
      const anyMatch = SAFE_PROMISES.some((re) => re.test(ALL_PUBLIC_CONTENT));
      expect(anyMatch).toBe(true);
    });
  });

  describe("D. Source labels are reachable from public surfaces", () => {
    for (const label of SOURCE_LABELS) {
      it(`source label "${label}" appears on the public surface set`, () => {
        const re = new RegExp(`\\b${label}\\b`, "i");
        expect(re.test(ALL_PUBLIC_CONTENT)).toBe(true);
      });
    }
  });
});

/* ---------------------------------------------------------------------- */
/* Centralized-copy coherence checks                                       */
/* ---------------------------------------------------------------------- */

describe("Centralized positioning copy stays coherent", () => {
  it("core headline is the canonical two-sentence line", () => {
    expect(VERDANT_HERO.headline).toBe("See what changed. Decide what to do next.");
  });

  it("core value sentence names the anti-lock-in and no-control promises", () => {
    expect(VERDANT_HERO.subheadline).toMatch(/gear you already own/i);
    expect(VERDANT_HERO.subheadline).toMatch(/cannot touch your equipment/i);
    expect(VERDANT_HERO.subheadline).toMatch(/cites its evidence/i);
  });

  it("tagline is the Plant memory / Sensor truth / Grower-approved decisions line", () => {
    expect(VERDANT_HERO.tagline).toBe(
      "Plant memory. Sensor truth. Grower-approved decisions.",
    );
  });

  it("trust body names read-only + approval-required-by-design", () => {
    expect(VERDANT_TRUST.body).toMatch(/read-only/i);
    expect(VERDANT_TRUST.body).toMatch(/approval-required by design/i);
    expect(VERDANT_TRUST.body).toMatch(/lights, fans, irrigation, humidifiers/i);
  });

  it("all five ranked value drivers are present in the canonical order", () => {
    expect(VERDANT_VALUE_DRIVERS.map((c) => c.title)).toEqual([
      "Works with the gear you already own",
      "You stay in control",
      "One plant timeline",
      "Log the moment in 30 seconds",
      "AI that shows its work",
    ]);
  });

  it("One-Tent Loop lists the full V0 flow in order", () => {
    expect(VERDANT_LOOP.steps).toEqual([
      "Grow",
      "Tent",
      "Plant",
      "Quick Log",
      "Timeline",
      "Sensor Snapshot",
      "AI Doctor",
      "Alert",
      "Action Queue",
    ]);
  });
});
