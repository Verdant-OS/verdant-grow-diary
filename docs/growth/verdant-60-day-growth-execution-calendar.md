# Verdant 60-Day Growth and Subscription Execution Calendar

Status: **HOLD until the measured release is published and live-verified.**

The clock starts at `Day 0` only after the exact reviewed frontend release is
served by `https://verdantgrowdiary.com`. Do not backdate the cohort to a merge,
preview build, content draft, or test session.

Verdant is not selling a generic diary. The promise is:

> Plant memory. Sensor truth. Better decisions.

This calendar turns that promise into a measured path:

```text
qualified visit -> signup -> grow -> tent -> plant -> Quick Log habit ->
CSV history -> cautious AI Doctor value -> paywall -> active paid ->
successful return to value
```

Pheno Hunt is independently owned and intentionally outside this calendar.

## Current evidence snapshot

Evidence refreshed on 2026-07-18:

- Reviewed funnel release: `40657d8a7267e0c13064f7781cb807ac2b17dd8e`.
- Lovable preview: synchronized to that SHA and ready.
- Production: healthy public UI, but still serving the older application
  bundle. The merged release contains `checkout_return_completed` in its
  AppShell chunk and `csv_history_ai_doctor_clicked` in its Tent Detail chunk;
  production does not yet serve those markers.
- Browser smoke: landing, pricing, auth, cultivars, and the signed-out Quick
  Log deep link render with no application console errors or error overlays.
- Latest Lovable analytics snapshot (2026-06-18 through 2026-07-19): 372
  visitors, 1,174 pageviews, 3.16 pages/visit, 193-second average session
  duration, and 72% bounce.
- Leading sources: 344 Direct, 23 Google, and 3 Bing visits, with two visits
  across minor sources. Direct therefore represents roughly 92% of measured
  visitors; source attribution is not yet clean enough for scaling decisions.
- Recent traffic is test-skewed: 338 pageviews on July 16 and 138 on July 18.
  Separate founder, QA, preview, crawler, and automation traffic before using
  the post-publish cohort as a growth baseline.
- The repository already ships 15 data-driven `/guides/:slug` pages plus the
  dedicated grow-stage guide. The first growth job is distribution and
  learning, not recreating pages that already exist.

## Non-negotiable operating rules

1. **Diary first. Sensors second. AI third. Automation last.**
2. Never describe demo, CSV, manual, stale, or invalid readings as live.
3. AI Doctor is cautious. A photo or single reading is evidence, not certainty.
4. Action Queue remains approval-required. No campaign may imply that Verdant
   changes nutrients, irrigation, lighting, or equipment automatically.
5. Community participation is transparent. Disclose the Verdant relationship;
   do not use stealth promotion, impersonation, or context-free link drops.
6. Cronk Nutrients is the founder's documented nutrient line and the first
   evidence priority. Disclose the membership, do not imply universal
   suitability, do not copy proprietary charts, and separate observation from
   recommendation.
7. Creator access must use server-authoritative entitlements and capped AI
   credits. Never promise unlimited AI or let a client grant its own access.
8. Only active, in-period billing truth counts as paid. Leads, accounts,
   clicks, checkout starts, and product activity are not subscribers.
9. External campaign attribution belongs in GA session source/medium/campaign.
   Verdant's operator acquisition snapshot uses a smaller, fixed first-party
   source allowlist; do not pretend it provides creator- or community-level
   attribution.
10. Do not increase acquisition volume while auth, checkout, event integrity,
    or production parity is uncertain.

## Sixty-day targets and definitions

| Outcome                 |         Day-60 target | Definition                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tent/plant creations    |                  500+ | Count only durable `tent_created` and `plant_created` events after successful inserts. Report each event separately as well as combined.                                                                                                                                                                                        |
| Quick Log habit         | More than 3/user/week | Primary target: confirmed `quick_log_saved` events divided by eligible activated growers in the declared seven-day window must be greater than three. Also report the median and share with at least three; that shipped activation proxy is a diagnostic, not the Day-60 target itself. Expect privacy controls to undercount. |
| Active creators         |                     3 | A creator is active only after publishing a real Verdant timeline/One-Tent proof clip with a tracked link—not after accepting access.                                                                                                                                                                                           |
| Free-to-paid conversion |                 3%-5% | New active paid subscriptions divided by new eligible free signups in the same declared cohort. Also report paywall-to-checkout and checkout-to-active-paid diagnostics.                                                                                                                                                        |

