# Turn B — Founding 100

Ships the refund-retire webhook path, the public Wall + hero counter on `/founder`, the owner prefs form, the four required invariant tests, and the FE cap ripple (75 → 100) triggered by Turn A's DB migration.

## Backend

**Migration** `founding_100_turn_b_refund_and_prefs.sql`:
- `public.revoke_lovable_founder_lifetime_by_transaction(p_paddle_transaction_id text, p_environment text, p_now timestamptz)` RPC:
  - `SECURITY DEFINER`, service_role only.
  - Atomically: `UPDATE public.subscriptions SET status='canceled', current_period_end=p_now, updated_at=p_now WHERE paddle_subscription_id='lifetime_'||p_paddle_transaction_id AND environment=p_environment` AND `UPDATE public.founders SET status='refunded', updated_at=p_now WHERE paddle_transaction_id=p_paddle_transaction_id AND environment=p_environment`.
  - Returns `{ ok: true, revoked: boolean }`. Seat stays consumed (row + number preserved), user's Pro is revoked, wall view naturally drops the row (status<>'confirmed').
- `GRANT EXECUTE ... TO service_role` only; `REVOKE ... FROM anon, authenticated`.

**Webhook** (`eventProcessor.ts` + `orchestrator.ts` + `index.ts`):
- Extend `decide()` for `adjustment.created` where `action IN ('refund','chargeback')` and `status='approved'` and `transactionId` is present → new decision `{ kind: 'revoke_lifetime', paddleTransactionId, env }`.
- Non-approved / non-refund adjustments → skip (existing behavior).
- New `Deps.revokeFounderLifetime(txId, env, now)` calls the RPC. Wired in `index.ts`.

## Cap ripple (Turn A raised DB cap to 100)

- `src/constants/pricing.ts`: `limit: 75 → 100`, `badge: "First 75 only" → "First 100 only"`.
- `supabase/functions/founder-slots-remaining/contract.ts`: `FOUNDER_SLOTS_TOTAL = 75 → 100`.
- Update the 3 test files that hardcode 75 in ways that must track the cap:
  - `src/test/founder-slots-remaining-contract.test.ts` (expects 75)
  - `src/test/subscriber-growth-live-parity-script.test.ts` (total:75 fixtures)
  - `src/test/upgrade-page.test.tsx` (cap fixtures)
- Leave the two static-SQL tests that assert against the **old BYO `billing_subscriptions` migration** (`entitlements-rls.test.ts`, `paddle-paid-launch-gate-static.test.ts`) as-is — they check historical migration text, not the current `founders` cap.

## UI + rules

- **`src/lib/founderWallRules.ts`** (pure):
  - `deriveWallDisplayName(row)` mirroring the DB CASE for the owner's own preview only (public wall reads the view; server is authoritative).
  - `founderPrefsSchema` zod: `display_name` ≤60, no control chars; `optional_link` https-only, reject `javascript:`/`data:`/`http:`/relative/whitespace; `display_style` enum; `show_on_wall` boolean.
- **`src/hooks/useFoundersWall.ts`**: `select('founder_number, public_display_name, optional_link').order('founder_number', { ascending: true })` from `founders_wall_public`.
- **`src/components/FoundersWall.tsx`**: renders list; every `optional_link` gets `target="_blank" rel="noopener noreferrer nofollow"`.
- **`src/components/FoundersHeroCounter.tsx`**: uses `useFounderSlotsRemaining` — shows `{claimed} of 100 claimed` (seats-consumed via existing RPC, already pointed at `founders_seats_consumed()` in A.1).
- **`src/components/FounderOwnerPrefsForm.tsx`**: fetches own `founders` row; edits `display_name`, `display_style`, `show_on_wall`, `optional_link`; validates with zod; writes via a new tiny `save-founder-prefs` edge fn (service_role, verifies `auth.uid()===user_id`, re-validates server-side).
- **`supabase/functions/save-founder-prefs/index.ts`**: JWT-verified; zod-parse; UPDATE own row only.
- **`src/pages/Founder.tsx`**: mount `<FoundersHeroCounter />` in hero; mount `<FoundersWall />` in a new section; mount `<FounderOwnerPrefsForm />` when signed-in user has a founder row.

## Tests (four load-bearing invariants)

1. `src/test/founders-view-exposure-static.test.ts` — reads Turn A migration text; asserts view exposes exactly `founder_number, public_display_name, optional_link`; `security_barrier=true`; `REVOKE ... FROM anon` on `public.founders`.
2. `src/test/founders-refund-retire-static.test.ts` — reads Turn B migration text; asserts RPC updates BOTH `public.subscriptions` status='canceled' AND `public.founders` status='refunded'; grants only to `service_role`.
3. `src/test/founder-wall-rules.test.ts` — pure rules: name derivation per style (custom / first_initial / number_only / hidden) incl. null/empty; prefs zod rejects all listed dangerous URL schemes + control chars + >60 chars; accepts valid.
4. `src/test/founders-webhook-refund-decision.test.ts` — orchestrator decision for `adjustment.created` refund → `revoke_lifetime`; non-approved skipped; happy-path dep invoked with correct tx id.

## Deferred

- Automated Playwright screenshot of `/founder` — sandbox environment gate (session replay only shows real signed-in state on verdant-testbench). I'll ship the code and provide instructions for the user to capture.
- No changes to the existing double-bill cancellation, allocator, or AI Doctor paths.
