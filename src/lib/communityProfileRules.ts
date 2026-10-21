import type { CommunityProfileDraft, CommunityResult } from "@/lib/communityTypes";

export const COMMUNITY_RESERVED_USERNAMES: readonly string[] = Object.freeze([
  "admin",
  "moderator",
  "support",
  "verdant",
  "system",
  "deleted",
]);

// Checked before lowercasing: "\u212A" (Kelvin sign) lowercases to an ASCII "k".
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;
const DISPLAY_NAME_MAX = 60;
const BIO_MAX = 280;

/** Counts Unicode code points, so an emoji counts once. */
function characterCount(text: string): number {
  return Array.from(text).length;
}

/**
 * Normalizes an explicitly entered community profile. Never fills anything
 * from email, OAuth identity or the private profile; content stays plain text.
 * Uniqueness is a server decision and is not checked here.
 */
export function normalizeCommunityProfile(
  draft: CommunityProfileDraft,
): CommunityResult<CommunityProfileDraft> {
  if (typeof draft !== "object" || draft === null) return { ok: false, code: "invalid" };
  const fields = [draft.username, draft.displayName, draft.bio];
  if (!fields.every((field) => typeof field === "string")) return { ok: false, code: "invalid" };

  const trimmedUsername = draft.username.trim();
  if (!USERNAME_PATTERN.test(trimmedUsername)) return { ok: false, code: "invalid" };
  const username = trimmedUsername.toLowerCase();
  const displayName = draft.displayName.trim();
  const bio = draft.bio.trim();

  if (COMMUNITY_RESERVED_USERNAMES.includes(username)) return { ok: false, code: "invalid" };

  const displayNameLength = characterCount(displayName);
  if (displayNameLength < 1 || displayNameLength > DISPLAY_NAME_MAX) {
    return { ok: false, code: "invalid" };
  }
  if (characterCount(bio) > BIO_MAX) return { ok: false, code: "invalid" };

  return { ok: true, value: { username, displayName, bio } };
}
