-- Lote 2: operações financeiras de vários passos passam a rodar em UMA transação no banco.
--
-- Antes, o navegador fazia vários INSERT/UPDATE separados. Se a internet caísse (ou outra aba
-- mexesse ao mesmo tempo) no meio do caminho, sobravam dados pela metade: compra parcelada sem
-- parcelas, aporte registrado sem o valor investido atualizado, e dois aportes simultâneos
-- podiam sobrescrever um ao outro (ler -> somar -> gravar).
--
-- Ambas as funções são SECURITY INVOKER: o RLS continua valendo e o user_id vem SEMPRE de
-- auth.uid() (nunca do que o navegador enviar).
--
-- Rodar no SQL editor do Lovable ANTES de publicar o código novo do app.

-- ---------------------------------------------------------------------------
-- 1) Compra parcelada: cabeçalho + faturas + todas as parcelas, tudo ou nada.
--    O navegador calcula o plano (datas, faturas, valores) e o banco só grava.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_installment_purchase(
  p_parent   jsonb,  -- {purchase_description, total_amount, installment_count, credit_card_id,
                     --  category_id, family_member_id, purchase_date}
  p_invoices jsonb,  -- [{reference_month, closing_date, due_date}]
  p_rows     jsonb   -- [{description, amount, date, category_id, credit_card_id, family_member_id,
                     --   payment_method, status, installment_number, invoice_month, notes, tags}]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_card           uuid := (p_parent->>'credit_card_id')::uuid;
  v_count          integer := (p_parent->>'installment_count')::integer;
  v_total          numeric := (p_parent->>'total_amount')::numeric;
  v_installment_id uuid;
  v_sum            numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Faça login novamente.' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0
     OR jsonb_typeof(p_invoices) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Nenhuma parcela informada.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_rows) <> v_count THEN
    RAISE EXCEPTION 'Quantidade de parcelas (%) difere do informado (%).',
      jsonb_array_length(p_rows), v_count USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(r.amount), 0)
    INTO v_sum
    FROM jsonb_to_recordset(p_rows) AS r(amount numeric);
  IF abs(v_sum - v_total) > 0.005 THEN
    RAISE EXCEPTION 'A soma das parcelas (%) difere do total (%).', v_sum, v_total
      USING ERRCODE = '22023';
  END IF;

  -- RLS faz o cartão de outro usuário parecer inexistente.
  IF NOT EXISTS (SELECT 1 FROM public.credit_cards WHERE id = v_card) THEN
    RAISE EXCEPTION 'Cartão não encontrado.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.installments (
    user_id, purchase_description, total_amount, installment_count,
    credit_card_id, category_id, family_member_id, purchase_date
  ) VALUES (
    v_uid,
    p_parent->>'purchase_description',
    v_total,
    v_count,
    v_card,
    NULLIF(p_parent->>'category_id', '')::uuid,
    NULLIF(p_parent->>'family_member_id', '')::uuid,
    (p_parent->>'purchase_date')::date
  )
  RETURNING id INTO v_installment_id;

  INSERT INTO public.invoices (user_id, credit_card_id, reference_month, closing_date, due_date)
  SELECT v_uid, v_card, r.reference_month, r.closing_date, r.due_date
    FROM jsonb_to_recordset(p_invoices)
         AS r(reference_month date, closing_date date, due_date date)
  ON CONFLICT (credit_card_id, reference_month)
  DO UPDATE SET closing_date = EXCLUDED.closing_date, due_date = EXCLUDED.due_date;

  INSERT INTO public.transactions (
    user_id, type, description, amount, date, category_id, credit_card_id,
    family_member_id, payment_method, status, installment_id, installment_number,
    invoice_month, notes, tags
  )
  SELECT v_uid, 'despesa', r.description, r.amount, r.date, r.category_id, v_card,
         r.family_member_id, COALESCE(r.payment_method, 'crédito'),
         COALESCE(r.status, 'pendente'), v_installment_id, r.installment_number,
         r.invoice_month, r.notes, COALESCE(r.tags, '{}'::text[])
    FROM jsonb_to_recordset(p_rows) AS r(
      description text, amount numeric, date date, category_id uuid,
      family_member_id uuid, payment_method text, status text,
      installment_number integer, invoice_month date, notes text, tags text[]
    );

  RETURN v_installment_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Movimentação de investimento (aporte, resgate, rendimento, dividendo, JCP).
