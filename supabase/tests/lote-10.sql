-- Testes do Lote 10: grupo 50-30-20 nas categorias (banco de TESTE; termina em ROLLBACK).
-- Uso local: psql -d <banco_de_teste> -f supabase/tests/lote-10.sql | grep -c FALHOU   (esperado 0)
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
BEGIN;
CREATE FUNCTION pg_temp.chk(label text, cond boolean) RETURNS text LANGUAGE sql AS
  $$ SELECT CASE WHEN cond THEN 'OK     ' ELSE 'FALHOU ' END || label $$;
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste'), ('bbbbbbbb-0000-0000-0000-000000000002', 'b@teste');
INSERT INTO public.categories (id, user_id, name, type) VALUES
  ('d0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alimentação', 'despesa'),
  ('d0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'Moradia', 'despesa');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT pg_temp.chk('categoria existente fica sem grupo (automático)', budget_group IS NULL) FROM public.categories WHERE id = 'd0000000-0000-0000-0000-00000000000a';
UPDATE public.categories SET budget_group = 'necessidades' WHERE id = 'd0000000-0000-0000-0000-00000000000a';
SELECT pg_temp.chk('grava necessidades', budget_group = 'necessidades') FROM public.categories WHERE id = 'd0000000-0000-0000-0000-00000000000a';
UPDATE public.categories SET budget_group = 'desejos' WHERE id = 'd0000000-0000-0000-0000-00000000000a';
UPDATE public.categories SET budget_group = 'poupanca' WHERE id = 'd0000000-0000-0000-0000-00000000000a';
SELECT pg_temp.chk('grava poupanca', budget_group = 'poupanca') FROM public.categories WHERE id = 'd0000000-0000-0000-0000-00000000000a';
UPDATE public.categories SET budget_group = NULL WHERE id = 'd0000000-0000-0000-0000-00000000000a';
SELECT pg_temp.chk('voltar para automático (NULL)', budget_group IS NULL) FROM public.categories WHERE id = 'd0000000-0000-0000-0000-00000000000a';

SAVEPOINT s1; UPDATE public.categories SET budget_group = 'luxo' WHERE id = 'd0000000-0000-0000-0000-00000000000a'; ROLLBACK TO s1;
SAVEPOINT s2; UPDATE public.categories SET budget_group = '' WHERE id = 'd0000000-0000-0000-0000-00000000000a'; ROLLBACK TO s2;
SELECT pg_temp.chk('valor inválido foi recusado (continua automático)', budget_group IS NULL) FROM public.categories WHERE id = 'd0000000-0000-0000-0000-00000000000a';

-- usuário B não altera a categoria do A
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
UPDATE public.categories SET budget_group = 'desejos' WHERE id = 'd0000000-0000-0000-0000-00000000000a';
RESET ROLE;
SELECT pg_temp.chk('B não conseguiu alterar a categoria do A', budget_group IS NULL) FROM public.categories WHERE id = 'd0000000-0000-0000-0000-00000000000a';
ROLLBACK;
