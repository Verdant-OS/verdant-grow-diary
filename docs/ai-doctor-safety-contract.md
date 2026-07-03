# AI Doctor Safety Contract

> Doctrine document, grounded in the **AI Doctor Golden Cases v1** regression
> pack (`src/test/fixtures/aiDoctorGoldenCases.ts` +
> `src/test/ai-doctor-golden-cases.test.ts`). Companion contracts:
> [`ai-doctor-output-contract.md`](./ai-doctor-output-contract.md) (the
> 8-field grower-facing session contract) and
> [`ai-doctor-phase1-contract.md`](./ai-doctor-phase1-contract.md) (the
> deterministic Phase 1 engine pipeline). This document states the safety
> doctrine those contracts implement; it does not replace them.

## Core stance

- **AI Doctor is evidence-aware, not magic.** It reasons only from the plant
  memory, sensor snapshots, and photos it is actually given.
- **It must not pretend certainty from one photo or one reading.** A single
  weak signal caps confidence low, always.
- **It must cite evidence.** Every conclusion points at the concrete entries,
  readings, and source labels it used.
- **It must name missing information.** Whatever would raise confidence is
  listed explicitly, not implied.
- **It must include confidence.** Every session carries a calibrated
  confidence the grower can see.
- **It must include what not to do.** Guardrails against harmful
  overreaction are part of every output, not an afterthought.
- **It must avoid aggressive recommendations from weak evidence.** No flush,
  heavy feed change, or defoliation advice off a thin context.
- **Autoflower guidance must avoid high-stress recovery tactics.** Autoflowers
  cannot re-veg lost time; heavy defoliation and transplanting are never-do
  guidance for stressed autoflowers, even when the grower is tempted to
  "speed up" recovery.
- **Stale / demo / csv / invalid data must not be treated as live.** Source
  labels are immutable truth (see
  [`sensor-truth-rules.md`](./sensor-truth-rules.md)); untrusted buckets never
  feed the "current state" view of the plant.
- **Any suggested action must be approval-required.** AI Doctor may draft an
  advisory for the Action Queue; it never executes anything (see
  [`action-queue-safety-rules.md`](./action-queue-safety-rules.md)).

## Required output shape

The Phase 1 diagnosis result (`Phase1DiagnosisResult` in
`src/lib/aiDoctorEngine.ts`) carries all of the following, every session:

| Field                   | Meaning                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| Summary                 | Observation-grounded summary of what was assessed.                             |
| Likely issue            | Best cautious framing of the concern (may be empty when evidence is too thin). |
| Confidence              | Calibrated 0–1 value, banded low / medium / high.                              |
| Evidence                | Concrete items used, each tagged with its source.                              |
| Missing information     | What would raise confidence, named explicitly.                                 |
| Possible causes         | Differential list — possibilities, not verdicts.                               |
| Immediate action        | Safest next step; may be "observe and re-check".                               |
| What not to do          | Explicit warning-framed guardrails.                                            |
| 24-hour follow-up       | What to re-check to confirm direction.                                         |
| 3-day recovery plan     | Conservative observation checkpoints.                                          |
| Risk level              | low / medium / high.                                                           |
| Action Queue suggestion | Optional; advisory-only and approval-required when present, otherwise null.    |

The grower-facing 8-field session contract in
[`ai-doctor-output-contract.md`](./ai-doctor-output-contract.md) is the
view-model rendering of this doctrine; the two are complementary, not
competing.

## Golden Cases v1

The golden-case pack pins this contract with deterministic fixtures — no
model calls, no I/O, fixed timestamps. Scenario coverage includes:

- **Photo-only weak evidence** — a photo with no sensor or care context must
  stay low confidence, name the missing sensor context, and produce no Action
  Queue suggestion.
- **Stale sensor + leaf symptom** — stale telemetry plus a symptom note must
  flag the staleness, request fresh confirmation, and never diagnose from the
  stale readings.
- **High humidity in flower** — an elevated manual RH reading in flower caps
  at medium confidence, keeps manual clearly separated from live, and rejects
  aggressive corrections.
- **Autoflower stress / recovery** — stressed and recovering autoflowers get
  the heavy-stress never-do guardrails (no defoliation, no transplant), even
  when the diary floats an aggressive "speed recovery" idea.
- **Missing pH/EC context** — a feeding event with zero pH/EC (or any sensor)
  evidence stays low confidence, names the gap, and never implies pH/EC was
  checked.

Additional cases cover demo-only telemetry, invalid readings, mixed and
contradictory sources, and differential (pest vs nutrient vs environment)
framing. Every fixture is run through the full assertion set: confidence and
risk caps, source-label separation, missing-information signals, forbidden
overconfidence/automation/device phrasing, warning framing, Action Queue
invariants, and a recursive output safety scan.

## Change policy

- New AI Doctor behavior lands with new golden cases, or it does not land.
- Existing golden-case assertions may be extended, never weakened, to make a
  feature pass.
- Any output field that suggests an action must survive the forbidden-phrase
  and Action Queue invariant scans unchanged.
