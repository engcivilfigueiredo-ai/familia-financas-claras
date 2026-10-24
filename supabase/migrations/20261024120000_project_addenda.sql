-- Lote 6: ADITIVOS DE CONTRATO nos projetos da BF Engenharia.
--
-- Cada aditivo guarda data, valor adicional e uma observação opcional. O valor do contrato
-- original (projects.contract_amount) NÃO muda: o banco mantém a soma dos aditivos em
-- projects.addenda_amount, e o contrato vigente é  contract_amount + addenda_amount.
-- Assim, editar o contrato original nunca apaga aditivos, e excluir um aditivo desfaz só a
-- parte dele. O histórico fica na tabela project_addenda.
--
-- Rodar no SQL editor do Lovable ANTES de publicar o código novo do app.

-- ---------------------------------------------------------------------------
-- 1) Tabela de aditivos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_addenda (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  project_id uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date       date        NOT NULL DEFAULT current_date,
  amount     numeric     NOT NULL CHECK (amount > 0),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_addenda_project_idx ON public.project_addenda (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_addenda TO authenticated;
GRANT ALL ON public.project_addenda TO service_role;

ALTER TABLE public.project_addenda ENABLE ROW LEVEL SECURITY;

-- Cada usuário só enxerga os próprios aditivos, e só cria aditivo em projeto que é dele
-- (a chave estrangeira sozinha deixaria apontar para o projeto de outra pessoa).
DROP POLICY IF EXISTS own_rows ON public.project_addenda;
CREATE POLICY own_rows ON public.project_addenda
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Soma dos aditivos no projeto, mantida pelo banco
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS addenda_amount numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_project_addenda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Recalcula do zero (em vez de somar/subtrair): não acumula erro e aguenta
  -- inserção, alteração de valor, troca de projeto e exclusão.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.projects p
       SET addenda_amount = COALESCE(
             (SELECT SUM(a.amount) FROM public.project_addenda a WHERE a.project_id = OLD.project_id), 0)
     WHERE p.id = OLD.project_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.projects p
       SET addenda_amount = COALESCE(
             (SELECT SUM(a.amount) FROM public.project_addenda a WHERE a.project_id = NEW.project_id), 0)
     WHERE p.id = NEW.project_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_addenda_sync ON public.project_addenda;
CREATE TRIGGER trg_project_addenda_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.project_addenda
  FOR EACH ROW EXECUTE FUNCTION public.sync_project_addenda();

-- Faz a API enxergar a tabela e a coluna novas imediatamente.
NOTIFY pgrst, 'reload schema';
