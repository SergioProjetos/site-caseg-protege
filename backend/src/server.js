require("dotenv").config();

console.log("ESTOU NO SERVER CERTO 🚀");
console.log("ARQUIVO EM EXECUÇÃO:", __filename);

const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const { createClient, isAuthRetryableFetchError } = require("@supabase/supabase-js");
const {
  createPasswordRecoveryEmailService
} = require("./services/password-recovery-email");

console.log("URL:", process.env.SUPABASE_URL ? "OK" : "NÃO CARREGOU");
console.log("SERVICE ROLE KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "NÃO CARREGOU");
console.log("ANON KEY:", process.env.SUPABASE_ANON_KEY ? "OK" : "NÃO CARREGOU");

const adminSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const publicSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const app = express();
app.use(express.json());

const configuredCorsOrigin = process.env.CASEG_CORS_ORIGIN;
const corsOrigin =
  configuredCorsOrigin === undefined && process.env.NODE_ENV !== "production"
    ? "http://localhost:5500"
    : configuredCorsOrigin;
const corsOriginPattern = /^https?:\/\/[^/?#\\@*,\s]+\/?$/i;
let canonicalCorsOrigin;

try {
  if (
    typeof corsOrigin !== "string" ||
    !corsOriginPattern.test(corsOrigin.trim())
  ) {
    throw new Error();
  }

  canonicalCorsOrigin = new URL(corsOrigin.trim()).origin;

  if (!corsOriginPattern.test(canonicalCorsOrigin)) {
    throw new Error();
  }
} catch {
  throw new Error(
    "CASEG_CORS_ORIGIN must be a single valid HTTP(S) origin and is required in production."
  );
}

const CORS_ALLOWED_ORIGINS = new Set([canonicalCorsOrigin]);

const CLIENT_REFRESH_COOKIE_NAME = "caseg_client_refresh";

function expireClientRefreshCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${CLIENT_REFRESH_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
}

function setClientRefreshCookie(res, refreshToken, expiresAt) {
  if (
    typeof refreshToken !== "string" ||
    refreshToken.length === 0 ||
    /[\r\n]/.test(refreshToken) ||
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt)
  ) {
    return false;
  }

  const nowInSeconds = Date.now() / 1000;
  const maxAge = Math.floor(expiresAt - nowInSeconds);
  const expires = new Date(expiresAt * 1000);

  if (
    expiresAt <= nowInSeconds ||
    maxAge <= 0 ||
    !Number.isFinite(expires.getTime())
  ) {
    return false;
  }

  res.setHeader(
    "Set-Cookie",
    `${CLIENT_REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}; Expires=${expires.toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );

  return true;
}

function getClientRefreshCookie(req) {
  if (typeof req.headers.cookie !== "string") {
    return null;
  }

  let encodedRefreshToken = null;

  for (const rawSegment of req.headers.cookie.split(";")) {
    const segment = rawSegment.replace(/^[ \t]+/, "");
    const separatorIndex = segment.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = segment.slice(0, separatorIndex);
    const cookieValue = segment.slice(separatorIndex + 1);

    if (cookieName !== CLIENT_REFRESH_COOKIE_NAME) {
      continue;
    }

    if (encodedRefreshToken !== null) {
      return null;
    }

    encodedRefreshToken = cookieValue;
  }

  if (!encodedRefreshToken || /[\r\n]/.test(encodedRefreshToken)) {
    return null;
  }

  try {
    const refreshToken = decodeURIComponent(encodedRefreshToken);

    if (!refreshToken || /[\r\n]/.test(refreshToken)) {
      return null;
    }

    return refreshToken;
  } catch (error) {
    return null;
  }
}

function createClientSessionAuthClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  );
}

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const isAllowedOrigin =
    typeof requestOrigin === "string" &&
    CORS_ALLOWED_ORIGINS.has(requestOrigin);

  res.vary("Origin");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (isAllowedOrigin) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      requestOrigin
    );

    res.setHeader(
      "Access-Control-Allow-Credentials",
      "true"
    );
  }

  if (requestOrigin && !isAllowedOrigin) {
    return res.status(403).json({
      error: "Origem não permitida."
    });
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

const configuredPort = process.env.PORT;
const PORT = configuredPort === undefined ? 3000 : Number(configuredPort);

if (
  (configuredPort !== undefined &&
    (typeof configuredPort !== "string" || !/^[0-9]+$/.test(configuredPort))) ||
  !Number.isInteger(PORT) ||
  PORT < 1 ||
  PORT > 65535
) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const TEMPORARY_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;
const TEMPORARY_PASSWORD_EXPIRED_CODE = "TEMPORARY_PASSWORD_EXPIRED";
const TEMPORARY_PASSWORD_EXPIRED_MESSAGE =
  "Sua senha temporária expirou. Solicite um novo acesso ao administrador.";
const FIRST_ACCESS_SESSION_INVALID_CODE = "FIRST_ACCESS_SESSION_INVALID";
const FIRST_ACCESS_SESSION_INVALID_MESSAGE =
  "A troca de senha não está disponível para esta sessão.";
const FIRST_ACCESS_STATE_CHANGED_CODE = "FIRST_ACCESS_STATE_CHANGED";
const FIRST_ACCESS_STATE_CHANGED_MESSAGE =
  "O estado do primeiro acesso foi alterado. Tente novamente.";
const FIRST_ACCESS_ALREADY_COMPLETED_CODE =
  "FIRST_ACCESS_ALREADY_COMPLETED";
const FIRST_ACCESS_ALREADY_COMPLETED_MESSAGE =
  "O primeiro acesso deste cliente já foi concluído.";
const FIRST_ACCESS_RECOVERY_REQUIRED_CODE =
  "FIRST_ACCESS_RECOVERY_REQUIRED";
const FIRST_ACCESS_RECOVERY_REQUIRED_MESSAGE =
  "O primeiro acesso está bloqueado e requer recuperação técnica.";
const ADMIN_ACTIVITY_RETENTION_DAYS = 7;
const ADMIN_ACTIVITY_CLEANUP_INTERVAL_MS = ONE_DAY_IN_MS;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_IP_REQUEST_LIMIT = 100;
const LOGIN_IDENTITY_FAILURE_LIMIT = 10;
const LOGIN_RATE_LIMIT_CLEANUP_INTERVAL_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_ERROR_MESSAGE =
  "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.";
const RECOVERY_IDENTITY_HMAC_DOMAIN =
  "caseg/recovery/identity/v1\0";
const RECOVERY_FLOW_HASH_DOMAIN = "caseg/recovery/flow/v1\0";
const RECOVERY_FLOW_TTL_MS = 10 * 60 * 1000;
const RECOVERY_VERIFIED_FLOW_TTL_MS = 5 * 60 * 1000;
const RECOVERY_REQUEST_IP_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_REQUEST_IP_MAX = 20;
const RECOVERY_REQUEST_IP_CLEANUP_INTERVAL_MS = 60 * 1000;
const RECOVERY_FLOW_COOKIE_NAME = "caseg_recovery_flow";
const RECOVERY_FLOW_COOKIE_PATH = "/password-recovery";

const loginIpRequestEntries = new Map();
const loginIdentityFailureEntries = new Map();
const loginIdentifierHmacSecret = crypto.randomBytes(32);
const recoveryRequestIpAttempts = new Map();
let passwordRecoveryEmailService;

function getLoginRequestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function normalizeFiscalIdentity(value) {
  if (typeof value !== "string") {
    return {
      state: "INVALID",
      canonical: null
    };
  }

  const trimmedValue = value.trim();

  if (!trimmedValue || !/^[A-Za-z0-9./-]+$/.test(trimmedValue)) {
    return {
      state: "INVALID",
      canonical: null
    };
  }

  const canonical = trimmedValue
    .toUpperCase()
    .replace(/[./-]/g, "");

  if (/^[0-9]{11}$/.test(canonical)) {
    return {
      state: "CPF_VALID_STRUCTURE",
      canonical
    };
  }

  if (/^[A-Z0-9]{12}[0-9]{2}$/.test(canonical)) {
    return {
      state: "CNPJ_VALID_STRUCTURE",
      canonical
    };
  }

  return {
    state: "INVALID",
    canonical: null
  };
}

function getRecoveryIdentityHmacKey() {
  const configuredKey =
    process.env.CASEG_RECOVERY_IDENTITY_HMAC_KEY;

  if (
    typeof configuredKey !== "string" ||
    !/^[0-9a-fA-F]{64}$/.test(configuredKey)
  ) {
    throw new Error(
      "Recovery identity HMAC key is not configured correctly."
    );
  }

  const key = Buffer.from(configuredKey, "hex");

  if (key.length !== 32) {
    throw new Error(
      "Recovery identity HMAC key is not configured correctly."
    );
  }

  return key;
}

function createRecoveryIdentityHmac(canonicalIdentity) {
  if (
    typeof canonicalIdentity !== "string" ||
    canonicalIdentity.length === 0
  ) {
    throw new TypeError("Recovery canonical identity is invalid.");
  }

  return crypto
    .createHmac("sha256", getRecoveryIdentityHmacKey())
    .update(RECOVERY_IDENTITY_HMAC_DOMAIN, "utf8")
    .update(canonicalIdentity, "utf8")
    .digest("hex");
}

function createRecoveryFlowToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createRecoveryFlowHash(flowToken) {
  if (typeof flowToken !== "string" || flowToken.length === 0) {
    throw new TypeError("Recovery flow token is invalid.");
  }

  return crypto
    .createHash("sha256")
    .update(RECOVERY_FLOW_HASH_DOMAIN, "utf8")
    .update(flowToken, "utf8")
    .digest("hex");
}

function getRecoveryFlowCookie(req) {
  try {
    if (
      !req ||
      typeof req !== "object" ||
      typeof req.headers?.cookie !== "string"
    ) {
      return null;
    }

    let recoveryFlowToken = null;

    for (const rawSegment of req.headers.cookie.split(";")) {
      const segment = rawSegment.replace(/^[ \t]+/, "");
      const separatorIndex = segment.indexOf("=");

      if (separatorIndex < 0) {
        continue;
      }

      const cookieName = segment.slice(0, separatorIndex);
      const cookieValue = segment.slice(separatorIndex + 1);

      if (cookieName !== RECOVERY_FLOW_COOKIE_NAME) {
        continue;
      }

      if (recoveryFlowToken !== null) {
        return null;
      }

      recoveryFlowToken = cookieValue;
    }

    if (
      typeof recoveryFlowToken !== "string" ||
      recoveryFlowToken.length === 0 ||
      /[^A-Za-z0-9_-]/.test(recoveryFlowToken)
    ) {
      return null;
    }

    return recoveryFlowToken;
  } catch {
    return null;
  }
}

function getPasswordRecoveryVerificationCode(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/\S/.test(value) ||
    /[\r\n]/.test(value)
  ) {
    return null;
  }

  return value;
}

async function preparePasswordRecoveryVerification(flowHash) {
  if (
    typeof flowHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(flowHash)
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  async function invalidateAmbiguousPreparation() {
    try {
      await adminSupabase
        .rpc("caseg_recovery_invalidate", {
          p_flow_token_hash: flowHash
        })
        .single();
    } catch {
      // A falha técnica original permanece fechada.
    }
  }

  let preparationResult;

  try {
    preparationResult = await adminSupabase
      .rpc("caseg_recovery_prepare_verify", {
        p_flow_token_hash: flowHash
      })
      .single();
  } catch {
    await invalidateAmbiguousPreparation();
    return { state: "TECHNICAL_FAILURE" };
  }

  const data = preparationResult?.data;

  if (
    preparationResult?.error !== null ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    await invalidateAmbiguousPreparation();
    return { state: "TECHNICAL_FAILURE" };
  }

  const resultKeys = Object.keys(data).sort();
  const expectedResultKeys = [
    "allowed",
    "expires_at",
    "result_code",
    "user_id"
  ];

  if (
    resultKeys.length !== expectedResultKeys.length ||
    resultKeys.some(
      (resultKey, index) => resultKey !== expectedResultKeys[index]
    )
  ) {
    await invalidateAmbiguousPreparation();
    return { state: "TECHNICAL_FAILURE" };
  }

  if (
    data.result_code === "OK" &&
    data.allowed === true &&
    typeof data.user_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      data.user_id
    ) &&
    typeof data.expires_at === "string" &&
    Number.isFinite(Date.parse(data.expires_at))
  ) {
    return {
      state: "PREPARED",
      userId: data.user_id,
      expiresAt: data.expires_at
    };
  }

  const rejectedResultCodes = new Set([
    "INVALID_STATE",
    "NOT_FOUND",
    "USED",
    "EXPIRED",
    "ATTEMPTS_EXCEEDED"
  ]);

  if (
    data.allowed === false &&
    rejectedResultCodes.has(data.result_code) &&
    data.user_id === null &&
    data.expires_at === null
  ) {
    return { state: "FLOW_REJECTED" };
  }

  await invalidateAmbiguousPreparation();
  return { state: "TECHNICAL_FAILURE" };
}

async function verifyPasswordRecoveryOtp(userId, code) {
  if (
    typeof userId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      userId
    )
  ) {
    return "TECHNICAL_FAILURE";
  }

  const recoveryCode = getPasswordRecoveryVerificationCode(code);

  if (recoveryCode === null) {
    return "TECHNICAL_FAILURE";
  }

  let authUserResult;

  try {
    authUserResult = await adminSupabase.auth.admin.getUserById(userId);
  } catch {
    return "TECHNICAL_FAILURE";
  }

  const authUser = authUserResult?.data?.user;

  if (
    authUserResult?.error !== null ||
    !authUser ||
    authUser.id !== userId ||
    typeof authUser.email !== "string" ||
    !/\S/.test(authUser.email)
  ) {
    return "TECHNICAL_FAILURE";
  }

  let verificationSupabase;

  try {
    verificationSupabase = createClientSessionAuthClient();
  } catch {
    return "TECHNICAL_FAILURE";
  }

  let verificationResult;

  try {
    verificationResult = await verificationSupabase.auth.verifyOtp({
      email: authUser.email,
      token: recoveryCode,
      type: "recovery"
    });
  } catch {
    try {
      await verificationSupabase.auth.signOut({ scope: "local" });
    } catch {
      // A validação falha fechada mesmo se a revogação local falhar.
    }

    return "TECHNICAL_FAILURE";
  }

  if (
    verificationResult?.error?.code === "otp_expired" &&
    verificationResult?.data?.user === null &&
    verificationResult?.data?.session === null
  ) {
    return "OTP_REJECTED";
  }

  const verificationSession = verificationResult?.data?.session;
  const otpVerified =
    verificationResult?.error === null &&
    verificationResult?.data?.user?.id === userId &&
    verificationSession &&
    typeof verificationSession.access_token === "string" &&
    /\S/.test(verificationSession.access_token);

  try {
    const signOutResult = await verificationSupabase.auth.signOut({
      scope: "local"
    });

    if (
      !signOutResult ||
      typeof signOutResult !== "object" ||
      signOutResult.error !== null
    ) {
      return "TECHNICAL_FAILURE";
    }
  } catch {
    return "TECHNICAL_FAILURE";
  }

  return otpVerified === true ? "VERIFIED" : "TECHNICAL_FAILURE";
}

async function rotateVerifiedPasswordRecoveryFlow(oldFlowHash) {
  if (
    typeof oldFlowHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(oldFlowHash)
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  let newFlowToken;
  let newFlowHash;
  let newExpiresAt;

  try {
    newFlowToken = createRecoveryFlowToken();
    newFlowHash = createRecoveryFlowHash(newFlowToken);
    newExpiresAt = new Date(
      Date.now() + RECOVERY_VERIFIED_FLOW_TTL_MS
    ).toISOString();
  } catch {
    await invalidateAmbiguousFlow(oldFlowHash);
    return { state: "TECHNICAL_FAILURE" };
  }

  if (
    typeof newFlowToken !== "string" ||
    newFlowToken.length === 0 ||
    /[^A-Za-z0-9_-]/.test(newFlowToken) ||
    typeof newFlowHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(newFlowHash) ||
    newFlowHash === oldFlowHash ||
    typeof newExpiresAt !== "string" ||
    !Number.isFinite(Date.parse(newExpiresAt))
  ) {
    await invalidateAmbiguousFlow(oldFlowHash);
    return { state: "TECHNICAL_FAILURE" };
  }

  async function invalidateAmbiguousFlow(flowHash) {
    try {
      await adminSupabase
        .rpc("caseg_recovery_invalidate", {
          p_flow_token_hash: flowHash
        })
        .single();
    } catch {
      // A outra compensação ainda deve ser tentada.
    }
  }

  async function invalidateAmbiguousRotation() {
    await invalidateAmbiguousFlow(oldFlowHash);
    await invalidateAmbiguousFlow(newFlowHash);
  }

  let markVerifiedResponse;

  try {
    markVerifiedResponse = await adminSupabase
      .rpc("caseg_recovery_mark_verified", {
        p_old_flow_token_hash: oldFlowHash,
        p_new_flow_token_hash: newFlowHash,
        p_new_expires_at: newExpiresAt
      })
      .single();
  } catch {
    await invalidateAmbiguousRotation();
    return { state: "TECHNICAL_FAILURE" };
  }

  if (
    !markVerifiedResponse ||
    typeof markVerifiedResponse !== "object" ||
    markVerifiedResponse.error !== null ||
    !markVerifiedResponse.data ||
    typeof markVerifiedResponse.data !== "object" ||
    Array.isArray(markVerifiedResponse.data)
  ) {
    await invalidateAmbiguousRotation();
    return { state: "TECHNICAL_FAILURE" };
  }

  const markVerifiedResult = markVerifiedResponse.data;
  const resultKeys = Object.keys(markVerifiedResult).sort();
  const expectedResultKeys = [
    "allowed",
    "expires_at",
    "result_code",
    "user_id"
  ];

  if (
    resultKeys.length !== expectedResultKeys.length ||
    resultKeys.some(
      (resultKey, index) =>
        resultKey !== expectedResultKeys[index]
    )
  ) {
    await invalidateAmbiguousRotation();
    return { state: "TECHNICAL_FAILURE" };
  }

  switch (markVerifiedResult.result_code) {
    case "NOT_FOUND":
    case "USED":
    case "EXPIRED":
    case "INVALID_STATE":
      if (
        markVerifiedResult.allowed !== false ||
        markVerifiedResult.user_id !== null ||
        markVerifiedResult.expires_at !== null
      ) {
        await invalidateAmbiguousRotation();
        return { state: "TECHNICAL_FAILURE" };
      }

      await invalidateAmbiguousFlow(oldFlowHash);
      return { state: "FLOW_REJECTED" };
    case "OK":
      if (
        markVerifiedResult.allowed !== true ||
        typeof markVerifiedResult.user_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          markVerifiedResult.user_id
        ) ||
        typeof markVerifiedResult.expires_at !== "string" ||
        !Number.isFinite(
          Date.parse(markVerifiedResult.expires_at)
        ) ||
        Date.parse(markVerifiedResult.expires_at) !==
          Date.parse(newExpiresAt)
      ) {
        await invalidateAmbiguousRotation();
        return { state: "TECHNICAL_FAILURE" };
      }

      return { state: "ROTATED", newFlowToken };
    default:
      await invalidateAmbiguousRotation();
      return { state: "TECHNICAL_FAILURE" };
  }
}

async function claimPasswordRecoveryReset(flowHash) {
  if (
    typeof flowHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(flowHash)
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  let claimResponse;

  try {
    claimResponse = await adminSupabase
      .rpc("caseg_recovery_claim_reset", {
        p_flow_token_hash: flowHash
      })
      .single();
  } catch {
    return { state: "TECHNICAL_FAILURE" };
  }

  if (
    !claimResponse ||
    typeof claimResponse !== "object" ||
    claimResponse.error !== null ||
    !claimResponse.data ||
    typeof claimResponse.data !== "object" ||
    Array.isArray(claimResponse.data)
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  const claimResult = claimResponse.data;
  const resultKeys = Object.keys(claimResult).sort();
  const expectedResultKeys = [
    "allowed",
    "expires_at",
    "reset_started_at",
    "result_code",
    "user_id"
  ];

  if (
    resultKeys.length !== expectedResultKeys.length ||
    resultKeys.some(
      (resultKey, index) => resultKey !== expectedResultKeys[index]
    )
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  if (
    claimResult.result_code === "OK" &&
    claimResult.allowed === true &&
    typeof claimResult.user_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      claimResult.user_id
    ) &&
    typeof claimResult.expires_at === "string" &&
    Number.isFinite(Date.parse(claimResult.expires_at)) &&
    typeof claimResult.reset_started_at === "string" &&
    Number.isFinite(Date.parse(claimResult.reset_started_at))
  ) {
    return {
      state: "CLAIMED",
      userId: claimResult.user_id,
      expiresAt: claimResult.expires_at,
      resetStartedAt: claimResult.reset_started_at
    };
  }

  const successFieldsAreNull =
    claimResult.user_id === null &&
    claimResult.expires_at === null &&
    claimResult.reset_started_at === null;

  if (claimResult.allowed === false && successFieldsAreNull) {
    if (claimResult.result_code === "BUSY") {
      return { state: "BUSY" };
    }

    if (
      [
        "INVALID_STATE",
        "NOT_FOUND",
        "USED",
        "EXPIRED",
        "ATTEMPTS_EXCEEDED"
      ].includes(claimResult.result_code)
    ) {
      return { state: "FLOW_REJECTED" };
    }
  }

  return { state: "TECHNICAL_FAILURE" };
}

async function releasePasswordRecoveryReset(
  flowHash,
  resetStartedAt
) {
  if (
    typeof flowHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(flowHash) ||
    typeof resetStartedAt !== "string" ||
    !Number.isFinite(Date.parse(resetStartedAt))
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  let releaseResponse;

  try {
    releaseResponse = await adminSupabase
      .rpc("caseg_recovery_release_reset", {
        p_flow_token_hash: flowHash,
        p_reset_started_at: resetStartedAt
      })
      .single();
  } catch {
    return { state: "TECHNICAL_FAILURE" };
  }

  if (
    !releaseResponse ||
    typeof releaseResponse !== "object" ||
    releaseResponse.error !== null ||
    !releaseResponse.data ||
    typeof releaseResponse.data !== "object" ||
    Array.isArray(releaseResponse.data)
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  const releaseResult = releaseResponse.data;
  const resultKeys = Object.keys(releaseResult).sort();
  const expectedResultKeys = ["allowed", "result_code"];

  if (
    resultKeys.length !== expectedResultKeys.length ||
    resultKeys.some(
      (resultKey, index) => resultKey !== expectedResultKeys[index]
    )
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  if (
    releaseResult.result_code === "OK" &&
    releaseResult.allowed === true
  ) {
    return { state: "RELEASED" };
  }

  if (
    releaseResult.allowed === false &&
    ["INVALID_STATE", "NOT_FOUND", "USED", "EXPIRED"].includes(
      releaseResult.result_code
    )
  ) {
    return { state: "FLOW_REJECTED" };
  }

  return { state: "TECHNICAL_FAILURE" };
}

async function markPasswordRecoveryResetUsed(
  flowHash,
  resetStartedAt
) {
  if (
    typeof flowHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(flowHash) ||
    typeof resetStartedAt !== "string" ||
    !Number.isFinite(Date.parse(resetStartedAt))
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  let markUsedResponse;

  try {
    markUsedResponse = await adminSupabase
      .rpc("caseg_recovery_mark_used", {
        p_flow_token_hash: flowHash,
        p_reset_started_at: resetStartedAt
      })
      .single();
  } catch {
    return { state: "TECHNICAL_FAILURE" };
  }

  if (
    !markUsedResponse ||
    typeof markUsedResponse !== "object" ||
    markUsedResponse.error !== null ||
    !markUsedResponse.data ||
    typeof markUsedResponse.data !== "object" ||
    Array.isArray(markUsedResponse.data)
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  const markUsedResult = markUsedResponse.data;
  const resultKeys = Object.keys(markUsedResult).sort();
  const expectedResultKeys = ["allowed", "result_code"];

  if (
    resultKeys.length !== expectedResultKeys.length ||
    resultKeys.some(
      (resultKey, index) => resultKey !== expectedResultKeys[index]
    )
  ) {
    return { state: "TECHNICAL_FAILURE" };
  }

  if (
    markUsedResult.result_code === "OK" &&
    markUsedResult.allowed === true
  ) {
    return { state: "USED" };
  }

  if (
    markUsedResult.allowed === false &&
    ["INVALID_STATE", "NOT_FOUND"].includes(
      markUsedResult.result_code
    )
  ) {
    return { state: "FLOW_REJECTED" };
  }

  return { state: "TECHNICAL_FAILURE" };
}

function shouldUseSecureRecoveryCookie(req) {
  try {
    return !(
      req &&
      typeof req === "object" &&
      req.hostname === "localhost" &&
      req.protocol === "http"
    );
  } catch (error) {
    return true;
  }
}

function serializeRecoveryFlowCookie(
  flowToken,
  {
    secure,
    now = Date.now(),
    ttlMs = RECOVERY_FLOW_TTL_MS
  } = {}
) {
  if (
    typeof flowToken !== "string" ||
    flowToken.length === 0 ||
    /[^A-Za-z0-9_-]/.test(flowToken)
  ) {
    throw new TypeError("Recovery flow token is invalid.");
  }

  if (typeof secure !== "boolean") {
    throw new TypeError("Recovery flow cookie secure option is invalid.");
  }

  if (typeof now !== "number" || !Number.isFinite(now)) {
    throw new TypeError("Recovery flow cookie time is invalid.");
  }

  if (
    typeof ttlMs !== "number" ||
    !Number.isFinite(ttlMs) ||
    ttlMs <= 0 ||
    !Number.isInteger(ttlMs / 1000)
  ) {
    throw new TypeError("Recovery flow cookie TTL is invalid.");
  }

  const expires = new Date(now + ttlMs);

  if (!Number.isFinite(expires.getTime())) {
    throw new TypeError("Recovery flow cookie time is invalid.");
  }

  const attributes = [
    `${RECOVERY_FLOW_COOKIE_NAME}=${flowToken}`,
    `Path=${RECOVERY_FLOW_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${ttlMs / 1000}`,
    `Expires=${expires.toUTCString()}`
  ];

  if (secure === true) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function serializeExpiredRecoveryFlowCookie(req) {
  const attributes = [
    `${RECOVERY_FLOW_COOKIE_NAME}=`,
    `Path=${RECOVERY_FLOW_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ];

  if (shouldUseSecureRecoveryCookie(req)) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function sendDummyPasswordRecoveryResponse(req, res) {
  try {
    const dummyRecoveryFlowToken = createRecoveryFlowToken();
    const dummyRecoveryFlowCookie = serializeRecoveryFlowCookie(
      dummyRecoveryFlowToken,
      {
        secure: shouldUseSecureRecoveryCookie(req)
      }
    );

    res.setHeader("Set-Cookie", dummyRecoveryFlowCookie);
  } catch {
    // A resposta pública permanece indistinguível sem expor a falha.
  }

  return res.status(202).end();
}

function getPasswordRecoveryEmailService() {
  if (passwordRecoveryEmailService) {
    return passwordRecoveryEmailService;
  }

  const smtpUrl = process.env.CASEG_RECOVERY_SMTP_URL;
  const fromAddress = process.env.CASEG_RECOVERY_EMAIL_FROM;
  const configurationErrorMessage =
    "Password recovery email service is not configured correctly.";

  if (
    typeof smtpUrl !== "string" ||
    smtpUrl.trim().length === 0 ||
    typeof fromAddress !== "string" ||
    fromAddress.trim().length === 0
  ) {
    throw new Error(configurationErrorMessage);
  }

  let parsedSmtpUrl;

  try {
    parsedSmtpUrl = new URL(smtpUrl);
  } catch {
    throw new Error(configurationErrorMessage);
  }

  if (
    parsedSmtpUrl.protocol !== "smtp:" &&
    parsedSmtpUrl.protocol !== "smtps:"
  ) {
    throw new Error(configurationErrorMessage);
  }

  parsedSmtpUrl.searchParams.set("logger", "false");
  parsedSmtpUrl.searchParams.set("debug", "false");

  const nodemailer = require("nodemailer");
  const transport = nodemailer.createTransport(
    parsedSmtpUrl.toString()
  );

  passwordRecoveryEmailService =
    createPasswordRecoveryEmailService({
      transport,
      fromAddress
    });

  return passwordRecoveryEmailService;
}

function createLoginIdentityKey(ip, cpfCnpj) {
  const fiscalIdentity = normalizeFiscalIdentity(cpfCnpj);
  const rateLimitIdentity =
    fiscalIdentity.canonical || "INVALID_FISCAL_IDENTITY";
  const identifierHmac = crypto
    .createHmac("sha256", loginIdentifierHmacSecret)
    .update(rateLimitIdentity)
    .digest("hex");

  return `ip:${ip}|id:${identifierHmac}`;
}

function getActiveLoginRateLimitEntry(entries, key, now = Date.now()) {
  const entry = entries.get(key);

  if (!entry) {
    return null;
  }

  if (entry.resetAt <= now) {
    entries.delete(key);
    return null;
  }

  return entry;
}

function getOrCreateLoginRateLimitEntry(entries, key, now = Date.now()) {
  const activeEntry = getActiveLoginRateLimitEntry(entries, key, now);

  if (activeEntry) {
    return activeEntry;
  }

  const newEntry = {
    count: 0,
    resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS
  };

  entries.set(key, newEntry);
  return newEntry;
}

function consumeLoginIpRequest(ip, now = Date.now()) {
  const entry = getOrCreateLoginRateLimitEntry(
    loginIpRequestEntries,
    ip,
    now
  );

  entry.count += 1;

  return {
    blocked: entry.count > LOGIN_IP_REQUEST_LIMIT,
    resetAt: entry.resetAt
  };
}

function consumeRecoveryRequestIp(ip, now = Date.now()) {
  if (typeof ip !== "string" || ip.length === 0) {
    throw new TypeError("Recovery request IP key is invalid.");
  }

  let entry = recoveryRequestIpAttempts.get(ip);

  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + RECOVERY_REQUEST_IP_WINDOW_MS
    };
    recoveryRequestIpAttempts.set(ip, entry);
  }

  entry.count += 1;

  return {
    allowed: entry.count <= RECOVERY_REQUEST_IP_MAX,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000)
    )
  };
}

