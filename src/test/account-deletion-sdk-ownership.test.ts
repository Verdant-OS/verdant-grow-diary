import {
  AuthError,
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestAccountDeletion,
  type DeleteAccountContinuationOptions,
} from "@/lib/accountDeletion";
import { getAuthSignOutOperation } from "@/lib/authSignOutOperationService";

const fixture = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return fixture.client;
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

const expiresAt = 4_102_444_800;
const token = (id: string) =>
  [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub: id, exp: expiresAt })),
    "fixture-signature",
  ].join(".");
const session = (id: string): Session => ({
  access_token: token(id),
  refresh_token: `fixture-refresh-${id}`,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: expiresAt,
  user: {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: `${id}@example.invalid`,
    created_at: "2026-09-16T00:00:00Z",
    app_metadata: {},
    user_metadata: {},
  },
});

let deleteStarted: ReturnType<typeof deferred<void>>;
let deleteReply: ReturnType<typeof deferred<void>>;
let logoutOwners: string[];
let logoutScopes: Array<string | null>;
let deleteHeaders: string[];
let clientSequence = 0;
let relayAuthEvent: (
  event: AuthChangeEvent,
  delivered: ReturnType<typeof session> | null,
) => Promise<void>;

beforeEach(async () => {
  // Only the browser transport is replaced: auth-js receives the message and
  // notifies its real subscribers without writing this tab's session store.
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      addEventListener(_type: string, listener: (message: MessageEvent) => Promise<void>) {
        relayAuthEvent = async (event, delivered) => {
          await listener(new MessageEvent("message", { data: { event, session: delivered } }));
        };
      }
      postMessage() {}
      close() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("External network is forbidden");
    }),
  );
  deleteStarted = deferred<void>();
  deleteReply = deferred<void>();
  logoutOwners = [];
  logoutScopes = [];
  deleteHeaders = [];
  const memory = new Map<string, string>();
  fixture.client = createClient("https://deletion-fixture.invalid", "fixture-public-key", {
    auth: {
      storageKey: `deletion-fixture-${++clientSequence}`,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => {
          memory.set(k, v);
        },
        removeItem: (k) => {
          memory.delete(k);
        },
      },
    },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://deletion-fixture.invalid");
        if (url.pathname === "/auth/v1/token") {
          const body = JSON.parse(String(init?.body)) as { email: string };
          const owner = body.email.split("@")[0];
          return new Response(JSON.stringify(session(owner)), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.pathname === "/auth/v1/logout") {
          logoutOwners.push(new Headers(init?.headers).get("Authorization") ?? "");
          logoutScopes.push(url.searchParams.get("scope"));
          return new Response(null, { status: 204 });
        }
        if (url.pathname === "/functions/v1/delete-account") {
          expect(JSON.parse(String(init?.body))).toEqual({ confirm: "DELETE" });
          deleteHeaders.push(new Headers(init?.headers).get("Authorization") ?? "");
          deleteStarted.resolve();
          await deleteReply.promise;
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`Unexpected fixture route: ${url.pathname}`);
      },
    },
  });
  await signIn("owner-a");
});

