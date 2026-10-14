# Third-party agent skills — adoption register

A record of external agent-skill bundles, hooks and procedures reviewed for use by the agents
working on this repository, and what was decided about each. It is the place to check before
installing, enabling or copying in an outside skill.

This register covers **agent tooling**: Claude, Codex, Grok and Gemini skills, hooks and
commands. It does not cover Verdant's product skill runtime. That runtime has its own
[authoring contract](../skills/verdant-skill-authoring-contract.md) and
[promotion policy](../skills/verdant-skill-promotion-policy.md).

A verdict here grants no permission. Installation, hook enablement and repository changes each
need their own authorized task. `AGENTS.md`, `CLAUDE.md`, `docs/agents/OWNERSHIP.md` and the
role files keep authority over any third-party instruction.

## Standing rules for any outside skill

1. **Existing authority wins.** A third-party skill never expands permissions, overrides an
   owner hold, or replaces a governance file. Setup snippets that overwrite `AGENTS.md`,
   `GEMINI.md` or another root instruction file are not applied.
2. **Procedures before code.** A Markdown procedure can be adapted into a Verdant skill. Hooks
   and scripts are not enabled until they have been read in full, their failure paths have
   been tested in an isolated fixture with no credentials or production connections, and an
   authorized task enables them.
3. **Pin what is copied.** Before any third-party text or code is copied in, record the
   upstream source, the exact revision and the license. A link to a repository does not prove
   that a given copy came from it. A Verdant skill written from scratch from an outside
   concept copies nothing, so it needs no pin, but its entry must say that no text was copied.
4. **One router per host.** A host that routes skills natively does not also get a startup
   router hook.
5. **Evidence keeps its label.** A cached summary is not current evidence, a lexical routing
   score is not proof of behavior, and a source-only review is not a runtime test.

## Register

### `addyosmani/agent-skills` upload (reviewed 2026-10-04 UTC)

**Verdict: adopt selected workflow ideas; do not install the upload as a pack or enable its
hooks as supplied.**

- **Source:** an owner-supplied upload of 24 files (18 unique: 12 Markdown documents and six
  shell scripts), plus a separate 25th file, the `idea-refine` skill definition. The upload
  names `addyosmani/agent-skills` but carries no pinned commit, manifest or license.
  Provenance is `missing evidence`.
- **Review:** an owner-supplied static review, shared in an agent session on 2026-10-04 UTC.
  It is not archived in this repository. The component findings below are `source claim`s
  from that review and were not re-verified here. No uploaded script or test was run, sourced
  or installed, and no pass or fail count was measured.

Decisions by component:

- **Workflow guidance** (small verifiable tasks, failing test first, explicit handoffs):
  **adopted as ideas.** Verdant's existing process already requires most of it.
- **Skill anatomy and three-tier evaluation design** (structure, routing, behavior):
  **adopted as authoring guidance.** The eval runner, cases and results were not supplied, so
  no score from them is evidence.
- **`doubt-driven-development` procedure:** **adapted** as
  `.claude/skills/verdant-doubt-check/SKILL.md` (`#1890`). It was written from scratch from the
  concept, and no text was copied because the upload has no license. It has no hooks or
  scripts.
- **Host setup guides** (Copilot, Cursor, Gemini, OpenCode): **reference only.** The snippets
  that overwrite `GEMINI.md`, replace `AGENTS.md` with a generic template, or run a broad
  `rsync` over customized skills are rejected.
- **`session-start.sh` router hook:** **omitted.** Native skill routing already exists, and the
  meta-skill it loads was not supplied.
- **`sdd-cache-pre.sh` / `sdd-cache-post.sh` documentation cache:** **deferred.**
  - The stored validator is not bound to the stored body.
  - Entries are keyed by URL only, so a different question can get an earlier answer.
  - Reads are not snapshot-consistent.
  - There is no host allowlist or redirect policy, and URLs, prompts and responses are kept
    in plaintext.

  Never usable as current-source evidence.

- **`simplify-ignore.sh` source-hiding hook:** **rejected.**
  - An ordinary Edit or Write can discard protected code.
  - Malformed input triggers project-wide restoration, and its own test reaches that path.
  - A Read rewrites the working tree with no session ownership, which conflicts with the
    one-branch, one-holder rule.
  - Bash 5.2+ can corrupt `&` on restore.
  - Warnings exit 0 and are not shown to the agent.
- **`idea-refine` skill:** **usable manually for early product exploration, not installed.**
  Speculative alternatives must not widen approved scope. Its referenced `frameworks.md`,
  `refinement-criteria.md`, `examples.md` and helper script were not supplied.

