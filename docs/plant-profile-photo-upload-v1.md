# Plant Profile Photo Upload — V1

Native, private-storage upload for the plant profile photo. The
grower can take a photo or choose from their device library from
Edit Plant; no URL is ever required.

## Scope

- Edits the plant's `photo_url` only.
- Uses the existing private `diary-photos` bucket.
- Does not create diary/timeline events, alerts, Action Queue items,
  sensor readings, or trigger AI / Edge Functions / device control.
- No schema, RLS, migration, or storage-policy changes.

## Reference contract

`plants.photo_url` may hold any of the following, in priority order:

| Format                                            | Kind       | Rendering                            | Origin              |
| ------------------------------------------------- | ---------- | ------------------------------------ | ------------------- |
| `storage://diary-photos/<owner>/…`                | `storage`  | Signed URL from private bucket       | V1 native upload    |
| `https://…` / `http://…`                          | `external` | Pass-through                         | Legacy plants       |
| `data:image/(png\|jpeg\|webp\|gif\|avif);…`       | `data`     | Pass-through                         | Legacy plants       |
| _empty / null / whitespace_                       | `clear`    | Placeholder                          | Cleared plants      |

`blob:` URLs are treated as ephemeral previews and are never
persisted.

Validation rejects unknown buckets, empty paths, leading slashes,
`..` traversal, backslashes, query strings, fragments, control
characters, and any path whose first folder does not match the
authenticated user id.

Storage object paths are not surfaced in visible UI or grower-facing
error copy.

## File limits

- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `image/heic`,
  `image/heif`.
- Max size: 25 MB (matches the server-side bucket contract in
  `docs/diary-storage-bucket-server-side-limits.md`).
- SVG, GIF, AVIF, video, blank/unsupported types, and empty files are
  rejected with sanitized grower-safe copy.
- Stored file extension is derived from the validated MIME, never
  from the (untrusted) filename.

## Upload path

```
<user-id>/<grow-id|unassigned>/plant-profiles/<plant-id>/<random-id>.<ext>
```

- First segment is always the authenticated user id (aligns with the
  owner-scoped RLS policies on `storage.objects`).
- Random id from `crypto.randomUUID()` when available.
- `upsert: false` — never overwrites an existing object.

## Signed display URL behavior

`PlantPhoto` delegates to `usePlantProfilePhotoSource`, which:

- Passes legacy http(s)/data:/blob: values through unchanged.
- Exchanges storage references for a bounded (30-minute) signed URL
  scoped to the authenticated viewer.
- Caches via React Query and refreshes before expiry.
- Falls back to the standard placeholder on resolver failure or
  invalid/wrong-owner references.
- Never persists or logs the signed URL.

## Non-destructive replace / clear

Replacing the profile photo writes a new reference to
`plants.photo_url`. The previous storage object is intentionally not
deleted in V1:

- Legacy URLs may not be owned by Verdant.
- Older storage references may be shared or not safely attributable.
- Destructive cleanup requires a separate ownership + retention
  policy.

Clearing sets `plants.photo_url = null` and does not remove any
storage object.

## Failure and cleanup

| Failure                        | Behavior                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| File validation                | Dialog stays open, inline `role="alert"` error, no upload attempted                 |
| Storage upload                 | Plant row is not updated; selection retained; sanitized retry copy                   |
| Plant row update after upload  | Uploaded object is removed; previous profile photo is unchanged; sanitized retry     |

## Legacy URL compatibility

Legacy external and data:image URLs continue to render on Plant
Detail, Plants list, Tent Detail plant cards, and the Edit Plant
preview. The primary UX no longer offers a URL text input.

## Limitations

- No background/queued upload — upload runs during Save.
- No client-side image resizing.
- Old storage objects are not garbage-collected in V1.
- HEIC/HEIF preview relies on browser support; unsupported browsers
  still upload the file but show the placeholder in-dialog until
  saved.

## Rollback

Revert the following files to their pre-V1 state to restore the URL
text input:

- `src/components/EditPlantDialog.tsx`
- `src/components/PlantPhoto.tsx`
- `src/components/PlantPhotoView.tsx`
- `src/hooks/usePlantProfilePhotoSource.ts`
- `src/lib/plantProfilePhotoStorageRules.ts`
- `src/lib/plantProfilePhotoFileRules.ts`
- `src/lib/plantProfilePhotoUploadService.ts`

No storage, schema, or RLS rollback is required.
