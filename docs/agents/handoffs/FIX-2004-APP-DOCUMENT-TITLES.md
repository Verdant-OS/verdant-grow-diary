# FIX-2004-APP-DOCUMENT-TITLES

```text
TASK FIX-2004-APP-DOCUMENT-TITLES  priority: other  status: CLOSED
closed: merged. #2082 merged into verdant-grow-diary on 2026-10-14 as 204330ae197295db376a4e9a9b55e90c71d7b3fb (final SHA; first-parent commit on origin/verdant-grow-diary, read 2026-11-11; merge date from the GitHub search API). Closed by Claude session_017UoYKuyQKXVV93JSwJJztt on 2026-11-11 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLOSE-STALE-HANDOFF-BLOCKS-20261111.md.
goal: Give the signed-in routes named in #2004 a page-specific document title without usePageSeo canonical/OG/robots tags, and reapply that title after usePageSeo's unmount reset.
branch: cursor/app-page-document-titles-89ef
base: verdant-grow-diary
checkout: git fetch origin cursor/app-page-document-titles-89ef verdant-grow-diary && git switch cursor/app-page-document-titles-89ef && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2082 (draft)
head_sha: df7da15c4a2712ee20771926f3fcdcec79abe9c1 (parent of the commit that records this URL)
state: pushed draft
next_action: required checks and independent review. Stay draft. No ready, merge, or deploy.
files: src/lib/appDocumentTitleRules.ts; src/components/AppDocumentTitle.tsx; src/routes/_app.tsx; src/test/app-document-title.test.tsx
blockers: none for the repository change
artifacts: PR body
reviewer_seat: Blue Dream (route layout .tsx) and Critical Mass (rules and tests)
claimed_by: cursor cloud agent, 2026-10-14
last_updated: 2026-11-11, by Claude session_017UoYKuyQKXVV93JSwJJztt (close-out; previous 2026-10-14 01:10 CT, by Grok)
```
