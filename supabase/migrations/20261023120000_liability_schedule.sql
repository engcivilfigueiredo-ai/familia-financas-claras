-- Lote 5: dívidas (Patrimônio) geram as parcelas em "Contas a pagar" e consórcio tem
-- "contemplação".
--
-- Antes, a dívida só guardava números (total, saldo, parcela, dia) e nada ia para Contas a
-- pagar. Agora, com "lançar parcelas" ligado, o banco cria uma despesa pendente por mês, no
-- dia de vencimento, ligada à dívida. As parcelas aparecem em Contas a pagar como qualquer
-- outra despesa pendente (e dão baixa com "marcar como pago").
--
-- Janela móvel: o banco mantém as parcelas dos próximos 12 meses e o app completa o resto
-- ao abrir (sync_liability_schedule é idempotente: rodar de novo não duplica nada).
--
-- Contemplação (consórcio): register_liability_contemplation troca o valor da parcela a partir
-- da data informada, ajusta parcelas restantes e saldo devedor (opcionais) e atualiza as
-- parcelas ainda não pagas em Contas a pagar. Parcelas já pagas nunca são alteradas.
--
-- Rodar no SQL editor do Lovable ANTES de publicar o código novo do app.

-- ---------------------------------------------------------------------------
-- 1) Colunas novas
-- ---------------------------------------------------------------------------
ALTER TABLE public.liabilities
  ADD COLUMN IF NOT EXISTS schedule_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_due_date      date,     -- vencimento da 1ª parcela do cronograma
  ADD COLUMN IF NOT EXISTS installments_total  integer,  -- parcelas do cronograma (pagas + a pagar)
  ADD COLUMN IF NOT EXISTS auto_reduce_balance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_id          uuid REFERENCES public.accounts   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id         uuid REFERENCES public.categories ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contemplated_at     date;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS liability_id     uuid REFERENCES public.liabilities ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS liability_period date;  -- 1º dia do mês da parcela (chave anti-duplicidade)

CREATE UNIQUE INDEX IF NOT EXISTS transactions_liability_period_uq
  ON public.transactions (liability_id, liability_period)
  WHERE liability_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Cronograma: cria/atualiza as parcelas da dívida (idempotente)
