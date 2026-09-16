/** Runtime-only ownership of an uncancellable SDK exit and its navigation. */
export const SIGN_OUT_RECOVERY_DELAY_MS = 15_000;
type SignOutStatus = "idle" | "pending" | "stalled";
interface SignOutOperation {
  getSnapshot: () => SignOutStatus;
  subscribe: (listener: () => void) => () => void;
  begin: () => { finish: () => void } | null;
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
  let sdkTail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: SignOutStatus) => {
    status = next;
    for (const listener of [...listeners]) listener();
  };
  const operation: SignOutOperation = {
    getSnapshot: () => status,
    runSdkSignOut: (action) => {
      // A rejected-bearer cleanup may already be logging out this client.
      // Explicit exit must await it: a late earlier logout can erase a new
      // session even after the later logout reported success.
      const result = sdkTail.then(action);
      sdkTail = result.catch(() => undefined);
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
      publish("pending");
      const timer = setTimeout(() => {
        if (current === owner) publish("stalled");
      }, SIGN_OUT_RECOVERY_DELAY_MS);
      return {
        finish: () => {
          if (current !== owner) return;
          clearTimeout(timer);
          current = null;
          publish("idle");
        },
      };
    },
  };
  operations.set(client, operation);
  return operation;
}
