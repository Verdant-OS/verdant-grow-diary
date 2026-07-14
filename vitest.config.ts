import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
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
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
