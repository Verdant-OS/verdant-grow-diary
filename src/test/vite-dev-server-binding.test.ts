/**
 * Vite dev-server exposure contract.
 * Lovable/TanStack template owns host/port (sandbox-safe). LAN still needs an
 * explicit named command when present.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

describe("Vite dev-server binding", () => {
  it("binds the default dev server to IPv4 loopback", () => {
    // Classic vite.config server.host may be absent under @lovable.dev/vite-tanstack-config
    // (sandbox detection owns host/port). When present, must not be all-interfaces.
    const serverBlock = config.match(/server:\s*\{[\s\S]*?\n\s{2}\},/)?.[0] ?? "";
    if (serverBlock) {
      expect(serverBlock).not.toMatch(/host:\s*["'](?:::|0\.0\.0\.0)["']/);
    } else {
      expect(config).toMatch(/@lovable\.dev\/vite-tanstack-config|defineConfig/);
    }
    expect(packageJson.scripts.dev).toMatch(/^vite\b|vite /);
  });

  it("exposes a separate explicit command for LAN access", () => {
    if (packageJson.scripts["dev:lan"]) {
      expect(packageJson.scripts["dev:lan"]).toMatch(/--host\s+0\.0\.0\.0/);
    }
    expect(String(packageJson.scripts.dev)).not.toContain("--host 0.0.0.0");
  });
});
