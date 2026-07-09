# Diary storage buckets — server-side limits (verification + apply runbook)

Last verified: 2026-07-07 against production `storage.buckets`.

## Scope

Two private buckets host diary media:

- `diary-videos`
- `diary-photos`

Client upload rules already enforce size + MIME allow-lists. This runbook
pins the same rules server-side so a client bypass cannot upload larger or
disallowed files. Bucket privacy and owner-scoped RLS on `storage.objects`
are already in place; this doc does not change them.

`storage.buckets` writes are blocked from tooling in this workspace, so
`file_size_limit` and `allowed_mime_types` must be applied via the backend
Storage console. This file is the pinned source of truth for the values.

## Current server-side state (verified)

| Bucket         | public | file_size_limit | allowed_mime_types |
| -------------- | ------ | --------------- | ------------------ |
| `diary-videos` | `f`    | `NULL`          | `NULL`             |
| `diary-photos` | `f`    | `NULL`          | `NULL`             |

Query used:

```sql
SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
 WHERE id IN ('diary-videos','diary-photos')
 ORDER BY id;
```

Both buckets are private. Neither has a size cap or MIME allow-list at the
storage layer. All enforcement today lives in the client rule modules and
the contract test in `src/test/diary-storage-buckets-contract.test.ts`.

## Required server-side settings

### `diary-videos`

- `public`: `false` (unchanged)
- `file_size_limit`: `104857600` (100 MB)
- `allowed_mime_types`:
  - `video/mp4`
  - `video/quicktime`
  - `video/webm`

### `diary-photos`

- `public`: `false` (unchanged)
- `file_size_limit`: `26214400` (25 MB)
- `allowed_mime_types`:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/heic`
  - `image/heif`

`image/svg+xml` is intentionally excluded (script-capable vector). No
`video/*` types are allowed on `diary-photos`.

## Owner-scoped `storage.objects` policies (verified intact)

The following policies already exist and MUST remain in place unchanged:

- `diary-videos`: `Users upload own diary videos` (INSERT),
  `Users view own diary videos` (SELECT),
  `Users update own diary videos` (UPDATE),
  `Users delete own diary videos` (DELETE) — all scoped by
  `(auth.uid())::text = (storage.foldername(name))[1]`.
- `diary-photos`: matching owner-scoped INSERT / SELECT / UPDATE / DELETE
  policies (both the `Customers*` and `Users*` variants), plus
  `Operators view all diary photos` (SELECT, operator role only).

Do NOT drop or rewrite these policies as part of applying the size/MIME
limits. The console-side edit only touches `file_size_limit` and
`allowed_mime_types` on the bucket row.

## Apply steps (backend Storage console)

For each bucket:

1. Open Backend → Storage → select the bucket.
2. Confirm the bucket is Private.
3. Set File size limit to the value above (100 MB / 25 MB).
4. Set Allowed MIME types to the exact list above.
5. Save.

## Verification query (after apply)

```sql
SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
 WHERE id IN ('diary-videos','diary-photos')
 ORDER BY id;
```

Expected:

- `diary-videos`: `public=f`, `file_size_limit=104857600`,
  `allowed_mime_types={video/mp4,video/quicktime,video/webm}`.
- `diary-photos`: `public=f`, `file_size_limit=26214400`,
  `allowed_mime_types={image/jpeg,image/png,image/webp,image/heic,image/heif}`.

Then re-run the contract test:

```
bunx vitest run src/test/diary-storage-buckets-contract.test.ts
```

## Rollback

Clear `file_size_limit` and `allowed_mime_types` on the affected bucket in
the same console. Client-side rules remain enforced regardless.
