---
name: verdant-grow-diary-core
description: Verdant's product vision, architecture map, safety doctrine, and collaboration rules — load for every change to this project.
---

# Verdant Grow Diary — Core Skill

## 1. What Verdant is

Verdant is a **Grow OS for home growers**: a plant diary with sensor truth. The one-line vision is **"Plant memory. Sensor truth. Better decisions."** Growers log what they did and saw (waterings with ml, feedings, observations, photos), attach environmental context (temperature, RH, VPD) whose provenance is always labeled, and over weeks that timeline becomes the evidence a grower — or Verdant's cautious AI Doctor — reasons from. Verdant **never controls equipment**. It informs; the grower decides.

The core activation loop ("One-Tent Loop"): create a grow/tent/plant → log a 30-second Quick Log entry → see it on the Timeline → return tomorrow. Everything else (AI Doctor, Action Queue, sensor integrations, Pheno Hunt breeding tools, exports) builds on that loop and must never break it.

## 2. The five inviolable doctrines

These are product law. Never write code or copy that violates them; if a request seems to require it, stop and ask.

1. **Sensor truth.** Every reading's provenance is one of exactly six labels: `live`, `manual`, `csv`, `demo`, `stale`, `invalid`. Never present demo, stale, manual, or unknown-provenance data as live. "Live" is a claim, not a default — unrecognized source strings render as "Unverified source", never "Live sensor". Numeric fields never invent values: an empty field stays empty, never a fake zero.
2. **The grower decides.** AI Doctor and alerts may *suggest* actions with a reason, evidence, and risk level; a suggestion reaches the approval-required Action Queue **only when the grower adds it**. Nothing is ever auto-executed. Verdant sends no device commands — no MQTT publish, no relay/actuator/pump control, ever. Copy must never say a suggestion "waits in" or "goes to" the queue automatically.
3. **Capability-truth copy.** Marketing and UI copy claims only what shipped code does. CSV import is claimed for AC Infinity, Spider Farmer, and any export with timestamp/temperature/humidity columns; other vendors come in via manual snapshots or read-only integrations "where available". No unverified pricing, limits, integrations, or entitlement claims. No "unlimited AI" — ever (Founder Lifetime is pinned at 100 credits/month by deliberate decision).
4. **Billing truth.** Entitlement truth lives in the `subscriptions` / `billing_subscriptions` tables via the server-side union resolver — **never `profiles.tier`** (that's XP/gamification only). Client pages reflect entitlements; they never grant them. Checkout opens only through the canonical `usePaddleCheckout` hook (caller set is pinned by test: Pricing.tsx and Upgrade.tsx). AI credits are metered server-side (`ai_credit_spend`, refunds via append-only reversal rows). Free tier: 1 active grow, single tent, 3 AI credits/grow; Pro/Founder: unlimited grows, multi-tent, 100 credits/month.
5. **Grower privacy.** No grower content (notes, nicknames, emails, ids) in URLs, analytics params, error logs, or SEO copy. Funnel analytics go only through `src/lib/funnelAnalytics.ts` with its closed param allowlist. Never introduce `service_role` in frontend code. Anonymous Quick Log drafts live only in the visitor's browser and move into an account only by explicit review-and-save.

## 3. Architecture map

- **Frontend:** React + Vite + TypeScript (strictNullChecks OFF — prefer plain result shapes and `'error' in res` checks over discriminated-union narrowing), shadcn/ui, TanStack Query, react-router. Pages in `src/pages/`, presenters in `src/components/`, **pure rules modules in `src/lib/`** (no React/Supabase/clock reads — injectable time).
- **Backend:** Supabase. RLS on every user table; writes that need trust go through SECURITY DEFINER RPCs (e.g. `quicklog_save_manual` resolves identity from `auth.uid()`, dedupes via idempotency keys, and is the ONLY Quick Log persistence path — never add a second one). Edge functions in `supabase/functions/` (Paddle webhooks, entitlement gates, sensor ingest); shared helpers in `_shared/`.
- **Migrations:** `supabase/migrations/` — version prefixes MUST be unique (a static test enforces this; a duplicate once broke every CI run). Never edit an existing migration; add a new one.
- **Payments:** Lovable built-in Paddle is the live lane (`payments-webhook` with a durably-record → decide → write → mark orchestrator; founder allocation is advisory-locked at 75 slots; a founder grant best-effort-cancels the buyer's old recurring subscription). The BYO `paddle-webhook`/`/upgrade` lane is sandbox-gated operator tooling.
- **Analytics:** GA4 page views + the 8 funnel events (`signup, tent_created, plant_created, quick_log_saved, csv_import_completed, paywall_viewed, checkout_started, subscription_activated`) via `trackFunnelEvent` only.
- **Key rules modules to reuse, not duplicate:** `sensorSnapshot.ts` (snapshot classification), `sensorIngestProvenance.ts` / `sensorSourceLabels.ts` (six-label vocabulary), `growDiaryTimelineRules.ts`, `quickLogIdempotencyKey.ts`, `entitlements/` (capabilities, planCatalog, resolver, freeTierGates), `funnelAnalytics.ts`, `checkoutReturnTo.ts` (sanitizes all returnTo values).

## 4. Test culture — the part that keeps breaking

This repo guards behavior with **contract-pin tests**: static source assertions (`readFileSync` + regex) that pin copy strings, wiring, and safety fences. **When you rename user-facing copy, a heading, a route, or a testid, you MUST update the pin tests in the same change** — recent direct pushes renamed "Grow Learning Hub" to "Reports" and "Tent A" to a dynamic name without touching the pins, and every open PR went red for hours. Before pushing any change:

1. Grep `src/test/` for every literal string and file path you changed.
2. Run the affected test files plus `bunx tsc -p tsconfig.app.json`.
3. Never add a route without updating `appRouteManifest.ts` ordering rules and the mobile route-coverage tests.
4. Never weaken a safety fence test (no-service_role scans, no-device-control wording scans, checkout ownership pins) to make a change pass — change the code or ask.

## 5. Copy voice

Calm, honest, grower-first. Honest empty states ("No entries yet") over fake data. Disclose trade-offs plainly (the public starter says drafts live on this device, before and after saving). No dark patterns, no fake urgency ("only today", countdown timers), no scare copy. American English, sentence case, ml/°F conventions per existing code.

## 6. Collaboration protocol

A CI pipeline and a Claude Code session also work this repo. To coexist: keep changes small and focused; don't rewrite `.github/workflows/` or `scripts/run-vitest-batches.mjs` (CI infra changes need Matthew's explicit approval); don't touch `supabase/migrations/` history; when a task involves pricing numbers, limits, or plan features, the single source of truth is `src/constants/pricing.ts` and `src/lib/entitlements/` — derive display values, never hardcode a second copy.

---

When asked to build a feature, apply this skill by default: find the existing rules module or seam first, extend it purely, wire presenters thin, pin the new behavior with tests, and keep every doctrine above intact.
