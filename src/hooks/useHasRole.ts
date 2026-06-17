/**
 * useHasRole — null-safe wrapper around the server-side `has_role(_user_id, _role)`
 * security-definer RPC. Roles are NEVER inferred client-side; we ask the server.
 *
 * Returns:
 *   - status: "loading" | "granted" | "denied" | "unauthenticated" | "error"
 *   - granted: boolean (true only when status === "granted")
 *
 * Callers MUST keep destructive actions disabled while status !== "granted".
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type HasRoleStatus =
  | "loading"
  | "granted"
  | "denied"
  | "unauthenticated"
  | "error";

export interface UseHasRoleResult {
  status: HasRoleStatus;
  granted: boolean;
  error: string | null;
}

export function useHasRole(role: AppRole): UseHasRoleResult {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["has-role", role, userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId as string,
        _role: role,
      });
      if (error) throw error;
      return data === true;
    },
  });

  if (authLoading) return { status: "loading", granted: false, error: null };
  if (!userId) return { status: "unauthenticated", granted: false, error: null };
  if (query.isLoading) return { status: "loading", granted: false, error: null };
  if (query.isError) {
    return {
      status: "error",
      granted: false,
      error: query.error instanceof Error ? query.error.message : "role_check_failed",
    };
  }
  return {
    status: query.data ? "granted" : "denied",
    granted: query.data === true,
    error: null,
  };
}
