CREATE POLICY "Only service role can access cron config" ON public.cron_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;