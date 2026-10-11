/** A deletion continuation never becomes current again after it is abandoned. */
export function createAccountDeletionContinuation() {
  let current = true;
  let cleanupStarted = false;
  return {
    isCurrent: () => current,
    invalidate: () => {
      current = false;
    },
    beginCleanup: () => {
      if (!current) return false;
      cleanupStarted = true;
      return true;
    },
    unmount: () => {
      // The auth provider intentionally unmounts its children while the SDK
      // cleanup owns entry. Actual navigation still invalidates separately.
      if (!cleanupStarted) current = false;
    },
  };
}
