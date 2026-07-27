# founder-slots-remaining — response contract

Machine-readable schema: [`founder-slots-remaining.response.schema.json`](./schemas/founder-slots-remaining.response.schema.json)
(JSON Schema draft 2020-12).

The public `founder-slots-remaining` edge function returns exactly two shapes.
Clients should validate against the schema and branch on `error_code` (never on
the coarse `error` field, which is retained only for back-compat).

## Success — HTTP 200

```json
{ "remaining": 42, "total": 100, "request_id": "6b1c9d2e-…" }
```

- `remaining` — integer in `[0, 100]`. `0` means the Founder Lifetime cap is sold out.
- `total` — always `100`.
- `request_id` — lowercase UUID; also echoed in the `x-request-id` header.
- Cache: `public, max-age=30`.

## Failure envelope — HTTP 405 or 503

```json
{ "error": "slots_unavailable", "error_code": "rpc_error", "request_id": "6b1c9d2e-…" }
```

| `error_code`                        | HTTP | Meaning                                                                  | Retry  |
| ----------------------------------- | ---- | ------------------------------------------------------------------------ | ------ |
| `method_not_allowed`                | 405  | Method other than GET/POST/OPTIONS.                                      | none   |
| `startup_dependencies_unavailable`  | 503  | Cold-start import failure (Supabase client or contract module).          | manual |
| `env_missing`                       | 503  | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` not configured.             | manual |
| `rpc_error`                         | 503  | `public.founder_lifetime_slots_remaining()` returned a database error.   | auto   |
| `rpc_invalid_payload`               | 503  | RPC value was not an integer in `[0, 100]`.                              | auto   |
| `handler_unhandled_error`           | 503  | Unexpected exception escaped the handler.                                | auto   |

All 503s are safe to treat as "fall back to the static Founder cap copy on
`/pricing`." No failure response ever leaks server-side detail; `error_code` is
the only branching signal.

## Response headers (both shapes)

- `x-request-id` — same UUID as `request_id`; use for support/tracing.
- `Content-Type: application/json`.
- `Cache-Control: public, max-age=30` — success only.

## Validating in tests

```ts
import Ajv from "ajv";
import schema from "../docs/schemas/founder-slots-remaining.response.schema.json";

const validate = new Ajv({ strict: false }).compile(schema);
if (!validate(await res.json())) throw new Error(JSON.stringify(validate.errors));
```
