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

export interface EnvOverrides {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
}

function buildChecks(env: EnvOverrides, shadowAll: boolean): EnvCheck[] {
  const get = (k: keyof EnvOverrides): string | undefined =>
    shadowAll ? env[k] : (env[k] ?? import.meta.env[k]);

  return [
    {
      name: "VITE_SUPABASE_URL",
      value: get("VITE_SUPABASE_URL"),
      required: true,
      validate: (val) =>
        val.startsWith("https://") && val.includes(".supabase.co"),
      hint: "Must be a valid Supabase project URL (https://<ref>.supabase.co)",
    },
    {
      name: "VITE_SUPABASE_PUBLISHABLE_KEY",
      value: get("VITE_SUPABASE_PUBLISHABLE_KEY"),
      required: true,
      validate: (val) => val.startsWith("eyJ") && val.length > 50,
      hint: "Must be a valid JWT-style publishable key (starts with eyJ...)",
    },
    {
      name: "VITE_SUPABASE_PROJECT_ID",
      value: get("VITE_SUPABASE_PROJECT_ID"),
      required: false,
      validate: (val) => /^[a-z]{20}$/.test(val),
      hint: "Must be a 20-character Supabase project reference ID",
    },
  ];
}

export function verifySupabaseEnv(overrides?: EnvOverrides): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const c of buildChecks(overrides ?? {}, overrides !== undefined)) {
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
export function assertSupabaseEnv(overrides?: EnvOverrides, isDev = import.meta.env.DEV): void {
  const { ok, errors, warnings } = verifySupabaseEnv(overrides);

  if (warnings.length) {
    console.warn("[verifyEnv] warnings:\n  - " + warnings.join("\n  - "));
  }

  if (!ok) {
    const msg =
      "[verifyEnv] Required Supabase environment variables are missing or invalid:\n  - " +
      errors.join("\n  - ");
    if (isDev) {
      // In development, throw a loud error so the developer sees it immediately
      throw new Error(msg);
    } else {
      // In production, log critically but don't crash the app
      console.error(msg);
    }
  }
}
