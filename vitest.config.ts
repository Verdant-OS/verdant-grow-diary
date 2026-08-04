import { defineConfig, type Plugin } from "vitest/config";
// The TanStack Start stack ships `@vitejs/plugin-react` (Babel), not the SWC
// variant the old Vite + React Router setup used. Importing the SWC plugin
// here made every `vitest run` fail to load its config.
// Prefer the declared dep (@vitejs/plugin-react) under frozen CI installs.
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Strip the `#!/usr/bin/env node` shebang from local `.mjs` scanner scripts
 * before vitest evaluates them. vite-node runs modules via `node:vm`
 * `new Script()`, which (unlike Node's own loader / esbuild) does NOT strip
 * shebangs — so on Node 26 + Windows importing these scripts throws
 * "SyntaxError: Invalid or unexpected token" and takes down several
 * pre-existing docs-safety scanner tests (all green in CI/Linux). Replacing
 * the shebang with a blank line keeps line numbers stable.
 */
function stripMjsShebang(): Plugin {
  return {
    name: "verdant-strip-mjs-shebang",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (file.endsWith(".mjs") && code.startsWith("#!")) {
        return { code: code.replace(/^#![^\n]*/, ""), map: null };
      }
      return null;
    },
  };
}

const srcRoot = path.resolve(__dirname, "./src");

export default defineConfig({
  root: __dirname,
  plugins: [stripMjsShebang(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [path.resolve(__dirname, "./src/test/setup.ts")],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Inline local `.mjs` scanner scripts so the shebang-strip plugin's
    // transform runs on them (vite externalizes `.mjs` otherwise).
    server: { deps: { inline: [/[\\/]scripts[\\/].*\.mjs$/] } },
  },
  resolve: {
    alias: {
      // Vitest-only: real TanStack MemoryRouter provider for legacy tests.
      // Production vite config continues to resolve the product shim.
      "@/lib/react-router-compat": path.resolve(
        srcRoot,
        "test/helpers/reactRouterCompat.vitest.tsx",
      ),
      "@": srcRoot,
    },
  },
});
