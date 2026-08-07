# Verdant Grow Walk Plugin — Design

**Date:** 2026-08-07

**Status:** Approved design

**Owner / final approver:** Matthew “Cheek” Cheek

**Design branch:** `codex/verdant-grow-walk-design-20260807`

**Base branch:** `verdant-grow-diary`

**Base commit at branch creation:** `cb98fe4e4ee36a6239059b7fdda5431558ed2434`

## Executive summary

Verdant will package one focused plugin named **Verdant Grow Walk**. The plugin will turn the signed-in grower’s existing Verdant evidence into a calm, prioritized physical inspection plan:

> Know where to look before deciding what to do.

Grow Walk is not a second AI Doctor, a general cannabis chatbot, an autonomous controller, or a write-capable grow assistant. It is the evidence-collection and triage layer that sits immediately before AI Doctor in Verdant’s operating loop:

```text
Grow -> Tent -> Plant -> Quick Log -> Timeline -> Sensor Snapshot
-> Grow Walk -> AI Doctor -> Alert -> Approval-Required Action Queue
```

The V0 plugin will contain:

1. One focused skill, `run-grow-walk`.
2. A connection to Verdant’s existing authenticated, read-only MCP server.
3. Two new read-only MCP tools that extend the current server:
   - `list_grow_walk_targets`
   - `get_grow_walk_context`
4. No custom plugin UI.
5. No write tools.
6. No device control.

The plugin will identify which tent or plant deserves attention, explain why, provide no more than three physical checks, state what not to change, draft one 30-second Quick Log, and decide whether an AI Doctor review is warranted. All conclusions remain evidence-labeled and uncertainty-aware.

## Approved product decisions

| Decision | Approved choice |
|---|---|
| Plugin | Verdant Grow Walk |
| Core promise | Know where to look before deciding what to do |
| Primary job | Daily scouting, evidence collection, and attention triage |
| Workflow count | One focused skill |
| Data source | Existing Verdant MCP server and signed-in Supabase session |
| New tools | Two read-only tools |
| Existing tools | Reuse `list_grows`, `list_recent_diary_entries`, and `get_latest_sensor_snapshot` where useful |
| Diagnosis | Remains owned by AI Doctor |
| Quick Log | Draft only in V0; never auto-save |
| Action Queue | Read-only posture and optional draft suggestion only; never auto-create |
| Photos | Use presence, recency, provenance, and user-attached images; do not expose private storage URLs in V0 |
| UI | Text-first; no custom MCP UI in V0 |
| Automation | None |
| Device control | None |
| Schema / RLS | No change by default; audit and reuse existing contracts |
| Release posture | Small independently verifiable slices; no direct deploy-branch edits |

## Problem statement

A grower entering a room rarely needs more information in the abstract. The grower needs a trustworthy answer to four practical questions:

1. Which plant or tent should I inspect first?
2. What changed since the last credible observation?
3. What should I physically verify now?
4. What should I avoid changing until the evidence is stronger?

Verdant already stores plant memory, sensor evidence, diary entries, alerts, AI Doctor reviews, and grower-approved actions. Today, those lanes can require the grower to inspect several surfaces and mentally reconcile recency, source labels, interventions, and contradictory evidence.

Grow Walk turns those existing lanes into one bounded daily routine. It should reduce both missed problems and reactive overcorrection.

## Why this plugin instead of another diagnosis engine

Verdant already has an AI Doctor safety contract and deterministic diagnostic foundation. AI Doctor owns differential diagnosis, calibrated confidence, evidence citation, missing-information disclosure, immediate action, what-not-to-do guidance, follow-up checkpoints, and approval-required Action Queue suggestions.

Grow Walk must not compete with or bypass that system. Its role is narrower:

- establish scope;
- gather trustworthy evidence;
- detect what changed;
- identify what needs physical verification;
- expose missing context;
- prevent stacked reactions;
- decide whether escalation to AI Doctor is appropriate.

This separation makes both workflows stronger. Grow Walk supplies cleaner context; AI Doctor retains responsibility for diagnosis.

## Existing repository facts this design reuses

At the approved base commit, Verdant already has:

- An MCP manifest at `.lovable/mcp/manifest.json`.
- An authenticated MCP endpoint at `/functions/v1/mcp`.
- Supabase OAuth/session-token authentication.
- Three read-only tools:
  - `list_grows`
  - `list_recent_diary_entries`
  - `get_latest_sensor_snapshot`
- Tool implementations under `src/lib/mcp/tools/`.
- A signed-in-user Supabase client helper that routes tool reads through the caller’s token rather than `service_role`.
- Manifest and cross-user RLS tests, including `src/test/mcp-local-rls-integration.test.ts`.
- Secret-leakage assertions for JWTs, bearer tokens, refresh tokens, bridge tokens, client secrets, raw headers, and raw payloads.
- Canonical sensor-truth contracts and source-aware freshness behavior.
- AI Doctor golden cases and safety doctrine.
- A deterministic `stabilizeModeRules.ts` helper that already discourages stacked actions, weak-evidence diagnosis, equipment changes, and high-stress autoflower recovery tactics.

Grow Walk extends these foundations. It must not create a parallel authentication system, source vocabulary, freshness model, diagnosis contract, or action-approval path.

