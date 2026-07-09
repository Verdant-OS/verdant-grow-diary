-- ============================================================================
-- DEMO pheno hunt seed — labeled sample data for the James Loud walkthrough.
--
-- SAFETY / DOCTRINE:
--   * Every row is clearly labeled "DEMO — …" and isolated in its own demo
--     grow + tent, so it is never mistaken for a real grow or surfaced as
--     live data. Pheno scores/decisions are the grower's own subjective
--     observations (inherently manual), not fabricated sensor/live readings.
--   * Idempotent: re-running deletes the prior demo seed for this hunt id and
--     rebuilds it, so it doubles as its own teardown+reseed.
--   * Scoped to ONE account (the founder's own) via :owner. Touches nothing
--     outside the fixed d3110000-* demo UUID namespace.
--
-- TEARDOWN (removes all demo rows, leaves everything else untouched):
--   BEGIN;
--   DELETE FROM public.pheno_crosses               WHERE hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.pheno_keepers               WHERE hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.pheno_stress_observations   WHERE hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.pheno_smoke_tests           WHERE hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.pheno_score_rounds          WHERE hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.pheno_sex_observations      WHERE hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.pheno_keeper_decisions_log  WHERE hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.pheno_keeper_decisions      WHERE hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.pheno_candidate_scores      WHERE hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.plants                      WHERE pheno_hunt_id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.pheno_hunts                 WHERE id='d3110000-0000-4000-8000-000000000003';
--   DELETE FROM public.tents                       WHERE id='d3110000-0000-4000-8000-000000000002';
--   DELETE FROM public.grows                       WHERE id='d3110000-0000-4000-8000-000000000001';
--   COMMIT;
-- ============================================================================

\set owner  'a6017097-97f1-4af7-88a8-67ea7cdb721d'
\set grow   'd3110000-0000-4000-8000-000000000001'
\set tent   'd3110000-0000-4000-8000-000000000002'
\set hunt   'd3110000-0000-4000-8000-000000000003'

BEGIN;

-- Idempotent reset (dependency order).
DELETE FROM public.pheno_crosses              WHERE hunt_id = :'hunt';
DELETE FROM public.pheno_keepers              WHERE hunt_id = :'hunt';
DELETE FROM public.pheno_stress_observations  WHERE hunt_id = :'hunt';
DELETE FROM public.pheno_smoke_tests          WHERE hunt_id = :'hunt';
DELETE FROM public.pheno_score_rounds         WHERE hunt_id = :'hunt';
DELETE FROM public.pheno_sex_observations     WHERE hunt_id = :'hunt';
DELETE FROM public.pheno_keeper_decisions_log WHERE hunt_id = :'hunt';
DELETE FROM public.pheno_keeper_decisions     WHERE hunt_id = :'hunt';
DELETE FROM public.pheno_candidate_scores     WHERE hunt_id = :'hunt';
DELETE FROM public.plants                     WHERE pheno_hunt_id = :'hunt';
DELETE FROM public.pheno_hunts                WHERE id = :'hunt';
DELETE FROM public.tents                      WHERE id = :'tent';
DELETE FROM public.grows                      WHERE id = :'grow';

-- Grow + tent + hunt.
INSERT INTO public.grows (id, user_id, name, grow_type, stage, started_at, notes, is_archived)
VALUES (:'grow', :'owner', 'DEMO — Loud Pack S1 Hunt (sample data)', 'tent', 'flower',
        now() - interval '78 days', 'Labeled demo data for product walkthrough. Not a real grow.', false);

INSERT INTO public.tents (id, user_id, name, stage, grow_id)
VALUES (:'tent', :'owner', 'DEMO — Hunt Tent A', 'flower', :'grow');

INSERT INTO public.pheno_hunts (id, user_id, grow_id, tent_id, name)
VALUES (:'hunt', :'owner', :'grow', :'tent', 'DEMO — Loud Pack S1 Hunt');

-- 48 candidate plants. Deterministic UUID per candidate n: d3110000-…-0000000000NN.
INSERT INTO public.plants
  (id, user_id, name, strain, stage, started_at, health, grow_id, tent_id, pheno_hunt_id, candidate_label)
SELECT
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  :'owner',
  'DEMO GG4×Zkittlez #' || lpad(n::text, 2, '0'),
  'GG4 × Zkittlez (S1)',
  'flower',
  now() - interval '78 days',
  CASE WHEN n % 11 = 0 THEN 'watch' ELSE 'healthy' END,
  :'grow', :'tent', :'hunt',
  'LP-' || lpad(n::text, 2, '0')
FROM generate_series(1, 48) AS n;

-- Per-candidate "quality tier" drives coherent scores + decisions.
--   keep : 3,7,12,19,31,40      hold : n%5=0 (10,15,20,25,30,35,45)
--   cull : n%8=0 (8,16,24,32,48) + herms 5,22   else undecided
-- Overall trait card (pheno_candidate_scores.traits jsonb).
INSERT INTO public.pheno_candidate_scores (user_id, hunt_id, plant_id, traits, note)
SELECT
  :'owner', :'hunt',
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  jsonb_build_object(
    'nose_loudness',     tier.hi,                         -- 0-10
    'vigor',             least(5, greatest(1, tier.q + (n % 2))),
    'structure',         least(5, greatest(1, tier.q + ((n+1) % 2))),
    'bud_density',       least(5, greatest(1, tier.q)),
    'trichome_coverage', least(5, greatest(1, tier.q + (n % 2))),
    'stretch',           least(5, greatest(1, 6 - tier.q)),
    'yield_impression',  least(5, greatest(1, tier.q))
  ),
  tier.note
FROM generate_series(1, 48) AS n
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN n IN (3,7,12,19,31,40) THEN 4
         WHEN n % 8 = 0 OR n IN (5,22) THEN 2
         WHEN n % 5 = 0 THEN 3 ELSE 3 END AS q,
    CASE WHEN n IN (3,7,12,19,31,40) THEN 9
         WHEN n % 8 = 0 OR n IN (5,22) THEN 3
         ELSE 5 + (n % 3) END AS hi,
    CASE WHEN n IN (3,7,12,19,31,40) THEN 'Loud gassy nose, dense frosty structure.'
         WHEN n IN (5,22) THEN 'Showed nanners at week 5.'
         WHEN n % 8 = 0 THEN 'Airy larf, weak nose.'
         ELSE 'Solid but not standout yet.' END AS note
) AS tier;

