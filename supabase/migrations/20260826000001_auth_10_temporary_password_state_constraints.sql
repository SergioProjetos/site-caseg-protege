BEGIN;

-- Pré-condição operacional: executar com o backend antigo parado e antes de ativar o novo backend AUTH-10.

UPDATE public.profiles
SET
  temporary_password_expires_at = NULL,
  temporary_password_session_id = NULL,
  temporary_password_generation_id = NULL
WHERE role IS DISTINCT FROM 'client'
  OR must_change_password IS NOT TRUE;

UPDATE public.profiles
SET
  temporary_password_expires_at = COALESCE(
    temporary_password_expires_at,
    created_at + INTERVAL '24 hours',
    NOW() - INTERVAL '1 second'
  ),
  temporary_password_session_id = NULL,
  temporary_password_generation_id = COALESCE(
    temporary_password_generation_id,
    gen_random_uuid()
  )
WHERE role = 'client'
  AND must_change_password IS TRUE;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_temporary_password_expiration_state_check
CHECK (
  CASE
    WHEN role = 'client' AND must_change_password IS TRUE
      THEN temporary_password_expires_at IS NOT NULL
    ELSE temporary_password_expires_at IS NULL
  END
);

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_temporary_password_session_state_check
CHECK (
  CASE
    WHEN role = 'client' AND must_change_password IS TRUE
      THEN temporary_password_generation_id IS NOT NULL
        OR temporary_password_session_id IS NULL
    ELSE temporary_password_generation_id IS NULL
      AND temporary_password_session_id IS NULL
  END
);

COMMIT;
