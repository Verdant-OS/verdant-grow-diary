/**
 * Tooling scripts under `scripts/` and `.claude/` are plain ESM JavaScript with
 * no type declarations. Several vitest contract tests import them directly.
 * The pre-migration tsconfig ran with `noImplicitAny: false`, so these
 * imports were implicitly `any`; this declaration preserves that behavior
 * under `strict` without turning on `allowJs` (which would type-check the
 * scripts themselves — out of scope for the framework migration).
 */
declare module "*.mjs" {
  const value: any;
  export = value;
}