function cleanupRecoveryRequestIpAttempts(now = Date.now()) {
  for (const [ip, entry] of recoveryRequestIpAttempts) {
    if (entry.resetAt <= now) {
      recoveryRequestIpAttempts.delete(ip);
    }
  }
}

function getLoginIdentityFailureLimit(key, now = Date.now()) {
  const entry = getActiveLoginRateLimitEntry(
    loginIdentityFailureEntries,
    key,
    now
  );

  return {
    blocked: Boolean(entry && entry.count >= LOGIN_IDENTITY_FAILURE_LIMIT),
    resetAt: entry?.resetAt || null
  };
}

function recordLoginIdentityFailure(key, now = Date.now()) {
  const entry = getOrCreateLoginRateLimitEntry(
    loginIdentityFailureEntries,
    key,
    now
  );

  entry.count += 1;
}

function getLoginRetryAfterSeconds(resetAt, now = Date.now()) {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

function sendLoginRateLimitResponse(res, resetAt) {
  res.setHeader(
    "Retry-After",
    String(getLoginRetryAfterSeconds(resetAt))
  );

  return res.status(429).json({
    error: LOGIN_RATE_LIMIT_ERROR_MESSAGE
  });
}

function cleanupExpiredLoginRateLimitEntries(now = Date.now()) {
  for (const entries of [
    loginIpRequestEntries,
    loginIdentityFailureEntries
  ]) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
  }
}

const loginRateLimitCleanupTimer = setInterval(
  cleanupExpiredLoginRateLimitEntries,
  LOGIN_RATE_LIMIT_CLEANUP_INTERVAL_MS
);

if (typeof loginRateLimitCleanupTimer.unref === "function") {
  loginRateLimitCleanupTimer.unref();
}

