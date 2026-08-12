# Spec — Canonical home: resolve the `/` vs `/welcome` split

**Author:** Claude (Knowledge Library & Product Specification Architect)
**Date:** 2026-08-12
**Audited ref:** `origin/verdant-grow-diary` @ `cb98fe4e4`, plus the live site (2026-08-07)
**Parent evidence:** `docs/seo/ahrefs-site-audit-2026-08-07.md` (finding 1, blocker 7 in
`docs/agents/CURRENT_STATE.md`)
**Status:** DECIDED — Cheek selected **Option A** on 2026-08-12 (in-session, to Claude).
Slice 1 is approved and ready for Codex. Slice 2 remains **not approved**; it requires
its own decision after slice 1 verifies live.

---

## Problem statement

The site has one homepage rendered twice.

- `/` renders `RootEntry` (`src/components/RootEntry.tsx`): signed-out → `Landing`,
  signed-in → `Dashboard`, **server → always `loading`**. The component deliberately
  stays on the `loading` surface until after hydration, so the SSR document crawlers
  receive is a skeleton: 7 body words, no `<h1>`, no canonical, zero outgoing links.
- `/welcome` (`src/routes/welcome.tsx`) renders **the same `Landing` component**, SSR'd
  correctly with full head via `staticRouteHead("/welcome")` — 1,019 words, 15 internal
  links, self-canonical.
- Navigation's "home" and every `BreadcrumbList` "Home" item point at `/welcome`
  (52 incoming internal links). Nothing links to `/`. Both URLs are sitemapped.
- After hydration, `Landing` at `/` calls `usePageSeo` with `canonicalPath="/"` — so the
  two copies **each claim to be canonical**, and only `/welcome`'s claim is visible
  without JavaScript.

Consequences measured live 2026-08-07: `/` is simultaneously empty, uncanonicalised and
orphaned; external links to the bare domain land on a page with 7 words; three of the
eighteen Ahrefs issues trace to this single route.

**Why the shell exists (do not regress this):** a returning grower's cached session can
resolve before React's first client render. Committing `landing`/`dashboard` against
server HTML that says `loading` caused a hydration mismatch that silently froze every
landing-origin route transition. The `loading`-until-hydrated gate is the fix for that
bug. Any change here must preserve the byte-identical first-client-pass invariant.

---

## Decision required (Cheek)

**Which URL is the canonical home?**

### Option A — `/` is the canonical home (recommended)

Server renders `landing` instead of `loading` as the fail-closed SSR surface.
`src/lib/rootEntryRules.ts` already documents "the public landing page is the fail-closed
signed-out state" — the SSR pass never has a session, so `landing` is the correct output
of the existing rule. The hydration invariant is preserved with the same technique,
different default: server emits `landing`, first client pass emits `landing`
(byte-identical), signed-in users swap to `dashboard` on the next render.

- **Wins:** domain-root authority — every external link to `verdantgrowdiary.com`
  lands on the page that ranks; kills the duplicate-homepage split; removes three Ahrefs
  issues at the source.
- **Costs:** signed-in growers see one render of the landing page before the dashboard
  swap (today they see a blank spinner for the same interval). And the full URL
  consolidation is expensive: **35 files** in `src/test`, `e2e`, and `scripts` pin
  `/welcome` literals, which is why this spec stages the work (below).

### Option B — `/welcome` stays the canonical home

Root remains an app-entry shell. A server-side redirect `/` → `/welcome` is **not
available**: the server cannot distinguish signed-in growers, and redirecting them
breaks dashboard-at-apex. That leaves a cross-page canonical tag from `/` to
`/welcome` — which Google routinely ignores on thin pages, and which collides with the
documented crash: declaring a canonical in the route's `head()` creates a React-owned
hoistable that `usePageSeo` then mutates, freezing navigation
(`src/test/page-seo-head-ownership.test.tsx` pins the ownership rule). Option B mostly
formalises the status quo and leaves the root orphaned.

