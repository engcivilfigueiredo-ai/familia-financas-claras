ALTER TABLE public.investment_transactions
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS rate_per_share numeric,
  ADD COLUMN IF NOT EXISTS yield_percent numeric;