afterEach(async () => {
  deleteReply.resolve();
  await fixture.client.auth.stopAutoRefresh();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function signIn(owner: string) {
  const result = await fixture.client.auth.signInWithPassword({
    email: `${owner}@example.invalid`,
    password: "fixture-only",
  });
  expect(result.error).toBeNull();
}

function startDeletion() {
  const operation = getAuthSignOutOperation(fixture.client.auth);
  const navigationStates: string[] = [];
  const onDeleted = vi.fn(() => {
    navigationStates.push(operation.getSnapshot());
  });
  const options: DeleteAccountContinuationOptions = {
    expectedUserId: "owner-a",
    isCurrent: () => true,
    beginCleanup: () => {
      const lease = operation.begin();
      return lease ? { ...lease, isCurrent: () => true } : null;
    },
    onDeleted,
  };
  const result = requestAccountDeletion("DELETE", options);
  return { result, onDeleted, navigationStates };
}

describe("account deletion with the actual Supabase SDK and intercepted HTTP", () => {
  it.each([
    ["SIGNED_IN", session("owner-b")],
    ["SIGNED_OUT", null],
  ] as const)(
    "still clears A after another tab relays %s while this tab holds A",
    async (event, delivered) => {
      const request = startDeletion();
      await deleteStarted.promise;
      await relayAuthEvent(event, delivered);
      expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("owner-a");
      deleteReply.resolve();
      await expect(request.result).resolves.toEqual({ ok: true, disposition: "completed" });
      expect(deleteHeaders).toEqual([`Bearer ${token("owner-a")}`]);
      expect(logoutOwners).toEqual([`Bearer ${token("owner-a")}`]);
      expect(logoutScopes).toEqual(["local"]);
      expect((await fixture.client.auth.getSession()).data.session).toBeNull();
      expect(request.onDeleted).toHaveBeenCalledOnce();
      expect(request.navigationStates).toEqual(["pending"]);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("does not revive A's old confirmation after this tab really signs in B then A", async () => {
    const request = startDeletion();
    await deleteStarted.promise;
    await signIn("owner-b");
    await signIn("owner-a");
    deleteReply.resolve();
    await expect(request.result).resolves.toEqual({ ok: true, disposition: "superseded" });
    expect(logoutOwners).toEqual([]);
    expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("owner-a");
    expect(request.onDeleted).not.toHaveBeenCalled();
  });

  it("does not revive A's old confirmation after this tab really signs out then re-enters A", async () => {
    const request = startDeletion();
    await deleteStarted.promise;
    await fixture.client.auth.signOut({ scope: "local" });
    await signIn("owner-a");
    deleteReply.resolve();
    await expect(request.result).resolves.toEqual({ ok: true, disposition: "superseded" });
    expect(logoutOwners).toEqual([`Bearer ${token("owner-a")}`]);
    expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("owner-a");
    expect(request.onDeleted).not.toHaveBeenCalled();
  });

  it("holds cleanup until the relayed event's own-session read settles, without awaiting inside the callback", async () => {
    const request = startDeletion();
    await deleteStarted.promise;
    const heldRead = deferred<Awaited<ReturnType<typeof fixture.client.auth.getSession>>>();
    vi.spyOn(fixture.client.auth, "getSession").mockImplementationOnce(() => heldRead.promise);
    // Awaiting relay delivery would deadlock if our auth subscriber awaited
    // the held read before returning to auth-js.
    await relayAuthEvent("SIGNED_IN", session("owner-b"));
    deleteReply.resolve();
    await Promise.resolve();
    expect(logoutOwners).toEqual([]);
    heldRead.resolve({ data: { session: session("owner-a") }, error: null });
    await expect(request.result).resolves.toEqual({ ok: true, disposition: "completed" });
    expect(logoutOwners).toEqual([`Bearer ${token("owner-a")}`]);
    expect(request.onDeleted).toHaveBeenCalledOnce();
  });

  it("reports unconfirmed cleanup if an auth-event held-session read fails after server deletion", async () => {
    const request = startDeletion();
    await deleteStarted.promise;
    vi.spyOn(fixture.client.auth, "getSession").mockRejectedValueOnce(
      new Error("fixture store unavailable"),
    );
    await relayAuthEvent("SIGNED_IN", session("owner-b"));
    deleteReply.resolve();
    await expect(request.result).resolves.toMatchObject({
      ok: true,
      disposition: "cleanup_unconfirmed",
    });
    expect(logoutOwners).toEqual([]);
    expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("owner-a");
    expect(request.onDeleted).not.toHaveBeenCalled();
  });

  it("keeps an auth-event returned read error unconfirmed even when a later held read succeeds", async () => {
    const request = startDeletion();
    await deleteStarted.promise;
    vi.spyOn(fixture.client.auth, "getSession").mockResolvedValueOnce({
      data: { session: null },
      error: new AuthError("fixture store unavailable"),
    });
    await relayAuthEvent("SIGNED_IN", session("owner-b"));
    deleteReply.resolve();
    await expect(request.result).resolves.toMatchObject({
      ok: true,
      disposition: "cleanup_unconfirmed",
    });
    expect(logoutOwners).toEqual([]);
    expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("owner-a");
    expect(request.onDeleted).not.toHaveBeenCalled();
  });

  it("does not navigate over A re-entering after the deletion's own cleanup notification", async () => {
    const signOut = fixture.client.auth.signOut.bind(fixture.client.auth);
    vi.spyOn(fixture.client.auth, "signOut").mockImplementation(async (...args) => {
      const result = await signOut(...args);
      await signIn("owner-a");
      return result;
    });
    const request = startDeletion();
    await deleteStarted.promise;
    deleteReply.resolve();
    await expect(request.result).resolves.toEqual({ ok: true, disposition: "superseded" });
    expect(logoutOwners).toEqual([`Bearer ${token("owner-a")}`]);
    expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("owner-a");
    expect(request.onDeleted).not.toHaveBeenCalled();
  });

  it("clears the confirming session locally and keeps entry held until its welcome continuation", async () => {
    const request = startDeletion();
    await deleteStarted.promise;
    deleteReply.resolve();
    await expect(request.result).resolves.toMatchObject({ ok: true, disposition: "completed" });
    expect(deleteHeaders).toEqual([`Bearer ${token("owner-a")}`]);
    expect(logoutOwners).toEqual([`Bearer ${token("owner-a")}`]);
    expect(logoutScopes).toEqual(["local"]);
    expect((await fixture.client.auth.getSession()).data.session).toBeNull();
    expect(request.onDeleted).toHaveBeenCalledOnce();
    expect(request.navigationStates).toEqual(["pending"]);
    expect(getAuthSignOutOperation(fixture.client.auth).getSnapshot()).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not erase B when A's earlier successful deletion reply arrives", async () => {
    const request = startDeletion();
    await deleteStarted.promise;
    await signIn("owner-b");
    deleteReply.resolve();
    await request.result;
    expect(logoutOwners).toEqual([]);
    expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("owner-b");
    expect(request.onDeleted).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("pins A's request bearer while the SDK token getter is delayed across B signing in", async () => {
    const tokenReadStarted = deferred<void>();
    const tokenReadRelease = deferred<void>();
    const client = fixture.client;
    const readSession = client.auth.getSession.bind(client.auth);
    const functions = client.functions;
    vi.spyOn(client, "functions", "get").mockReturnValue(functions);
    const invoke = functions.invoke.bind(functions);
    let invoking = false;
    vi.spyOn(functions, "invoke").mockImplementation((...args) => {
      invoking = true;
      return invoke(...args);
    });
    vi.spyOn(client.auth, "getSession").mockImplementation(async () => {
      if (invoking) {
        tokenReadStarted.resolve();
        await tokenReadRelease.promise;
      }
      return readSession();
    });
    const request = startDeletion();
    await tokenReadStarted.promise;
    await signIn("owner-b");
    tokenReadRelease.resolve();
    await deleteStarted.promise;
    deleteReply.resolve();
    await request.result;
    expect(deleteHeaders).toEqual([`Bearer ${token("owner-a")}`]);
    expect(logoutOwners).toEqual([]);
    expect((await readSession()).data.session?.user.id).toBe("owner-b");
    expect(request.onDeleted).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
