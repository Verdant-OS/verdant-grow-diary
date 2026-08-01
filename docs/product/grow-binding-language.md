# Create-time grow binding — language & behavior

Product rules for **Create tent** / **Create plant** on the production deploy branch.

## Behavior

- Resolved setup = page `?growId=` (when valid) then **current active setup**.
- **Always** write `grow_id` on successful create; never optional-omit.
- Zero setups → hard-stop: **Start your room first** → `/grows?intent=one_tent_activation`.
- Orphan / mismatched tent selection cannot reach insert.

## Grower-facing copy

| Situation   | Copy                                                             |
| ----------- | ---------------------------------------------------------------- |
| No setup    | Start your room first / need a setup before adding tent or plant |
| Primary CTA | Start your room                                                  |
| Known setup | Adding to {name} / This will live in your current setup          |
| Wrong tent  | This tent is in another setup                                    |
| Orphan tent | Finish setup → `/grow-lineage`                                   |

Do **not** show: `grow_id`, orphan, lineage, backfill.

Source: `src/constants/growSetupMessages.ts`, `src/lib/createDialogGrowBindingRules.ts`.
