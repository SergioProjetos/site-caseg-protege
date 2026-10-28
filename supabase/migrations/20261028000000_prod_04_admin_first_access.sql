BEGIN;

-- Aplicar antes do backend PROD-04, com acesso administrativo suspenso na janela.
-- Não inicializa contas, gera senhas ou altera o estado dos clientes.
DO $preconditions$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE role = 'admin' AND (
      must_change_password IS NULL OR
      (must_change_password IS TRUE AND temporary_password_expires_at IS NULL)
    )
  ) THEN
    RAISE EXCEPTION 'Administrative first-access state requires explicit reconciliation';
  END IF;
END;
$preconditions$;

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_temporary_password_expiration_state_check,
  DROP CONSTRAINT profiles_temporary_password_session_state_check,
  ADD CONSTRAINT profiles_temporary_password_expiration_state_check CHECK (
    CASE WHEN role IN ('client', 'admin') AND must_change_password IS TRUE
      THEN temporary_password_expires_at IS NOT NULL
      ELSE temporary_password_expires_at IS NULL END
  ),
  ADD CONSTRAINT profiles_temporary_password_session_state_check CHECK (
    CASE WHEN role IN ('client', 'admin') AND must_change_password IS TRUE
      THEN temporary_password_generation_id IS NOT NULL OR temporary_password_session_id IS NULL
      ELSE temporary_password_generation_id IS NULL AND temporary_password_session_id IS NULL END
  );

COMMENT ON COLUMN public.profiles.temporary_password_expires_at IS
  'Vencimento da credencial temporária para clientes e administradores pendentes; NULL após conclusão.';

-- Reversão exige confirmar ausência de administradores pendentes e restaurar
-- as duas definições anteriores em migration separada; não apagar dados.
COMMIT;