Do not report a conversion percentage without its numerator, denominator, and
cohort dates. Treat small samples as directional. Do not change pricing or
paywall copy from fewer than 30 activated free growers or 20 paywall exposures.

## Shipped funnel scorecard

| Stage             | Shipped evidence                                                                   | Operating interpretation                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account           | `signup`                                                                           | Account creation, not activation.                                                                                                                                |
| Setup             | `grow_created -> tent_created -> plant_created`                                    | Each event follows a durable insert and contains no row identifier or grower-entered name.                                                                       |
| Habit             | `quick_log_saved`                                                                  | Count confirmed writes only; use the closed event-type enum and the trailing-seven-day habit proxy.                                                              |
| Import            | `csv_import_started -> csv_import_completed`                                       | An activated import requires `rows > 0`; retain zero-row completions as no-op diagnostics.                                                                       |
| CSV-to-AI handoff | `csv_history_ai_doctor_clicked`                                                    | Explicit imported-history CTA click, not proof that a review started.                                                                                            |
| AI value          | `ai_doctor_review_started -> ai_doctor_result_received -> ai_doctor_session_saved` | Result must pass the contract; value is durable only after the history insert returns a session ID. Historical reviews also emit `historical_ai_review_started`. |
| Commercial intent | `paywall_viewed -> checkout_started`                                               | Interest only. Neither event grants access or counts as revenue.                                                                                                 |
| Paid truth        | `subscription_activated`                                                           | Requires server-resolved paid entitlement and fresh same-device checkout evidence.                                                                               |
| Return to value   | `checkout_return_completed`                                                        | Requires authenticated destination commit and active entitlement; it emits once and consumes the marker.                                                         |

## Go/no-go gates

| Gate                  | Required evidence                                                                                                    | If missing                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| G0 — Published        | Production serves the reviewed marker-bearing bundles; public browser smoke is green; the deployment is identified.  | Hold before Day 0. Do not announce the release.           |
| G1 — Event integrity  | One controlled pass shows each applicable event once, in order, with only allowlisted properties and no IDs/content. | Fix instrumentation before acquiring traffic.             |
| G2 — Seven clean days | Internal/test traffic is separated; source/medium/campaign and funnel counts are comparable for seven full days.     | Extend baseline collection; do not call anomalies growth. |
| G3 — Activation       | Setup completion and the three-Quick-Logs/seven-day proxy can be read by cohort.                                     | Improve onboarding and Quick Log before creator scale.    |
| G4 — Value            | CSV completion, historical AI start, valid result, and durable save can be separated.                                | Fix the broken step; do not move the paywall earlier.     |
| G5 — Revenue          | Paywall, checkout, active paid, and return completion are distinguishable; billing remains authoritative.            | Hold pricing experiments and paid acquisition.            |

## Pre-Day 0 — Publication authorization

This calendar is an operating plan, not authorization to deploy production.
Before Day 0:

1. The founder either clicks **Publish** in Lovable or explicitly authorizes a
   named release operator to publish the exact reviewed release.
2. The authorized operator publishes once and records the deployment receipt.
3. Production must serve the marker-bearing release and pass the public-route,
   mobile, auth-redirect, Founder-counter, and rollback checks.
4. The verified deployment timestamp becomes the Day 0 cohort boundary.

If explicit authorization or any G0 evidence is missing, remain at Pre-Day 0.

## Day-by-day calendar

### Days 0-7 — Prove the release and establish a clean cohort