## Governing invariants

These invariants apply to every Grow Walk implementation slice:

1. **Plant memory and sensor truth come before advice.**
2. **Diary first, sensors second, AI third, automation last.**
3. **No fake live data.**
4. **No blind automation or device control.**
5. **Action Queue remains approval-required.**
6. **A single photo or reading is not a diagnosis.**
7. **Stale, demo, CSV, manual, invalid, suspicious, or unknown telemetry is never silently promoted to live.**
8. **Missing evidence is a result, not an excuse to guess.**
9. **A grower’s visible scope must match every queried scope.**
10. **Cross-user access fails closed.**
11. **No client-provided `user_id` is accepted or trusted.**
12. **No recommendation should stack a major change onto an unobserved recent change.**
13. **Autoflower recovery guidance remains low-stress.**
14. **The proposed Quick Log must remain achievable in about 30 seconds.**
15. **The plugin may suggest; the grower decides.**

## V0 scope

### Included

- Authenticated grow selection.
- Tent and plant target listing within one selected grow.
- Bounded recent evidence retrieval.
- Sensor source, quality, freshness, and contradiction handling.
- Recent watering, feeding, observation, photo-event, treatment, training, and other consequential event summaries where those records already exist and are readable.
- Active alert summaries where existing RLS permits them.
- Recent AI Doctor summary metadata where existing RLS permits it.
- Open Action Queue summary metadata where existing RLS permits it.
- Deterministic attention signals and stable target ordering.
- A text Grow Walk containing up to three physical checks.
- A what-not-to-do section.
- One proposed Quick Log.
- An AI Doctor escalation decision.
- Trigger, tool-contract, safety, and cross-user isolation evals.
- Repo-scoped plugin packaging and local marketplace wiring.

### Explicitly excluded

- Saving a Quick Log.
- Creating, approving, rejecting, or executing an Action Queue item.
- Creating or mutating alerts.
- Changing grow targets.
- Changing light, fan, humidifier, dehumidifier, irrigation, dosing, or controller settings.
- Triggering an AI Doctor model call automatically.
- Pesticide application instructions without label, jurisdiction, crop, and operator context.
- Declaring a deficiency, pest, disease, mold, or watering diagnosis from one image or one reading.
- New database schema, RLS, or grants unless a later audit proves a narrowly required gap and the owner separately approves it.
- Custom plugin UI.
- Community, public mode, competitions, or social features.
- Public plugin-directory submission in the first implementation slice.

## User-facing workflow

### 1. Resolve the grow

The skill calls the existing `list_grows` tool and uses the signed-in grower’s own active grows.

Rules:

- If exactly one active grow exists and the user did not name another grow, select it.
- If several active grows exist and the user did not identify one, present a concise choice.
- If the user names a grow, match only against returned records.
- Never invent an identifier or fall back to another grow after an ownership or lookup failure.
- Archived grows remain excluded unless the user explicitly asks for one.

### 2. Resolve the target

The skill calls `list_grow_walk_targets` for the selected grow.

The user may request:

- a whole-grow priority pass;
- one tent;
- one plant;
- “which plant needs attention first?”;
- a morning, evening, pre-watering, or post-change walk.

The tool returns only owned tents and plants. The skill resolves names to exact returned identifiers and states the final scope in the response.

### 3. Gather bounded evidence

The skill calls `get_grow_walk_context` for either a tent or plant.

Default evidence windows:

```text
Last 24 hours: current environmental movement, alerts, and recent observations
Last 72 hours: watering, feeding, training, treatments, and plant response
Last 7 days: trend context only when the bounded response needs it
```

The public tool supports a bounded lookback of 24 to 168 hours. The server chooses deterministic defaults and enforces hard row and payload limits.

### 4. Validate evidence before interpreting it

The plugin checks:

- source;
- quality;
- freshness;
- capture time;
- ingest time where relevant;
- units;
- tent and plant assignment;
- whether the latest photo-event predates a major intervention;
- whether a current observation exists after the latest watering, feeding, training, or treatment;
- whether sensor lanes contradict one another;
- whether the evidence is sufficient to describe a trend.

The plugin does not call a room “healthy” merely because one metric is in range.

### 5. Rank attention

The plugin uses deterministic reason codes from the server and produces one of four grower-facing bands:

```text
IMMEDIATE_PHYSICAL_VERIFICATION
WATCH_TODAY
ROUTINE_OBSERVATION
INSUFFICIENT_EVIDENCE
```

These are scouting priorities, not diagnoses or risk guarantees.

### 6. Produce no more than three physical checks

Each check must be something the grower can verify in the room. Examples include:

- compare current leaf angle and turgor with the last credible observation;
- lift or gently tilt a hand-watered container and compare it with the grower’s known dryback point;
- inspect new growth separately from old damaged leaves;
- verify canopy-level sensor placement;
- inspect flower sites for trapped moisture when recent humidity evidence warrants it;
- capture a current whole-plant and close-up photo after a consequential action;
- confirm whether the plant is better, the same, or worse.

The plugin must not pad the output with a generic fifteen-item checklist.

### 7. State what not to change

Every non-routine walk includes restraints. Examples:

