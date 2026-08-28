BEGIN;

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

DROP POLICY "User can update own profile"
ON public.profiles;

COMMIT;
