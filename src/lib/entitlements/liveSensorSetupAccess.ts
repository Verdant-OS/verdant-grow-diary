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
 * Fails closed: only a completed, successful preflight ("allowed") for an
 * active tent mounts the surface. Loading, denied, invalid_request,
 * network_error and any unknown state keep it hidden.
 */
export interface LiveSensorSetupMountInput {
  /** `useLiveSensorServerGate(...).state`. */
  serverGateState: string | null | undefined;
  /** True only when a tent is selected and resolved. */
  hasActiveTent: boolean;
}

export function canMountLiveSensorSetup(input: LiveSensorSetupMountInput): boolean {
  return input.hasActiveTent === true && input.serverGateState === "allowed";
}
