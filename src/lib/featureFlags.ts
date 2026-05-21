/**
 * Project-wide feature flags.
 *
 * All flags MUST default to `false` unless a flag has been explicitly enabled
 * by the team after live verification.
 *
 * Rules:
 * - No runtime behavior changes when a flag flips from missing to `false`.
 * - Flags are read-only constants. Do not mutate at runtime.
 * - Do not gate auth, RLS, or any security-critical path on a flag — flags
 *   are for additive seams only.
 */

/**
 * Enables the watering-only typed event write path through the
 * `create_watering_event` RPC.
 *
 * MUST stay `false` until the docs/testing/typed-event-rls-checklist.md
 * Sign-off table is fully completed against the live backend with two
 * distinct authenticated users.
 *
 * While `false`, no QuickLog or UI code path may call the typed write helper,
 * and the helper itself must short-circuit before touching Supabase.
 */
export const typedWateringWriteEnabled = false as const;

export type FeatureFlagName = "typedWateringWriteEnabled";

export const featureFlags = Object.freeze({
  typedWateringWriteEnabled,
});
