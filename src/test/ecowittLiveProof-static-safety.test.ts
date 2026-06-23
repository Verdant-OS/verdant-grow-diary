import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/ecowittLiveProofRules.ts",
  "src/lib/ecowittLiveProofViewModel.ts",
  "src/components/EcowittLiveProofPanel.tsx",
];

const FORBIDDEN_TOKENS = [
  ".insert(",
  ".update(",
  ".delete(",
  ".upsert(",
  ".rpc(",
  "functions.invoke(",
  "service_role",
  "PASSKEY",
  "Authorization",
  "Bearer ",
  "vbt_",
];

const FORBIDDEN_IMPORTS = [
  "@/integrations/supabase/client",
  "@/lib/aiDoctor",
  "@/lib/actionQueue",
  "@/hooks/useAlertsList",
  "@/hooks/useAiDoctor",
];

const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;

describe("ecowittLiveProof static safety", () => {
  for (const rel of FILES) {
    it(`${rel} has no forbidden tokens`, () => {
      const content = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const tok of FORBIDDEN_TOKENS) {
        expect(content, `${rel} should not contain ${tok}`).not.toContain(tok);
      }
      expect(content, `${rel} should not contain a JWT`).not.toMatch(JWT_RE);
    });

    it(`${rel} has no forbidden imports`, () => {
      const content = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const imp of FORBIDDEN_IMPORTS) {
        expect(content, `${rel} should not import ${imp}`).not.toContain(imp);
      }
    });
  }
});