**Account-level skills with the same names.** Sessions on this account list
`anthropic-skills:code-review-and-quality`, `anthropic-skills:api-and-interface-design` and
`anthropic-skills:browser-testing-with-devtools`. Their names match this bundle, but their
source, revision and license could not be read from a session container. Treat them as
unvetted until their exact contents are pinned and read. They never stand in for a named
independent reviewer seat. `#1897` merged as `a980489a`. Its
[`SKILL.md:10`](https://github.com/Verdant-OS/verdant-grow-diary/blob/a980489ad5188e36eba89461117c2b60fc10f927/.agents/skills/verdant-exact-sha-review/SKILL.md#L10)
references the unpinned box copy of `code-review-and-quality` at
`/home/box/agent-data/workflows/code-review-and-quality/SKILL.md` for review axes only:
correctness, readability, architecture, security and performance. That copy's approval
standard does not apply; the Verdant review
loop governs verdicts, and `docs/agents/recurring-review-findings.md` is the checklist authors
run before review. This register records that axes-only use. Pinning the copy or adopting it
as a standing review checklist is a separate step under the next step below.

**Smallest next step, if wanted.** Pin one complete `code-review-and-quality` skill and its
references. Run it by hand in a read-only session against a closed historical diff, with no
hooks and no credentials. Compare it with a baseline review on actionable findings, false
positives and missed known issues. Stop there; any adoption is a separate small draft PR.

### Ten owner-uploaded Claude Code plugins (reviewed 2026-10-14 UTC)

**Verdict: install none as a pack. Disable the two active hooks below. Adapt a few procedures
from askrubberduck and frontier-simplify; treat the rest as reference only or not applicable.**

- **Source:** ten owner-supplied plugin zips shared in Claude session
  `session_01JSec9FtV5reKb9tgk6gFur`. Each `plugin.json` names an upstream repository, but no
  archive carries a commit pin, so whether the archive matches upstream is `missing evidence`.
  The archive SHA-256 prefixes below identify the exact copies reviewed.
- **Review:** Claude read the manifests, hook configs, MCP configs, licenses, skill
  descriptions and outbound URLs in a scratch directory. No plugin script, test or hook was
  run from the archives, so behavior claims are `NOT_MEASURED` except the two live
  observations under **Already active on this account**.
- **No text copied.** Nothing from these archives entered the repository.

**Already active on this account** (`established fact`, observed in the review session):

- **AgentOne Token Compression:** its PostToolUse hook replaced a Bash result with a
  compressed version (reported 2060→1833 tokens). It also hooks Read, Grep, Glob, WebFetch and
  user prompts. A lossy rewrite of tool output undermines exact pass/fail counts, SHAs and
  pinned copy strings.
- **simple-workflow:** its `pre-bash-safety.sh` blocked a read-only `grep` because the search
  pattern contained the word "curl", and blocked deletion of the session's own scratch
  directory. An unrequested commit adding `.simple-workflow/` to `.gitignore` also appeared on
  the session branch at session start (`inference`: from this plugin, by its content and
  timing); it was discarded unpushed.
- The account's skill listing also shows skillquiver, frontier-simplify, agent-smith,
  advise-project-approach, aictrl and 3doptix as installed (`inference` from the listing).

Decisions by plugin:

- **askrubberduck 3.12.4, MIT, `1401fce6f8ec`:** **Adapt selected procedures**, written from scratch
  or pinned. `duck-split` is **adapted** as `.claude/skills/verdant-scope-split/SKILL.md` and
  `duck-why` as `.claude/skills/verdant-root-cause/SKILL.md`, `duck-scan` as
  `.claude/skills/verdant-work-scan/SKILL.md` and `duck-race` as
  `.claude/skills/verdant-model-race/SKILL.md`. All four were written from scratch from the
  concept, copy no text, and have no hooks or scripts. `duck-land` and
  `duck-sweep` are **rejected**: merging and branch cleanup belong to the merge seat and the holder.
  `duck-proof` overlaps `verdant-doubt-check`.
- **claude-context-optimizer 4.12.1, MIT, `4dbab2e2fd2f`:** **Reports deferred** (`cco-overhead`,
  `cco-claudemd`) to a manual read-only trial. **Hooks rejected:** `src/read-cache.js` returns
  `decision: block` on re-reads and on `.contextignore` matches, which stops an agent re-reading a
  file it must re-verify.
- **frontier-simplify 2.1.0, MIT, `2dcabf4d6c32`:** `frontier-simplify-audit` is **adapted** as
  `.claude/skills/verdant-process-audit/SKILL.md`, a read-only diagnostic that reports to
  Matthew. It was written from scratch from the concept, copies no text, has no hooks or
  scripts, and never edits or removes an owner-set gate. The rest of the plugin is reference only.
- **Advise Project Approach 0.7.2, MIT, `6612280f04e3`:** **Adopted as an idea** for specification
  work: research comparable projects and failure conditions before build advice, with Verdant's
  claim labels.
- **Agent Smith 2.5.1, MIT, `879fc14ecf0d`:** **Reference only.** A read-only `analyze-agent` run is
  acceptable. `create-agent` can write instruction files, which rule 1 forbids.
- **skillquiver 2.2.0, MIT, `69f78f97d1a5`:** **Duplicate.** Its skill names repeat superpowers and
  beads-superpowers, which breaks rule 4. `skillquiver-doctor` may be run once, read-only, to list
  conflicting routers and hooks.
- **simple-workflow 10.1.0, Apache-2.0, `6d770964d9de`:** **Hooks rejected; reference only.** Its
  autopilot, ticket and ship flow competes with `HANDOFF_LOG.md`, the merge queue and the review
  seats.
- **AgentOne Token Compression 1.1.16, proprietary (free use), `dda771a9314b`:** **Rejected.**
  Rewrites tool output and prompts. Its license grants Iterate.ai an unrestricted licence to any
  feedback sent to them.
- **Aictrl.dev 1.1.0-beta.2, MIT, `4c4cb890fb9b`:** **Reference only; MCP and scripts rejected.** It
  registers the hosted MCP `https://aictrl.dev/mcp`, and its scripts call ElevenLabs, typesafe.ai
  and the YouTube upload API with credentials. `spec-review`, `root-cause-analysis` and
  `measurement-plan` are usable as ideas.
- **3DOptix 1.0.0, MIT, `22d5b750570e`:** **Not applicable.** Optical ray-trace simulation through a
  hosted MCP that needs an account; outside the One-Tent Loop.

**Smallest next step, if wanted.** Matthew disables the AgentOne and simple-workflow hooks in
the plugin settings.

## Adding an entry

Add a dated section under **Register** naming the source, the evidence actually gathered, and
a decision per component: adopted, adapted (with the Verdant file), reference only, deferred
(with what would close it) or rejected (with the reason). Keep unmeasured claims labelled
`NOT_MEASURED` or `missing evidence`.
