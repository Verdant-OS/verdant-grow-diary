/**
 * Retirement assertions for the Shelly H&T integration.
 *
 * The integration was removed; this test prevents accidental
 * reintroduction of its config blocks, edge function sources, hooks,
 * components, view-state rules, or `supabase.functions.invoke` calls.
 *
 * If Shelly H&T is ever brought back as a first-class integration,
 * this test should be deleted in the same PR that restores it.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Standardised scanner guardrail timeout + slow-test telemetry.
// Replaces the previous per-file vi.setConfig bump. No scanner pattern,
// allowlist, or assertion is changed.
import {
  installScannerGuardrail,
  getCachedTsFiles,
} from "./support/scannerGuardrailHarness";
installScannerGuardrail({ file: __filename });

const ROOT = resolve(__dirname, "../..");

// Optimisation: reuse one cached recursive walk of `src/` across the two
// scanner `it` blocks below instead of walking the filesystem twice.
// Pure read; identical to the previous walkSource() result.
const walkSource = (dir: string): string[] => getCachedTsFiles(dir);

describe("Shelly H&T integration is fully retired", () => {
  const config = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");

  it("supabase/config.toml contains no [functions.shelly-ht-*] blocks", () => {
    expect(config).not.toMatch(/\[functions\.shelly-ht-/i);
  });

  it("supabase/functions/shelly-ht-* directories do not exist", () => {
    expect(existsSync(resolve(ROOT, "supabase/functions/shelly-ht-status"))).toBe(false);
    expect(existsSync(resolve(ROOT, "supabase/functions/shelly-ht-webhook"))).toBe(false);
  });

  it.each([
    "src/components/ShellyHtSetupCard.tsx",
    "src/hooks/useShellyHtSetupStatus.ts",
    "src/lib/shellyHtSetupRules.ts",
    "src/lib/shellyHtSetupCardViewStateRules.ts",
    "src/lib/shellyHtWebhookRules.ts",
  ])("retired client file %s does not exist", (rel) => {
    expect(existsSync(resolve(ROOT, rel))).toBe(false);
  });

  describe("no active source file invokes a Shelly H&T edge function or imports a retired module", () => {
    const srcFiles = walkSource(resolve(ROOT, "src"));

    it("no `supabase.functions.invoke(\"shelly-ht-*\"` calls remain", () => {
      const hits: string[] = [];
      for (const f of srcFiles) {
        const body = readFileSync(f, "utf8");
        if (/functions\.invoke\(\s*["']shelly-ht-/i.test(body)) hits.push(f);
      }
      expect(hits).toEqual([]);
    });

    it("no imports from retired Shelly H&T modules remain", () => {
      const retired = [
        "@/components/ShellyHtSetupCard",
        "@/hooks/useShellyHtSetupStatus",
        "@/lib/shellyHtSetupRules",
        "@/lib/shellyHtSetupCardViewStateRules",
        "@/lib/shellyHtWebhookRules",
      ];
      const hits: { file: string; module: string }[] = [];
      for (const f of srcFiles) {
        const body = readFileSync(f, "utf8");
        for (const mod of retired) {
          const re = new RegExp(
            `from\\s+["']${mod.replace(/[.*+?^${}()|[\\\]\\\\]/g, "\\$&")}["']`,
          );
          if (re.test(body)) hits.push({ file: f, module: mod });
        }
      }
      expect(hits).toEqual([]);
    });
  });
});
