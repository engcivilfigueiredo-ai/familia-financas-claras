ALTER TABLE public.financial_goals
  ADD COLUMN goal_kind text NOT NULL DEFAULT 'financeiro',
  ADD COLUMN goal_year integer,
  ADD COLUMN unit text;