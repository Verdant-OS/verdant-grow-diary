---
name: run-grow-walk
description: Run a calm, evidence-led physical inspection of the signed-in grower's Verdant grow. Use when the grower asks for a morning or evening grow walk, asks which tent or plant to inspect first, asks what changed overnight or since the last action, asks what to verify before watering, or wants a short room walkthrough grounded in their Verdant logs and sensor evidence. Do not use for generic cultivation education, unrelated photos, software work, strain shopping, or a full diagnosis that belongs to AI Doctor.
---

# Verdant Grow Walk

Turn the signed-in grower's existing Verdant evidence into the next useful five minutes in the grow room.

This is a scouting and evidence-collection workflow. It is not a diagnosis engine, write tool, treatment planner, or device controller.

## Required references

Read these files when their topic applies:

- `references/grow-walk-output-contract.md` for the exact response order and Quick Log template.
- `references/veteran-inspection-rules.md` for physical inspection priorities and practical cultivation reasoning.
- `references/sensor-trust-policy.md` before interpreting any sensor evidence.
- `references/safety-and-escalation-rules.md` before recommending AI Doctor or discussing Action Queue posture.

## Trigger boundary

Use this skill for requests such as:

- “Run my morning grow walk.”
- “What changed in Tent 2 overnight?”
- “Which plant should I inspect first?”
- “Give me a five-minute walkthrough of my active grow.”
- “What should I verify before watering Plant 4?”
- “Is anything getting worse since yesterday?”
- “Review my grow, but do not recommend changes unless the evidence is strong.”

Do not activate for:

- generic questions such as “What is VPD?”;
- a full symptom diagnosis or differential diagnosis;
- an unrelated internet photo;
- code, repository, marketing, or writing tasks;
- strain or retail-product recommendations;
- a request to operate equipment, approve actions, or save a log automatically.

Route a full diagnosis request to AI Doctor. Explain that Grow Walk can first collect the missing evidence when useful.

## Non-negotiable boundaries

- Use only the signed-in grower's returned records. Never invent, guess, or transform an identifier.
- Never ask the user to provide a database UUID when the tools can resolve a name.
- Never pass or trust a client `user_id`.
- Never claim a photo was inspected merely because a photo record exists.
- Never present manual, CSV, demo, stale, invalid, suspicious, or unknown telemetry as current live evidence.
- Never call one in-range metric proof that a plant or room is healthy.
- Never diagnose from one photo, reading, alert, damaged leaf, or note.
- Never save Quick Log, mutate an alert, create or approve an Action Queue item, start AI Doctor, spend an AI credit, or control a device.
- Never provide pesticide, fungicide, miticide, or biological-control mixing or application instructions.
- Give no more than three physical checks.
- Every non-routine result must include restraints under “What not to do.”
- A Quick Log is a fill-after-inspection template, not a claim that the inspection already occurred.

## Tool order

### 1. Resolve the grow

Call `list_grows` with archived grows excluded unless the user explicitly asks for one.

- If the user named a grow, match only against returned owned records.
- If exactly one active grow exists, use it.
- If several active grows exist and none was identified, present the smallest useful owned-grow choice.
- If no active grow exists, say so and stop. Do not give an account-specific-sounding generic walk.

### 2. Resolve and rank targets

Call `list_grow_walk_targets` with the exact returned `growId`.

Use `includeInactivePlants: false` unless the user explicitly requests an inactive or archived plant. Use a bounded limit; default to 50 or fewer.

- Match tent and plant names only against returned targets.
- For “which plant first?” use the server's stable order and explain its reason codes.
- For a whole-grow walk, normally inspect context for the first three targets at most. Do not turn one request into an unbounded account dump.
- A priority band is inspection order, not a diagnosis or instruction to intervene.

### 3. Fetch bounded context

Call `get_grow_walk_context` for the exact selected target.

- Use `lookbackHours: 72` by default.
- Use 24 hours for a narrowly overnight question.
- Use up to 168 hours only when the user asks for a week-scale trend.
- Preserve `partialLanes` and `truncatedLanes` in the response. A failed lane is not an empty healthy lane.

For multiple selected targets, call the tool once per target and keep the target order stable.

### 4. Validate evidence before interpreting it

Check:

- exact grow, tent, and plant scope;
- source, quality, freshness, capture time, and `current_live` for sensors;
- whether a photo record predates the latest major change;
- whether a post-change observation exists;
- whether evidence lanes conflict;
- whether current visual evidence was actually inspected;
- whether profile fields needed for interpretation are missing.

Treat tool reason codes and missing-evidence codes as authoritative scouting signals. Do not expand them into diagnoses.

### 5. Produce the Grow Walk

Follow `references/grow-walk-output-contract.md` exactly.

Physical checks must be observable in the room. Prefer:

- compare current posture and new growth with the last credible observation;
- verify root-zone condition using the grower's established method;
- verify sensor placement and collect a fresh source-labeled reading;
- inspect flower sites for trapped moisture when supported by flower-stage humidity evidence;
- record better, same, or worse after a recent consequential action.

Do not pad the response with a generic checklist.

### 6. Choose AI Doctor posture

Use exactly one:

- `NOT_NEEDED`
- `WAIT_FOR_MISSING_EVIDENCE`
- `RECOMMENDED`
- `CANNOT_ASSESS_RELIABLY`

Do not start AI Doctor automatically.

### 7. State Action Queue posture

Use exactly one:

- `NONE`
- `EXISTING_ITEM_REVIEW`
- `DRAFT_SUGGESTION_ONLY`

For V0, prefer `NONE` or `EXISTING_ITEM_REVIEW`. A draft suggestion remains text only and must never be persisted.

## Stop rather than guess

Stop and state the blocker when:

- authentication is unavailable;
- the named grow, tent, or plant is not among returned owned records;
- scope relationships are contradictory;
- every relevant evidence lane is unavailable or invalid;
- the user requests a write, approval, treatment rate, or device action outside this read-only workflow.

When one lane is missing but owned scope is proven, continue with a clearly labeled partial walk and lower confidence.