-- Sex reveals. Herms: 5,22 (spontaneous — will trip the cull nudge in-app).
-- A few males: 9,27,44. Rest female.
INSERT INTO public.pheno_sex_observations
  (user_id, hunt_id, plant_id, sex, herm_observed, note, observed_at)
SELECT
  :'owner', :'hunt',
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  CASE WHEN n IN (5,22) THEN 'hermaphrodite'
       WHEN n IN (9,27,44) THEN 'male'
       ELSE 'female' END,
  (n IN (5,22)),
  CASE WHEN n IN (5,22) THEN 'Pistil + pollen sac both present.' ELSE NULL END,
  now() - interval '40 days'
FROM generate_series(1, 48) AS n;

-- Keeper decisions (current-row) + append-only log (reason required).
INSERT INTO public.pheno_keeper_decisions (user_id, hunt_id, plant_id, decision, note, decided_at)
SELECT
  :'owner', :'hunt',
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  d.decision, d.reason, now() - interval '35 days'
FROM generate_series(1, 48) AS n
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN n IN (3,7,12,19,31,40) THEN 'keep'
         WHEN n % 8 = 0 OR n IN (5,22) THEN 'cull'
         WHEN n % 5 = 0 THEN 'hold'
         ELSE 'undecided' END AS decision,
    CASE WHEN n IN (3,7,12,19,31,40) THEN 'Top-tier nose and structure — keeper.'
         WHEN n IN (5,22) THEN 'Hermaphrodite — remove to protect the run.'
         WHEN n % 8 = 0 THEN 'Weak vigor and airy buds.'
         WHEN n % 5 = 0 THEN 'Holding for post-cure smoke test.'
         ELSE 'Still evaluating.' END AS reason
) AS d;

INSERT INTO public.pheno_keeper_decisions_log (user_id, hunt_id, plant_id, decision, reason, decided_at)
SELECT
  :'owner', :'hunt',
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  d.decision, d.reason, now() - interval '35 days'
FROM generate_series(1, 48) AS n
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN n IN (3,7,12,19,31,40) THEN 'keep'
         WHEN n % 8 = 0 OR n IN (5,22) THEN 'cull'
         WHEN n % 5 = 0 THEN 'hold'
         ELSE 'undecided' END AS decision,
    CASE WHEN n IN (3,7,12,19,31,40) THEN 'Top-tier nose and structure — keeper.'
         WHEN n IN (5,22) THEN 'Hermaphrodite — remove to protect the run.'
         WHEN n % 8 = 0 THEN 'Weak vigor and airy buds.'
         WHEN n % 5 = 0 THEN 'Holding for post-cure smoke test.'
         ELSE 'Still evaluating.' END AS reason
) AS d
WHERE NOT (n NOT IN (3,7,12,19,31,40) AND n % 8 <> 0 AND n NOT IN (5,22) AND n % 5 <> 0);
-- ^ skip 'undecided' candidates (they get no append-only log row)

-- A second, earlier "hold" log entry for the keepers, so decision history shows
-- a progression (hold → keep) — demonstrates the append-only trail.
INSERT INTO public.pheno_keeper_decisions_log (user_id, hunt_id, plant_id, decision, reason, decided_at)
SELECT
  :'owner', :'hunt',
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'hold', 'Promising at mid-flower — hold for cure.', now() - interval '55 days'
FROM (VALUES (3),(7),(12),(19),(31),(40)) AS k(n);

