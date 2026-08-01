# Create-time grow binding — language & behavior

Product rules for **Create tent** / **Create plant** on the production deploy branch.

## States

| Kind                          | Grower sees                           | Submit                                        |
| ----------------------------- | ------------------------------------- | --------------------------------------------- |
| `loading`                     | Loading your setup                    | blocked                                       |
| `read_error`                  | Current setup unavailable + **Retry** | blocked (never “Start your room”)             |
| `no_setup`                    | Start your room first                 | blocked → `/grows?intent=one_tent_activation` |
| `requested_setup_unavailable` | That setup isn’t available            | blocked (**no** active-grow fallback)         |
| `choose_setup`                | Pick which setup…                     | blocked                                       |
| `ready`                       | Adding to {name}                      | allowed with `grow_id`                        |

## Supplied tent (“Add Plant to This Tent”)

| Kind                                        | Behavior                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pending                                     | Keep tent id; block submit; **no** tentless create. Includes initial load **and** background refetch (`isFetching`) — cached rows are not treated as verified while a fetch is in flight. |
| unavailable (tent read error)               | Retry; block submit; **no** compatible-replacement escape                                                                                                                                 |
| unavailable (missing after successful load) | Retry; block submit until grower explicitly picks another tent that matches the target setup; still **no** tentless create                                                                |
| orphan / mismatch                           | Blocked presenter; **Finish setup** → `/grow-lineage`; require explicit compatible tent                                                                                                   |
| ready                                       | Write `grow_id` + `tent_id`                                                                                                                                                               |

## Grower-facing copy (`growSetup.*`)

| Key                    | Situation                                      |
| ---------------------- | ---------------------------------------------- |
| `growSetup.noSetup.*`  | Zero setups hard-stop                          |
| `growSetup.create.*`   | Adding to current setup / loading / pick setup |
| `growSetup.mismatch.*` | Unlinked or different-setup tent               |

Do **not** show growers: `grow_id`, orphan, unbound, lineage repair, backfill,
migration, or constraint language. Prefer **setup** vocabulary.

## Retry (create dialog only)

| Rule                  | Policy                                                         |
| --------------------- | -------------------------------------------------------------- |
| Strategy              | **Fixed 1.5s cooldown + in-flight lock** (human click)         |
| Not used              | Full jitter exponential (that is for **sensor bridge ingest**) |
| Auto background retry | Forbidden                                                      |
| After Retry           | Re-evaluate pure state machine only                            |

See [`retry-strategy-by-surface.md`](./retry-strategy-by-surface.md).

## Schema

- Client plant **insert** requires `grow_id: uuid` (`PlantInsertPayloadSchema`).
- `tent_id` optional outside guided / supplied-tent paths.
- Legacy null-linked rows remain readable.

Source: `src/constants/growSetupMessages.ts`, `src/lib/createDialogGrowBindingRules.ts`, `src/lib/createDialogRetryRules.ts`.
