// A scheduled run has no person present (#1852). It may make only the smoke's
// two tagged fixture saves: it never records legal consent and never creates
// fixture rows. Owner-triggered runs keep their existing behavior.

export const UNATTENDED_RECONSENT_BLOCKED =
  "BLOCKED: agreement re-consent is required; an unattended scheduled run never accepts legal agreements. Run the smoke from an owner dispatch to accept it.";

/** True only for the exact value the workflow sets on a scheduled run. */
export function isUnattendedRun(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.E2E_UNATTENDED_RUN === "true";
}

export type ReconsentAction = "none" | "accept" | "block";

export function reconsentAction(gateShown: boolean, unattended: boolean): ReconsentAction {
  if (!gateShown) return "none";
  return unattended ? "block" : "accept";
}
