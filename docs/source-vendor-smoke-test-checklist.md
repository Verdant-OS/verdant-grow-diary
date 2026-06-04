# Source / Vendor Lineage Smoke-Test Checklist

> Generated from the source/vendor lineage audit across webhook ingest, DB persistence, Ingest Inspector, and diary timeline badges.
> Scope: read-only documentation. No code, schema, or test changes.

---

## 1. Test Cases

| # | Input `source` | Input `vendor` | Normalized `source` | Persisted `source` | Vendor lineage preserved | Inspector label | Diary badge label | Never "Live" |
|---|---|---|---|---|---|---|---|---|
| 1 | `"ecowitt"` | — | `ecowitt` | ✓ `ecowitt` | n/a | **EcoWitt** | **EcoWitt** | ✓ |
| 2 | `"mqtt"` (any case) | `"ecowitt"` | `mqtt` | ✓ `mqtt` | ✓ `ecowitt` | **MQTT** + **EcoWitt** | **MQTT** + **EcoWitt** | ✓ |
| 3 | `"webhook"` (any case) | `"Home Assistant"` | `webhook` | ✓ `webhook` | ✓ `Home Assistant` | **Webhook** + **Home Assistant** | **Webhook** + **Home Assistant** | ✓ |
| 4 | `"csv"` (any case) | — | `csv` | ✓ `csv` | n/a | **CSV** | **CSV** | ✓ |

---

## 2. Expected Source Normalization

- `source` is **trimmed**, **lowercased**, and **canonicalized** before persistence.
- `normalizeWebhookSource` uses an **exact allow-list** of lower-cased matches.
  - Allowed: `ecowitt`, `mqtt`, `webhook`, `csv`, `pi_bridge`, `home_assistant`, `api`, `manual`, `demo`, `live`
  - Any other value is rejected with `invalid source: …` and `ok: false`.
- `validate_sensor_reading` (DB trigger) acts as a **second gate** on insert.
- Fuzzy / unsupported inputs are **never silently accepted**:
  - `"eco"`, `"mq"`, `"web"`, etc. → **rejected**.

---

## 3. Expected Vendor Lineage

- `vendor` is **trimmed** and persisted only when it is a **non-empty string**.
- `normalizeVendorLineage` drops:
  - non-string values
  - whitespace-only strings
- If `vendor` is missing or invalid, it is **omitted** from `raw_payload`; no default is injected.
- Vendor is **never** assigned to `source`, `user_id`, or `tent_id`.

---

## 4. Expected Inspector Labels

- `inspectorSourceLabel` returns a **friendly display name** for canonical sources.
- `isLiveSource` excludes the following from ever being labeled **"Live"**:
  - `csv`, `webhook`, `mqtt`, `ecowitt`, `pi_bridge`, `home_assistant`, `api`
- Vendor label is rendered via `extractVendorLineage`, which reads only from:
  - `raw_payload.vendor`
  - `raw_payload.metadata.vendor`

---

## 5. Expected Diary Badge Labels

- `DiaryEntryBadges` renders two chips for sensor snapshots:
  - **"Source: [Label]"**
  - **"Vendor: [Label]"** (when vendor lineage exists)
- `resolveDiarySensorSourceLabel` maps canonical source → display label.
- `resolveDiarySensorVendorLabel` maps canonical vendor → display label.
- Vendor chip carries a `title` tooltip:
  > "lineage only — not used for authorization"

---

## 6. Expected "Never Live" Behavior

- Transport sources (`csv`, `mqtt`, `webhook`) and bridge sources (`ecowitt`, `pi_bridge`, `home_assistant`) are **never classified as "Live"**.
- `isLiveSource` returns `true` **only** for the canonical source value `live`.
- Demo data is **never** presented as live sensor truth.

---

## 7. Raw Payload Vendor Rules

| Condition | Behavior |
|---|---|
| `vendor` is a non-empty string | Persisted in `raw_payload.vendor` |
| `vendor` is missing | Key omitted from `raw_payload` |
| `vendor` is non-string (number, object, etc.) | Dropped |
| `vendor` is whitespace-only | Dropped |
| `vendor` appears inside `metadata.vendor` | Also read by `extractVendorLineage` as fallback |

---

## 8. Safety Notes

- **Vendor is lineage-only.** It is displayed for traceability but is **never used for authorization, ownership, routing, or access control.**
- **Source is not auth.** The `source` field labels the transport origin; it does not grant permissions or bypass RLS.
- **No `service_role` keys.** The ingest path does not use `service_role` tokens in client or edge-function code.
- **No device control.** No strings or calls related to fan, light, pump, heater, humidifier, dehumidifier, irrigation, or dosing appear in the ingest pipeline.
- **No automatic alerts.** Sensor ingest does **not** create `alerts` rows automatically.
- **No Action Queue writes.** Sensor ingest does **not** create `action_queue` rows automatically.
- **Read-only audit.** This checklist is documentation only; no code, schema, RLS, or edge-function changes are required.

---

## 9. Files Involved in the Audit

- `src/lib/sensorWebhookIngestRules.ts`
- `src/lib/ingestInspectorRules.ts`
- `src/lib/growDiaryTimelineRules.ts`
- `src/components/DiaryEntryBadges.tsx`
- `supabase/functions/sensor-ingest-webhook/index.ts`
- DB trigger: `public.validate_sensor_reading`

---

## 10. How to Run the Audit

Targeted test suites:

```bash
bunx vitest run src/test/sensor-webhook-ingest-source-vendor.test.ts --reporter=dot
bunx vitest run src/test/ingestInspectorRules.test.ts --reporter=dot
bunx vitest run src/test/sensor-source-vendor-polish.test.ts --reporter=dot
bunx vitest run src/test/sensor-ingest-webhook-matrix.test.ts --reporter=dot
```

Full suite:

```bash
bunx vitest run --reporter=dot
```

---

## 11. Audit Results

| Suite | Result |
|---|---|
| Targeted lineage suites | **96 / 96 passed** |
| Full Vitest suite | **9,471 / 9,471 passed** (611 files) |

**Safety verdict:** ✅ PASS — read-only audit. No code, schema, RLS, or edge-function changes. Vendor remains lineage-only; sources are canonicalized and gated by both the normalizer and DB trigger; no automatic alerts or Action Queue writes anywhere in the webhook path.

---

## 12. Risk / Rollback

- **None.** This checklist is documentation only. No changes are shipped.
- If any of the four cases above ever fail in CI or production, the regression is in:
  - `normalizeWebhookSource`
  - `normalizeVendorLineage`
  - `sanitizeRawPayload`
  - `inspectorSourceLabel` / `isLiveSource`
  - `resolveDiarySensorSourceLabel` / `resolveDiarySensorVendorLabel`
  - `public.validate_sensor_reading` DB trigger
