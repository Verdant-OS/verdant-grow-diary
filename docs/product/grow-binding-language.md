# Create-time grow binding — language & behavior

Product rules for **Create tent** / **Create plant** on the production deploy branch.

## States

| Kind | Grower sees | Submit |
| --- | --- | --- |
| `loading` | Loading your setup | blocked |
| `read_error` | Current setup unavailable + **Retry** | blocked (never “Start your room”) |
| `no_setup` | Start your room first | blocked → `/grows?intent=one_tent_activation` |
| `requested_setup_unavailable` | That setup isn’t available | blocked (**no** active-grow fallback) |
| `choose_setup` | Pick which setup… | blocked |
| `ready` | Adding to {name} | allowed with `grow_id` |

## Supplied tent (“Add Plant to This Tent”)

| Kind | Behavior |
| --- | --- |
| pending | Keep tent id; block submit; **no** tentless create |
| unavailable | Retry; block submit |
| orphan / mismatch | Blocked presenter; require explicit compatible tent |
| ready | Write `grow_id` + `tent_id` |

## Schema

- Client plant **insert** requires `grow_id: uuid` (`PlantInsertPayloadSchema`).
- `tent_id` optional outside guided / supplied-tent paths.
- Legacy null-linked rows remain readable.

Source: `src/constants/growSetupMessages.ts`, `src/lib/createDialogGrowBindingRules.ts`.
