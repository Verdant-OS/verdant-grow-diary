# Verdant PlantUML style pack

Shared **PlantUML** look-and-feel for governance, trust-boundary, and
architecture diagrams that need richer UML than Mermaid.

| File                                                                             | Purpose                            |
| -------------------------------------------------------------------------------- | ---------------------------------- |
| [`style.puml`](./style.puml)                                                     | Themes + `skinparam` + stereotypes |
| [`examples/cheek-approval.puml`](./examples/cheek-approval.puml)                 | Cheek decision activity example    |
| [`examples/agent-handoff-sequence.puml`](./examples/agent-handoff-sequence.puml) | Agent pipeline sequence example    |

## When to use PlantUML vs Mermaid

| Use                                                          | Prefer                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| GitHub PR/README with zero render tooling                    | **Mermaid** (` ```mermaid `) — the norm in `AGENTS.md`-adjacent agent docs |
| Sequence with activations, class models, print/PDF UML packs | **PlantUML** + this style                                                  |
| Agent docs that must render on github.com                    | Mermaid                                                                    |

This pack is **docs-only**. It does not change app CSS, Tailwind tokens, or runtime UI.

## Semantic colors — outcomes, never roles

Color belongs to **outcomes and artifacts**. Agent participants stay
neutral; painting an agent permanently green/red/amber falsifies status
before anything has happened. Color alone never carries status — pair
every colored element with its literal outcome word (`FAIL`, `PASS`,
`HOLD`, `CHANGES_REQUESTED`, `APPROVE`).

| Token      | Fill / border / text              | Meaning                                          |
| ---------- | --------------------------------- | ------------------------------------------------ |
| stop-ship  | `#FFCDD2` / `#C62828` / `#B71C1C` | a Security **FAIL** result — do not merge        |
| hold       | `#FFE0B2` / `#EF6C00` / `#8A2C00` | a **HOLD / CHANGES_REQUESTED** result            |
| merge / ok | `#C8E6C9` / `#2E7D32` / `#1B5E20` | a **PASS / APPROVE** result                      |
| packet     | `#BBDEFB` / `#1565C0` / `#0D47A1` | approval packet / process input artifact         |
| human      | `#F3E5F5` / `#6A1B9A` / `#4A148C` | Cheek / human authority (the one identity color) |

Hold **text** is `#8A2C00` (contrast-tested against `#FFE0B2` at the pack's
12px default; the brighter `#EF6C00`/`#E65100` ambers fail 4.5:1 for
normal text and are used for borders only).

Stereotypes: `<<stop>>`, `<<hold>>`, `<<ok>>`, `<<packet>>` for outcome
artifacts; `<<human>>` for Cheek (styled for **both** `participant` and
`actor` element types). Classes: `<<entity>>`, `<<edge>>`, `<<unsafe>>`.

## Include paths

PlantUML resolves relative `!include` paths **from the directory of the
diagram source file** — never from whichever directory launched the
`plantuml` process. One include therefore works from anywhere:

Diagram in `docs/plantuml/examples/` (the shipped examples):

```plantuml
@startuml
!include ../style.puml
' ... diagram body ...
@enduml
```

Diagram sitting next to the style file in `docs/plantuml/`:

```plantuml
@startuml
!include style.puml
@enduml
```

Do **not** write `!include docs/plantuml/style.puml` inside a diagram —
that path only resolves for a source file at the repo root.

## Render locally

Requires PlantUML (and Graphviz for class/component layouts):

```bash
# if plantuml is on PATH (any working directory):
plantuml -tsvg docs/plantuml/examples/cheek-approval.puml docs/plantuml/examples/agent-handoff-sequence.puml

# or with the official jar:
java -jar plantuml.jar -tsvg docs/plantuml/examples/*.puml
```

Output SVG/PNG appears next to the `.puml` file (or under `-o` if you set
an out dir). Generated images are inspection artifacts only — do **not**
commit them; link the source `.puml` instead.

## Activity one-off colors

After including `style.puml`, override a single step (always with the
literal outcome word in the label):

```plantuml
#FFCDD2:STOP-SHIP;
#C8E6C9:Merge to verdant-grow-diary;
#FFE0B2:HOLD / CHANGES_REQUESTED;
```

## Related docs

- [`AGENTS.md`](../../AGENTS.md) — agent constitution, Cheek authority, status vocabulary
- [`docs/agents/HANDOFF_PROTOCOL.md`](../agents/HANDOFF_PROTOCOL.md) — serial agent handoffs
- PlantUML skinparam reference: https://plantuml.com/skinparam

## Safety

- No secrets, tokens, connection strings, or private grow data in diagrams.
- No device-control or auto-Action-Queue implications in example captions.
- Status words stay honest: never draw a BLOCKED axis as a green "pass" box.
