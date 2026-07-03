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

## Recording the result

Record pass/fail per UI-proof item, with a redacted payload sample and the
observed badge/timestamp, in the release evidence for the current
checkpoint. A failed item is a stop-ship for live-ingest enablement — fix
and re-run the one-shot proof before anything continuous is switched on.
