BEGIN;

SET LOCAL search_path = '';

-- Pré-condições: executar com o proprietário administrativo esperado.
-- Não corrigir silenciosamente divergências de ownership ou permissões.
DO $migration$
DECLARE
  v_role text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Migration requires the postgres role';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace AS n
    WHERE n.nspname = 'private'
      AND n.nspowner = (
        SELECT r.oid
        FROM pg_catalog.pg_roles AS r
        WHERE r.rolname = 'postgres'
      )
  ) THEN
    RAISE EXCEPTION 'Expected private schema ownership not found';
  END IF;

  FOREACH v_role IN ARRAY
    ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF pg_catalog.has_schema_privilege(
      v_role, 'private', 'USAGE,CREATE'
    ) THEN
      RAISE EXCEPTION 'Unexpected private schema access for %', v_role;
    END IF;

    IF pg_catalog.has_schema_privilege(
      v_role, 'public', 'CREATE'
    ) THEN
      RAISE EXCEPTION 'Unexpected public schema CREATE for %', v_role;
    END IF;
  END LOOP;

  -- Recusar também overloads preexistentes dos nomes reservados.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = p.pronamespace
    WHERE (
      n.nspname = 'public'
      AND p.proname IN (
        'caseg_admin_session_initialize',
        'caseg_admin_session_check',
        'caseg_admin_session_touch',
        'caseg_admin_session_close'
      )
    ) OR (
      n.nspname = 'private'
      AND p.proname = 'caseg_admin_session_apply'
    )
  ) THEN
    RAISE EXCEPTION 'Administrative session function name conflict';
  END IF;
END;
$migration$;

-- CREATE sem IF NOT EXISTS: uma tabela homônima interrompe a migration.
CREATE TABLE private.admin_session_state (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  initialized_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL,
  revoked_at timestamptz,
  version bigint NOT NULL DEFAULT 1,

  CONSTRAINT admin_session_state_version_check
    CHECK (version >= 1),

  CONSTRAINT admin_session_state_activity_check
    CHECK (last_activity_at >= initialized_at),

  CONSTRAINT admin_session_state_revocation_check
    CHECK (
      revoked_at IS NULL
      OR revoked_at >= last_activity_at
    )
);

COMMENT ON TABLE private.admin_session_state IS
  'Controle privado de inatividade administrativa. Sem tokens ou senhas. '
  'Vínculo com Auth validado pelas funções restritas.';

ALTER TABLE private.admin_session_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE private.admin_session_state
FROM PUBLIC, anon, authenticated, service_role;

-- Sem FK para auth.sessions: não interferir no logout ou na limpeza do Auth.
-- O vínculo session_id/user_id é verificado nas operações de autorização.
-- A PK atende às consultas por sessão; nenhum índice adicional é necessário.

