# SEO-META-DESCRIPTION-LENGTH

```text
TASK SEO-META-DESCRIPTION-LENGTH  priority: P3  status: OPEN

goal: Every indexable public page and SEO guide has a meta description of 160 characters or fewer, so search results show a whole sentence instead of a cut-off one.
why: Ahrefs site audit (2026-11-23) flagged 16 indexable pages with descriptions over 160 characters. Matthew, 2026-11-23: "Okay to shorten meta descriptions." This is a snippet and click-through fix. It is not an indexing fix: no technical indexing block was found on the site, and the noindex cultivar sample pages are noindex by design.
branch: claude/seo-meta-descriptions-160
base: verdant-grow-diary @ 9c7339428d125d035a220cf3c0ca16bcb37099f1
checkout: git fetch origin claude/seo-meta-descriptions-160 verdant-grow-diary && git switch claude/seo-meta-descriptions-160
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3064
head_sha: see PR #3064 (live head; not pinned here)
state: Open PR under review. 10 guide descriptions and 7 static page descriptions shortened (17 pages: Ahrefs' 16 plus /breeder-beta at 199, which the new test would otherwise fail on). Client usePageSeo copy matches the static text for every changed page except /tools/vpd-calculator, whose pre-existing client (156) vs static (151) split is documented below. New test src/test/indexable-meta-description-length.test.ts.
current_step: In independent exact-head review. Any new head needs a new exact-head review.
next_action: Reviewer seat reviews the exact head for meaning and honesty of the new copy. Merge only through the Merge Steward with Matthew's per-item yes.
post_merge_check: View source on /guides/how-to-start-a-grow-journal and /breeder-beta after deploy; the meta description matches the new text and is 160 characters or fewer. NOT_MEASURED until done.
active_writer: Claude (Taproot thread)
decisions:
- 2026-11-23 Matthew: "Okay to shorten meta descriptions." Scope kept to guide and help copy. Homepage and /terms not touched (both already 160 or fewer on base).
- /tools/vpd-calculator: the client usePageSeo description already differed from the static one on base. Both shortened; they still differ. Unifying them is out of scope.
- No existing test edited.
tried_and_rejected:
- Editing the ac-infinity-data-logging guide description: open PR #3056 owns that text.
files_touched: src/constants/verdantSeoContent.ts; src/lib/build/staticPublicSeoDocuments.ts; src/constants/publicQuickLogStarterCopy.ts; src/pages/HardwareIntegrations.tsx; src/pages/CreatorBeta.tsx; src/pages/BreederBeta.tsx; src/pages/PhenoExpressionShowcase.tsx; src/pages/PublicVpdCalculator.tsx; src/test/indexable-meta-description-length.test.ts (new); this handoff (new)
files_remaining:
- none
blockers:
- Local vitest BLOCKED (package install refused by the proxy; node_modules missing `pathe`). The new test and the pure-data copy tests were run with bun test as a stand-in; CI is the real run.
- Collision: PR #3056 sets the ac-infinity-data-logging description to about 178 characters. Whichever merges second fails the new length test until that description is 160 or fewer.
open_questions:
- Search Console's failed validation for the unindexed pages is NOT_MEASURED; nobody here can open Search Console.
gotchas:
- Two sources must stay equal: the static document description and the page's usePageSeo description (verdant-guides-glossary-head-invariants checks the guide pair).
```
