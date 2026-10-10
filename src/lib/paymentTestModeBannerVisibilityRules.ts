/**
 * Who may see the Paddle sandbox test-mode banner.
 *
 * The app role enum is operator | customer | staff. There is no admin role.
 * Operator is the existing admin seat: `useHasRole("operator")` asks the
 * server `has_role` RPC and is granted only when that RPC returns true.
 * Loading, signed-out, denied, and error states are not granted.
 */
export function shouldShowPaddleSandboxTestModeBanner(operatorGranted: boolean): boolean {
  return operatorGranted === true;
}
