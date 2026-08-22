# MACAE Solution Accelerator — reference ingest

**Status: `REFERENCE_ONLY`.** This document exists so Verdant agents can learn from an
external multi-agent accelerator **without cloning and re-reading 33 MB of unrelated
Azure code**. It authorises no build, no slice, and no port. Nothing in this document
changes Verdant's build order, architecture, or safety rules.

| Field             | Value                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| Source repository | `Verdant-OS/multi-agent-custom-automation-engine-solution-accelerator` (public) |
| Measured at       | `b4a4a00` on `main` — "Merge pull request #1069", 2026-06-27                    |
| Read on           | 2026-08-22, shallow clone (`--depth 1`)                                         |
| Owner             | Claude (Knowledge Library and Product Specification Architect)                  |
| Scope             | Reference ingest only. No product code, schema, RLS, migration, or publish.     |
| Runtime behaviour | `NOT_MEASURED` — never deployed or executed                                     |

**Scoping provenance (`source claim`):** relayed by Cheek as "Grok has scoped this demo
for all agents to read and ingest for future builds", authorised 2026-08-22 as a
docs-only slice. The upstream accelerator is Microsoft's; Verdant-OS holds a copy.

---

## 1. Mandatory do-not-port rules

Read these before any other section. They bind every agent who reads this document.

1. **The in-memory approval store is an anti-pattern for Verdant.**
   `HumanApprovalMagenticManager` keeps approval state in
   `OrchestrationConfig` (`src/backend/v4/config/settings.py`) as
   `self.approvals: Dict[str, bool]` coordinated by `asyncio.Event`, with
   `default_timeout: float = 300.0`. A process restart, a second replica, or a human who
   takes longer than five minutes loses the decision, and that path keeps no audit
   record. **Do not reproduce this shape in Verdant.**
2. **Verdant's Action Queue stays durable.** Every item keeps `reason`, risk level,
   related grow/tent/plant/alert where available, `status`, and an **append-only audit
   trail**, enforced at the database with RLS. Approval is a persisted row, never a
   dict entry, never process memory.
3. **Read the approval-gate _shape_ and the tools-as-services separation. Port nothing
   else.** Specifically: **do not port** the Azure runtime, Cosmos DB, Container Apps,
   the websocket orchestration transport, or the in-memory approval store.
4. **Automation last.** `AGENTS.md`: "Diary first. Sensors second. AI third. Automation
   last." Do not expand into heavy automation, orchestration engines, or device control
   until the One-Tent Loop is clean, safe, and tested. This accelerator is an automation
   engine — the last item in that order, not the next one.

---

## 2. What the accelerator is

Microsoft's **Multi-Agent Custom Automation Engine**: a reference implementation of LLM
agents that plan and execute multi-step business tasks behind a human approval gate.

All rows below are `established fact`, read from source at `b4a4a00`.

| Concern         | What it actually is                                                   |
| --------------- | --------------------------------------------------------------------- |
| Cloud           | Azure — OpenAI Service, Container Apps, Cosmos DB, Container Registry |
| Backend         | Python — `src/backend`, 62 files / 9,238 lines                        |
| Agent framework | `agent_framework` + `agent_framework_orchestrations._magentic`        |
| Frontend        | React + TypeScript — `src/App/src`, 103 files / 11,917 lines          |
| Tool server     | FastMCP — `src/mcp_server`, 16 files / 1,160 lines                    |
| Tests           | `src/tests`, 43 files / 21,139 lines                                  |
| Infrastructure  | Bicep under `infra/`, `azure.yaml`, `azd` deploy                      |
| Git LFS         | none                                                                  |

**Stack mismatch is total.** Verdant is TanStack Start (SSR) on Supabase with Deno edge
functions. Azure, Python, Cosmos DB and Container Apps share no runtime surface with it.
Treat every code-level detail here as illustrative, never as a template.

## 3. Architecture, as read

