ALTER TABLE public.investments
  ADD COLUMN plan_type text,
  ADD COLUMN tax_regime text,
  ADD COLUMN withhold_ir boolean DEFAULT false,
  ADD COLUMN beneficiary text;

ALTER TABLE public.recurring_transactions
  ADD COLUMN investment_id uuid REFERENCES public.investments(id) ON DELETE SET NULL,
  ADD COLUMN is_investment_contribution boolean DEFAULT false;

COMMENT ON COLUMN public.investments.plan_type IS 'PGBL ou VGBL';
COMMENT ON COLUMN public.investments.tax_regime IS 'progressivo ou regressivo';
COMMENT ON COLUMN public.investments.withhold_ir IS 'indica retenção de IR na fonte';
COMMENT ON COLUMN public.investments.beneficiary IS 'beneficiário do plano';
COMMENT ON COLUMN public.recurring_transactions.investment_id IS 'investimento vinculado ao aporte recorrente';
COMMENT ON COLUMN public.recurring_transactions.is_investment_contribution IS 'true quando a recorrência é um aporte de previdência/investimento';
