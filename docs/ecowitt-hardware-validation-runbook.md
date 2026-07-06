# EcoWitt Hardware Validation Runbook (Home LAN, Operator-Only)

> **Operator-only. Physical hardware required.** This runbook covers the one
> validation that cannot run in CI or a sandbox: proving a real EcoWitt
> gateway on the operator's home LAN produces a reading that Verdant displays
> truthfully. Companion docs:
> [`ecowitt-dry-run-operator-runbook.md`](./ecowitt-dry-run-operator-runbook.md)
> (read-only dry-run preview),
> [`ecowitt-live-canary-runbook.md`](./ecowitt-live-canary-runbook.md), and
> [`sensor-truth-rules.md`](./sensor-truth-rules.md).

## Validation flow

```text
EcoWitt gateway on home LAN
→ ecowitt2mqtt / local bridge
→ MQTT Explorer or mosquitto_sub confirms payload
→ dry-run real redacted payload
→ send exactly one webhook reading
→ confirm Verdant UI shows live / ecowitt / mqtt
```

Each arrow is a gate: do not advance until the previous step is confirmed.

1. **Gateway on LAN** — the EcoWitt gateway and sensors are powered, joined
   to the home network, and reporting on their own display/app.
2. **Local bridge** — `ecowitt2mqtt` (or the local bridge in use) receives
   the gateway's custom-upload traffic on the LAN only.
3. **Broker inspection** — MQTT Explorer or `mosquitto_sub` shows the
   translated payload topics with plausible values and units.
4. **Dry-run** — run one real, **redacted** payload through the dry-run
   preview (see the dry-run runbook). Nothing is sent; the preview shows what
   would be ingested.
5. **One-shot webhook** — send exactly **one** reading through the webhook
   path. One. Not a stream.
6. **UI proof** — confirm the reading appears in Verdant with truthful
   labeling (below).

## Expected dry-run identity

The MQTT live-monitoring path must identify itself as:

```json
{
  "source": "live",
  "provider": "ecowitt",
  "transport": "mqtt"
}
```

Note: the gateway custom-upload/webhook path uses the back-compat source
label `ecowitt` by design (see
[`ecowitt-sensor-truth-taxonomy.md`](./ecowitt-sensor-truth-taxonomy.md)).
Neither path may ever masquerade as anything other than what it is.

## Expected UI proof

All of the following must hold before the validation counts as passed:

- The reading's badge shows **live / ecowitt / mqtt** — the true identity,
  not a generic or fabricated label.
- `captured_at` is the current, real timestamp (not import time, not a stale
  echo).
- VPD is calculated **only** when a valid temperature + RH pair exists; a
  missing pair yields no VPD, never a fake 0.
- The soil moisture value lands on the **correct channel** for the probe that
  produced it.
- Sending the same payload again does **not** crash and does **not** create a
  duplicate reading (dedupe holds).
- Once the reading ages past the freshness window, it is shown **stale**, not
  healthy.

## Proof-day DB verification contract

The `sensor_readings` table has no dedicated `provider` or `transport`
columns. The stored `source` column carries the canonical telemetry-state
label only; vendor lineage lives in `raw_payload` (see
`supabase/functions/sensor-ingest-webhook/storageMapping.ts`): the dry-run
identity's `provider` maps to `raw_payload.vendor` and its `transport` maps
to `raw_payload.metadata.transport_source`. The pass condition must never
collapse to just `source = live`.

Verification query (read-only):

```sql
select
  id,
  tent_id,
  source,
  metric,
  value,
  quality,
  captured_at,
  created_at,
  raw_payload ->> 'vendor'                         as vendor,
  raw_payload -> 'metadata' ->> 'transport_source' as transport_source,
  raw_payload -> 'metadata' ->> 'verdant_source'   as verdant_source
from sensor_readings
where source in ('live', 'ecowitt', 'mqtt')
order by captured_at desc nulls last
limit 10;
```

Bridge/MQTT pass condition — all fields, not just `source`:

