-- Public support forms remain available to signed-out and signed-in visitors,
-- but callers may only provide the fields rendered by the forms. Generated
-- identifiers/timestamps, attachments, and operator review state stay server-
-- controlled. Operator read/review access remains enforced by the existing RLS
-- policies and the narrow grants reasserted below.

ALTER TABLE public.customer_feedback
  ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.contact_messages
  ALTER COLUMN user_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.customer_feedback;
DROP POLICY IF EXISTS "Anyone can send a contact message" ON public.contact_messages;
DROP POLICY IF EXISTS "Operators can read feedback" ON public.customer_feedback;
DROP POLICY IF EXISTS "Operators can update feedback review" ON public.customer_feedback;
DROP POLICY IF EXISTS "Operators can read contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Operators can update contact review" ON public.contact_messages;

REVOKE ALL PRIVILEGES ON TABLE public.customer_feedback FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contact_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES (reviewed_at, reviewed_by, admin_notes)
  ON TABLE public.customer_feedback FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES (reviewed_at, reviewed_by, admin_notes)
  ON TABLE public.contact_messages FROM PUBLIC, anon, authenticated;

GRANT INSERT (
  overall_rating,
  ai_doctor_rating,
  sensors_rating,
  quicklog_rating,
  trust_rating,
  whats_working,
  whats_friction,
  one_improvement,
  grow_context,
  contact_email,
  follow_up_ok,
  user_agent
) ON public.customer_feedback TO anon, authenticated;

GRANT INSERT (
  name,
  email,
  category,
  message,
  grow_context,
  user_agent
) ON public.contact_messages TO anon, authenticated;

GRANT SELECT ON public.customer_feedback TO authenticated;
GRANT SELECT ON public.contact_messages TO authenticated;
GRANT UPDATE (reviewed_at, reviewed_by, admin_notes)
  ON public.customer_feedback TO authenticated;
GRANT UPDATE (reviewed_at, reviewed_by, admin_notes)
  ON public.contact_messages TO authenticated;
GRANT ALL ON public.customer_feedback TO service_role;
GRANT ALL ON public.contact_messages TO service_role;

CREATE POLICY "Public can submit bounded feedback"
  ON public.customer_feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    user_id IS NOT DISTINCT FROM (select auth.uid())
    AND overall_rating BETWEEN 1 AND 5
    AND (ai_doctor_rating IS NULL OR ai_doctor_rating BETWEEN 1 AND 5)
    AND (sensors_rating IS NULL OR sensors_rating BETWEEN 1 AND 5)
    AND (quicklog_rating IS NULL OR quicklog_rating BETWEEN 1 AND 5)
    AND (trust_rating IS NULL OR trust_rating BETWEEN 1 AND 5)
    AND (
      whats_working IS NULL
      OR (
        whats_working = btrim(whats_working)
        AND char_length(whats_working) >= 1
        AND char_length(whats_working) <= 4000
      )
    )
    AND (
      whats_friction IS NULL
      OR (
        whats_friction = btrim(whats_friction)
        AND char_length(whats_friction) >= 1
        AND char_length(whats_friction) <= 4000
      )
    )
    AND (
      one_improvement IS NULL
      OR (
        one_improvement = btrim(one_improvement)
        AND char_length(one_improvement) >= 1
        AND char_length(one_improvement) <= 4000
      )
    )
    AND (
      grow_context IS NULL
      OR (
        grow_context = btrim(grow_context)
        AND char_length(grow_context) >= 1
        AND char_length(grow_context) <= 500
      )
    )
    AND (
      contact_email IS NULL
      OR (
        contact_email = btrim(contact_email)
        AND char_length(contact_email) >= 3
        AND char_length(contact_email) <= 320
        AND position('@' in contact_email) > 1
      )
    )
    AND (user_agent IS NULL OR char_length(user_agent) <= 500)
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND admin_notes IS NULL
    AND created_at >= (select now()) - interval '5 minutes'
    AND created_at <= (select now()) + interval '1 minute'
  );

CREATE POLICY "Public can submit bounded contact messages"
  ON public.contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    user_id IS NOT DISTINCT FROM (select auth.uid())
    AND name = btrim(name)
    AND char_length(name) >= 1
    AND char_length(name) <= 120
    AND email = btrim(email)
    AND char_length(email) >= 3
    AND char_length(email) <= 320
    AND position('@' in email) > 1
    AND category IN (
      'technical_support',
      'bug_report',
      'feature_idea',
      'billing_account',
      'hardware_integration',
      'other'
    )
    AND message = btrim(message)
    AND char_length(message) >= 1
    AND char_length(message) <= 8000
    AND (
      grow_context IS NULL
      OR (
        grow_context = btrim(grow_context)
        AND char_length(grow_context) >= 1
        AND char_length(grow_context) <= 500
      )
    )
    AND (user_agent IS NULL OR char_length(user_agent) <= 500)
    AND attachment_path IS NULL
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND admin_notes IS NULL
    AND created_at >= (select now()) - interval '5 minutes'
    AND created_at <= (select now()) + interval '1 minute'
  );

CREATE POLICY "Operators can read feedback"
  ON public.customer_feedback FOR SELECT
  TO authenticated
  USING (
    public.has_role(
      (select auth.uid()),
      'operator'::public.app_role
    )
  );

CREATE POLICY "Operators can update feedback review"
  ON public.customer_feedback FOR UPDATE
  TO authenticated
  USING (
    public.has_role(
      (select auth.uid()),
      'operator'::public.app_role
    )
  )
  WITH CHECK (
    public.has_role(
      (select auth.uid()),
      'operator'::public.app_role
    )
  );

CREATE POLICY "Operators can read contact messages"
  ON public.contact_messages FOR SELECT
  TO authenticated
  USING (
    public.has_role(
      (select auth.uid()),
      'operator'::public.app_role
    )
  );

CREATE POLICY "Operators can update contact review"
  ON public.contact_messages FOR UPDATE
  TO authenticated
  USING (
    public.has_role(
      (select auth.uid()),
      'operator'::public.app_role
    )
  )
  WITH CHECK (
    public.has_role(
      (select auth.uid()),
      'operator'::public.app_role
    )
  );
