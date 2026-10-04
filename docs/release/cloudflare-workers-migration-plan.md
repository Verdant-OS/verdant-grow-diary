# Cloudflare Workers migration plan

Status: Phase 1 draft; no runtime configuration or production change.

Matthew requested migration of `verdantgrowdiary.com` and `www` from Vercel to
Cloudflare Workers, with Supabase preserved. This document will record the small
reviewed slices, acceptance gates, environment variable names, rollback, and
numbered MATTHEW STEPS. Phase 2 does not start before Phase 1 review and merge.

Owner: Codex. Independent reviewer: Critical Mass. Merge-queue owner: Grok 91.
Each slice stays draft and requires a clean independent PASS at its exact head
SHA plus all 35 required checks before queue integration. No bypass.

No DNS, nameserver, billing, subscription, Cloudflare account setting, Supabase,
auth, RLS, Edge Function, migration, device-control, or Action Queue changes are
included. Production verification remains NOT_MEASURED.
