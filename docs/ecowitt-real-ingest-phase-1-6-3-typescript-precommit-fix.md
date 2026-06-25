# EcoWitt Real Ingest Phase 1.6.3 — TypeScript Pre-Commit Fix

## Summary

Fixes TypeScript-only failures found by the pre-commit hook after the Phase 1.6.1 baseline restore, Phase 1.6.2 validator merge patch, and Phase 1.7 Edge wrapper tests were green.

## Changes

- Narrows auth failure status before passing it into the endpoint result.
- Normalizes `confidence` from unknown to `string | number | null`.
- Uses an explicit `parsed.ok === false` check so the Edge HTTP JSON-body union narrows correctly.

## Safety

Validation-only. No Supabase client, writes, schema, RLS, alerts, Action Queue, AI calls, automation, or device control.
