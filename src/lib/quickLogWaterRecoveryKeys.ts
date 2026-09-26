/** One owner lock serializes starter and typed Water claims across tabs. */
export const waterRecoveryLockKey = (ownerId: string) =>
  `verdant:quick-log:water-recovery-lock:v1:${ownerId}`;

export const starterWaterRecoveryKey = (ownerId: string) =>
  `verdant:quick-log:pending-starter-water:v1:${ownerId}`;

export const typedWaterRecoveryKey = (ownerId: string) =>
  `verdant:quick-log:pending-watering:v1:${ownerId}`;
