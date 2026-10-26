/**
 * #2230 public census: `/auth` failed with net::ERR_ABORTED on a cold dev
 * server. requestHostname.ts is in the client graph (paddle.ts → the root
 * payment banner); while it imported `@tanstack/react-start/server` (directly,
 * or through a `.server` module), the client environment walked into
 * start-server-core, discovered server-only dependencies after startup
 * (h3-v2, @tanstack/router-core/ssr/server, …) and full-reloaded the page,
 * aborting the next navigation. The SSR entry now registers the request reader
 * instead, so the client graph imports nothing server-side.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: vi.fn() } }));

const SRC = join(process.cwd(), "src");

// Files allowed to import server request APIs or `.server` modules. Each is
// server-only and never imported by client code.
const SERVER_ONLY_IMPORTERS = [
  "src/integrations/supabase/auth-middleware.ts",
  "src/lib/requestHostname.server.ts",
  "src/server.ts",
];

const SERVER_IMPORT =
  /(?:from\s+|import\s*\(\s*|import\s+)["'](?:@tanstack\/react-start\/server|[^"']*\.server(?:\.tsx?)?)["']/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "test" || name === "__tests__") continue;
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

function importLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && SERVER_IMPORT.test(line));
}

describe("request hostname stays out of the client graph", () => {
  it("only server-only files import server request APIs or .server modules", () => {
    const importers = sourceFiles(SRC)
      .filter((path) => importLines(path).length > 0)
      .map((path) => relative(process.cwd(), path).split(sep).join("/"))
      .sort();
    expect(importers).toEqual(SERVER_ONLY_IMPORTERS);
  });

  it("requestHostname.ts imports nothing server-side", () => {
    expect(importLines(join(SRC, "lib", "requestHostname.ts"))).toEqual([]);
  });

  it("the SSR entry installs the request reader", async () => {
    const { REQUEST_HOSTNAME_READER_KEY } = await import("@/lib/requestHostname");
    delete (globalThis as Record<symbol, unknown>)[REQUEST_HOSTNAME_READER_KEY];
    vi.resetModules();
    await import("@/server");
    const { readRequestHostname } = await import("@/lib/requestHostname.server");
    expect((globalThis as Record<symbol, unknown>)[REQUEST_HOSTNAME_READER_KEY]).toBe(
      readRequestHostname,
    );
  });
});
