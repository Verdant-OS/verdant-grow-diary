# Grow binding language

Grower-facing copy for setup binding uses **setup** vocabulary.

## Approved terms

- setup
- current setup
- Start your room
- Finish setup
- different setup

## Forbidden in grower-facing UI

Do not show these words or phrases to growers:

- `grow_id`
- orphan
- unbound
- lineage repair
- backfill
- migration
- constraint

Internal code, tests, and operator tools may use technical terms. Dialog banners,
toasts, and CTAs must not.

## Create-dialog states

| State               | Primary CTA                                           | Secondary |
| ------------------- | ----------------------------------------------------- | --------- |
| Zero setups         | Start your room → `/grows?intent=one_tent_activation` | Not now   |
| Loading setups      | (none)                                                | —         |
| Tent/setup mismatch | Finish setup → `/grow-lineage`                        | —         |

Copy constants live in `src/constants/growSetupMessages.ts` (`growSetup.noSetup.*`,
`growSetup.create.*`, `growSetup.mismatch.*`).
