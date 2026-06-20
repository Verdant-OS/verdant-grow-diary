# EcoWitt Real Ingest Phase 1.6.2 — Validator Reading Merge Repair

Repairs validator handling when a payload contains both a `readings` object and top-level reading keys.

Safety boundary:

- No writes
- No Supabase client
- No schema/RLS/auth changes
- No alerts
- No Action Queue
- No AI
- No automation
- No device control

Behavior:

- Top-level recognized reading keys are merged over `payload.readings` for validation.
- Boundary humidity still accepts but warns.
- pH outside realistic range blocks persistence candidate.
- Src/lib and Edge shared mirror stay aligned for parity.
