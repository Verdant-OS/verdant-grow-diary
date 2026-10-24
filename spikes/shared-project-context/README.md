# Shared project context — synthetic offline prototype

This is an isolated experiment inspired by the shared-agent-memory request.
It is not a Verdant product integration or a substitute for the canonical
`docs/agents/CURRENT_STATE.md` and `docs/agents/HANDOFF_LOG.md`.

## Closed scope

New files in `spikes/shared-project-context/` only. Node built-ins, explicit
synthetic JSON input, bounded search/read/export/import, immutable record IDs and
provenance, project isolation, stale/conflict labels, and three **simulated**
clients using one read contract. All included records and commits are invented.

No upstream package installation, conversation capture, private notes, filesystem
crawling, source-file loading, watchers, environment/credential reads, network or
model calls, MCP, hooks, host integration, listening server, hosting, production
changes, merge or deployment. Live CMEM and autonomous cross-agent handoff are
unimplemented.

## Run offline

Node 24 (tested); no install, package manifest or dependency needed. From repo root:

```sh
node --test spikes/shared-project-context/context.test.mjs
node spikes/shared-project-context/demo.mjs
```

The demo reads only its statically imported synthetic fixture module and prints
JSON. It shows the same read result for simulated Codex/Claude/Grok clients, then
an exact-head claim becoming stale when the caller supplies a different source
head. No agent is connected. Optional Node permission check (use your absolute
spike path):

```sh
node --permission --allow-fs-read=/absolute/repo/spikes/shared-project-context \
  spikes/shared-project-context/demo.mjs
```

## Contract and schema

`context.mjs` is the schema validator and in-memory store. It accepts JSON strings
through `createRecord(fieldsJSON)` and `store.importJSON(snapshotJSON)`. The
constructor accepts `{projectId, initialJSON?, readOnly?}`; `initialJSON` seeds a
read-only instance before writes are disabled. An import envelope is exactly
`{version:1, synthetic:true, projectId, records:[...]}`. Unknown fields, dangerous
prototype keys, malformed dates, invalid references and excess limits fail closed.

| Record field | Required value |
| --- | --- |
| `projectId` | Lowercase slug, starts with a letter; 1–48 characters |
| `id` | `sha256:` plus 64 lowercase hex digits, derived from all canonical fields below |
| `text` | Nonblank factual text, at most 2,048 UTF-16 code units; untrusted data |
| `kind` | `fact`, `constraint`, or `exact-head` |
| `source` | Exactly `{type, location, commit}`; commit is 40 lowercase hex digits |
| `observedAt` | Valid UTC timestamp, exactly `YYYY-MM-DDTHH:mm:ss.sssZ` |
| `verification` | Declared `verified` or `unverified`; a synthetic assertion |
| `expiresAt` | `null` or a valid UTC timestamp after `observedAt` |
| `supersedes`, `conflictsWith` | Unique record IDs, at most 16 each; same-project references must exist in combined store |

`source.type` is `fixture-uri` (`fixture://slug/path`) or `repo-path` (relative
`docs/`, `src/`, `fixtures/` paths ending `.md`, `.txt`, `.json`, `.mjs`, `.ts`).
Only ASCII letters/digits/dots/underscores/hyphens/slashes are allowed in path
segments; empty, `.` and `..` segments fail. Absolute paths, backslashes, URL
encoding, queries and other schemes fail. **These locations are provenance
metadata only: no API loads a path or URI, follows a symlink, or reads Git.**

Inputs are bounded to 65,536 UTF-8 bytes and 12 nesting levels. Both each import
and accumulated store are capped at 128 records, and the canonical export must
fit 65,536 bytes (this can bind earlier). Imports are atomic and append-only;
identical IDs are idempotent. IDs and original source/verification metadata
survive export/import; changing content under an old ID fails integrity checks.
Hashes establish content identity, **not authenticity, truth or authorization**;
a caller can construct a new synthetic record with a new ID.

```js
import { ContextStore } from './context.mjs';
import { PROJECT_ID, fixtureJSON, NOW, headsJSON } from './fixtures.mjs';
const store = new ContextStore({ projectId: PROJECT_ID, initialJSON: fixtureJSON });
const options = { now: NOW, headsJSON: headsJSON() };
const matches = store.search('sample', { ...options, limit: 3 });
const result = store.read(matches[0].record.id, options);
const snapshot = store.exportJSON(); // caller may explicitly carry this string
const restarted = new ContextStore({ projectId: PROJECT_ID, initialJSON: snapshot });
```

