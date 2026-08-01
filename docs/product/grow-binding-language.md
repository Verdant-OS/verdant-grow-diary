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

| Kind              | Behavior                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| pending           | Clear unsafe form value; retain conflict context; block submit; **no** tentless create                        |
| unavailable       | Clear unsafe form value; Retry or explicitly choose/create a verified compatible tent                         |
| orphan / mismatch | Clear unsafe form value; show **Choose another tent** + **Switch setup**; require an explicit compatible tent |
| ready             | Write `grow_id` + `tent_id`                                                                                   |

Cached remote tent rows are ignored while the tent read is failing. A tent returned by the nested creator is locally verified against the resolved setup and may be selected while the background tent list is still loading.

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
