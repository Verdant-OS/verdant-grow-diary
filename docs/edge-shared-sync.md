# Edge shared-lib sync

Edge functions in `supabase/functions/**` may not import `src/lib/**`,
`src/constants/**`, or `src/integrations/supabase/types.ts` directly. The
Lovable sandbox bundler (`supabase--deploy_edge_functions`) resolves each
function in isolation and cannot reach out of its own directory.

To keep `src/lib/**` as the **single source of truth** for shared rules,
constants, and generated types, we mirror the exact subset of `src/**` that
edge functions transitively use into `supabase/functions/_shared/lib/**`.
The mirror is generated. Never hand-edit it.

## How it works

`scripts/sync-edge-shared.mjs` walks every `supabase/functions/<fn>/*.ts`
entry file plus `supabase/functions/_shared/*.ts`, resolves every import
that lands under `src/lib/**`, `src/constants/**`, or the Supabase types
file, and:

1. Copies each reachable source file into
   `supabase/functions/_shared/lib/<same-relative-path>` with a
   `@generated` banner and a sha256 of the source.
2. Rewrites `@/lib/*`, `@/constants/*`, `@/integrations/supabase/types`
   imports inside mirrored files to relative paths inside the mirror.
3. Rewrites entry-file imports (`../../../src/lib/foo.ts`, `@/lib/foo`,
   etc.) to relative paths into the mirror.
4. Writes a manifest at `supabase/functions/_shared/lib/.sync-manifest.json`
   containing every source file's sha256.

Forbidden imports (frontend-only code such as `@/components`, `@/hooks`,
`@/pages`, `@/context`, `@/fixtures`, `@/integrations/supabase/client`,
`react`, `react-dom`, and any other `@/` alias not listed above) cause the
generator to fail loudly instead of silently pulling browser code into
Deno.

## Commands

```bash
# Regenerate the mirror + rewrite entries. Commit the result.
bun run sync-edge-shared

# Verify the committed mirror matches src/ exactly (CI runs this).
bun run verify-edge-shared-in-sync
```

## When to regenerate

Any time you:

- Change a `src/lib/**` file that an edge function transitively imports.
- Change `src/constants/**` in a file the edge closure reaches.
- Regenerate `src/integrations/supabase/types.ts`.
- Add or remove a `src/lib` / `src/constants` import from an edge function.

The `edge-shared-sync` GitHub Actions workflow blocks merges when the
committed mirror is out of sync with `src/`.

## Rollback

Delete `supabase/functions/_shared/lib/` and revert edge-function entry
files to their pre-sync form (`../../../src/lib/**` imports). Frontend
code is untouched; only the Lovable sandbox deploy lane will regress.
