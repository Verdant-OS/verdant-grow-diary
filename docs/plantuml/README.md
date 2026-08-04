# Verdant PlantUML style pack

Shared **PlantUML** look-and-feel for governance, trust-boundary, and
architecture diagrams that need richer UML than Mermaid.

| File | Purpose |
|------|---------|
| [`style.puml`](./style.puml) | Themes + `skinparam` + stereotypes |
| [`examples/cheek-approval.puml`](./examples/cheek-approval.puml) | Cheek decision activity example |
| [`examples/agent-handoff-sequence.puml`](./examples/agent-handoff-sequence.puml) | Agent pipeline sequence example |

## When to use PlantUML vs Mermaid

| Use | Prefer |
|-----|--------|
| GitHub PR/README with zero render tooling | **Mermaid** (` ```mermaid `) — e.g. `docs/agents/cheek-approval-workflow.md` |
| Sequence with activations, class models, print/PDF UML packs | **PlantUML** + this style |
| Agent docs that must render on github.com | Mermaid |

This pack is **docs-only**. It does not change app CSS, Tailwind tokens, or runtime UI.

## Semantic colors

| Token | Hex | Meaning |
|-------|-----|---------|
| stop-ship | `#FFCDD2` / border `#C62828` | Security FAIL, do not merge |
| hold | `#FFE0B2` / border `#EF6C00` | HOLD / CHANGES_REQUESTED |
| merge / ok | `#C8E6C9` / border `#2E7D32` | Approve & merge, healthy path |
| packet | `#BBDEFB` / border `#1565C0` | Packet / process inputs |
| human | `#F3E5F5` / border `#6A1B9A` | Cheek / human authority |

Stereotypes on participants: `<<stop>>`, `<<hold>>`, `<<ok>>`, `<<packet>>`, `<<human>>`.  
Classes: `<<entity>>`, `<<edge>>`, `<<unsafe>>`.

## Include paths

From **repo root** (recommended for CI and examples):

```plantuml
@startuml
!include docs/plantuml/style.puml
' ... diagram body ...
@enduml
```

From **`docs/plantuml/`** (local drafts):

```plantuml
@startuml
!include style.puml
@enduml
```

## Render locally

Requires PlantUML (and Graphviz for class/component layouts):

```bash
# if plantuml is on PATH:
plantuml docs/plantuml/examples/cheek-approval.puml
plantuml docs/plantuml/examples/agent-handoff-sequence.puml

# or:
java -jar plantuml.jar -tpng docs/plantuml/examples/*.puml
```

Output PNG/SVG appears next to the `.puml` file (or under `-o` if you set an out dir).

Do **not** commit generated binaries unless a docs PR explicitly needs embedded images;
prefer linking source `.puml` or rendering in CI when that pipeline exists.

## Activity one-off colors

After including `style.puml`, override a single step:

```plantuml
#FFCDD2:STOP-SHIP;
#C8E6C9:Merge to verdant-grow-diary;
#FFE0B2:HOLD;
```

## Related docs

- [`docs/agents/cheek-approval-workflow.md`](../agents/cheek-approval-workflow.md) — Mermaid flowcharts + Cheek authority
- [`docs/agents/HANDOFF_PROTOCOL.md`](../agents/HANDOFF_PROTOCOL.md) — serial agent handoffs
- PlantUML skinparam reference: https://plantuml.com/skinparam

## Safety

- No secrets, tokens, connection strings, or private grow data in diagrams.
- No device-control or auto-Action-Queue implications in example captions.
- Status words stay honest: never draw a BLOCKED axis as a green “pass” box.
