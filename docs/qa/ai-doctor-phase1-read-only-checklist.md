# AI Doctor Phase 1 — Read-Only QA Checklist

Manual QA for `/operator/ai-doctor-phase1`. Read-only flow — confirm no writes,
no live AI/model calls, no Action Queue writes, no device control.

## A. Route and selection

- [ ] Open `/operator/ai-doctor-phase1` (requires Operator Mode).
- [ ] No-plants state renders cleanly.
- [ ] Selecting a plant updates the URL with `plantId`.
- [ ] Reloading the deep link restores the same plant.
- [ ] Unknown plantId blocks result rendering and shows guidance.
- [ ] Clearing selection returns to picker.

## B. Deep links

- [ ] Internal link includes `plantId` (and `growId`/`tentId` when available).
- [ ] Copy action shows "Copied!" confirmation.
- [ ] "Back to plant" navigates to the plant.
- [ ] "View plant context" navigates correctly.

## C. Result derivation

- [ ] Loading skeleton appears while deriving.
- [ ] No blank page during derivation.
- [ ] No fake diagnosis appears while loading.
- [ ] Result renders only for a valid selected plant/context.
- [ ] No-result state appears when no context is available.

## D. Evidence

- [ ] Recent diary shortcuts render newest-first.
- [ ] Recent photo shortcut appears only when photo activity exists.
- [ ] Sensor summary anchor scrolls to the sensor section.
- [ ] Mobile sticky bar appears only when result/evidence exists.
- [ ] Sticky bar does not duplicate screen-reader announcements
      (`aria-hidden`).

## E. Missing context

- [ ] Checklist shows: photo, diary, sensor, watering/feeding, stage, medium,
      pot size items.
- [ ] Helper text is local-facts-only (no nutrient/equipment advice).
- [ ] Stale/invalid sensors show needs-review.
- [ ] CTAs navigate only — they never create data.

## F. Accessibility

- [ ] Keyboard Tab reaches the skip link first.
- [ ] Skip link jumps focus to evidence shortcuts.
- [ ] Focus rings visible on all CTAs.
- [ ] Aria labels make sense (include plant name when available).
- [ ] Reduced-motion disables shimmer animation while skeleton stays visible.

## G. Safety checks

- [ ] No save / attach / approve / send / execute buttons present.
- [ ] No Action Queue row created.
- [ ] No diary/timeline row created.
- [ ] No alert row created.
- [ ] No AI/model request made (check network).
- [ ] No device-control copy or behavior anywhere on the page.

## H. Save to timeline (evidence-only)

- [ ] "Save to timeline" button appears only when a derived result exists.
- [ ] Button is hidden in loading / unknown plant / no-result states.
- [ ] Helper copy reads: "Saves this AI Doctor result as plant evidence
      only. No Action Queue item is created."
- [ ] Click → "Saved to timeline" appears, button disables.
- [ ] Clicking again with the same result does NOT create a second row
      (duplicate / disabled state).
- [ ] On error: "Could not save evidence. Nothing else was changed." appears.
- [ ] No "Approve", "Execute", or "Send to device" CTAs anywhere.
- [ ] No Action Queue row, alert row, or device command is created.
- [ ] Network: only `quicklog_save_manual` RPC is invoked (no Edge Function,
      no AI/model endpoint).

## I. Saved evidence on plant timeline (read-only render)

- [ ] Saved Phase 1 evidence renders as a dedicated evidence card on the
      plant timeline (once the fetch surfaces `details.kind`).
- [ ] Card shows "AI Doctor Phase 1" and "Evidence only" badges.
- [ ] Card shows the disclaimer "Saved as evidence only. This is not an
      approved action and does not control equipment."
- [ ] "Review AI Doctor context" CTA links to
      `/operator/ai-doctor-phase1?plantId=...&growId=...&tentId=...`.
- [ ] Card has no Approve, Send, Execute, Save, or Action Queue buttons.
- [ ] Card never creates Action Queue items, alert rows, or device commands.
- [ ] Card performs no AI/model requests and no additional Supabase writes.