CREATE FUNCTION private.caseg_admin_session_apply(
  p_session_id uuid,
  p_user_id uuid,
  p_operation text,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_state private.admin_session_state%ROWTYPE;
  v_exists boolean;
  v_authorized boolean;
  v_now timestamptz;
  v_code text := 'OK';
  v_allowed boolean := TRUE;
BEGIN
  IF p_session_id IS NULL
    OR p_user_id IS NULL
    OR p_operation IS NULL
    OR p_operation NOT IN ('initialize', 'check', 'touch', 'close')
    OR (
      p_operation = 'touch'
      AND (
        p_expected_version IS NULL
        OR p_expected_version < 1
      )
    )
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'allowed', FALSE,
      'result_code', 'INVALID_ARGUMENT'
    );
  END IF;

  -- Serializa inclusive operações sobre registros ainda inexistentes.
  -- Colisões do hash apenas serializam sessões distintas.
  -- A autorização sempre compara os UUIDs completos.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-admin-session:' || p_session_id::text,
      0
    )
  );

  SELECT s.*
  INTO v_state
  FROM private.admin_session_state AS s
  WHERE s.session_id = p_session_id
  FOR UPDATE;

  v_exists := FOUND;

  IF v_exists AND v_state.user_id <> p_user_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'allowed', FALSE,
      'result_code', 'DENIED'
    );
  END IF;

  -- Encerramento idempotente. Não exige perfil ainda ativo ou linha no Auth.
  -- A identidade deve ter sido validada pelo backend antes desta chamada.
  -- Não cria registro caso ele não exista.
  IF p_operation = 'close' THEN
    v_now := pg_catalog.clock_timestamp();

    IF v_exists AND v_state.revoked_at IS NULL THEN
      UPDATE private.admin_session_state AS s
      SET
        revoked_at = GREATEST(v_now, s.last_activity_at),
        version = s.version + 1
      WHERE s.session_id = p_session_id;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'allowed', TRUE,
      'result_code', 'CLOSED'
    );
  END IF;

  IF v_exists AND v_state.revoked_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'allowed', FALSE,
      'result_code', 'SESSION_CLOSED'
    );
  END IF;

  IF NOT v_exists AND p_operation <> 'initialize' THEN
    RETURN pg_catalog.jsonb_build_object(
      'allowed', FALSE,
      'result_code', 'NOT_INITIALIZED'
    );
  END IF;

  -- Confirma o vínculo real da sessão com o usuário.
  PERFORM a.id
  FROM auth.sessions AS a
  WHERE a.id = p_session_id
    AND a.user_id = p_user_id
  FOR SHARE;

  v_authorized := FOUND;

  -- Defesa adicional; não substitui a validação no Express.
  IF v_authorized THEN
    PERFORM p.user_id
    FROM public.profiles AS p
    WHERE p.user_id = p_user_id
      AND p.role = 'admin'
      AND p.is_active IS TRUE
    FOR SHARE;

    v_authorized := FOUND;
  END IF;

  -- Horário obtido depois de todos os bloqueios acima.
  v_now := pg_catalog.clock_timestamp();

  IF NOT v_authorized THEN
    IF v_exists THEN
      UPDATE private.admin_session_state AS s
      SET
        revoked_at = GREATEST(v_now, s.last_activity_at),
        version = s.version + 1
      WHERE s.session_id = p_session_id;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'allowed', FALSE,
      'result_code', 'DENIED'
    );
  END IF;

  IF v_exists THEN
    -- Fechar também em regressão observada do relógio do banco.
    IF v_now < v_state.last_activity_at
      OR v_now >= v_state.last_activity_at + INTERVAL '60 minutes'
    THEN
      UPDATE private.admin_session_state AS s
      SET
        revoked_at = GREATEST(v_now, s.last_activity_at),
        version = s.version + 1
      WHERE s.session_id = p_session_id;

      RETURN pg_catalog.jsonb_build_object(
        'allowed', FALSE,
        'result_code',
          CASE
            WHEN v_now < v_state.last_activity_at
              THEN 'CLOCK_REGRESSION'
            ELSE 'IDLE_EXPIRED'
          END
      );
    END IF;
  ELSE
    -- Único ponto de criação, exclusivo da operação initialize.
    INSERT INTO private.admin_session_state (
      session_id,
      user_id,
      initialized_at,
      last_activity_at,
      version
    )
    VALUES (
      p_session_id,
      p_user_id,
      v_now,
      v_now,
      1
    )
    RETURNING *
    INTO v_state;

    v_code := 'INITIALIZED';
  END IF;

  IF p_operation = 'touch' THEN
    IF p_expected_version <> v_state.version THEN
      -- Repetição ou concorrência: devolver estado sem renovar atividade.
      v_allowed := FALSE;
      v_code := 'STALE_VERSION';
    ELSE
      UPDATE private.admin_session_state AS s
      SET
        last_activity_at = v_now,
        version = s.version + 1
      WHERE s.session_id = p_session_id
        AND s.version = p_expected_version
        AND s.revoked_at IS NULL
      RETURNING *
      INTO v_state;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Administrative session state conflict';
      END IF;

      v_code := 'ACTIVITY_RECORDED';
    END IF;
  END IF;

  -- check e initialize sobre registro existente não alteram sua atividade.
  -- Versão em texto evita perda de precisão de bigint no JavaScript.
  RETURN pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'result_code', v_code,
    'version', v_state.version::text,
    'server_now', v_now,
    'idle_expires_at',
      v_state.last_activity_at + INTERVAL '60 minutes'
  );
