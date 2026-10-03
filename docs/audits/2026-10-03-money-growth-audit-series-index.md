# Money and Growth Audit Series — 2026-10-03

**Audited by:** Claude (Knowledge Library and Product Specification Architect), peer-observation capacity
**Independent review:** Grok, 2026-10-03, provisional (see §3)
**Measured against:** `verdant-grow-diary` deploy tip **`80176ba`** (#1864)
**Owner instruction:** Matthew Cheek asked for the six audit pages to be committed as Markdown so the
independent reviewer can read them from the repository.

This folder entry is an index plus errata. It changes no product code, schema, policy, migration, or
governance file and carries no `Sentinel-Version`. Nothing in it authorizes a Publish, SQL apply,
charge, role or auth change, device control or Action Queue operation. HOLD #1250, the production
database lock and the publishing stop remain in force.

---

## 1. The six audits

Each file below answers three prompts from the agent prompt deck, in the order they were run. Each
ends with an independent-review checklist pinned to `80176ba`.

| File | Prompts | Headline |
| --- | --- | --- |
| [2026-10-03-billing-truth-audit.md](2026-10-03-billing-truth-audit.md) | 21, 23, 43 | Entitlement chain, AI credit metering, memory-chain token cost |
| [2026-10-03-pricing-copy-audit.md](2026-10-03-pricing-copy-audit.md) | 24, 25, 26 | Upgrade moments, Founder Lifetime truth, pricing copy drift |
| [2026-10-03-checkout-export-credits-audit.md](2026-10-03-checkout-export-credits-audit.md) | 27, 28, 29 | Checkout return honesty, Free export boundary, credits visibility spec |
| [2026-10-03-docs-indexation-pillars-audit.md](2026-10-03-docs-indexation-pillars-audit.md) | 30, 31, 32 | Billing docs truth table, indexation matrix drift, pillar readiness |
| [2026-10-03-seo-gate-links-tools-audit.md](2026-10-03-seo-gate-links-tools-audit.md) | 33, 34, 35 | Programmatic SEO gate, guide link graph, public tools as acquisition |
| [2026-10-03-funnel-briefs-validators-audit.md](2026-10-03-funnel-briefs-validators-audit.md) | 36, 37, 38 | Funnel instrumentation, three content briefs, SEO validator gate |

The audits were published first as claude.ai pages and are committed here unchanged in substance.
Substantive errata from Grok's review are recorded in §4 below rather than rewritten into the
pages, so each page keeps its original findings. Wording and citation corrections from the
#1881/#1883 reviews are applied in place and listed in §4a. Rows that §4 supersedes carry a pointer
to it.

## 2. Findings Claude rated FAIL

| # | Finding | Page | Grok's ruling |
| --- | --- | --- | --- |
| 1 | The compatibility billing-environment resolver (`supabase/functions/_shared/unionEntitlementLookup.ts:56-62`) can treat sandbox as expected without an explicit `PAYMENTS_ENVIRONMENT`. AI spend uses the strict resolver and is unaffected. | Billing truth | FAIL by letter; production exposure NOT_MEASURED |
| 2 | Pricing card footnote "Additional slots may open if a purchase is refunded" contradicts the seat model, in which a refunded seat never re-enters the pool (migration `20260719052812`, `FoundersHeroCounter.tsx`, `founders-refund-retire-static.test.ts`). | Pricing copy | FAIL, confirmed |
| 3 | `docs/seo/route-indexation-matrix.md` is stale: its manifest stamp is about two months old and three public routes have no row. | Docs and indexation | FAIL in part; see errata |
| 4 | Every cultivar profile is hard-set to `verificationStatus: "sample"` and indexed with no noindex rule for weak records. | SEO gate | FAIL, refined: review states exist in the type but no record can reach them |
| 5 | Google OAuth signups never emit the `signup` funnel event (`src/pages/Auth.tsx:421` is email-only; line 163 has no emitter). | Funnel | FAIL, confirmed |

## 3. Grok's independent review, as received

Grok's own gate returned `STATUS: BLOCKED — AGENT CONTEXT INCOMPLETE`: `CURRENT_STATE.md` and
`HANDOFF_LOG.md` could not be read through GitHub in that session, and none of the six claude.ai
pages could be opened (Cloudflare JavaScript check). Grok therefore ruled on the five FAILs from
source, treated every page checklist and the PASS-row spot checks as BLOCKED, and marked the
verdict provisional. Grok also noted that this review is not a merge-acceptance PASS for anything;
that seat belongs to Blue Dream, Durban Poison or Critical Mass.

Grok's overall verdict at `80176ba`: **FAIL, provisional.** Four FAILs confirmed (OAuth signup,
refund footnote, cultivar indexing, the matrix in part); the billing resolver FAIL by letter with
production exposure NOT_MEASURED.

Refinements Grok added that Claude accepts:

- The Google button appears on both the sign-in and create-account tabs, so a correct `signup`
  fix must distinguish a first session server-side rather than fire on every OAuth return.
- The email `signup` event fires before verification, so that count includes unconfirmed
  accounts.

## 4. Errata after independent review

Claude re-verified each of Grok's four collisions against source on 2026-10-03.

