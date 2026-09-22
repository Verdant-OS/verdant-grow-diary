/** Runtime-only ownership of an uncancellable SDK exit and its navigation. */
export const SIGN_OUT_RECOVERY_DELAY_MS = 15_000;
type SignOutStatus = "idle" | "pending" | "stalled";
interface SignOutOperation {
  getSnapshot: () => SignOutStatus;
  subscribe: (listener: () => void) => () => void;
  begin: () => { finish: () => void } | null;
  hasFailedCleanup: () => boolean;
  clearFailedCleanup: () => void;
  runSdkSignOut: <T>(action: () => Promise<T> | T) => Promise<T>;
}

// A provider remount must not expose sign-in while the same SDK client is
// still logging out. No user/session/token data or browser storage is kept.
const operations = new WeakMap<object, SignOutOperation>();

export function getAuthSignOutOperation(client: object): SignOutOperation {
  const existing = operations.get(client);
  if (existing) return existing;
  let status: SignOutStatus = "idle";
  let current: object | null = null;
  let pendingSdkCalls = 0;
  let failedCleanup = false;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let sdkTail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: SignOutStatus) => {
    status = next;
    for (const listener of [...listeners]) listener();
  };
  const reconcileStatus = () => {
    if (current || pendingSdkCalls > 0) {
      if (status !== "idle") return;
      recoveryTimer = setTimeout(() => {
        if (current || pendingSdkCalls > 0) publish("stalled");
      }, SIGN_OUT_RECOVERY_DELAY_MS);
      publish("pending");
      return;
    }
    clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
    if (status !== "idle") publish("idle");
  };
  const operation: SignOutOperation = {
    getSnapshot: () => status,
    hasFailedCleanup: () => failedCleanup,
    clearFailedCleanup: () => {
      failedCleanup = false;
    },
    runSdkSignOut: (action) => {
      // A rejected-bearer cleanup may already be logging out this client.
      // Explicit exit must await it: a late earlier logout can erase a new
      // session even after the later logout reported success.
      // Automatic cleanup owns the entry fence too. A Retry can otherwise
      // observe a missing session and expose sign-in before this SDK call
      // finishes removing whichever session the client holds at completion.
      pendingSdkCalls += 1;
      const result = sdkTail
        .then(action)
        .then(
          (value) => {
            failedCleanup = false;
            return value;
          },
          (error: unknown) => {
            // Entry masking can unmount the hook that requested cleanup.
            // Retain only its failure outcome so remount waits for Retry
            // instead of immediately starting the same rejected cleanup.
            failedCleanup = true;
            throw error;
          },
        )
        .finally(() => {
          pendingSdkCalls -= 1;
          reconcileStatus();
        });
      sdkTail = result.catch(() => undefined);
      reconcileStatus();
      return result;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin: () => {
      if (current) return null;
      const owner = {};
      current = owner;
      reconcileStatus();
      return {
        finish: () => {
          if (current !== owner) return;
          current = null;
          reconcileStatus();
        },
      };
    },
  };
  operations.set(client, operation);
  return operation;
}
