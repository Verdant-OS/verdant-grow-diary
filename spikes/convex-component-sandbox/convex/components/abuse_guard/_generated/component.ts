/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> = {
  check: {
    check: FunctionReference<
      "query",
      "internal",
      { keyHash: string; max: number; nowMs: number; windowMs: number },
      | { remaining: number; status: "allow" }
      | { remaining: number; retryAfterMs: number; status: "deny" },
      Name
    >;
    consume: FunctionReference<
      "mutation",
      "internal",
      { keyHash: string; max: number; nowMs: number; windowMs: number },
      | { remaining: number; status: "allow" }
      | { remaining: number; retryAfterMs: number; status: "deny" },
      Name
    >;
    snapshot: FunctionReference<
      "query",
      "internal",
      { keyHash: string; nowMs: number; windowMs: number },
      { count: number },
      Name
    >;
  };
};
