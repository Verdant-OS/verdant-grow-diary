export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      diary_entries: {
        Row: {
          created_at: string
          details: Json
          entry_at: string
          grow_id: string
          id: string
          note: string
          photo_url: string | null
          stage: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          entry_at?: string
          grow_id: string
          id?: string
          note: string
          photo_url?: string | null
          stage?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          entry_at?: string
          grow_id?: string
          id?: string
          note?: string
          photo_url?: string | null
          stage?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
        ]
      }
      grows: {
        Row: {
          created_at: string
          grow_type: string
          id: string
          is_archived: boolean
          name: string
          notes: string | null
          stage: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grow_type?: string
          id?: string
          is_archived?: boolean
          name: string
          notes?: string | null
          stage?: string
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grow_type?: string
          id?: string
          is_archived?: boolean
          name?: string
          notes?: string | null
          stage?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      harvests: {
        Row: {
          created_at: string
          grow_id: string
          grow_type: string
          harvested_at: string
          id: string
          medium: string | null
          notes: string | null
          user_id: string
          yield_grams: number | null
        }
        Insert: {
          created_at?: string
          grow_id: string
          grow_type: string
          harvested_at?: string
          id?: string
          medium?: string | null
          notes?: string | null
          user_id: string
          yield_grams?: number | null
        }
        Update: {
          created_at?: string
          grow_id?: string
          grow_type?: string
          harvested_at?: string
          id?: string
          medium?: string | null
          notes?: string | null
          user_id?: string
          yield_grams?: number | null
        }
        Relationships: []
      }
      nug_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: string
          meta: Json
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          user_id?: string
        }
        Relationships: []
      }
      plants: {
        Row: {
          created_at: string
          health: string
          id: string
          is_archived: boolean
          last_note: string | null
          name: string
          photo_url: string | null
          schema_version: number
          stage: string
          started_at: string
          strain: string | null
          tent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          health?: string
          id?: string
          is_archived?: boolean
          last_note?: string | null
          name: string
          photo_url?: string | null
          schema_version?: number
          stage?: string
          started_at?: string
          strain?: string | null
          tent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          health?: string
          id?: string
          is_archived?: boolean
          last_note?: string | null
          name?: string
          photo_url?: string | null
          schema_version?: number
          stage?: string
          started_at?: string
          strain?: string | null
          tent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          current_badge: string | null
          display_name: string | null
          level: number
          nugs_total: number
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_badge?: string | null
          display_name?: string | null
          level?: number
          nugs_total?: number
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_badge?: string | null
          display_name?: string | null
          level?: number
          nugs_total?: number
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sensor_readings: {
        Row: {
          created_at: string
          id: string
          metric: string
          quality: string
          source: string
          tent_id: string
          ts: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          metric: string
          quality?: string
          source?: string
          tent_id: string
          ts?: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          metric?: string
          quality?: string
          source?: string
          tent_id?: string
          ts?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      tents: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          is_archived: boolean
          light_on: boolean
          light_schedule: string | null
          light_wattage: number | null
          name: string
          schema_version: number
          size: string | null
          stage: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          light_on?: boolean
          light_schedule?: string | null
          light_wattage?: number | null
          name: string
          schema_version?: number
          size?: string | null
          stage?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          light_on?: boolean
          light_schedule?: string | null
          light_wattage?: number | null
          name?: string
          schema_version?: number
          size?: string | null
          stage?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      unlocks: {
        Row: {
          id: string
          key: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          id?: string
          key: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          id?: string
          key?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_quests: {
        Row: {
          completed_at: string
          id: string
          quest_key: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          quest_key: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          quest_key?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      award_nugs: {
        Args: {
          _amount: number
          _kind: string
          _meta?: Json
          _quest_key?: string
        }
        Returns: Json
      }
      compute_level: {
        Args: { total: number }
        Returns: {
          level: number
          tier: string
        }[]
      }
      max_level_for_user: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
