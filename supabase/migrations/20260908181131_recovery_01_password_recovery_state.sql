BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL PRIVILEGES ON SCHEMA private FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA private FROM anon, authenticated, service_role;

CREATE TABLE private.password_recovery_requests (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_token_hash text NOT NULL,
  identity_hmac text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  reset_attempt_count integer NOT NULL DEFAULT 0,
  send_count integer NOT NULL DEFAULT 1,
  last_sent_at timestamptz NOT NULL,
  verified_at timestamptz,
  reset_started_at timestamptz,
  used_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT password_recovery_requests_flow_token_hash_format_check
    CHECK (flow_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT password_recovery_requests_identity_hmac_format_check
    CHECK (identity_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT password_recovery_requests_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT password_recovery_requests_reset_attempt_count_check
    CHECK (reset_attempt_count >= 0),
  CONSTRAINT password_recovery_requests_send_count_check
    CHECK (send_count >= 1),
  CONSTRAINT password_recovery_requests_terminal_state_check
    CHECK (NOT (used_at IS NOT NULL AND invalidated_at IS NOT NULL)),
  CONSTRAINT password_recovery_requests_reset_requires_verified_check
    CHECK (reset_started_at IS NULL OR verified_at IS NOT NULL),
  CONSTRAINT password_recovery_requests_used_requires_verified_check
    CHECK (used_at IS NULL OR verified_at IS NOT NULL),
  CONSTRAINT password_recovery_requests_expiration_check
    CHECK (expires_at > created_at),
  CONSTRAINT password_recovery_requests_updated_at_check
    CHECK (updated_at >= created_at),
  CONSTRAINT password_recovery_requests_last_sent_at_check
    CHECK (last_sent_at >= created_at),
  CONSTRAINT password_recovery_requests_verified_at_check
    CHECK (verified_at IS NULL OR verified_at >= created_at),
  CONSTRAINT password_recovery_requests_reset_started_at_check
    CHECK (
      reset_started_at IS NULL
      OR reset_started_at >= verified_at
    ),
  CONSTRAINT password_recovery_requests_used_at_check
    CHECK (used_at IS NULL OR used_at >= verified_at),
  CONSTRAINT password_recovery_requests_invalidated_at_check
    CHECK (invalidated_at IS NULL OR invalidated_at >= created_at),
  CONSTRAINT password_recovery_requests_flow_token_hash_key
    UNIQUE (flow_token_hash)
);

COMMENT ON TABLE private.password_recovery_requests IS
  'Estado privado de recovery; cada emissão autorizada cria uma nova linha e preserva o histórico recente para limites persistentes.';

ALTER TABLE private.password_recovery_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE private.password_recovery_requests
FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX password_recovery_requests_identity_sent_idx
ON private.password_recovery_requests (identity_hmac, last_sent_at DESC)
INCLUDE (send_count);

CREATE INDEX password_recovery_requests_user_created_idx
ON private.password_recovery_requests (user_id, created_at DESC);

CREATE UNIQUE INDEX password_recovery_requests_active_identity_key
ON private.password_recovery_requests (identity_hmac)
WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE UNIQUE INDEX password_recovery_requests_active_user_key
ON private.password_recovery_requests (user_id)
WHERE used_at IS NULL AND invalidated_at IS NULL;

-- Advisory locks usam o HMAC completo ou UUID com separação de domínio.
-- Uma colisão apenas serializa operações independentes; autorização e estado
-- continuam validados pelos valores completos, constraints e índices únicos.

CREATE FUNCTION public.caseg_recovery_begin_request(
  p_user_id uuid,
  p_flow_token_hash text,
  p_identity_hmac text,
  p_expires_at timestamptz
)
RETURNS TABLE (
  allowed boolean,
  result_code text,
  user_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_total_send_count bigint;
  v_last_sent_at timestamptz;
  v_auth_user_id uuid;
BEGIN
  IF p_user_id IS NULL
    OR p_flow_token_hash IS NULL
    OR p_flow_token_hash !~ '^[0-9a-f]{64}$'
    OR p_identity_hmac IS NULL
    OR p_identity_hmac !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now
    OR p_expires_at > v_now + INTERVAL '10 minutes'
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-recovery:identity:' || p_identity_hmac,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-recovery:user:' || p_user_id::text,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-recovery:flow:' || p_flow_token_hash,
      0
    )
  );

  SELECT au.id
  INTO v_auth_user_id
  FROM auth.users AS au
  WHERE au.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'NOT_FOUND'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.password_recovery_requests AS r
    WHERE r.flow_token_hash = p_flow_token_hash
  ) THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- Lock related active rows in stable order before cleanup or replacement.
  -- This makes a concurrent reset claim visible before any destructive change.
  PERFORM r.id
  FROM private.password_recovery_requests AS r
  WHERE (r.identity_hmac = p_identity_hmac OR r.user_id = p_user_id)
    AND r.used_at IS NULL
    AND r.invalidated_at IS NULL
  ORDER BY r.id
  FOR UPDATE;

  UPDATE private.password_recovery_requests AS r
  SET
    invalidated_at = v_now,
    reset_started_at = NULL,
    updated_at = v_now
  WHERE (r.identity_hmac = p_identity_hmac OR r.user_id = p_user_id)
    AND r.used_at IS NULL
    AND r.invalidated_at IS NULL
    AND r.expires_at <= v_now
    AND r.reset_started_at IS NULL;

  IF EXISTS (
    SELECT 1
    FROM private.password_recovery_requests AS r
    WHERE r.used_at IS NULL
      AND r.invalidated_at IS NULL
      AND (
        (
          r.identity_hmac = p_identity_hmac
          AND r.user_id <> p_user_id
        )
        OR (
          r.user_id = p_user_id
          AND r.identity_hmac <> p_identity_hmac
        )
      )
  ) THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.password_recovery_requests AS r
    WHERE r.identity_hmac = p_identity_hmac
      AND r.user_id = p_user_id
      AND r.reset_started_at IS NOT NULL
      AND r.used_at IS NULL
      AND r.invalidated_at IS NULL
  ) THEN
    RETURN QUERY
    SELECT FALSE, 'BUSY'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT
    COALESCE(pg_catalog.sum(r.send_count), 0),
    pg_catalog.max(r.last_sent_at)
  INTO
    v_total_send_count,
    v_last_sent_at
  FROM private.password_recovery_requests AS r
  WHERE r.identity_hmac = p_identity_hmac
    AND r.last_sent_at > v_now - INTERVAL '24 hours';

  IF v_last_sent_at IS NOT NULL
    AND v_last_sent_at > v_now - INTERVAL '60 seconds'
  THEN
    RETURN QUERY
    SELECT FALSE, 'COOLDOWN'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_total_send_count >= 3 THEN
    RETURN QUERY
    SELECT FALSE, 'DAILY_LIMIT'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE private.password_recovery_requests AS r
  SET
    invalidated_at = v_now,
    reset_started_at = NULL,
    updated_at = v_now
  WHERE r.identity_hmac = p_identity_hmac
    AND r.user_id = p_user_id
    AND r.used_at IS NULL
    AND r.invalidated_at IS NULL
    AND r.reset_started_at IS NULL;

  INSERT INTO private.password_recovery_requests (
    user_id,
    flow_token_hash,
    identity_hmac,
    expires_at,
    attempt_count,
    reset_attempt_count,
    send_count,
    last_sent_at,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_flow_token_hash,
    p_identity_hmac,
    p_expires_at,
    0,
    0,
    1,
    v_now,
    v_now,
    v_now
  );

  RETURN QUERY
  SELECT TRUE, 'OK'::text, p_user_id, p_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.caseg_recovery_begin_request(uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caseg_recovery_begin_request(uuid, text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.caseg_recovery_begin_request(uuid, text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caseg_recovery_begin_request(uuid, text, text, timestamptz) TO service_role;

CREATE FUNCTION public.caseg_recovery_prepare_verify(
  p_flow_token_hash text
)
RETURNS TABLE (
  allowed boolean,
  result_code text,
  user_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_request private.password_recovery_requests%ROWTYPE;
BEGIN
  IF p_flow_token_hash IS NULL
    OR p_flow_token_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-recovery:flow:' || p_flow_token_hash,
      0
    )
  );

  SELECT r.*
  INTO v_request
  FROM private.password_recovery_requests AS r
  WHERE r.flow_token_hash = p_flow_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'NOT_FOUND'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.used_at IS NOT NULL THEN
    RETURN QUERY
    SELECT FALSE, 'USED'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.invalidated_at IS NOT NULL
    OR v_request.verified_at IS NOT NULL
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.expires_at <= v_now THEN
    RETURN QUERY
    SELECT FALSE, 'EXPIRED'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.attempt_count >= 5 THEN
    UPDATE private.password_recovery_requests AS r
    SET
      invalidated_at = v_now,
      reset_started_at = NULL,
      updated_at = v_now
    WHERE r.id = v_request.id
      AND r.used_at IS NULL
      AND r.invalidated_at IS NULL;

    RETURN QUERY
    SELECT FALSE, 'ATTEMPTS_EXCEEDED'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE private.password_recovery_requests AS r
  SET
    attempt_count = r.attempt_count + 1,
    updated_at = v_now
  WHERE r.id = v_request.id;

  RETURN QUERY
  SELECT TRUE, 'OK'::text, v_request.user_id, v_request.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.caseg_recovery_prepare_verify(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caseg_recovery_prepare_verify(text) FROM anon;
REVOKE ALL ON FUNCTION public.caseg_recovery_prepare_verify(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caseg_recovery_prepare_verify(text) TO service_role;

CREATE FUNCTION public.caseg_recovery_mark_verified(
  p_old_flow_token_hash text,
  p_new_flow_token_hash text,
  p_new_expires_at timestamptz
)
RETURNS TABLE (
  allowed boolean,
  result_code text,
  user_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_request private.password_recovery_requests%ROWTYPE;
  v_user_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF p_old_flow_token_hash IS NULL
    OR p_old_flow_token_hash !~ '^[0-9a-f]{64}$'
    OR p_new_flow_token_hash IS NULL
    OR p_new_flow_token_hash !~ '^[0-9a-f]{64}$'
    OR p_old_flow_token_hash = p_new_flow_token_hash
    OR p_new_expires_at IS NULL
    OR p_new_expires_at <= v_now
    OR p_new_expires_at > v_now + INTERVAL '5 minutes'
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF p_old_flow_token_hash < p_new_flow_token_hash THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'caseg-recovery:flow:' || p_old_flow_token_hash,
        0
      )
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'caseg-recovery:flow:' || p_new_flow_token_hash,
        0
      )
    );
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'caseg-recovery:flow:' || p_new_flow_token_hash,
        0
      )
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'caseg-recovery:flow:' || p_old_flow_token_hash,
        0
      )
    );
  END IF;

  SELECT r.*
  INTO v_request
  FROM private.password_recovery_requests AS r
  WHERE r.flow_token_hash = p_old_flow_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'NOT_FOUND'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.used_at IS NOT NULL THEN
    RETURN QUERY
    SELECT FALSE, 'USED'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.invalidated_at IS NOT NULL
    OR v_request.verified_at IS NOT NULL
    OR v_request.expires_at <= v_now
    OR v_request.attempt_count < 1
    OR v_request.attempt_count > 5
  THEN
    RETURN QUERY
    SELECT
      FALSE,
      CASE
        WHEN v_request.expires_at <= v_now THEN 'EXPIRED'::text
        ELSE 'INVALID_STATE'::text
      END,
      NULL::uuid,
      NULL::timestamptz;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.password_recovery_requests AS r
    WHERE r.flow_token_hash = p_new_flow_token_hash
  ) THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE private.password_recovery_requests AS r
  SET
    flow_token_hash = p_new_flow_token_hash,
    verified_at = v_now,
    expires_at = p_new_expires_at,
    updated_at = v_now
  WHERE r.id = v_request.id
    AND r.flow_token_hash = p_old_flow_token_hash
    AND r.verified_at IS NULL
    AND r.used_at IS NULL
    AND r.invalidated_at IS NULL
    AND r.expires_at > v_now
    AND r.attempt_count BETWEEN 1 AND 5
  RETURNING
    r.user_id,
    r.expires_at
  INTO
    v_user_id,
    v_expires_at;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT TRUE, 'OK'::text, v_user_id, v_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.caseg_recovery_mark_verified(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caseg_recovery_mark_verified(text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.caseg_recovery_mark_verified(text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caseg_recovery_mark_verified(text, text, timestamptz) TO service_role;

CREATE FUNCTION public.caseg_recovery_claim_reset(
  p_flow_token_hash text
)
RETURNS TABLE (
  allowed boolean,
  result_code text,
  user_id uuid,
  expires_at timestamptz,
  reset_started_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_request private.password_recovery_requests%ROWTYPE;
BEGIN
  IF p_flow_token_hash IS NULL
    OR p_flow_token_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN QUERY
    SELECT
      FALSE,
      'INVALID_STATE'::text,
      NULL::uuid,
      NULL::timestamptz,
      NULL::timestamptz;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-recovery:flow:' || p_flow_token_hash,
      0
    )
  );

  SELECT r.*
  INTO v_request
  FROM private.password_recovery_requests AS r
  WHERE r.flow_token_hash = p_flow_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      FALSE,
      'NOT_FOUND'::text,
      NULL::uuid,
      NULL::timestamptz,
      NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.used_at IS NOT NULL THEN
    RETURN QUERY
    SELECT
      FALSE,
      'USED'::text,
      NULL::uuid,
      NULL::timestamptz,
      NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.invalidated_at IS NOT NULL
    OR v_request.verified_at IS NULL
  THEN
    RETURN QUERY
    SELECT
      FALSE,
      'INVALID_STATE'::text,
      NULL::uuid,
      NULL::timestamptz,
      NULL::timestamptz;
    RETURN;
  END IF;

  -- The reset claim is exclusive and has no automatic timeout because the
  -- external Auth side effect cannot be transactionally fenced by PostgreSQL.
  IF v_request.reset_started_at IS NOT NULL THEN
    RETURN QUERY
    SELECT
      FALSE,
      'BUSY'::text,
      NULL::uuid,
      NULL::timestamptz,
      NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.expires_at <= v_now THEN
    RETURN QUERY
    SELECT
      FALSE,
      'EXPIRED'::text,
      NULL::uuid,
      NULL::timestamptz,
      NULL::timestamptz;
    RETURN;
  END IF;

  IF v_request.reset_attempt_count >= 5 THEN
    UPDATE private.password_recovery_requests AS r
    SET
      invalidated_at = v_now,
      reset_started_at = NULL,
      updated_at = v_now
    WHERE r.id = v_request.id
      AND r.used_at IS NULL
      AND r.invalidated_at IS NULL;

    RETURN QUERY
    SELECT
      FALSE,
      'ATTEMPTS_EXCEEDED'::text,
      NULL::uuid,
      NULL::timestamptz,
      NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE private.password_recovery_requests AS r
  SET
    reset_attempt_count = r.reset_attempt_count + 1,
    reset_started_at = v_now,
    updated_at = v_now
  WHERE r.id = v_request.id
  RETURNING r.reset_started_at
  INTO v_request.reset_started_at;

  RETURN QUERY
  SELECT
    TRUE,
    'OK'::text,
    v_request.user_id,
    v_request.expires_at,
    v_request.reset_started_at;
END;
$$;

REVOKE ALL ON FUNCTION public.caseg_recovery_claim_reset(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caseg_recovery_claim_reset(text) FROM anon;
REVOKE ALL ON FUNCTION public.caseg_recovery_claim_reset(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caseg_recovery_claim_reset(text) TO service_role;

CREATE FUNCTION public.caseg_recovery_release_reset(
  p_flow_token_hash text,
  p_reset_started_at timestamptz
)
RETURNS TABLE (
  allowed boolean,
  result_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_request private.password_recovery_requests%ROWTYPE;
BEGIN
  IF p_flow_token_hash IS NULL
    OR p_flow_token_hash !~ '^[0-9a-f]{64}$'
    OR p_reset_started_at IS NULL
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-recovery:flow:' || p_flow_token_hash,
      0
    )
  );

  SELECT r.*
  INTO v_request
  FROM private.password_recovery_requests AS r
  WHERE r.flow_token_hash = p_flow_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'NOT_FOUND'::text;
    RETURN;
  END IF;

  IF v_request.used_at IS NOT NULL THEN
    RETURN QUERY
    SELECT FALSE, 'USED'::text;
    RETURN;
  END IF;

  IF v_request.invalidated_at IS NOT NULL
    OR v_request.verified_at IS NULL
    OR v_request.reset_started_at IS NULL
    OR v_request.reset_started_at <> p_reset_started_at
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  IF v_request.expires_at <= v_now THEN
    RETURN QUERY
    SELECT FALSE, 'EXPIRED'::text;
    RETURN;
  END IF;

  UPDATE private.password_recovery_requests AS r
  SET
    reset_started_at = NULL,
    updated_at = v_now
  WHERE r.id = v_request.id
    AND r.verified_at IS NOT NULL
    AND r.used_at IS NULL
    AND r.invalidated_at IS NULL
    AND r.expires_at > v_now
    AND r.reset_started_at = p_reset_started_at;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT TRUE, 'OK'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.caseg_recovery_release_reset(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caseg_recovery_release_reset(text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.caseg_recovery_release_reset(text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caseg_recovery_release_reset(text, timestamptz) TO service_role;

CREATE FUNCTION public.caseg_recovery_mark_used(
  p_flow_token_hash text,
  p_reset_started_at timestamptz
)
RETURNS TABLE (
  allowed boolean,
  result_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_request private.password_recovery_requests%ROWTYPE;
BEGIN
  IF p_flow_token_hash IS NULL
    OR p_flow_token_hash !~ '^[0-9a-f]{64}$'
    OR p_reset_started_at IS NULL
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-recovery:flow:' || p_flow_token_hash,
      0
    )
  );

  SELECT r.*
  INTO v_request
  FROM private.password_recovery_requests AS r
  WHERE r.flow_token_hash = p_flow_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'NOT_FOUND'::text;
    RETURN;
  END IF;

  IF v_request.used_at IS NOT NULL THEN
    IF v_request.reset_started_at = p_reset_started_at THEN
      RETURN QUERY
      SELECT TRUE, 'OK'::text;
    ELSE
      RETURN QUERY
      SELECT FALSE, 'INVALID_STATE'::text;
    END IF;
    RETURN;
  END IF;

  IF v_request.invalidated_at IS NOT NULL
    OR v_request.verified_at IS NULL
    OR v_request.reset_started_at IS NULL
    OR v_request.reset_started_at <> p_reset_started_at
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  UPDATE private.password_recovery_requests AS r
  SET
    used_at = v_now,
    updated_at = v_now
  WHERE r.id = v_request.id
    AND r.verified_at IS NOT NULL
    AND r.used_at IS NULL
    AND r.invalidated_at IS NULL
    AND r.reset_started_at = p_reset_started_at;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT TRUE, 'OK'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.caseg_recovery_mark_used(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caseg_recovery_mark_used(text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.caseg_recovery_mark_used(text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caseg_recovery_mark_used(text, timestamptz) TO service_role;

CREATE FUNCTION public.caseg_recovery_invalidate(
  p_flow_token_hash text
)
RETURNS TABLE (
  allowed boolean,
  result_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_request private.password_recovery_requests%ROWTYPE;
BEGIN
  IF p_flow_token_hash IS NULL
    OR p_flow_token_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-recovery:flow:' || p_flow_token_hash,
      0
    )
  );

  SELECT r.*
  INTO v_request
  FROM private.password_recovery_requests AS r
  WHERE r.flow_token_hash = p_flow_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'NOT_FOUND'::text;
    RETURN;
  END IF;

  IF v_request.used_at IS NOT NULL THEN
    RETURN QUERY
    SELECT FALSE, 'USED'::text;
    RETURN;
  END IF;

  IF v_request.invalidated_at IS NULL
    AND v_request.reset_started_at IS NOT NULL
  THEN
    RETURN QUERY
    SELECT FALSE, 'BUSY'::text;
    RETURN;
  END IF;

  IF v_request.invalidated_at IS NOT NULL THEN
    RETURN QUERY
    SELECT TRUE, 'OK'::text;
    RETURN;
  END IF;

  UPDATE private.password_recovery_requests AS r
  SET
    invalidated_at = v_now,
    reset_started_at = NULL,
    updated_at = v_now
  WHERE r.id = v_request.id
    AND r.used_at IS NULL
    AND r.invalidated_at IS NULL;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT TRUE, 'OK'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.caseg_recovery_invalidate(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caseg_recovery_invalidate(text) FROM anon;
REVOKE ALL ON FUNCTION public.caseg_recovery_invalidate(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caseg_recovery_invalidate(text) TO service_role;

-- Operational-only reconciliation for an expired orphaned reset claim.
-- This is not a timeout or automatic takeover. Call only after operational
-- confirmation that the previous worker cannot continue. The flow is
-- invalidated, while reset_started_at is preserved as historical fencing
-- evidence; a new recovery must converge any partial external effects.
CREATE FUNCTION public.caseg_recovery_reconcile_orphaned_reset(
  p_flow_token_hash text
)
RETURNS TABLE (
  allowed boolean,
  result_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_request private.password_recovery_requests%ROWTYPE;
BEGIN
  IF p_flow_token_hash IS NULL
    OR p_flow_token_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'caseg-recovery:flow:' || p_flow_token_hash,
      0
    )
  );

  SELECT r.*
  INTO v_request
  FROM private.password_recovery_requests AS r
  WHERE r.flow_token_hash = p_flow_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'NOT_FOUND'::text;
    RETURN;
  END IF;

  IF v_request.used_at IS NOT NULL THEN
    RETURN QUERY
    SELECT FALSE, 'USED'::text;
    RETURN;
  END IF;

  IF v_request.invalidated_at IS NOT NULL THEN
    RETURN QUERY
    SELECT TRUE, 'OK'::text;
    RETURN;
  END IF;

  IF v_request.reset_started_at IS NULL
    OR v_request.verified_at IS NULL
  THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  IF v_request.expires_at > v_now THEN
    RETURN QUERY
    SELECT FALSE, 'BUSY'::text;
    RETURN;
  END IF;

  UPDATE private.password_recovery_requests AS r
  SET
    invalidated_at = v_now,
    updated_at = v_now
  WHERE r.id = v_request.id
    AND r.verified_at IS NOT NULL
    AND r.reset_started_at IS NOT NULL
    AND r.used_at IS NULL
    AND r.invalidated_at IS NULL
    AND r.expires_at <= v_now;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT FALSE, 'INVALID_STATE'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT TRUE, 'OK'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.caseg_recovery_reconcile_orphaned_reset(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.caseg_recovery_reconcile_orphaned_reset(text) FROM anon;
REVOKE ALL ON FUNCTION public.caseg_recovery_reconcile_orphaned_reset(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.caseg_recovery_reconcile_orphaned_reset(text) TO service_role;

COMMIT;