const recoveryRequestIpCleanupTimer = setInterval(() => {
  cleanupRecoveryRequestIpAttempts(Date.now());
}, RECOVERY_REQUEST_IP_CLEANUP_INTERVAL_MS);

if (typeof recoveryRequestIpCleanupTimer.unref === "function") {
  recoveryRequestIpCleanupTimer.unref();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

const BANNER_ASPECT_RATIO_WIDTH = 16;
const BANNER_ASPECT_RATIO_HEIGHT = 5;
const BANNER_FINAL_WIDTH = 1920;
const BANNER_FINAL_HEIGHT = 600;
const BANNER_WEBP_QUALITY = 82;

function isAllowedBannerAspectRatio(width, height) {
  const normalizedWidth = Number(width || 0);
  const normalizedHeight = Number(height || 0);

  if (!normalizedWidth || !normalizedHeight) {
    return false;
  }

  return (
    normalizedWidth * BANNER_ASPECT_RATIO_HEIGHT ===
    normalizedHeight * BANNER_ASPECT_RATIO_WIDTH
  );
}

function getBannerSizeErrorMessage() {
  return "A imagem do banner precisa estar na proporção 16:5. Exemplos aceitos: 5120x1600, 3200x1000, 2560x800, 1920x600 ou 1600x500.";
}

function getBannerOptimizedFileName(originalName) {
  const sanitizedFileName = sanitizeFileName(originalName);
  const fileNameWithoutExtension =
    sanitizedFileName.replace(/\.[^.]+$/, "") || "banner";

  return `${fileNameWithoutExtension}.webp`;
}

async function prepareBannerImageForStorage(image) {
  try {
    if (!image?.buffer) {
      return {
        valid: false,
        error: "Nenhuma imagem foi enviada."
      };
    }

    const metadata = await sharp(image.buffer).metadata();

    const width = Number(metadata?.width || 0);
    const height = Number(metadata?.height || 0);

    if (!width || !height) {
      return {
        valid: false,
        error: "Não foi possível identificar a resolução da imagem. Use PNG, JPG, JPEG ou WEBP na proporção 16:5."
      };
    }

    if (!isAllowedBannerAspectRatio(width, height)) {
      return {
        valid: false,
        error: `${getBannerSizeErrorMessage()} Resolução enviada: ${width}x${height}px.`
      };
    }

    const optimizedBuffer = await sharp(image.buffer)
      .resize(BANNER_FINAL_WIDTH, BANNER_FINAL_HEIGHT, {
        fit: "fill"
      })
      .webp({
        quality: BANNER_WEBP_QUALITY
      })
      .toBuffer();

    return {
      valid: true,
      dimensions: {
        width,
        height
      },
      buffer: optimizedBuffer,
      contentType: "image/webp"
    };
  } catch (error) {
    console.error("ERRO AO VALIDAR/OTIMIZAR BANNER:", error);

    return {
      valid: false,
      error: "Não foi possível validar e otimizar a imagem. Use PNG, JPG, JPEG ou WEBP na proporção 16:5."
    };
  }
}

function extractBannerStoragePathFromUrl(imageUrl) {
  if (!imageUrl) return null;

  const marker = "/storage/v1/object/public/banners/";
  const splitPath = String(imageUrl).split(marker);

  return splitPath.length > 1 ? splitPath[1] : null;
}

async function getAuthenticatedUser(req) {
  try {
    const authHeader = req.headers.authorization;

    console.log("AUTH HEADER RECEBIDO:", authHeader ? "SIM" : "NÃO");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        error: "Token não informado.",
        status: 401
      };
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return {
        error: "Token inválido.",
        status: 401
      };
    }

    console.log("TOKEN RECEBIDO NO BACKEND:", token ? "SIM" : "NÃO");

    const { data, error } = await publicSupabase.auth.getUser(token);

    console.log("ERRO getUser:", error);

    if (error || !data || !data.user) {
      return {
        error: "Usuário não autenticado.",
        status: 401
      };
    }

    return {
      user: data.user,
      accessToken: token
    };
  } catch (err) {
    console.error("ERRO EM getAuthenticatedUser:", err);

    return {
      error: "Erro ao validar autenticação.",
      status: 500
    };
  }
}

async function getUserProfile(userId) {
  try {
    const { data, error } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return {
        error: "Perfil não encontrado.",
        status: 404
      };
    }

    return { profile: data };
  } catch (err) {
    console.error("ERRO EM getUserProfile:", err);

    return {
      error: "Erro ao buscar perfil do usuário.",
      status: 500
    };
  }
}

async function getClientSessionProfile(userId) {
  const { data, error } = await adminSupabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      error: "Erro ao buscar perfil do usuário.",
      status: 502
    };
  }

  if (!data) {
    return {
      error: "Perfil não encontrado.",
      status: 404
    };
  }

  return { profile: data };
}

async function validateAdminAccess(req, res) {
  const authResult = await getAuthenticatedUser(req);

  if (authResult.error) {
    res.status(authResult.status).json({
      error: authResult.error
    });
    return null;
  }

  const adminUserId = authResult.user.id;
  const profileResult = await getUserProfile(adminUserId);

  if (profileResult.error) {
    res.status(profileResult.status).json({
      error: profileResult.error
    });
    return null;
  }

  const adminProfile = profileResult.profile;

  if (adminProfile.role !== "admin") {
    res.status(403).json({
      error: "Acesso restrito a administradores."
    });
    return null;
  }

  return {
    adminUser: authResult.user,
    adminProfile
  };
}

async function requireAdminAccess(req, res, next) {
  const adminAccess = await validateAdminAccess(req, res);

  if (!adminAccess || res.headersSent) {
    return;
  }

  req.adminAccess = adminAccess;
  next();
}

function generateTemporaryPassword() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let random = "";

  for (let index = 0; index < 10; index += 1) {
    random += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return `Caseg@${random}1`;
}

function createTemporaryPasswordExpiresAt(nowMs = Date.now()) {
  return new Date(nowMs + TEMPORARY_PASSWORD_TTL_MS).toISOString();
}

function isTemporaryPasswordExpired(profile, nowMs = Date.now()) {
  if (
    profile?.role !== "client" ||
    profile.must_change_password !== true
  ) {
    return false;
  }

  const expiresAt = profile.temporary_password_expires_at;

  if (typeof expiresAt !== "string" || expiresAt.trim().length === 0) {
    return true;
  }

  const expirationMs = Date.parse(expiresAt);

  if (!Number.isFinite(nowMs) || !Number.isFinite(expirationMs)) {
    return true;
  }

  return nowMs >= expirationMs;
}

function normalizeUuid(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      normalizedValue
    )
  ) {
    return null;
  }

  return normalizedValue;
}

function extractSessionIdFromAccessToken(accessToken) {
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return null;
  }

  const tokenParts = accessToken.split(".");

  if (
    tokenParts.length !== 3 ||
    tokenParts.some((tokenPart) => tokenPart.length === 0)
  ) {
    return null;
  }

  try {
    const payloadJson = Buffer.from(tokenParts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    return normalizeUuid(payload.session_id);
  } catch {
    return null;
  }
}

async function signOutAuthenticatedClientSession(accessToken) {
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return;
  }

  try {
    const { error } =
      await adminSupabase.auth.admin.signOut(accessToken, "local");

    if (error) {
      console.error("ERRO AO ENCERRAR SESSÃO DE PRIMEIRO ACESSO.");
    }
  } catch {
    console.error("ERRO AO ENCERRAR SESSÃO DE PRIMEIRO ACESSO.");
  }
}

function getProfileForResponse(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return profile;
  }

  const responseProfile = { ...profile };
  delete responseProfile.temporary_password_session_id;
  delete responseProfile.temporary_password_generation_id;
  return responseProfile;
}

async function compareAndSetFirstAccessProfile({
  userId,
  expectedGenerationId,
  expectedExpiresAt,
  expectedSessionId,
  updates,
  unexpiredAfter = null,
  selectColumns = "user_id"
}) {
  let query = adminSupabase
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .eq("role", "client")
    .eq("is_active", true)
    .eq("must_change_password", true)
    .eq("temporary_password_expires_at", expectedExpiresAt);

  if (expectedGenerationId === null) {
    query = query.is("temporary_password_generation_id", null);
  } else {
    query = query.eq(
      "temporary_password_generation_id",
      expectedGenerationId
    );
  }

  if (expectedSessionId === null) {
    query = query.is("temporary_password_session_id", null);
  } else {
    query = query.eq("temporary_password_session_id", expectedSessionId);
  }

  if (typeof unexpiredAfter === "string") {
    query = query.gt("temporary_password_expires_at", unexpiredAfter);
  }

  return query
    .select(selectColumns)
    .maybeSingle();
}

function sanitizeFileName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeText(value) {
  return value ? String(value).trim() : "";
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeGroupText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function createLocalDateFromDateOnly(value) {
  const normalized = String(value || "").trim().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function normalizeDateInput(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const date = createLocalDateFromDateOnly(normalized);

  if (!date) {
    return null;
  }

  return normalized.slice(0, 10);
}

function isExpirationDateBeforeReleaseDate(releaseDate, expirationDate) {
  if (!releaseDate || !expirationDate) {
    return false;
  }

  const release = createLocalDateFromDateOnly(releaseDate);
  const expiration = createLocalDateFromDateOnly(expirationDate);

  if (!release || !expiration) {
    return false;
  }

  return expiration < release;
}

function getStartOfTodayLocal() {
  const today = new Date();

  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
}

function getDaysUntilExpiration(expirationDateValue) {
  const expirationDate = createLocalDateFromDateOnly(expirationDateValue);

  if (!expirationDate) {
    return null;
  }

  const today = getStartOfTodayLocal();

  return Math.round((expirationDate.getTime() - today.getTime()) / ONE_DAY_IN_MS);
}

function getRenewalStatusInfo(expirationDateValue) {
  const daysUntilExpiration = getDaysUntilExpiration(expirationDateValue);

  if (daysUntilExpiration === null) {
    return null;
  }

  if (daysUntilExpiration < 0) {
    const overdueDays = Math.abs(daysUntilExpiration);

    return {
      status: "expired",
      days_until_expiration: daysUntilExpiration,
      deadline_label: overdueDays === 1 ? "Vencido há 1 dia" : `Vencido há ${overdueDays} dias`,
      observation: "Renovação urgente"
    };
  }

  if (daysUntilExpiration === 0) {
    return {
      status: "due_today",
      days_until_expiration: daysUntilExpiration,
      deadline_label: "Vence hoje",
      observation: "Renovar hoje"
    };
  }

  return {
    status: "due_soon",
    days_until_expiration: daysUntilExpiration,
    deadline_label: daysUntilExpiration === 1 ? "Vence em 1 dia" : `Vence em ${daysUntilExpiration} dias`,
    observation: daysUntilExpiration <= 15 ? "Renovação próxima" : "Programar renovação"
  };
}

function getDocumentGroupKey(documentItem) {
  const clientId = String(documentItem?.client_id || "").trim();
  const category = normalizeGroupText(documentItem?.category || "");
  const subcategory = normalizeGroupText(documentItem?.subcategory || "__sem_subcategoria__");

  return `${clientId}|${category}|${subcategory}`;
}

function getDateTimestampForComparison(value) {
  const date = createLocalDateFromDateOnly(value);

  return date ? date.getTime() : 0;
}

function compareDocumentsByLatest(nextDocument, currentDocument) {
  const nextExpiration = getDateTimestampForComparison(nextDocument?.expiration_date);
  const currentExpiration = getDateTimestampForComparison(currentDocument?.expiration_date);

  if (nextExpiration !== currentExpiration) {
    return nextExpiration - currentExpiration;
  }

  const nextRelease = getDateTimestampForComparison(nextDocument?.release_date);
  const currentRelease = getDateTimestampForComparison(currentDocument?.release_date);

  if (nextRelease !== currentRelease) {
    return nextRelease - currentRelease;
  }

  const nextYear = Number(nextDocument?.year || 0);
  const currentYear = Number(currentDocument?.year || 0);

  if (nextYear !== currentYear) {
    return nextYear - currentYear;
  }

  const nextCreatedAt = new Date(nextDocument?.created_at || 0).getTime();
  const currentCreatedAt = new Date(currentDocument?.created_at || 0).getTime();

  return nextCreatedAt - currentCreatedAt;
}

function validateStrongPassword(password) {
  const normalizedPassword = String(password || "").trim();

  return {
    minLength: normalizedPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(normalizedPassword),
    hasNumber: /\d/.test(normalizedPassword)
  };
}

function isStrongPassword(password) {
  const validation = validateStrongPassword(password);
  return validation.minLength && validation.hasUppercase && validation.hasNumber;
}

function isValidBannerActionType(value) {
  return ["modal", "link"].includes(String(value || "").trim());
}

function isValidBannerLinkTarget(value) {
  return ["contato", "servicos", "whatsapp", "custom"].includes(String(value || "").trim());
}

function isValidBannerCustomLink(value) {
  const normalizedValue = String(value || "").trim();

  if (!/^https?:\/\//i.test(normalizedValue)) {
    return false;
  }

  try {
    const parsedUrl = new URL(normalizedValue);

    return (
      ["http:", "https:"].includes(parsedUrl.protocol) &&
      Boolean(parsedUrl.hostname)
    );
  } catch {
    return false;
  }
}

async function findDuplicateDocument({ clientId, category, subcategory, year, fileName }) {
  let query = adminSupabase
    .from("documents")
    .select("id")
    .eq("client_id", clientId)
    .eq("category", category)
    .eq("year", year)
    .eq("file_name", fileName);

  if (subcategory) {
    query = query.eq("subcategory", subcategory);
  } else {
    query = query.is("subcategory", null);
  }

  return query.maybeSingle();
}

async function removeStorageFiles(bucketName, filePaths) {
  const cleanedPaths = (filePaths || [])
    .map((path) => String(path || "").trim())
    .filter(Boolean);

  if (!cleanedPaths.length) {
    return null;
  }

  const { error } = await adminSupabase.storage
    .from(bucketName)
    .remove(cleanedPaths);

  return error || null;
}

async function getNextNoticeDisplayOrder() {
  const { data, error } = await adminSupabase
    .from("notices")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Number(data?.display_order || 0) + 1;
}

function getClientDisplayName(client) {
  return (
    normalizeText(client?.company_name) ||
    normalizeText(client?.full_name) ||
    "Cliente não identificado"
  );
}

function getDocumentDescription(documentItem) {
  const parts = [
    normalizeText(documentItem?.category),
    normalizeText(documentItem?.subcategory),
    normalizeText(documentItem?.year)
  ].filter(Boolean);

  const documentContext = parts.length ? parts.join(" / ") : "Documento";
  const fileName = normalizeText(documentItem?.file_name);

  return fileName ? `${documentContext} — ${fileName}` : documentContext;
}

async function getClientBasicInfo(clientId) {
  const normalizedClientId = normalizeText(clientId);

  if (!normalizedClientId) {
    return null;
  }

  const { data, error } = await adminSupabase
    .from("profiles")
    .select("user_id, full_name, company_name, role")
    .eq("user_id", normalizedClientId)
    .eq("role", "client")
    .maybeSingle();

  if (error) {
    console.error("ERRO AO BUSCAR CLIENTE PARA ATIVIDADE:", error);
    return null;
  }

  return data || null;
}

function getAdminActivityRetentionCutoffDate() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ADMIN_ACTIVITY_RETENTION_DAYS);

  return cutoffDate;
}

function getAdminActivityRetentionCutoffIso() {
  return getAdminActivityRetentionCutoffDate().toISOString();
}

