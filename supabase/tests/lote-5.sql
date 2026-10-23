-- Testes do Lote 5: dívidas geram parcelas em Contas a pagar + contemplação do consórcio.
-- Rodar num banco de TESTE (termina em ROLLBACK). Cada linha deve começar com "OK".
-- Uso local: psql -d <banco_de_teste> -f supabase/tests/lote-5.sql | grep -c FALHOU   (esperado 0)
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje \gset
BEGIN;
CREATE FUNCTION pg_temp.chk(label text, cond boolean) RETURNS text LANGUAGE sql AS
  $$ SELECT CASE WHEN cond THEN 'OK     ' ELSE 'FALHOU ' END || label $$;
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste'), ('bbbbbbbb-0000-0000-0000-000000000002', 'b@teste');
INSERT INTO public.accounts (id, user_id, name) VALUES ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Conta A');
INSERT INTO public.categories (id, user_id, name, type) VALUES ('d0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Financiamentos', 'despesa');
-- L1: consórcio, 80 parcelas, vence dia 31 (testa mês curto), 1º vencimento no mês que vem
INSERT INTO public.liabilities (id, user_id, name, type, total_amount, remaining_amount, monthly_payment, due_day,
  schedule_enabled, first_due_date, installments_total, auto_reduce_balance, account_id, category_id)
VALUES ('f0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Consórcio Honda', 'consórcio',
  80000, 60000, 800, 31, true, (date_trunc('month', :'hoje'::date) + interval '1 month')::date, 80, true,
  'a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a');
-- L3: já em andamento (1º vencimento há 2 meses), para testar parcelas vencidas
INSERT INTO public.liabilities (id, user_id, name, type, total_amount, remaining_amount, monthly_payment, due_day,
  schedule_enabled, first_due_date, installments_total)
VALUES ('f0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Consórcio Moto', 'consórcio',
  1000, 1000, 100, 5, true, (date_trunc('month', :'hoje'::date) - interval '2 months')::date, 10);
-- dívida do usuário B
INSERT INTO public.liabilities (id, user_id, name, type, total_amount, remaining_amount, monthly_payment, due_day,
  schedule_enabled, first_due_date, installments_total)
VALUES ('f0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'Dívida do B', 'empréstimo',
  500, 500, 50, 10, true, (date_trunc('month', :'hoje'::date) + interval '1 month')::date, 10);

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
\set L1 '''f0000000-0000-0000-0000-000000000001'''
\set L3 '''f0000000-0000-0000-0000-000000000003'''
\set LB '''f0000000-0000-0000-0000-00000000000b'''

\echo '--- T1 cria as parcelas da janela de 12 meses'
SELECT public.sync_liability_schedule(:L1) AS criadas \gset
-- esperado, calculado de forma independente: 1 parcela por mês cujo vencimento <= hoje + 12 meses
SELECT count(*) AS esperadas FROM generate_series(0, 79) k
 WHERE (date_trunc('month', :'hoje'::date) + interval '1 month' + make_interval(months => k)
        + (LEAST(31, EXTRACT(day FROM date_trunc('month', :'hoje'::date) + interval '2 months' + make_interval(months => k) - interval '1 day')::int) - 1) * interval '1 day')::date
       <= (:'hoje'::date + interval '12 months')::date \gset
SELECT pg_temp.chk('retornou '||:criadas||' criadas (esperado '||:esperadas||')', :criadas = :esperadas AND :criadas BETWEEN 10 AND 13);
SELECT pg_temp.chk('linhas gravadas = '||count(*), count(*) = :esperadas) FROM public.transactions WHERE liability_id = :L1;
SELECT pg_temp.chk('todas pendentes, tipo despesa, valor 800, conta e categoria da dívida',
  bool_and(status='pendente' AND type='despesa' AND amount=800 AND account_id='a0000000-0000-0000-0000-00000000000a'
           AND category_id='d0000000-0000-0000-0000-00000000000a' AND user_id='aaaaaaaa-0000-0000-0000-000000000001'))
  FROM public.transactions WHERE liability_id = :L1;
