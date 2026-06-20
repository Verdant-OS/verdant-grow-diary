# EcoWitt Real Ingest — Phase 1: Authenticated Endpoint Shell

## Scope

Phase 1 builds the **server-side endpoint shell** for future EcoWitt real
ingest. It is intentionally a no-persistence layer:

- Authenticates the caller (Bearer bridge token, env-injected).
- Parses the candidate payload.
- Invokes the Phase 0 pure validator.
- Returns a typed accept/reject response with a redacted preview.
- **Writes nothing.** No `sensor_readings`, no `alerts`, no
  `action_queue`, no AI calls, no automation, no device control, no
  "live" dashboard label.

## Files

| File                                              | Role                                           |
| ------------------------------------------------- | ---------------------------------------------- |
| `src/lib/ecowittRealIngestAuth.ts`                | Pure Bearer-token auth helper                  |
| `src/lib/ecowittRealIngestEndpoint.ts`            | Pure request handler (auth → validate → reply) |
| `src/lib/ecowittRealIngestValidator.ts` *(P0)*    | Pure candidate validator                       |
| `src/lib/ecowittRealIngestRedaction.ts` *(P0)*    | Recursive secret-key redactor                  |
| `src/lib/ecowittRealIngestDedupe.ts`    *(P0)*    | Deterministic dedupe-key builder               |
| `src/test/ecowitt-real-ingest-auth.test.ts`       | Auth-helper unit tests                         |
| `src/test/ecowitt-real-ingest-endpoint.test.ts`   | End-to-end handler unit tests                  |

## Auth contract

`validateEcoWittBridgeAuthorization(headerValue, expectedToken)` returns
one of:

| Status            | HTTP | When                                             |
| ----------------- | ---- | ------------------------------------------------ |
| `authorized`      | n/a  | Header is `Bearer <token>` and token matches     |
| `unauthorized`    | 401  | Missing / malformed / non-Bearer / empty token   |
| `forbidden`       | 403  | Bearer token does not match expected             |
| `not_configured`  | 503  | Server has no `ECOWITT_BRIDGE_TOKEN` configured  |

- The expected token is injected from `ECOWITT_BRIDGE_TOKEN` by the thin
  runtime wrapper. It is **never** committed to the repo.
- The helper never returns or logs the token value.
- String compare uses a constant-length XOR loop to avoid the most
  obvious timing oracle.

## Endpoint contract

`handleEcoWittRealIngestRequest({ authorizationHeader, expectedToken,
payload, reference_time, freshness_window_ms })` returns:

```ts
{
  ok: boolean;
  accepted: boolean;
  can_persist_later: boolean;
  status: "accepted_candidate" | "rejected_candidate"
        | "unauthorized" | "forbidden" | "bad_request" | "not_configured";
  http_status: 202 | 400 | 401 | 403 | 422 | 503;
  blocked_reasons: string[];
  warnings: string[];
  dedupe_key: string | null;
  captured_at: string | null;
  source: string;
  redacted_payload_preview: unknown;
  note: string; // Phase 1 note: validation only, no persistence.
}
```

Rules:

- `accepted: true` means the **validator** accepted the candidate. It
  does **not** mean a row was written.
- `can_persist_later: true` means the candidate is **eligible** for a
  future persistence phase. Nothing is stored now.
- The response **never** contains the bearer token.
- The response **never** contains an unredacted `raw_payload`. The
  redactor masks any key whose name contains `passkey`, `password`,
  `token`, `secret`, `authorization`, `auth`, `mac`, `ip`, `station`,
  or `gateway`.
- The response never enables a `live` dashboard label.

## Runtime wrapper status

The Phase 0/Phase 1 lib code lives in `src/lib/*`. Supabase Edge
Functions in this repo cannot import from `src/lib/*` under existing
conventions (Edge uses `npm:` / `_shared/` only). To avoid duplicating
validator logic into Deno, the Edge wrapper is **deferred** to a
follow-up slice. The lib-side handler is fully covered by unit tests
and is the authoritative implementation surface.

## Out of scope (Phase 1)

- Persistence (no DB writes of any kind).
- Schema / RLS / migrations.
- AI calls, alerts, Action Queue writes.
- Device control / outbound automation.
- "Live" dashboard label.
- Bridge token storage, rotation, or distribution.
- Hardware polling, MQTT, Home Assistant bridge.
