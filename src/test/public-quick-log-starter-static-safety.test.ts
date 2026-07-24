/**
 * Public Quick Log Starter — load-bearing static safety scanner.
 *
 * Reads the starter's page + lib + copy sources (fixed file list, no
 * fs walk) and enforces the surface's hard lines:
 *   - zero write/network capability (no supabase, no fetch, no RPC verbs),
 *   - no service-role / device-control / automation vocabulary,
 *   - honest local-draft copy (truth line pinned verbatim; affirmative
 *     synced/backed-up/account claims banned),
 *   - the closed public-phrase vocabulary from verdantSeoCopy,
 *   - no user-entered text in URL construction (links module allow-list),
 *   - the versioned draft key pinned.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "./utils/stripSourceComments";
import { VERDANT_FORBIDDEN_PUBLIC_PHRASES } from "@/constants/verdantSeoCopy";
import { PUBLIC_QUICK_LOG_STARTER_COPY } from "@/constants/publicQuickLogStarterCopy";
import { PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY } from "@/lib/publicQuickLogStarterRules";

const ROOT = resolve(__dirname, "../..");

const STARTER_FILES = [
  "src/pages/QuickLogStarter.tsx",
  "src/lib/publicQuickLogStarterRules.ts",
  "src/lib/publicQuickLogStarterDraftStore.ts",
  "src/lib/quickLogStarterLinks.ts",
  "src/constants/publicQuickLogStarterCopy.ts",
] as const;

// Comments legitimately DESCRIBE the bans ("no Supabase", "not synced"),
// so every scan below runs on comment-stripped source; string literals
// (rendered copy) survive the strip and stay fully scanned.
const sources = STARTER_FILES.map((rel) => ({
  rel,
  body: stripSourceComments(readFileSync(resolve(ROOT, rel), "utf8")),
}));

describe("starter surface: zero write / network capability", () => {
  const FORBIDDEN_EXECUTABLE = [
    /@\/integrations\/supabase/,
    /\bsupabase\b/i,
    /\.from\(/,
    /\.rpc\(/,
    /\.insert\(/,
    /\.upsert\(/,
    // Bare no-arg .delete() is the supabase query-builder shape; Set/Map
    // .delete(x) always takes an argument and stays allowed. .update( is
    // not scanned for the same reason — the supabase identifier ban above
    // already blocks every client this verb could hang off.
    /\.delete\(\s*\)/,
    /functions\.invoke/,
    /\bfetch\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /EventSource/,
    /@\/mock/,
    /useQuickLogV2Save/,
    /quicklog_save_manual/,
    /quicklog_save_event/,
  ];

  for (const { rel, body } of sources) {
    it(`${rel} has no write or network capability`, () => {
      for (const re of FORBIDDEN_EXECUTABLE) {
        expect(body, `${rel} must not match ${re}`).not.toMatch(re);
      }
    });
  }
});

describe("starter surface: no privileged / device / automation vocabulary", () => {
  const FORBIDDEN_TERMS = [
    /service_role/i,
    /SUPABASE_SERVICE_ROLE_KEY/,
    /execute_device/i,
    /setpoint_write/i,
    /irrigation_control/i,
    /light_control/i,
    /fan_control/i,
    /\bautopilot\b/i,
    /\bmqtt\b/i,
    /\bactuator\b/i,
  ];

  for (const { rel, body } of sources) {
    it(`${rel} stays clear of privileged terms`, () => {
      for (const re of FORBIDDEN_TERMS) {
        expect(body, `${rel} must not match ${re}`).not.toMatch(re);
      }
    });
  }
});

describe("honest local-draft copy", () => {
  it("pins the truth line verbatim", () => {
    expect(PUBLIC_QUICK_LOG_STARTER_COPY.truthLine).toBe(
      "This draft lives only in this browser — it is not synced to an account and clearing browser data will delete it.",
    );
  });

  it("page renders copy from the constants module (truth line not re-typed in JSX)", () => {
    const page = sources.find((s) => s.rel === "src/pages/QuickLogStarter.tsx")!.body;
    expect(page).toMatch(/COPY\.truthLine/);
    expect(page).not.toMatch(/lives only in this browser/);
  });

  const DISHONEST = [
    // Affirmative sync/backup/account claims. The lookbehind spares the
    // truth line's honest negation ("not synced to an account").
    /(?<!not )\bsynced\b/i,
    /\bbacked up\b/i,
    /saved to your (account|diary)/i,
    /\bwe'll keep (it|this) safe\b/i,
    /\bcloud backup\b/i,
    /\breal-?time\b/i,
    /\blive data\b/i,
    /\blive sensor\b/i,
  ];

  for (const { rel, body } of sources) {
    it(`${rel} makes no dishonest persistence claims`, () => {
      for (const re of DISHONEST) {
        expect(body, `${rel} must not match ${re}`).not.toMatch(re);
      }
    });
  }

  it("copy avoids every forbidden public phrase", () => {
    const copyBlob = JSON.stringify(PUBLIC_QUICK_LOG_STARTER_COPY).toLowerCase();
    for (const phrase of VERDANT_FORBIDDEN_PUBLIC_PHRASES) {
      expect(copyBlob, `copy must not contain "${phrase}"`).not.toContain(phrase.toLowerCase());
    }
  });
});

describe("draft key + URL discipline", () => {
  it("pins the versioned draft key", () => {
    expect(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY).toBe("verdant.quickLogStarter.draft.v1");
  });

  it("the page never touches localStorage directly (store module owns it)", () => {
    const page = sources.find((s) => s.rel === "src/pages/QuickLogStarter.tsx")!.body;
    expect(page).not.toMatch(/localStorage/);
  });

  it("the links module never references draft text fields (no PII in URLs)", () => {
    const links = sources.find((s) => s.rel === "src/lib/quickLogStarterLinks.ts")!.body;
    for (const re of [/\bnote\b/i, /nickname/i, /plantName/i, /\bemail\b/i, /draft\./]) {
      expect(links, `links module must not match ${re}`).not.toMatch(re);
    }
  });
});
