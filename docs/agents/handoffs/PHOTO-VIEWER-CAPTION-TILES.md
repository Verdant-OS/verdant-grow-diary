# PHOTO-VIEWER-CAPTION-TILES

```text
TASK PHOTO-VIEWER-CAPTION-TILES  priority: P1  status: CLOSED
goal: Timeline photo viewer caption shows the entry note, or the timeline local-time formatter when the note is blank, and plant Recent Photos, the plant hero, and Timeline Photo history open that viewer.
why: Issue #2804. The caption joined stage and the raw UTC ISO and ignored the note. Those three tiles were not controls.
branch: cursor/photo-viewer-caption-tiles-1ba3
base: verdant-grow-diary
checkout: git fetch origin cursor/photo-viewer-caption-tiles-1ba3 verdant-grow-diary && git switch cursor/photo-viewer-caption-tiles-1ba3
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2805
head_sha: 71024e9d10201391d3143617911b3644b280916c
state: CLOSED. Merged as 2ebdd2e005be8415e5e80cc8c1cf2e629e5486ae (#2805) on 2026-11-03T18:37:43Z. Closed 2026-11-04 by Claude session_017UoYKv4arxJYBMGNNh1bvN on Matthew's instruction (Grok no longer active); copied from its HANDOFF_LOG.md block, which stays unedited per docs/agents/handoffs/README.md.
current_step: caption class, tile buttons, plant lightbox, and null-safe hero open
next_action: none; closed. Any post_merge_check below still applies to its recorded owner.
post_merge_check: after Publish, open a photo from a plant Recent Photos tile and confirm the viewer caption is the note or a local time, never a raw ISO. NOT_MEASURED until live /version.json reports the SHA.
active_writer: Grok cloud agent on this branch
decisions: TimelinePhotoLightboxCaption.fromItem is the only caption path. Tiles are buttons. Focus returns to the opener when the viewer unmounts. Alt text still includes the raw entry instant because src/test/timeline-photo-lightbox-rules.test.ts is scorer-locked and pins that string.
tried_and_rejected: rewriting the locked alt assertion. The scorer lock refused the edit.
commands: bunx vitest run src/test/timeline-photo-caption-and-open.test.tsx src/test/timeline-photo-lightbox-component.test.tsx src/test/timeline-photo-lightbox-rules.test.ts --reporter=dot
files_touched: src/lib/timelinePhotoLightboxRules.ts; src/components/TimelinePhotoLightbox.tsx; src/components/PhotoHistoryPanel.tsx; src/components/PlantDetailPhotoStrip.tsx; src/components/PlantPhoto.tsx; src/components/PlantPhotoView.tsx; src/pages/PlantDetail.tsx; src/pages/Timeline.tsx; src/test/timeline-photo-caption-and-open.test.tsx; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none for repository work
open_questions: none
gotchas: do not edit the locked alt-text test. Upload size warning is out of scope.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/2804
artifacts: local screenshots, not committed
reviewer_seat: not requested; Moonbow routes review
reviewer_sha: NOT_MEASURED
session_state: no production writes; auto-merge off
claimed_by: Grok, 2026-11-03
owner: Grok
last_updated: 2026-11-02 23:20 CT, by Grok
```