function removeAdminPanelReference(value) {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  return text
    .replace(/\s+(no|do)\s+painel\s+administrativo\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function sanitizeAdminActivity(activity) {
  if (!activity || typeof activity !== "object") {
    return activity;
  }

  return {
    ...activity,
    title: removeAdminPanelReference(activity.title) || activity.title,
    description: removeAdminPanelReference(activity.description)
  };
}

async function cleanupOldAdminActivities() {
  const cutoffIso = getAdminActivityRetentionCutoffIso();

  const { error } = await adminSupabase
    .from("admin_activities")
    .delete()
    .lt("created_at", cutoffIso);

  if (error) {
    console.error("ERRO AO LIMPAR ATIVIDADES ANTIGAS:", error);
    return {
      success: false,
      cutoffIso,
      error
    };
  }

  return {
    success: true,
    cutoffIso
  };
}

async function cleanupOldAdminActivitiesSilently() {
  try {
    return await cleanupOldAdminActivities();
  } catch (error) {
    console.error("ERRO INESPERADO AO LIMPAR ATIVIDADES ANTIGAS:", error);

    return {
      success: false,
      cutoffIso: getAdminActivityRetentionCutoffIso(),
      error
    };
  }
}

function scheduleAdminActivityCleanup() {
  cleanupOldAdminActivitiesSilently();

  setInterval(() => {
    cleanupOldAdminActivitiesSilently();
  }, ADMIN_ACTIVITY_CLEANUP_INTERVAL_MS);
}

async function registerAdminActivity({
  actionType,
  title,
  description = null,
  entityType,
  entityId = null,
  clientId = null,
  clientName = null,
  metadata = {}
}) {
  try {
    const normalizedActionType = normalizeText(actionType);
    const normalizedTitle = removeAdminPanelReference(title);
    const normalizedEntityType = normalizeText(entityType);

    if (!normalizedActionType || !normalizedTitle || !normalizedEntityType) {
      console.error("ATIVIDADE ADMIN NÃO REGISTRADA: dados obrigatórios ausentes.");
      return null;
    }

    await cleanupOldAdminActivitiesSilently();

    const { data, error } = await adminSupabase
      .from("admin_activities")
      .insert({
        action_type: normalizedActionType,
        title: normalizedTitle,
        description: removeAdminPanelReference(description),
        entity_type: normalizedEntityType,
        entity_id: entityId ? String(entityId) : null,
        client_id: clientId ? String(clientId) : null,
        client_name: normalizeOptionalText(clientName),
        metadata: metadata && typeof metadata === "object" ? metadata : {}
      })
      .select(`
        id,
        action_type,
        title,
        description,
        entity_type,
        entity_id,
        client_id,
        client_name,
        metadata,
        created_at
      `)
      .single();

    if (error) {
      console.error("ERRO AO REGISTRAR ATIVIDADE ADMIN:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("ERRO INESPERADO AO REGISTRAR ATIVIDADE ADMIN:", error);
    return null;
  }
}

async function registerSystemEvent({
  eventType,
  userId = null,
  clientId = null,
  documentId = null,
  page = null,
  metadata = {}
}) {
  try {
    const normalizedEventType = normalizeText(eventType);

    if (!normalizedEventType) {
      return null;
    }

    const { data, error } = await adminSupabase
      .from("system_events")
      .insert({
        event_type: normalizedEventType,
        user_id: userId ? String(userId) : null,
        client_id: clientId ? String(clientId) : null,
        document_id: documentId ? String(documentId) : null,
        page: normalizeOptionalText(page),
        metadata: metadata && typeof metadata === "object" ? metadata : {}
      })
      .select("id, event_type, user_id, client_id, document_id, page, metadata, created_at")
      .single();

    if (error) {
      console.error("ERRO AO REGISTRAR EVENTO DO SISTEMA:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("ERRO INESPERADO AO REGISTRAR EVENTO DO SISTEMA:", error);
    return null;
  }
}

function getCurrentMonthStartIso() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  return monthStart.toISOString();
}
async function getTableCount(tableName, applyQuery) {
  let query = adminSupabase
    .from(tableName)
    .select("*", { count: "exact", head: true });

  if (typeof applyQuery === "function") {
    query = applyQuery(query);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

app.get("/", (req, res) => {
  res.send("Servidor Caseg Protege rodando 🚀");
});

app.get("/admin/activities", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const limit = Math.min(
      Math.max(Number(req.query.limit || 20), 1),
      50
    );

    const cleanupResult = await cleanupOldAdminActivities();
    const cutoffIso = cleanupResult?.cutoffIso || getAdminActivityRetentionCutoffIso();

    const { data, error } = await adminSupabase
      .from("admin_activities")
      .select(`
        id,
        action_type,
        title,
        description,
        entity_type,
        entity_id,
        client_id,
        client_name,
        metadata,
        created_at
      `)
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({
        error:
          error.message ||
          "Erro ao buscar atividades recentes."
      });
    }

    const sanitizedActivities = (data || []).map(sanitizeAdminActivity);

    return res.status(200).json(sanitizedActivities);
  } catch (error) {
    console.error("ERRO EM GET /admin/activities:", error);

    res.status(500).json({
      error: "Erro interno ao buscar atividades recentes."
    });
  }
});

app.get("/admin/dashboard/summary", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const monthStartIso = getCurrentMonthStartIso();

    const [
      totalDocuments,
      documentsThisMonth,
      clientsThisMonth,
      inactiveBanners,
      totalAccess,
      accessThisMonth,
      totalDocumentDownloads,
      documentDownloadsThisMonth
    ] = await Promise.all([
      getTableCount("documents"),
      getTableCount("documents", (query) => query.gte("created_at", monthStartIso)),
      getTableCount("profiles", (query) =>
        query.eq("role", "client").gte("created_at", monthStartIso)
      ),
      getTableCount("notices", (query) => query.eq("is_active", false)),
      getTableCount("system_events", (query) =>
        query.eq("event_type", "access").eq("page", "cliente")
      ),
      getTableCount("system_events", (query) =>
        query.eq("event_type", "access").eq("page", "cliente").gte("created_at", monthStartIso)
      ),
      getTableCount("system_events", (query) =>
        query.eq("event_type", "document_download").eq("page", "cliente")
      ),
      getTableCount("system_events", (query) =>
        query.eq("event_type", "document_download").eq("page", "cliente").gte("created_at", monthStartIso)
      )
    ]);

    return res.status(200).json({
      total_documents: totalDocuments,
      documents_this_month: documentsThisMonth,
      clients_this_month: clientsThisMonth,
      inactive_banners: inactiveBanners,
      total_access: totalAccess,
      access_this_month: accessThisMonth,
      total_document_downloads: totalDocumentDownloads,
      document_downloads_this_month: documentDownloadsThisMonth
    });
  } catch (error) {
    console.error("ERRO EM GET /admin/dashboard/summary:", error);

    res.status(500).json({
      error: "Erro interno ao buscar resumo do dashboard."
    });
  }
});

app.post("/password-recovery/request", async (req, res) => {
  const ipRequestLimit = consumeRecoveryRequestIp(req.ip);

  if (!ipRequestLimit.allowed) {
    return res.status(429).end();
  }

  const identity = req.body?.identity;

  if (typeof identity !== "string") {
    return res.status(400).end();
  }

  const fiscalIdentity = normalizeFiscalIdentity(identity);

  if (fiscalIdentity.state === "INVALID") {
    return res.status(400).end();
  }

  let recoveryFlowToken;

  try {
    recoveryFlowToken = createRecoveryFlowToken();
  } catch {
    return sendDummyPasswordRecoveryResponse(req, res);
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("user_id, role, is_active")
    .eq("cpf_cnpj", fiscalIdentity.canonical)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.role !== "client" ||
    profile.is_active !== true
  ) {
    return sendDummyPasswordRecoveryResponse(req, res);
  }

  let authUserResult;

  try {
    authUserResult =
      await adminSupabase.auth.admin.getUserById(profile.user_id);
  } catch {
    return sendDummyPasswordRecoveryResponse(req, res);
  }

  const authEmail = authUserResult.data?.user?.email;

  if (
    authUserResult.error ||
    typeof authEmail !== "string" ||
    authEmail.trim().length === 0
  ) {
    return sendDummyPasswordRecoveryResponse(req, res);
  }

  const recoveryEmail = authEmail.trim();

  let recoveryIdentityHmac;
  let recoveryFlowHash;

  try {
    recoveryIdentityHmac =
      createRecoveryIdentityHmac(fiscalIdentity.canonical);
    recoveryFlowHash = createRecoveryFlowHash(recoveryFlowToken);
  } catch {
    return sendDummyPasswordRecoveryResponse(req, res);
  }

  const recoveryExpiresAt = new Date(
    Date.now() + RECOVERY_FLOW_TTL_MS
  ).toISOString();

  let recoveryBeginRequest;

  try {
    const { data, error } = await adminSupabase
      .rpc("caseg_recovery_begin_request", {
        p_user_id: profile.user_id,
        p_flow_token_hash: recoveryFlowHash,
        p_identity_hmac: recoveryIdentityHmac,
        p_expires_at: recoveryExpiresAt
      })
      .single();

    if (error) {
      return sendDummyPasswordRecoveryResponse(req, res);
    }

    recoveryBeginRequest = data;
  } catch {
    return sendDummyPasswordRecoveryResponse(req, res);
  }

  if (
    !recoveryBeginRequest ||
    typeof recoveryBeginRequest !== "object" ||
    Array.isArray(recoveryBeginRequest) ||
    typeof recoveryBeginRequest.allowed !== "boolean" ||
    typeof recoveryBeginRequest.result_code !== "string"
  ) {
    return sendDummyPasswordRecoveryResponse(req, res);
  }

  switch (recoveryBeginRequest.result_code) {
    case "COOLDOWN":
    case "DAILY_LIMIT":
    case "BUSY":
    case "NOT_FOUND":
    case "INVALID_STATE":
      if (recoveryBeginRequest.allowed !== false) {
        return sendDummyPasswordRecoveryResponse(req, res);
      }

      return sendDummyPasswordRecoveryResponse(req, res);
    case "OK":
      if (recoveryBeginRequest.allowed !== true) {
        return sendDummyPasswordRecoveryResponse(req, res);
      }
      break;
    default:
      return sendDummyPasswordRecoveryResponse(req, res);
  }

  let recoveryEmailOtp;

  try {
    const { data, error } =
      await adminSupabase.auth.admin.generateLink({
        type: "recovery",
        email: recoveryEmail
      });

    recoveryEmailOtp = data?.properties?.email_otp;

    if (
      error ||
      typeof recoveryEmailOtp !== "string" ||
      recoveryEmailOtp.length === 0
    ) {
      recoveryEmailOtp = undefined;
    }
  } catch {
    recoveryEmailOtp = undefined;
  }

  if (typeof recoveryEmailOtp !== "string") {
    try {
      await adminSupabase
        .rpc("caseg_recovery_invalidate", {
          p_flow_token_hash: recoveryFlowHash
        })
        .single();
    } catch {
      return sendDummyPasswordRecoveryResponse(req, res);
    }

    return sendDummyPasswordRecoveryResponse(req, res);
  }

  let recoveryEmailDeliverySucceeded = false;

  try {
    const emailService = getPasswordRecoveryEmailService();
    const deliveryResult =
      await emailService.sendPasswordRecoveryCode({
        recipient: recoveryEmail,
        code: recoveryEmailOtp
      });
    const deliveryResultKeys =
      deliveryResult &&
      typeof deliveryResult === "object" &&
      !Array.isArray(deliveryResult)
        ? Object.keys(deliveryResult)
        : [];

    recoveryEmailDeliverySucceeded =
      deliveryResultKeys.length === 1 &&
      deliveryResultKeys[0] === "ok" &&
      deliveryResult.ok === true;
  } catch {
    recoveryEmailDeliverySucceeded = false;
  }

  if (!recoveryEmailDeliverySucceeded) {
    try {
      await adminSupabase
        .rpc("caseg_recovery_invalidate", {
          p_flow_token_hash: recoveryFlowHash
        })
        .single();
    } catch {
      return sendDummyPasswordRecoveryResponse(req, res);
    }

    return sendDummyPasswordRecoveryResponse(req, res);
  }

  try {
    const recoveryFlowCookie = serializeRecoveryFlowCookie(
      recoveryFlowToken,
      {
        secure: shouldUseSecureRecoveryCookie(req)
      }
    );

    res.setHeader("Set-Cookie", recoveryFlowCookie);
  } catch {
    try {
      await adminSupabase
        .rpc("caseg_recovery_invalidate", {
          p_flow_token_hash: recoveryFlowHash
        })
        .single();
    } catch {
      return sendDummyPasswordRecoveryResponse(req, res);
    }

    return sendDummyPasswordRecoveryResponse(req, res);
  }

  return res.status(202).end();
});

app.post("/password-recovery/verify", async (req, res) => {
  const recoveryCode = getPasswordRecoveryVerificationCode(
    req.body?.code
  );

  if (recoveryCode === null) {
    return res.status(400).end();
  }

  function tryExpireRecoveryFlowCookie() {
    try {
      res.setHeader(
        "Set-Cookie",
        serializeExpiredRecoveryFlowCookie(req)
      );
    } catch {
      // A resposta pública permanece fechada se o cookie não puder ser limpo.
    }
  }

  async function tryInvalidateRecoveryFlow(flowHash) {
    try {
      await adminSupabase
        .rpc("caseg_recovery_invalidate", {
          p_flow_token_hash: flowHash
        })
        .single();
    } catch {
      // A resposta pública não expõe a falha da compensação.
    }
  }

  const recoveryFlowToken = getRecoveryFlowCookie(req);

  if (recoveryFlowToken === null) {
    tryExpireRecoveryFlowCookie();
    return res.status(400).end();
  }

  let oldFlowHash;

  try {
    oldFlowHash = createRecoveryFlowHash(recoveryFlowToken);
  } catch {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  let preparationResult;

  try {
    preparationResult =
      await preparePasswordRecoveryVerification(oldFlowHash);
  } catch {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  if (preparationResult?.state === "FLOW_REJECTED") {
    tryExpireRecoveryFlowCookie();
    return res.status(400).end();
  }

  if (preparationResult?.state !== "PREPARED") {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  let otpVerificationState;

  try {
    otpVerificationState = await verifyPasswordRecoveryOtp(
      preparationResult.userId,
      recoveryCode
    );
  } catch {
    otpVerificationState = "TECHNICAL_FAILURE";
  }

  if (otpVerificationState === "OTP_REJECTED") {
    return res.status(400).end();
  }

  if (otpVerificationState !== "VERIFIED") {
    await tryInvalidateRecoveryFlow(oldFlowHash);
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  let rotationResult;

  try {
    rotationResult =
      await rotateVerifiedPasswordRecoveryFlow(oldFlowHash);
  } catch {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  if (rotationResult?.state === "FLOW_REJECTED") {
    tryExpireRecoveryFlowCookie();
    return res.status(400).end();
  }

  if (rotationResult?.state !== "ROTATED") {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  const newFlowToken = rotationResult.newFlowToken;

  try {
    const verifiedRecoveryFlowCookie = serializeRecoveryFlowCookie(
      newFlowToken,
      {
        secure: shouldUseSecureRecoveryCookie(req),
        ttlMs: RECOVERY_VERIFIED_FLOW_TTL_MS
      }
    );

    res.setHeader("Set-Cookie", verifiedRecoveryFlowCookie);
  } catch {
    try {
      const newFlowHash = createRecoveryFlowHash(newFlowToken);
      await tryInvalidateRecoveryFlow(newFlowHash);
    } catch {
      // O cookie ainda deve ser limpo e a resposta permanecer fechada.
    }

    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  return res.status(204).end();
});

app.post("/password-recovery/reset", async (req, res) => {
  const rawPassword = req.body?.password;

  if (typeof rawPassword !== "string") {
    return res.status(400).end();
  }

  const normalizedPassword = normalizeText(rawPassword);

  if (!normalizedPassword || !isStrongPassword(normalizedPassword)) {
    return res.status(400).end();
  }

  function tryExpireRecoveryFlowCookie() {
    try {
      res.setHeader(
        "Set-Cookie",
        serializeExpiredRecoveryFlowCookie(req)
      );
      return true;
    } catch {
      return false;
    }
  }

  const recoveryFlowToken = getRecoveryFlowCookie(req);

  if (recoveryFlowToken === null) {
    tryExpireRecoveryFlowCookie();
    return res.status(400).end();
  }

  let recoveryFlowHash;

  try {
    recoveryFlowHash = createRecoveryFlowHash(recoveryFlowToken);
  } catch {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  let claimResult;

  try {
    claimResult = await claimPasswordRecoveryReset(recoveryFlowHash);
  } catch {
    claimResult = { state: "TECHNICAL_FAILURE" };
  }

  if (claimResult?.state === "FLOW_REJECTED") {
    tryExpireRecoveryFlowCookie();
    return res.status(400).end();
  }

  if (claimResult?.state === "BUSY") {
    tryExpireRecoveryFlowCookie();
    return res.status(409).end();
  }

  if (claimResult?.state !== "CLAIMED") {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  const { userId, resetStartedAt } = claimResult;
  let authUpdateResult;

  try {
    authUpdateResult =
      await adminSupabase.auth.admin.updateUserById(userId, {
        password: normalizedPassword
      });
  } catch {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  if (
    !authUpdateResult ||
    typeof authUpdateResult !== "object" ||
    authUpdateResult.error !== null ||
    !authUpdateResult.data ||
    typeof authUpdateResult.data !== "object" ||
    Array.isArray(authUpdateResult.data) ||
    !authUpdateResult.data.user ||
    typeof authUpdateResult.data.user !== "object" ||
    Array.isArray(authUpdateResult.data.user) ||
    authUpdateResult.data.user.id !== userId
  ) {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  let markUsedResult;

  try {
    markUsedResult = await markPasswordRecoveryResetUsed(
      recoveryFlowHash,
      resetStartedAt
    );
  } catch {
    markUsedResult = { state: "TECHNICAL_FAILURE" };
  }

  if (markUsedResult?.state === "TECHNICAL_FAILURE") {
    try {
      markUsedResult = await markPasswordRecoveryResetUsed(
        recoveryFlowHash,
        resetStartedAt
      );
    } catch {
      markUsedResult = { state: "TECHNICAL_FAILURE" };
    }
  }

  if (markUsedResult?.state !== "USED") {
    tryExpireRecoveryFlowCookie();
    return res.status(503).end();
  }

  if (!tryExpireRecoveryFlowCookie()) {
    return res.status(503).end();
  }

  return res.status(204).end();
});

app.post("/login", async (req, res) => {
  try {
    expireClientRefreshCookie(res);

    const loginIp = getLoginRequestIp(req);
    const ipRequestLimit = consumeLoginIpRequest(loginIp);

    if (ipRequestLimit.blocked) {
      return sendLoginRateLimitResponse(res, ipRequestLimit.resetAt);
    }

    const rawCpfCnpj = req.body.cpf_cnpj;
    const password = normalizeText(req.body.password);

    if (
      rawCpfCnpj === undefined ||
      rawCpfCnpj === null ||
      (typeof rawCpfCnpj === "string" && !rawCpfCnpj.trim()) ||
      !password
    ) {
      return res.status(400).json({
        error: "CPF/CNPJ e senha são obrigatórios."
      });
    }

    const fiscalIdentity = normalizeFiscalIdentity(rawCpfCnpj);
    const loginIdentityKey = createLoginIdentityKey(loginIp, rawCpfCnpj);
    const identityFailureLimit =
      getLoginIdentityFailureLimit(loginIdentityKey);

    if (identityFailureLimit.blocked) {
      return sendLoginRateLimitResponse(
        res,
        identityFailureLimit.resetAt
      );
    }

    if (fiscalIdentity.state === "INVALID") {
      recordLoginIdentityFailure(loginIdentityKey);

      return res.status(401).json({
        error: "CPF/CNPJ ou senha inválidos."
      });
    }

    const cpf_cnpj = fiscalIdentity.canonical;

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("cpf_cnpj", cpf_cnpj)
      .single();

    if (profileError || !profile) {
      recordLoginIdentityFailure(loginIdentityKey);

      return res.status(401).json({
        error: "CPF/CNPJ ou senha inválidos."
      });
    }

    if (profile.role === "client" && profile.is_active !== true) {
      recordLoginIdentityFailure(loginIdentityKey);

      return res.status(401).json({
        error: "CPF/CNPJ ou senha inválidos."
      });
    }

    const loginSupabase = createClientSessionAuthClient();
    const { data: loginData, error: loginError } =
      await loginSupabase.auth.signInWithPassword({
        email: profile.email,
        password
      });

    if (loginError || !loginData?.session) {
      recordLoginIdentityFailure(loginIdentityKey);

      return res.status(401).json({
        error: "CPF/CNPJ ou senha inválidos."
      });
    }

    loginIdentityFailureEntries.delete(loginIdentityKey);

    if (isTemporaryPasswordExpired(profile)) {
      try {
        const { error: expiredSessionSignOutError } =
          await adminSupabase.auth.admin.signOut(
            loginData.session.access_token,
            "local"
          );

        if (expiredSessionSignOutError) {
          console.error(
            "ERRO AO ENCERRAR SESSÃO DE SENHA TEMPORÁRIA EXPIRADA."
          );
        }
      } catch {
        console.error(
          "ERRO AO ENCERRAR SESSÃO DE SENHA TEMPORÁRIA EXPIRADA."
        );
      }

      return res.status(403).json({
        error: TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
        code: TEMPORARY_PASSWORD_EXPIRED_CODE
      });
    }

    if (
      profile.role === "client" &&
      profile.must_change_password === true
    ) {
      const observedGenerationId = normalizeUuid(
        profile.temporary_password_generation_id
      );
      const rawObservedSessionId =
        profile.temporary_password_session_id;
      const observedSessionId =
        rawObservedSessionId === null
          ? null
          : normalizeUuid(rawObservedSessionId);
      const newSessionId = extractSessionIdFromAccessToken(
        loginData.session.access_token
      );

      if (
        !observedGenerationId ||
        (rawObservedSessionId !== null && !observedSessionId) ||
        !newSessionId
      ) {
        await signOutAuthenticatedClientSession(
          loginData.session.access_token
        );

        return res.status(403).json({
          error: FIRST_ACCESS_SESSION_INVALID_MESSAGE,
          code: FIRST_ACCESS_SESSION_INVALID_CODE
        });
      }

      const { data: sessionBinding, error: sessionBindingError } =
        await compareAndSetFirstAccessProfile({
          userId: profile.user_id,
          expectedGenerationId: observedGenerationId,
          expectedExpiresAt: profile.temporary_password_expires_at,
          expectedSessionId: observedSessionId,
          updates: {
            temporary_password_session_id: newSessionId
          },
          unexpiredAfter: new Date().toISOString()
        });

      if (sessionBindingError) {
        await signOutAuthenticatedClientSession(
          loginData.session.access_token
        );

        return res.status(500).json({
          error: "Não foi possível concluir o login."
        });
      }

      if (!sessionBinding) {
        await signOutAuthenticatedClientSession(
          loginData.session.access_token
        );

        return res.status(409).json({
          error: FIRST_ACCESS_STATE_CHANGED_MESSAGE,
          code: FIRST_ACCESS_STATE_CHANGED_CODE
        });
      }
    }

    let responseSession = loginData.session;

    if (profile.role === "client") {
      const {
        refresh_token: clientRefreshToken,
        ...clientSession
      } = loginData.session;

      await registerSystemEvent({
        eventType: "access",
        userId: profile.user_id,
        clientId: profile.user_id,
        page: "cliente",
        metadata: {
          role: profile.role,
          company_name: profile.company_name || null,
          full_name: profile.full_name || null
        }
      });

      if (
        !setClientRefreshCookie(
          res,
          clientRefreshToken,
          loginData.session.expires_at
        )
      ) {
        return res.status(502).json({
          error: "Não foi possível concluir o login."
        });
      }

      responseSession = clientSession;
    }

    return res.status(200).json({
      message: "Login realizado com sucesso.",
      session: responseSession,
      profile: getProfileForResponse(profile)
    });
  } catch (error) {
    console.error("ERRO EM /login:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.post("/logout", async (req, res) => {
  try {
    expireClientRefreshCookie(res);

    const authHeader = req.headers.authorization;

    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Não foi possível encerrar a sessão."
      });
    }

    const accessToken = authHeader.slice("Bearer ".length).trim();

    if (!accessToken) {
      return res.status(401).json({
        error: "Não foi possível encerrar a sessão."
      });
    }

    const { error } =
      await adminSupabase.auth.admin.signOut(accessToken, "local");

    if (error) {
      const errorStatus = Number(error.status);
      const responseStatus =
        errorStatus >= 400 && errorStatus < 500 ? 401 : 502;

      return res.status(responseStatus).json({
        error: "Não foi possível encerrar a sessão."
      });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({
      error: "Não foi possível encerrar a sessão."
    });
  }
});

app.post("/admin/refresh-session", async (req, res) => {
  try {
    const refreshToken = normalizeText(req.body.refresh_token);

    if (!refreshToken) {
      return res.status(400).json({
        error: "Refresh token é obrigatório."
      });
    }

    const adminSessionSupabase = createClientSessionAuthClient();
    const { data, error } = await adminSessionSupabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data?.session?.access_token || !data?.user?.id) {
      return res.status(401).json({
        error: "Sessão expirada. Faça login novamente."
      });
    }

    const profileResult = await getUserProfile(data.user.id);

    if (profileResult.error) {
      return res.status(profileResult.status).json({
        error: profileResult.error
      });
    }

    const profile = profileResult.profile;

    if (profile.role !== "admin") {
      return res.status(403).json({
        error: "Acesso restrito a administradores."
      });
    }

    return res.status(200).json({
      message: "Sessão renovada com sucesso.",
      session: data.session,
      profile: getProfileForResponse(profile)
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/refresh-session:", error);

    res.status(500).json({
      error: "Erro interno ao renovar sessão."
    });
  }
});

app.post("/session/refresh", async (req, res) => {
  try {
    const clientRefreshToken = getClientRefreshCookie(req);

    if (!clientRefreshToken) {
      expireClientRefreshCookie(res);
      return res.status(401).json({
        error: "Sessão do cliente indisponível."
      });
    }

    const clientSessionAuth = createClientSessionAuthClient();
    const { data, error } = await clientSessionAuth.auth.refreshSession({
      refresh_token: clientRefreshToken
    });

    if (error) {
      if (isAuthRetryableFetchError(error)) {
        return res.status(502).json({
          error: "Não foi possível renovar a sessão."
        });
      }

      expireClientRefreshCookie(res);
      return res.status(401).json({
        error: "Sessão do cliente indisponível."
      });
    }

    const session = data?.session;
    const userId = data?.user?.id;
    const nowInSeconds = Date.now() / 1000;

    if (
      typeof userId !== "string" ||
      userId.length === 0 ||
      !session ||
      typeof session.access_token !== "string" ||
      session.access_token.length === 0 ||
      typeof session.refresh_token !== "string" ||
      session.refresh_token.length === 0 ||
      typeof session.token_type !== "string" ||
      session.token_type.length === 0 ||
      typeof session.expires_in !== "number" ||
      !Number.isFinite(session.expires_in) ||
      session.expires_in <= 0 ||
      typeof session.expires_at !== "number" ||
      !Number.isFinite(session.expires_at) ||
      session.expires_at <= nowInSeconds
    ) {
      expireClientRefreshCookie(res);
      return res.status(502).json({
        error: "Não foi possível renovar a sessão."
      });
    }

    const profileResult = await getClientSessionProfile(userId);

    if (profileResult.error) {
      expireClientRefreshCookie(res);
      if (profileResult.status === 404) {
        return res.status(401).json({
          error: "Sessão do cliente indisponível."
        });
      }

      return res.status(502).json({
        error: "Não foi possível renovar a sessão."
      });
    }

    const profile = profileResult.profile;

    if (profile.role !== "client" || profile.is_active !== true) {
      expireClientRefreshCookie(res);
      return res.status(401).json({
        error: "Sessão do cliente indisponível."
      });
    }

    if (isTemporaryPasswordExpired(profile)) {
      expireClientRefreshCookie(res);
      return res.status(403).json({
        error: TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
        code: TEMPORARY_PASSWORD_EXPIRED_CODE
      });
    }

    if (profile.must_change_password === true) {
      const profileGenerationId = normalizeUuid(
        profile.temporary_password_generation_id
      );
      const profileSessionId = normalizeUuid(
        profile.temporary_password_session_id
      );
      const refreshedSessionId = extractSessionIdFromAccessToken(
        session.access_token
      );

      if (
        !profileGenerationId ||
        !profileSessionId ||
        !refreshedSessionId ||
        refreshedSessionId !== profileSessionId
      ) {
        expireClientRefreshCookie(res);
        return res.status(403).json({
          error: FIRST_ACCESS_SESSION_INVALID_MESSAGE,
          code: FIRST_ACCESS_SESSION_INVALID_CODE
        });
      }
    }

    const cookieWasSet = setClientRefreshCookie(
      res,
      session.refresh_token,
      session.expires_at
    );

    if (!cookieWasSet) {
      expireClientRefreshCookie(res);
      return res.status(502).json({
        error: "Não foi possível renovar a sessão."
      });
    }

    return res.status(200).json({
      session: {
        access_token: session.access_token,
        token_type: session.token_type,
        expires_in: session.expires_in,
        expires_at: session.expires_at
      },
      profile: {
        role: profile.role,
        must_change_password: profile.must_change_password === true,
        full_name: profile.full_name || null,
        company_name: profile.company_name || null,
        email: profile.email || null
      }
    });
  } catch {
    expireClientRefreshCookie(res);
    return res.status(500).json({
      error: "Erro interno ao renovar a sessão."
    });
  }
});

app.put("/update-password", async (req, res) => {
  try {
    const authResult = await getAuthenticatedUser(req);

    if (authResult.error) {
      if (authResult.status === 401) {
        expireClientRefreshCookie(res);
      }

      return res.status(authResult.status).json({
        error: authResult.error
      });
    }

    const userId = authResult.user.id;
    const profileResult = await getUserProfile(userId);

    if (profileResult.error) {
      return res.status(403).json({
        error: "A troca de senha não está disponível para este usuário."
      });
    }

    const profile = profileResult.profile;

    if (
      profile.role !== "client" ||
      profile.is_active !== true ||
      profile.must_change_password !== true
    ) {
      return res.status(403).json({
        error: "A troca de senha não está disponível para este usuário."
      });
    }

    if (isTemporaryPasswordExpired(profile)) {
      expireClientRefreshCookie(res);
      return res.status(403).json({
        error: TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
        code: TEMPORARY_PASSWORD_EXPIRED_CODE
      });
    }

    const newPassword = normalizeText(req.body.new_password);

    if (!newPassword) {
      return res.status(400).json({
        error: "A nova senha é obrigatória."
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: "A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número."
      });
    }

    const expectedGenerationId = normalizeUuid(
      profile.temporary_password_generation_id
    );
    const expectedSessionId = normalizeUuid(
      profile.temporary_password_session_id
    );
    const accessTokenSessionId = extractSessionIdFromAccessToken(
      authResult.accessToken
    );

    if (
      !expectedGenerationId ||
      !expectedSessionId ||
      !accessTokenSessionId ||
      accessTokenSessionId !== expectedSessionId
    ) {
      expireClientRefreshCookie(res);
      return res.status(403).json({
        error: FIRST_ACCESS_SESSION_INVALID_MESSAGE,
        code: FIRST_ACCESS_SESSION_INVALID_CODE
      });
    }

    const casNowMs = Date.now();
    const lockExpiresAt = new Date(casNowMs - 1000).toISOString();
    const { data: acquiredProfile, error: acquireError } =
      await compareAndSetFirstAccessProfile({
        userId,
        expectedGenerationId,
        expectedExpiresAt: profile.temporary_password_expires_at,
        expectedSessionId,
        updates: {
          temporary_password_generation_id: null,
          temporary_password_session_id: null,
          temporary_password_expires_at: lockExpiresAt
        },
        unexpiredAfter: new Date(casNowMs).toISOString()
      });

    if (acquireError) {
      expireClientRefreshCookie(res);
      return res.status(500).json({
        error: "Erro ao preparar a atualização da senha."
      });
    }

    if (!acquiredProfile) {
      expireClientRefreshCookie(res);
      return res.status(409).json({
        error: FIRST_ACCESS_STATE_CHANGED_MESSAGE,
        code: FIRST_ACCESS_STATE_CHANGED_CODE
      });
    }

    const { error: updateAuthError } =
      await adminSupabase.auth.admin.updateUserById(userId, {
        password: newPassword
      });

    if (updateAuthError) {
      expireClientRefreshCookie(res);
      return res.status(500).json({
        error:
          updateAuthError.message ||
          "Erro ao atualizar senha do usuário."
      });
    }

    const { data: updatedProfile, error: updateProfileError } =
      await compareAndSetFirstAccessProfile({
        userId,
        expectedGenerationId: null,
        expectedExpiresAt: lockExpiresAt,
        expectedSessionId: null,
        updates: {
          must_change_password: false,
          temporary_password_expires_at: null,
          temporary_password_session_id: null,
          temporary_password_generation_id: null
        },
        selectColumns: "*"
      });

    expireClientRefreshCookie(res);

    if (updateProfileError || !updatedProfile) {
      return res.status(500).json({
        error:
          "Senha atualizada, mas não foi possível concluir o primeiro acesso."
      });
    }

    return res.status(200).json({
      message: "Senha atualizada com sucesso.",
      profile: getProfileForResponse(updatedProfile)
    });
  } catch (error) {
    expireClientRefreshCookie(res);
    console.error("ERRO EM /update-password:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.post("/clients", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const full_name = normalizeText(req.body.full_name);
    const company_name = normalizeText(req.body.company_name);
    const rawCpfCnpj = req.body.cpf_cnpj;
    const fiscalIdentity = normalizeFiscalIdentity(rawCpfCnpj);
    const email = normalizeText(req.body.email).toLowerCase();
    const phone = normalizeText(req.body.phone).replace(/\D/g, "");
    const whatsapp = normalizeText(req.body.whatsapp).replace(/\D/g, "");

    if (
      !full_name ||
      !company_name ||
      rawCpfCnpj === undefined ||
      rawCpfCnpj === null ||
      (typeof rawCpfCnpj === "string" && !rawCpfCnpj.trim()) ||
      !email
    ) {
      return res.status(400).json({
        error: "Campos obrigatórios: nome do cliente, empresa, CPF/CNPJ e e-mail."
      });
    }

    if (fiscalIdentity.state === "INVALID") {
      return res.status(400).json({
        error: "CPF/CNPJ inválido."
      });
    }

    const cpf_cnpj = fiscalIdentity.canonical;

    const { data: existingCpfCnpj } = await adminSupabase
      .from("profiles")
      .select("user_id")
      .eq("cpf_cnpj", cpf_cnpj)
      .maybeSingle();

    if (existingCpfCnpj) {
      return res.status(409).json({
        error: "Já existe um cliente cadastrado com este CPF/CNPJ."
      });
    }

    const { data: existingEmail } = await adminSupabase
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    if (existingEmail) {
      return res.status(409).json({
        error: "Já existe um cliente cadastrado com este e-mail."
      });
    }

    const temporaryPassword = generateTemporaryPassword();

    const { data: createdUser, error: createUserError } =
      await adminSupabase.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name,
          company_name,
          role: "client"
        }
      });

    if (createUserError || !createdUser?.user?.id) {
      return res.status(500).json({
        error:
          createUserError?.message ||
          "Erro ao criar usuário do cliente."
      });
    }

    const clientUserId = createdUser.user.id;
    const temporaryPasswordExpiresAt = createTemporaryPasswordExpiresAt();
    const temporaryPasswordGenerationId = crypto.randomUUID();

    const { data: insertedProfile, error: insertProfileError } =
      await adminSupabase
        .from("profiles")
        .insert({
          user_id: clientUserId,
          full_name,
          company_name,
          cpf_cnpj,
          email,
          phone: phone || null,
          whatsapp: whatsapp || null,
          role: "client",
          is_active: true,
          must_change_password: true,
          temporary_password_expires_at: temporaryPasswordExpiresAt,
          temporary_password_session_id: null,
          temporary_password_generation_id: temporaryPasswordGenerationId
        })
        .select("*")
        .single();

    if (insertProfileError) {
      await adminSupabase.auth.admin.deleteUser(clientUserId);

      return res.status(500).json({
        error:
          insertProfileError.message ||
          "Erro ao salvar perfil do cliente."
      });
    }

    await registerAdminActivity({
      actionType: "client_created",
      title: "Cliente cadastrado",
      description: `${getClientDisplayName({ company_name, full_name })} foi cadastrado.`,
      entityType: "client",
      entityId: clientUserId,
      clientId: clientUserId,
      clientName: getClientDisplayName(insertedProfile),
      metadata: {
        client_id: clientUserId,
        company_name,
        full_name,
        email,
        cpf_cnpj
      }
    });

    return res.status(201).json({
      message: "Cliente cadastrado com sucesso.",
      client: getProfileForResponse(insertedProfile),
      temporary_password: temporaryPassword
    });
  } catch (error) {
    console.error("ERRO EM /clients:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.get("/clients", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { data, error } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("role", "client")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: "Erro interno do servidor"
      });
    }

    return res.status(200).json(
      (data || []).map(getProfileForResponse)
    );
  } catch (error) {
    console.error("ERRO EM GET /clients:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.post("/admin/clients/:clientId/reissue-temporary-password", async (req, res) => {
  let lockWasAcquired = false;

  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { clientId } = req.params;

    if (!clientId) {
      return res.status(400).json({
        error: "clientId é obrigatório."
      });
    }

    const { data: currentClient, error: currentClientError } =
      await adminSupabase
        .from("profiles")
        .select(
          "user_id, role, is_active, must_change_password, temporary_password_expires_at, temporary_password_session_id, temporary_password_generation_id"
        )
        .eq("user_id", clientId)
        .eq("role", "client")
        .maybeSingle();

    if (currentClientError) {
      return res.status(500).json({
        error: "Erro ao buscar cliente para reemissão."
      });
    }

    if (!currentClient) {
      return res.status(404).json({
        error: "Cliente não encontrado."
      });
    }

    if (currentClient.is_active !== true) {
      return res.status(409).json({
        error: "Cliente inativo. Ative o cliente antes de reemitir o primeiro acesso."
      });
    }

    if (currentClient.must_change_password !== true) {
      return res.status(409).json({
        error: FIRST_ACCESS_ALREADY_COMPLETED_MESSAGE,
        code: FIRST_ACCESS_ALREADY_COMPLETED_CODE
      });
    }

    const expectedGenerationId = normalizeUuid(
      currentClient.temporary_password_generation_id
    );

    if (!expectedGenerationId) {
      return res.status(409).json({
        error: FIRST_ACCESS_RECOVERY_REQUIRED_MESSAGE,
        code: FIRST_ACCESS_RECOVERY_REQUIRED_CODE
      });
    }

    const expectedExpiresAt = currentClient.temporary_password_expires_at;
    const expectedExpiresAtMs =
      typeof expectedExpiresAt === "string"
        ? Date.parse(expectedExpiresAt)
        : Number.NaN;

    if (!Number.isFinite(expectedExpiresAtMs)) {
      return res.status(409).json({
        error: FIRST_ACCESS_RECOVERY_REQUIRED_MESSAGE,
        code: FIRST_ACCESS_RECOVERY_REQUIRED_CODE
      });
    }

    const observedSessionId = currentClient.temporary_password_session_id;
    const expectedSessionId =
      observedSessionId === null ? null : normalizeUuid(observedSessionId);

    if (observedSessionId !== null && !expectedSessionId) {
      return res.status(409).json({
        error: FIRST_ACCESS_RECOVERY_REQUIRED_MESSAGE,
        code: FIRST_ACCESS_RECOVERY_REQUIRED_CODE
      });
    }

    const temporaryPassword = generateTemporaryPassword();
    const temporaryPasswordExpiresAt = createTemporaryPasswordExpiresAt();
    const temporaryPasswordGenerationId = crypto.randomUUID();
    const casNowMs = Date.now();
    const lockExpiresAt = new Date(casNowMs - 1000).toISOString();

    const { data: acquiredClient, error: acquisitionError } =
      await compareAndSetFirstAccessProfile({
        userId: clientId,
        expectedGenerationId,
        expectedExpiresAt,
        expectedSessionId,
        updates: {
          temporary_password_generation_id: null,
          temporary_password_session_id: null,
          temporary_password_expires_at: lockExpiresAt
        }
      });

    if (acquisitionError) {
      return res.status(500).json({
        error: "Erro ao preparar a reemissão da senha temporária."
      });
    }

    if (!acquiredClient) {
      return res.status(409).json({
        error: FIRST_ACCESS_STATE_CHANGED_MESSAGE,
        code: FIRST_ACCESS_STATE_CHANGED_CODE
      });
    }

    lockWasAcquired = true;

    const { error: updateAuthError } =
      await adminSupabase.auth.admin.updateUserById(clientId, {
        password: temporaryPassword
      });

    if (updateAuthError) {
      return res.status(500).json({
        error: FIRST_ACCESS_RECOVERY_REQUIRED_MESSAGE,
        code: FIRST_ACCESS_RECOVERY_REQUIRED_CODE
      });
    }

    const { data: finalizedClient, error: finalizationError } =
      await compareAndSetFirstAccessProfile({
        userId: clientId,
        expectedGenerationId: null,
        expectedExpiresAt: lockExpiresAt,
        expectedSessionId: null,
        updates: {
          must_change_password: true,
          temporary_password_expires_at: temporaryPasswordExpiresAt,
          temporary_password_session_id: null,
          temporary_password_generation_id: temporaryPasswordGenerationId
        }
      });

    if (finalizationError || !finalizedClient) {
      return res.status(500).json({
        error: FIRST_ACCESS_RECOVERY_REQUIRED_MESSAGE,
        code: FIRST_ACCESS_RECOVERY_REQUIRED_CODE
      });
    }

    return res.status(200).json({
      message: "Senha temporária reemitida com sucesso.",
      temporary_password: temporaryPassword,
      temporary_password_expires_at: temporaryPasswordExpiresAt
    });
  } catch (error) {
    console.error(
      "ERRO EM POST /admin/clients/:clientId/reissue-temporary-password."
    );

    if (lockWasAcquired) {
      return res.status(500).json({
        error: FIRST_ACCESS_RECOVERY_REQUIRED_MESSAGE,
        code: FIRST_ACCESS_RECOVERY_REQUIRED_CODE
      });
    }

    return res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.put("/admin/clients/:clientId/status", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { clientId } = req.params;
    const is_active = req.body.is_active;

    if (!clientId) {
      return res.status(400).json({
        error: "clientId é obrigatório."
      });
    }

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        error: "is_active deve ser boolean."
      });
    }

    const { data: currentClient, error: currentError } =
      await adminSupabase
        .from("profiles")
        .select("*")
        .eq("user_id", clientId)
        .eq("role", "client")
        .single();

    if (currentError || !currentClient) {
      return res.status(404).json({
        error: "Cliente não encontrado."
      });
    }

    const { data: updatedClient, error: updateError } =
      await adminSupabase
        .from("profiles")
        .update({
          is_active
        })
        .eq("user_id", clientId)
        .eq("role", "client")
        .select("*")
        .single();

    if (updateError || !updatedClient) {
      return res.status(500).json({
        error:
          updateError?.message ||
          "Erro ao atualizar status do cliente."
      });
    }

    await registerAdminActivity({
      actionType: is_active ? "client_activated" : "client_deactivated",
      title: is_active ? "Cliente ativado" : "Cliente inativado",
      description: `${getClientDisplayName(updatedClient)} foi ${is_active ? "ativado" : "inativado"}.`,
      entityType: "client",
      entityId: clientId,
      clientId,
      clientName: getClientDisplayName(updatedClient),
      metadata: {
        client_id: clientId,
        previous_status: currentClient.is_active,
        new_status: updatedClient.is_active
      }
    });

    return res.status(200).json({
      message: "Status do cliente atualizado com sucesso.",
      client: getProfileForResponse(updatedClient)
    });
  } catch (error) {
    console.error("ERRO EM PUT /admin/clients/:clientId/status:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});
app.delete("/admin/clients/:clientId", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { clientId } = req.params;

    if (!clientId) {
      return res.status(400).json({
        error: "clientId é obrigatório."
      });
    }

    const { data: clientProfile, error: clientError } =
      await adminSupabase
        .from("profiles")
        .select("*")
        .eq("user_id", clientId)
        .eq("role", "client")
        .single();

    if (clientError || !clientProfile) {
      return res.status(404).json({
        error: "Cliente não encontrado."
      });
    }

    const { data: clientDocuments, error: documentsError } =
      await adminSupabase
        .from("documents")
        .select("id, file_path")
        .eq("client_id", clientId);

    if (documentsError) {
      return res.status(500).json({
        error:
          documentsError.message ||
          "Erro ao buscar documentos do cliente."
      });
    }

    const filePaths = (clientDocuments || [])
      .map((documentItem) => documentItem.file_path)
      .filter(Boolean);

    const storageError = await removeStorageFiles("documents", filePaths);

    if (storageError) {
      return res.status(500).json({
        error:
          storageError.message ||
          "Erro ao remover arquivos do cliente."
      });
    }

    const { error: documentsDeleteError } =
      await adminSupabase
        .from("documents")
        .delete()
        .eq("client_id", clientId);

    if (documentsDeleteError) {
      return res.status(500).json({
        error:
          documentsDeleteError.message ||
          "Erro ao excluir documentos do cliente."
      });
    }

    const { error: eventsDeleteError } =
      await adminSupabase
        .from("system_events")
        .delete()
        .eq("client_id", clientId);

    if (eventsDeleteError) {
      console.error("ERRO AO EXCLUIR EVENTOS DO CLIENTE:", eventsDeleteError);
    }

    const { error: profileDeleteError } =
      await adminSupabase
        .from("profiles")
        .delete()
        .eq("user_id", clientId)
        .eq("role", "client");

    if (profileDeleteError) {
      return res.status(500).json({
        error:
          profileDeleteError.message ||
          "Erro ao excluir perfil do cliente."
      });
    }

    const { error: userDeleteError } =
      await adminSupabase.auth.admin.deleteUser(clientId);

    if (userDeleteError) {
      return res.status(500).json({
        error:
          userDeleteError.message ||
          "Perfil excluído, mas houve erro ao remover o usuário."
      });
    }

    await registerAdminActivity({
      actionType: "client_deleted",
      title: "Cliente excluído",
      description: `${getClientDisplayName(clientProfile)} foi excluído.`,
      entityType: "client",
      entityId: clientId,
      clientId,
      clientName: getClientDisplayName(clientProfile),
      metadata: {
        client_id: clientId,
        company_name: clientProfile.company_name,
        full_name: clientProfile.full_name,
        email: clientProfile.email,
        removed_documents: filePaths.length
      }
    });

    return res.status(200).json({
      message: "Cliente excluído com sucesso."
    });
  } catch (error) {
    console.error("ERRO EM DELETE /admin/clients/:clientId:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.get("/clients/:clientId/documents", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { clientId } = req.params;

    if (!clientId) {
      return res.status(400).json({
        error: "clientId é obrigatório."
      });
    }

    const { data, error } = await adminSupabase
      .from("documents")
      .select("*")
      .eq("client_id", clientId)
      .order("year", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error:
          error.message ||
          "Erro ao buscar documentos do cliente."
      });
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error("ERRO EM GET /clients/:clientId/documents:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.get("/admin/documents/renewal-alerts", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { data: documents, error } = await adminSupabase
      .from("documents")
      .select(`
        id,
        client_id,
        file_name,
        category,
        subcategory,
        year,
        release_date,
        expiration_date,
        created_at,
        profiles:client_id (
          full_name,
          company_name
        )
      `)
      .not("expiration_date", "is", null)
      .order("expiration_date", { ascending: true });

    if (error) {
      return res.status(500).json({
        error:
          error.message ||
          "Erro ao buscar documentos para renovação."
      });
    }

    const latestDocumentsByGroup = new Map();

    (documents || []).forEach((documentItem) => {
      const groupKey = getDocumentGroupKey(documentItem);
      const currentDocument = latestDocumentsByGroup.get(groupKey);

      if (!currentDocument || compareDocumentsByLatest(documentItem, currentDocument) > 0) {
        latestDocumentsByGroup.set(groupKey, documentItem);
      }
    });

    const alerts = Array.from(latestDocumentsByGroup.values())
      .map((documentItem) => {
        const statusInfo = getRenewalStatusInfo(documentItem.expiration_date);

        if (!statusInfo) {
          return null;
        }

        if (statusInfo.days_until_expiration > 30) {
          return null;
        }

        const profileData = Array.isArray(documentItem.profiles)
          ? documentItem.profiles[0]
          : documentItem.profiles;

        return {
          id: documentItem.id,
          client_id: documentItem.client_id,
          client_name: profileData?.full_name || "-",
          company_name: profileData?.company_name || "-",
          file_name: documentItem.file_name || "Documento",
          category: documentItem.category || "-",
          subcategory: documentItem.subcategory || "-",
          year: documentItem.year || "-",
          release_date: documentItem.release_date,
          expiration_date: documentItem.expiration_date,
          created_at: documentItem.created_at,
          ...statusInfo
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        return Number(a.days_until_expiration) - Number(b.days_until_expiration);
      });

    return res.status(200).json(alerts);
  } catch (error) {
    console.error("ERRO EM GET /admin/documents/renewal-alerts:", error);

    res.status(500).json({
      error: "Erro interno ao buscar avisos de renovação."
    });
  }
});

app.post("/admin/documents/upload", requireAdminAccess, (req, res, next) => {
  upload.single("file")(req, res, function (err) {
    if (err) {
      console.error("ERRO NO MULTER:", err);

      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          error: `Erro no upload: ${err.message}`
        });
      }

      return res.status(500).json({
        error: "Erro ao processar arquivo enviado."
      });
    }

    next();
  });
}, async (req, res) => {
  try {
    const adminAccess = req.adminAccess;

    if (!adminAccess) {
      return;
    }

    const client_id = normalizeText(req.body.client_id);
    const category = normalizeText(req.body.category);
    const subcategory = normalizeOptionalText(req.body.subcategory);
    const year = normalizeText(req.body.year);
    const release_date = normalizeDateInput(req.body.release_date);
    const expiration_date = normalizeDateInput(req.body.expiration_date);
    const file = req.file;

    if (!client_id || !category || !year || !file) {
      return res.status(400).json({
        error: "Campos obrigatórios: cliente, categoria, ano e arquivo."
      });
    }

    if (
      release_date &&
      expiration_date &&
      isExpirationDateBeforeReleaseDate(release_date, expiration_date)
    ) {
      return res.status(400).json({
        error: "A data de validade não pode ser menor que a data de lançamento."
      });
    }

    const { data: clientProfile, error: clientError } =
      await adminSupabase
        .from("profiles")
        .select("user_id, full_name, company_name, role")
        .eq("user_id", client_id)
        .eq("role", "client")
        .single();

    if (clientError || !clientProfile) {
      return res.status(404).json({
        error: "Cliente não encontrado."
      });
    }

    const originalFileName = sanitizeFileName(file.originalname || "documento");
    const timestamp = Date.now();
    const storagePath = `${client_id}/${year}/${timestamp}_${originalFileName}`;

    const { data: duplicateDocument, error: duplicateError } =
      await findDuplicateDocument({
        clientId: client_id,
        category,
        subcategory,
        year,
        fileName: originalFileName
      });

    if (duplicateError) {
      return res.status(500).json({
        error:
          duplicateError.message ||
          "Erro ao verificar documento duplicado."
      });
    }

    if (duplicateDocument) {
      return res.status(409).json({
        error: "Já existe um documento com a mesma categoria, subcategoria, ano e nome de arquivo para este cliente."
      });
    }

    const { error: uploadError } = await adminSupabase.storage
      .from("documents")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || "application/octet-stream",
        upsert: false
      });

    if (uploadError) {
      return res.status(500).json({
        error:
          uploadError.message ||
          "Erro ao enviar arquivo para o storage."
      });
    }

    const { data: insertedDocument, error: insertError } =
      await adminSupabase
        .from("documents")
        .insert({
          client_id,
          category,
          subcategory,
          year,
          release_date,
          expiration_date,
          file_name: originalFileName,
          file_path: storagePath,
          mime_type: file.mimetype || null,
          file_size: file.size || null
        })
        .select("*")
        .single();

    if (insertError) {
      await adminSupabase.storage
        .from("documents")
        .remove([storagePath]);

      return res.status(500).json({
        error:
          insertError.message ||
          "Erro ao salvar documento no banco."
      });
    }

    await registerAdminActivity({
      actionType: "document_uploaded",
      title: "Documento enviado",
      description: `Documento enviado para ${getClientDisplayName(clientProfile)}. ${getDocumentDescription(insertedDocument)}.`,
      entityType: "document",
      entityId: insertedDocument.id,
      clientId: client_id,
      clientName: getClientDisplayName(clientProfile),
      metadata: {
        document_id: insertedDocument.id,
        file_name: insertedDocument.file_name,
        category: insertedDocument.category,
        subcategory: insertedDocument.subcategory,
        year: insertedDocument.year,
        release_date: insertedDocument.release_date,
        expiration_date: insertedDocument.expiration_date
      }
    });

    return res.status(201).json({
      message: "Documento enviado com sucesso.",
      document: insertedDocument
    });
  } catch (error) {
    console.error("ERRO EM /admin/documents/upload:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.put("/admin/documents/:documentId/replace", requireAdminAccess, (req, res, next) => {
  upload.single("file")(req, res, function (err) {
    if (err) {
      console.error("ERRO NO MULTER (SUBSTITUIR):", err);

      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          error: `Erro no upload: ${err.message}`
        });
      }

      return res.status(500).json({
        error: "Erro ao processar arquivo enviado."
      });
    }

    next();
  });
}, async (req, res) => {
  try {
    const adminAccess = req.adminAccess;

    if (!adminAccess) {
      return;
    }

    const { documentId } = req.params;
    const file = req.file;

    if (!documentId || !file) {
      return res.status(400).json({
        error: "documentId e arquivo são obrigatórios."
      });
    }

    const { data: currentDocument, error: documentError } =
      await adminSupabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .single();

    if (documentError || !currentDocument) {
      return res.status(404).json({
        error: "Documento não encontrado."
      });
    }

    const clientProfile = await getClientBasicInfo(currentDocument.client_id);

    const originalFileName = sanitizeFileName(file.originalname || "documento");
    const timestamp = Date.now();
    const storagePath = `${currentDocument.client_id}/${currentDocument.year}/${timestamp}_${originalFileName}`;

    const { error: uploadError } = await adminSupabase.storage
      .from("documents")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || "application/octet-stream",
        upsert: false
      });

    if (uploadError) {
      return res.status(500).json({
        error:
          uploadError.message ||
          "Erro ao enviar novo arquivo para o storage."
      });
    }

    const { data: updatedDocument, error: updateError } =
      await adminSupabase
        .from("documents")
        .update({
          file_name: originalFileName,
          file_path: storagePath,
          mime_type: file.mimetype || null,
          file_size: file.size || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", documentId)
        .select("*")
        .single();

    if (updateError || !updatedDocument) {
      await adminSupabase.storage
        .from("documents")
        .remove([storagePath]);

      return res.status(500).json({
        error:
          updateError?.message ||
          "Erro ao atualizar documento no banco."
      });
    }

    if (currentDocument.file_path) {
      const { error: removeOldFileError } =
        await adminSupabase.storage
          .from("documents")
          .remove([currentDocument.file_path]);

      if (removeOldFileError) {
        console.error("ERRO AO REMOVER ARQUIVO ANTIGO:", removeOldFileError);
      }
    }

    await registerAdminActivity({
      actionType: "document_replaced",
      title: "Documento substituído",
      description: `Documento substituído para ${getClientDisplayName(clientProfile)}. ${getDocumentDescription(updatedDocument)}.`,
      entityType: "document",
      entityId: updatedDocument.id,
      clientId: updatedDocument.client_id,
      clientName: getClientDisplayName(clientProfile),
      metadata: {
        document_id: updatedDocument.id,
        previous_file_name: currentDocument.file_name,
        new_file_name: updatedDocument.file_name,
        category: updatedDocument.category,
        subcategory: updatedDocument.subcategory,
        year: updatedDocument.year,
        release_date: updatedDocument.release_date,
        expiration_date: updatedDocument.expiration_date
      }
    });

    return res.status(200).json({
      message: "Documento substituído com sucesso.",
      document: updatedDocument
    });
  } catch (error) {
    console.error("ERRO EM PUT /admin/documents/:documentId/replace:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.get("/documents", async (req, res) => {
  try {
    const authResult = await getAuthenticatedUser(req);

    if (authResult.error) {
      return res.status(authResult.status).json({
        error: authResult.error
      });
    }

    const userId = authResult.user.id;
    const profileResult = await getUserProfile(userId);

    if (profileResult.error) {
      return res.status(profileResult.status).json({
        error: profileResult.error
      });
    }

    const profile = profileResult.profile;

    if (profile.role !== "client") {
      return res.status(403).json({
        error: "Acesso restrito a clientes."
      });
    }

    if (profile.is_active !== true) {
      return res.status(403).json({
        error: "Cliente inativo. Entre em contato com a administração."
      });
    }

    if (profile.must_change_password === true) {
      return res.status(403).json({
        error: "Conclua o primeiro acesso antes de continuar."
      });
    }

    const { data, error } = await adminSupabase
      .from("documents")
      .select("*")
      .eq("client_id", userId)
      .order("year", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error:
          error.message ||
          "Erro ao buscar documentos."
      });
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error("ERRO EM GET /documents:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.post("/documents/download", async (req, res) => {
  try {
    const authResult = await getAuthenticatedUser(req);

    if (authResult.error) {
      return res.status(authResult.status).json({
        error: authResult.error
      });
    }

    const userId = authResult.user.id;
    const profileResult = await getUserProfile(userId);

    if (profileResult.error) {
      return res.status(profileResult.status).json({
        error: profileResult.error
      });
    }

    const profile = profileResult.profile;

    if (profile.role !== "client") {
      return res.status(403).json({
        error: "Acesso restrito a clientes."
      });
    }

    if (profile.is_active !== true) {
      return res.status(403).json({
        error: "Cliente inativo. Entre em contato com a administração."
      });
    }

    if (profile.must_change_password === true) {
      return res.status(403).json({
        error: "Conclua o primeiro acesso antes de continuar."
      });
    }

    const document_id = normalizeText(req.body.document_id);

    if (!document_id) {
      return res.status(400).json({
        error: "document_id é obrigatório."
      });
    }

    const { data: documentData, error: documentError } =
      await adminSupabase
        .from("documents")
        .select("*")
        .eq("id", document_id)
        .eq("client_id", userId)
        .single();

    if (documentError || !documentData) {
      return res.status(404).json({
        error: "Documento não encontrado."
      });
    }

    if (!documentData.file_path) {
      return res.status(404).json({
        error: "Arquivo do documento não encontrado."
      });
    }

    const { data: signedUrlData, error: signedUrlError } =
      await adminSupabase.storage
        .from("documents")
        .createSignedUrl(documentData.file_path, 60 * 5);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return res.status(500).json({
        error:
          signedUrlError?.message ||
          "Erro ao gerar link temporário do documento."
      });
    }

    await registerSystemEvent({
      eventType: "document_download",
      userId,
      clientId: userId,
      documentId: documentData.id,
      page: "cliente",
      metadata: {
        file_name: documentData.file_name,
        category: documentData.category,
        subcategory: documentData.subcategory,
        year: documentData.year
      }
    });

    return res.status(200).json({
      url: signedUrlData.signedUrl,
      file_name: documentData.file_name
    });
  } catch (error) {
    console.error("ERRO EM POST /documents/download:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.post("/admin/documents/download", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const document_id = normalizeText(req.body.document_id);

    if (!document_id) {
      return res.status(400).json({
        error: "document_id é obrigatório."
      });
    }

    const { data: documentData, error: documentError } =
      await adminSupabase
        .from("documents")
        .select("*")
        .eq("id", document_id)
        .single();

    if (documentError || !documentData) {
      return res.status(404).json({
        error: "Documento não encontrado."
      });
    }

    if (!documentData.file_path) {
      return res.status(404).json({
        error: "Arquivo do documento não encontrado."
      });
    }

    const { data: signedUrlData, error: signedUrlError } =
      await adminSupabase.storage
        .from("documents")
        .createSignedUrl(documentData.file_path, 60 * 5);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return res.status(500).json({
        error:
          signedUrlError?.message ||
          "Erro ao gerar link temporário do documento."
      });
    }

    return res.status(200).json({
      url: signedUrlData.signedUrl,
      file_name: documentData.file_name
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/documents/download:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});
app.delete("/admin/documents/:documentId", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { documentId } = req.params;

    if (!documentId) {
      return res.status(400).json({
        error: "documentId é obrigatório."
      });
    }

    const { data: documentData, error: documentError } =
      await adminSupabase
        .from("documents")
        .select("id, client_id, file_path, file_name, category, subcategory, year, release_date, expiration_date")
        .eq("id", documentId)
        .single();

    if (documentError || !documentData) {
      return res.status(404).json({
        error: "Documento não encontrado."
      });
    }

    const clientProfile = await getClientBasicInfo(documentData.client_id);

    if (documentData.file_path) {
      const { error: storageError } =
        await adminSupabase.storage
          .from("documents")
          .remove([documentData.file_path.trim()]);

      if (storageError) {
        return res.status(500).json({
          error:
            storageError.message ||
            "Erro ao excluir arquivo do storage."
        });
      }
    }

    const { error: eventsDeleteError } = await adminSupabase
      .from("system_events")
      .delete()
      .eq("document_id", documentId);

    if (eventsDeleteError) {
      console.error("ERRO AO EXCLUIR EVENTOS DO DOCUMENTO:", eventsDeleteError);
    }

    const { error: deleteDbError } = await adminSupabase
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (deleteDbError) {
      return res.status(500).json({
        error:
          deleteDbError.message ||
          "Erro ao excluir documento do banco."
      });
    }

    await registerAdminActivity({
      actionType: "document_deleted",
      title: "Documento excluído",
      description: `Documento excluído de ${getClientDisplayName(clientProfile)}. ${getDocumentDescription(documentData)}.`,
      entityType: "document",
      entityId: documentId,
      clientId: documentData.client_id,
      clientName: getClientDisplayName(clientProfile),
      metadata: {
        document_id: documentData.id,
        file_name: documentData.file_name,
        category: documentData.category,
        subcategory: documentData.subcategory,
        year: documentData.year,
        release_date: documentData.release_date,
        expiration_date: documentData.expiration_date
      }
    });

    return res.status(200).json({
      message: "Documento excluído com sucesso."
    });
  } catch (error) {
    console.error("ERRO EM DELETE /admin/documents/:documentId:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

/* =========================
   BANNERS GLOBAIS DA HOME
========================= */

app.get("/admin/notices", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { data, error } = await adminSupabase
      .from("notices")
      .select("id, title, image_url, link, description, action_type, link_target, is_active, created_at, display_order")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error:
          error.message ||
          "Erro ao buscar banners da Home."
      });
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error("ERRO EM GET /admin/notices:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.post("/admin/notices/upload", requireAdminAccess, (req, res, next) => {
  upload.single("image")(req, res, function (err) {
    if (err) {
      console.error("ERRO NO MULTER (BANNER):", err);

      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          error: `Erro no upload: ${err.message}`
        });
      }

      return res.status(500).json({
        error: "Erro ao processar a imagem enviada."
      });
    }

    next();
  });
}, async (req, res) => {
  try {
    const adminAccess = req.adminAccess;

    if (!adminAccess) {
      return;
    }

    const title = normalizeText(req.body.title);
    const link = normalizeOptionalText(req.body.link);
    const description = normalizeOptionalText(req.body.description);
    const actionType = normalizeText(req.body.action_type);
    const linkTarget = normalizeOptionalText(req.body.link_target);
    const isActive = String(req.body.is_active).toLowerCase() === "true";
    const image = req.file;

    if (!title || !image) {
      return res.status(400).json({
        error: "Campos obrigatórios: title e image."
      });
    }

    if (!actionType || !isValidBannerActionType(actionType)) {
      return res.status(400).json({
        error: "action_type inválido. Use 'modal' ou 'link'."
      });
    }

    if (actionType === "modal") {
      if (!description) {
        return res.status(400).json({
          error: "Para banners do tipo modal, a descrição é obrigatória."
        });
      }
    }

    if (actionType === "link") {
      if (!linkTarget || !isValidBannerLinkTarget(linkTarget)) {
        return res.status(400).json({
          error:
            "link_target inválido. Use 'contato', 'servicos', 'whatsapp' ou 'custom'."
        });
      }

      if (linkTarget === "custom" && !link) {
        return res.status(400).json({
          error:
            "Para link personalizado, o campo link é obrigatório."
        });
      }

      if (linkTarget === "custom" && !isValidBannerCustomLink(link)) {
        return res.status(400).json({
          error: "Insira URL válido"
        });
      }
    }

    if (!image.mimetype.startsWith("image/")) {
      return res.status(400).json({
        error: "O arquivo enviado deve ser uma imagem válida."
      });
    }

    const optimizedBanner = await prepareBannerImageForStorage(image);

    if (!optimizedBanner.valid) {
      return res.status(400).json({
        error: optimizedBanner.error
      });
    }

    const sanitizedFileName = getBannerOptimizedFileName(image.originalname);
    const timestamp = Date.now();

    const storagePath = `home-banners/${timestamp}_${sanitizedFileName}`;

    const { error: uploadError } = await adminSupabase.storage
      .from("banners")
      .upload(storagePath, optimizedBanner.buffer, {
        contentType: optimizedBanner.contentType,
        upsert: false
      });

    if (uploadError) {
      return res.status(500).json({
        error:
          uploadError.message ||
          "Erro ao enviar imagem do banner para o storage."
      });
    }

    const { data: publicUrlData } = adminSupabase.storage
      .from("banners")
      .getPublicUrl(storagePath);

    const imageUrl = publicUrlData?.publicUrl || null;

    if (!imageUrl) {
      await adminSupabase.storage
        .from("banners")
        .remove([storagePath]);

      return res.status(500).json({
        error:
          "Não foi possível gerar a URL pública da imagem do banner."
      });
    }

    let displayOrder = 1;

    try {
      displayOrder = await getNextNoticeDisplayOrder();
    } catch (orderError) {
      await adminSupabase.storage
        .from("banners")
        .remove([storagePath]);

      return res.status(500).json({
        error:
          orderError.message ||
          "Erro ao calcular ordem do banner."
      });
    }

    const { data: insertedNotice, error: insertError } =
      await adminSupabase
        .from("notices")
        .insert({
          title,
          image_url: imageUrl,
          link: actionType === "link" ? link : null,
          description: actionType === "modal" ? description : null,
          action_type: actionType,
          link_target: actionType === "link" ? linkTarget : null,
          is_active: isActive,
          display_order: displayOrder
        })
        .select("id, title, image_url, link, description, action_type, link_target, is_active, created_at, display_order")
        .single();

    if (insertError) {
      await adminSupabase.storage
        .from("banners")
        .remove([storagePath]);

      return res.status(500).json({
        error:
          insertError.message ||
          "Erro ao salvar banner no banco."
      });
    }

    await registerAdminActivity({
      actionType: "banner_created",
      title: "Banner criado",
      description: `Banner "${insertedNotice.title}" foi criado para a Home.`,
      entityType: "banner",
      entityId: insertedNotice.id,
      metadata: {
        notice_id: insertedNotice.id,
        title: insertedNotice.title,
        action_type: insertedNotice.action_type,
        link_target: insertedNotice.link_target,
        is_active: insertedNotice.is_active,
        display_order: insertedNotice.display_order
      }
    });

    return res.status(201).json({
      message: "Banner da Home criado com sucesso.",
      notice: insertedNotice
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/notices/upload:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

/*
  IMPORTANTE:
  Esta rota específica precisa ficar ANTES da rota dinâmica:
  PUT /admin/notices/:noticeId

  Caso contrário, o Express interpreta "reorder" como se fosse um noticeId.
*/
app.put("/admin/notices/reorder", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({
        error: "Lista de ordenação inválida."
      });
    }

    const uniqueIds = [
      ...new Set(
        orderedIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    ];

    if (uniqueIds.length !== orderedIds.length) {
      return res.status(400).json({
        error: "A lista de banners possui IDs duplicados ou inválidos."
      });
    }

    for (let index = 0; index < uniqueIds.length; index++) {
      const noticeId = uniqueIds[index];

      const { error } = await adminSupabase
        .from("notices")
        .update({
          display_order: index + 1
        })
        .eq("id", noticeId);

      if (error) {
        return res.status(500).json({
          error:
            error.message ||
            "Erro ao atualizar ordem dos banners."
        });
      }
    }

    const { data, error: fetchError } = await adminSupabase
      .from("notices")
      .select("id, title, image_url, link, description, action_type, link_target, is_active, created_at, display_order")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (fetchError) {
      return res.status(500).json({
        error:
          fetchError.message ||
          "Ordem atualizada, mas houve erro ao recarregar banners."
      });
    }

    await registerAdminActivity({
      actionType: "banners_reordered",
      title: "Banners reordenados",
      description: "A ordem dos banners da Home foi atualizada.",
      entityType: "banner",
      entityId: null,
      metadata: {
        ordered_ids: uniqueIds
      }
    });

    return res.status(200).json({
      message: "Ordem dos banners atualizada com sucesso.",
      notices: data || []
    });
  } catch (error) {
    console.error("ERRO EM PUT /admin/notices/reorder:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.put("/admin/notices/:noticeId", requireAdminAccess, (req, res, next) => {
  upload.single("image")(req, res, function (err) {
    if (err) {
      console.error("ERRO NO MULTER (EDITAR BANNER):", err);

      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          error: `Erro no upload: ${err.message}`
        });
      }

      return res.status(500).json({
        error: "Erro ao processar a imagem enviada."
      });
    }

    next();
  });
}, async (req, res) => {
  try {
    const adminAccess = req.adminAccess;

    if (!adminAccess) {
      return;
    }

    const { noticeId } = req.params;

    if (!noticeId) {
      return res.status(400).json({
        error: "noticeId é obrigatório."
      });
    }

    const title = normalizeText(req.body.title);
    const link = normalizeOptionalText(req.body.link);
    const description = normalizeOptionalText(req.body.description);
    const actionType = normalizeText(req.body.action_type);
    const linkTarget = normalizeOptionalText(req.body.link_target);
    const isActive = String(req.body.is_active).toLowerCase() === "true";
    const image = req.file;

    if (!title) {
      return res.status(400).json({
        error: "O título do banner é obrigatório."
      });
    }

    if (!actionType || !isValidBannerActionType(actionType)) {
      return res.status(400).json({
        error: "action_type inválido. Use 'modal' ou 'link'."
      });
    }

    if (actionType === "modal" && !description) {
      return res.status(400).json({
        error: "Para banners do tipo modal, a descrição é obrigatória."
      });
    }

    if (actionType === "link") {
      if (!linkTarget || !isValidBannerLinkTarget(linkTarget)) {
        return res.status(400).json({
          error:
            "link_target inválido. Use 'contato', 'servicos', 'whatsapp' ou 'custom'."
        });
      }

      if (linkTarget === "custom" && !link) {
        return res.status(400).json({
          error:
            "Para link personalizado, o campo link é obrigatório."
        });
      }

      if (linkTarget === "custom" && !isValidBannerCustomLink(link)) {
        return res.status(400).json({
          error: "Insira URL válido"
        });
      }
    }

    const { data: currentNotice, error: currentError } =
      await adminSupabase
        .from("notices")
        .select("id, title, image_url, display_order, action_type, link_target, is_active")
        .eq("id", noticeId)
        .single();

    if (currentError || !currentNotice) {
      return res.status(404).json({
        error: "Banner não encontrado."
      });
    }

    let nextImageUrl = currentNotice.image_url;
    let newStoragePath = null;

    if (image) {
      if (!image.mimetype.startsWith("image/")) {
        return res.status(400).json({
          error: "O arquivo enviado deve ser uma imagem válida."
        });
      }

      const optimizedBanner = await prepareBannerImageForStorage(image);

      if (!optimizedBanner.valid) {
        return res.status(400).json({
          error: optimizedBanner.error
        });
      }

      const sanitizedFileName = getBannerOptimizedFileName(image.originalname);
      const timestamp = Date.now();

      newStoragePath = `home-banners/${timestamp}_${sanitizedFileName}`;

      const { error: uploadError } = await adminSupabase.storage
        .from("banners")
        .upload(newStoragePath, optimizedBanner.buffer, {
          contentType: optimizedBanner.contentType,
          upsert: false
        });

      if (uploadError) {
        return res.status(500).json({
          error:
            uploadError.message ||
            "Erro ao enviar nova imagem do banner para o storage."
        });
      }

      const { data: publicUrlData } = adminSupabase.storage
        .from("banners")
        .getPublicUrl(newStoragePath);

      nextImageUrl = publicUrlData?.publicUrl || null;

      if (!nextImageUrl) {
        await adminSupabase.storage
          .from("banners")
          .remove([newStoragePath]);

        return res.status(500).json({
          error:
            "Não foi possível gerar a URL pública da nova imagem do banner."
        });
      }
    }

    const { data: updatedNotice, error: updateError } =
      await adminSupabase
        .from("notices")
        .update({
          title,
          image_url: nextImageUrl,
          link: actionType === "link" ? link : null,
          description: actionType === "modal" ? description : null,
          action_type: actionType,
          link_target: actionType === "link" ? linkTarget : null,
          is_active: isActive
        })
        .eq("id", noticeId)
        .select("id, title, image_url, link, description, action_type, link_target, is_active, created_at, display_order")
        .single();

    if (updateError || !updatedNotice) {
      if (newStoragePath) {
        await adminSupabase.storage
          .from("banners")
          .remove([newStoragePath]);
      }

      return res.status(500).json({
        error:
          updateError?.message ||
          "Erro ao atualizar banner no banco."
      });
    }

    if (image && currentNotice.image_url) {
      const oldFilePath = extractBannerStoragePathFromUrl(currentNotice.image_url);

      if (oldFilePath) {
        const { error: removeOldImageError } =
          await adminSupabase.storage
            .from("banners")
            .remove([oldFilePath]);

        if (removeOldImageError) {
          console.error("ERRO AO REMOVER IMAGEM ANTIGA DO BANNER:", removeOldImageError);
        }
      }
    }

    await registerAdminActivity({
      actionType: "banner_updated",
      title: "Banner editado",
      description: `Banner "${updatedNotice.title}" foi editado.`,
      entityType: "banner",
      entityId: updatedNotice.id,
      metadata: {
        notice_id: updatedNotice.id,
        previous_title: currentNotice.title,
        new_title: updatedNotice.title,
        previous_action_type: currentNotice.action_type,
        new_action_type: updatedNotice.action_type,
        previous_link_target: currentNotice.link_target,
        new_link_target: updatedNotice.link_target,
        previous_status: currentNotice.is_active,
        new_status: updatedNotice.is_active,
        image_updated: Boolean(image)
      }
    });

    return res.status(200).json({
      message: "Banner atualizado com sucesso.",
      notice: updatedNotice
    });
  } catch (error) {
    console.error("ERRO EM PUT /admin/notices/:noticeId:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.put("/admin/notices/:noticeId/toggle", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { noticeId } = req.params;
    const isActive = req.body.is_active;

    if (!noticeId) {
      return res.status(400).json({
        error: "noticeId é obrigatório."
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        error: "is_active deve ser boolean."
      });
    }

    const { data: currentNotice, error: currentError } =
      await adminSupabase
        .from("notices")
        .select("id, title, is_active")
        .eq("id", noticeId)
        .single();

    if (currentError || !currentNotice) {
      return res.status(404).json({
        error: "Banner não encontrado."
      });
    }

    const { data: updatedNotice, error: updateError } =
      await adminSupabase
        .from("notices")
        .update({
          is_active: isActive
        })
        .eq("id", noticeId)
        .select("id, title, image_url, link, description, action_type, link_target, is_active, created_at, display_order")
        .single();

    if (updateError || !updatedNotice) {
      return res.status(500).json({
        error:
          updateError?.message ||
          "Erro ao atualizar status do banner."
      });
    }

    await registerAdminActivity({
      actionType: isActive ? "banner_activated" : "banner_deactivated",
      title: isActive ? "Banner ativado" : "Banner desativado",
      description: `Banner "${updatedNotice.title}" foi ${isActive ? "ativado" : "desativado"}.`,
      entityType: "banner",
      entityId: updatedNotice.id,
      metadata: {
        notice_id: updatedNotice.id,
        title: updatedNotice.title,
        previous_status: currentNotice.is_active,
        new_status: updatedNotice.is_active
      }
    });

    return res.status(200).json({
      message: "Status do banner atualizado com sucesso.",
      notice: updatedNotice
    });
  } catch (error) {
    console.error("ERRO EM PUT /admin/notices/:noticeId/toggle:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.delete("/admin/notices/:noticeId", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { noticeId } = req.params;

    if (!noticeId) {
      return res.status(400).json({
        error: "noticeId é obrigatório."
      });
    }

    const { data: currentNotice, error: currentError } =
      await adminSupabase
        .from("notices")
        .select("id, title, image_url")
        .eq("id", noticeId)
        .single();

    if (currentError || !currentNotice) {
      return res.status(404).json({
        error: "Banner não encontrado."
      });
    }

    if (currentNotice.image_url) {
      const filePath = extractBannerStoragePathFromUrl(currentNotice.image_url);

      if (filePath) {
        const { error: removeImageError } =
          await adminSupabase.storage
            .from("banners")
            .remove([filePath]);

        if (removeImageError) {
          console.error("ERRO AO REMOVER IMAGEM DO BANNER:", removeImageError);
        }
      }
    }

    const { error: deleteError } = await adminSupabase
      .from("notices")
      .delete()
      .eq("id", noticeId);

    if (deleteError) {
      return res.status(500).json({
        error:
          deleteError.message ||
          "Erro ao excluir banner."
      });
    }

    await registerAdminActivity({
      actionType: "banner_deleted",
      title: "Banner excluído",
      description: `Banner "${currentNotice.title}" foi excluído.`,
      entityType: "banner",
      entityId: noticeId,
      metadata: {
        notice_id: currentNotice.id,
        title: currentNotice.title
      }
    });

    return res.status(200).json({
      message: "Banner excluído com sucesso."
    });
  } catch (error) {
    console.error("ERRO EM DELETE /admin/notices/:noticeId:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

app.get("/notices", async (req, res) => {
  try {
    const { data, error } = await adminSupabase
      .from("notices")
      .select("id, title, image_url, link, description, action_type, link_target, is_active, created_at, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: "Erro interno do servidor"
      });
    }

    res.json(data || []);
  } catch (err) {
    console.log("ERRO NA ROTA /notices:", err);

    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

console.log("Rotas configuradas:");
console.log("GET /");
console.log("GET /admin/activities");
console.log("GET /admin/dashboard/summary");
console.log("POST /login");
console.log("POST /admin/refresh-session");
console.log("PUT /update-password");
console.log("POST /clients");
console.log("GET /clients");
console.log("POST /admin/clients/:clientId/reissue-temporary-password");
console.log("PUT /admin/clients/:clientId/status");
console.log("DELETE /admin/clients/:clientId");
console.log("GET /clients/:clientId/documents");
console.log("GET /admin/documents/renewal-alerts");
console.log("POST /admin/documents/upload");
console.log("PUT /admin/documents/:documentId/replace");
console.log("GET /documents");
console.log("POST /documents/download");
console.log("POST /admin/documents/download");
console.log("DELETE /admin/documents/:documentId");
console.log("GET /admin/notices");
console.log("POST /admin/notices/upload");
console.log("PUT /admin/notices/reorder");
console.log("PUT /admin/notices/:noticeId");
console.log("PUT /admin/notices/:noticeId/toggle");
console.log("DELETE /admin/notices/:noticeId");
console.log("GET /notices");

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  scheduleAdminActivityCleanup();
});