`read` returns a frozen view or `null`; `search` uses literal case-insensitive
substring matching, at most 128 query characters and 1–20 results (default 10).
An empty query returns a bounded listing. Results sort by observation descending,
then ID. Each store and export belongs to one explicitly selected project;
cross-project imports and heads fail, and another project's ID is absent.

Each read requires explicit `now`. Optional `headsJSON` is exactly
`{projectId, heads:[{type,location,commit}]}` with at most 128 unique sources.
Heads are caller assertions, never discovered or cached. Any record becomes
stale/unverified when its supplied source head differs from the recorded commit;
exact-head claims are also stale when no head is supplied. A `fact` or
`constraint` read without a head keeps its declared verification, so callers
that need it checked must supply the head. Expired records (including the
exact expiry instant) and future observations are stale. Superseded and conflicted
records become effectively unverified; one-sided conflict references label both
records. Supersession cycles fail; relationships remain immutable source data.
Every result labels `synthetic` and `untrusted-data`, carries original provenance,
and separates declared verification from computed `effectiveVerification`.

## Research and limits

The actual upstream is [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem),
with [official installation docs](https://docs.claude-mem.ai/installation).
Verified 2026-10-21: interactive installation pre-selects hosted CMEM Pro and
changes plugin hooks, runtime dependencies, PATH/settings and the worker, with
OAuth pairing. Non-interactive fresh installation without a provider currently
defaults to the Anthropic plan. [Headless setup](https://docs.claude-mem.ai/cmem-pro-headless)
also persists sync credentials and a memory API key. Nothing upstream was installed
or run for this experiment.

[Cloud sync](https://docs.claude-mem.ai/cloud-sync) documents uploads of observations,
session summaries **and user prompts**. No summaries-only positive capture
allowlist was verified in the inspected page. [CMEM](https://cmem.ai/) describes
ChatGPT reading synced memories through private MCP and explicitly says ChatGPT's
own conversations are not automatically captured.
[Configuration](https://docs.claude-mem.ai/configuration) warns that the unauthenticated
local worker must not be publicly tunneled; its settings routes expose provider keys.

This prototype has no live capture, CMEM sync, private MCP, agent integration,
automatic persistence, summarizer, ranking model or autonomous handoff loop.
Retrieved text never becomes commands or authority: there is no command runner
or agent/model call. Three consumers are local simulations only. Video captions
were reported inspected by the parent research workflow; this spike has no
timestamp or visual proof. Autonomous cross-agent handoff remains a future vision,
not demonstrated implementation.

Use synthetic input only. The `synthetic:true` flag is a caller assertion, not a
privacy detector. No secret redaction or DLP is implemented or claimed. The library
does not inspect credentials, environment variables or private sources. Its
project boundary is an in-process data contract, not multi-user authentication.
Read-only mode prohibits subsequent imports; all library operations are otherwise
pure in memory and cannot write source files. Removing this new directory and
closing the draft reverses the experiment without runtime infrastructure cleanup.

## Verification receipt

Author checks on 2026-10-21 with Node 24.19.0: **19 PASS / 0 FAIL / 0 SKIP**,
including exports through two separate Node processes and untouched source bytes
and modification time. The restricted demo above also passes. Five disposable
copies, each disabling one guard (head change, ID integrity, accumulated bytes,
read-only import, inherited optional settings), each produce **18 PASS / 1 FAIL**.
An earlier accumulated-byte mutation survived; the larger-text regression added
for that gap now detects it. The initial missing-module RED did not run assertions
and is not behavioral regression evidence.

Four module syntax checks, strict scorer-lock report, repository docs-safety
scanners and whitespace checks pass. Product build/full suite, hosted CI and live
behavior are not established by these isolated tests. Peer review found no
remaining issues; repository independent acceptance is pending. The draft PR
description binds the final source head to the evidence. Final collision refresh:
115 open PRs inspected, no other PR lists this new directory.

## Preflight receipt

2026-10-21: base `verdant-grow-diary` at
`05f5138d08c943921df0ce224af8d9c0837c09d9`; branch
`codex/shared-context-20261021-offline`. Codex holds this explicitly assigned
slice. Local checkout clean before creation. Fresh GitHub inspection covered 114
open PRs; none listed the new directory. #2290 and merged #2284 concern the
distinct Cursor SDK spike, which is excluded. #2133 concerns operational handoffs;
this experiment implements no handoff delivery or authority. Shared fleet locks
and other-chat activity unavailable; no global collision guarantee. GitHub
comments remain outside this task's permission. Independent acceptance routes to
Critical Mass; the author cannot provide it. The PR description carries current
head, validation and next-step evidence; canonical governance is unchanged.
