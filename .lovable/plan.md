
# NUGs Gamification System

A point + leveling system that rewards onboarding, daily logging, and harvest milestones. Built in phased increments so we can ship value early.

## What gets built

### 1. Backend (Lovable Cloud)

New tables (all RLS-protected, scoped to `auth.uid()`):

- **`profiles`** — `user_id`, `display_name`, `nugs_total` (int), `level` (int), `tier` (text), `current_badge` (text), auto-created on signup via trigger.
- **`nug_events`** — append-only ledger: `user_id`, `kind` (e.g. `onboarding_profile`, `daily_log`, `photo_added`, `harvest_logged`, `coach_session`), `amount`, `meta` (jsonb), `created_at`. Unique constraints prevent double-claiming one-shot quests.
- **`harvests`** — `user_id`, `grow_id`, `harvested_at`, `grow_type`, `medium`, `yield_grams`, `notes`. Counts toward tier gates.
- **`unlocks`** — `user_id`, `key` (e.g. `strain_library`, `vpd_tracker`, `hall_of_growers`), `unlocked_at`. Idempotent.
- **`user_quests`** — tracks one-shot onboarding quest completion.

Database function `award_nugs(kind, amount, meta)` runs in a transaction:
1. Inserts the event (respecting unique-once constraints).
2. Recomputes `nugs_total` and re-derives `level` + `tier` from the curve.
3. Inserts any newly earned `unlocks`.
Returns `{ awarded, new_total, new_level, unlocked: [] }`.

### 2. Level curve & unlock map (constants in `src/lib/leveling.ts`)

```text
Tier 1 Seedling    L1=500, ×1.3 → L10≈5,000
Tier 2 Vegetative  L11=7,500 (1 harvest)  → L20≈30,000 (3 harvests)
Tier 3 Flowering   L21=45,000 (3 harvests) → L30≈110,000 (5 harvests, 2 types)
Tier 4 Fruiting    L31=160,000 (5h, 2 mediums) → L40≈360,000 (7h, 3 types)
Tier 5 Harvest Master L41=500,000 → L50≈1,200,000 (10h, 4 types)
```

Unlocks: L5 grow badge + strain library, L10 reminders + 2nd grow, L15 VPD/light tools, L20 strain discount, L25 breeding/phenotype, L30 premium guides + priority coach, L35 mentor badge, L40 limited strains + advisory, L45 Hall of Growers, L50 Legendary Cultivator.

### 3. Earning rules

- **Onboarding (one-shot, totals 500):** profile complete 100, first grow 150, first diary entry 150, first AI coach 100.
- **Recurring:** daily log 25 (once/day), photo on entry +15, weekly streak bonus 50, AI coach session 20 (max 3/day), harvest logged 500 + bonuses for yield/cure/medium diversity.

### 4. Frontend

- **`useNugs()` hook** — reads profile, exposes `award(kind, meta)`, subscribes to realtime profile updates.
- **Header NUG badge** — replaces nothing, sits in top bar: nug count + level chip, opens Rewards modal.
- **Rewards page** (`/rewards`, new bottom-nav tab with trophy icon) — shows:
  - Current tier card with level progress bar to next level.
  - Onboarding quest checklist (tap quest → routes to relevant page).
  - Tier roadmap: 5 expandable cards listing every level + unlock + requirements + lock state.
  - Recent NUG activity feed.
- **Spotlight tour** — first-login coach-marks point to: header grow picker → + button → Coach tab → Rewards. Skippable; completing each step awards its quest.
- **Award triggers** — call `award()` from existing flows: profile save, grow create, QuickLog success, Coach reply, harvest creation.
- **Level-up celebration** — confetti + toast when `new_level > old_level`, modal listing newly unlocked items.
- **Unlock gating** — strain library, VPD tools, second grow, etc. read from `unlocks` table; locked features show a "Reach Lv X to unlock" state.

### 5. Harvest flow

New "Mark harvested" action on a grow → opens harvest dialog (date, grow_type, medium, yield, cure notes) → inserts into `harvests`, awards NUGs, recomputes tier gates.

## Phasing

This is large. I'd ship it in 4 PRs so each is reviewable and the app stays working:

1. **Foundation:** profiles, nug_events, unlocks, `award_nugs`, `useNugs`, header badge, onboarding quest awards + checklist on Timeline.
2. **Rewards page + tour:** full `/rewards` page, spotlight tour, level-up modal, recurring daily-log/photo/coach awards.
3. **Harvests:** harvests table, harvest dialog, Tier 2–3 gating, unlock gating for strain library / VPD placeholder pages.
4. **Endgame:** Tier 4–5, Hall of Growers leaderboard view, Legendary badge surfaces, mentor flag.

## Open questions before I start

1. **Phasing:** ship Phase 1 first (recommended) or build the whole thing in one go?
2. **Tour style:** Coinbase-style spotlight overlay (recommended), or just a checklist card?
3. **Leaderboard privacy:** Hall of Growers shows display names + nug totals to all signed-in users — OK or opt-in?
4. **Unlocked features that don't exist yet** (strain library, VPD calculator, breeding DB): build placeholder "Coming soon — unlocked!" pages now, or stub the unlock and leave the feature for later?

Confirm answers (or just say "go phase 1, spotlight, public leaderboard, placeholders") and I'll start building.
