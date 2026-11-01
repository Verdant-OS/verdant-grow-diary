const OWNER_BADGE_LOCAL_SUPABASE_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]"] as const;

export function isOwnerBadgeLocalSupabaseHost(hostname: string): boolean {
  return (OWNER_BADGE_LOCAL_SUPABASE_HOSTS as readonly string[]).includes(
    hostname.trim().toLowerCase(),
  );
}