**Orchestration.** `v4/orchestration/orchestration_manager.py` drives a Magentic
planner/ledger loop. `v4/orchestration/human_approval_manager.py` (425 lines) subclasses
`StandardMagenticManager` and overrides `plan()` to insert the gate: build plan → emit a
`PlanApprovalRequest` over websocket → block in `_wait_for_user_approval()` → execute
only when `approved` is true.

**Agents.** `v4/magentic_agents/` — `magentic_agent_factory.py` constructs agents,
`foundry_agent.py` wraps Azure AI Foundry agents, `proxy_agent.py` is the
ask-the-human escape hatch. `v4/config/agent_registry.py` tracks lifecycles in a
process-global `WeakSet` behind a `threading.Lock`.

**Tools.** `src/mcp_server/mcp_server.py` registers domain services (`HRService`,
`MarketingService`, `ProductService`, `TechSupportService`) into an `MCPToolFactory`,
served over FastMCP with optional `JWTVerifier` auth.

**Orchestration invariants are enforced in prompt text, not code.** The manager appends
large natural-language rule blocks to the stock planner prompts — "Never ask the user for
information or clarification until all agents on the team have been asked first", "Each
agent should only be called ONCE", "DO NOT EVER OFFER TO HELP FURTHER IN THE FINAL
ANSWER". `inference, high confidence`: rules of that kind hold only as well as the model
follows them, and cannot be tested the way a code path can. Where Verdant has an
equivalent invariant, it belongs in a `*Rules.ts` module with tests, not in a prompt.

## 4. The two things worth learning

### 4.1 Approval-gate shape

Verdant's Action Queue is already approval-required. The accelerator's gate is the same
shape, and its structure is worth reading:

- The plan is a **first-class object with an id**, rendered to a human before anything runs.
- Approval is a **distinct awaited step**, not a flag consulted after execution starts.
- There is an **explicit timeout path** and an **explicit cleanup path**.
- **Rejection and timeout are ordinary outcomes**, not exceptions that crash the run —
  matching `AGENTS.md`: "Quota denials should be calm, expected responses, not crashes."

Learn the shape. Persist the state per rule 2 above.

### 4.2 Tools as services, not prompt text

Capabilities are Python service classes registered into a factory and exposed as MCP
tools, rather than described in prompt strings. That separation is sound and mirrors
Verdant's own layering — capability logic in modules, presenters stay thin.

## 5. What is demo-grade and should not be read as guidance

- **In-memory approval store** — see rule 1. The single most important warning here.
- **`agent_registry.py`** is a process-global with a `threading.Lock`: adequate for one
  container, not a model for multi-instance state.
- **`__azurite_db_queue__.json` / `__azurite_db_queue_extent__.json`** are committed at
  repository root. Local Azurite emulator scratch, not artifacts to imitate.

## 6. Access facts for the next agent

- Public repository; the session git proxy serves anonymous reads, so no attachment is
  needed to clone it.
- Read-only shallow clone used for this ingest:
  `/home/user/verdant-os/multi-agent-custom-automation-engine-solution-accelerator`
  (33 MB; `.git` 12 MB). Ephemeral — it does not survive the container.
- For history: `git fetch --unshallow`. For push or GitHub API access: re-attach with
  `access: "push"`, which lands at a **different** path and needs a fresh clone.

## 7. Status ledger

| Item                                                           | Status                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| Repository cloned and structurally read                        | `PASS`                                                  |
| Orchestration and approval path read at source                 | `PASS`                                                  |
| Do-not-port rules recorded in this file and `CURRENT_STATE.md` | `PASS`                                                  |
| Collision with another agent's open work                       | `NO_DATA` — no MACAE reference found in this repository |
| Runtime behaviour of the accelerator                           | `NOT_MEASURED` — never deployed or executed             |
| Applicability to any specific Verdant slice                    | `NOT_MEASURED` — no slice assigned                      |
| Independent peer review of this ingest                         | pending — owner Claude, reviewer to be named            |
