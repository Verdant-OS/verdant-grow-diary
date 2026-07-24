/**
 * _shared re-export shim for src/lib/cost/index.ts.
 *
 * Surfaces the measurement-only cost helpers (pure; no persistence, no I/O)
 * to edge functions. Follows the _shared/unionEntitlementLookup.ts
 * convention — single source of truth stays in src/lib. No logic here.
 *
 * The `.ts` file (not a directory) keeps the shim path flat, matching the
 * other _shared/ shims.
 */
export * from "./lib/lib/cost/index.ts";
