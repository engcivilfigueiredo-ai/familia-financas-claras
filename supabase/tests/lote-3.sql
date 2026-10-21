-- Testes do Lote 3: compra/venda por cotas e preço (rodar num banco de TESTE; termina em ROLLBACK).
-- Uso local: psql -d <banco_de_teste> -f supabase/tests/lote-3.sql
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste');
INSERT INTO public.accounts (id, user_id, name) VALUES ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Conta A');
INSERT INTO public.categories (user_id, name, type) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Dividendos', 'receita');
INSERT INTO public.investments (id, user_id, name, type, ticker, invested_amount, current_amount, quantity, average_price, last_quote) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'PETR4',  'ações',    'PETR4', 1959,   2420,   100, 19.59,  24.20),
  ('e0000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'LCA',    'LCI/LCA',  NULL,    5000,   5100,   NULL, NULL,  NULL),
  ('e0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'BTC',    'cripto',   'BTC',   100000, 125000, 0.5, 200000, 250000),
  ('e0000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'IVVB11', 'ETFs',     'IVVB11',3000,   3000,   10,  300,    NULL);
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
\set A '''e0000000-0000-0000-0000-00000000000a'''
\set CONTA '''a0000000-0000-0000-0000-00000000000a'''

\echo '--- T1 compra 50 cotas a 24,20 (esperado: 150 cotas, investido 3169, médio 21,1267, atual 3630, transf -1210)'
SELECT public.register_investment_move(:A,'aplicação',1,'2026-10-21','PETR4',:CONTA,NULL,NULL,NULL,50,24.20);
SELECT 'qtd='||quantity||' investido='||invested_amount||' medio='||average_price||' atual='||current_amount FROM public.investments WHERE name='PETR4';
SELECT 'transf='||amount||' ('||description||')' FROM public.transactions WHERE description='Aporte em PETR4';
SELECT 'historico: qtd='||quantity||' por_cota='||rate_per_share||' valor='||amount FROM public.investment_transactions WHERE type='aplicação';

\echo '--- T2 venda 40 cotas a 25,00 (esperado: valor 1000, custo 845,07, investido 2323,93, 110 cotas, médio igual, atual 2662, transf +1000)'
SELECT public.register_investment_move(:A,'resgate',1,'2026-10-21','PETR4',:CONTA,NULL,NULL,NULL,40,25);
SELECT 'qtd='||quantity||' investido='||invested_amount||' medio='||average_price||' atual='||current_amount FROM public.investments WHERE name='PETR4';
SELECT 'transf='||amount||' ('||description||')' FROM public.transactions WHERE description='Resgate de PETR4';

\echo '--- T3 vender mais do que tem (500 de 110)'
SAVEPOINT s3; SELECT public.register_investment_move(:A,'resgate',1,'2026-10-21','PETR4',:CONTA,NULL,NULL,NULL,500,25); ROLLBACK TO s3;

\echo '--- T4 vender tudo (110 a 26): zera posição, preço médio fica'
SELECT public.register_investment_move(:A,'resgate',1,'2026-10-21','PETR4',:CONTA,NULL,NULL,NULL,110,26);
SELECT 'qtd='||quantity||' investido='||invested_amount||' medio='||average_price||' atual='||current_amount FROM public.investments WHERE name='PETR4';

\echo '--- T5 recomprar depois de zerar: 10 a 20 (esperado: médio 20, investido 200). p_amount=1 é ignorado'
SELECT public.register_investment_move(:A,'aplicação',1,'2026-10-21','PETR4',NULL,NULL,NULL,NULL,10,20);
SELECT 'qtd='||quantity||' investido='||invested_amount||' medio='||average_price||' atual='||current_amount FROM public.investments WHERE name='PETR4';

\echo '--- T6 renda fixa continua só com valor (esperado: investido 6000, atual 6100, cotas nulas)'
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000b','aplicação',1000,'2026-10-21','LCA',:CONTA);
SELECT 'investido='||invested_amount||' atual='||current_amount||' qtd='||coalesce(quantity::text,'NULL')||' medio='||coalesce(average_price::text,'NULL') FROM public.investments WHERE name='LCA';

\echo '--- T7 cripto fracionada: +0,25 a 240000 (esperado: 0,75; investido 160000; médio 213333,3333)'
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000c','aplicação',1,'2026-10-21','BTC',NULL,NULL,NULL,NULL,0.25,240000);
SELECT 'qtd='||quantity||' investido='||invested_amount||' medio='||average_price||' atual='||current_amount FROM public.investments WHERE name='BTC';

\echo '--- T8 ETF sem cotação: +5 a 310 (esperado: 15 cotas; investido 4550; médio 303,3333; atual 4650 = preço pago)'
SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000d','aplicação',1,'2026-10-21','IVVB11',NULL,NULL,NULL,NULL,5,310);
SELECT 'qtd='||quantity||' investido='||invested_amount||' medio='||average_price||' atual='||current_amount FROM public.investments WHERE name='IVVB11';

\echo '--- T9 aporte recorrente SEM cotas/preço em ativo com cotação (500 a 24,20 => 20,661157 cotas)'
SELECT public.register_investment_move(:A,'aplicação',500,'2026-10-21','PETR4',:CONTA);
SELECT 'qtd='||quantity||' investido='||invested_amount||' medio='||average_price||' atual='||current_amount FROM public.investments WHERE name='PETR4';
SELECT 'transferência de -500,00 gravada: '||EXISTS (SELECT 1 FROM public.transactions WHERE description='Aporte em PETR4' AND amount=-500);

\echo '--- T10 sem cotas/preço e SEM cotação conhecida: erro claro'
SAVEPOINT s10; SELECT public.register_investment_move('e0000000-0000-0000-0000-00000000000d','aplicação',500,'2026-10-21','IVVB11',NULL); ROLLBACK TO s10;
\echo '--- T11 cotas zero / preço zero: erro'
SAVEPOINT s11a; SELECT public.register_investment_move(:A,'aplicação',1,'2026-10-21','PETR4',NULL,NULL,NULL,NULL,0,10); ROLLBACK TO s11a;
SAVEPOINT s11b; SELECT public.register_investment_move(:A,'aplicação',1,'2026-10-21','PETR4',NULL,NULL,NULL,NULL,5,0); ROLLBACK TO s11b;

\echo '--- T12 dividendo continua igual (valoriza o atual; yield por cota)'
SELECT public.register_investment_move(:A,'dividendo',30,'2026-10-21','PETR4',:CONTA,'Isento');
SELECT 'receita='||amount||' '||description FROM public.transactions WHERE type='receita';
SELECT 'qtd_hist='||quantity||' por_cota='||round(rate_per_share,4) FROM public.investment_transactions WHERE type='dividendo';
ROLLBACK;
