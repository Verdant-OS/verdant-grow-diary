import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type { FounderDisplayStyle } from "@/lib/founderWallRules";

export interface MyFounderRow {
  founder_number: number;
  display_name: string | null;
  display_style: FounderDisplayStyle;
  show_on_wall: boolean;
  optional_link: string | null;
  status: "confirmed" | "refunded" | string;
}

export interface UseMyFounderRowResult {
  loading: boolean;
  row: MyFounderRow | null;
  refetch: () => Promise<void>;
}

export function useMyFounderRow(): UseMyFounderRowResult {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<MyFounderRow | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("founders")
      .select("founder_number, display_name, display_style, show_on_wall, optional_link, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      setRow(null);
    } else {
      setRow((data as MyFounderRow | null) ?? null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  return { loading, row, refetch: load };
}