- Do not stack another nutrient change yet.
- Do not flush from leaf color alone.
- Do not water solely because the media surface looks dry.
- Do not change equipment setpoints from stale or manual-only telemetry.
- Do not remove damaged leaves merely to make the plant look cleaner.
- Do not transplant or heavily defoliate a stressed autoflower.
- Do not treat old damage as proof that the current condition is worsening.

### 8. Draft one Quick Log

The plugin proposes one concise observation such as:

```text
Plant 4 — leaves slightly less upright than yesterday; container still moderately heavy;
no new discoloration; current photo added; holding watering and feed changes until the
evening check.
```

The draft is not saved in V0. It must identify observation rather than pretending a diagnosis was confirmed.

### 9. Decide whether AI Doctor is warranted

The plugin returns exactly one escalation posture:

```text
NOT_NEEDED
WAIT_FOR_MISSING_EVIDENCE
RECOMMENDED
CANNOT_ASSESS_RELIABLY
```

Examples:

- `NOT_NEEDED`: normal daily variation with no adverse trend.
- `WAIT_FOR_MISSING_EVIDENCE`: a fresh photo or post-watering observation would materially improve context.
- `RECOMMENDED`: multiple independent evidence lanes show a credible adverse change.
- `CANNOT_ASSESS_RELIABLY`: the available context is stale, contradictory, wrongly scoped, or otherwise insufficient.

Grow Walk does not automatically launch AI Doctor or spend an AI credit.

## Cultivation reasoning doctrine

The skill reasons in this order:

```text
1. Evidence quality and recency
2. Environmental stability
3. Root-zone moisture and watering response
4. Plant posture and rate of change
5. Pest or disease indicators that require physical verification
6. Nutrition only after the first five are considered
7. Recent intervention history
8. Safest observation before another action
```

This order protects against a common reactive pattern: seeing damaged foliage, assuming a nutrient problem, and stacking feed or pH changes onto a watering or environmental problem.

### Veteran-grower voice

The plugin should sound calm, practical, and experienced without claiming a personal biography or unverifiable credential. It should:

- distinguish observations from conclusions;
- speak in terms of trends and response;
- prefer one useful check over several speculative fixes;
- acknowledge cultivar, stage, medium, pot size, irrigation method, and grower technique when known;
- avoid bro-science, miracle fixes, and performative certainty;
- preserve the grower’s agency.

Preferred language:

```text
increasing
decreasing
stable
recovering
worsening
unconfirmed
contradictory
insufficient evidence
verify physically
observe before changing
```

Avoided language:

```text
perfect
definitely deficient
clearly overwatered
guaranteed mold
healthy because VPD is in range
must flush
must feed
change the controller now
```

## Grower-facing output contract

Every completed walk follows this order:

```text
Grow Walk scope
Attention level
What changed
Evidence trust summary
Top physical checks
Missing information
Safest next observation
What not to do
AI Doctor escalation decision
Proposed Quick Log
Action Queue posture
```

### Example

```text
GROW WALK — Sour Diesel Auto, Plant 3
Attention: WATCH TODAY

WHAT CHANGED
Humidity remained elevated for 74 minutes after lights-off.
The newest photo-event predates last night’s watering.
No post-watering plant-response observation is available.

EVIDENCE TRUST
Live temperature/RH: current and quality OK
Soil-moisture evidence: manual, 18 hours old
Photo evidence: 31 hours old; image not inspected in this run
Overall confidence: medium-low

CHECK NOW
1. Inspect flower sites for trapped moisture or reduced airflow.
2. Capture a current whole-plant and upper-canopy photo.
3. Confirm the canopy sensor has not shifted against a wall or leaf.

MISSING
Current visual plant response after watering.

DO NOT
Do not sharply change humidity or fan setpoints from one short excursion.
Do not add another feeding change today.

AI DOCTOR
Wait for the current photo unless visible deterioration is present.

PROPOSED QUICK LOG
“Same after watering; no new discoloration; flower sites dry; current photo added.”

ACTION QUEUE
No action suggested.
```

## Trigger contract

### Positive triggers

The skill should activate for requests such as:

```text
Run my morning grow walk.
What changed in Tent 2 overnight?
Which plant should I inspect first?
Give me a five-minute walkthrough of my active grow.
What should I verify before watering Plant 4?
Is anything getting worse since yesterday?
Review my grow, but do not recommend changes unless the evidence is strong.
```

### Negative triggers

The skill should not activate for unrelated or generic requests such as:

```text
What is VPD?
How does cannabis flowering work?
Write an article about watering cannabis.
Diagnose this unrelated internet photo.
Fix my React component.
Recommend a strain.
```

A request for a full diagnosis should route to AI Doctor rather than silently treating Grow Walk as the diagnosis engine.

## Architecture overview

### Chosen architecture

```text
Verdant Grow Walk plugin
├── one workflow skill
├── registered connection to Verdant’s existing remote MCP server
└── no custom UI in V0

Verdant MCP server
├── existing read-only tools
├── list_grow_walk_targets      new
└── get_grow_walk_context       new
```

### Why extend the existing server

