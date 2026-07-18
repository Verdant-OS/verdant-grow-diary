/**
 * Funnel event wiring — static source contracts.
 *
 * Pins each of the eight growth-calendar events to its one canonical
 * emission seam, and fences the module against privacy regressions:
 *
 *   signup                  → Auth.tsx (after supabase.auth.signUp succeeds)
 *   tent_created            → CreateTentDialog.tsx (after insert succeeds)
 *   plant_created           → CreatePlantDialog.tsx (after insert succeeds)
 *   quick_log_saved         → shared privacy-safe wrapper from every mounted
 *                             Quick Log success seam
 *   csv_import_completed    → EnvironmentCsvImportLauncher.tsx (success block)
 *   paywall_viewed          → Pricing.tsx + Upgrade.tsx + AI Doctor limit (mount effects)
 *   checkout_started        → usePaddleCheckout.ts (authenticated openCheckout)
 *   subscription_activated  → CheckoutSuccess.tsx (server-confirmed flip)
 *
 * Pure text assertions — no DB, no rendering.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { FUNNEL_PARAM_KEYS } from "@/lib/funnelAnalytics";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const MODULE = read("src/lib/funnelAnalytics.ts");
const QUICK_LOG_MODULE = read("src/lib/quickLogSuccessTelemetry.ts");
const EVENT_MAP = read("docs/v0-loop-event-map.md");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : listSourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const QUICK_LOG_V2_SAVE_CALLERS = [
  {
    file: "src/components/QuickLog.tsx",
    telemetryIntent: /saveViaRpc\(built\.payload,\s*\{\s*telemetryIntent:\s*eventType\s*\}\)/,
  },
  {
    file: "src/components/QuickLogV2Sheet.tsx",
    telemetryIntent: /save\(built\.payload,\s*\{\s*telemetryIntent:\s*form\.action\s*\}\)/,
  },
  { file: "src/components/AiDoctorCheckInPreviewPanel.tsx", telemetryIntent: null },
  { file: "src/pages/EcowittIngestAudit.tsx", telemetryIntent: null },
] as const;

const SEAMS: Array<{ event: string; file: string; extra?: RegExp[] }> = [
  {
    event: "signup",
    file: "src/pages/Auth.tsx",
    extra: [/trackFunnelEvent\("signup",\s*\{\s*method:\s*"email"\s*\}\)/],
  },
  { event: "tent_created", file: "src/components/CreateTentDialog.tsx" },
  { event: "plant_created", file: "src/components/CreatePlantDialog.tsx" },
  {
    event: "csv_import_completed",
    file: "src/components/EnvironmentCsvImportLauncher.tsx",
    extra: [/rows:\s*res\.insertedCount/],
  },
  {
    event: "checkout_started",
    file: "src/hooks/usePaddleCheckout.ts",
    extra: [/plan:\s*options\.priceId/],
  },
  {
    event: "subscription_activated",
    file: "src/pages/CheckoutSuccess.tsx",
    extra: [/plan:\s*entitlement\.effectivePlanId/],
  },
];

const QUICK_LOG_SUCCESS_SEAMS: Array<{
  file: string;
  calls: number;
  extra: RegExp;
}> = [
  {
    file: "src/hooks/useQuickLogV2Save.ts",
    calls: 1,
    extra: /trackQuickLogSuccess\(options\.telemetryIntent,\s*\{\s*reused:/,
  },
  {
    file: "src/hooks/useQuickLogActivitySave.ts",
    calls: 2,
    extra: /trackQuickLogSuccess\(input\.activityId,\s*\{\s*reused:/,
  },
  {
    file: "src/components/QuickLogV2Sheet.tsx",
    calls: 1,
    extra: /trackQuickLogSuccess\("feed"\)/,
  },
  {
    file: "src/components/PlantQuickLog.tsx",
    calls: 1,
    extra: /trackQuickLogSuccess\("plant_quick_log"\)/,
  },
];

describe("each funnel event fires from its canonical seam", () => {
  for (const seam of SEAMS) {
    it(`${seam.event} → ${seam.file}`, () => {
      const src = read(seam.file);
      expect(src).toMatch(new RegExp(`trackFunnelEvent\\(\\s*"${seam.event}"`));
      expect(src).toMatch(/from\s+["']@\/lib\/funnelAnalytics["']/);
      for (const rx of seam.extra ?? []) expect(src).toMatch(rx);
    });
  }

  it("paywall_viewed fires from each paywall surface with a privacy-safe surface param", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const upgrade = read("src/pages/Upgrade.tsx");
    const aiDoctor = read("src/components/PlantDetailAiDoctorLiveReview.tsx");
    expect(pricing).toMatch(
      /trackFunnelEvent\("paywall_viewed",\s*\{\s*surface:\s*"pricing"\s*\}\)/,
    );
    expect(upgrade).toMatch(
      /trackFunnelEvent\("paywall_viewed",\s*\{\s*surface:\s*"upgrade"\s*\}\)/,
    );
    expect(aiDoctor).toMatch(
      /trackFunnelEvent\("paywall_viewed",\s*\{\s*surface:\s*"ai_doctor_limit"\s*\}\)/,
    );
  });

  it("quick_log_saved routes through the shared wrapper at every mounted success seam", () => {
    expect(QUICK_LOG_MODULE).toMatch(
      /trackFunnelEvent\("quick_log_saved",\s*\{\s*event_type:\s*eventType\s*\}\)/,
    );
    for (const seam of QUICK_LOG_SUCCESS_SEAMS) {
      const src = read(seam.file);
      expect(src).toMatch(/from\s+["']@\/lib\/quickLogSuccessTelemetry["']/);
      expect(src).toMatch(seam.extra);
      expect(src.match(/trackQuickLogSuccess\(/g) ?? []).toHaveLength(seam.calls);
      expect(src).not.toMatch(/trackFunnelEvent\(\s*["']quick_log_saved["']/);
    }
  });

  it("inventories every production useQuickLogV2Save caller and requires explicit opt-in", () => {
    const actualCallers = listSourceFiles(resolve(ROOT, "src"))
      .map((file) => ({ absolute: file, relative: relative(ROOT, file).replace(/\\/g, "/") }))
      .filter((file) => file.relative !== "src/hooks/useQuickLogV2Save.ts")
      .filter((file) => /\buseQuickLogV2Save\s*\(/.test(readFileSync(file.absolute, "utf8")))
      .map((file) => file.relative)
      .sort();
    const expectedCallers = QUICK_LOG_V2_SAVE_CALLERS.map((caller) => caller.file).sort();
    expect(actualCallers).toEqual(expectedCallers);

    for (const caller of QUICK_LOG_V2_SAVE_CALLERS) {
      const src = read(caller.file);
      if (caller.telemetryIntent) {
        expect(src).toMatch(caller.telemetryIntent);
      } else {
        expect(src).not.toMatch(/telemetryIntent|trackQuickLogSuccess/);
      }
    }
  });
});

describe("ordering and safety constraints at the seams", () => {
  it("shared manual RPC telemetry defaults off and fires only after explicit confirmed success", () => {
    const src = read("src/hooks/useQuickLogV2Save.ts");
    const okBranch = src.indexOf("if (!r.ok)");
    const optIn = src.indexOf("if (options.telemetryIntent !== undefined)");
    const track = src.indexOf("trackQuickLogSuccess(options.telemetryIntent");
    const okReturn = src.indexOf("ok: true");
    expect(okBranch).toBeGreaterThan(-1);
    expect(optIn).toBeGreaterThan(okBranch);
    expect(track).toBeGreaterThan(optIn);
    expect(okReturn).toBeGreaterThan(track);
    expect(src).toMatch(/reused:\s*r\.reused === true/);
    expect(src).not.toMatch(/trackQuickLogSuccess\(payload\.p_action/);
  });

  it("legacy Quick Log tracks the grower's validated semantic UI selection", () => {
    const src = read("src/components/QuickLog.tsx");
    const supportedGate = src.indexOf("if (!isSupportedLegacyEventType(eventType))");
    const save = src.indexOf("saveViaRpc(built.payload, { telemetryIntent: eventType })");
    expect(supportedGate).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(supportedGate);
    expect(src).not.toMatch(/telemetryIntent:\s*built\.payload\.p_action/);
  });

  it("structured feed and Plant Quick Log emit only after their write rejection gates", () => {
    const sheet = read("src/components/QuickLogV2Sheet.tsx");
    expect(sheet.indexOf('trackQuickLogSuccess("feed")')).toBeGreaterThan(
      sheet.indexOf("if (result.ok !== true)"),
    );

    const plant = read("src/components/PlantQuickLog.tsx");
    expect(plant.indexOf('trackQuickLogSuccess("plant_quick_log")')).toBeGreaterThan(
      plant.indexOf("if (insErr)"),
    );
  });

  it("subscription_activated is gated on the server-confirmed flip and deduped", () => {
    const src = read("src/pages/CheckoutSuccess.tsx");
    expect(src).toMatch(/if \(!confirmed \|\| activationTrackedRef\.current\) return;/);
    expect(src).toMatch(/activationTrackedRef\.current = true;/);
  });

  it("checkout_started fires only after the signed-in gate", () => {
    const src = read("src/hooks/usePaddleCheckout.ts");
    const userGate = src.indexOf("if (!user)");
    const track = src.indexOf('trackFunnelEvent("checkout_started"');
    expect(userGate).toBeGreaterThan(-1);
    expect(track).toBeGreaterThan(userGate);
  });
});

describe("funnelAnalytics module — privacy fences", () => {
  it("never allowlists grower-content param keys", () => {
    const keys = [...FUNNEL_PARAM_KEYS] as string[];
    for (const banned of ["note", "nickname", "email", "strain", "photo", "name"]) {
      expect(keys, `param allowlist must not include "${banned}"`).not.toContain(banned);
    }
  });

  it("documents the limited GA4 activation proxy separately from future authority", () => {
    expect(EVENT_MAP).toMatch(
      /at least 3 confirmed quick_log_saved events in a trailing 7-day window/,
    );
    expect(EVENT_MAP).toMatch(/calculated in GA4/);
    expect(EVENT_MAP).toMatch(/no\s+historical backfill/);
    expect(EVENT_MAP).toMatch(/ad blockers/);
    expect(EVENT_MAP).toMatch(/not authoritative cross-device, server-side, or signup-cohort/);
    expect(EVENT_MAP).toMatch(/future authoritative operator\/cohort aggregate/);
    expect(EVENT_MAP).toMatch(/not implemented or claimed/);
  });

  it("has no network client, storage writes, or identifiers", () => {
    expect(MODULE).not.toMatch(/supabase|service_role|fetch\(|localStorage/);
    expect(MODULE).not.toMatch(/user_id|plant_id|grow_id|tent_id/);
  });

  it("guards gtag behind a typeof check (ad blockers / tests never throw)", () => {
    expect(MODULE).toMatch(/typeof g === "function"/);
  });

  it("is the only funnel gtag emitter — no seam calls gtag directly", () => {
    const seamFiles = [
      ...SEAMS.map((seam) => seam.file),
      ...QUICK_LOG_SUCCESS_SEAMS.map((seam) => seam.file),
    ];
    for (const file of seamFiles) {
      const src = read(file);
      expect(
        /gtag\(\s*["']event["']/.test(src),
        `${file} must route through a privacy-safe wrapper, not raw gtag`,
      ).toBe(false);
    }
  });

  it("the Quick Log wrapper sends only event_type and never raw content or identifiers", () => {
    expect(QUICK_LOG_MODULE).toMatch(
      /trackFunnelEvent\("quick_log_saved",\s*\{\s*event_type:\s*eventType\s*\}\)/,
    );
    expect(QUICK_LOG_MODULE).not.toMatch(/gtag\s*\(/);
    expect(QUICK_LOG_MODULE).not.toMatch(
      /user_id|plant_id|grow_id|tent_id|photo_url|raw_payload|sensor_value|strain_name/,
    );
    expect(QUICK_LOG_MODULE).not.toMatch(
      /localStorage|sessionStorage|indexedDB|supabase|fetch\s*\(/,
    );
  });
});
