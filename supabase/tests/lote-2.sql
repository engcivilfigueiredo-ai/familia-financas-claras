-- Testes de regressão das funções do Lote 2 (rodar num banco de TESTE, nunca em produção).
-- Cria usuários e dados de exemplo próprios, executa como o papel `authenticated` (RLS ligado)
-- e termina com ROLLBACK, sem deixar nada para trás.
-- Uso local:  psql -v ON_ERROR_STOP=0 -d <banco_de_teste> -f supabase/tests/lote-2.sql
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@teste');

INSERT INTO public.credit_cards (id, user_id, name) VALUES
  ('c0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cartão A'),
  ('c0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'Cartão B');
INSERT INTO public.accounts (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Conta A');
INSERT INTO public.categories (id, user_id, name, type) VALUES
  ('d0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Dividendos', 'receita'),
  ('d0000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rendimentos', 'receita');
INSERT INTO public.investments (id, user_id, name, invested_amount, current_amount, quantity, average_price) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'PETR4', 1000, 1000, 100, 10),
  ('e0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'VALE3', 500, 500, 10, 50);

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- T1 compra parcelada 3x de 100,00 (33,34 + 33,33 + 33,33)'
SELECT public.create_installment_purchase(
  '{"purchase_description":"TV","total_amount":100,"installment_count":3,"credit_card_id":"c0000000-0000-0000-0000-00000000000a","category_id":null,"family_member_id":null,"purchase_date":"2026-10-20"}'::jsonb,
  '[{"reference_month":"2026-11-01","closing_date":"2026-11-10","due_date":"2026-11-17"},{"reference_month":"2026-12-01","closing_date":"2026-12-10","due_date":"2026-12-17"},{"reference_month":"2027-01-01","closing_date":"2027-01-10","due_date":"2027-01-17"}]'::jsonb,
  '[{"description":"TV (1/3)","amount":33.34,"date":"2026-10-20","credit_card_id":"c0000000-0000-0000-0000-00000000000a","invoice_month":"2026-11-01","installment_number":1,"tags":["casa"]},
    {"description":"TV (2/3)","amount":33.33,"date":"2026-12-01","invoice_month":"2026-12-01","installment_number":2,"tags":[]},
    {"description":"TV (3/3)","amount":33.33,"date":"2027-01-01","invoice_month":"2027-01-01","installment_number":3,"tags":[]}]'::jsonb
) IS NOT NULL AS ok;
SELECT 'parcelas=' || count(*) || ' soma=' || sum(amount) || ' pendentes=' || count(*) FILTER (WHERE status='pendente') || ' todas_ligadas=' || bool_and(installment_id IS NOT NULL) || ' tag1=' || (array_agg(tags[1] ORDER BY installment_number))[1] FROM public.transactions WHERE description LIKE 'TV (%';
SELECT 'faturas=' || count(*) FROM public.invoices;
SELECT 'cabecalhos=' || count(*) FROM public.installments;

\echo '--- T2 falha NO MEIO (data inválida na 2a parcela): nada pode sobrar'
SAVEPOINT s2;
SELECT public.create_installment_purchase(
  '{"purchase_description":"Quebrada","total_amount":20,"installment_count":2,"credit_card_id":"c0000000-0000-0000-0000-00000000000a","purchase_date":"2026-10-20"}'::jsonb,
  '[{"reference_month":"2026-11-01","closing_date":"2026-11-10","due_date":"2026-11-17"}]'::jsonb,
  '[{"description":"Q (1/2)","amount":10,"date":"2026-10-20","invoice_month":"2026-11-01","installment_number":1},
    {"description":"Q (2/2)","amount":10,"date":"2026-99-99","invoice_month":"2026-12-01","installment_number":2}]'::jsonb);
ROLLBACK TO s2;
SELECT 'cabecalhos_depois=' || count(*) || ' (esperado 1)' FROM public.installments;
SELECT 'orfas_Q=' || count(*) || ' (esperado 0)' FROM public.transactions WHERE description LIKE 'Q (%';

\echo '--- T3 validações'
SAVEPOINT s3a;
SELECT public.create_installment_purchase('{"purchase_description":"x","total_amount":100,"installment_count":3,"credit_card_id":"c0000000-0000-0000-0000-00000000000a","purchase_date":"2026-10-20"}'::jsonb, '[]'::jsonb, '[{"description":"x","amount":100,"date":"2026-10-20","invoice_month":"2026-11-01","installment_number":1}]'::jsonb);
ROLLBACK TO s3a;
SAVEPOINT s3b;
SELECT public.create_installment_purchase('{"purchase_description":"x","total_amount":100,"installment_count":1,"credit_card_id":"c0000000-0000-0000-0000-00000000000a","purchase_date":"2026-10-20"}'::jsonb, '[]'::jsonb, '[{"description":"x","amount":99,"date":"2026-10-20","invoice_month":"2026-11-01","installment_number":1}]'::jsonb);
ROLLBACK TO s3b;

\echo '--- T4 cartão de OUTRO usuário'
SAVEPOINT s4;
SELECT public.create_installment_purchase('{"purchase_description":"x","total_amount":10,"installment_count":1,"credit_card_id":"c0000000-0000-0000-0000-00000000000b","purchase_date":"2026-10-20"}'::jsonb, '[]'::jsonb, '[{"description":"x","amount":10,"date":"2026-10-20","invoice_month":"2026-11-01","installment_number":1}]'::jsonb);
ROLLBACK TO s4;

\echo '--- T5 aporte 500 com conta (investido 1000 -> 1500 e transferência -500)'
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000a','aplicação',500,'2026-10-20','PETR4','a0000000-0000-0000-0000-00000000000a');
SELECT 'invested=' || invested_amount || ' current=' || current_amount FROM public.investments WHERE name='PETR4';
SELECT 'transf=' || amount || ' tipo=' || type || ' desc=' || description || ' recorrente=' || is_recurring FROM public.transactions WHERE description LIKE 'Aporte em%';

\echo '--- T6 dividendo 50 (cota 100): receita + categoria Dividendos + 5% de yield (preço médio 10)'
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000a','dividendo',50,'2026-10-20','PETR4','a0000000-0000-0000-0000-00000000000a','Isento');
SELECT 'receita=' || amount || ' desc=' || description || ' cat_ok=' || (category_id='d0000000-0000-0000-0000-00000000000a') || ' notas=' || notes FROM public.transactions WHERE type='receita';
SELECT 'qtd=' || quantity || ' por_cota=' || rate_per_share || ' yield=' || yield_percent FROM public.investment_transactions WHERE type='dividendo';
SELECT 'invested=' || invested_amount || ' current=' || current_amount || ' (invested não muda, current +50)' FROM public.investments WHERE name='PETR4';

\echo '--- T7 JCP usa categoria Rendimentos'
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000a','jcp',10,'2026-10-20','PETR4',NULL);
SELECT 'jcp_desc=' || description || ' cat_ok=' || (category_id='d0000000-0000-0000-0000-00000000000b') FROM public.transactions WHERE description LIKE 'JCP%';

\echo '--- T8 resgate gigante nunca deixa valor negativo'
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000a','resgate',99999,'2026-10-20','PETR4','a0000000-0000-0000-0000-00000000000a');
SELECT 'invested=' || invested_amount || ' current=' || current_amount FROM public.investments WHERE name='PETR4';

\echo '--- T9 investimento de OUTRO usuário, tipo inválido, valor zero, conta alheia'
SAVEPOINT s9a;
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000b','aplicação',10,'2026-10-20','VALE3');
ROLLBACK TO s9a;
SAVEPOINT s9b;
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000a','compra',10,'2026-10-20','PETR4');
ROLLBACK TO s9b;
SAVEPOINT s9c;
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000a','aplicação',0,'2026-10-20','PETR4');
ROLLBACK TO s9c;

\echo '--- T10 sem sessão (auth.uid() nulo)'
SET request.jwt.claim.sub = '';
SAVEPOINT s10;
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000a','aplicação',10,'2026-10-20','PETR4');
ROLLBACK TO s10;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- T11 papel anon não pode executar'
RESET ROLE;
SET ROLE anon;
SAVEPOINT s11;
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000a','aplicação',10,'2026-10-20','PETR4');
ROLLBACK TO s11;
RESET ROLE;

ROLLBACK;
