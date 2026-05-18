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
      environment_events: {
        Row: {
          co2_ppm: number | null
          created_at: string
          event_id: string
          humidity_pct: number | null
          light_hours: number | null
          light_on: boolean | null
          temperature_c: number | null
          user_id: string
          vpd_kpa: number | null
        }
        Insert: {
          co2_ppm?: number | null
          created_at?: string
          event_id: string
          humidity_pct?: number | null
          light_hours?: number | null
          light_on?: boolean | null
          temperature_c?: number | null
          user_id: string
          vpd_kpa?: number | null
        }
        Update: {
          co2_ppm?: number | null
          created_at?: string
          event_id?: string
          humidity_pct?: number | null
          light_hours?: number | null
          light_on?: boolean | null
          temperature_c?: number | null
          user_id?: string
          vpd_kpa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "environment_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "grow_events"
            referencedColumns: ["id"]
          },
        ]
      }
      feeding_events: {
        Row: {
          created_at: string
          ec_ms_cm: number | null
          event_id: string
          nutrient_brand: string | null
          ph: number | null
          recipe: Json
          schedule_week: number | null
          user_id: string
          volume_ml: number | null
        }
        Insert: {
          created_at?: string
          ec_ms_cm?: number | null
          event_id: string
          nutrient_brand?: string | null
          ph?: number | null
          recipe?: Json
          schedule_week?: number | null
          user_id: string
          volume_ml?: number | null
        }
        Update: {
          created_at?: string
          ec_ms_cm?: number | null
          event_id?: string
          nutrient_brand?: string | null
          ph?: number | null
          recipe?: Json
          schedule_week?: number | null
          user_id?: string
          volume_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feeding_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "grow_events"
            referencedColumns: ["id"]
          },
        ]
      }
      grow_events: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_type: string
          grow_id: string
          id: string
          is_deleted: boolean
          note: string | null
          occurred_at: string
          plant_id: string | null
          schema_version: number
          source: string
          tent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_type: string
          grow_id: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          occurred_at?: string
          plant_id?: string | null
          schema_version?: number
          source?: string
          tent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_type?: string
          grow_id?: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          occurred_at?: string
          plant_id?: string | null
          schema_version?: number
          source?: string
          tent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      observation_events: {
        Row: {
          affected_area: string | null
          created_at: string
          details: Json
          event_id: string
          severity: string | null
          symptom_type: string[]
          user_id: string
        }
        Insert: {
          affected_area?: string | null
          created_at?: string
          details?: Json
          event_id: string
          severity?: string | null
          symptom_type?: string[]
          user_id: string
        }
        Update: {
          affected_area?: string | null
          created_at?: string
          details?: Json
          event_id?: string
          severity?: string | null
          symptom_type?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "grow_events"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_events: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          height_px: number | null
          photo_url: string
          taken_at: string | null
          user_id: string
          width_px: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          height_px?: number | null
          photo_url: string
          taken_at?: string | null
          user_id: string
          width_px?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          height_px?: number | null
          photo_url?: string
          taken_at?: string | null
          user_id?: string
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photo_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "grow_events"
            referencedColumns: ["id"]
          },
        ]
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
      training_events: {
        Row: {
          affected_nodes: number | null
          created_at: string
          event_id: string
          intensity: string | null
          technique: string
          user_id: string
        }
        Insert: {
          affected_nodes?: number | null
          created_at?: string
          event_id: string
          intensity?: string | null
          technique: string
          user_id: string
        }
        Update: {
          affected_nodes?: number | null
          created_at?: string
          event_id?: string
          intensity?: string | null
          technique?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "grow_events"
            referencedColumns: ["id"]
          },
        ]
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watering_events: {
        Row: {
          created_at: string
          ec_ms_cm: number | null
          event_id: string
          ph: number | null
          runoff_ec: number | null
          runoff_ml: number | null
          runoff_ph: number | null
          user_id: string
          volume_ml: number | null
          water_temp_c: number | null
        }
        Insert: {
          created_at?: string
          ec_ms_cm?: number | null
          event_id: string
          ph?: number | null
          runoff_ec?: number | null
          runoff_ml?: number | null
          runoff_ph?: number | null
          user_id: string
          volume_ml?: number | null
          water_temp_c?: number | null
        }
        Update: {
          created_at?: string
          ec_ms_cm?: number | null
          event_id?: string
          ph?: number | null
          runoff_ec?: number | null
          runoff_ml?: number | null
          runoff_ph?: number | null
          user_id?: string
          volume_ml?: number | null
          water_temp_c?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "watering_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "grow_events"
            referencedColumns: ["id"]
          },
        ]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      max_level_for_user: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      app_role: "operator" | "customer"
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
    Enums: {
      app_role: ["operator", "customer"],
    },
  },
} as const
