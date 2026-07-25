/**
 * Vite dev-server exposure contract.
 * The normal command stays loopback-only; LAN exposure requires a named,
 * explicit command.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

describe("Vite dev-server binding", () => {
  it("binds the default dev server to IPv4 loopback", () => {
    const serverBlock =
      config.match(/server:\s*\{[\s\S]*?\r?\n\s{2}\},\r?\n\s{2}plugins:/)?.[0] ?? "";

    expect(serverBlock).toContain('host: "127.0.0.1"');
    expect(serverBlock).not.toMatch(/host:\s*["'](?:::|0\.0\.0\.0)["']/);
    expect(packageJson.scripts.dev).toBe("vite");
  });

  it("exposes a separate explicit command for LAN access", () => {
    expect(packageJson.scripts["dev:lan"]).toBe("vite --host 0.0.0.0");
    expect(packageJson.scripts.dev).not.toContain("--host");
  });
});
