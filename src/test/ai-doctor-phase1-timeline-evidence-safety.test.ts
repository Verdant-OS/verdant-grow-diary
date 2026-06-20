import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const VIEW_MODEL = "src/lib/aiDoctorPhase1TimelineEvidenceViewModel.ts";
const CARD = "src/components/AiDoctorPhase1TimelineEvidenceCard.tsx";

function read(p: string) {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("AI Doctor Phase 1 timeline evidence — static safety", () => {
  it("view-model contains no writes, AI calls, or device control", () => {
    const src = read(VIEW_MODEL);
    const forbidden = [
      "supabase",
      "functions.invoke",
      "fetch(",
      "action_queue",
      "alerts",
      "service_role",
      "bridge_token",
      "lovable-api",
      "openai",
      "anthropic",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      ".rpc(",
    ];
    for (const term of forbidden) {
      expect(src, `view-model must not contain ${term}`).not.toContain(term);
    }
  });

  it("card contains no writes, AI calls, or device control", () => {
    const src = read(CARD);
    const forbidden = [
      "supabase",
      "functions.invoke",
      "fetch(",
      "action_queue",
      "alerts",
      "service_role",
      "bridge_token",
      "lovable-api",
      "openai",
      "anthropic",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      ".rpc(",
      "onClick",
      "<button",
    ];
    for (const term of forbidden) {
      expect(src, `card must not contain ${term}`).not.toContain(term);
    }
  });
});