--    p_liability_id NULL = todas as dívidas do usuário.
--    Retorna quantas parcelas foram criadas, atualizadas ou removidas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_liability_schedule(
  p_liability_id    uuid    DEFAULT NULL,
  p_horizon_months  integer DEFAULT 12
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_today    date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_limit    date;
  l          public.liabilities%ROWTYPE;
  v_changed  integer := 0;
  v_n        integer;
  v_k        integer;
  v_period   date;
  v_due      date;
  v_last_day integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Faça login novamente.' USING ERRCODE = '28000';
  END IF;

  v_limit := (v_today + make_interval(months => GREATEST(COALESCE(p_horizon_months, 12), 1)))::date;

  FOR l IN
    SELECT * FROM public.liabilities
     WHERE (p_liability_id IS NULL OR id = p_liability_id)
     ORDER BY created_at
       FOR UPDATE
  LOOP
    -- cronograma desligado ou incompleto: não deve haver parcelas pendentes lançadas
    IF NOT l.schedule_enabled
       OR l.first_due_date IS NULL
       OR COALESCE(l.installments_total, 0) <= 0
       OR COALESCE(l.monthly_payment, 0) <= 0
       OR l.due_day IS NULL THEN
      DELETE FROM public.transactions WHERE liability_id = l.id AND status <> 'pago';
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_changed := v_changed + v_n;
      CONTINUE;
    END IF;

    FOR v_k IN 0 .. l.installments_total - 1 LOOP
      v_period := (date_trunc('month', l.first_due_date::timestamp) + make_interval(months => v_k))::date;
      v_last_day := EXTRACT(day FROM (v_period + INTERVAL '1 month' - INTERVAL '1 day'))::integer;
      v_due := v_period + (LEAST(l.due_day, v_last_day) - 1);
      EXIT WHEN v_due > v_limit;

      INSERT INTO public.transactions (
        user_id, type, description, amount, date, status, account_id, category_id,
        family_member_id, liability_id, liability_period, installment_number, tags
      ) VALUES (
        v_uid, 'despesa',
        l.name || ' (parcela ' || (v_k + 1) || '/' || l.installments_total || ')',
        l.monthly_payment, v_due, 'pendente', l.account_id, l.category_id,
        l.family_member_id, l.id, v_period, v_k + 1, '{}'::text[]
      )
      ON CONFLICT (liability_id, liability_period) WHERE liability_id IS NOT NULL
      DO UPDATE SET
        amount             = EXCLUDED.amount,
        date               = EXCLUDED.date,
        description        = EXCLUDED.description,
        account_id         = EXCLUDED.account_id,
        category_id        = EXCLUDED.category_id,
        family_member_id   = EXCLUDED.family_member_id,
        installment_number = EXCLUDED.installment_number
      -- só mexe em parcela NÃO paga e que ainda não venceu (histórico fica como está),
      -- e só quando algo realmente mudou (rodar de novo devolve 0)
      WHERE public.transactions.status <> 'pago'
        AND public.transactions.date >= v_today
        AND (public.transactions.amount, public.transactions.date, public.transactions.description,
             public.transactions.account_id, public.transactions.category_id,
             public.transactions.family_member_id, public.transactions.installment_number)
            IS DISTINCT FROM
            (EXCLUDED.amount, EXCLUDED.date, EXCLUDED.description,
             EXCLUDED.account_id, EXCLUDED.category_id,
             EXCLUDED.family_member_id, EXCLUDED.installment_number);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_changed := v_changed + v_n;
    END LOOP;

    -- prazo reduzido: remove as parcelas não pagas que passaram do total
    DELETE FROM public.transactions
     WHERE liability_id = l.id
       AND status <> 'pago'
       AND liability_period >= (date_trunc('month', l.first_due_date::timestamp)
                                + make_interval(months => l.installments_total))::date;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_changed := v_changed + v_n;
  END LOOP;

  RETURN v_changed;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Contemplação do consórcio
--    Atualiza o valor da parcela a partir de p_date, e (opcional) as parcelas restantes e
--    o saldo devedor. Retorna quantas parcelas pendentes já lançadas receberam o novo valor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_liability_contemplation(
  p_liability_id      uuid,
  p_date              date,
  p_new_payment       numeric,
  p_installments_left integer DEFAULT NULL,
  p_remaining_amount  numeric DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  l         public.liabilities%ROWTYPE;
  v_paid    integer;
  v_updated integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Faça login novamente.' USING ERRCODE = '28000';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Informe a data da contemplação.' USING ERRCODE = '22023';
  END IF;
  IF p_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data da contemplação não pode ser futura.' USING ERRCODE = '22023';
  END IF;
  IF p_new_payment IS NULL OR p_new_payment <= 0 THEN
    RAISE EXCEPTION 'Informe o novo valor da parcela.' USING ERRCODE = '22023';
  END IF;
  IF p_installments_left IS NOT NULL AND p_installments_left < 0 THEN
    RAISE EXCEPTION 'Parcelas restantes não pode ser negativo.' USING ERRCODE = '22023';
  END IF;
  IF p_remaining_amount IS NOT NULL AND p_remaining_amount < 0 THEN
    RAISE EXCEPTION 'Saldo devedor não pode ser negativo.' USING ERRCODE = '22023';
  END IF;

  -- RLS: dívida de outro usuário simplesmente não aparece
  SELECT * INTO l FROM public.liabilities WHERE id = p_liability_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dívida não encontrada.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_paid
    FROM public.transactions
   WHERE liability_id = l.id AND status = 'pago';

  UPDATE public.liabilities
     SET monthly_payment    = p_new_payment,
         contemplated_at    = p_date,
         installments_total = CASE WHEN p_installments_left IS NOT NULL
                                   THEN v_paid + p_installments_left
                                   ELSE installments_total END,
         remaining_amount   = COALESCE(p_remaining_amount, remaining_amount)
   WHERE id = l.id;

  -- parcelas já lançadas, não pagas, com vencimento a partir da contemplação
  UPDATE public.transactions
     SET amount = p_new_payment
   WHERE liability_id = l.id
     AND status <> 'pago'
     AND date >= p_date;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- cria as parcelas que faltam na janela e remove as que passaram do novo prazo
  PERFORM public.sync_liability_schedule(l.id);

  RETURN v_updated;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Pagar uma parcela abate o saldo devedor (se a dívida pedir: auto_reduce_balance)
--    Útil em consórcio (o saldo é a soma das parcelas). Em financiamento/empréstimo com
--    juros, deixe desligado e atualize o saldo na mão.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_liability_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.liability_id IS NOT NULL AND OLD.status = 'pago' THEN
    UPDATE public.liabilities
       SET remaining_amount = remaining_amount + abs(OLD.amount)
     WHERE id = OLD.liability_id AND auto_reduce_balance;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.liability_id IS NOT NULL AND NEW.status = 'pago' THEN
    UPDATE public.liabilities
       SET remaining_amount = GREATEST(remaining_amount - abs(NEW.amount), 0)
     WHERE id = NEW.liability_id AND auto_reduce_balance;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_liability_payment ON public.transactions;
CREATE TRIGGER trg_transactions_liability_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_liability_payment();

-- ---------------------------------------------------------------------------
-- 5) Excluir a dívida remove as parcelas ainda não pagas de Contas a pagar
--    (as já pagas ficam no histórico, sem vínculo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_liability_installments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.transactions WHERE liability_id = OLD.id AND status <> 'pago';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_liabilities_cleanup ON public.liabilities;
CREATE TRIGGER trg_liabilities_cleanup
  BEFORE DELETE ON public.liabilities
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_liability_installments();

-- ---------------------------------------------------------------------------
-- 6) Permissões: só usuários logados executam as funções
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.sync_liability_schedule(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_liability_schedule(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.register_liability_contemplation(uuid, date, numeric, integer, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_liability_contemplation(uuid, date, numeric, integer, numeric)
  TO authenticated, service_role;

-- Faz a API enxergar as funções e colunas novas imediatamente.
NOTIFY pgrst, 'reload schema';
