import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Common proof-only Vitest config for immutable PR #694 base/head/merge refs.
 *
 * This file is copied into an untracked `.pr694-proof/` directory inside each
 * target checkout. It intentionally omits the PR-head-only router alias and
 * uses one generated, ref-neutral setup file so source/test behavior can be
 * compared independently of the known native-config startup difference.
 */
function stripMjsShebang() {
  return {
    name: "verdant-pr694-strip-mjs-shebang",
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

const root = process.cwd();

export default defineConfig({
  root,
  plugins: [stripMjsShebang(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [path.resolve(root, ".pr694-proof/normalized-setup.ts")],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    server: {
      deps: {
        inline: [/[\\/]scripts[\\/].*\.mjs$/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
});
