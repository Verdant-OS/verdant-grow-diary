/**
 * Pure server-side validator for save-founder-prefs.
 *
 * Extracted so Deno tests can exercise it without booting Deno.serve.
 * Mirrors the DB CHECK constraints on public.founders and the client-side
 * `founderPrefsSchema` in src/lib/founderWallRules.ts.
 */
export type DisplayStyle = 'custom_name' | 'first_initial' | 'number_only' | 'hidden';

export interface PrefsBody {
  display_name: string | null;
  display_style: DisplayStyle;
  show_on_wall: boolean;
  optional_link: string | null;
}

export const DISPLAY_STYLES: readonly DisplayStyle[] = [
  'custom_name',
  'first_initial',
  'number_only',
  'hidden',
];

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/;

export function isSafeHttpsUrl(value: string): boolean {
  if (value.length === 0 || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

export function validatePrefs(
  raw: unknown,
): { ok: true; value: PrefsBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid_body' };
  const r = raw as Record<string, unknown>;

  const style = r.display_style;
  if (typeof style !== 'string' || !DISPLAY_STYLES.includes(style as DisplayStyle)) {
    return { ok: false, error: 'invalid_display_style' };
  }

  if (typeof r.show_on_wall !== 'boolean') {
    return { ok: false, error: 'invalid_show_on_wall' };
  }

  let displayName: string | null;
  if (r.display_name === null || r.display_name === undefined) {
    displayName = null;
  } else if (typeof r.display_name === 'string') {
    if (r.display_name.length > 60) return { ok: false, error: 'display_name_too_long' };
    if (CONTROL_CHAR_REGEX.test(r.display_name)) {
      return { ok: false, error: 'display_name_control_chars' };
    }
    displayName = r.display_name;
  } else {
    return { ok: false, error: 'invalid_display_name' };
  }

  let optionalLink: string | null;
  if (r.optional_link === null || r.optional_link === undefined || r.optional_link === '') {
    optionalLink = null;
  } else if (typeof r.optional_link === 'string') {
    if (r.optional_link.length > 300) return { ok: false, error: 'optional_link_too_long' };
    if (!isSafeHttpsUrl(r.optional_link)) return { ok: false, error: 'optional_link_not_https' };
    optionalLink = r.optional_link;
  } else {
    return { ok: false, error: 'invalid_optional_link' };
  }

  return {
    ok: true,
    value: {
      display_name: displayName,
      display_style: style as DisplayStyle,
      show_on_wall: r.show_on_wall,
      optional_link: optionalLink,
    },
  };
}
