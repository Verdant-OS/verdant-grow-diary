import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

const EDGE_FORBIDDEN_IMPORT_MESSAGE =
  "Edge functions must import shared code via supabase/functions/_shared/lib/** (generated mirror), not src/ or @/ aliases. Run `bun run sync-edge-shared` to regenerate the mirror and rewrite entry imports.";

export default tseslint.config(
  // Global ignores. NOTE: supabase/functions/** is intentionally NOT
  // globally ignored so the edge-forbidden-imports block below can lint
  // it. The main app/browser rule block re-adds that ignore for itself.
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    ignores: ["supabase/functions/**"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      import: importPlugin,
    },
    // Teach ESLint the Vite/TS `@/*` -> `./src/*` alias so aliased imports
    // resolve instead of being reported as unresolved. Mirrors the `paths`
    // entry in tsconfig.json and the `resolve.alias` entry in vite.config.ts;
    // those remain the source of truth — this only lets the linter follow it.
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.app.json", "./tsconfig.node.json"],
        },
        node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
      },
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // TODO(lint-baseline): Pre-existing 174 violations across test/lib files.
      // Tracked for full cleanup – do not add new `any` usage.
      // See: https://github.com/Verdant-OS/verdant-grow-diary/issues/16
      "@typescript-eslint/no-explicit-any": "warn",
      // Catches broken/typo'd module specifiers, including `@/` aliases.
      "import/no-unresolved": ["error", { commonjs: false, caseSensitiveStrict: false }],
    },
  },
  // Playwright specs resolve some modules through the *browser* at runtime
  // (`page.evaluate(() => import("/src/lib/..."))` is a Vite dev-server URL,
  // not a Node module specifier). Node-side resolution can never see those.
  {
    files: ["e2e/**/*.{ts,tsx}"],
    rules: {
      "import/no-unresolved": ["error", { ignore: ["^/src/"] }],
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}", "src/store/**/*.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  // -----------------------------------------------------------------
  // Edge-function import guardrail
  //
  // Fails `bun run lint` (and IDE ESLint) the moment an edge function
  // adds a raw src/ or @/ alias import for lib/constants/types code.
  // This is the dev-time counterpart of scripts/check-no-src-lib-imports.mjs
  // and scripts/verify-edge-shared-in-sync.mjs — the CI grep runs on
  // every build, this fires while you're still typing.
  //
  // Only the forbidden-imports rule is enabled here so the block doesn't
  // drag Deno/edge code through the browser/React ruleset.
  // -----------------------------------------------------------------
  {
    files: ["supabase/functions/**/*.ts"],
    ignores: [
      // Generated mirror is allowed to reference src/ paths in its
      // @generated banner comments; it never imports from them.
      "supabase/functions/_shared/lib/**",
    ],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                // Relative escapes into src/lib, src/constants, or the
                // generated types file — any depth of `../`.
                "**/src/lib",
                "**/src/lib/**",
                "**/src/constants",
                "**/src/constants/**",
                "**/src/integrations/supabase/types",
                // Vite `@/` aliases don't resolve in Deno anyway, but
                // blocking them here catches copy-paste from the app.
                "@/lib",
                "@/lib/**",
                "@/constants",
                "@/constants/**",
                "@/integrations/supabase/types",
              ],
              message: EDGE_FORBIDDEN_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
);