| Day | Owner                      | Deliverable                                                                                                                                                    | Primary evidence / decision                                                          |
| --: | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
|   0 | Founder + release operator | Freeze the production receipt: deployment, release SHA, verified timestamp, bundle markers, browser smoke, Founder counter, and rollback target.               | G0 must already be green. This receipt defines the cohort boundary.                  |
|   1 | Growth operator            | Create the post-publish measurement sheet. Record visitors, sessions, source/medium/campaign, and every shipped funnel event. Tag founder/QA/preview activity. | No campaign traffic until test traffic is separable.                                 |
|   2 | Product operator           | Run one controlled free-user setup: signup, grow, tent, plant, and first Quick Log. Use non-sensitive test content.                                            | Events occur once, in order, with no identifiers or notes.                           |
|   3 | Product operator           | Complete three confirmed Quick Logs across the controlled trailing-seven-day cohort without replaying writes.                                                  | Verify the habit proxy and event-type allowlist.                                     |
|   4 | Product operator           | Import a small, safe CSV with at least one valid row; also record one duplicate-only/no-op case.                                                               | Separate `rows > 0` activation from `rows: 0` diagnostics.                           |
|   5 | Authorized AI test account | Start a historical AI Doctor review, display a contract-valid result, and save it to history.                                                                  | Start, result, and durable-save events are distinct; no automatic Action Queue item. |
|   6 | Billing operator           | Verify paywall and checkout-start instrumentation using the authorized sandbox/preview flow. Do not create an unapproved live charge.                          | Commercial-intent events do not grant access; active paid remains server truth.      |
|   7 | Founder + analyst          | Review the first seven days for duplicate events, missing steps, bot/internal skew, auth errors, and checkout errors.                                          | Pass G1; continue collecting until G2 if the cohort is not clean.                    |

### Days 8-15 — Use the content already shipped

| Day | Owner            | Deliverable                                                                                                                                                                                                         | Primary evidence / decision                                                       |
| --: | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
|   8 | SEO operator     | Reconcile the 16 shipped guide pages with the old 30-day queue. Mark each as shipped, refresh, merge, or defer.                                                                                                     | Do not create a duplicate article for an existing guide.                          |
|   9 | SEO operator     | Inspect sitemap/canonical/indexing status for `/guides`, the grow-diary guide, VPD guide, AI Doctor guide, and Cronk guide.                                                                                         | Fix crawl/indexing defects before adding more pages.                              |
|  10 | Founder          | Record Episode 1 proof: paper/app fragmentation versus one Verdant plant timeline. Capture a clean ten-second screen segment.                                                                                       | CTA: start free; track GA campaign attribution.                                   |
|  11 | Founder          | Record Episode 2 proof: a tired grower completing Quick Log in roughly 30 seconds.                                                                                                                                  | CTA lands on the existing Quick Log/start path; watch signup and first-log rates. |
|  12 | Founder          | Record Episode 3 proof: source-labeled temperature, humidity, VPD, and soil context without claiming fake live data.                                                                                                | Measure qualified visits and setup completion, not views alone.                   |
|  13 | Founder          | Capture a real Cronk feed evidence set: line/product, stage, medium, recipe reference, input EC/pH, runoff when available, photo, and later plant response.                                                         | Facts are attributable; weak evidence does not trigger aggressive advice.         |
|  14 | Content operator | Review the Cronk guide against that evidence and current manufacturer instructions. Ensure a clear founder membership/relationship disclosure is visible before any promotion, even if no other guide copy changes. | No copied chart artwork and no universal feeding claim.                           |
|  15 | Analyst          | Compare the first three proof assets and top five guides by qualified visit -> signup -> setup -> first Quick Log.                                                                                                  | Choose one owned-content winner; do not optimize from raw pageviews.              |

### Days 16-30 — Helpful community participation and Cronk priority

