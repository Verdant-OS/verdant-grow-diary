/**
 * demo-public-copy-safety-scanner.test.ts
 *
 * Load-bearing static safety scan (Requirement 9 of the /demo + demo-copy
 * sweep). Scans Verdant's public/demo surfaces — pre-auth pages and
 * partner-demo docs — for wording that would imply demo/sample data is
 * live, synced, confirmed, guaranteed, real-time, or production-real.
 *
 * Pure file read at test time. No Supabase, no network, no React render.
 *
 * If a future PR adds copy like "live demo data," "synced sample readings,"
 * "AI confirmed diagnosis," etc. to any public/demo surface, this test
 * MUST fail. Narrow contextual allowances are documented inline.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

/**
 * Public / demo surfaces. These render pre-auth or to unauthenticated
 * partner viewers, and must never imply demo data is live or authoritative.
 */
const PUBLIC_DEMO_FILES: ReadonlyArray<string> = [
  "src/pages/Landing.tsx",
  "src/pages/PartnerCsvPreviewLanding.tsx",
  "src/pages/HardwareIntegrations.tsx",
  "src/pages/CustomerModeGuide.tsx",
  "docs/csv-preview-partner-demo.md",
];

/**
 * Banned phrases that, on a public/demo surface, would imply demo/sample
 * data is live, synced, confirmed, guaranteed, real, or production-real.
 *
 * Regexes are intentionally narrow — they target the *unsafe phrase shape*,
 * not the underlying word. Bare uses of "live" (e.g. live integrations
 * page header) or "synced" (e.g. Pro grow-history backups) are not flagged
 * here because they don't describe demo/sample data.
 */
const BANNED_PHRASES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "live demo data", pattern: /\blive\s+demo\b/i },
  { label: "live sample data", pattern: /\blive\s+sample\b/i },
  { label: "synced sample data", pattern: /\bsynced\s+sample\b/i },
  { label: "synced demo data", pattern: /\bsynced\s+demo\b/i },
  { label: "real-time demo", pattern: /\breal[-\s]?time\s+demo\b/i },
  { label: "real-time sample", pattern: /\breal[-\s]?time\s+sample\b/i },
  { label: "confirmed diagnosis", pattern: /\bconfirmed\s+diagnosis\b/i },
  { label: "AI confirmed", pattern: /\bAI[- ]confirmed\b/i },
  { label: "diagnosis confirmed", pattern: /\bdiagnosis\s+confirmed\b/i },
  { label: "guaranteed outcome/result", pattern: /\bguaranteed\b/i },
  { label: "actual sensor (demo context)", pattern: /\bactual\s+sensor\b/i },
  { label: "verified sample/demo", pattern: /\bverified\s+(sample|demo)\b/i },
  { label: "production data", pattern: /\bproduction\s+(data|readings)\b/i },
  { label: "certain diagnosis", pattern: /\bcertain\s+diagnosis\b/i },
  { label: "connected sensor (demo context)", pattern: /\bconnected\s+sensors?\b\s+(in\s+)?(this\s+)?(demo|sample|preview)/i },
];

/**
 * Public/demo files MUST point users at the supported route, never at the
 * legacy /demo entry point as their primary CTA. Mentioning /demo only in
 * the context of "redirects to /welcome" is fine and not flagged here.
 */
const STALE_PRIMARY_DEMO_CTA = /\b(visit|open|go to|navigate to|try)\s+\/demo\b/i;

describe("public/demo copy safety scanner (Requirement 9)", () => {
  for (const rel of PUBLIC_DEMO_FILES) {
    describe(rel, () => {
      const abs = resolve(REPO_ROOT, rel);
      const content = readFileSync(abs, "utf8");

      for (const { label, pattern } of BANNED_PHRASES) {
        it(`must not contain banned phrase: ${label}`, () => {
          const match = content.match(pattern);
          if (match) {
            const idx = content.indexOf(match[0]);
            const line = content.slice(0, idx).split("\n").length;
            throw new Error(
              `Banned phrase "${label}" found in ${rel} at line ${line}: ` +
                `"${match[0]}". Demo/public surfaces must not imply demo ` +
                `data is live, synced, confirmed, guaranteed, or real.`,
            );
          }
          expect(match).toBeNull();
        });
      }

      it("must not advertise /demo as a primary CTA", () => {
        expect(content).not.toMatch(STALE_PRIMARY_DEMO_CTA);
      });
    });
  }
});

describe("intentional /demo redirect is preserved", () => {
  it("App.tsx redirects /demo → /welcome", () => {
    const app = readFileSync(resolve(REPO_ROOT, "src/App.tsx"), "utf8");
    expect(app).toMatch(
      /path="\/demo"\s+element=\{<Navigate\s+to="\/welcome"\s+replace\s*\/>\}/,
    );
  });
});