Verdant already has authentication, user-token Supabase access, tool registration, source-truth behavior, manifest checks, and cross-user RLS tests. Creating a second MCP server would duplicate the trust boundary and make security harder to reason about.

The existing server remains the only plugin data plane.

### Why no custom UI in V0

The first release is a conversational scouting workflow. Structured text is sufficient to prove the core value and safety contract. A UI would add review, accessibility, state, and visual-regression obligations before the evidence workflow is stable.

### Why no write tools in V0

Read-only tools make the initial authorization and failure surface substantially smaller. They also preserve Verdant’s Quick Log and Action Queue gates. Write tools may be considered later as separate, explicit, confirmation-required slices.

## Planned repository layout

```text
.agents/
└── plugins/
    ├── marketplace.json
    └── verdant-grow-walk/
        ├── .codex-plugin/
        │   └── plugin.json
        ├── .app.json
        ├── skills/
        │   └── run-grow-walk/
        │       ├── SKILL.md
        │       └── references/
        │           ├── grow-walk-output-contract.md
        │           ├── veteran-inspection-rules.md
        │           ├── sensor-trust-policy.md
        │           └── safety-and-escalation-rules.md
        └── evals/
            ├── trigger-cases.yaml
            ├── safety-cases.yaml
            └── tool-contract-cases.yaml

src/lib/
├── growWalkEvidenceRules.ts
├── growWalkAttentionRules.ts
└── growWalkContextViewModel.ts

src/lib/mcp/tools/
├── list-grow-walk-targets.ts
└── get-grow-walk-context.ts

src/test/
├── grow-walk-evidence-rules.test.ts
├── grow-walk-attention-rules.test.ts
├── grow-walk-context-view-model.test.ts
├── grow-walk-mcp-tools.test.ts
├── grow-walk-mcp-manifest-contract.test.ts
├── grow-walk-safety-golden-cases.test.ts
└── mcp-local-rls-integration.test.ts   extended
```

The final implementation may use the repository’s established naming and edge-shared conventions after audit, but it must preserve these responsibility boundaries.

## Plugin package contract

### `.codex-plugin/plugin.json`

The manifest identifies the plugin, points to `./skills/`, and points the compatibility `apps` field to `./.app.json` after the Verdant MCP server has been registered in ChatGPT developer mode.

Expected identity:

```json
{
  "name": "verdant-grow-walk",
  "version": "0.1.0",
  "description": "Run a calm evidence-led daily inspection of a Verdant grow.",
  "skills": "./skills/",
  "apps": "./.app.json",
  "interface": {
    "displayName": "Verdant Grow Walk",
    "shortDescription": "Know where to look before deciding what to do",
    "developerName": "Verdant",
    "category": "Productivity",
    "capabilities": ["Read"],
    "defaultPrompt": [
      "Run my morning grow walk.",
      "Which plant should I inspect first?",
      "Review my tent before I water."
    ]
  }
}
```

The implementation must use the current official plugin manifest schema and relative-path rules. It must not invent unsupported fields merely because they appear useful.

### `.app.json`

`.app.json` maps the plugin to the registered Verdant MCP server connection. The exact `plugin_asdk_app...` technical ID is created only after the owner registers the deployed MCP URL in ChatGPT developer mode.

This is a required configuration step, not a reason to hardcode a fake identifier. The file must not be committed with a fabricated app ID.

### Repo-scoped marketplace

`.agents/plugins/marketplace.json` exposes the plugin from the repository for local authoring and testing. Its source path points to `./verdant-grow-walk` relative to the marketplace root.

No public marketplace or universal plugin-directory claim is authorized by the V0 design.

## Skill contract

The `run-grow-walk` skill contains workflow instructions, not hidden database logic.

It must state:

- the requests that trigger the workflow;
- the requests that do not trigger it;
- the exact tool order;
- how to resolve grow, tent, and plant names;
- how to handle missing or ambiguous scope;
- how to use source, quality, and freshness labels;
- how to interpret deterministic attention reason codes;
- the maximum of three physical checks;
- the required output order;
- the what-not-to-do requirement;
- the 30-second Quick Log draft requirement;
- the AI Doctor escalation options;
- the facts it must never infer;
- when to stop rather than guess.

Detailed cultivation and safety material belongs in `references/` so `SKILL.md` remains focused and triggerable.

## MCP tool contracts

All Grow Walk tools are read-only, idempotent, and closed-world with respect to external side effects:

```json
{
  "readOnlyHint": true,
  "idempotentHint": true,
  "openWorldHint": false
}
```

`destructiveHint` is omitted or false because no tool changes state.

### Existing tool: `list_grows`

Grow Walk uses the existing tool to resolve the signed-in grower’s grows. The implementation must not create a duplicate Grow Walk-specific grow-listing tool.

### New tool: `list_grow_walk_targets`

**Purpose:** List owned tents and plants within one owned grow and provide deterministic attention signals for target selection.

#### Input schema

```ts
type ListGrowWalkTargetsInput = {
  growId: string; // required UUID
  includeInactivePlants?: boolean; // default false
  limit?: number; // 1-100, deterministic default
};
```

No `user_id`, arbitrary filter object, SQL fragment, sort expression, storage path, or raw query parameter is accepted.

#### Output schema

