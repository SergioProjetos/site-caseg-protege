require("dotenv").config();

console.log("ESTOU NO SERVER CERTO 🚀");
console.log("ARQUIVO EM EXECUÇÃO:", __filename);

const express = require("express");
const multer = require("multer");
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

const ALLOWED_BANNER_SIZES = [
  { width: 1920, height: 600 },
  { width: 1600, height: 500 }
];

function isAllowedBannerSize(width, height) {
  return ALLOWED_BANNER_SIZES.some((size) => {
    return size.width === width && size.height === height;
  });
}

function getBannerSizeErrorMessage() {
  return "A imagem do banner precisa estar exatamente em 1920x600px ou 1600x500px.";
}

function getImageDimensionsFromBuffer(buffer) {
  if (!buffer || buffer.length < 24) {
    return null;
  }

  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  if (isPng) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;

  if (isJpeg) {
    let offset = 2;

    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }

      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);

      if (
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3 ||
        marker === 0xc5 ||
        marker === 0xc6 ||
        marker === 0xc7 ||
        marker === 0xc9 ||
        marker === 0xca ||
        marker === 0xcb ||
        marker === 0xcd ||
        marker === 0xce ||
        marker === 0xcf
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        };
      }

      offset += 2 + length;
    }
  }

  const isWebp =
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  if (isWebp) {
    const chunkType = buffer.toString("ascii", 12, 16);

    if (chunkType === "VP8X" && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);

      return { width, height };
    }

    if (chunkType === "VP8 " && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;

      return { width, height };
    }

    if (chunkType === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;

      return { width, height };
    }
  }

  return null;
}

