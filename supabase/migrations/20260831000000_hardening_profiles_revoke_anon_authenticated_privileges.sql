BEGIN;

REVOKE ALL PRIVILEGES
ON TABLE public.profiles
FROM anon, authenticated;

COMMIT;
