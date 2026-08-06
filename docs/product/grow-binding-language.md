# Create-time grow binding — language & behavior

Product rules for **Create tent** / **Create plant** on the production deploy branch.

## States

| Kind                          | Grower sees                           | Submit                                        |
| ----------------------------- | ------------------------------------- | --------------------------------------------- |
| `loading`                     | Loading your setup                    | blocked                                       |
| `read_error`                  | Current setup unavailable + **Retry** | blocked (never “Start your room”)             |
| `no_setup`                    | Start your room first                 | blocked → `/grows?intent=one_tent_activation` |
| `requested_setup_unavailable` | Choose a current setup                | blocked (**no** active-grow fallback)         |
| `choose_setup`                | Pick which setup…                     | blocked                                       |
| `ready`                       | Adding to {name}                      | allowed with `grow_id`                        |

## Supplied tent (“Add Plant to This Tent”)

| Kind                                        | Behavior                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| pending                                     | Clear unsafe form value; retain conflict context; block submit; **no** tentless create                           |
| unavailable (tent read error)               | Clear unsafe form value; Retry only; **no** compatible-replacement or nested-create escape                       |
| unavailable (missing after successful load) | Clear unsafe form value; explicitly choose/create a verified compatible tent                                     |
| orphan / mismatch                           | Clear unsafe form value; **Finish setup** → `/grow-lineage`; require an explicit verified compatible replacement |
| ready                                       | Write `grow_id` + `tent_id`                                                                                      |

Initial loading and background refetch (`isFetching`) both count as pending; cached remote rows are not treated as verified while a fetch is in flight or after a read failure. A tent returned by the nested creator is locally verified against the resolved setup and may be selected while the background tent list is still loading. A tent read error remains Retry-only.

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
