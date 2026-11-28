-- Per-user daily cap for the ai-cultivar-qa Edge function. Security review
-- finding E1 (2026-11-19): the paid Cultivar Q&A sits outside the grow credit
-- ledger, so nothing stopped one account from looping the shared AI gateway.
--
-- The function counts a call here before it calls the model. Browsers have no
-- access: only service_role may execute the consume function, and no role may
-- read or write the table directly.
CREATE TABLE public.ai_cultivar_qa_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_day date NOT NULL,
  call_count integer NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  PRIMARY KEY (user_id, usage_day)
);

ALTER TABLE public.ai_cultivar_qa_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_cultivar_qa_daily_usage
  FROM PUBLIC, anon, authenticated, service_role;

-- Count one call for p_user_id on the current UTC day if the day's count is
-- below p_daily_limit. One statement, so two concurrent calls cannot both take
-- the last slot. Returns {allowed, used, limit}.
CREATE FUNCTION public.ai_cultivar_qa_consume(p_user_id uuid, p_daily_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'utc')::date;
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_daily_limit IS NULL OR p_daily_limit <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'used', 0, 'limit', coalesce(p_daily_limit, 0));
  END IF;

  INSERT INTO public.ai_cultivar_qa_daily_usage AS u (user_id, usage_day, call_count)
    VALUES (p_user_id, v_day, 1)
    ON CONFLICT (user_id, usage_day) DO UPDATE
      SET call_count = u.call_count + 1
      WHERE u.call_count < p_daily_limit
    RETURNING u.call_count INTO v_count;

  IF v_count IS NULL THEN
    SELECT u.call_count INTO v_count
      FROM public.ai_cultivar_qa_daily_usage AS u
      WHERE u.user_id = p_user_id AND u.usage_day = v_day;
    RETURN jsonb_build_object('allowed', false, 'used', coalesce(v_count, 0), 'limit', p_daily_limit);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'used', v_count, 'limit', p_daily_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.ai_cultivar_qa_consume(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_cultivar_qa_consume(uuid, integer) TO service_role;
