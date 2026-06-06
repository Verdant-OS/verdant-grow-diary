
CREATE OR REPLACE FUNCTION public.award_nugs(
  _kind text,
  _amount integer,
  _meta jsonb DEFAULT '{}'::jsonb,
  _quest_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
  max_award CONSTANT INT := 1500;
  per_kind_cap INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF _amount IS NULL OR _amount <= 0 OR _amount > max_award THEN
    RAISE EXCEPTION 'amount out of range';
  END IF;

  per_kind_cap := COALESCE((jsonb_build_object(
    'daily_log',         50,
    'photo_log',         50,
    'sensor_snapshot',   50,
    'quick_log',         50,
    'quest',            250,
    'ai_coach',         100,
    'harvest',         1500
  ) ->> _kind)::INT, 0);

  IF _amount > per_kind_cap THEN
    RAISE EXCEPTION 'amount out of range';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.award_nugs(text, integer, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_nugs(text, integer, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.profiles_block_gamification_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.nugs_total IS DISTINCT FROM OLD.nugs_total
     OR NEW.level IS DISTINCT FROM OLD.level
     OR NEW.tier  IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'gamification fields (nugs_total, level, tier) are not directly writable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_gamification_updates ON public.profiles;
CREATE TRIGGER profiles_block_gamification_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_block_gamification_updates();
