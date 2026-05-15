
-- profiles
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY,
  display_name TEXT,
  nugs_total BIGINT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'seedling',
  current_badge TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- nug_events ledger
CREATE TABLE public.nug_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  amount INT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX nug_events_user_idx ON public.nug_events(user_id, created_at DESC);
ALTER TABLE public.nug_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own events" ON public.nug_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own events" ON public.nug_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- unlocks
CREATE TABLE public.unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
ALTER TABLE public.unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own unlocks" ON public.unlocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own unlocks" ON public.unlocks FOR INSERT WITH CHECK (auth.uid() = user_id);

-- user_quests (one-shot)
CREATE TABLE public.user_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  quest_key TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_key)
);
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own quests" ON public.user_quests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own quests" ON public.user_quests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- level/tier curve helper
CREATE OR REPLACE FUNCTION public.compute_level(total BIGINT)
RETURNS TABLE(level INT, tier TEXT) LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  thresholds BIGINT[] := ARRAY[
    0,500,650,845,1099,1428,1856,2413,3137,4078,5301,                     -- L0..L10
    7500,9750,12675,16478,21421,27847,36201,47061,61179,79533,            -- L11..L20 (gated by harvests in app)
    45000,58500,76050,98865,128525,167082,217207,282369,367080,477204,    -- L21..L30
    160000,208000,270400,351520,456976,594069,772290,1003977,1305170,1696721, -- L31..L40
    500000,650000,845000,1098500,1428050,1856465,2413404,3137425,4078652,5302248 -- L41..L50
  ];
  l INT := 0;
  t TEXT := 'seedling';
BEGIN
  FOR i IN 1..array_length(thresholds,1) LOOP
    IF total >= thresholds[i] THEN l := i - 1; END IF;
  END LOOP;
  IF l >= 41 THEN t := 'harvest_master';
  ELSIF l >= 31 THEN t := 'fruiting';
  ELSIF l >= 21 THEN t := 'flowering';
  ELSIF l >= 11 THEN t := 'vegetative';
  ELSE t := 'seedling';
  END IF;
  RETURN QUERY SELECT l, t;
END; $$;

-- award NUGs in a single transaction
CREATE OR REPLACE FUNCTION public.award_nugs(
  _kind TEXT,
  _amount INT,
  _meta JSONB DEFAULT '{}'::jsonb,
  _quest_key TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  prev_level INT;
  new_total BIGINT;
  lvl_row RECORD;
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
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- one-shot guard
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
  UPDATE public.profiles SET level = lvl_row.level, tier = lvl_row.tier WHERE user_id = uid;

  -- award unlocks for any newly crossed level
  FOR k IN SELECT jsonb_object_keys(unlock_map) LOOP
    IF (k::INT) <= lvl_row.level AND (k::INT) > prev_level THEN
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
    'new_level', lvl_row.level,
    'tier', lvl_row.tier,
    'unlocked', to_jsonb(unlocked)
  );
END; $$;

-- backfill profile rows for existing users
INSERT INTO public.profiles (user_id, display_name)
SELECT id, COALESCE(raw_user_meta_data->>'display_name', split_part(email,'@',1)) FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