SELECT pg_temp.chk('descrição da 1ª: '||description, description = 'Consórcio Honda (parcela 1/80)')
  FROM public.transactions WHERE liability_id = :L1 AND installment_number = 1;
SELECT pg_temp.chk('dia de vencimento respeita o fim do mês (dia 31 -> 28/29/30 quando preciso)',
  bool_and(EXTRACT(day FROM date) = LEAST(31, EXTRACT(day FROM (liability_period + interval '1 month' - interval '1 day'))::int)))
  FROM public.transactions WHERE liability_id = :L1;

\echo '--- T2 idempotente: rodar de novo não duplica nem altera'
SELECT public.sync_liability_schedule(:L1) AS segunda \gset
SELECT pg_temp.chk('segunda execução devolveu '||:segunda||' (nada mudou)', :segunda = 0);
SELECT pg_temp.chk('continua com '||count(*)||' linhas (sem duplicar)', count(*) = :esperadas) FROM public.transactions WHERE liability_id = :L1;

\echo '--- T3 pagar abate o saldo (auto_reduce_balance); desfazer devolve'
UPDATE public.transactions SET status = 'pago' WHERE liability_id = :L1 AND installment_number = 1;
SELECT pg_temp.chk('saldo 60000 -> '||remaining_amount, remaining_amount = 59200) FROM public.liabilities WHERE id = :L1;
UPDATE public.transactions SET status = 'pendente' WHERE liability_id = :L1 AND installment_number = 1;
SELECT pg_temp.chk('desfeito: saldo '||remaining_amount, remaining_amount = 60000) FROM public.liabilities WHERE id = :L1;
UPDATE public.transactions SET status = 'pago' WHERE liability_id = :L1 AND installment_number = 1;  -- deixa a 1ª paga

\echo '--- T4 mudar a parcela atualiza as futuras e preserva a paga'
UPDATE public.liabilities SET monthly_payment = 850 WHERE id = :L1;
SELECT public.sync_liability_schedule(:L1);
SELECT pg_temp.chk('paga continua 800', amount = 800) FROM public.transactions WHERE liability_id = :L1 AND installment_number = 1;
SELECT pg_temp.chk('futuras viraram 850 ('||count(*)||')', bool_and(amount = 850)) FROM public.transactions WHERE liability_id = :L1 AND status <> 'pago';

\echo '--- T5 CONTEMPLAÇÃO: nova parcela 1500, 70 restantes, saldo 105000'
SELECT public.register_liability_contemplation(:L1, :'hoje'::date, 1500, 70, 105000) AS atualizadas \gset
SELECT pg_temp.chk('parcelas pendentes atualizadas: '||:atualizadas, :atualizadas >= 9);
SELECT pg_temp.chk('dívida: parcela='||monthly_payment||' contemplada em hoje, total='||installments_total||' (1 paga + 70), saldo='||remaining_amount,
  monthly_payment = 1500 AND contemplated_at = :'hoje'::date AND installments_total = 71 AND remaining_amount = 105000) FROM public.liabilities WHERE id = :L1;
SELECT pg_temp.chk('paga continua 800 (histórico intacto)', amount = 800) FROM public.transactions WHERE liability_id = :L1 AND installment_number = 1;
SELECT pg_temp.chk('pendentes todas 1500', bool_and(amount = 1500)) FROM public.transactions WHERE liability_id = :L1 AND status <> 'pago';
SELECT pg_temp.chk('descrição acompanha o novo prazo: '||description, description = 'Consórcio Honda (parcela 2/71)') FROM public.transactions WHERE liability_id = :L1 AND installment_number = 2;

\echo '--- T6 contemplação com parcela vencida ANTES da data: vencida mantém o valor antigo'
SELECT public.sync_liability_schedule(:L3);
SELECT pg_temp.chk('L3 gerou parcelas vencidas e a vencer ('||count(*) FILTER (WHERE date < :'hoje'::date)||' vencidas)', count(*) FILTER (WHERE date < :'hoje'::date) >= 1) FROM public.transactions WHERE liability_id = :L3;
SELECT public.register_liability_contemplation(:L3, :'hoje'::date, 300);
SELECT pg_temp.chk('vencidas (antes da contemplação) continuam 100', bool_and(amount = 100)) FROM public.transactions WHERE liability_id = :L3 AND date < :'hoje'::date;
SELECT pg_temp.chk('a partir da contemplação viraram 300', bool_and(amount = 300)) FROM public.transactions WHERE liability_id = :L3 AND date >= :'hoje'::date;