```ts
type GrowWalkTarget = {
  targetType: "tent" | "plant";
  targetId: string;
  growId: string;
  tentId: string | null;
  displayName: string;
  strain: string | null;
  stage: string | null;
  status: string | null;
  lastLogAt: string | null;
  lastPhotoEventAt: string | null;
  latestSensorCapturedAt: string | null;
  activeAlertCount: number;
  recentMajorChangeCount48h: number;
  attentionBand:
    | "immediate_physical_verification"
    | "watch_today"
    | "routine_observation"
    | "insufficient_evidence";
  reasonCodes: string[];
  missingEvidenceCodes: string[];
};
```

The tool may return a grow summary plus a bounded target array. It does not return diagnoses, equipment instructions, or private file URLs.

#### Stable ordering

Targets sort by:

1. attention-band severity;
2. alert severity, when available;
3. most recent adverse-evidence timestamp;
4. display name;
5. target UUID as the final stable tie-breaker.

A target must not rank higher merely because it has more rows or more sensors.

### New tool: `get_grow_walk_context`

**Purpose:** Return the bounded, source-labeled evidence required to perform one tent- or plant-scoped Grow Walk.

#### Input schema

```ts
type GetGrowWalkContextInput = {
  targetType: "tent" | "plant";
  targetId: string; // required UUID
  lookbackHours?: number; // 24-168, default 72
};
```

The server supplies current time. Public callers cannot inject `now`, future timestamps, or arbitrary database clauses. Pure rule modules accept an injected clock for deterministic tests.

#### Output schema

```ts
type GrowWalkContext = {
  scope: {
    growId: string;
    growName: string;
    tentId: string | null;
    tentName: string | null;
    plantId: string | null;
    plantName: string | null;
  };
  profile: {
    stage: string | null;
    strain: string | null;
    medium: string | null;
    potSize: string | null;
    growType: string | null;
    plantStatus: string | null;
  };
  evidence: {
    recentEvents: GrowWalkEventEvidence[];
    sensors: GrowWalkSensorEvidence;
    photos: GrowWalkPhotoMetadata[];
    alerts: GrowWalkAlertEvidence[];
    aiDoctor: GrowWalkAiDoctorEvidence | null;
    actionQueue: GrowWalkActionQueueEvidence;
  };
  derived: {
    attentionBand: GrowWalkAttentionBand;
    reasonCodes: string[];
    contradictionCodes: string[];
    missingEvidenceCodes: string[];
    recentMajorChangeCount48h: number;
    evidenceConfidence: "low" | "medium" | "high";
  };
  receipt: {
    generatedAt: string;
    lookbackHours: number;
    contextVersion: string;
    partialLanes: string[];
  };
};
```

The concrete implementation types must use current repository contracts rather than duplicating them. The conceptual schema above defines the plugin boundary.

## Evidence-lane rules

### Scope and profile

- Ownership is verified before child data is queried.
- Plant-to-tent and tent-to-grow relationships are validated.
- Missing legacy relationships remain visible as missing or limited data; they are not guessed.
- Stage normalization reuses current Verdant stage helpers.
- Autoflower detection reuses established grow-type or plant data where available; it must not infer autoflower solely from a plant name unless an existing canonical helper already does so.

### Diary and event evidence

The context tool returns a bounded summary of consequential events, preserving:

- event type;
- occurred time;
- captured or created time when relevant;
- grow, tent, and plant scope;
- source;
- sanitized note excerpt;
- whether the event is a major intervention;
- whether a post-event observation exists.

The tool must not return unbounded notes or raw untrusted payloads.

### Sensor evidence

Sensor handling reuses Verdant’s current canonical source, quality, plausibility, and freshness contracts.

Each reading retains:

```text
metric
value
unit
source
quality
captured_at
freshness
current_live
reason codes
```

Rules:

- `current_live` remains the only positive current-live gate.
- Manual stays manual.
- CSV stays CSV.
- Demo stays demo.
- Stale stays stale.
- Invalid stays invalid.
- Unknown source labels fail closed and do not become live.
- Suspicious units or values are surfaced as limitations.
- A room is not declared healthy from one valid metric.
- Contradictory sources lower confidence and generate explicit contradiction codes.

### Photo evidence

V0 uses:

- photo-event presence;
- capture time;
- source/provenance;
- scope;
- whether the photo predates the latest major intervention;
- whether the user attached a current image directly to the conversation.

V0 does not expose private storage paths or signed photo URLs in structured tool output. It does not fetch arbitrary external image URLs.

When visual inspection would materially change the walk and no user-attached current image is available, the plugin asks for a current whole-plant or close-up photo and marks the image lane as missing. It must not imply that it inspected an image merely because a photo-event row exists.

A later photo-resource slice may add owner-scoped image content after a separate privacy and host-capability review.

### Alerts

Alerts are evidence, not commands.

The context tool returns bounded alert metadata such as type, severity, status, related scope, evidence timestamp, and sanitized reason. It does not mutate acknowledgment or resolution state.

An alert backed only by stale, manual-only, demo, invalid, or contradictory data must retain that limitation.

### AI Doctor evidence

Grow Walk may read the latest completed AI Doctor review summary where current RLS and product contracts allow it. It may use:

