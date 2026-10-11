// A provider can unmount after taking the one-shot OAuth hash but before the
// SDK finishes establishing its session. Replacement providers must await that
// same consumption, rather than resolve the old session or replay the tokens.
// Only an in-flight completion promise is retained, keyed by the auth client.
const pendingConsumptions = new WeakMap<object, Promise<void>>();

export function runAuthOAuthBootstrap(
  client: object,
  consume: () => Promise<unknown>,
): Promise<void> {
  const existing = pendingConsumptions.get(client);
  if (existing) return existing;

  const pending: Promise<void> = Promise.resolve()
    .then(consume)
    .then(() => undefined)
    .finally(() => {
      if (pendingConsumptions.get(client) === pending) pendingConsumptions.delete(client);
    });
  pendingConsumptions.set(client, pending);
  return pending;
}
