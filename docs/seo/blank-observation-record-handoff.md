# Blank observation record asset handoff

Task: SEO-BLANK-OBSERVATION-RECORD. Status: OPEN, preparation only.

claimed_by: Codex, 2026-10-20 UTC, explicitly assigned by Matthew.
Branch: `codex/seo-blank-observation-record`. Base:
`c0ce65cb37498d346f46ec5d0a5a6c2f21a8da9a` on `verdant-grow-diary`.
Independent acceptance route: Critical Mass; not yet measured.

Closed file plan (all new):

- `public/downloads/blank-observation-record.csv`
- `public/downloads/blank-observation-record.pdf`
- `public/downloads/blank-observation-record-instructions.txt`
- `src/test/blank-observation-record-assets.test.ts`
- `docs/seo/blank-observation-record-handoff.md`

The deploy branch was freshly fetched before starting. Its public tree has no
`downloads` directory or matching blank observation/journal asset. The only public
PDF is the separate `verdant-bud-rot-prevention-checklist.pdf`. The local checkout
was clean. Open PRs and recent PRs were read through authorized GitHub access;
no matching asset implementation was observed. This is an inspected-scope result,
not a global ownership guarantee: the shared fleet registry is unavailable here.

Claude owns `src/constants/verdantSeoContent.ts`, `GuidePage.tsx`,
`staticPublicSeoDocuments.ts` and related SEO integration. None is in this file plan.
Claude will add guide links and replace the existing "not a download" wording.
This task is separate from cultivar schema PR #2259 and Canopy's authenticated PDF
export work. No existing owned file, protected test, dependency, lockfile, workflow,
secret, merge or deployment is in scope. GitHub comments require separate approval;
the new draft PR body and this new document record the task holder without comments.

Prediction: a new contract test will fail before the assets exist, then pass once
the real blank CSV, printable PDF and instructions satisfy the approved field and
local-record contracts. Rendering and CSV parsing will be checked separately.

Next: open the owned draft, implement the three assets and new test, inspect every
PDF page, validate download names, then attach exact-head evidence and Claude's
integration handoff. No production or indexing outcome has been measured.
