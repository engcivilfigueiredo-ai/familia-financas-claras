-- Lote 3: compra e venda de ativos de renda variável por COTAS e PREÇO POR COTA.
--
-- Problema: um aporte em ação/FII/ETF/cripto só somava valor. Como o app recalcula o saldo
-- desses ativos como (cotas x cotação), o aporte sumia do saldo na próxima atualização de
-- cotação e aparecia como prejuízo falso. Também não atualizava quantidade nem preço médio.
--
-- Agora, para ações, FIIs, ETFs e cripto, aplicação (compra) e resgate (venda) recebem
-- quantidade e preço por cota:
--   compra: quantidade soma; investido soma o valor pago; preço médio = média ponderada
--   venda : preço médio NÃO muda; baixa o custo (cotas vendidas x preço médio);
--           não deixa vender mais cotas do que a posição
-- O valor da operação é sempre cotas x preço (arredondado em centavos), calculado aqui.
-- Sem quantidade/preço (ex.: aporte recorrente), compra/vende ao preço da última cotação.
-- Renda fixa e demais tipos continuam só com valor, como antes.
--
-- Rodar no SQL editor do Lovable ANTES de publicar o código novo do app.

-- A assinatura antiga (9 argumentos) sai: duas funções com o mesmo nome confundiriam a API.
DROP FUNCTION IF EXISTS public.register_investment_move(
  uuid, text, numeric, date, text, uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.register_investment_move(
  p_investment_id    uuid,
  p_type             text,
  p_amount           numeric,
  p_date             date,
  p_investment_name  text,
  p_account_id       uuid    DEFAULT NULL,
  p_ir_type          text    DEFAULT NULL,
  p_family_member_id uuid    DEFAULT NULL,
  p_recurring_id     uuid    DEFAULT NULL,
  p_quantity         numeric DEFAULT NULL,
  p_unit_price       numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_amount     numeric := abs(COALESCE(p_amount, 0));
  v_inv_type   text;
  v_invested   numeric;
  v_current    numeric;
  v_qty0       numeric;   -- cotas antes da operação
  v_last       numeric;
  v_avg0       numeric;   -- preço médio antes da operação
  v_quotas     boolean;   -- esta operação usa cotas e preço?
  v_q          numeric;   -- cotas da operação
  v_p          numeric;   -- preço por cota da operação
  v_qty        numeric;   -- cotas depois
  v_avg        numeric;   -- preço médio depois
  v_basis      numeric;   -- preço de custo usado na baixa de uma venda
  v_quantity   numeric;   -- gravado em investment_transactions
  v_rate       numeric;
  v_yield      numeric;
  v_price      numeric;
  v_category   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Faça login novamente.' USING ERRCODE = '28000';
  END IF;

  IF p_type NOT IN ('aplicação', 'resgate', 'rendimento', 'dividendo', 'jcp') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido: %.', p_type USING ERRCODE = '22023';
  END IF;

  -- Trava a linha: operações simultâneas no mesmo ativo passam a ser executadas em fila.
  -- RLS garante que só o dono enxerga (e portanto trava) o investimento.
  SELECT type, invested_amount, current_amount, quantity, last_quote, average_price
    INTO v_inv_type, v_invested, v_current, v_qty0, v_last, v_avg0
    FROM public.investments
   WHERE id = p_investment_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investimento não encontrado.' USING ERRCODE = '22023';
  END IF;

  v_qty0 := COALESCE(v_qty0, 0);

  v_quotas := p_type IN ('aplicação', 'resgate')
              AND v_inv_type IN ('ações', 'FIIs', 'ETFs', 'cripto');

  IF v_quotas THEN
    v_q := p_quantity;
    v_p := p_unit_price;
    IF v_q IS NULL OR v_p IS NULL THEN
      -- sem cotas/preço (ex.: aporte recorrente): opera ao preço da última cotação
      IF COALESCE(v_last, 0) > 0 AND v_amount > 0 THEN
        v_p := v_last;
        v_q := round(v_amount / v_last, 6);
      ELSE
        RAISE EXCEPTION 'Informe a quantidade de cotas e o preço por cota.' USING ERRCODE = '22023';
      END IF;
    END IF;
    v_q := round(v_q, 6);
    IF v_q <= 0 OR v_p <= 0 THEN
      RAISE EXCEPTION 'Informe a quantidade de cotas e o preço por cota.' USING ERRCODE = '22023';
    END IF;
    v_amount := round(v_q * v_p, 2);
  END IF;

  IF v_amount = 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.' USING ERRCODE = '22023';
  END IF;

  IF p_account_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = '22023';
  END IF;

  IF v_quotas THEN
    v_quantity := v_q;
    v_rate := v_p;
  ELSIF p_type IN ('dividendo', 'jcp', 'rendimento') AND v_qty0 > 0 THEN
    -- proventos: detalhe por cota a partir da posição atual
    v_quantity := v_qty0;
    v_rate := v_amount / v_qty0;
    v_price := COALESCE(v_last, v_avg0, 0);
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

  v_qty := v_qty0;
  v_avg := v_avg0;

  IF p_type = 'aplicação' THEN
    v_invested := v_invested + v_amount;
    IF v_quotas THEN
      v_qty := v_qty0 + v_q;
      v_avg := round((v_qty0 * COALESCE(v_avg0, 0) + v_amount) / v_qty, 4);
      v_current := round(v_qty * COALESCE(NULLIF(v_last, 0), v_p), 2);
    ELSE
      v_current := v_current + v_amount;
    END IF;
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
    IF v_quotas THEN
      IF v_q > v_qty0 THEN
        RAISE EXCEPTION 'Você tem % cotas; não é possível vender %.', v_qty0, v_q
          USING ERRCODE = '22023';
      END IF;
      -- custo por cota: preço médio gravado ou, na falta dele, investido / cotas
      v_basis := COALESCE(NULLIF(v_avg0, 0), CASE WHEN v_qty0 > 0 THEN v_invested / v_qty0 END, 0);
      v_qty := v_qty0 - v_q;
      IF v_qty = 0 THEN
        v_invested := 0;
        v_current := 0;
      ELSE
        v_invested := GREATEST(v_invested - round(v_q * v_basis, 2), 0);
        v_current := round(v_qty * COALESCE(NULLIF(v_last, 0), v_p), 2);
      END IF;
    ELSE
      v_invested := GREATEST(v_invested - v_amount, 0);
      v_current := GREATEST(v_current - v_amount, 0);
    END IF;
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
         current_amount  = v_current,
         quantity        = CASE WHEN v_quotas THEN v_qty ELSE quantity END,
         average_price   = CASE WHEN v_quotas THEN v_avg ELSE average_price END
   WHERE id = p_investment_id;
END;
$$;

-- Só usuários logados executam (anon e PUBLIC ficam de fora).
REVOKE ALL ON FUNCTION public.register_investment_move(
  uuid, text, numeric, date, text, uuid, text, uuid, uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_investment_move(
  uuid, text, numeric, date, text, uuid, text, uuid, uuid, numeric, numeric)
  TO authenticated, service_role;

-- Faz a API enxergar a função nova imediatamente.
NOTIFY pgrst, 'reload schema';
