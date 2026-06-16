import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const FILES = [
  "supabase/functions/_shared/ecowittRealIngestHttp.ts",
  "supabase/functions/ecowitt-real-ingest/index.ts",
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function read(relativePath: string): string {
  return stripComments(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

describe("EcoWitt real-ingest Edge wrapper static safety", () => {
  it.each(FILES)("%s contains no service-role or committed secret material", (relativePath) => {
    const source = read(relativePath);

    expect(source).not.toMatch(/service[_-]?role/i);
    expect(source).not.toMatch(/sk_live_/i);
    expect(source).not.toMatch(/sk_test_/i);
    expect(source).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(source).not.toMatch(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
    expect(source).not.toMatch(/ECOWITT_BRIDGE_TOKEN\s*=/);
  });

  it.each(FILES)("%s contains no Supabase client or database write calls", (relativePath) => {
    const source = read(relativePath);

    expect(source).not.toMatch(/supabase\.from\s*\(/);
    expect(source).not.toMatch(/\.insert\s*\(/);
    expect(source).not.toMatch(/\.update\s*\(/);
    expect(source).not.toMatch(/\.upsert\s*\(/);
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/\.rpc\s*\(/);
    expect(source).not.toMatch(/functions\.invoke/);
  });

  it.each(FILES)("%s contains no outbound network or browser storage APIs", (relativePath) => {
    const source = read(relativePath);

    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\baxios\b/);
    expect(source).not.toMatch(/localStorage/);
    expect(source).not.toMatch(/sessionStorage/);
  });

  it.each(FILES)(
    "%s contains no alert, action queue, AI, or automation surfaces",
    (relativePath) => {
      const source = read(relativePath).toLowerCase();

      expect(source).not.toContain("action_queue");
      expect(source).not.toContain("from('alerts')");
      expect(source).not.toContain('from("alerts")');
      expect(source).not.toContain("openai");
      expect(source).not.toContain("chat.completions");
      expect(source).not.toContain("model:");
    },
  );

  it.each(FILES)("%s contains no device-control wording", (relativePath) => {
    const source = read(relativePath).toLowerCase();

    expect(source).not.toMatch(/\b(fan|light|pump|humidifier|dehumidifier|heater)\b/);
    expect(source).not.toMatch(/turn\s+on/);
    expect(source).not.toMatch(/turn\s+off/);
    expect(source).not.toMatch(/set\s+fan/);
    expect(source).not.toMatch(/\bdose\b/);
    expect(source).not.toMatch(/irrigate\s+now/);
  });

  it("only the Edge index reads Deno.env", () => {
    const sharedSource = read("supabase/functions/_shared/ecowittRealIngestHttp.ts");
    const indexSource = read("supabase/functions/ecowitt-real-ingest/index.ts");

    expect(sharedSource).not.toContain("Deno.env");
    expect(indexSource).toContain("Deno.env.get");
  });
});
