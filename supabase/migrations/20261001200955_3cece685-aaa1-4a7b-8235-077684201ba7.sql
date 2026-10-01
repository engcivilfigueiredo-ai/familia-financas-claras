ALTER TABLE public.transactions ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_project ON public.transactions(project_id);

CREATE OR REPLACE FUNCTION public.sync_project_received()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.project_id IS NOT NULL AND OLD.type = 'receita' THEN
    UPDATE public.projects SET received_amount = GREATEST(received_amount - abs(OLD.amount), 0) WHERE id = OLD.project_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.project_id IS NOT NULL AND NEW.type = 'receita' THEN
    UPDATE public.projects SET received_amount = received_amount + abs(NEW.amount) WHERE id = NEW.project_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_transactions_project_received
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_project_received();