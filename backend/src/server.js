require("dotenv").config();

console.log("ESTOU NO SERVER CERTO 🚀");
console.log("ARQUIVO EM EXECUÇÃO:", __filename);

const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

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

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

const PORT = 3000;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const ADMIN_ACTIVITY_RETENTION_DAYS = 7;
const ADMIN_ACTIVITY_CLEANUP_INTERVAL_MS = ONE_DAY_IN_MS;

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

    console.log("RESPOSTA getUser:", data);
    console.log("ERRO getUser:", error);

    if (error || !data || !data.user) {
      return {
        error: "Usuário não autenticado.",
        status: 401
      };
    }

    return {
      user: data.user
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

function generateTemporaryPassword() {
  const random = Math.random().toString(36).slice(-6);
  return `Caseg@${random}1`;
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

app.post("/login", async (req, res) => {
  try {
    const cpf_cnpj = normalizeText(req.body.cpf_cnpj).replace(/\D/g, "");
    const password = normalizeText(req.body.password);

    if (!cpf_cnpj || !password) {
      return res.status(400).json({
        error: "CPF/CNPJ e senha são obrigatórios."
      });
    }

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("cpf_cnpj", cpf_cnpj)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({
        error: "CPF/CNPJ ou senha inválidos."
      });
    }

    if (profile.role === "client" && profile.is_active === false) {
      return res.status(403).json({
        error: "Cliente inativo. Entre em contato com a administração."
      });
    }

    const { data: loginData, error: loginError } =
      await publicSupabase.auth.signInWithPassword({
        email: profile.email,
        password
      });

    if (loginError || !loginData?.session) {
      return res.status(401).json({
        error: "CPF/CNPJ ou senha inválidos."
      });
    }

    if (profile.role === "client") {
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
    }

    return res.status(200).json({
      message: "Login realizado com sucesso.",
      session: loginData.session,
      profile
    });
  } catch (error) {
    console.error("ERRO EM /login:", error);

    res.status(500).json({
      error: "Erro interno do servidor"
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

    const { data, error } = await publicSupabase.auth.refreshSession({
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
      profile
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/refresh-session:", error);

    res.status(500).json({
      error: "Erro interno ao renovar sessão."
    });
  }
});

app.put("/update-password", async (req, res) => {
  try {
    const authResult = await getAuthenticatedUser(req);

    if (authResult.error) {
      return res.status(authResult.status).json({
        error: authResult.error
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

    const userId = authResult.user.id;

    const { error: updateAuthError } =
      await adminSupabase.auth.admin.updateUserById(userId, {
        password: newPassword
      });

    if (updateAuthError) {
      return res.status(500).json({
        error:
          updateAuthError.message ||
          "Erro ao atualizar senha do usuário."
      });
    }

    const { data: updatedProfile, error: updateProfileError } =
      await adminSupabase
        .from("profiles")
        .update({
          must_change_password: false
        })
        .eq("user_id", userId)
        .select("*")
        .single();

    if (updateProfileError) {
      return res.status(500).json({
        error:
          updateProfileError.message ||
          "Senha atualizada, mas houve erro ao atualizar o perfil."
      });
    }

    return res.status(200).json({
      message: "Senha atualizada com sucesso.",
      profile: updatedProfile
    });
  } catch (error) {
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
    const cpf_cnpj = normalizeText(req.body.cpf_cnpj).replace(/\D/g, "");
    const email = normalizeText(req.body.email).toLowerCase();
    const phone = normalizeText(req.body.phone).replace(/\D/g, "");
    const whatsapp = normalizeText(req.body.whatsapp).replace(/\D/g, "");

    if (!full_name || !company_name || !cpf_cnpj || !email) {
      return res.status(400).json({
        error: "Campos obrigatórios: nome do cliente, empresa, CPF/CNPJ e e-mail."
      });
    }

    if (![11, 14].includes(cpf_cnpj.length)) {
      return res.status(400).json({
        error: "CPF/CNPJ inválido."
      });
    }

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
          must_change_password: true
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
      client: insertedProfile,
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
        error: error.message || "Erro ao buscar clientes."
      });
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error("ERRO EM GET /clients:", error);

    res.status(500).json({
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
      client: updatedClient
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

app.post("/admin/documents/upload", (req, res, next) => {
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
    const adminAccess = await validateAdminAccess(req, res);

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

app.put("/admin/documents/:documentId/replace", (req, res, next) => {
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
    const adminAccess = await validateAdminAccess(req, res);

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

    if (profile.is_active === false) {
      return res.status(403).json({
        error: "Cliente inativo. Entre em contato com a administração."
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

    if (profile.is_active === false) {
      return res.status(403).json({
        error: "Cliente inativo. Entre em contato com a administração."
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

app.post("/admin/notices/upload", (req, res, next) => {
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
    const adminAccess = await validateAdminAccess(req, res);

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

app.put("/admin/notices/:noticeId", (req, res, next) => {
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
        error: error.message
      });
    }

    res.json(data || []);
  } catch (err) {
    console.log("ERRO NA ROTA /notices:", err);

    res.status(500).json({
      error: String(err)
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