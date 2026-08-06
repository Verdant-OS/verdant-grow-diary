-- James Loud Methodology: Pathogen Indexing & Focus Group Rubrics

-- 1. Pathogen Tests
CREATE TABLE IF NOT EXISTS public.pcr_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id UUID NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
    tested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    pathogen TEXT NOT NULL, -- e.g., 'HLVd', 'Fusarium', 'Pythium'
    result TEXT NOT NULL CHECK (result IN ('clean', 'infected', 'pending', 'inconclusive')),
    lab_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: Service role only for V0
ALTER TABLE public.pcr_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on pcr_tests"
    ON public.pcr_tests
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can read pcr_tests"
    ON public.pcr_tests
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. Focus Group Scores
CREATE TABLE IF NOT EXISTS public.focus_group_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id UUID NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
    reviewer_name TEXT NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Rubric metrics (0-10 scale)
    aroma_score INTEGER CHECK (aroma_score >= 0 AND aroma_score <= 10),
    flavor_score INTEGER CHECK (flavor_score >= 0 AND flavor_score <= 10),
    effect_score INTEGER CHECK (effect_score >= 0 AND effect_score <= 10),
    bag_appeal_score INTEGER CHECK (bag_appeal_score >= 0 AND bag_appeal_score <= 10),
    ash_color_score INTEGER CHECK (ash_color_score >= 0 AND ash_color_score <= 10),
    
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: Service role only for V0
ALTER TABLE public.focus_group_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on focus_group_scores"
    ON public.focus_group_scores
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can read focus_group_scores"
    ON public.focus_group_scores
    FOR SELECT
    TO authenticated
    USING (true);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION set_pcr_tests_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_pcr_tests_updated_at
    BEFORE UPDATE ON public.pcr_tests
    FOR EACH ROW EXECUTE FUNCTION set_pcr_tests_updated_at();

CREATE OR REPLACE FUNCTION set_focus_group_scores_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_focus_group_scores_updated_at
    BEFORE UPDATE ON public.focus_group_scores
    FOR EACH ROW EXECUTE FUNCTION set_focus_group_scores_updated_at();
