-- Persist footer newsletter opt-ins. Safe to apply more than once.
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT newsletter_subscribers_email_normalized CHECK (email = LOWER(email)),
  CONSTRAINT newsletter_subscribers_email_length CHECK (length(email) BETWEEN 3 AND 254)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created_at
  ON public.newsletter_subscribers(created_at DESC);