**Recommendation: A.** The signed-in cost is a one-render blip for existing users; the
root-authority loss affects every visitor not yet acquired. B is cheaper but does not fix
the measured problem.

---

## Staged implementation (Option A)

Scope discipline: slice 1 fixes the crawler-visible defect without moving any URL.
Slice 2 (the `/welcome` → `/` consolidation) is **not approved by this spec** — it
touches a 35-file pinned surface and needs its own slice after slice 1 is verified live.

### Slice 1 — SSR the landing surface at `/` (Codex)

1. **`src/components/RootEntry.tsx`** — change the pre-hydration/default surface from
   `"loading"` to `"landing"`:
   - server pass renders `<Landing canonicalPath="/" />`;
   - `hydrated === false` renders the same, byte-identical;
   - after hydration, `resolveRootEntrySurface` proceeds exactly as today (signed-in →
     dashboard swap on the next render; `authLoading` may keep a signed-in user on the
     landing surface one render longer — acceptable).
   - Keep the unconditional `Suspense` boundary; the conditional-boundary hydration
     mismatch is a known regression (comment in the file).
2. **`src/lib/rootEntryRules.ts`** — if the surface-selection change lands here rather
   than in the component, keep the function pure and update
   `src/test/root-entry-rules.test.ts` in the same commit.
3. **Canonical ownership** — do **not** add a canonical to `src/routes/index.tsx`
   `head()`. The existing comment explains the crash. `Landing`'s
   `usePageSeo({ canonicalPath: "/" })` already emits the canonical once `Landing`
   SSRs; verify the SSR pass actually renders it into the document head. If
   `usePageSeo` is effect-only (client-only), the canonical must be added through
   whatever mechanism `staticRouteHead` uses for the other 54 routes, and the
   ownership conflict resolved explicitly — hand back rather than work around.
4. **`/` metadata** — the SSR'd root should carry a real title/description. Add a `/`
   document to `STATIC_PUBLIC_OUTPUT_DOCUMENTS` (`src/lib/build/staticPublicSeoDocuments.ts`)
   only if the ownership question in (3) resolves that way; otherwise reuse the existing
   `og/home.png` head entries and let `Landing` own the rest. Either way the postbuild
   head-fidelity gate (`scripts/validate-static-route-head-fidelity.mjs` and the
   seo-manifest comparison) must pass against real SSR output.
5. **No URL changes.** `/welcome` keeps serving; nav, breadcrumbs, sitemap untouched in
   this slice. The interim duplicate-content state is acceptable: `/welcome` remains
   self-canonical and heavily linked; `/` becomes a real page claiming `/`.

### Slice 2 — URL consolidation (separate approval required)

301 `/welcome` → `/`; repoint nav "home"; change the `BreadcrumbList` "Home" item
(`src/lib/cultivarDetailSeo.ts:86,127` and the guide-document definitions in
`src/lib/build/staticPublicSeoDocuments.ts` — 6 `welcome` references); remove `/welcome`
from the sitemap; update the 35 pinned test/e2e/script files. Do not start this slice on
the back of slice 1's approval.

---

## Acceptance criteria (slice 1)

All measured against real SSR responses, not dev-server output:

1. `curl -sS https://verdantgrowdiary.com/` (or the local SSR equivalent) yields:
   ≥1 `<h1>`, ≥300 body words, ≥10 internal `<a href>` targets, exactly one
   `<link rel="canonical" href="https://verdantgrowdiary.com/">`.
2. First client render is byte-identical to server HTML at `/` (no hydration warning;
   the landing-freeze regression suite passes).
3. Signed-in flow: cached-session user at `/` reaches the dashboard with no navigation
   freeze; the swap happens after hydration, never during it.
4. `src/test/page-seo-head-ownership.test.tsx` passes unmodified — if it must change,
   that is a design smell; hand back.
