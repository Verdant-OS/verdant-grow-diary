# Lighting cluster internal-link map

## Release status

PR #595 is merged, and both lighting routes are live on `https://verdantgrowdiary.com`. The public
verification at `2026-07-31T19:18:39.6233761Z` returned HTTP 200 for both pages; each canonical URL
appears exactly once in the 51-URL sitemap. Production manifest
`92d8330af90d983d3bcc1ad7507028505b8b14d8` contains the lighting release and analytics repair.
The newer deploy head differs only in SEO monitoring files, so no additional production publish is
required for the link inventory below.

## Implemented contextual links

The registry contains **28 unique source-to-target relationships** where either the source is one
of the two lighting pages or the target is one of those pages. The focused test collapses duplicate
placements such as a section link plus a related-guide link before asserting the count.

| Source                                               | Contextual targets                                                                                                                                                | Unique pairs |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------: |
| `cannabis-grow-light-distance-and-schedule`          | Light-stress guide, plant-care FAQ, daily checklist, VPD tracker, stage-care guide, sensor truth, journal guide, hardware integrations, Quick Log, VPD calculator |           10 |
| `cannabis-light-stress-light-burn-bleaching-or-heat` | Lighting pillar, nutrient evidence guide, plant-care FAQ, daily checklist, VPD tracker, sensor truth, journal guide, Quick Log                                    |            8 |
| `grow-room-vpd-tracker`                              | Lighting pillar and light-stress guide                                                                                                                            |            2 |
| `sensor-truth-grow-room`                             | Lighting pillar and light-stress guide                                                                                                                            |            2 |
| `cannabis-plant-care`                                | Lighting pillar and light-stress guide                                                                                                                            |            2 |
| `what-to-log-in-a-grow-journal`                      | Lighting pillar and light-stress guide                                                                                                                            |            2 |
| `daily-grow-log-checklist`                           | Lighting pillar and light-stress guide                                                                                                                            |            2 |
| **Registry total**                                   |                                                                                                                                                                   |       **28** |

Additional contextual placements are present but excluded from the automated 28-pair count:

- The public `/guides` hub has a lighting-decision card linking to both pages.
- A matched Operator Mode diary entry links to both pages from the read-only troubleshooting card.
- The true no-entries timeline state links to the lighting baseline guide.

## Anchor and placement rules used

- Setup anchors describe the next measurement: distance, PPFD, DLI, schedule, or source labeling.
- Stress anchors describe the comparison: excess light, bleaching, heat, and root-zone or nutrient
  look-alikes.
- Workflow anchors lead to public Quick Log, a relevant public tool, or another public guide.
- Links sit beside the decision they help with; they are not a keyword footer.
- Anonymous pages never link directly to protected plant, timeline, report, or sensor routes.

## Validation contract

`src/test/lighting-seo-cluster.test.ts` requires at least 20 unique contextual pairs and verifies
that each of the five refreshed pages links to both new lighting pages.