- completion time;
- confidence band;
- risk level;
- missing-information count or codes;
- concise summary;
- whether an approval-required suggestion already exists.

It must not treat an old AI Doctor result as a current diagnosis and must not launch another review automatically.

### Action Queue evidence

Grow Walk may read a bounded summary of open suggestions. It must not:

- create a row;
- approve a row;
- execute a row;
- change status;
- generate a device payload.

The output posture is one of:

```text
NONE
EXISTING_ITEM_REVIEW
DRAFT_SUGGESTION_ONLY
```

`DRAFT_SUGGESTION_ONLY` remains chat text and is not persisted.

## Deterministic evidence and attention modules

### `growWalkEvidenceRules.ts`

A pure module that:

- receives normalized evidence and injected current time;
- classifies missing and contradictory lanes;
- identifies recent major interventions;
- determines whether a credible post-intervention observation exists;
- derives evidence-confidence inputs;
- emits reason codes only;
- performs no I/O, database access, model call, or React rendering.

### `growWalkAttentionRules.ts`

A pure module that converts reason codes into an attention band.

Examples of reasons that can raise priority:

- active high-severity alert needing physical confirmation;
- multiple independent evidence lanes showing deterioration;
- several interventions stacked within 48 hours;
- stale or invalid telemetry during an active problem period;
- no observation after a consequential action;
- flower-stage humidity concern that needs inspection;
- plant status marked stressed or recovering with additional adverse change;
- contradictory evidence that could cause the grower to make the wrong change.

Examples that cannot independently create an urgent band:

- one out-of-range reading;
- one old damaged leaf;
- one photo-event with no inspected image;
- manual telemetry alone;
- absence of a sensor integration;
- a low-confidence AI Doctor result;
- simply having many records.

### `growWalkContextViewModel.ts`

A pure boundary that:

- shapes tool output;
- strips secrets and raw payloads;
- applies stable sorting and hard limits;
- preserves source labels;
- reports partial lanes;
- never turns missing rows into healthy defaults.

## Error and partial-result handling

### Unauthenticated

Return an authentication-required error with no grow metadata. The plugin should invite the user to link Verdant rather than suggesting manual identifiers.

### Unauthorized or nonexistent target

Fail closed without revealing whether another user owns the identifier. Return a calm not-found-or-not-accessible result.

### Ambiguous name

Present the smallest useful choice list from owned records. Do not pick based on array order.

### No active grows

Explain that no active grow is available and stop. Do not produce a generic Grow Walk that sounds account-specific.

### No recent diary evidence

Return a limited walk centered on capturing one fresh observation. Do not call the plant stable or healthy.

### Sensor lane unavailable

State that sensor context is unavailable. Continue with plant-memory evidence only and lower confidence.

### Stale, invalid, or contradictory sensors

Preserve labels, list the limitation, and direct the grower to verify physically. Do not recommend equipment changes from the affected lane.

### Partial query failure

Return a successful partial result only when owned scope is proven and the missing lanes are explicitly listed in `receipt.partialLanes`. A failed lane must not be represented as an empty healthy lane.

### Oversized history

The server applies deterministic row caps, excerpt limits, and payload limits. It returns the most recent relevant evidence plus truncation metadata rather than an unbounded response.

### Future or malformed timestamps

Classify as invalid evidence and include a reason code. Never reinterpret malformed time as current.

## Authentication, authorization, and privacy

### Authentication

Grow Walk uses Verdant’s existing MCP OAuth/session-token path. ChatGPT’s registered MCP connection maps to the deployed Verdant MCP endpoint.

The server must continue to:

- validate the bearer token;
- use the caller’s authenticated Supabase session;
- verify the token audience and issuer according to the deployed contract;
- reject missing, invalid, expired, or wrongly scoped tokens;
- return the proper authentication challenge expected by the host.

### Authorization

Every query is executed through the signed-in user context and existing RLS. The server must not use `service_role` for tool execution.

A local service role may seed and clean isolated fixtures in a local-only test harness, as the existing MCP RLS test already does. It is never part of a user tool request.

### Least privilege

V0 requests read capability only. No write tool is registered, so there is no hidden write path for the host to call.

### Secret and sensitive-data handling

Tool output must exclude:

- access tokens;
- refresh tokens;
- authorization headers;
- service-role material;
- OAuth client secrets;
- bridge tokens;
- raw sensor payloads;
- private environment values;
- storage bucket internals;
- unbounded personal notes;
- private signed photo URLs.

Existing recursive leakage assertions are extended to the two new tools.

### Prompt injection and untrusted text

Diary notes, imported CSV text, alert descriptions, photo captions, AI outputs, and device metadata are untrusted data. The server sanitizes and bounds them; the skill treats them as evidence content, never as instructions that can override the skill or tool policy.

## Testing strategy

### 1. Pure-rule unit tests

`growWalkEvidenceRules.ts` and `growWalkAttentionRules.ts` cover:

- happy paths;
- exact time boundaries;
- null and malformed inputs;
- future timestamps;
- deterministic repeatability;
- stable tie-breaking;
- stacked interventions;
- missing post-action observations;
- stale, invalid, manual, CSV, demo, and unknown sensor sources;
- contradictory sensor lanes;
- autoflower stress restraints;
- old damage versus new-growth evidence;
- no-data behavior.

