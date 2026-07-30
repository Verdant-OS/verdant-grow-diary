# Lighting cluster internal-link map

## Release status

This is the approved **20-link implementation map**, not a claim that the links are already mounted. The two new lighting pages and their shared registry entries are held behind open PR #560’s `verdantSeoContent.ts`/sitemap overlap. No public page should link to an unmounted URL.

## Contextual links to implement after registry resolution

| #   | From visible context                      | To                            | Anchor / purpose                                               | Status                    |
| --- | ----------------------------------------- | ----------------------------- | -------------------------------------------------------------- | ------------------------- |
| 1   | Guides index lighting card                | Lighting pillar               | “Grow light distance, PPFD, DLI, and schedules”                | Pending route publication |
| 2   | Stage-care environment section            | Lighting pillar               | “Measure light at the canopy before changing distance”         | Pending route publication |
| 3   | Hardware integrations measurement section | PPFD canopy-map guide         | “Make a source-labeled canopy map”                             | Pending route publication |
| 4   | VPD calculator result context             | Light-stress guide            | “Compare heat/light context before changing several variables” | Pending route publication |
| 5   | Public Quick Log starter help             | Light-change checklist        | “What to log after a fixture or schedule change”               | Pending route publication |
| 6   | Generic plant-care FAQ stress answer      | Light-stress guide            | “Compare light, heat, and root-zone context”                   | Pending route publication |
| 7   | Lighting pillar PPFD section              | PPFD canopy-map guide         | “Make a repeatable canopy map”                                 | Pending route publication |
| 8   | Lighting pillar schedule section          | Autoflower schedule guide     | “Compare an autoflower schedule with DLI context”              | Pending route publication |
| 9   | Lighting pillar symptom section           | Light-stress guide            | “What to log before reacting”                                  | Pending route publication |
| 10  | Lighting pillar workflow section          | Quick Log                     | “Log the baseline and one change”                              | Pending route publication |
| 11  | PPFD canopy-map guide source section      | Hardware integrations         | “Understand sensor and meter source labels”                    | Pending route publication |
| 12  | PPFD canopy-map guide environment section | VPD calculator                | “Put air temperature and RH beside the light record”           | Pending route publication |
| 13  | PPFD canopy-map guide workflow section    | Quick Log                     | “Save the map source and change time”                          | Pending route publication |
| 14  | Autoflower schedule guide dose section    | Lighting pillar               | “Calculate the schedule’s daily light context”                 | Pending route publication |
| 15  | Autoflower schedule guide change plan     | Light-change checklist        | “Keep one change at a time”                                    | Pending route publication |
| 16  | Autoflower schedule guide CTA             | Quick Log                     | “Attach the timer change to the plant history”                 | Pending route publication |
| 17  | Light-stress guide differential           | Lighting pillar               | “Verify PPFD, DLI, distance, and coverage”                     | Pending route publication |
| 18  | Light-stress guide heat context           | VPD calculator                | “Check measured temperature/RH context”                        | Pending route publication |
| 19  | Light-stress guide evidence gap           | AI Doctor readiness explainer | “See what cautious context collection requires”                | Pending route publication |
| 20  | Light-change checklist                    | Quick Log                     | “Record the baseline now”                                      | Pending route publication |

## Existing relevant links retained

- Guide hub already links to every registered guide and the stage-care guide.
- Data-driven guides already provide a stable path to the guide hub, welcome, pricing, Quick Log, and public demo where those destinations make sense.
- Stage-care already links to generic care and the VPD calculator.

## Guardrails

- Do not link an anonymous educational page directly to a protected plant, timeline, report, or sensor route.
- A signed-in continuation can say “open the plant timeline” only after access is resolved; the public link should remain `/quick-log` or another public handoff.
- Anchor text should identify the next task, not say “click here.”
- Add each link where it helps the reader’s immediate decision, not as a footer keyword list.
