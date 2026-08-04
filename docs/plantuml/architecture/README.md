# Bridge sensor trust — architecture diagrams

Source-backed PlantUML for the Verdant **bridge token / sensor ingest** trust chain.

| Diagram | Status | Source anchors |
|---------|--------|----------------|
| [`bridge-token-mint-sequence.puml`](./bridge-token-mint-sequence.puml) | **Present** | `mint-bridge-token/index.ts`, `liveSensorEntitlementGate.ts`, `config.toml` |
| Mint → use → revoke (full) | Planned | mint + `sensor-ingest-webhook` + revoke |
| Ingest verification activity | Planned | webhook handler + auth + freshness |
| Token lifecycle state | Planned | `bridge_tokens` + revoke one-way + usage RPC |
| Trust boundaries component | Planned | JWT vs vbt_ vs service_role |
| Sibling isolation | Planned | generic vbt_ / EcoWitt / Pi HMAC |

## Rules

- **Docs-only** — no runtime, migration, or Edge handler edits in this folder.
- **No real secrets** — placeholders only (`vbt_…`, `<user JWT>`).
- **No generated binaries** in git (render PNG/SVG locally if needed).
- **Style:** self-contained `skinparam` until `docs/plantuml/style.puml` (#716) is on `verdant-grow-diary`; then prefer `!include docs/plantuml/style.puml`.
- **Honesty:** do not label BLOCKED evidence lanes as PASS on diagrams.

## Render

```bash
plantuml docs/plantuml/architecture/bridge-token-mint-sequence.puml
```

## Related

- `docs/bridge-sensor-ingest-security-audit-checklist.md`
- `supabase/functions/mint-bridge-token/index.ts`