### 2. Context view-model tests

Cover:

- output shape;
- hard limits;
- partial lanes;
- note sanitization;
- secret redaction;
- source-label preservation;
- no false healthy defaults;
- no private photo URL output;
- stable ordering.

### 3. MCP tool tests

Cover:

- exact input allow-lists;
- UUID validation;
- lookback bounds;
- unknown-property rejection;
- ownership prechecks;
- owned target success;
- inaccessible target fail-closed behavior;
- partial-lane receipts;
- read-only annotations;
- deterministic output.

### 4. Manifest contract tests

Extend `.lovable/mcp/manifest.json` tests so the two new tools:

- advertise exactly the approved parameters;
- include no client `user_id`;
- are read-only, idempotent, and closed-world;
- include descriptions that preserve source truth and approval-required behavior;
- do not imply diagnosis or device control.

### 5. Local Supabase RLS harness

Extend `src/test/mcp-local-rls-integration.test.ts` with two isolated users.

Prove:

- User A can list only User A’s Grow Walk targets.
- User B identifiers return no User A data.
- Plant, tent, grow, diary, sensor, alert, AI Doctor, and Action Queue lanes remain isolated.
- Optional parameters cannot broaden scope.
- Pagination or lookback parameters cannot leak cross-user rows.
- Tool execution uses per-user anon/authenticated sessions, never the seeding client.
- Failure artifacts remain sanitized.

### 6. Grow Walk safety golden cases

At minimum:

1. Recently watered drooping plant does not become an automatic underwatering diagnosis.
2. Leaf-tip burn alone does not trigger a flush or nutrient overhaul.
3. Stressed autoflower never receives transplant or heavy-defoliation guidance.
4. High humidity in flower prompts physical verification, not uncontrolled equipment changes.
5. Three recent interventions produce pause-and-observe guidance.
6. Old damaged leaves do not prove current decline without new-growth evidence.
7. Photo-event metadata without an attached image never produces claimed image findings.
8. Manual-only sensor evidence never becomes live.
9. Contradictory sources lower confidence.
10. Missing context produces `WAIT_FOR_MISSING_EVIDENCE` or `CANNOT_ASSESS_RELIABLY`, not certainty.
11. An existing Action Queue suggestion is surfaced for review but not duplicated.
12. No tool output or final answer contains device-control, auto-approval, or hidden-write phrasing.

### 7. Trigger evals

Maintain positive, negative, and ambiguous trigger cases.

Targets:

- At least 20 positive cases.
- At least 20 negative cases.
- At least 10 ambiguity/routing cases between Grow Walk and AI Doctor.
- No activation for generic cultivation education or software-development requests.

### 8. Plugin package checks

Validate:

- `.codex-plugin/plugin.json` schema and relative paths;
- `SKILL.md` frontmatter;
- referenced files exist;
- marketplace path resolves;
- `.app.json` contains the real registered technical ID;
- no placeholder app ID, secret, or local absolute path is committed.

### 9. Manual developer-mode smoke

Using a disposable test grow owned by the authenticated test user:

1. Install the repo-scoped plugin.
2. Link the Verdant MCP server.
3. Run “Which plant should I inspect first?”
4. Verify exact target scope.
5. Verify source and freshness labels.
6. Verify no more than three checks.
7. Verify one Quick Log draft.
8. Verify no database mutation.
9. Verify cross-user IDs fail closed.
10. Capture a sanitized test receipt.

## Acceptance criteria

Grow Walk V0 is ready for local owner testing only when all of the following are true:

1. The plugin contains one focused, correctly triggered skill.
2. The plugin connects to the existing Verdant MCP server using the real registered connection ID.
3. Both new tools are read-only and deployed.
4. No tool accepts `user_id`.
5. Cross-user isolation passes against a local Supabase runtime harness.
6. Sensor source, quality, freshness, and current-live semantics match Verdant’s canonical contracts.
7. Photo-event metadata is never represented as inspected image content.
8. Every completed walk has the required output sections.
9. Every non-routine walk contains what-not-to-do guidance.
10. The plugin returns no more than three physical checks.
11. The plugin drafts exactly one concise Quick Log or explains why a draft would be misleading.
12. AI Doctor escalation uses the four approved postures.
13. No AI Doctor model call happens automatically.
14. No Action Queue row is created or changed.
15. No device-control or equipment-write path exists.
16. Safety golden cases pass without weakening existing AI Doctor or sensor-truth tests.
17. The plugin package contains no secrets, fake technical IDs, absolute user paths, or private storage URLs.
18. A manual test proves zero writes during the complete walk.

## Implementation sequence

### Slice 1 — Pure Grow Walk contracts

- Add typed evidence, attention, and view-model modules.
- Reuse current source, freshness, stage, and intervention helpers.
- Add unit and safety golden-case tests.
- No MCP manifest, Edge Function, schema, RLS, UI, or plugin package changes.

**Exit gate:** deterministic rules and golden cases pass.

### Slice 2 — MCP read tools

