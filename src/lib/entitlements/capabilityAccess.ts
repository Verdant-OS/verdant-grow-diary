/**
 * Canonical boolean-capability check for entitlement presentation.
 *
 * Pure and presentation-only. Server-side paid or cost-bearing operations
 * must resolve the same entitlement independently before performing work.
 */
import type { Capabilities, ResolvedEntitlement } from "./types";

export type BooleanCapabilityKey = {
  [Key in keyof Capabilities]: Capabilities[Key] extends boolean ? Key : never;
}[keyof Capabilities];

export function canUseCapability(
  entitlement: ResolvedEntitlement | null | undefined,
  capability: BooleanCapabilityKey,
): boolean {
  return entitlement?.isActive === true && entitlement.capabilities[capability] === true;
}
