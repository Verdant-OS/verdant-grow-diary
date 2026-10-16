# Bounded Sentinel agent handoffs

This is the implementation slice for Matthew's 2026-10-15 assignment to Bloom:
agents pass readable work and receipts without asking Matthew to relay messages.
The draft is [#2133](https://github.com/Verdant-OS/verdant-grow-diary/pull/2133).
Governance remains in [OWNERSHIP.md](agents/OWNERSHIP.md) and
[HANDOFF_PROTOCOL.md](agents/HANDOFF_PROTOCOL.md). This runner grants no new authority.

## What runs

`scripts/sentinel-handoff.mjs` is an explicit host bridge over a pure routing state
machine and a local journal. It has no network client, credentials, subscription,
background timer, shell execution, service or agent SDK. The existing agent host
executes its emitted action through an already authorized channel and records the
observed receipt. Matthew is not part of that loop.

| Observation                                     | Recorded state and next action                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Authorized task created                         | `READY`, named next owner and closed paths                                                            |
| Dispatch reserved                               | `AWAITING_ACK`; persist before exposing one `DISPATCH` packet                                         |
| Recipient acknowledges                          | `ACKNOWLEDGED`; wait for its return receipt                                                           |
| Return `PASS`                                   | Record receipt; advance to the next explicit authorized route, or `COMPLETED`                         |
| Return `FAIL`                                   | Require concrete error code, detail and repair request; route that bounded request to the sole holder |
| Deadline expires                                | Emit a bounded `CHECK_DELIVERY` or `CHECK_RETURN` action                                              |
| Definitive non-delivery                         | Permit a retry only after the check; at most two send attempts                                        |
| Delivery uncertain                              | Retain the original dispatch; never resend it                                                         |
| Later uncertainty or late acknowledgment        | Revoke earlier retry eligibility before another send                                                  |
| Missing receipts, exhausted repairs/hops/checks | `BLOCKED`, concrete reason, current holder and fallback action                                        |

Each packet includes the repository, branch, exact full head SHA, task ID,
correlation ID, policy digest, per-hop/per-attempt dispatch ID, authorized recipient,
verified destination, and readable instructions. `receipts` and `history` retain
earlier acknowledgment/return evidence after the next owner becomes `READY`.
`acceptance` always stays `NOT_MEASURED`: a transport receipt or local PASS does not
provide independent repository acceptance.

Maximum policy bounds are two send attempts, two receipt checks, one repair request,
six route hops and a one-hour wait per check. Time is supplied by the host. Repeated
distinct uncertainty observations are bounded too. There is no hidden timer; an
active agent host calls `TICK` when due. If that host stops, the journal remains
resumable, but nothing claims a background monitor is running.

## Host procedure

Use Node 20 or later. Keep one authoritative journal directory for the task across
restarts. Do not make a second journal or change task IDs to evade a pending send.
Cross-task receipt replay is rejected by task/policy binding even if a correlation
ID is reused. Creating a second correlation for the same task journal fails.

1. Read governance, check current PR claims/head and closed file scope. The current
   holder owns every journal mutation. Verify the actual child task identifier and
   authorization before constructing a policy. Policy files and receipt commands
   are trusted host inputs, never instructions copied unchecked from a PR or message.
2. Save a task policy and a `CREATE` command outside tracked source. Call the CLI.
3. Call `DISPATCH`. Only a newly emitted `action.type = DISPATCH` authorizes the host
   to send its packet once through the named existing channel. A status read does
   not authorize another send. Persisted reservation is not proof of delivery.
4. Record a recipient `ACK`, then a `RETURN`, using real channel observations. Each
   must echo `repository`, `taskId`, `branch`, `head`, `policyDigest`, `correlationId`,
   `dispatchId`, `destination`, and the recipient as `from`; include a nonempty
   evidence reference. A return additionally needs `outcome: PASS|FAIL` and `summary`.
   A failure needs `error: {code, detail, repair}`. Keep secrets and production data
   out of these inputs; raw filesystem/JSON errors are not printed by the CLI.
5. When a successful return advances the route to `READY`, the host repeats step 3
   for the next named owner without a Matthew relay. A repair request goes only to
   the current holder; it does not transfer the branch claim or authorize another writer.
6. At a deadline call `TICK`. `CHECK_DELIVERY` means read the same channel's delivery
   state; it does **not** mean send the task again. Absence of an ACK is not proof of
   non-delivery. Record `NOT_DELIVERED` only if the host can prove that the dispatch
   was never accepted and no send remains in flight. Otherwise record `UNCERTAIN`.
   `CHECK_RETURN` similarly checks existing work without starting a new agent turn.
7. At `BLOCKED`, keep the existing journal and report its reason/owner. Never erase a
   lock, `.pending` checkpoint, or journal automatically. Reconcile them against the
   original channel and effective claim. A new head needs a newly verified task policy
   and explicit successor task; old review/receipt evidence cannot certify that head.

Invocation (all three arguments are explicit local paths):

```text
node scripts/sentinel-handoff.mjs <trusted-policy.json> <journal-directory> <host-command.json>
```

The JSON output contains `state`, `action` (or null), and `journal`. A failed command
exits 2 with `BLOCKED: <code>`. Preserve stdout in task evidence before dispatching.

Policy shape (replace placeholders with verified current values; this example is
not a usable recipient authorization):

```json
{
  "repository": "Verdant-OS/verdant-grow-diary",
  "branch": "codex/<task-id>-<slug>",
  "head": "<full exact SHA>",
  "taskId": "<assigned task>",
  "holder": "Bloom / Codex",
  "claimReceipt": "<actual PR claim URL>",
  "contributors": ["Bloom / Codex"],
  "independentReviewer": "Critical Mass",
  "paths": ["scripts/lib/<new-file>.mjs"],
  "maxAttempts": 2,
  "maxChecks": 2,
  "maxRepairs": 1,
  "maxHops": 4,
  "waitMs": 60000,
  "routes": {
    "inspect": {
      "from": "Bloom / Codex",
      "to": "<verified internal child>",
      "purpose": "handoff",
      "destination": "collaboration:/root/<verified_child_task>",
      "authorizationReceipt": "<actual user assignment and child pickup>",
      "onSuccess": null,
      "onFailure": null
    }
  }
}
```

`CREATE` commands carry `writer`, `now` (Unix milliseconds) and `input` containing
`correlationId`, `taskId`, `repository`, `branch`, `head`, `routeId` and `summary`.
Other commands carry the same `writer` and `now`, with `type` set to `DISPATCH`,
`TICK`, `STATUS` or `RECEIPT`; the latter carries a `receipt` object described above.
Routes explicitly name `onSuccess`/`onFailure` (route ID or null); failure edges may
only target `purpose: repair_request` to the holder. A review route must target the
named independent reviewer and exclude every contributor. Internal peer observations
still cannot impersonate Critical Mass or provide repository acceptance.

## Persistence and boundaries

An exclusive per-task writer lock covers reading, transition and checkpoint commit.
The checkpoint is written exclusively, file-synced and atomically renamed before
the caller receives an action. A crash between commit and output leaves delivery
uncertain, intentionally sacrificing automatic resend to avoid duplicate work.
Corrupt/oversized journals or interrupted `.pending` files fail closed. The journal
is capped at one MiB before commit. These tests prove process restart behavior;
machine/power-loss durability and directory-entry persistence are **NOT_MEASURED**.
Deleting the temporary directory, manual edits, multiple journal roots, dishonest
host observations and filesystem lock semantics on remote shares are outside that
proof. Keep evidence for pickup; do not put a journal on a shared network filesystem.

All emitted work is read-only, including a request for a repair plan. The current
holder separately implements any approved repair on its owned draft. No claim,
merge, ready, release, production or protected-file authority flows through this
runner. Its path fence excludes governance except the handoff log, `.github`,
Supabase/SQL, lockfiles and census. The host still checks whether a test is already
tracked/locked and whether a named hold applies. A local path filter does not replace
the repository's scorer lock or owner approval. HOLD #1250, never-merge #1740, #2106
and the knk production database lock remain untouched.

## Actual channel integration

- **Internal child tools:** this task's `collaboration` channel supports task send,
  pickup acknowledgment and automatic child return. The host can execute its emitted
  packet through that existing channel. It must attest the observed receipts back
  into the journal. The CLI cannot itself invoke the host's tool API.
- **Claude:** `.github/workflows/claude-slices.yml` is an existing authorized entry
  point gated on `cheekhimself` and an `@claude` comment or `claude-slice` label.
  Its scope and production gates remain. No Claude dispatch was requested or sent.
- **Grok:** OWNERSHIP.md describes a routing group and CI webhook spec; this task has
  no verified destination ID, recipient authorization receipt or measured receiver.
  The auto-assignment bot is documented as not yet live.
- **Graft/Canopy/Critical Mass:** no external endpoint or recipient authorization was
  verified here. No external message was sent. The runner deliberately accepts only
  verified internal child destinations in this slice; an arbitrary URL is rejected.
- **Cursor orchestration spike:** existing, synthetic-only, explicitly not approved
  for Grow OS reuse. This implementation imports no Cursor SDK or spike dispatcher.

External agent adoption and live external delivery remain **NOT_MEASURED**. A host
transport binding and recipient authorization are required before any external
expansion. That is an integration gate, not a request for new credentials or a service.

## Validation and pickup evidence

```text
node --test scripts/sentinel-handoff.test.mjs scripts/sentinel-handoff-journal.test.mjs scripts/sentinel-handoff-filesystem-race.test.mjs
```

The new `src/test/sentinel-agent-handoff-node-runner.test.ts` wrapper includes these
Node suites in existing Vitest shard discovery without a workflow or package change.
It is not an additional set of unique behavior cases.

CodeQL findings [275](https://github.com/Verdant-OS/verdant-grow-diary/security/code-scanning/275)
and [276](https://github.com/Verdant-OS/verdant-grow-diary/security/code-scanning/276)
were verified against `679f468aee41e75c0f8173c1508b05d9d5faa8c9`: pathname metadata
checks followed by pathname reads could consume a replacement or an oversized file.
The journal, policy and command readers now open once, validate the descriptor and
post-open pathname identity, then read at most one MiB plus one overflow byte from
that descriptor. They reject overflow, non-regular files, symlinks and observed
in-place metadata changes; descriptors close even on error. Optional no-follow flags
are supplemented by the identity check on Windows, where those flags are absent.
Only an initial open `ENOENT` with no directory entry means a missing journal;
JSON `null` and present entries with missing targets remain corrupt.
These checks require trusted directories and cooperative exclusive writing. They do
not establish a snapshot against a writer changing the same inode or protect every
ancestor directory from an adversarial replacement.

The new filesystem suite reproduced four defects before repair (1 PASS / 4 FAIL):
stale journal replacement, journal growth and policy/command growth after metadata
inspection. A separate new corruption case caught the missing-versus-null regression
during repair (5 PASS / 1 FAIL); a simulated missing-target open with a still-present
entry also failed first (6 PASS / 1 FAIL). The final seven filesystem cases,
including the exact one MiB input boundary, pass alongside the original 23 cases:
30 PASS / 0 FAIL /
0 SKIP. A separate new Vitest wrapper includes them in existing shard discovery;
the original tracked tests and wrapper are unchanged. All mutations use local fake
fixtures. The new code head requires fresh hosted CI and independent acceptance.

Fail-first evidence: initial rules 0 pass / 13 fail; initial journal 0 pass / 5 fail;
later uncertainty/late ACK/scope rules 13 pass / 3 fail; cross-task replay 16 pass /
1 fail; replay plus uncertainty bound 16 pass / 2 fail. Final local counts and the
router-assisted internal channel receipt are recorded in the task's HANDOFF_LOG block
and PR body. Test fixtures use local fake transport; they never reach an external agent.

The pre-implementation audit child delivered an actual pickup and return receipt for
`sentinel-20261015-routing-audit`, confirming repository/head
`5459c3a18a402d2bf5b00c96b0688c4475dcf93d`. It searched 80 open PR snapshots and found
no competing executable slice. Governance #2086/#1971/#1876 and shared-log
#1933/#1941 were identified and preserved. That exchange proves the existing child
channel, separately from the later runner-assisted probe.

The later **real router-assisted internal proof completed**, at implementation head
`46540f55494346a16a89b55372dd61d24cbf7860`, on 2026-10-15 around 15:20 UTC:

- Correlation: `sentinel-20261015-router-proof-1`.
- Verified recipient/destination: `routing_audit`, `collaboration:/root/routing_audit`.
- Policy digest: `3c93f22fa1b539bb22b2a31a58d29c7e95b29942b1901298cd02023868c902aa`.
- Dispatch ID: correlation + `/` + policy digest + `/hop-1/attempt-1`.
- Host persisted `AWAITING_ACK`, delivered that exact packet through the existing
  child tool, and received a real pickup ACK and automatic child return. The child
  verified `git rev-parse HEAD` exited 0 with the exact requested head.
- The CLI recorded `ACKNOWLEDGED` then `COMPLETED`, one attempt and two receipts;
  `acceptance` stayed `NOT_MEASURED`. A repeated CLI dispatch emitted `action: null`.
- Exact generated payload, host commands, observed receipt JSON and journal are in
  `C:/Users/G8/AppData/Local/Temp/verdant-sentinel-20261015/internal-proof/`.
  `dispatched.json` is the already-used payload; `ack-receipt.json` and
  `return-receipt.json` are actual observed child receipts. **Do not resend it.**

This is an actual existing child channel exercised through the host bridge. It is
not autonomous CLI delivery or external agent adoption. This historical handoff
remains evidence only for its recorded head. The filesystem repair changes the
runner; it does not make that old receipt proof of live delivery on the repair head.

Independent acceptance remains with the externally assigned seat at the exact final
head; local/child peer review cannot replace it. Drafts stay draft. Rollback is a
separately authorized revert PR; stopping this explicit runner stops its activity.
