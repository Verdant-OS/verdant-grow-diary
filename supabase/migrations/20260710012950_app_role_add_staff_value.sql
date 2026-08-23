-- Backfill of repo migration 20260709015605: 'staff' enum value.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';;
