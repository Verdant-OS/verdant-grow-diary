/**
 * Static + behavioral safety guards for the HyperLog handoff polish slice.
 *
 *  - hyperLogDraftRules / GlobalFastAddButton / HyperLogModal must not
 *    import Supabase / write helpers / AI / Action Queue.
 *  - HyperLogModal still labels demo data clearly.
 *  - HyperLogModal contains the Environment Check "not a live sensor reading" copy.
 *  - QuickLog draft preview never renders the word "live" for HyperLog data.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const RULES = strip(read("src/lib/hyperLogDraftRules.ts"));
const VM = strip(read("src/lib/quickLogDraftPreviewViewModel.ts"));
const MODAL = read("src/components/HyperLogModal.tsx");
const MODAL_S = strip(MODAL);
const FAST_ADD = strip(read("src/components/GlobalFastAddButton.tsx"));

const FORBIDDEN = [
  "@/integrations/supabase",
  "supabase-js",
  ".rpc(",
  ".from(\"diary_entries\"",
  ".from('diary_entries'",
  ".from(\"sensor_readings\"",
  "ai-doctor",
  "ActionQueue",
  "action-queue",
  "alerts/",
  "deviceControl",
  "device-control",
];

describe("hyperlog handoff polish — static safety", () => {
  for (const [name, src] of Object.entries({
    RULES,
    VM,
    MODAL: MODAL_S,
    FAST_ADD,
  })) {
    it(`${name} has no forbidden imports or write helpers`, () => {
      for (const needle of FORBIDDEN) {
        expect(src, `${name} contains ${needle}`).not.toContain(needle);
      }
    });
  }

  it("HyperLogModal still labels demo data (DEMO SNAPSHOT, DEMO ONLY)", () => {
    expect(MODAL).toContain("DEMO SNAPSHOT");
    expect(MODAL).toContain("DEMO ONLY");
    expect(MODAL).not.toMatch(/\bLIVE\s+SNAPSHOT\b/);
  });

  it("HyperLogModal Environment Check carries the not-live copy", () => {
    expect(MODAL).toContain(
      "Environment Check is a Quick Log note, not a live sensor reading.",
    );
  });

  it("quickLogDraftPreviewViewModel exports never-live copy constants", () => {
    expect(VM).toContain("QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY");
    expect(VM).toContain("QUICK_LOG_DRAFT_DEMO_SNAPSHOT_COPY");
    // Must never positively assert HyperLog data IS live telemetry.
    expect(VM).not.toMatch(/\bis live\b/i);
    expect(VM).not.toMatch(/\blive telemetry\b/i);
  });
});
