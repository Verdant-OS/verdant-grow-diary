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
      action_queue: {
        Row: {
          action_type: string
          approved_at: string | null
          completed_at: string | null
          created_at: string
          grow_id: string
          id: string
          originating_timeline_events: Json
          plant_id: string | null
          reason: string
          rejected_at: string | null
          risk_level: string
          source: string
          status: string
          suggested_change: string
          target_device: string | null
          target_metric: string | null
          tent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          completed_at?: string | null
          created_at?: string
          grow_id: string
          id?: string
          originating_timeline_events?: Json
          plant_id?: string | null
          reason: string
          rejected_at?: string | null
          risk_level?: string
          source?: string
          status?: string
          suggested_change: string
          target_device?: string | null
          target_metric?: string | null
          tent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          completed_at?: string | null
          created_at?: string
          grow_id?: string
          id?: string
          originating_timeline_events?: Json
          plant_id?: string | null
          reason?: string
          rejected_at?: string | null
          risk_level?: string
          source?: string
          status?: string
          suggested_change?: string
          target_device?: string | null
          target_metric?: string | null
          tent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_queue_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_queue_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_queue_tent_id_fkey"
            columns: ["tent_id"]
            isOneToOne: false
            referencedRelation: "tents"
            referencedColumns: ["id"]
          },
        ]
      }
      action_queue_events: {
        Row: {
          action_queue_id: string
          created_at: string
          event_type: string
          grow_id: string
          id: string
          new_status: string | null
          note: string | null
          previous_status: string | null
          user_id: string
        }
        Insert: {
          action_queue_id: string
          created_at?: string
          event_type: string
          grow_id: string
          id?: string
          new_status?: string | null
          note?: string | null
          previous_status?: string | null
          user_id?: string
        }
        Update: {
          action_queue_id?: string
          created_at?: string
          event_type?: string
          grow_id?: string
          id?: string
          new_status?: string | null
          note?: string | null
          previous_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_queue_events_action_queue_id_fkey"
            columns: ["action_queue_id"]
            isOneToOne: false
            referencedRelation: "action_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_queue_events_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_spends: {
        Row: {
          created_at: string
          feature: string
          grow_id: string | null
          id: string
          idempotency_key: string
          meta: Json
          model_tier: string
          period_key: string
          refund_of: string | null
          result: Json | null
          status: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          feature: string
          grow_id?: string | null
          id?: string
          idempotency_key: string
          meta?: Json
          model_tier: string
          period_key: string
          refund_of?: string | null
          result?: Json | null
          status: string
          user_id: string
          weight: number
        }
        Update: {
          created_at?: string
          feature?: string
          grow_id?: string | null
          id?: string
          idempotency_key?: string
          meta?: Json
          model_tier?: string
          period_key?: string
          refund_of?: string | null
          result?: Json | null
          status?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_spends_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_credit_spends_refund_of_fkey"
            columns: ["refund_of"]
            isOneToOne: false
            referencedRelation: "ai_credit_spends"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_doctor_session_reviews: {
        Row: {
          created_at: string
          event_type: string
          id: string
          note: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          session_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_doctor_sessions: {
        Row: {
          analysis: Json | null
          context_confidence_ceiling: string | null
          context_sufficiency: Json | null
          counts_as_healthy_evidence: boolean | null
          created_at: string
          diagnosis: Json | null
          displayed_confidence: number | null
          grow_id: string | null
          id: string
          plant_id: string | null
          question: string | null
          raw_confidence: number | null
          sensor_evidence_evaluated_at: string | null
          sensor_evidence_mode: string | null
          sensor_snapshot_reason_code: string | null
          sensor_snapshot_status: string | null
          suggested_actions: Json
          tent_id: string | null
          user_id: string
        }
        Insert: {
          analysis?: Json | null
          context_confidence_ceiling?: string | null
          context_sufficiency?: Json | null
          counts_as_healthy_evidence?: boolean | null
          created_at?: string
          diagnosis?: Json | null
          displayed_confidence?: number | null
          grow_id?: string | null
          id?: string
          plant_id?: string | null
          question?: string | null
          raw_confidence?: number | null
          sensor_evidence_evaluated_at?: string | null
          sensor_evidence_mode?: string | null
          sensor_snapshot_reason_code?: string | null
          sensor_snapshot_status?: string | null
          suggested_actions?: Json
          tent_id?: string | null
          user_id?: string
        }
        Update: {
          analysis?: Json | null
          context_confidence_ceiling?: string | null
          context_sufficiency?: Json | null
          counts_as_healthy_evidence?: boolean | null
          created_at?: string
          diagnosis?: Json | null
          displayed_confidence?: number | null
          grow_id?: string | null
          id?: string
          plant_id?: string | null
          question?: string | null
          raw_confidence?: number | null
          sensor_evidence_evaluated_at?: string | null
          sensor_evidence_mode?: string | null
          sensor_snapshot_reason_code?: string | null
          sensor_snapshot_status?: string | null
          suggested_actions?: Json
          tent_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      alert_events: {
        Row: {
          alert_id: string
          created_at: string
          event_type: string
          grow_id: string
          id: string
          new_status: string | null
          note: string | null
          previous_status: string | null
          user_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          event_type: string
          grow_id: string
          id?: string
          new_status?: string | null
          note?: string | null
          previous_status?: string | null
          user_id?: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          event_type?: string
          grow_id?: string
          id?: string
          new_status?: string | null
          note?: string | null
          previous_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_events_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          first_seen_at: string
          grow_id: string
          id: string
          last_seen_at: string
          metric: string | null
          originating_timeline_events: Json
          plant_id: string | null
          reason: string
          resolved_at: string | null
          severity: string
          source: string
          status: string
          tent_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          first_seen_at?: string
          grow_id: string
          id?: string
          last_seen_at?: string
          metric?: string | null
          originating_timeline_events?: Json
          plant_id?: string | null
          reason: string
          resolved_at?: string | null
          severity: string
          source?: string
          status?: string
          tent_id?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          first_seen_at?: string
          grow_id?: string
          id?: string
          last_seen_at?: string
          metric?: string | null
          originating_timeline_events?: Json
          plant_id?: string | null
          reason?: string
          resolved_at?: string | null
          severity?: string
          source?: string
          status?: string
          tent_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_tent_id_fkey"
            columns: ["tent_id"]
            isOneToOne: false
            referencedRelation: "tents"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          founder_number: number | null
          id: string
          plan_id: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          founder_number?: number | null
          id?: string
          plan_id?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          founder_number?: number | null
          id?: string
          plan_id?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      breeding_program_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          criteria_met: Json
          generation_label: string
          id: string
          instruction_summary: string
          note: string | null
          program_id: string
          required_criteria: Json
          status: string
          step_index: number
          step_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          criteria_met?: Json
          generation_label: string
          id?: string
          instruction_summary: string
          note?: string | null
          program_id: string
          required_criteria?: Json
          status?: string
          step_index: number
          step_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          criteria_met?: Json
          generation_label?: string
          id?: string
          instruction_summary?: string
          note?: string | null
          program_id?: string
          required_criteria?: Json
          status?: string
          step_index?: number
          step_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "breeding_program_steps_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "breeding_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      breeding_programs: {
        Row: {
          created_at: string
          cross_pair_label: string | null
          current_step_id: string | null
          grow_id: string | null
          id: string
          name: string
          notes: string | null
          p1_maternal_label: string | null
          p1_paternal_label: string | null
          sop_version: string
          starting_generation: string
          status: string
          target_traits: string[]
          tent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cross_pair_label?: string | null
          current_step_id?: string | null
          grow_id?: string | null
          id?: string
          name: string
          notes?: string | null
          p1_maternal_label?: string | null
          p1_paternal_label?: string | null
          sop_version?: string
          starting_generation?: string
          status?: string
          target_traits?: string[]
          tent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cross_pair_label?: string | null
          current_step_id?: string | null
          grow_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          p1_maternal_label?: string | null
          p1_paternal_label?: string | null
          sop_version?: string
          starting_generation?: string
          status?: string
          target_traits?: string[]
          tent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "breeding_programs_current_step_fk"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "breeding_program_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breeding_programs_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breeding_programs_tent_id_fkey"
            columns: ["tent_id"]
            isOneToOne: false
            referencedRelation: "tents"
            referencedColumns: ["id"]
          },
        ]
      }
      breeding_step_evidence: {
        Row: {
          created_at: string
          criterion_key: string
          diary_entry_id: string
          id: string
          note: string | null
          program_id: string
          step_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criterion_key: string
          diary_entry_id: string
          id?: string
          note?: string | null
          program_id: string
          step_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          criterion_key?: string
          diary_entry_id?: string
          id?: string
          note?: string | null
          program_id?: string
          step_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "breeding_step_evidence_diary_entry_id_fkey"
            columns: ["diary_entry_id"]
            isOneToOne: false
            referencedRelation: "diary_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breeding_step_evidence_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "breeding_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breeding_step_evidence_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "breeding_program_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      bridge_tokens: {
        Row: {
          created_at: string
          expires_at: string
          first_used_at: string | null
          id: string
          ingest_count: number
          last_used_at: string | null
          name: string
          revoked_at: string | null
          tent_id: string
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          first_used_at?: string | null
          id?: string
          ingest_count?: number
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          tent_id: string
          token_hash: string
          token_prefix: string
          user_id?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          first_used_at?: string | null
          id?: string
          ingest_count?: number
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          tent_id?: string
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      diary_entries: {
        Row: {
          created_at: string
          details: Json
          entry_at: string
          grow_id: string
          id: string
          note: string
          photo_url: string | null
          plant_id: string | null
          stage: string | null
          tent_id: string | null
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
          plant_id?: string | null
          stage?: string | null
          tent_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          details?: Json
          entry_at?: string
          grow_id?: string
          id?: string
          note?: string
          photo_url?: string | null
          plant_id?: string | null
          stage?: string | null
          tent_id?: string | null
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
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
          ec_in: number | null
          ec_ms_cm: number | null
          ec_out: number | null
          event_id: string
          line_id: string
          nutrient_brand: string | null
          ph: number | null
          products: Json
          recipe: Json
          runoff_ec: number | null
          runoff_ml: number | null
          runoff_ph: number | null
          schedule_week: number | null
          user_id: string
          volume_ml: number | null
          water_temp_c: number | null
        }
        Insert: {
          created_at?: string
          ec_in?: number | null
          ec_ms_cm?: number | null
          ec_out?: number | null
          event_id: string
          line_id: string
          nutrient_brand?: string | null
          ph?: number | null
          products?: Json
          recipe?: Json
          runoff_ec?: number | null
          runoff_ml?: number | null
          runoff_ph?: number | null
          schedule_week?: number | null
          user_id: string
          volume_ml?: number | null
          water_temp_c?: number | null
        }
        Update: {
          created_at?: string
          ec_in?: number | null
          ec_ms_cm?: number | null
          ec_out?: number | null
          event_id?: string
          line_id?: string
          nutrient_brand?: string | null
          ph?: number | null
          products?: Json
          recipe?: Json
          runoff_ec?: number | null
          runoff_ml?: number | null
          runoff_ph?: number | null
          schedule_week?: number | null
          user_id?: string
          volume_ml?: number | null
          water_temp_c?: number | null
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
      grow_targets: {
        Row: {
          created_at: string
          grow_id: string
          id: string
          notes: string | null
          ppfd_max: number | null
          ppfd_min: number | null
          rh_max: number | null
          rh_min: number | null
          soil_ec_max: number | null
          soil_ec_min: number | null
          soil_temp_max: number | null
          soil_temp_min: number | null
          soil_wc_max: number | null
          soil_wc_min: number | null
          temp_max: number | null
          temp_min: number | null
          updated_at: string
          user_id: string
          vpd_max: number | null
          vpd_min: number | null
        }
        Insert: {
          created_at?: string
          grow_id: string
          id?: string
          notes?: string | null
          ppfd_max?: number | null
          ppfd_min?: number | null
          rh_max?: number | null
          rh_min?: number | null
          soil_ec_max?: number | null
          soil_ec_min?: number | null
          soil_temp_max?: number | null
          soil_temp_min?: number | null
          soil_wc_max?: number | null
          soil_wc_min?: number | null
          temp_max?: number | null
          temp_min?: number | null
          updated_at?: string
          user_id?: string
          vpd_max?: number | null
          vpd_min?: number | null
        }
        Update: {
          created_at?: string
          grow_id?: string
          id?: string
          notes?: string | null
          ppfd_max?: number | null
          ppfd_min?: number | null
          rh_max?: number | null
          rh_min?: number | null
          soil_ec_max?: number | null
          soil_ec_min?: number | null
          soil_temp_max?: number | null
          soil_temp_min?: number | null
          soil_wc_max?: number | null
          soil_wc_min?: number | null
          temp_max?: number | null
          temp_min?: number | null
          updated_at?: string
          user_id?: string
          vpd_max?: number | null
          vpd_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grow_targets_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: true
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
      lead_events: {
        Row: {
          actor_user_id: string
          created_at: string
          event_type: string
          id: string
          lead_id: string
          new_status: string | null
          note: string | null
          old_status: string | null
        }
        Insert: {
          actor_user_id?: string
          created_at?: string
          event_type: string
          id?: string
          lead_id: string
          new_status?: string | null
          note?: string | null
          old_status?: string | null
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string
          new_status?: string | null
          note?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          contacted_at: string | null
          created_at: string
          email: string
          follow_up_at: string | null
          id: string
          lead_type: string
          message: string | null
          name: string | null
          operator_notes: string | null
          role: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          contacted_at?: string | null
          created_at?: string
          email: string
          follow_up_at?: string | null
          id?: string
          lead_type?: string
          message?: string | null
          name?: string | null
          operator_notes?: string | null
          role?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          contacted_at?: string | null
          created_at?: string
          email?: string
          follow_up_at?: string | null
          id?: string
          lead_type?: string
          message?: string | null
          name?: string | null
          operator_notes?: string | null
          role?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      lovable_paddle_events: {
        Row: {
          environment: string
          event_type: string
          id: string
          last_error: string | null
          paddle_event_id: string
          paddle_subscription_id: string | null
          paddle_transaction_id: string | null
          payload: Json
          price_external_id: string | null
          processed_ok: boolean
          processing_status: string
          product_external_id: string | null
          received_at: string
          skip_reason: string | null
          user_id: string | null
        }
        Insert: {
          environment: string
          event_type: string
          id?: string
          last_error?: string | null
          paddle_event_id: string
          paddle_subscription_id?: string | null
          paddle_transaction_id?: string | null
          payload: Json
          price_external_id?: string | null
          processed_ok?: boolean
          processing_status?: string
          product_external_id?: string | null
          received_at?: string
          skip_reason?: string | null
          user_id?: string | null
        }
        Update: {
          environment?: string
          event_type?: string
          id?: string
          last_error?: string | null
          paddle_event_id?: string
          paddle_subscription_id?: string | null
          paddle_transaction_id?: string | null
          payload?: Json
          price_external_id?: string | null
          processed_ok?: boolean
          processing_status?: string
          product_external_id?: string | null
          received_at?: string
          skip_reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      manual_sensor_snapshot_edits: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_fields: string[]
          id: string
          new_values: Json
          old_values: Json
          original_reading_id: string
          plant_id: string | null
          replacement_reading_id: string | null
          source_after: string
          source_before: string
          tent_id: string
          user_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_fields: string[]
          id?: string
          new_values: Json
          old_values: Json
          original_reading_id: string
          plant_id?: string | null
          replacement_reading_id?: string | null
          source_after: string
          source_before: string
          tent_id: string
          user_id?: string
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_fields?: string[]
          id?: string
          new_values?: Json
          old_values?: Json
          original_reading_id?: string
          plant_id?: string | null
          replacement_reading_id?: string | null
          source_after?: string
          source_before?: string
          tent_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_sensor_snapshot_edits_original_reading_id_fkey"
            columns: ["original_reading_id"]
            isOneToOne: false
            referencedRelation: "sensor_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_sensor_snapshot_edits_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_sensor_snapshot_edits_replacement_reading_id_fkey"
            columns: ["replacement_reading_id"]
            isOneToOne: false
            referencedRelation: "sensor_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_sensor_snapshot_edits_tent_id_fkey"
            columns: ["tent_id"]
            isOneToOne: false
            referencedRelation: "tents"
            referencedColumns: ["id"]
          },
        ]
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
      paddle_events: {
        Row: {
          environment: string
          event_id: string
          event_type: string
          id: string
          payload: Json
          received_at: string
          signature_verified: boolean
        }
        Insert: {
          environment: string
          event_id: string
          event_type: string
          id?: string
          payload: Json
          received_at?: string
          signature_verified?: boolean
        }
        Update: {
          environment?: string
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          received_at?: string
          signature_verified?: boolean
        }
        Relationships: []
      }
      pheno_candidate_scores: {
        Row: {
          created_at: string
          hunt_id: string
          id: string
          note: string | null
          plant_id: string
          traits: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hunt_id: string
          id?: string
          note?: string | null
          plant_id: string
          traits?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hunt_id?: string
          id?: string
          note?: string | null
          plant_id?: string
          traits?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_candidate_scores_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_candidate_scores_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_crosses: {
        Row: {
          created_at: string
          cross_name: string | null
          cross_type: string
          crossed_at: string | null
          female_keeper_id: string
          hunt_id: string | null
          id: string
          male_keeper_id: string | null
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cross_name?: string | null
          cross_type?: string
          crossed_at?: string | null
          female_keeper_id: string
          hunt_id?: string | null
          id?: string
          male_keeper_id?: string | null
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cross_name?: string | null
          cross_type?: string
          crossed_at?: string | null
          female_keeper_id?: string
          hunt_id?: string | null
          id?: string
          male_keeper_id?: string | null
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_crosses_female_keeper_id_fkey"
            columns: ["female_keeper_id"]
            isOneToOne: false
            referencedRelation: "pheno_keepers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_crosses_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_crosses_male_keeper_id_fkey"
            columns: ["male_keeper_id"]
            isOneToOne: false
            referencedRelation: "pheno_keepers"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_hunts: {
        Row: {
          created_at: string
          goal: string | null
          grow_id: string
          id: string
          name: string
          setup_confirmed_at: string | null
          tent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal?: string | null
          grow_id: string
          id?: string
          name: string
          setup_confirmed_at?: string | null
          tent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string | null
          grow_id?: string
          id?: string
          name?: string
          setup_confirmed_at?: string | null
          tent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_hunts_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_hunts_tent_id_fkey"
            columns: ["tent_id"]
            isOneToOne: false
            referencedRelation: "tents"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_keeper_clones: {
        Row: {
          clone_label: string
          clone_plant_id: string | null
          created_at: string
          id: string
          keeper_id: string
          note: string | null
          parent_clone_id: string | null
          taken_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clone_label: string
          clone_plant_id?: string | null
          created_at?: string
          id?: string
          keeper_id: string
          note?: string | null
          parent_clone_id?: string | null
          taken_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clone_label?: string
          clone_plant_id?: string | null
          created_at?: string
          id?: string
          keeper_id?: string
          note?: string | null
          parent_clone_id?: string | null
          taken_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_keeper_clones_clone_plant_id_fkey"
            columns: ["clone_plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_keeper_clones_keeper_id_fkey"
            columns: ["keeper_id"]
            isOneToOne: false
            referencedRelation: "pheno_keepers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_keeper_clones_parent_clone_id_fkey"
            columns: ["parent_clone_id"]
            isOneToOne: false
            referencedRelation: "pheno_keeper_clones"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_keeper_decisions: {
        Row: {
          created_at: string
          decided_at: string | null
          decision: string
          hunt_id: string
          id: string
          note: string | null
          plant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decision?: string
          hunt_id: string
          id?: string
          note?: string | null
          plant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decision?: string
          hunt_id?: string
          id?: string
          note?: string | null
          plant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_keeper_decisions_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_keeper_decisions_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_keeper_decisions_log: {
        Row: {
          created_at: string
          decided_at: string
          decision: string
          hunt_id: string
          id: string
          note: string | null
          plant_id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string
          decision: string
          hunt_id: string
          id?: string
          note?: string | null
          plant_id: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string
          decision?: string
          hunt_id?: string
          id?: string
          note?: string | null
          plant_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_keeper_decisions_log_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_keeper_decisions_log_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_keepers: {
        Row: {
          created_at: string
          hunt_id: string
          id: string
          keeper_name: string
          note: string | null
          source_plant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hunt_id: string
          id?: string
          keeper_name: string
          note?: string | null
          source_plant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hunt_id?: string
          id?: string
          keeper_name?: string
          note?: string | null
          source_plant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_keepers_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_keepers_source_plant_id_fkey"
            columns: ["source_plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_lab_results: {
        Row: {
          cbd_pct: number | null
          created_at: string
          dominant_terpenes: Json
          hunt_id: string
          id: string
          note: string | null
          plant_id: string
          source: string
          tested_at: string | null
          thc_pct: number | null
          total_cannabinoids_pct: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cbd_pct?: number | null
          created_at?: string
          dominant_terpenes?: Json
          hunt_id: string
          id?: string
          note?: string | null
          plant_id: string
          source?: string
          tested_at?: string | null
          thc_pct?: number | null
          total_cannabinoids_pct?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cbd_pct?: number | null
          created_at?: string
          dominant_terpenes?: Json
          hunt_id?: string
          id?: string
          note?: string | null
          plant_id?: string
          source?: string
          tested_at?: string | null
          thc_pct?: number | null
          total_cannabinoids_pct?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_lab_results_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_lab_results_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_reversals: {
        Row: {
          applied_at: string | null
          created_at: string
          id: string
          keeper_id: string
          method: string
          note: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          id?: string
          keeper_id: string
          method?: string
          note?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          id?: string
          keeper_id?: string
          method?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_reversals_keeper_id_fkey"
            columns: ["keeper_id"]
            isOneToOne: false
            referencedRelation: "pheno_keepers"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_score_rounds: {
        Row: {
          aroma_descriptors: Json
          created_at: string
          hunt_id: string
          id: string
          loud_traits: Json
          nose_note: string | null
          note: string | null
          observed_at: string | null
          plant_id: string
          round: string
          traits: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          aroma_descriptors?: Json
          created_at?: string
          hunt_id: string
          id?: string
          loud_traits?: Json
          nose_note?: string | null
          note?: string | null
          observed_at?: string | null
          plant_id: string
          round: string
          traits?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          aroma_descriptors?: Json
          created_at?: string
          hunt_id?: string
          id?: string
          loud_traits?: Json
          nose_note?: string | null
          note?: string | null
          observed_at?: string | null
          plant_id?: string
          round?: string
          traits?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_score_rounds_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_score_rounds_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_sex_observations: {
        Row: {
          created_at: string
          herm_observed: boolean
          hunt_id: string
          id: string
          note: string | null
          observed_at: string
          plant_id: string
          sex: string
          user_id: string
        }
        Insert: {
          created_at?: string
          herm_observed?: boolean
          hunt_id: string
          id?: string
          note?: string | null
          observed_at?: string
          plant_id: string
          sex?: string
          user_id: string
        }
        Update: {
          created_at?: string
          herm_observed?: boolean
          hunt_id?: string
          id?: string
          note?: string | null
          observed_at?: string
          plant_id?: string
          sex?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pheno_sex_observations_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_sex_observations_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_smoke_tests: {
        Row: {
          created_at: string
          effect_descriptors: Json
          flavor_descriptors: Json
          hunt_id: string
          id: string
          note: string | null
          plant_id: string
          potency_impression: number | null
          smoothness: number | null
          tested_at: string | null
          updated_at: string
          user_id: string
          verdict: string | null
        }
        Insert: {
          created_at?: string
          effect_descriptors?: Json
          flavor_descriptors?: Json
          hunt_id: string
          id?: string
          note?: string | null
          plant_id: string
          potency_impression?: number | null
          smoothness?: number | null
          tested_at?: string | null
          updated_at?: string
          user_id: string
          verdict?: string | null
        }
        Update: {
          created_at?: string
          effect_descriptors?: Json
          flavor_descriptors?: Json
          hunt_id?: string
          id?: string
          note?: string | null
          plant_id?: string
          potency_impression?: number | null
          smoothness?: number | null
          tested_at?: string | null
          updated_at?: string
          user_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pheno_smoke_tests_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_smoke_tests_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      pheno_stress_observations: {
        Row: {
          created_at: string
          disease_pest_notes: string | null
          end_date: string | null
          hunt_id: string
          id: string
          intensity: string
          linked_diary_entry_id: string | null
          notes: string | null
          plant_id: string
          plant_response: string | null
          recommendation: string
          recovery_notes: string | null
          start_date: string
          status: string
          stress_factor: string
          updated_at: string
          user_id: string
          yield_impact_notes: string | null
        }
        Insert: {
          created_at?: string
          disease_pest_notes?: string | null
          end_date?: string | null
          hunt_id: string
          id?: string
          intensity: string
          linked_diary_entry_id?: string | null
          notes?: string | null
          plant_id: string
          plant_response?: string | null
          recommendation: string
          recovery_notes?: string | null
          start_date: string
          status: string
          stress_factor: string
          updated_at?: string
          user_id: string
          yield_impact_notes?: string | null
        }
        Update: {
          created_at?: string
          disease_pest_notes?: string | null
          end_date?: string | null
          hunt_id?: string
          id?: string
          intensity?: string
          linked_diary_entry_id?: string | null
          notes?: string | null
          plant_id?: string
          plant_response?: string | null
          recommendation?: string
          recovery_notes?: string | null
          start_date?: string
          status?: string
          stress_factor?: string
          updated_at?: string
          user_id?: string
          yield_impact_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pheno_stress_observations_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_stress_observations_linked_diary_entry_id_fkey"
            columns: ["linked_diary_entry_id"]
            isOneToOne: false
            referencedRelation: "diary_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_stress_observations_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
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
      pi_ingest_bridge_credentials: {
        Row: {
          allowed_tent_ids: string[]
          bridge_id: string
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          secret_ciphertext: string | null
          secret_hash: string
          secret_hint: string | null
          secret_key_version: number | null
          secret_nonce: string | null
          secret_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_tent_ids?: string[]
          bridge_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          secret_ciphertext?: string | null
          secret_hash: string
          secret_hint?: string | null
          secret_key_version?: number | null
          secret_nonce?: string | null
          secret_status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          allowed_tent_ids?: string[]
          bridge_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          secret_ciphertext?: string | null
          secret_hash?: string
          secret_hint?: string | null
          secret_key_version?: number | null
          secret_nonce?: string | null
          secret_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pi_ingest_idempotency_keys: {
        Row: {
          bridge_id: string
          captured_at: string
          created_at: string
          device_id: string
          id: string
          idempotency_key: string
          metric: string
          sensor_reading_id: string | null
          tent_id: string
          user_id: string
        }
        Insert: {
          bridge_id: string
          captured_at: string
          created_at?: string
          device_id: string
          id?: string
          idempotency_key: string
          metric: string
          sensor_reading_id?: string | null
          tent_id: string
          user_id?: string
        }
        Update: {
          bridge_id?: string
          captured_at?: string
          created_at?: string
          device_id?: string
          id?: string
          idempotency_key?: string
          metric?: string
          sensor_reading_id?: string | null
          tent_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pi_ingest_idempotency_keys_sensor_reading_id_fkey"
            columns: ["sensor_reading_id"]
            isOneToOne: false
            referencedRelation: "sensor_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pi_ingest_idempotency_keys_tent_id_fkey"
            columns: ["tent_id"]
            isOneToOne: false
            referencedRelation: "tents"
            referencedColumns: ["id"]
          },
        ]
      }
      plants: {
        Row: {
          candidate_label: string | null
          created_at: string
          grow_id: string | null
          health: string
          id: string
          is_archived: boolean
          last_note: string | null
          medium: string | null
          name: string
          pheno_hunt_id: string | null
          photo_url: string | null
          pot_size: string | null
          schema_version: number
          stage: string
          started_at: string
          strain: string | null
          tent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_label?: string | null
          created_at?: string
          grow_id?: string | null
          health?: string
          id?: string
          is_archived?: boolean
          last_note?: string | null
          medium?: string | null
          name: string
          pheno_hunt_id?: string | null
          photo_url?: string | null
          pot_size?: string | null
          schema_version?: number
          stage?: string
          started_at?: string
          strain?: string | null
          tent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_label?: string | null
          created_at?: string
          grow_id?: string | null
          health?: string
          id?: string
          is_archived?: boolean
          last_note?: string | null
          medium?: string | null
          name?: string
          pheno_hunt_id?: string | null
          photo_url?: string | null
          pot_size?: string | null
          schema_version?: number
          stage?: string
          started_at?: string
          strain?: string | null
          tent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plants_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plants_pheno_hunt_id_fkey"
            columns: ["pheno_hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
        ]
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
      quicklog_audit_events: {
        Row: {
          created_at: string
          grow_event_id: string | null
          id: string
          idempotency_key: string | null
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grow_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          reason?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          grow_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      quicklog_idempotency: {
        Row: {
          created_at: string
          grow_event_id: string
          idempotency_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grow_event_id: string
          idempotency_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          grow_event_id?: string
          idempotency_key?: string
          user_id?: string
        }
        Relationships: []
      }
      sensor_ingest_audit_log: {
        Row: {
          auth_type: string
          bridge_token_id: string | null
          captured_at: string
          created_at: string
          id: string
          rows_inserted: number
          rows_received: number
          source: string
          tent_id: string
          user_id: string
        }
        Insert: {
          auth_type: string
          bridge_token_id?: string | null
          captured_at: string
          created_at?: string
          id?: string
          rows_inserted?: number
          rows_received?: number
          source: string
          tent_id: string
          user_id: string
        }
        Update: {
          auth_type?: string
          bridge_token_id?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          rows_inserted?: number
          rows_received?: number
          source?: string
          tent_id?: string
          user_id?: string
        }
        Relationships: []
      }
      sensor_readings: {
        Row: {
          captured_at: string | null
          created_at: string
          device_id: string | null
          id: string
          metric: string
          quality: string
          raw_payload: Json | null
          source: string
          tent_id: string
          ts: string
          user_id: string
          value: number
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          metric: string
          quality?: string
          raw_payload?: Json | null
          source?: string
          tent_id: string
          ts?: string
          user_id?: string
          value: number
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          metric?: string
          quality?: string
          raw_payload?: Json | null
          source?: string
          tent_id?: string
          ts?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string
          paddle_subscription_id?: string
          price_id?: string
          product_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tents: {
        Row: {
          brand: string | null
          created_at: string
          grow_id: string | null
          hardware_config: Json | null
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
          grow_id?: string | null
          hardware_config?: Json | null
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
          grow_id?: string | null
          hardware_config?: Json | null
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
        Relationships: [
          {
            foreignKeyName: "tents_grow_id_fkey"
            columns: ["grow_id"]
            isOneToOne: false
            referencedRelation: "grows"
            referencedColumns: ["id"]
          },
        ]
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
      vpd_targets: {
        Row: {
          created_at: string
          id: string
          stage: string
          updated_at: string
          user_id: string | null
          vpd_high_kpa: number
          vpd_low_kpa: number
        }
        Insert: {
          created_at?: string
          id?: string
          stage: string
          updated_at?: string
          user_id?: string | null
          vpd_high_kpa: number
          vpd_low_kpa: number
        }
        Update: {
          created_at?: string
          id?: string
          stage?: string
          updated_at?: string
          user_id?: string | null
          vpd_high_kpa?: number
          vpd_low_kpa?: number
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
      pheno_sex_observations_latest: {
        Row: {
          herm_observed: boolean | null
          hunt_id: string | null
          note: string | null
          observed_at: string | null
          plant_id: string | null
          sex: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pheno_sex_observations_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "pheno_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pheno_sex_observations_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      ai_credit_allowance: {
        Args: { p_plan_id: string }
        Returns: {
          per_grow: number
          per_month: number
        }[]
      }
      ai_credit_refund: {
        Args: {
          p_idempotency_key: string
          p_reason?: string
          p_spend_id: string
        }
        Returns: Json
      }
      ai_credit_spend: {
        Args: {
          p_feature: string
          p_grow_id: string
          p_idempotency_key: string
          p_model_tier: string
          p_result?: Json
        }
        Returns: Json
      }
      award_nugs: {
        Args: {
          _amount: number
          _kind: string
          _meta?: Json
          _quest_key?: string
        }
        Returns: Json
      }
      billing_entitlement_resolution_operator_audit: {
        Args: { p_limit?: number }
        Returns: Json
      }
      bump_bridge_token_usage: {
        Args: { p_id: string; p_inserted: number }
        Returns: undefined
      }
      compute_level: {
        Args: { total: number }
        Returns: {
          level: number
          tier: string
        }[]
      }
      create_feeding_event: {
        Args: {
          _ec_in?: number
          _ec_out?: number
          _grow_id: string
          _line_id: string
          _note?: string
          _occurred_at?: string
          _ph?: number
          _plant_id?: string
          _products: Json
          _runoff_ec?: number
          _runoff_ml?: number
          _runoff_ph?: number
          _tent_id?: string
          _water_temp_c?: number
        }
        Returns: string
      }
      create_watering_event: {
        Args: {
          _ec_ms_cm?: number
          _grow_id: string
          _note?: string
          _occurred_at?: string
          _ph?: number
          _plant_id?: string
          _runoff_ec?: number
          _runoff_ml?: number
          _runoff_ph?: number
          _tent_id?: string
          _volume_ml: number
          _water_temp_c?: number
        }
        Returns: string
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      evaluate_vpd_drift_ewma: {
        Args: {
          p_alpha?: number
          p_min_readings?: number
          p_stage: string
          p_tent_id: string
          p_window_minutes?: number
        }
        Returns: {
          classification: string
          ewma: number
          high_kpa: number
          low_kpa: number
          sample_count: number
        }[]
      }
      get_latest_tent_sensor_snapshot: {
        Args: { _tent_id: string }
        Returns: Json
      }
      has_pheno_tracker_entitlement: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      max_level_for_user: { Args: { _user_id: string }; Returns: number }
      merge_duplicate_plant: {
        Args: { source_plant_id: string; target_plant_id: string }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      pi_ingest_commit_batch: {
        Args: {
          p_bridge_id: string
          p_rows: Json
          p_tent_id: string
          p_user_id: string
        }
        Returns: {
          inserted: number
          rejected: number
        }[]
      }
      purge_billing_subscription_update_audit: {
        Args: { p_retention_days?: number }
        Returns: Json
      }
      quicklog_save_event: {
        Args: {
          p_details?: Json
          p_event_type: string
          p_feed?: Json
          p_grow_id: string
          p_idempotency_key: string
          p_note?: string
          p_occurred_at?: string
          p_photo_url?: string
          p_plant_id?: string
          p_sensor_snapshot?: Json
          p_tent_id?: string
          p_water?: Json
        }
        Returns: Json
      }
      quicklog_save_manual: {
        Args: {
          p_action: string
          p_details?: Json
          p_humidity_pct?: number
          p_idempotency_key?: string
          p_note?: string
          p_occurred_at?: string
          p_target_id: string
          p_target_type: string
          p_temperature_c?: number
          p_volume_ml?: number
          p_vpd_kpa?: number
        }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "operator" | "customer" | "staff"
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
      app_role: ["operator", "customer", "staff"],
    },
  },
} as const
