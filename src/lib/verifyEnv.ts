/**
 * Verify required Supabase environment variables before the app mounts.
 * Throws a clear error in development; logs a warning in production.
 */

export interface EnvCheck {
  name: string;
  value: string | undefined;
  required: boolean;
  validate: (val: string) => boolean;
  hint: string;
}

const checks: EnvCheck[] = [
  {
    name: "VITE_SUPABASE_URL",
    value: import.meta.env.VITE_SUPABASE_URL,
    required: true,
    validate: (val) =>
      val.startsWith("https://") && val.includes(".supabase.co"),
    hint: "Must be a valid Supabase project URL (https://<ref>.supabase.co)",
  },
  {
    name: "VITE_SUPABASE_PUBLISHABLE_KEY",
    value: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    required: true,
    validate: (val) => val.startsWith("eyJ") && val.length > 50,
    hint: "Must be a valid JWT-style publishable key (starts with eyJ...)",
  },
  {
    name: "VITE_SUPABASE_PROJECT_ID",
    value: import.meta.env.VITE_SUPABASE_PROJECT_ID,
    required: false,
    validate: (val) => /^[a-z]{20}$/.test(val),
    hint: "Must be a 20-character Supabase project reference ID",
  },
];

export function verifySupabaseEnv(): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const c of checks) {
    if (!c.value || c.value.trim() === "") {
      if (c.required) {
        errors.push(
          `Missing required env var: ${c.name}. ${c.hint}`
        );
      } else {
        warnings.push(`Optional env var missing: ${c.name}`);
      }
      continue;
    }

    if (!c.validate(c.value)) {
      if (c.required) {
        errors.push(`Invalid ${c.name}: "${c.value}". ${c.hint}`);
      } else {
        warnings.push(`Suspicious ${c.name}: "${c.value}". ${c.hint}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Run verification and either throw (dev) or console.warn (prod) */
export function assertSupabaseEnv(): void {
  const { ok, errors, warnings } = verifySupabaseEnv();

  if (warnings.length) {
    console.warn("[verifyEnv] warnings:\n  - " + warnings.join("\n  - "));
  }

  if (!ok) {
    const msg =
      "[verifyEnv] Required Supabase environment variables are missing or invalid:\n  - " +
      errors.join("\n  - ");
    if (import.meta.env.DEV) {
      // In development, throw a loud error so the developer sees it immediately
      throw new Error(msg);
    } else {
      // In production, log critically but don't crash the app
      console.error(msg);
    }
  }
}
