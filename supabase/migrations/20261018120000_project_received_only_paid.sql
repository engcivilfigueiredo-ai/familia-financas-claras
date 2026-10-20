-- Receita vinculada a projeto só soma em projects.received_amount quando está PAGA.
-- Antes o trigger somava qualquer receita (inclusive status 'pendente'), então valores
-- a receber apareciam como já recebidos.
--
-- Rodar no SQL Editor do Supabase (ou via supabase CLI).

CREATE OR REPLACE FUNCTION public.sync_project_received()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE')
     AND OLD.project_id IS NOT NULL AND OLD.type = 'receita' AND OLD.status = 'pago' THEN
    UPDATE public.projects
       SET received_amount = GREATEST(received_amount - abs(OLD.amount), 0)
     WHERE id = OLD.project_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE')
     AND NEW.project_id IS NOT NULL AND NEW.type = 'receita' AND NEW.status = 'pago' THEN
    UPDATE public.projects
       SET received_amount = received_amount + abs(NEW.amount)
     WHERE id = NEW.project_id;
  END IF;
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- ATENÇÃO: dados já existentes.
-- Receitas pendentes criadas ANTES desta migration já estão somadas em received_amount.
-- Quando forem marcadas como pagas, serão somadas de novo. Como received_amount também
-- pode ser editado à mão na tela BF Engenharia, NÃO há correção automática aqui.
--
-- 1) Veja quais projetos divergem do que está pago:
--
--   SELECT p.project_number, p.name, p.received_amount,
--          COALESCE(SUM(abs(t.amount)) FILTER (WHERE t.type = 'receita' AND t.status = 'pago'), 0)
--            AS pago_nas_transacoes
--     FROM public.projects p
--     LEFT JOIN public.transactions t ON t.project_id = p.id
--    GROUP BY p.id
--   HAVING p.received_amount
--          <> COALESCE(SUM(abs(t.amount)) FILTER (WHERE t.type = 'receita' AND t.status = 'pago'), 0);
--
-- 2) Se quiser alinhar tudo ao que está pago (sobrescreve valores digitados à mão):
--
--   UPDATE public.projects p
--      SET received_amount = COALESCE((
--            SELECT SUM(abs(t.amount)) FROM public.transactions t
--             WHERE t.project_id = p.id AND t.type = 'receita' AND t.status = 'pago'), 0);
-- ---------------------------------------------------------------------------
