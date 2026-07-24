-- Cultivar follows — in-app retention loop for the Strain Reference Library.
--
-- A signed-in grower can "follow" a public cultivar reference (by slug). When the
-- cultivar's immutable guide version advances past the version they last saw, the
-- app shows an in-app "updated since you followed" nudge. This is a user
-- preference only:
--   * no plants/grows/tents/sensors/alerts/action_queue/AI/billing tables touched;
--   * no plant ↔ cultivar linkage (plants.strain stays free-text and unlinked);
--   * cultivar_slug is free text (V1 cultivars are bundled constants, not a table).
--
-- Own-scoped RLS only — a row is visible/writable exclusively by its owner.

CREATE TABLE IF NOT EXISTS public.cultivar_follows (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cultivar_slug      text NOT NULL CHECK (char_length(cultivar_slug) BETWEEN 1 AND 128),
  seen_guide_version integer NOT NULL DEFAULT 1 CHECK (seen_guide_version >= 1),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cultivar_slug)
);

CREATE INDEX IF NOT EXISTS cultivar_follows_user_idx
  ON public.cultivar_follows(user_id);

ALTER TABLE public.cultivar_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cultivar_follows_select_own" ON public.cultivar_follows
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "cultivar_follows_insert_own" ON public.cultivar_follows
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cultivar_follows_update_own" ON public.cultivar_follows
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cultivar_follows_delete_own" ON public.cultivar_follows
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cultivar_follows TO authenticated;
