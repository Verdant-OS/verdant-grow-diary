/**
 * Evidence Linkage Persistence v1 — static safety scan.
 *
 * Guards the adapter + UI mounts + write paths against accidental leakage of
 * raw payloads, secrets, device-control language, certainty claims, or
 * conflation of demo/manual/csv/stale/invalid/unknown evidence with "healthy".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const SCANNED_FILES = [
  "src/lib/originatingTimelineEventAdapter.ts",
  "src/lib/originatingTimelineEventRules.ts",
  "src/components/EvidenceLinkageBadges.tsx",
  "src/pages/AlertDetail.tsx",
  "src/pages/ActionDetail.tsx",
  "src/hooks/useAddAiDoctorSessionSuggestionToActionQueue.ts",
  "src/lib/alerts.ts",
];

const BANNED_TOKENS = [
  "service_role",
  "bridge_token",
  "api_token",
  "automatically executed",
  "auto-execute",
  "auto execute",
  "send command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "guaranteed",
  "definitely",
  "diagnosed from photo",
];

describe("Evidence Linkage Persistence v1 — static safety", () => {
  for (const file of SCANNED_FILES) {
    it(`${file} contains no banned safety tokens`, () => {
      // The adapter intentionally lists secret/token field names so it can
      // reject refs that carry them. Those identifiers are guarded by the
      // adapter-specific assertion below; skip the broad scan for that file.
      if (file === "src/lib/originatingTimelineEventAdapter.ts") return;
      const src = read(file).toLowerCase();
      for (const tok of BANNED_TOKENS) {
        expect(src.includes(tok.toLowerCase())).toBe(false);
      }
    });
  }

  it("badge UI never renders raw_payload data", () => {
    const src = read("src/components/EvidenceLinkageBadges.tsx");
    expect(src.toLowerCase().includes("raw_payload")).toBe(false);
    expect(src.toLowerCase().includes("rawpayload")).toBe(false);
    expect(src.toLowerCase().includes("payload")).toBe(false);
  });

  it("adapter rejects raw-payload-like fields by name", () => {
    const src = read("src/lib/originatingTimelineEventAdapter.ts");
    expect(src).toContain("FORBIDDEN_REF_FIELDS");
    expect(src).toContain("raw_payload");
    expect(src).toContain("bridge_token");
    expect(src).toContain("service_role");
  });

  it("never co-locates 'healthy' next to unsafe source labels in scanned files", () => {
    const unsafeLabels = [
      "invalid",
      "stale",
      "demo",
      "csv",
      "unknown",
      "untrusted",
    ];
    for (const file of SCANNED_FILES) {
      const src = read(file).toLowerCase();
      if (!src.includes("healthy")) continue;
      for (const label of unsafeLabels) {
        // Reject "healthy" appearing within 60 chars of any unsafe label.
        const re = new RegExp(
          `healthy[\\s\\S]{0,60}${label}|${label}[\\s\\S]{0,60}healthy`,
          "i",
        );
        expect(re.test(src), `${file} co-locates healthy/${label}`).toBe(
          false,
        );
      }
    }
  });

  it("write paths persist refs from a safe source (explicit [] or forwarded via adapter)", () => {
    const alertDetail = read("src/pages/AlertDetail.tsx");
    const aiHook = read(
      "src/hooks/useAddAiDoctorSessionSuggestionToActionQueue.ts",
    );
    // AlertDetail now forwards the alert's already-sanitized persisted refs
    // (Evidence Ref Population v1) via the shared adapter wrapper.
    expect(alertDetail).toMatch(
      /originating_timeline_events:\s*\n?\s*forwardAlertRefsToActionQueue\(alert\)/,
    );
    // AI Doctor session path has no typed refs at the write boundary; stays [].
    expect(aiHook).toMatch(/originating_timeline_events:\s*\[\]/);
    // Defense: every assignment to the column in these writers is either an
    // explicit empty array or the safe forward helper — no raw payloads,
    // session text, or inferred values.
    const ALLOWED = new Set([
      "originating_timeline_events:[]",
      "originating_timeline_events:forwardAlertRefsToActionQueue(alert)asunknownasnever",
    ]);
    for (const src of [alertDetail, aiHook]) {
      const assignments =
        src.match(/originating_timeline_events:[\s\S]*?(?=,\n|\n\s*}|$)/g) ?? [];
      for (const a of assignments) {
        const normalized = a.replace(/\s+/g, "");
        expect(
          ALLOWED.has(normalized),
          `disallowed originating_timeline_events assignment: ${normalized}`,
        ).toBe(true);
      }
    }
  });


  it("Action Queue approval flow remains approval-required (no auto-execution language)", () => {
    const src = read("src/pages/ActionDetail.tsx").toLowerCase();
    expect(src).toContain("approval");
    expect(src.includes("auto-execute")).toBe(false);
    expect(src.includes("auto execute")).toBe(false);
  });
});