| Day | Owner             | Deliverable                                                                                                                                         | Primary evidence / decision                                                  |
| --: | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
|  16 | Founder           | Read and record current promotion rules for the selected Reddit/Discord communities. Prepare a plain affiliation disclosure.                        | No post if contextual links or founder participation are prohibited.         |
|  17 | Founder           | Answer one real grower question helpfully without a Verdant link.                                                                                   | Establish contribution quality before attribution.                           |
|  18 | Founder           | When genuinely relevant and allowed, share one source-labeled timeline or guide with explicit Verdant affiliation.                                  | Track qualified downstream behavior; no stealth promotion.                   |
|  19 | Content operator  | Distribute the AC Infinity and Spider Farmer history guides to hardware-relevant audiences without implying official integration or device control. | Watch CSV starts/completions and hardware-guide assisted signups.            |
|  20 | Founder           | Publish Episode 4: “Bring your grow history” CSV import demonstration. Avoid the external phrase “Trojan Horse.”                                    | CTA: free import; measure start -> rows>0 completion.                        |
|  21 | Founder           | Publish Episode 5: cautious AI Doctor using photo, stage, diary, and sensor context.                                                                | Measure accepted review start -> valid result; no one-photo certainty.       |
|  22 | Founder           | Publish Episode 6: pH/EC and Cronk feed logging—what the meters and plant actually showed.                                                          | Measure Cronk-guide visits, setup, Quick Log, and CSV/AI assists.            |
|  23 | Product operator  | Review user-visible empty/error states encountered in the first cohort. File only evidence-backed defects.                                          | Fix blockers before cosmetic conversion experiments.                         |
|  24 | Creator operator  | Build a ten-creator fit list from audience relevance, evidence-minded cultivation, and willingness to show real workflow.                           | Do not rank solely by follower count.                                        |
|  25 | Founder           | Send five transparent creator invitations with a ten-second read-only timeline proof and capped creator access offer.                               | Record sent, replied, trial started, and published separately.               |
|  26 | Creator operator  | Follow up once with non-responders and onboard responders through the actual One-Tent Loop.                                                         | No mass automation or undisclosed sponsorship.                               |
|  27 | Founder           | Send Cronk a concise plant-memory collaboration brief using the real evidence package and shipped guide.                                            | Request permission for any logo, quote, or chart reference.                  |
|  28 | Founder           | Offer a community Q&A or office-hour only where moderators explicitly approve it.                                                                   | Questions answered and qualified sessions matter; attendance alone does not. |
|  29 | Analyst           | Compare GA external channels with Verdant's fixed first-party acquisition surfaces. Report both without joining them into false precision.          | Identify the best source by activation, not traffic.                         |
|  30 | Founder + analyst | Thirty-day checkpoint. Retain the winning owned/community motion, pause misleading sources, and decide whether G2-G4 passed.                        | No broad paid traffic yet. Preserve the Day-60 targets.                      |

### Days 31-45 — Creator proof as the on-screen intelligence layer

| Day | Owner               | Deliverable                                                                                                                                                      | Primary evidence / decision                                        |
| --: | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
|  31 | Creator operator    | Select up to three pilots from actual responders. Grant only server-authorized creator access with capped AI credits.                                            | Access acceptance is not an active creator.                        |
|  32 | Creator operator    | Run a 30-minute onboarding through Grow -> Tent -> Plant -> Quick Log -> Timeline.                                                                               | Pilot reaches first durable Quick Log.                             |
|  33 | Creator 1           | Capture a ten-second timeline/sensor proof clip for a real weekly update.                                                                                        | Source labels and “read-only/grower decides” remain visible.       |
|  34 | Founder             | Publish Episode 7: Cronk chart adherence versus this plant's response.                                                                                           | No manufacturer-chart replacement; link to the Cronk guide.        |
|  35 | Founder             | Publish Episode 8: alert -> suggested action -> explicit grower approval -> later response log.                                                                  | Never imply automatic execution.                                   |
|  36 | Creator 1           | Publish the first pilot integration with a tracked link and clear relationship disclosure.                                                                       | First active creator; measure activated growers.                   |
|  37 | Creator 2           | Publish or schedule the second pilot integration.                                                                                                                | Compare audience quality using setup and Quick Log, not clicks.    |
|  38 | Founder             | If Cronk explicitly collaborates and permission exists, publish the Cronk evidence case study; otherwise publish the founder-owned version without brand assets. | Measure guide -> setup -> logging/AI assist.                       |
|  39 | Content operator    | Publish a short CSV import walkthrough tied to existing supported behavior. Do not claim unsupported vendor mappings.                                            | Import starts, rows>0 completion, and no-op/error reasons.         |
|  40 | Conversion operator | Review the manual conversion worklist for explicit pricing/checkout interest. Draft outreach; send only after operator review.                                   | No background sender, entitlement grant, or reserved Founder spot. |
|  41 | Analyst             | Build creator cohorts in GA from tracked links and compare through first Quick Log and AI value.                                                                 | Preserve sample sizes and uncertainty.                             |
|  42 | Founder + analyst   | Weekly review: creator replies, trials, active creators, setup, Quick Log habit, CSV activation, and durable AI saves.                                           | Pause a creator motion that produces clicks but no activation.     |
|  43 | Creator 3           | Publish or schedule the third pilot integration.                                                                                                                 | Three active creators only when all three proof clips are public.  |
|  44 | Product operator    | Conduct three short activated-grower interviews focused on what was confusing before first value.                                                                | Convert repeated evidence into a ranked friction list.             |
|  45 | Founder             | Creator-phase checkpoint and Episode 9: post-grow learning and what to repeat, avoid, adjust, or monitor next run.                                               | G3-G4 must be readable before conversion scale.                    |

