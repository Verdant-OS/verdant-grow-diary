# Create-time grow binding — language & behavior

Product rules for **Create tent** / **Create plant** on the production deploy branch.

## States

| Kind | Grower sees | Submit |
| --- | --- | --- |
| `loading` | Loading your setups… | blocked |
| `read_error` | Current setup unavailable + **Retry** | blocked (never Start your room) |
| `no_setup` | Start your room first | blocked → `/grows?intent=one_tent_activation` |
| `requested_setup_unavailable` | That setup isn’t available | blocked (no active fallback) |
| `choose_setup` | Pick which setup… | blocked |
| `ready` | Adding to {name} | allowed when tent contract ok |

## Supplied tent (“Add Plant to This Tent”)

| Kind | Behavior |
| --- | --- |
| pending | Keep tent id; block submit |
| unavailable | Retry; block submit |
| orphan / mismatch | Presenter blocked; explicit compatible tent required; **zero inserts** |
| ready | Write with grow_id + tent_id |

Never degrade a supplied tent into an unrestricted tentless create.

## Client insert schema

`PlantInsertPayloadSchema.grow_id` is **required UUID**. Legacy null-linked rows remain readable on inbound guards.

Source: `createDialogGrowBindingRules.ts`, `growSetupMessages.ts`, `plantPayloadValidation.ts`.