5. Postbuild head-fidelity and sitemap-robots parity gates pass.
6. No new route manifest entry needed (`/` exists); no sitemap change in this slice.

## Test pins that will fire (enumerated, not exhaustive-claimed)

Direct pins on the changed surface — update in the same commit where behavior
legitimately changes; investigate before weakening any assertion:

- `src/test/root-entry-rules.test.ts` — pure-rule table
- `src/test/root-entry-routing.test.tsx` — surface selection & Suspense shape
- `src/test/production-domain-landing.test.ts`
- `src/test/sidebar-access-parity.test.tsx`
- `src/test/page-seo-head-ownership.test.tsx` — must pass **unmodified**
- `src/test/landing-subscriber-funnel.test.tsx` — Landing render count may change at `/`

The wider `/welcome` literal surface (35 files) is slice-2 territory; slice 1 must not
touch it. This repo also pins source text aggressively (source-regex tests break on
whole-file reformatting) — never run Prettier over legacy files wholesale.

---

## Handoff block

```text
HANDOFF
from_agent: Claude
to_agent: Codex (slice 1 implementation; Cheek decided Option A 2026-08-12)
sentinel_version: 2026-08-09.1 (HANDOFF_PROTOCOL.md on origin/verdant-grow-diary)
date: 2026-08-12

completed:
  - Root-cause of the empty `/` document: deliberate loading-until-hydrated gate in
    src/components/RootEntry.tsx (hydration-mismatch fix), not an SSR defect
  - Confirmed /welcome renders the identical Landing component, SSR'd with full head
  - Options analysis and staged implementation spec (this document)
  - Enumerated the directly-pinned test files for slice 1

verified_by:
  - git show origin/verdant-grow-diary:src/components/RootEntry.tsx (surface logic,
    hydration comment)
  - git show origin/verdant-grow-diary:src/routes/index.tsx (head() canonical-crash
    comment), src/routes/welcome.tsx (same Landing component)
  - git show origin/verdant-grow-diary:src/lib/rootEntryRules.ts (fail-closed rule)
  - Live measurements 2026-08-07 in docs/seo/ahrefs-site-audit-2026-08-07.md
  - git grep on origin/verdant-grow-diary for RootEntry/rootEntryRules test pins and
    "/welcome" literals (35 files across src/test, e2e, scripts)

not_done:
  - No implementation (Claude does not implement; slice 1 is Codex's)
  - Slice 2 (URL consolidation) deliberately not specified to implementation depth

unknowns:
  - Whether usePageSeo emits the canonical during the SSR pass or only client-side
    (acceptance criterion 1 forces the answer; step 3 defines both outcomes). NOTE
    (2026-08-12): usePageSeo has moved past the audited ref — 6671ed88c and 4bbf20fb1
    ("preserve/retain route-owned social cards") landed after cb98fe4e4. RootEntry,
    rootEntryRules, both route files, and page-seo-head-ownership.test.tsx are
    byte-unchanged. Codex must read usePageSeo at its implementation tip, not at the
    audited ref
  - Whether Lovable's publish pipeline affects the SSR surface choice (verify on the
    first published build, not just CI)

blocked:
  - Nothing in slice 1. Slice 2 is gated on slice-1 live verification and a separate
    approval

assumptions:
  - The dashboard swap one render after hydration is acceptable signed-in UX; if Cheek
    rejects the landing flash, Option A needs a different masking strategy and this
    spec must be revised, not patched
  - Ahrefs' three root-route findings clear once `/` serves the landing SSR; if the
    crawler still flags it, the residual is the orphan status, which slice 2 addresses

next_slice:
  - Codex: implement slice 1 exactly as bounded above (Option A decided by Cheek,
    2026-08-12); hand back rather than expand if the canonical-ownership conflict
    (step 3) cannot be resolved cleanly

files_touched:
  - docs/seo/root-route-canonical-home-spec.md (this file, new)
  - none in application code
```