--    Trava a linha do investimento (FOR UPDATE), grava o movimento, o lançamento de caixa
--    e atualiza os valores, tudo na mesma transação. Sem "ler -> somar -> gravar" no navegador.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_investment_move(
  p_investment_id   uuid,
  p_type            text,
  p_amount          numeric,
  p_date            date,
  p_investment_name text,
  p_account_id      uuid DEFAULT NULL,
  p_ir_type         text DEFAULT NULL,
  p_family_member_id uuid DEFAULT NULL,
  p_recurring_id    uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_amount    numeric := abs(p_amount);
  v_invested  numeric;
  v_current   numeric;
  v_qty_inv   numeric;
  v_last      numeric;
  v_avg       numeric;
  v_quantity  numeric;
  v_rate      numeric;
  v_yield     numeric;
  v_price     numeric;
  v_category  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Faça login novamente.' USING ERRCODE = '28000';
  END IF;

  IF p_type NOT IN ('aplicação', 'resgate', 'rendimento', 'dividendo', 'jcp') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido: %.', p_type USING ERRCODE = '22023';
  END IF;

  IF v_amount IS NULL OR v_amount = 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.' USING ERRCODE = '22023';
  END IF;

  -- Trava a linha: dois aportes simultâneos passam a ser executados um depois do outro.
  -- RLS garante que só o dono enxerga (e portanto trava) o investimento.
  SELECT invested_amount, current_amount, quantity, last_quote, average_price
    INTO v_invested, v_current, v_qty_inv, v_last, v_avg
    FROM public.investments
   WHERE id = p_investment_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investimento não encontrado.' USING ERRCODE = '22023';
  END IF;

  IF p_account_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = '22023';
  END IF;

  -- Detalhes por cota (só para proventos) a partir da quantidade atual.
  IF p_type IN ('dividendo', 'jcp', 'rendimento') AND COALESCE(v_qty_inv, 0) > 0 THEN
    v_quantity := v_qty_inv;
    v_rate := v_amount / v_qty_inv;
    v_price := COALESCE(v_last, v_avg, 0);
    IF v_price > 0 THEN
      v_yield := (v_rate / v_price) * 100;
    END IF;
  END IF;

  INSERT INTO public.investment_transactions (
    user_id, investment_id, account_id, type, amount, date, ir_type,
    quantity, rate_per_share, yield_percent
  ) VALUES (
    v_uid, p_investment_id, p_account_id, p_type, v_amount, p_date, p_ir_type,
    v_quantity, v_rate, v_yield
  );

  IF p_type = 'aplicação' THEN
    v_invested := v_invested + v_amount;
    v_current  := v_current + v_amount;
    IF p_account_id IS NOT NULL THEN
      INSERT INTO public.transactions (
        user_id, type, description, amount, date, account_id, family_member_id,
        status, payment_method, transfer_group_id, is_recurring, recurring_id, tags
      ) VALUES (
        v_uid, 'transferencia', 'Aporte em ' || p_investment_name, -v_amount, p_date,
        p_account_id, p_family_member_id, 'pago', 'transferência', gen_random_uuid(),
        p_recurring_id IS NOT NULL, p_recurring_id, '{}'::text[]
      );
    END IF;

  ELSIF p_type = 'resgate' THEN
    v_invested := GREATEST(v_invested - v_amount, 0);
    v_current  := GREATEST(v_current - v_amount, 0);
    IF p_account_id IS NOT NULL THEN
      INSERT INTO public.transactions (
        user_id, type, description, amount, date, account_id, family_member_id,
        status, payment_method, transfer_group_id, tags
      ) VALUES (
        v_uid, 'transferencia', 'Resgate de ' || p_investment_name, v_amount, p_date,
        p_account_id, p_family_member_id, 'pago', 'transferência', gen_random_uuid(),
        '{}'::text[]
      );
    END IF;

  ELSE
    -- rendimento / dividendo / jcp: valoriza o investimento e entra como receita no caixa
    v_current := v_current + v_amount;
    SELECT id INTO v_category
      FROM public.categories
     WHERE type = 'receita'
       AND name = CASE WHEN p_type = 'dividendo' THEN 'Dividendos' ELSE 'Rendimentos' END
     LIMIT 1;
    INSERT INTO public.transactions (
      user_id, type, description, amount, date, account_id, category_id,
      family_member_id, status, notes, tags
    ) VALUES (
      v_uid, 'receita',
      CASE p_type WHEN 'jcp' THEN 'JCP' WHEN 'dividendo' THEN 'Dividendo' ELSE 'Rendimento' END
        || ' - ' || p_investment_name,
      v_amount, p_date, p_account_id, v_category, p_family_member_id, 'pago',
      CASE WHEN p_ir_type IS NOT NULL AND p_ir_type <> '' THEN 'IR: ' || p_ir_type END,
      '{}'::text[]
    );
  END IF;

  UPDATE public.investments
     SET invested_amount = v_invested,
         current_amount  = v_current
   WHERE id = p_investment_id;
END;
$$;

-- Só usuários logados executam (anon e PUBLIC ficam de fora).
REVOKE ALL ON FUNCTION public.create_installment_purchase(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_installment_purchase(jsonb, jsonb, jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.register_investment_move(
  uuid, text, numeric, date, text, uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_investment_move(
  uuid, text, numeric, date, text, uuid, text, uuid, uuid) TO authenticated, service_role;

-- Faz a API enxergar as funções novas imediatamente.
NOTIFY pgrst, 'reload schema';
