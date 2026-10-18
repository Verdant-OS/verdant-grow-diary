/**
 * Mount rule for live-sensor setup surfaces (the Sensors page EcoWitt
 * testbench: backend URL, ingest endpoint, bridge-token mint, copy commands).
 *
 * Pure and presentation-only. The decision input is the state returned by the
 * server-authoritative `live-sensor-entitlement` preflight
 * (`useLiveSensorServerGate`), never the client `useMyEntitlements` capability
 * map: the client hook applies a presentation-only staff lift that
 * `mint-bridge-token` and the ingest functions do not, so a client
 * `liveSensors: true` can still be rejected server-side with
 * `upgrade_required`.
 *
 * Fails closed: only a completed, successful preflight ("allowed") that was
 * evaluated for exactly the active tent mounts the surface. An unscoped
 * decision, a decision for a previous tent, a pending recheck, denied,
 * invalid_request, network_error and any unknown state keep it hidden.
 */
export interface LiveSensorSetupMountInput {
  /** `useLiveSensorServerGate(...).state`. */
  serverGateState: string | null | undefined;
  /** `useLiveSensorServerGate(...).evaluatedTentId`: the tent the decision is for. */
  evaluatedTentId: string | null | undefined;
  /** The tent currently selected and resolved on the page, or null. */
  activeTentId: string | null | undefined;
}

export function canMountLiveSensorSetup(input: LiveSensorSetupMountInput): boolean {
  if (input.serverGateState !== "allowed") return false;
  if (typeof input.activeTentId !== "string" || input.activeTentId === "") return false;
  return input.evaluatedTentId === input.activeTentId;
}