\echo '--- T7 validações da contemplação'
SAVEPOINT s7a; SELECT public.register_liability_contemplation(:L1, :'hoje'::date, 0); ROLLBACK TO s7a;
SAVEPOINT s7b; SELECT public.register_liability_contemplation(:L1, (:'hoje'::date + 5), 1000); ROLLBACK TO s7b;
SAVEPOINT s7c; SELECT public.register_liability_contemplation(:LB, :'hoje'::date, 1000); ROLLBACK TO s7c;
SAVEPOINT s7d; SELECT public.register_liability_contemplation(:L1, :'hoje'::date, 1000, -1); ROLLBACK TO s7d;

\echo '--- T8 prazo reduzido remove as pendentes além do total (pagas ficam)'
UPDATE public.liabilities SET installments_total = 4 WHERE id = :L1;
SELECT public.sync_liability_schedule(:L1);
SELECT pg_temp.chk('restaram '||count(*)||' linhas (1 paga + 3 pendentes)', count(*) = 4 AND count(*) FILTER (WHERE status='pago') = 1) FROM public.transactions WHERE liability_id = :L1;

\echo '--- T9 janela maior completa o cronograma; janela padrão não apaga o que já existe'
UPDATE public.liabilities SET installments_total = 80 WHERE id = :L1;
SELECT public.sync_liability_schedule(:L1, 24) AS mais \gset
SELECT pg_temp.chk('janela de 24 meses criou '||:mais||' parcelas', :mais > 0);
SELECT count(*) AS total24 FROM public.transactions WHERE liability_id = :L1 \gset
SELECT public.sync_liability_schedule(:L1);
SELECT pg_temp.chk('janela padrão manteve as '||:total24, count(*) = :total24) FROM public.transactions WHERE liability_id = :L1;

\echo '--- T10 isolamento: o sync do usuário A não mexe nas dívidas do B'
SELECT pg_temp.chk('A não vê dívida do B', count(*) = 0) FROM public.liabilities WHERE id = :LB;
RESET ROLE;
SELECT pg_temp.chk('B continua sem parcelas geradas ('||count(*)||')', count(*) = 0) FROM public.transactions WHERE liability_id = :LB;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT public.sync_liability_schedule() AS do_b \gset
SELECT pg_temp.chk('B gerou só as próprias ('||:do_b||')', :do_b > 0 AND (SELECT count(*) FROM public.transactions WHERE liability_id = :L1) = 0);
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- T11 desligar o cronograma remove as pendentes e mantém as pagas'
UPDATE public.liabilities SET schedule_enabled = false WHERE id = :L1;
SELECT public.sync_liability_schedule(:L1);
SELECT pg_temp.chk('só sobrou a paga ('||count(*)||')', count(*) = 1 AND bool_and(status = 'pago')) FROM public.transactions WHERE liability_id = :L1;

\echo '--- T12 excluir a dívida remove pendentes e mantém o histórico pago (sem vínculo)'
UPDATE public.liabilities SET schedule_enabled = true WHERE id = :L1;
SELECT public.sync_liability_schedule(:L1);
DELETE FROM public.liabilities WHERE id = :L1;
SELECT pg_temp.chk('pendentes removidas; paga ficou sem vínculo ('||count(*)||')', count(*) = 1 AND bool_and(liability_id IS NULL AND status = 'pago' AND amount = 800)) FROM public.transactions WHERE description LIKE 'Consórcio Honda%';

\echo '--- T13 sem sessão'
SET request.jwt.claim.sub = '';
SAVEPOINT s13; SELECT public.sync_liability_schedule(); ROLLBACK TO s13;
RESET ROLE; SET ROLE anon;
SAVEPOINT s14; SELECT public.sync_liability_schedule(); ROLLBACK TO s14;
RESET ROLE;
ROLLBACK;
