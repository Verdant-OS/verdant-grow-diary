
-- Harvests table
CREATE TABLE public.harvests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  grow_id UUID NOT NULL,
  harvested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  grow_type TEXT NOT NULL,
  medium TEXT,
  yield_grams NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.harvests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own harvests" ON public.harvests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own harvests" ON public.harvests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own harvests" ON public.harvests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own harvests" ON public.harvests FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_harvests_user ON public.harvests(user_id);

-- Helper: max level allowed for a user given their harvest count
CREATE OR REPLACE FUNCTION public.max_level_for_user(_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h INT;
BEGIN
  SELECT COUNT(*) INTO h FROM public.harvests WHERE user_id = _user_id;
  IF h >= 3 THEN RETURN 20;
  ELSIF h >= 2 THEN RETURN 17;
  ELSIF h >= 1 THEN RETURN 14;
  ELSE RETURN 10;
  END IF;
END;
$$;

-- Update award_nugs to enforce the harvest gate (cap level at max_level_for_user)
CREATE OR REPLACE FUNCTION public.award_nugs(_kind text, _amount integer, _meta jsonb DEFAULT '{}'::jsonb, _quest_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  prev_level INT;
  new_total BIGINT;
  lvl_row RECORD;
  capped_level INT;
  cap INT;
  unlocked TEXT[] := ARRAY[]::TEXT[];
  unlock_map JSONB := '{
    "5": ["grow_badge","strain_library"],
    "10": ["custom_reminders","second_grow"],
    "15": ["vpd_tracker"],
    "20": ["strain_discount"],
    "25": ["breeding_database"],
    "30": ["premium_guides","priority_coach"],
    "35": ["mentor_badge"],
    "40": ["limited_strains","custom_advisory"],
    "45": ["hall_of_growers"],
    "50": ["legendary_cultivator"]
  }'::jsonb;
  k TEXT;
  ukey TEXT;
  final_tier TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF _quest_key IS NOT NULL THEN
    BEGIN
      INSERT INTO public.user_quests (user_id, quest_key) VALUES (uid, _quest_key);
    EXCEPTION WHEN unique_violation THEN
      SELECT nugs_total, level INTO new_total, prev_level FROM public.profiles WHERE user_id = uid;
      RETURN jsonb_build_object('awarded',0,'new_total',new_total,'new_level',prev_level,'unlocked','[]'::jsonb,'duplicate',true);
    END;
  END IF;

  INSERT INTO public.profiles (user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  SELECT level INTO prev_level FROM public.profiles WHERE user_id = uid;

  INSERT INTO public.nug_events (user_id, kind, amount, meta)
  VALUES (uid, _kind, _amount, _meta);

  UPDATE public.profiles SET nugs_total = nugs_total + _amount WHERE user_id = uid
    RETURNING nugs_total INTO new_total;

  SELECT * INTO lvl_row FROM public.compute_level(new_total);
  cap := public.max_level_for_user(uid);
  capped_level := LEAST(lvl_row.level, cap);

  IF capped_level >= 41 THEN final_tier := 'harvest_master';
  ELSIF capped_level >= 31 THEN final_tier := 'fruiting';
  ELSIF capped_level >= 21 THEN final_tier := 'flowering';
  ELSIF capped_level >= 11 THEN final_tier := 'vegetative';
  ELSE final_tier := 'seedling';
  END IF;

  UPDATE public.profiles SET level = capped_level, tier = final_tier WHERE user_id = uid;

  FOR k IN SELECT jsonb_object_keys(unlock_map) LOOP
    IF (k::INT) <= capped_level AND (k::INT) > prev_level THEN
      FOR ukey IN SELECT jsonb_array_elements_text(unlock_map -> k) LOOP
        BEGIN
          INSERT INTO public.unlocks (user_id, key) VALUES (uid, ukey);
          unlocked := unlocked || ukey;
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'awarded', _amount,
    'new_total', new_total,
    'prev_level', prev_level,
    'new_level', capped_level,
    'uncapped_level', lvl_row.level,
    'level_cap', cap,
    'tier', final_tier,
    'unlocked', to_jsonb(unlocked)
  );
END; $function$;

-- Recompute level/tier when a harvest is added/removed (so user advances past the cap immediately)
CREATE OR REPLACE FUNCTION public.recompute_level_after_harvest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  total BIGINT;
  lvl_row RECORD;
  cap INT;
  final_level INT;
  final_tier TEXT;
  prev_level INT;
  unlock_map JSONB := '{
    "5": ["grow_badge","strain_library"],
    "10": ["custom_reminders","second_grow"],
    "15": ["vpd_tracker"],
    "20": ["strain_discount"],
    "25": ["breeding_database"],
    "30": ["premium_guides","priority_coach"],
    "35": ["mentor_badge"],
    "40": ["limited_strains","custom_advisory"],
    "45": ["hall_of_growers"],
    "50": ["legendary_cultivator"]
  }'::jsonb;
  k TEXT;
  ukey TEXT;
BEGIN
  uid := COALESCE(NEW.user_id, OLD.user_id);
  SELECT nugs_total, level INTO total, prev_level FROM public.profiles WHERE user_id = uid;
  IF total IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO lvl_row FROM public.compute_level(total);
  cap := public.max_level_for_user(uid);
  final_level := LEAST(lvl_row.level, cap);

  IF final_level >= 41 THEN final_tier := 'harvest_master';
  ELSIF final_level >= 31 THEN final_tier := 'fruiting';
  ELSIF final_level >= 21 THEN final_tier := 'flowering';
  ELSIF final_level >= 11 THEN final_tier := 'vegetative';
  ELSE final_tier := 'seedling';
  END IF;

  UPDATE public.profiles SET level = final_level, tier = final_tier WHERE user_id = uid;

  -- Award unlocks for any newly crossed levels
  FOR k IN SELECT jsonb_object_keys(unlock_map) LOOP
    IF (k::INT) <= final_level AND (k::INT) > COALESCE(prev_level, 0) THEN
      FOR ukey IN SELECT jsonb_array_elements_text(unlock_map -> k) LOOP
        BEGIN
          INSERT INTO public.unlocks (user_id, key) VALUES (uid, ukey);
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER harvests_recompute_level
AFTER INSERT OR DELETE ON public.harvests
FOR EACH ROW EXECUTE FUNCTION public.recompute_level_after_harvest();
