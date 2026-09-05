CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_number text NOT NULL,
  name text NOT NULL,
  city text,
  state text,
  status text NOT NULL DEFAULT 'orcamento',
  budget_amount numeric NOT NULL DEFAULT 0,
  budget_date date,
  closing_date date,
  contract_amount numeric NOT NULL DEFAULT 0,
  received_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own projects" ON public.projects
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.next_project_number()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 'P' || lpad((
    COALESCE(MAX(NULLIF(regexp_replace(project_number, '\D', '', 'g'), '')::int), 0) + 1
  )::text, 3, '0')
  FROM public.projects
  WHERE user_id = auth.uid();
$$;