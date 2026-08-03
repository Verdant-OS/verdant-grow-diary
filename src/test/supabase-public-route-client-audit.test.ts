/**
 * Strategy C audit — public/marketing routes must not *directly* import the
 * Supabase browser client. The authenticated shell may still warm the client
 * via AuthProvider in `__root.tsx` (document that dependency explicitly).
 *
 * Full code-split isolation of marketing SSR would require moving Auth/Grows
 * providers off the global root — intentionally out of scope for this slice.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const ROUTES = resolve(ROOT, "src/routes");

const CLIENT_IMPORT_RE =
  /from\s+["']@\/integrations\/supabase\/client["']|from\s+["']\.\.?\/.*supabase\/client["']/;

function listRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // Authenticated layout tree is allowed to depend on app data paths.
      if (name === "_app") continue;
      listRouteFiles(full, acc);
    } else if (/\.tsx?$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("public/marketing route Supabase client audit (strategy C)", () => {
  const files = listRouteFiles(ROUTES);

  it("lists non-_app route modules (sanity)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no non-_app route file statically imports @/integrations/supabase/client", () => {
    const offenders: string[] = [];
    for (const file of files) {
      // Root mounts AuthProvider which warms the client — tracked separately.
      if (file.endsWith(`${join("routes", "__root.tsx")}`)) continue;
      const src = readFileSync(file, "utf8");
      if (CLIENT_IMPORT_RE.test(src)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("documents that __root mounts AuthProvider (singleton warm on all pages)", () => {
    const root = readFileSync(resolve(ROUTES, "__root.tsx"), "utf8");
    expect(root).toMatch(/AuthProvider/);
    expect(root).toMatch(/GrowsProvider/);
    // Root itself must not import the client module directly.
    expect(root).not.toMatch(CLIENT_IMPORT_RE);
  });

  it("AuthProvider warms the browser singleton on mount via supabase.auth", () => {
    const auth = readFileSync(resolve(ROOT, "src/store/auth.tsx"), "utf8");
    // First property access on the Proxy materializes createClient.
    expect(auth).toMatch(/supabase\.auth/);
    expect(auth).toMatch(/onAuthStateChange/);
    expect(auth).toMatch(/getSession/);
  });
});