-- Staged round cards (mid + late flower) for three lead candidates.
INSERT INTO public.pheno_score_rounds
  (user_id, hunt_id, plant_id, round, traits, loud_traits, aroma_descriptors, nose_note, note, observed_at)
SELECT
  :'owner', :'hunt',
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  r.round, '{}'::jsonb,
  jsonb_build_object('nose_loudness', r.nose, 'trichome_coverage', r.tri, 'bud_density', r.den),
  '["gas","funk","candy"]'::jsonb,
  'Sharp fuel up front, sweet candy on the back.',
  'Round card.', now() - r.ago
FROM (VALUES (3),(7),(12)) AS k(n)
CROSS JOIN LATERAL (VALUES
  ('mid_flower', 7, 4, 4, interval '45 days'),
  ('late_flower', 9, 5, 5, interval '30 days')
) AS r(round, nose, tri, den, ago);

-- Post-cure smoke tests for the lead candidates + a couple of holds.
INSERT INTO public.pheno_smoke_tests
  (user_id, hunt_id, plant_id, flavor_descriptors, effect_descriptors, smoothness, potency_impression, verdict, tested_at)
SELECT
  :'owner', :'hunt',
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '["gas","cream","candy"]'::jsonb, '["euphoric","couchlock"]'::jsonb,
  s.smooth, s.pot, s.verdict, now() - interval '10 days'
FROM (VALUES
  (3, 5, 5, 'Best in the room — keeper.'),
  (7, 4, 5, 'Loud and potent.'),
  (12, 4, 4, 'Great flavor, medium punch.'),
  (19, 4, 4, 'Solid keeper.'),
  (31, 3, 4, 'Good, a touch harsh.'),
  (40, 4, 4, 'Clean and smooth.'),
  (15, 3, 3, 'Average — likely a pass.'),
  (25, 3, 3, 'Pleasant but forgettable.')
) AS s(n, smooth, pot, verdict);

-- Stress trials (mix of planned + observed; observed rows carry a response).
INSERT INTO public.pheno_stress_observations
  (user_id, hunt_id, plant_id, stress_factor, status, start_date, end_date, intensity,
   plant_response, recovery_notes, recommendation, notes)
SELECT
  :'owner', :'hunt',
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  st.factor, st.status, (now() - st.start_ago)::date,
  CASE WHEN st.status = 'observed' THEN (now() - st.end_ago)::date ELSE NULL END,
  st.intensity, st.response, st.recovery, st.rec, st.notes
FROM (VALUES
  (3,  'defoliation', 'observed', interval '50 days', interval '44 days', 'moderate',
       'Bounced back within a week, tighter structure.', 'Full recovery.', 'keep', 'Heavy defol day 21.'),
  (7,  'drought',     'observed', interval '48 days', interval '43 days', 'low',
       'Minor droop, no lasting effect.', 'Recovered overnight.', 'keep', 'Skipped one watering.'),
  (12, 'cold_shock',  'observed', interval '46 days', interval '40 days', 'moderate',
       'Purpled nicely, no herming.', 'Stable.', 'keep', 'Night temps to 12C.'),
  (19, 'defoliation', 'planned',  interval '5 days',  interval '0 days', 'low',
       NULL, NULL, 'watch', 'Planned light defol.'),
  (5,  'heat',        'observed', interval '52 days', interval '46 days', 'high',
       'Hermed under stress — confirms instability.', 'Did not recover.', 'reject', 'Tent spiked to 34C.'),
  (44, 'topping',     'planned',  interval '3 days',  interval '0 days', 'low',
       NULL, NULL, 'watch', 'Male — pollen collection candidate.')
-- (end_ago is ignored for 'planned' rows — the CASE below writes end_date NULL)
) AS st(n, factor, status, start_ago, end_ago, intensity, response, recovery, rec, notes);

-- Keepers (four leads) + two crosses (one F1, one selfed S1).
INSERT INTO public.pheno_keepers (id, user_id, hunt_id, source_plant_id, keeper_name, note)
SELECT
  ('d3110000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid,
  :'owner', :'hunt',
  ('d3110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  kname, 'Promoted from candidate LP-' || lpad(n::text, 2, '0') || '.'
FROM (VALUES
  (3,  'Gas Candy'),
  (7,  'Loud Larry'),
  (12, 'Purple Punch Cut'),
  (19, 'Frosty #19')
) AS k(n, kname);

INSERT INTO public.pheno_crosses
  (user_id, hunt_id, female_keeper_id, male_keeper_id, cross_type, cross_name, note, crossed_at)
VALUES
  (:'owner', :'hunt',
   'd3110000-0000-4000-9000-000000000003'::uuid,
   'd3110000-0000-4000-9000-000000000007'::uuid,
   'standard_f1', 'Gas Candy × Loud Larry', 'F1 test cross.', now() - interval '8 days'),
  (:'owner', :'hunt',
   'd3110000-0000-4000-9000-000000000012'::uuid,
   NULL,
   'selfing_s1', 'Purple Punch Cut S1', 'Selfed for feminized seed.', now() - interval '6 days');

COMMIT;