### Days 46-60 — CSV history to durable AI value and paid conversion

| Day | Owner               | Deliverable                                                                                                                            | Primary evidence / decision                                                          |
| --: | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
|  46 | Founder             | Launch the “Bring your grow history” campaign across the best proven owned channel.                                                    | Qualified visit -> CSV start -> rows>0 completion.                                   |
|  47 | Content operator    | Refresh the AC Infinity import/history walkthrough from real supported inputs.                                                         | No claim that Verdant controls or continuously syncs the device.                     |
|  48 | Content operator    | Refresh the Spider Farmer history walkthrough from real supported inputs.                                                              | Same source-truth and read-only fence.                                               |
|  49 | Content operator    | Create a TrolMaster/AROYA page only if current product support and query evidence justify it; otherwise improve the generic CSV guide. | No speculative compatibility page.                                                   |
|  50 | Product operator    | Review CSV failure/no-op reasons and improve guidance for the top reproducible friction only.                                          | Raise rows>0 completion without weakening validation.                                |
|  51 | Founder             | Publish Episode 10: the complete One-Tent Loop ending in plant memory—not device control.                                              | Measure full path and return to value.                                               |
|  52 | Content operator    | Publish the safety explainer: why imported history plus cautious AI is better than one-photo certainty.                                | AI start -> valid result -> durable save.                                            |
|  53 | Conversion operator | Review paywall timing by cohort. Change nothing unless value precedes paywall and the sample floor is met.                             | Durable AI value -> paywall view.                                                    |
|  54 | Product operator    | Prepare one narrow onboarding or paywall experiment from the strongest evidence.                                                       | One variable, declared success metric, rollback ready.                               |
|  55 | Conversion operator | Send operator-reviewed follow-up only to explicit checkout-interest leads.                                                             | Manual send and manual log; no automatic outreach.                                   |
|  56 | Creator operator    | Recut the strongest creator proof into one owned short with permission and disclosure.                                                 | Compare creator-assisted activation with owned content.                              |
|  57 | Founder             | Record the follow-up Cronk plant response and next-run decision.                                                                       | Observation -> response -> grower-chosen repeat/avoid/adjust/monitor.                |
|  58 | Analyst             | Read the full cohort: signup, setup, habit, CSV, AI value, paywall, checkout, active paid, and return.                                 | Report counts, denominators, dates, and uncertainty.                                 |
|  59 | Founder + analyst   | Decide what to scale, repair, or stop for the next 60 days. Paid acquisition is eligible only if G0-G5 are green.                      | Spend follows proven activation and paid truth.                                      |
|  60 | Founder             | Publish the 60-day retrospective against all four original targets and archive the evidence.                                           | Keep the goal open if any target is unproven; do not substitute clicks for outcomes. |

## Weekly operating review

Every seven days, record:

1. Production deployment SHA and health status.
2. Visitors and sessions by GA source/medium/campaign, with internal/test notes.
3. Funnel event counts and stage-to-stage rates, including zero-row CSV imports.
4. Activated growers using the three-Quick-Logs/seven-day proxy.
5. Active paid truth, not accounts or checkout starts.
6. Active creator count using the publication definition.
7. Top three grower frictions and evidence source.
8. Safety incidents: mislabeled telemetry, overconfident AI, secret exposure,
   unauthorized entitlement, automatic outreach, or non-approved actions.
9. One continue, one change, and one stop decision for the next week.

## Stop conditions

Immediately pause promotion when any of these is true:

- production no longer matches the identified release;
- auth, checkout, billing entitlement, or account deletion has a critical error;
- duplicate or sensitive analytics properties appear;
- invalid/stale/demo data is shown as healthy or live;
- AI Doctor implies certainty without context;
- an Action Queue or device action occurs without explicit grower approval;
- a creator or community post lacks the required relationship disclosure;
- the Founder counter or paid truth cannot be verified;
- the data is too contaminated to distinguish acquisition from testing.

Rollback first, learn second, and resume only after the failed gate is green.
