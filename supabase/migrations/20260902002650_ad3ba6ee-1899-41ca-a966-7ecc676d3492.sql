ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS ticker text,
  ADD COLUMN IF NOT EXISTS last_quote numeric,
  ADD COLUMN IF NOT EXISTS quote_updated_at timestamp with time zone;