| Page | Claude wrote | Correction | Evidence |
| --- | --- | --- | --- |
| Docs and indexation | Matrix tip `1c40c21f2` is "not an object" and unresolvable | The commit exists (#558, 2026-07-29). Claude's clone was shallow, so the object was missing locally, not in the repository. The finding becomes "stamp is about two months stale", which was the material point. | `git rev-parse --is-shallow-repository` returned `true`; GitHub commit `1c40c21f2e3d…` |
| Funnel | `FUNNEL_EVENTS` has 30 names | It has 29. Claude's range-based count captured one string outside the array. All 29 have an emitter; that conclusion stands. | `src/lib/funnelAnalytics.ts:32-80` (the array; lines 81-87 are outside it), array parse |
| Funnel | Validators ran on the PR head, not the tip itself | Overturned. CI run 36950533886 ran on the push to `verdant-grow-diary` with head sha `80176bad5c9c…`, conclusion success. `test:legal-seo` and `Lint, typecheck, test, build` PASS on the tip. | GitHub Actions, `ci.yml`, push event |
| Funnel | Acquisition source "cannot be joined server-side" | **NOT_MEASURED** (was GAP). `Auth.tsx` queues the source for both email and Google paths and migration `20260714231627` stores it with an operator snapshot RPC. The remaining gap is narrower: the source is absent from the `funnel_events` table specifically. Whether the join works in production is NOT_MEASURED. | `src/pages/Auth.tsx:96-136, 351-374`; `supabase/migrations/20260714231627_signup_acquisition_attribution.sql` |

### 4a. Follow-up to the #1881 review

Blue Dream reviewed #1881 at `37b0e85d17a58803e3144dea8920f38ee9d26c83` and returned PASS-with-P2
([comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/1881#issuecomment-5966523297)).
This follow-up applies those five wording P2s in place. No verdict changed.

- The attribution erratum above now says NOT_MEASURED literally.
- Each page's legend now defines its labels that sit outside the series vocabulary (document marks,
  archival dispositions, REJECT, UNKNOWN). Ad hoc labels (OBS, NOTE, NONE, NO_BASELINE, CODEX HOLDS)
  were mapped to OBSERVATION, PASS or NOT_MEASURED.
- Rows that §4 supersedes carry a one-line pointer back to §4.
- File and line citations were re-checked with `rg` at deploy tip `08dd55e8`. None of the cited
  source files changed between `80176ba` and that tip. Wrong citations were corrected in place, and
  anything that couldn't be confirmed is marked "(unverified)". Corrections:
  - `src/lib/entitlements/unionEntitlements.ts:49` → `:52-76` (`pickStrongestBilling`).
  - `src/lib/entitlements/types.ts:22` → `:17`.
  - `src/hooks/useMyEntitlements.ts:11` → `:10-13`.
  - `src/pages/CheckoutSuccess.tsx:64` → `:63-64` (`const confirmed =`).
  - The `CheckoutSuccess.tsx` returnTo range, lines 69-80 → 66-82 (the three sanitized URL reads).
  - The billing audit's Staff lift quote ("enforced server-side at the Pro monthly cap") was
    credited to `resolveEntitlements.ts`. It is now cited to `src/lib/entitlements/types.ts:76-82`,
    the `isStaff` comment.
  - `payments-webhook/index.ts` line 316 → lines 313-318.
  - `src/lib/funnelAnalytics.ts:32-87` → `:32-80`.
  - `src/routes/__root.tsx` comment at line 245 → lines 244-253.
  - `Pricing.tsx:70-150` → `:70-164`.
  - The docs-indexation claim that the matrix and manifest were "last touched in the same commit
    (`a695f5d`, 2026-09-30)" is wrong. The matrix was last changed in `16a575129` (#685,
    2026-08-02), and the manifest in `816894ba9` (#1141, 2026-08-26). `a695f5d` touches neither
    file; it was the boundary of a shallow clone.
  - The pricing footer's `Founder.tsx` is now `src/routes/founder.tsx`, which renders
    `src/pages/Founder.tsx`.
  - Bare file names were expanded to full repository paths where they were ambiguous.
- Confirmed unchanged at `08dd55e8`:
  - `src/pages/Auth.tsx:163` and `:421`.
  - `src/pages/Pricing.tsx:823`.
  - `src/constants/strainReferenceLibrary.ts:1019-1020`.
  - `src/lib/cultivarIndexSeoRules.ts:46`.
  - `supabase/functions/_shared/unionEntitlementLookup.ts:56-62`.
  - Migration `20260719052812` lines 31-33, 60-61 and 121-123.
  - The manifest counts: 144 routes, made up of 42 public, 46 auth, 32 operator, 6 internal and
    18 redirects.
  - The three routes missing from the matrix.

## 5. Decisions escalated to Matthew

Collected from the six checklists and Grok's review. None is an agent decision.

1. Founder refunds: reopen refunded seats (database and model change) or rewrite the footnote.
2. Production `PAYMENTS_ENVIRONMENT`: confirm it is explicitly `live`; hardening the compatibility
   resolver touches `supabase/` and needs approval.
3. Cultivar pages: noindex `sample` profiles (today, all ten) or keep them indexed; name who owns the
   human review that moves records to `reviewed` or `verified`.
4. OAuth `signup` event: `Auth.tsx` is auth code and needs approval; decide how a new OAuth user is
   detected and whether the email event should wait for verification.
5. Analytics access: a signed-in GA4 or funnel-table read is needed to size the OAuth undercount
   and every acquisition number in these audits.
6. Indexation matrix refresh: needs an owner (docs only).
7. Raw grow-data backup: Free or Pro (product terms).
8. Memory chain: a keep-latest-N rule for CURRENT_STATE follow-up observations and a per-row
   supersession pass on its Production status section.

## 6. Status

Series status: **complete as peer observations; independent review provisional.** The next step is
Grok re-running the six checklists from these committed files with a full context load, then an
acceptance seat (Blue Dream for any `.tsx` change that follows) for whichever fixes Matthew assigns.
