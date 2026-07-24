/**
 * Pure, fail-closed access rule for the diagnostic panels embedded in the
 * grower-facing Sensors route.
 *
 * The `?operator=1` flag only requests the surface. A server-verified role
 * grant is still required before diagnostic UI or diagnostic-only reads are
 * enabled.
 */
export type OperatorRoleStatus =
  | "loading"
  | "granted"
  | "denied"
  | "unauthenticated"
  | "error";

export interface SensorOperatorAccessInput {
  requested: boolean;
  roleStatus: OperatorRoleStatus;
}

export function canShowSensorOperatorDiagnostics(
  input: SensorOperatorAccessInput,
): boolean {
  return input.requested && input.roleStatus === "granted";
}