END;
$function$;

REVOKE ALL
ON FUNCTION private.caseg_admin_session_apply(uuid, uuid, text, bigint)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.caseg_admin_session_initialize(
  p_session_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.caseg_admin_session_apply(
    p_session_id, p_user_id, 'initialize'::text, NULL::bigint
  );
$function$;

CREATE FUNCTION public.caseg_admin_session_check(
  p_session_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.caseg_admin_session_apply(
    p_session_id, p_user_id, 'check'::text, NULL::bigint
  );
$function$;

CREATE FUNCTION public.caseg_admin_session_touch(
  p_session_id uuid,
  p_user_id uuid,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.caseg_admin_session_apply(
    p_session_id, p_user_id, 'touch'::text, p_expected_version
  );
$function$;

CREATE FUNCTION public.caseg_admin_session_close(
  p_session_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.caseg_admin_session_apply(
    p_session_id, p_user_id, 'close'::text, NULL::bigint
  );
$function$;

REVOKE ALL ON FUNCTION
  public.caseg_admin_session_initialize(uuid, uuid),
  public.caseg_admin_session_check(uuid, uuid),
  public.caseg_admin_session_touch(uuid, uuid, bigint),
  public.caseg_admin_session_close(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.caseg_admin_session_initialize(uuid, uuid),
  public.caseg_admin_session_check(uuid, uuid),
  public.caseg_admin_session_touch(uuid, uuid, bigint),
  public.caseg_admin_session_close(uuid, uuid)
TO service_role;

-- Detectar permissões inesperadas, inclusive defaults e herança efetiva.
-- Não alterar defaults globais nem privilégios de objetos existentes.
DO $permissions$
DECLARE
  v_role text;
  v_function record;
  v_service_oid oid;
BEGIN
  SELECT r.oid
  INTO STRICT v_service_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'service_role';

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) AS a
    WHERE c.oid = 'private.admin_session_state'::regclass
      AND a.grantee <> c.relowner
  ) THEN
    RAISE EXCEPTION 'Unexpected administrative session table ACL';
  END IF;

  FOREACH v_role IN ARRAY
    ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF pg_catalog.has_table_privilege(
      v_role,
      'private.admin_session_state',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
    ) THEN
      RAISE EXCEPTION 'Unexpected effective table access for %', v_role;
    END IF;
  END LOOP;

  FOR v_function IN
    SELECT p.oid, p.proowner, p.proacl, n.nspname
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = p.pronamespace
    WHERE (
      n.nspname = 'public'
      AND p.proname IN (
        'caseg_admin_session_initialize',
        'caseg_admin_session_check',
        'caseg_admin_session_touch',
        'caseg_admin_session_close'
      )
    ) OR (
      n.nspname = 'private'
      AND p.proname = 'caseg_admin_session_apply'
    )
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          v_function.proacl,
          pg_catalog.acldefault('f', v_function.proowner)
        )
      ) AS a
      WHERE a.grantee <> v_function.proowner
        AND NOT (
          v_function.nspname = 'public'
          AND a.grantee = v_service_oid
        )
    ) THEN
      RAISE EXCEPTION 'Unexpected administrative session function ACL';
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF pg_catalog.has_function_privilege(
        v_role, v_function.oid, 'EXECUTE'
      ) THEN
        RAISE EXCEPTION 'Unexpected effective RPC access for %', v_role;
      END IF;
    END LOOP;

    IF v_function.nspname = 'private'
      AND pg_catalog.has_function_privilege(
        'service_role', v_function.oid, 'EXECUTE'
      )
    THEN
      RAISE EXCEPTION 'Unexpected direct access to internal function';
    END IF;

    IF v_function.nspname = 'public'
      AND NOT pg_catalog.has_function_privilege(
        'service_role', v_function.oid, 'EXECUTE'
      )
    THEN
      RAISE EXCEPTION 'Backend RPC execution privilege is missing';
    END IF;
  END LOOP;
END;
$permissions$;

COMMIT;
