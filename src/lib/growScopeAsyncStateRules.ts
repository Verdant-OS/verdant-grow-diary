export type RequestedGrowScopeState = "unscoped" | "loading" | "error" | "invalid" | "valid";

/**
 * Resolve an optional URL grow scope only after the RLS-backed grow list has
 * settled. A requested grow is never treated as invalid while ownership is
 * still loading, and a failed ownership read never falls back to all grows.
 */
export function classifyRequestedGrowScopeState(input: {
  hasRequestedGrow: boolean;
  isLoading: boolean;
  hasError: boolean;
  isValid: boolean;
}): RequestedGrowScopeState {
  if (!input.hasRequestedGrow) return "unscoped";
  if (input.isLoading) return "loading";
  if (input.hasError) return "error";
  return input.isValid ? "valid" : "invalid";
}
