# Verdant × Hardware Partners — Marketing Brief

Hardware-neutral. Zero-control. Ready for partner conversations.
Versioned here so claim hygiene stays reviewable next to the code that
enforces it (action-queue safety suite, Sensor Truth tests, phenoid
claim-hygiene tests). Ground-truth verified 2026-07-22: `co2_ppm` and
`soil_moisture_pct` are typed ingest metrics with unit validation;
stuck-reading detection exists (action-outcome evidence rules + CSV
import gates).

## 1. Core positioning

**One-liner (use everywhere):**
"Hardware collects the data. Verdant turns it into plant memory and
grower-approved decisions."

Verdant is the hardware-neutral plant-memory layer for serious growers. We
never sell sensors, never take control of equipment, and never compete with
the partner's app. We accept sensor data, stamp every reading with its true
source and quality, and turn that data into a durable diary, environment
history, and cautious, approval-required guidance. The partner's hardware
stays the control plane.

## 2. Partner value proposition

| What the partner gets | Why it matters |
|---|---|
| Higher retention of their hardware users | The diary becomes the reason the grower keeps the sensors online. |
| Zero liability | Verdant never writes to equipment. No setpoints, no irrigation commands, no auto-actions. |
| Clean co-marketing story | Once continuous live is verified: "Works with Verdant plant memory." |
| Differentiated positioning | Against pure controller apps that try to own the grower relationship. |
| Future revenue path | Referral fees, co-selling, or modest revenue share on attributed active users. |

**Key sentence for every partner deck:** "Your hardware stays the control
plane. We only make the data memorable and the decisions better documented."

## 3. Current readiness matrix (honest)

| Provider / path | Can say today | Cannot say yet |
|---|---|---|
| EcoWitt | We accept and clearly label your temp, RH, soil, CO₂ data. Source, timestamp, and quality stay visible. Strong dry-run and Sensor Truth tooling exists. | Live continuous sync / streaming |
| SensorPush, Pulse, AC Infinity, AROYA, TrolMaster, etc. | Architecture is hardware-neutral, via the same generic bridge contract, designed to accept and label data from your sensors once the verified path is live. | "Works with" or live integration claims |
| CSV / manual | Fully supported as clearly labeled paths | — |
| Home Assistant / MQTT / ESPHome | Generic bridge concepts preserved; same "accept + label" language | Continuous live claim |

Active physical direction is EcoWitt-first. All other named brands remain
backlog / observe-only until adapters and full verification exist.

## 4. Exact claim hygiene (stop-ship language)

**Safe today — use freely:**
- "We accept and clearly label your temp, RH, soil moisture, and CO₂ data."
- "Source, timestamp, and quality stay visible on every reading."
- "Hardware collects the data; Verdant turns it into plant memory."
- "Architecture is hardware-neutral and designed for your sensors."
- "Your app and equipment remain the sole control plane."

**Forbidden until the full verified continuous path exists:**
- "Live continuous sync / streaming / real-time connection"
- "Connected and controlling"
- "AI grows with your hardware"
- Any implication that a dry-run, CSV, or manual reading is live telemetry
- Any claim of device control, auto-setpoints, or irrigation commands

## 5. First-call pitch structure

1. Open with the one-liner and the zero-control guarantee.
2. Show Sensor Truth — source labels, invalid/stuck detection, never invent
   or upgrade data.
3. Show the value — temp/RH becomes trustworthy VPD context + a permanent
   plant timeline the grower keeps.
4. Demonstrate seriousness — dry-run tooling, suspicion rules, and the fact
   that we refuse to claim "live" until the path is proven.
5. Close with the clear path to "Works with Verdant" once the continuous
   live bar is cleared.
6. Ask for a technical dry-run or sample payload — not a commercial
   commitment yet.

## 6. Liability shield (every deck)

"Verdant never sends commands to hardware. Every environmental or feed
suggestion is advisory and requires explicit grower approval. Your app and
your equipment remain the sole control plane. We only make the data
memorable and the decisions better documented. Grower data stays with the
grower."

## 7. Sequencing

| Phase | Action |
|---|---|
| Now | Open EcoWitt (and similar) conversations with the "accept + label + plant memory" pitch. Share dry-run and Sensor Truth tooling as proof of seriousness. |
| After first verified continuous live path | Unlock "Works with Verdant" badge, co-marketing assets, media kit, revenue-share discussions. |
| Never | Promise live continuous or device control to close a conversation early. |

## 8. Biological value (deck paragraph)

Clean, source-labeled environment data turns a one-off reading into lasting
plant memory. For autoflowers and serious craft growers, stable, trustworthy
VPD and root-zone history is the difference between a recovery plan that
works and one that damages the plant. (Live proof point: AI Doctor
deterministically withholds feed guidance until root-zone history exists.)
When the hardware's data is permanently attached to the diary with its true
quality label, the grower has a reason to keep that hardware online for
every future run.

## 9. Non-negotiables for any marketing asset

- Sensor Truth source labels must remain visible in every screenshot.
- No mock "live" dashboards implying continuous connection before it exists.
- No ranking or AI screenshots that claim the software picks winners.
- Every partner deck must contain the zero-control sentence.
- PhenoID ranking language stays "advanced shortlist of your own scores"
  until real plan_ids exist (enforced by test).
- Before any deck screenshots a CO₂ card, confirm which surface renders CO₂
  — acceptance + provenance is live; a mocked CO₂ dashboard would violate
  the second bullet.

## 10. How this feeds monetization

Strategy 2 in the overall monetization plan: make partner hardware more
valuable to the grower, drive high-intent users into the free One-Tent Loop,
then into paid PhenoID / plant-memory add-ons. Partner revenue (referral,
co-sell, certification) without competing with the partner or adding
automation risk.
