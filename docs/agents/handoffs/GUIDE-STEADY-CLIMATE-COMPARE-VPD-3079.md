# GUIDE-STEADY-CLIMATE-COMPARE-VPD-3079

```text
TASK GUIDE-STEADY-CLIMATE-COMPARE-VPD-3079  priority: P3  status: OPEN
goal: /guides/steady-climate-multiple-grow-tents tells growers how to compare VPD between tents. Add one H2 "Compare VPD for each tent" and one FAQ, as issue #3079 approves.
why: the guide says to measure each tent on its own but gives no method to compare VPD between tents. Cheek approved one section and one FAQ on 2026-11-24 (issue #3079).
fix: STEADY_CLIMATE_GUIDE in src/lib/publicGrowGuideArticles.ts gets a fifth section (id compare-vpd-each-tent) at the end of sections[] and a fifth FAQ entry. The shared presenter renders "Keep the record in Verdant" after all sections, so the new H2 sits directly before it. FAQPage JSON-LD and the crawlable fallback read the same object. Presenter unchanged.
branch: posthog-self-driving/docsguides-add-per-tent-vpd-comparison-fd9047
base: verdant-grow-diary at 9c844347c691090eb56ecfa1b6eb63398d03e742
pr: draft PR from the branch above; its body carries the head SHA.
state: committed and pushed; draft PR open
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this; (3) Cheek's own [YES] as cheekhimself at the exact head SHA; (4) Merge Steward queues. Cheek decides what happens to PR #3074, which overlaps this section.
post_merge_check: once live /version.json reports the merge SHA, open /guides/steady-climate-multiple-grow-tents signed out; expect the H2 "Compare VPD for each tent" directly before "Keep the record in Verdant", links to /tools/vpd-calculator and /vpd-chart, and the new FAQ in the FAQ list and the FAQPage JSON-LD.
decisions: (1) Copy is the issue's approved text, word for word, except the two inline Markdown links: the guide model has plain-text paragraphs, so "VPD calculator" and "VPD chart by growth stage" render through the section's links[] (same labels, same targets). (2) Product claims checked against code: per-tent VPD stability (vpdStabilityInputRules, EnvironmentStabilityCard on Tent detail and Sensors) and the Quick Log snapshot strip with its source badge (QuickLogSensorSnapshotStrip). No side-by-side tent view is claimed. (3) PR #3074 is not reused, because it adds sections the issue excludes.
not_in_scope: plant-to-tent history, the veg-to-flower move, a second FAQ, presenter or SEO head changes, PR #3074.
tests: new src/test/steady-climate-compare-vpd-section.test.tsx (5 tests). RED at base 9c844347 (5 failed of 5), GREEN with the fix. Targeted run: 5 files, 249 passed.
commands: bunx vitest run src/test/steady-climate-compare-vpd-section.test.tsx src/test/public-grow-guide-articles.test.tsx src/test/static-public-seo-documents.test.ts src/test/verdant-seo-sitemap-robots.test.ts src/test/verdant-seo-guides-public-links.test.tsx --reporter=dot ; bun run typecheck
files_touched: src/lib/publicGrowGuideArticles.ts; src/test/steady-climate-compare-vpd-section.test.tsx; this file
files_remaining: none for this slice
gotchas: this cloud box had no bun on PATH; bun 1.3.14 (the CI pin) was fetched as a tool into /tmp, then bun install --frozen-lockfile succeeded. bun.lock unchanged.
blockers: none for the code; merge waits on the gates in next_action.
reviewer_seat: not yet requested. The reviewer must not have authored or repaired this change.
reviewer_sha: none yet
session_state: no routines, no paused workflows, no PR comments posted. Pending human decisions: Cheek's merge yes; the fate of PR #3074.
claimed_by: Claude (PostHog self-driving task session), 2026-11-24
owner: Claude (PostHog self-driving task session)
last_updated: 2026-11-24, by Claude (PostHog self-driving task session)
```
