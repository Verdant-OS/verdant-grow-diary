/** One owner lock serializes starter and typed Water claims in the active tab. */
export const waterRecoveryLockKey = (ownerId: string) =>
  `verdant:quick-log:water-recovery-lock:v1:${ownerId}`;

export const starterWaterRecoveryKey = (ownerId: string) =>
  `verdant:quick-log:pending-starter-water:v1:${ownerId}`;

export const typedWaterRecoveryKey = (ownerId: string) =>
  `verdant:quick-log:pending-watering:v1:${ownerId}`;

/**
 * Key-scoped fallback for a typed Water history-review refusal whose full
 * marked record could not be rewritten while a small write still lands. It does
 * not help at storage capacity. It names exactly one idempotency key.
 */
export const typedWaterHistoryMarkerKey = (ownerId: string) =>
  `verdant:quick-log:pending-watering-history:v1:${ownerId}`;