```text
Bridge/MQTT path proof:
source           = live
vendor           = ecowitt
transport_source = mqtt
verdant_source   = live
quality          = ok
captured_at      = current real timestamp
```

Path distinction — record which path the result actually proves:

| Result                                                           | Meaning                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `source = live`, `vendor = ecowitt`, `transport_source = mqtt`   | Bridge/MQTT path proven                                                    |
| `source = ecowitt`                                               | Direct EcoWitt gateway/custom-upload path proven, not the MQTT bridge path |
| Stored row later changes to `stale`                              | Not expected                                                               |
| UI/read model later shows stale from unchanged `captured_at` age | Expected                                                                   |

### Dedupe proof procedure

- The DB-level dedupe guarantee is `sensor_readings_dedupe_uidx`.
- The unique key is `(user_id, tent_id, source, metric, captured_at)`.
- `raw_payload.idempotency_key` is lineage metadata, not the DB enforcement
  mechanism.
- To prove dedupe, resend the exact same payload with the exact same
  `captured_at`.
- Re-run the proof query.
- Pass condition: same row count and same ids.
- If the bridge stamps a fresh `captured_at` on the second send, a new row
  is legitimate and does not falsify dedupe. Record that separately as a
  fresh-reading check, not as dedupe proof.

## Redaction rules

Before sharing any payload (in an issue, chat, doc, or commit), remove or
mask all of:

- passkey
- password
- token
- secret
- auth (any auth header or field)
- MAC address
- IP address (including private IPs)
- station identifiers
- gateway identifiers
- device IDs

If in doubt, redact it. A payload that cannot be shared safely should not be
shared at all.

## Do-not rules

- Do **not** open router ports for this validation.
- Do **not** expose the gateway or bridge via a public IP.
- Do **not** paste secrets into chat, issues, or commits.
- Do **not** write directly to Supabase tables to "help" the reading appear.
- Do **not** run continuous ingest until the one-shot webhook proof passes.

## Final live proof ledger

Fill this ledger in as the proof runs; it is the acceptance record.

Redaction reminder — before pasting or sharing payloads into any evidence
field, redact: passkey, password, token, secret, auth values, MAC
addresses, private IPs, station identifiers, gateway identifiers, device
IDs (full list in "Redaction rules" above).

```text
EcoWitt Live Proof — Acceptance Checklist

1. MQTT payload visible locally
   Expected: redacted real EcoWitt payload observed through local MQTT bridge
   Status:
   Evidence:
   Notes:

2. Dry-run identity correct
   Expected:
   - source = live
   - vendor = ecowitt
   - transport_source = mqtt
   - verdant_source = live
   - quality = ok
   Status:
   Evidence:
   Notes:

3. One webhook send lands in sensor_readings
   Expected: exactly one new relevant row/set of metric rows with current captured_at
   Status:
   Evidence:
   Notes:

4. UI proof shows correct live identity
   Expected: UI badge/display represents live / ecowitt / mqtt from source + raw_payload metadata
   Status:
   Evidence:
   Notes:

5. Re-send dedupe holds
   Expected: byte-identical payload with same captured_at returns same row count and same ids
   Status:
   Evidence:
   Notes:

6. Staleness flips after freshness window
   Expected: stored row unchanged; UI/read model marks reading stale after ~15 minutes, not healthy/current
   Status:
   Evidence:
   Notes:

7. VPD handling correct
   Expected: VPD calculated only with valid temp + RH; null otherwise, never fake 0
   Status:
   Evidence:
   Notes:

8. Soil channel mapping correct
   Expected: soil moisture lands on correct channel
   Status:
   Evidence:
   Notes:

Path proven:
- Bridge/MQTT path:
- Direct EcoWitt custom-upload path:
- Notes:
```

## Recording the result

Record the completed ledger, with a redacted payload sample and the
observed badge/timestamp, in the release evidence for the current
checkpoint. A failed item is a stop-ship for live-ingest enablement — fix
and re-run the one-shot proof before anything continuous is switched on.