function validateBannerImageDimensions(image) {
  const dimensions = getImageDimensionsFromBuffer(image?.buffer);

  if (!dimensions) {
    return {
      valid: false,
      error: "Não foi possível identificar a resolução da imagem. Use PNG, JPG, JPEG ou WEBP em 1920x600px ou 1600x500px."
    };
  }

  if (!isAllowedBannerSize(dimensions.width, dimensions.height)) {
    return {
      valid: false,
      error: `${getBannerSizeErrorMessage()} Resolução enviada: ${dimensions.width}x${dimensions.height}px.`
    };
  }

  return {
    valid: true,
    dimensions
  };
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

app.get("/", (req, res) => {
  res.send("Servidor Caseg Protege rodando 🚀");
});

app.post("/login", async (req, res) => {
  try {
    const { cpf_cnpj, password } = req.body;

    if (!cpf_cnpj || !password) {
      return res.status(400).json({
        error: "cpf_cnpj e password são obrigatórios"
      });
    }

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("user_id, email, role, full_name, company_name, must_change_password, is_active")
      .eq("cpf_cnpj", cpf_cnpj)
      .single();

    if (profileError || !profile) {
      return res.status(400).json({
        error: "CPF/CNPJ não encontrado"
      });
    }

    if (profile.role === "client" && profile.is_active === false) {
      return res.status(403).json({
        error: "Este cliente está inativo. Entre em contato com a administração."
      });
    }

    const { data: authData, error: authError } =
      await publicSupabase.auth.signInWithPassword({
        email: profile.email,
        password
      });

    if (authError) {
      return res.status(401).json({
        error: "Senha inválida"
      });
    }

    res.json({
      message: "Login realizado com sucesso",
      profile: {
        user_id: profile.user_id,
        cpf_cnpj,
        role: profile.role,
        full_name: profile.full_name,
        company_name: profile.company_name,
        email: profile.email,
        must_change_password: profile.must_change_password,
        is_active: profile.is_active
      },
      session: authData.session
    });
  } catch (error) {
    console.error("ERRO EM /login:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.post("/admin/refresh-session", async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: "refresh_token é obrigatório."
      });
    }

    const sessionSupabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    const { data, error } = await sessionSupabase.auth.refreshSession({
      refresh_token
    });

    if (error || !data || !data.session || !data.user) {
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
        error: "A renovação automática é permitida apenas para administradores."
      });
    }

    return res.status(200).json({
      message: "Sessão administrativa renovada com sucesso.",
      profile: {
        user_id: profile.user_id,
        cpf_cnpj: profile.cpf_cnpj,
        role: profile.role,
        full_name: profile.full_name,
        company_name: profile.company_name,
        email: profile.email,
        must_change_password: profile.must_change_password,
        is_active: profile.is_active
      },
      session: data.session
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/refresh-session:", error);

    return res.status(500).json({
      error: "Erro interno ao renovar sessão administrativa."
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

    const userId = authResult.user.id;
    const { new_password } = req.body;
    const normalizedPassword = String(new_password || "").trim();

    if (!normalizedPassword) {
      return res.status(400).json({
        error: "new_password é obrigatório."
      });
    }

    if (!isStrongPassword(normalizedPassword)) {
      return res.status(400).json({
        error: "A nova senha deve ter no mínimo 8 caracteres, 1 letra maiúscula e 1 número."
      });
    }

    const profileResult = await getUserProfile(userId);

    if (profileResult.error) {
      return res.status(profileResult.status).json({
        error: profileResult.error
      });
    }

    const profile = profileResult.profile;

    if (profile.role !== "client") {
      return res.status(403).json({
        error: "Apenas clientes podem atualizar a senha por esta rota."
      });
    }

    const { error: updateAuthError } = await adminSupabase.auth.admin.updateUserById(
      userId,
      {
        password: normalizedPassword
      }
    );

    if (updateAuthError) {
      return res.status(500).json({
        error: updateAuthError.message || "Erro ao atualizar senha no Auth."
      });
    }

    const { error: updateProfileError } = await adminSupabase
      .from("profiles")
      .update({
        must_change_password: false
      })
      .eq("user_id", userId);

    if (updateProfileError) {
      return res.status(500).json({
        error: updateProfileError.message || "Erro ao atualizar perfil do usuário."
      });
    }

    return res.status(200).json({
      message: "Senha atualizada com sucesso."
    });
  } catch (error) {
    console.error("ERRO EM PUT /update-password:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.post("/clients", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);
    if (!adminAccess) {
      return;
    }

    const {
      full_name,
      company_name,
      cpf_cnpj,
      email,
      role,
      address_zip,
      address_street,
      address_number,
      address_complement,
      address_neighborhood,
      address_city,
      address_state,
      phone,
      whatsapp
    } = req.body;

    if (!full_name || !company_name || !cpf_cnpj || !email) {
      return res.status(400).json({
        error: "Campos obrigatórios: full_name, company_name, cpf_cnpj e email."
      });
    }

    if (role && role !== "client") {
      return res.status(400).json({
        error: "Esta rota permite apenas cadastro com role = client."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCpfCnpj = String(cpf_cnpj).trim();
    const normalizedZip = address_zip ? String(address_zip).trim() : null;
    const normalizedPhone = phone ? String(phone).trim() : null;
    const normalizedWhatsapp = whatsapp ? String(whatsapp).trim() : null;

    const { data: existingProfiles, error: existingProfilesError } = await adminSupabase
      .from("profiles")
      .select("user_id, email, cpf_cnpj")
      .or(`email.eq.${normalizedEmail},cpf_cnpj.eq.${normalizedCpfCnpj}`);

    if (existingProfilesError) {
      return res.status(500).json({
        error: "Erro ao verificar duplicidade de cliente."
      });
    }

    if (existingProfiles && existingProfiles.length > 0) {
      return res.status(400).json({
        error: "Já existe um cliente com este e-mail ou CPF/CNPJ."
      });
    }

    const temporaryPassword = generateTemporaryPassword();

    const { data: createdUserData, error: createUserError } =
      await adminSupabase.auth.admin.createUser({
        email: normalizedEmail,
        password: temporaryPassword,
        email_confirm: true
      });

    if (createUserError || !createdUserData || !createdUserData.user) {
      return res.status(400).json({
        error: createUserError?.message || "Erro ao criar usuário no Auth."
      });
    }

    const newUserId = createdUserData.user.id;

    const { error: insertProfileError } = await adminSupabase
      .from("profiles")
      .insert({
        user_id: newUserId,
        full_name,
        company_name,
        cpf_cnpj: normalizedCpfCnpj,
        email: normalizedEmail,
        role: "client",
        must_change_password: true,
        is_active: true,
        address_zip: normalizedZip,
        address_street: address_street || null,
        address_number: address_number || null,
        address_complement: address_complement || null,
        address_neighborhood: address_neighborhood || null,
        address_city: address_city || null,
        address_state: address_state || null,
        phone: normalizedPhone,
        whatsapp: normalizedWhatsapp
      });

    if (insertProfileError) {
      await adminSupabase.auth.admin.deleteUser(newUserId);

      return res.status(400).json({
        error: insertProfileError.message || "Erro ao salvar perfil do cliente."
      });
    }

    return res.status(201).json({
      message: "Cliente cadastrado com sucesso.",
      client: {
        user_id: newUserId,
        full_name,
        company_name,
        cpf_cnpj: normalizedCpfCnpj,
        email: normalizedEmail,
        role: "client",
        is_active: true
      },
      temporary_password: temporaryPassword
    });
  } catch (error) {
    console.error("ERRO EM /clients:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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
      .select(`
        user_id,
        full_name,
        company_name,
        cpf_cnpj,
        email,
        phone,
        whatsapp,
        role,
        is_active,
        created_at
      `)
      .eq("role", "client")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message || "Erro ao listar clientes."
      });
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error("ERRO EM GET /clients:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.put("/admin/clients/:clientId/status", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);
    if (!adminAccess) {
      return;
    }

    const { clientId } = req.params;
    const { is_active } = req.body;

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

    const { data: currentClient, error: currentClientError } = await adminSupabase
      .from("profiles")
      .select("user_id, full_name, role, is_active")
      .eq("user_id", clientId)
      .eq("role", "client")
      .single();

    if (currentClientError || !currentClient) {
      return res.status(404).json({
        error: "Cliente não encontrado."
      });
    }

    const { data: updatedClient, error: updateError } = await adminSupabase
      .from("profiles")
      .update({
        is_active
      })
      .eq("user_id", clientId)
      .eq("role", "client")
      .select(`
        user_id,
        full_name,
        company_name,
        cpf_cnpj,
        email,
        phone,
        whatsapp,
        role,
        is_active,
        created_at
      `)
      .single();

    if (updateError || !updatedClient) {
      return res.status(500).json({
        error: updateError?.message || "Erro ao atualizar status do cliente."
      });
    }

    return res.status(200).json({
      message: "Status do cliente atualizado com sucesso.",
      client: updatedClient
    });
  } catch (error) {
    console.error("ERRO EM PUT /admin/clients/:clientId/status:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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

    const { data: clientProfile, error: clientProfileError } = await adminSupabase
      .from("profiles")
      .select("user_id, full_name, role")
      .eq("user_id", clientId)
      .eq("role", "client")
      .single();

    if (clientProfileError || !clientProfile) {
      return res.status(404).json({
        error: "Cliente não encontrado."
      });
    }

    const { data: clientDocuments, error: documentsError } = await adminSupabase
      .from("documents")
      .select("id, file_path")
      .eq("client_id", clientId);

    if (documentsError) {
      return res.status(500).json({
        error: documentsError.message || "Erro ao buscar documentos do cliente."
      });
    }

    const documentFilePaths = (clientDocuments || [])
      .map((doc) => doc.file_path)
      .filter(Boolean);

    const storageRemoveError = await removeStorageFiles(
      "documents",
      documentFilePaths
    );

    if (storageRemoveError) {
      return res.status(500).json({
        error:
          storageRemoveError.message ||
          "Erro ao excluir arquivos do cliente no storage."
      });
    }

    const { error: deleteDocumentsError } = await adminSupabase
      .from("documents")
      .delete()
      .eq("client_id", clientId);

    if (deleteDocumentsError) {
      return res.status(500).json({
        error:
          deleteDocumentsError.message ||
          "Erro ao excluir documentos do cliente."
      });
    }

    const { error: deleteProfileError } = await adminSupabase
      .from("profiles")
      .delete()
      .eq("user_id", clientId);

    if (deleteProfileError) {
      return res.status(500).json({
        error:
          deleteProfileError.message ||
          "Erro ao excluir perfil do cliente."
      });
    }

    const { error: deleteAuthError } =
      await adminSupabase.auth.admin.deleteUser(clientId);

    if (deleteAuthError) {
      return res.status(500).json({
        error:
          deleteAuthError.message ||
          "Erro ao excluir usuário do Auth."
      });
    }

    return res.status(200).json({
      message: "Cliente excluído com sucesso."
    });
  } catch (error) {
    console.error("ERRO EM DELETE /admin/clients/:clientId:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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
      .select(`
        id,
        client_id,
        file_name,
        category,
        subcategory,
        year,
        release_date,
        expiration_date,
        created_at
      `)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message || "Erro ao buscar documentos do cliente."
      });
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error("ERRO EM GET /clients/:clientId/documents:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.get("/admin/documents/renewal-alerts", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const warningDays = 30;

    const { data: documents, error: documentsError } = await adminSupabase
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
        created_at
      `)
      .not("expiration_date", "is", null)
      .order("expiration_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (documentsError) {
      return res.status(500).json({
        error:
          documentsError.message ||
          "Erro ao buscar documentos para avisos de renovação."
      });
    }

    const safeDocuments = Array.isArray(documents) ? documents : [];

    const clientIds = [
      ...new Set(
        safeDocuments
          .map((documentItem) => documentItem.client_id)
          .filter(Boolean)
      )
    ];

    let clientsMap = new Map();

    if (clientIds.length) {
      const { data: clients, error: clientsError } = await adminSupabase
        .from("profiles")
        .select("user_id, full_name, company_name, role, is_active")
        .in("user_id", clientIds);

      if (clientsError) {
        return res.status(500).json({
          error:
            clientsError.message ||
            "Erro ao buscar clientes dos avisos de renovação."
        });
      }

      clientsMap = new Map(
        (clients || []).map((client) => {
          return [client.user_id, client];
        })
      );
    }

    const latestDocumentsMap = new Map();

    safeDocuments.forEach((documentItem) => {
      if (!documentItem.client_id || !documentItem.expiration_date) {
        return;
      }

      const groupKey = getDocumentGroupKey(documentItem);
      const currentDocument = latestDocumentsMap.get(groupKey);

      if (!currentDocument) {
        latestDocumentsMap.set(groupKey, documentItem);
        return;
      }

      const comparison = compareDocumentsByLatest(documentItem, currentDocument);

      if (comparison > 0) {
        latestDocumentsMap.set(groupKey, documentItem);
      }
    });

    const alerts = Array.from(latestDocumentsMap.values())
      .map((documentItem) => {
        const renewalInfo = getRenewalStatusInfo(documentItem.expiration_date);

        if (!renewalInfo) {
          return null;
        }

        if (renewalInfo.days_until_expiration > warningDays) {
          return null;
        }

        const client = clientsMap.get(documentItem.client_id) || {};

        return {
          id: documentItem.id,
          document_id: documentItem.id,
          client_id: documentItem.client_id,
          client_name: client.full_name || "-",
          company_name: client.company_name || "-",
          client_is_active: client.is_active !== false,
          file_name: documentItem.file_name,
          category: documentItem.category,
          subcategory: documentItem.subcategory,
          year: documentItem.year,
          release_date: documentItem.release_date,
          expiration_date: documentItem.expiration_date,
          created_at: documentItem.created_at,
          status: renewalInfo.status,
          days_until_expiration: renewalInfo.days_until_expiration,
          deadline_label: renewalInfo.deadline_label,
          observation: renewalInfo.observation
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.days_until_expiration !== b.days_until_expiration) {
          return a.days_until_expiration - b.days_until_expiration;
        }

        return String(a.company_name || "").localeCompare(
          String(b.company_name || ""),
          "pt-BR"
        );
      });

    return res.status(200).json({
      warning_days: warningDays,
      total: alerts.length,
      alerts
    });
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
        error: "Erro ao processar o arquivo enviado."
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

    const clientId = normalizeText(req.body.client_id);
    const category = normalizeText(req.body.category);
    const subcategory = normalizeOptionalText(req.body.subcategory);
    const year = normalizeText(req.body.year);
    const releaseDate = normalizeDateInput(req.body.release_date);
    const expirationDate = normalizeDateInput(req.body.expiration_date);
    const file = req.file;

    if (!clientId || !category || !year || !releaseDate || !expirationDate || !file) {
      return res.status(400).json({
        error:
          "Campos obrigatórios: client_id, category, year, release_date, expiration_date e file."
      });
    }

    if (req.body.release_date && !releaseDate) {
      return res.status(400).json({
        error: "A data de lançamento deve estar no formato válido."
      });
    }

    if (req.body.expiration_date && !expirationDate) {
      return res.status(400).json({
        error: "A data de validade deve estar no formato válido."
      });
    }

    if (isExpirationDateBeforeReleaseDate(releaseDate, expirationDate)) {
      return res.status(400).json({
        error: "A data de validade não pode ser menor que a data de lançamento."
      });
    }

    const { data: clientProfile, error: clientProfileError } =
      await adminSupabase
        .from("profiles")
        .select("user_id, full_name, company_name, role")
        .eq("user_id", clientId)
        .eq("role", "client")
        .single();

    if (clientProfileError || !clientProfile) {
      return res.status(404).json({
        error: "Cliente não encontrado."
      });
    }

    const {
      data: duplicateDocument,
      error: duplicateError
    } = await findDuplicateDocument({
      clientId,
      category,
      subcategory,
      year,
      fileName: file.originalname
    });

    if (duplicateError) {
      return res.status(500).json({
        error: "Erro ao verificar duplicidade do documento."
      });
    }

    if (duplicateDocument) {
      return res.status(400).json({
        error:
          "Já existe um documento com o mesmo nome do arquivo, categoria, subcategoria e ano para este cliente."
      });
    }

    const sanitizedFileName = sanitizeFileName(file.originalname);
    const timestamp = Date.now();

    const storagePath = `${clientId}/${year}/${timestamp}_${sanitizedFileName}`;

    const { error: uploadError } = await adminSupabase.storage
      .from("documents")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
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
          client_id: clientId,
          file_name: file.originalname,
          file_path: storagePath,
          category,
          subcategory,
          year,
          release_date: releaseDate,
          expiration_date: expirationDate
        })
        .select(
          "id, client_id, file_name, category, subcategory, year, release_date, expiration_date, created_at"
        )
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

    return res.status(201).json({
      message: "Documento enviado com sucesso.",
      document: insertedDocument
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/documents/upload:", error);

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
        error: "Erro ao processar o arquivo enviado."
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

    if (!documentId) {
      return res.status(400).json({
        error: "documentId é obrigatório."
      });
    }

    if (!file) {
      return res.status(400).json({
        error: "É obrigatório selecionar um novo arquivo."
      });
    }

    const { data: currentDocument, error: currentDocumentError } =
      await adminSupabase
        .from("documents")
        .select(`
          id,
          client_id,
          file_name,
          file_path,
          category,
          subcategory,
          year,
          release_date,
          expiration_date
        `)
        .eq("id", documentId)
        .single();

    if (currentDocumentError || !currentDocument) {
      return res.status(404).json({
        error: "Documento não encontrado."
      });
    }

    const sanitizedFileName = sanitizeFileName(file.originalname);
    const timestamp = Date.now();

    const storagePath = `${currentDocument.client_id}/${currentDocument.year}/${timestamp}_${sanitizedFileName}`;

    const { error: uploadError } = await adminSupabase.storage
      .from("documents")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) {
      return res.status(500).json({
        error:
          uploadError.message ||
          "Erro ao enviar o novo arquivo para o storage."
      });
    }

    const { data: updatedDocument, error: updateError } =
      await adminSupabase
        .from("documents")
        .update({
          file_name: file.originalname,
          file_path: storagePath
        })
        .eq("id", documentId)
        .select(
          "id, client_id, file_name, category, subcategory, year, release_date, expiration_date, created_at"
        )
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
          .remove([currentDocument.file_path.trim()]);

      if (removeOldFileError) {
        console.error("ERRO AO REMOVER ARQUIVO ANTIGO:", removeOldFileError);
      }
    }

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

    const { data, error } = await adminSupabase
      .from("documents")
      .select(`
        id,
        client_id,
        file_name,
        category,
        subcategory,
        year,
        created_at
      `)
      .eq("client_id", userId)
      .order("year", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    res.json(data || []);
  } catch (err) {
    console.error("ERRO AO BUSCAR DOCUMENTOS:", err);

    res.status(500).json({
      error: "Erro ao buscar documentos."
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
    const { document_id } = req.body;

    if (!document_id) {
      return res.status(400).json({
        error: "document_id é obrigatório."
      });
    }

    const { data: documentData, error: documentError } =
      await adminSupabase
        .from("documents")
        .select("id, client_id, file_path, file_name")
        .eq("id", document_id)
        .single();

    if (documentError || !documentData) {
      return res.status(404).json({
        error: "Documento não encontrado."
      });
    }

    if (documentData.client_id !== userId) {
      return res.status(403).json({
        error: "Acesso negado a este documento."
      });
    }

    const { data, error } = await adminSupabase.storage
      .from("documents")
      .createSignedUrl(documentData.file_path.trim(), 60);

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    res.json({
      url: data.signedUrl
    });
  } catch (err) {
    console.error("ERRO AO GERAR DOWNLOAD:", err);

    res.status(500).json({
      error: "Erro ao gerar link do documento."
    });
  }
});

app.post("/admin/documents/download", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);

    if (!adminAccess) {
      return;
    }

    const { document_id } = req.body;

    if (!document_id) {
      return res.status(400).json({
        error: "document_id é obrigatório."
      });
    }

    const { data: documentData, error: documentError } =
      await adminSupabase
        .from("documents")
        .select("id, client_id, file_path, file_name")
        .eq("id", document_id)
        .single();

    if (documentError || !documentData) {
      return res.status(404).json({
        error: "Documento não encontrado."
      });
    }

    if (!documentData.file_path) {
      return res.status(400).json({
        error: "Este documento não possui caminho de arquivo válido."
      });
    }

    const { data, error } = await adminSupabase.storage
      .from("documents")
      .createSignedUrl(documentData.file_path.trim(), 60);

    if (error) {
      return res.status(500).json({
        error:
          error.message ||
          "Erro ao gerar link temporário do documento."
      });
    }

    return res.status(200).json({
      url: data.signedUrl
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
        .select("id, file_path, file_name")
        .eq("id", documentId)
        .single();

    if (documentError || !documentData) {
      return res.status(404).json({
        error: "Documento não encontrado."
      });
    }

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

    const imageValidation = validateBannerImageDimensions(image);

    if (!imageValidation.valid) {
      return res.status(400).json({
        error: imageValidation.error
      });
    }

    const sanitizedFileName = sanitizeFileName(image.originalname);
    const timestamp = Date.now();

    const storagePath = `home-banners/${timestamp}_${sanitizedFileName}`;

    const { error: uploadError } = await adminSupabase.storage
      .from("banners")
      .upload(storagePath, image.buffer, {
        contentType: image.mimetype,
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
        .select("id, title, image_url, display_order")
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

      const imageValidation = validateBannerImageDimensions(image);

      if (!imageValidation.valid) {
        return res.status(400).json({
          error: imageValidation.error
        });
      }

      const sanitizedFileName = sanitizeFileName(image.originalname);
      const timestamp = Date.now();

      newStoragePath = `home-banners/${timestamp}_${sanitizedFileName}`;

      const { error: uploadError } = await adminSupabase.storage
        .from("banners")
        .upload(newStoragePath, image.buffer, {
          contentType: image.mimetype,
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
});