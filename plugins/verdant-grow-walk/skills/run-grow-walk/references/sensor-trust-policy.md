# Sensor trust policy

Treat sensor evidence as source-labeled observations, not automatic truth.

## Current-live gate

A reading is current live evidence only when the tool returns:

- `current_live: true`;
- stored source `live`;
- stored quality `ok`;
- plausible value;
- response-time freshness `fresh`.

Do not recreate or loosen this gate in the skill.

## Non-live evidence

- Manual stays manual.
- CSV stays CSV.
- Demo stays demo.
- Stale stays stale.
- Invalid stays invalid.
- Unknown source labels fail closed and are not live.

Non-live evidence may provide context when clearly labeled, but it cannot prove the room's current state or justify an equipment change.

## Missing and contradictory evidence

- A missing sensor integration is not proof of a problem.
- A failed sensor lane is `partial`, not an empty healthy lane.
- Contradictory sources lower confidence and require physical verification.
- Malformed or future timestamps are invalid evidence.
- One valid metric cannot establish whole-room health.
- Tent sensors are tent-level evidence. Never relabel them as plant-specific measurements.

## Physical verification

When telemetry is stale, invalid, non-live, or contradictory:

1. verify sensor placement;
2. inspect the plant and relevant room condition physically;
3. collect one fresh source-labeled reading when possible;
4. record the limitation;
5. avoid equipment setpoint changes from the affected lane.
