-- Testes do Lote 6: aditivos de contrato (rodar num banco de TESTE; termina em ROLLBACK).
-- Cada linha deve começar com "OK".
-- Uso local: psql -d <banco_de_teste> -f supabase/tests/lote-6.sql | grep -c FALHOU   (esperado 0)
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
BEGIN;
CREATE FUNCTION pg_temp.chk(label text, cond boolean) RETURNS text LANGUAGE sql AS
  $$ SELECT CASE WHEN cond THEN 'OK     ' ELSE 'FALHOU ' END || label $$;
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste'), ('bbbbbbbb-0000-0000-0000-000000000002', 'b@teste');
INSERT INTO public.projects (id, user_id, project_number, name, contract_amount) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'P001', 'Residência Alvorada', 40000),
  ('b0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'P002', 'Galpão', 90000),
  ('b0000000-0000-0000-0000-000000000009', 'bbbbbbbb-0000-0000-0000-000000000002', 'P001', 'Projeto do B', 10000);
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
\set P1 '''b0000000-0000-0000-0000-000000000001'''
\set P2 '''b0000000-0000-0000-0000-000000000002'''
\set PB '''b0000000-0000-0000-0000-000000000009'''
\set UA '''aaaaaaaa-0000-0000-0000-000000000001'''

\echo '--- T1 primeiro aditivo'
INSERT INTO public.project_addenda (id, user_id, project_id, date, amount, notes)
  VALUES ('c0000000-0000-0000-0000-000000000001', :UA, :P1, '2026-10-20', 5000, 'Ampliação da área');
SELECT pg_temp.chk('soma dos aditivos = '||addenda_amount||', contrato original continua '||contract_amount,
  addenda_amount = 5000 AND contract_amount = 40000) FROM public.projects WHERE id = :P1;

\echo '--- T2 segundo aditivo (centavos)'
INSERT INTO public.project_addenda (id, user_id, project_id, date, amount)
  VALUES ('c0000000-0000-0000-0000-000000000002', :UA, :P1, '2026-10-21', 2500.50);
SELECT pg_temp.chk('soma = '||addenda_amount, addenda_amount = 7500.50) FROM public.projects WHERE id = :P1;

\echo '--- T3 alterar o valor de um aditivo recalcula'
UPDATE public.project_addenda SET amount = 3000 WHERE id = 'c0000000-0000-0000-0000-000000000002';
SELECT pg_temp.chk('soma = '||addenda_amount, addenda_amount = 8000) FROM public.projects WHERE id = :P1;

\echo '--- T4 excluir um aditivo desfaz só a parte dele'
DELETE FROM public.project_addenda WHERE id = 'c0000000-0000-0000-0000-000000000001';
SELECT pg_temp.chk('soma = '||addenda_amount, addenda_amount = 3000) FROM public.projects WHERE id = :P1;
DELETE FROM public.project_addenda WHERE id = 'c0000000-0000-0000-0000-000000000002';
SELECT pg_temp.chk('sem aditivos volta a '||addenda_amount, addenda_amount = 0) FROM public.projects WHERE id = :P1;

\echo '--- T5 valor zero ou negativo é recusado'
SAVEPOINT s5a; INSERT INTO public.project_addenda (user_id, project_id, amount) VALUES (:UA, :P1, 0); ROLLBACK TO s5a;
SAVEPOINT s5b; INSERT INTO public.project_addenda (user_id, project_id, amount) VALUES (:UA, :P1, -100); ROLLBACK TO s5b;
SELECT pg_temp.chk('nada foi gravado ('||count(*)||')', count(*) = 0) FROM public.project_addenda;

\echo '--- T6 projetos independentes e troca de projeto recalcula os dois'
INSERT INTO public.project_addenda (id, user_id, project_id, amount) VALUES ('c0000000-0000-0000-0000-000000000003', :UA, :P1, 1000);
INSERT INTO public.project_addenda (id, user_id, project_id, amount) VALUES ('c0000000-0000-0000-0000-000000000004', :UA, :P2, 7000);
SELECT pg_temp.chk('P1='||(SELECT addenda_amount FROM public.projects WHERE id=:P1)||' P2='||(SELECT addenda_amount FROM public.projects WHERE id=:P2),
  (SELECT addenda_amount FROM public.projects WHERE id=:P1) = 1000 AND (SELECT addenda_amount FROM public.projects WHERE id=:P2) = 7000);
UPDATE public.project_addenda SET project_id = :P2 WHERE id = 'c0000000-0000-0000-0000-000000000003';
SELECT pg_temp.chk('após mover: P1='||(SELECT addenda_amount FROM public.projects WHERE id=:P1)||' P2='||(SELECT addenda_amount FROM public.projects WHERE id=:P2),
  (SELECT addenda_amount FROM public.projects WHERE id=:P1) = 0 AND (SELECT addenda_amount FROM public.projects WHERE id=:P2) = 8000);

\echo '--- T7 isolamento entre usuários'
SAVEPOINT s7a; INSERT INTO public.project_addenda (user_id, project_id, amount) VALUES (:UA, :PB, 500); ROLLBACK TO s7a;  -- A em projeto do B
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.chk('B não enxerga aditivos do A ('||count(*)||')', count(*) = 0) FROM public.project_addenda;
SAVEPOINT s7b; INSERT INTO public.project_addenda (user_id, project_id, amount) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', :P2, 500); ROLLBACK TO s7b;  -- B no projeto do A
SAVEPOINT s7c; INSERT INTO public.project_addenda (user_id, project_id, amount) VALUES (:UA, :P2, 500); ROLLBACK TO s7c;  -- B se passando por A
SELECT pg_temp.chk('B continua sem nenhum ('||count(*)||')', count(*) = 0) FROM public.project_addenda;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.chk('P2 do A não foi alterado pelas tentativas do B ('||addenda_amount||')', addenda_amount = 8000) FROM public.projects WHERE id = :P2;
SELECT pg_temp.chk('projeto do B não recebeu nada ('||count(*)||')', count(*) = 0) FROM public.project_addenda WHERE project_id = :PB;

\echo '--- T8 excluir o projeto remove os aditivos'
DELETE FROM public.projects WHERE id = :P2;
SELECT pg_temp.chk('aditivos restantes: '||count(*), count(*) = 0) FROM public.project_addenda;

\echo '--- T9 anon não acessa'
RESET ROLE; SET ROLE anon;
SAVEPOINT s9; SELECT * FROM public.project_addenda; ROLLBACK TO s9;
RESET ROLE;
ROLLBACK;
