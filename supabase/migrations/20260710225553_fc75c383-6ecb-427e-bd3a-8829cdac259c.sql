
-- Helper: ownership checks are inlined via EXISTS against grows/tents/plants/grow_events.

-- diary_entries: tighten INSERT with FK ownership, add WITH CHECK on UPDATE
DROP POLICY IF EXISTS "Users insert own entries" ON public.diary_entries;
CREATE POLICY "Users insert own entries" ON public.diary_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (grow_id IS NULL OR EXISTS (SELECT 1 FROM public.grows g WHERE g.id = grow_id AND g.user_id = auth.uid()))
    AND (tent_id IS NULL OR EXISTS (SELECT 1 FROM public.tents t WHERE t.id = tent_id AND t.user_id = auth.uid()))
    AND (plant_id IS NULL OR EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users update own entries" ON public.diary_entries;
CREATE POLICY "Users update own entries" ON public.diary_entries
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (grow_id IS NULL OR EXISTS (SELECT 1 FROM public.grows g WHERE g.id = grow_id AND g.user_id = auth.uid()))
    AND (tent_id IS NULL OR EXISTS (SELECT 1 FROM public.tents t WHERE t.id = tent_id AND t.user_id = auth.uid()))
    AND (plant_id IS NULL OR EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid()))
  );

-- grow_events: INSERT + UPDATE ownership
DROP POLICY IF EXISTS "Users insert own grow_events" ON public.grow_events;
CREATE POLICY "Users insert own grow_events" ON public.grow_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grows g WHERE g.id = grow_id AND g.user_id = auth.uid())
    AND (tent_id IS NULL OR EXISTS (SELECT 1 FROM public.tents t WHERE t.id = tent_id AND t.user_id = auth.uid()))
    AND (plant_id IS NULL OR EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users update own grow_events" ON public.grow_events;
CREATE POLICY "Users update own grow_events" ON public.grow_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grows g WHERE g.id = grow_id AND g.user_id = auth.uid())
    AND (tent_id IS NULL OR EXISTS (SELECT 1 FROM public.tents t WHERE t.id = tent_id AND t.user_id = auth.uid()))
    AND (plant_id IS NULL OR EXISTS (SELECT 1 FROM public.plants p WHERE p.id = plant_id AND p.user_id = auth.uid()))
  );

-- harvests: verify grow ownership
DROP POLICY IF EXISTS "Users insert own harvests" ON public.harvests;
CREATE POLICY "Users insert own harvests" ON public.harvests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grows g WHERE g.id = grow_id AND g.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users update own harvests" ON public.harvests;
CREATE POLICY "Users update own harvests" ON public.harvests
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grows g WHERE g.id = grow_id AND g.user_id = auth.uid())
  );

-- plants: verify grow_id and tent_id ownership
DROP POLICY IF EXISTS "Users insert own plants" ON public.plants;
CREATE POLICY "Users insert own plants" ON public.plants
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (grow_id IS NULL OR EXISTS (SELECT 1 FROM public.grows g WHERE g.id = grow_id AND g.user_id = auth.uid()))
    AND (tent_id IS NULL OR EXISTS (SELECT 1 FROM public.tents t WHERE t.id = tent_id AND t.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users update own plants" ON public.plants;
CREATE POLICY "Users update own plants" ON public.plants
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (grow_id IS NULL OR EXISTS (SELECT 1 FROM public.grows g WHERE g.id = grow_id AND g.user_id = auth.uid()))
    AND (tent_id IS NULL OR EXISTS (SELECT 1 FROM public.tents t WHERE t.id = tent_id AND t.user_id = auth.uid()))
  );

-- Event-detail tables: verify event_id ties to a grow_event owned by the same user.
-- watering_events
DROP POLICY IF EXISTS "Users insert own watering_events" ON public.watering_events;
CREATE POLICY "Users insert own watering_events" ON public.watering_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users update own watering_events" ON public.watering_events;
CREATE POLICY "Users update own watering_events" ON public.watering_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );

-- feeding_events
DROP POLICY IF EXISTS "Users insert own feeding_events" ON public.feeding_events;
CREATE POLICY "Users insert own feeding_events" ON public.feeding_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users update own feeding_events" ON public.feeding_events;
CREATE POLICY "Users update own feeding_events" ON public.feeding_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );

-- training_events
DROP POLICY IF EXISTS "Users insert own training_events" ON public.training_events;
CREATE POLICY "Users insert own training_events" ON public.training_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users update own training_events" ON public.training_events;
CREATE POLICY "Users update own training_events" ON public.training_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );

-- observation_events
DROP POLICY IF EXISTS "Users insert own observation_events" ON public.observation_events;
CREATE POLICY "Users insert own observation_events" ON public.observation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users update own observation_events" ON public.observation_events;
CREATE POLICY "Users update own observation_events" ON public.observation_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );

-- photo_events
DROP POLICY IF EXISTS "Users insert own photo_events" ON public.photo_events;
CREATE POLICY "Users insert own photo_events" ON public.photo_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users update own photo_events" ON public.photo_events;
CREATE POLICY "Users update own photo_events" ON public.photo_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );

-- environment_events
DROP POLICY IF EXISTS "Users insert own environment_events" ON public.environment_events;
CREATE POLICY "Users insert own environment_events" ON public.environment_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users update own environment_events" ON public.environment_events;
CREATE POLICY "Users update own environment_events" ON public.environment_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.grow_events ge WHERE ge.id = event_id AND ge.user_id = auth.uid())
  );
