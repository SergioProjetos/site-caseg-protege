BEGIN;

ALTER TABLE public.profiles
ADD COLUMN temporary_password_expires_at timestamptz,
ADD COLUMN temporary_password_session_id uuid,
ADD COLUMN temporary_password_generation_id uuid;

UPDATE public.profiles
SET
  temporary_password_expires_at =
    CASE
      WHEN role = 'client' AND must_change_password IS TRUE
        THEN COALESCE(
          created_at + INTERVAL '24 hours',
          NOW() - INTERVAL '1 second'
        )
      ELSE NULL
    END,
  temporary_password_session_id = NULL,
  temporary_password_generation_id =
    CASE
      WHEN role = 'client' AND must_change_password IS TRUE
        THEN gen_random_uuid()
      ELSE NULL
    END;

COMMENT ON COLUMN public.profiles.temporary_password_expires_at IS
  'Vencimento da credencial temporária de Primeiro Acesso para Clients pendentes; deve ser NULL após a conclusão da troca definitiva.';

COMMENT ON COLUMN public.profiles.temporary_password_session_id IS
  'Identificador da sessão Supabase atualmente autorizada a concluir o Primeiro Acesso; deve ser NULL antes do vínculo, durante bloqueio e após a conclusão.';

COMMENT ON COLUMN public.profiles.temporary_password_generation_id IS
  'Identidade opaca da geração atual da credencial temporária e marcador persistente para controle de concorrência (CAS); deve ser NULL durante estado fail-closed adquirido e após a conclusão.';

COMMIT;