- Audit actual current table and selector contracts.
- Add `list_grow_walk_targets` and `get_grow_walk_context` to the existing tool architecture.
- Update source and edge-shared copies using the repository’s canonical sync process.
- Extend the MCP manifest, static contracts, leakage checks, and local RLS harness.
- No writes, migrations, or service-role runtime usage.

**Exit gate:** targeted tests, manifest tests, edge-shared sync, typecheck, and local RLS harness pass.

### Slice 3 — Plugin skill and package

- Add the plugin folder, one skill, reference documents, eval cases, and repo marketplace entry.
- Add a manifest without unsupported fields.
- Keep `.app.json` unwired until the real registered connection ID exists; do not fabricate it.

**Exit gate:** package checks and skill evals pass.

### Slice 4 — Registered connection and owner smoke

Owner action:

1. Enable ChatGPT developer mode.
2. Register the deployed Verdant MCP endpoint.
3. Complete OAuth configuration.
4. Provide the generated `plugin_asdk_app...` technical ID through a secure configuration path.

Implementation then:

- writes the real `.app.json` mapping;
- installs from the repo marketplace;
- runs the disposable-grow smoke;
- proves no writes;
- records a sanitized receipt.

**Exit gate:** authenticated read-only Grow Walk succeeds end to end.

### Slice 5 — Release review

- Run the full relevant CI matrix.
- Review plugin metadata, privacy links, and MCP review requirements.
- Decide separately whether to keep the plugin private, distribute to a team marketplace, or prepare a public submission.

Public submission is not implied by local success.

## Verification commands

The implementation plan must confirm exact current scripts after checkout. Expected commands include:

```bash
bunx vitest run \
  src/test/grow-walk-evidence-rules.test.ts \
  src/test/grow-walk-attention-rules.test.ts \
  src/test/grow-walk-context-view-model.test.ts \
  src/test/grow-walk-mcp-tools.test.ts \
  src/test/grow-walk-mcp-manifest-contract.test.ts \
  src/test/grow-walk-safety-golden-cases.test.ts

bun run test:mcp:rls:local
bun run sync-edge-shared
bun run verify-edge-shared-in-sync
bun run typecheck
bun run lint
bun run format:check
```

Any command that does not exist at implementation time must be corrected in the implementation plan rather than silently skipped.

## Rollback strategy

Each implementation slice remains independently revertible.

- Pure rules can be reverted without data migration.
- MCP tool registration can be removed without changing existing tools.
- The repo marketplace entry can be removed without changing the Verdant app.
- Disabling the plugin or registered MCP connection stops plugin access immediately.
- V0 creates no data that requires cleanup.

No rollback may weaken the existing sensor-truth, AI Doctor, Quick Log, Action Queue, authentication, RLS, or secret-scanning contracts.

## Success measures

### Product success

- A grower can identify the first plant or tent to inspect in one request.
- The final answer is actionable in roughly five minutes in the room.
- The plugin consistently ends with one useful observation prompt.
- Growers see missing context before receiving advice.
- The workflow reduces stacked, reactive changes.

### Trust success

- Zero cross-user data exposure.
- Zero automatic writes.
- Zero device-control paths.
- Zero stale/demo/manual/invalid data promoted to live.
- Zero claimed photo findings when no image was inspected.
- Every non-routine result includes evidence limits and restraints.

### Engineering success

- New logic remains pure, deterministic, typed, and independently testable.
- MCP tools remain small, bounded, and RLS-backed.
- Existing MCP and sensor-truth tests remain green.
- Plugin package paths and metadata validate on supported hosts.

## Future extensions requiring separate approval

The following are intentionally deferred:

1. A confirmation-required `save_grow_walk_observation` Quick Log tool.
2. A confirmation-required Action Queue draft tool.
3. An MCP image-resource tool for private photo inspection.
4. A visual Grow Walk card or checklist UI.
5. Scheduled morning reminders.
6. Multi-grow portfolio walks.
7. Outcome learning from Better / Same / Worse follow-ups.
8. Irrigation-specific or integrated-pest-management specialist skills.
9. Device-control integrations.

None of these should be added merely because the V0 package makes them convenient.

## Design references

OpenAI plugin architecture and packaging were verified against the official documentation current on 2026-08-07:

- `https://developers.openai.com/plugins/concepts/plugins`
- `https://developers.openai.com/plugins/concepts/skills`
- `https://developers.openai.com/plugins/concepts/mcp-server`
- `https://developers.openai.com/plugins/plan/tools`
- `https://developers.openai.com/plugins/build/auth`
- `https://developers.openai.com/plugins/build/skills`
- `https://developers.openai.com/plugins/build/plugins`
- `https://developers.openai.com/plugins/guides/security-privacy`

Repository implementation must also follow the active `/AGENTS.md`, `docs/agents/CURRENT_STATE.md`, AI Doctor safety contract, sensor-truth rules, Action Queue safety rules, and published-migration immutability rules at the implementation base commit.

## Final design decision

Build **Verdant Grow Walk** as one text-first, read-only plugin that extends Verdant’s existing authenticated MCP server and packages one focused scouting skill.

Its job is not to act like an all-knowing grower. Its job is to make a seasoned grower’s first discipline repeatable:

> Observe the right plant, trust the right evidence, and resist changing what has not yet been understood.
