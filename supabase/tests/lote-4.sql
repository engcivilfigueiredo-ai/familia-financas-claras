-- Testes do Lote 4: lucro realizado nas vendas (rodar num banco de TESTE; termina em ROLLBACK).
-- Uso local: psql -d <banco_de_teste> -f supabase/tests/lote-4.sql
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste');
INSERT INTO public.accounts (id, user_id, name) VALUES ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Conta A');
INSERT INTO public.categories (user_id, name, type) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Dividendos', 'receita');
INSERT INTO public.investments (id, user_id, name, type, ticker, invested_amount, current_amount, quantity, average_price, last_quote) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'PETR4', 'ações',   'PETR4', 1959, 2420, 100, 19.59, 24.20),
  ('e0000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'LCA',   'LCI/LCA', NULL,    5000, 5100, NULL, NULL, NULL);
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
\set A '''e0000000-0000-0000-0000-00000000000a'''
\set CONTA '''a0000000-0000-0000-0000-00000000000a'''

\echo '--- T1 compra 50 a 24,20: custo e resultado ficam NULOS'
SELECT public.register_investment_move(:A,'aplicação',1,'2026-10-21','PETR4',:CONTA,NULL,NULL,NULL,50,24.20);
SELECT 'compra: custo='||coalesce(cost_basis::text,'NULL')||' resultado='||coalesce(realized_result::text,'NULL') FROM public.investment_transactions WHERE type='aplicação';

\echo '--- T2 venda 40 a 25,00 (médio 21,1267): custo 845,07 e LUCRO 154,93'
SELECT public.register_investment_move(:A,'resgate',1,'2026-10-21','PETR4',:CONTA,NULL,NULL,NULL,40,25);
SELECT 'venda: valor='||amount||' custo='||cost_basis||' resultado='||realized_result||' cotas='||quantity||' preço='||rate_per_share FROM public.investment_transactions WHERE type='resgate';
SELECT 'posição: qtd='||quantity||' investido='||invested_amount||' medio='||average_price FROM public.investments WHERE name='PETR4';

\echo '--- T3 venda com PREJUÍZO: 10 a 15,00 (custo 211,27; resultado -61,27)'
SELECT public.register_investment_move(:A,'resgate',1,'2026-10-21','PETR4',:CONTA,NULL,NULL,NULL,10,15);
SELECT 'venda: valor='||amount||' custo='||cost_basis||' resultado='||realized_result FROM public.investment_transactions WHERE type='resgate' AND rate_per_share=15;

\echo '--- T4 venda acima da posição: falha e NÃO grava nada'
SELECT 'vendas antes='||count(*) FROM public.investment_transactions WHERE type='resgate';
SAVEPOINT s4; SELECT public.register_investment_move(:A,'resgate',1,'2026-10-21','PETR4',:CONTA,NULL,NULL,NULL,9999,25); ROLLBACK TO s4;
SELECT 'vendas depois='||count(*) FROM public.investment_transactions WHERE type='resgate';

\echo '--- T5 resgate de renda fixa e dividendo: sem custo/resultado'
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000b','resgate',200,'2026-10-21','LCA',:CONTA);
SELECT public.register_investment_move(:A,'dividendo',30,'2026-10-21','PETR4',:CONTA);
SELECT type||': custo='||coalesce(cost_basis::text,'NULL')||' resultado='||coalesce(realized_result::text,'NULL') FROM public.investment_transactions WHERE investment_id='e0000000-0000-0000-0000-00000000000b' OR type='dividendo' ORDER BY type;

\echo '--- T6 total realizado (esperado 154,93 + -61,27 = 93,66)'
SELECT 'lucro realizado total='||sum(realized_result) FROM public.investment_transactions WHERE realized_result IS NOT NULL;

\echo '--- T7 vender tudo o que sobrou (100 cotas a 20): resultado = 2000 - 100x21,1267'
SELECT public.register_investment_move(:A,'resgate',1,'2026-10-21','PETR4',:CONTA,NULL,NULL,NULL,100,20);
SELECT 'venda total: custo='||cost_basis||' resultado='||realized_result FROM public.investment_transactions WHERE type='resgate' AND quantity=100;
SELECT 'posição: qtd='||quantity||' investido='||invested_amount FROM public.investments WHERE name='PETR4';
ROLLBACK;
