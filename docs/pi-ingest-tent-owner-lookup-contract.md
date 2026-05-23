# pi-ingest Tent-Owner Lookup — Contract (DOCS ONLY)

**Status:** Contract + static guardrail tests only. **No implementation
exists yet.** No tent-owner lookup helper, no Edge Function, no
resolver, and no `service_role` usage may appear in this task.

This document defines the future server-side tent-owner lookup that
will feed `tentOwnerUserId` into
[`evaluateBridgeAuthorization`](../src/lib/piIngestBridgeAuthorizationRules.ts)
so the future `pi-ingest-readings` endpoint can reject cross-user tent
inserts.

This is a **docs/static-tests only** scope. No implementation, no
Supabase imports, no Edge Function, no `service_role`, no UI, no
schema changes, no sensor inserts, no alert persistence changes, no
Action Queue changes, no automation, no device control, and no AI
Doctor changes are introduced here.

---

## 1. Purpose

The future tent-owner lookup is a **server-side function that resolves
a `tent_id` to its owning `user_id`** so the future `pi-ingest-readings`
Edge Function can call:

```
evaluateBridgeAuthorization({
  credential,
  tentId,
  tentOwnerUserId, // <- produced by this lookup
});
```

It is required **before any bridge can insert sensor readings**. The
lookup result is consumed only inside the future Edge Function. The
external bridge never sees the resolved `tentOwnerUserId` directly.

---

## 2. Allowed runtime surface

The lookup may run **only** inside the future server-side Edge Function
code path for `pi-ingest-readings`.

The lookup MUST NOT run:

- In React components.
- In browser/client bundles.
- As a general shared `src/lib` data fetcher. Pure modules under
  `src/lib/` may define **types and contracts only** for the lookup
  shape; they must not perform the lookup, must not import the
  Supabase client, and must not be reachable from the client bundle as
  a data fetcher.

The lookup MUST NOT expose tent-owner information back to the bridge
caller beyond an allow/deny verification result.

---

## 3. Lookup behavior

- **Input:** `tent_id`.
- **Internal output:**
  - `{ ok: true, tentId, tentOwnerUserId }` on success, **or**
  - `{ ok: false, reason }` on failure.
- **Missing `tent_id` fails closed.**
- **Unknown `tent_id` fails closed.**
- **Tent without an owner fails closed.**
- The lookup must return only the owner needed for authorization for
  that specific `tent_id`. It must not return any other tent or any
  other user's owner id.
- The bridge caller must **never** receive another user's owner id.

---

## 4. Ownership / security rules

- Future implementation **must read from `tents.user_id`** as the
  authoritative source of ownership.
- Future implementation **must not trust client-provided `user_id`**
  from the request body, headers, or query string.
- Future implementation **must not trust bridge-provided owner id**
  in the request envelope.
- Future implementation **must compare the resolved tent owner to the
  bridge credential owner** via `evaluateBridgeAuthorization`.
- **Cross-user tent inserts must be rejected.** A bridge owned by
  user A cannot insert readings against a tent owned by user B.
- A **failed lookup inserts zero `sensor_readings` rows**.
- A **failed lookup records zero `pi_ingest_idempotency_keys` rows**.

---

## 5. Service / security model

Future implementation options (pick one, document at implementation
time):

- **Preferred:** Run inside the Edge Function **after** bridge
  authentication, using a controlled server-side Supabase client.
- If `service_role` is used in the future, it must **only** be used
  inside Edge Function code **after** the bridge has been authenticated.
  It must **never** be exposed to client code or the browser bundle.
- If a user-scoped auth path is used instead, it must still guarantee
  the bridge cannot SELECT arbitrary users' tents through this lookup.

---

## 6. Prohibited behavior

Explicitly forbidden:

- Trusting a **client-provided `user_id`** for ownership decisions.
- Returning the resolved **`tentOwnerUserId` to the external bridge**.
- Performing the lookup in the **browser/client bundle**.
- Exposing a **public anonymous lookup endpoint**.
- Placing the lookup helper in **React components**.
- Storing the **owner id from the request body** as authoritative.
- **Inserting readings before the lookup succeeds.**
- Writing **alerts or Action Queue items during lookup**.

---

## 7. Stop-ship conditions

Any of the following blocks shipping the future endpoint:

- Lookup runs in browser/client bundle.
- Lookup trusts request body `user_id`.
- Lookup returns another user's owner id to the bridge caller.
- Lookup allows an unknown tent through.
- Lookup inserts sensor readings before authorization completes.
- Lookup uses `service_role` outside the Edge Function.
- Lookup writes to `alerts` or `action_queue`.
- Lookup bypasses `evaluateBridgeAuthorization`.
