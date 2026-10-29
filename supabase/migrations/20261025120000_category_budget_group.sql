-- Lote 10: grupo da regra 50-30-20 em cada categoria.
--
-- budget_group diz em qual grupo a categoria entra nos Relatórios:
--   'necessidades' (50%), 'desejos' (30%) ou 'poupanca' (20%: poupança, investimentos e dívidas).
-- NULL = automático: o app sugere o grupo pelo nome da categoria (Alimentação, Moradia...) e
-- subcategorias herdam o grupo da categoria-mãe. Escolher um grupo na tela grava aqui.
--
-- Rodar no SQL editor do Lovable ANTES de publicar o código novo do app.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS budget_group text;

-- só aceita os três grupos (ou NULL = automático)
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_budget_group_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_budget_group_check
  CHECK (budget_group IS NULL OR budget_group IN ('necessidades', 'desejos', 'poupanca'));

-- Faz a API enxergar a coluna nova imediatamente.
NOTIFY pgrst, 'reload schema';
