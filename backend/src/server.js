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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

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
      .select("user_id, email, role, full_name, company_name, must_change_password")
      .eq("cpf_cnpj", cpf_cnpj)
      .single();

    if (profileError || !profile) {
      return res.status(400).json({
        error: "CPF/CNPJ não encontrado"
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
        must_change_password: profile.must_change_password
      },
      session: authData.session
    });
  } catch (error) {
    console.error("ERRO EM /login:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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
        role: "client"
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

    const documentFilePaths = (clientDocuments || []).map((doc) => doc.file_path).filter(Boolean);
    const storageRemoveError = await removeStorageFiles("documents", documentFilePaths);

    if (storageRemoveError) {
      return res.status(500).json({
        error: storageRemoveError.message || "Erro ao excluir arquivos do cliente no storage."
      });
    }

    const { error: deleteDocumentsError } = await adminSupabase
      .from("documents")
      .delete()
      .eq("client_id", clientId);

    if (deleteDocumentsError) {
      return res.status(500).json({
        error: deleteDocumentsError.message || "Erro ao excluir documentos do cliente."
      });
    }

    const { error: deleteProfileError } = await adminSupabase
      .from("profiles")
      .delete()
      .eq("user_id", clientId);

    if (deleteProfileError) {
      return res.status(500).json({
        error: deleteProfileError.message || "Erro ao excluir perfil do cliente."
      });
    }

    const { error: deleteAuthError } = await adminSupabase.auth.admin.deleteUser(clientId);

    if (deleteAuthError) {
      return res.status(500).json({
        error: deleteAuthError.message || "Erro ao excluir usuário do Auth."
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
    const file = req.file;

    if (!clientId || !category || !year || !file) {
      return res.status(400).json({
        error: "Campos obrigatórios: client_id, category, year e file."
      });
    }

    const { data: clientProfile, error: clientProfileError } = await adminSupabase
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

    const { data: duplicateDocument, error: duplicateError } = await findDuplicateDocument({
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
        error: "Já existe um documento com o mesmo nome do arquivo, categoria, subcategoria e ano para este cliente."
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
        error: uploadError.message || "Erro ao enviar arquivo para o storage."
      });
    }

    const { data: insertedDocument, error: insertError } = await adminSupabase
      .from("documents")
      .insert({
        client_id: clientId,
        file_name: file.originalname,
        file_path: storagePath,
        category,
        subcategory,
        year
      })
      .select("id, client_id, file_name, category, subcategory, year, created_at")
      .single();

    if (insertError) {
      await adminSupabase.storage.from("documents").remove([storagePath]);

      return res.status(500).json({
        error: insertError.message || "Erro ao salvar documento no banco."
      });
    }

    return res.status(201).json({
      message: "Documento enviado com sucesso.",
      document: insertedDocument
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/documents/upload:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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

    const { data: currentDocument, error: currentDocumentError } = await adminSupabase
      .from("documents")
      .select(`
        id,
        client_id,
        file_name,
        file_path,
        category,
        subcategory,
        year
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
        error: uploadError.message || "Erro ao enviar o novo arquivo para o storage."
      });
    }

    const { data: updatedDocument, error: updateError } = await adminSupabase
      .from("documents")
      .update({
        file_name: file.originalname,
        file_path: storagePath
      })
      .eq("id", documentId)
      .select("id, client_id, file_name, category, subcategory, year, created_at")
      .single();

    if (updateError || !updatedDocument) {
      await adminSupabase.storage.from("documents").remove([storagePath]);

      return res.status(500).json({
        error: updateError?.message || "Erro ao atualizar documento no banco."
      });
    }

    if (currentDocument.file_path) {
      const { error: removeOldFileError } = await adminSupabase.storage
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
    res.status(500).json({ error: "Erro interno do servidor" });
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
      .select("*")
      .eq("client_id", userId)
      .order("year", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    res.json(data);
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

    const { data: documentData, error: documentError } = await adminSupabase
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

    const { data: documentData, error: documentError } = await adminSupabase
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
        error: error.message || "Erro ao gerar link temporário do documento."
      });
    }

    return res.status(200).json({
      url: data.signedUrl
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/documents/download:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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

    const { data: documentData, error: documentError } = await adminSupabase
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
      const { error: storageError } = await adminSupabase.storage
        .from("documents")
        .remove([documentData.file_path.trim()]);

      if (storageError) {
        return res.status(500).json({
          error: storageError.message || "Erro ao excluir arquivo do storage."
        });
      }
    }

    const { error: deleteDbError } = await adminSupabase
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (deleteDbError) {
      return res.status(500).json({
        error: deleteDbError.message || "Erro ao excluir documento do banco."
      });
    }

    return res.status(200).json({
      message: "Documento excluído com sucesso."
    });
  } catch (error) {
    console.error("ERRO EM DELETE /admin/documents/:documentId:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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
      .select("id, title, image_url, link, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message || "Erro ao buscar banners da Home."
      });
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error("ERRO EM GET /admin/notices:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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
    const isActive = String(req.body.is_active).toLowerCase() === "true";
    const image = req.file;

    if (!title || !image) {
      return res.status(400).json({
        error: "Campos obrigatórios: title e image."
      });
    }

    if (!image.mimetype.startsWith("image/")) {
      return res.status(400).json({
        error: "O arquivo enviado deve ser uma imagem válida."
      });
    }

    const sanitizedFileName = sanitizeFileName(image.originalname);
    const timestamp = Date.now();
    const storagePath = `home-banners/${timestamp}_${sanitizedFileName}`;

    const { error: uploadError } = await adminSupabase.storage
      .from("notices")
      .upload(storagePath, image.buffer, {
        contentType: image.mimetype,
        upsert: false
      });

    if (uploadError) {
      return res.status(500).json({
        error: uploadError.message || "Erro ao enviar imagem do banner para o storage."
      });
    }

    const { data: publicUrlData } = adminSupabase.storage
      .from("notices")
      .getPublicUrl(storagePath);

    const imageUrl = publicUrlData?.publicUrl || null;

    if (!imageUrl) {
      await adminSupabase.storage.from("notices").remove([storagePath]);

      return res.status(500).json({
        error: "Não foi possível gerar a URL pública da imagem do banner."
      });
    }

    const { data: insertedNotice, error: insertError } = await adminSupabase
      .from("notices")
      .insert({
        title,
        image_url: imageUrl,
        link,
        is_active: isActive
      })
      .select("id, title, image_url, link, is_active, created_at")
      .single();

    if (insertError) {
      await adminSupabase.storage.from("notices").remove([storagePath]);

      return res.status(500).json({
        error: insertError.message || "Erro ao salvar banner no banco."
      });
    }

    return res.status(201).json({
      message: "Banner da Home criado com sucesso.",
      notice: insertedNotice
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/notices/upload:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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

    const { data: currentNotice, error: currentError } = await adminSupabase
      .from("notices")
      .select("id, title, is_active")
      .eq("id", noticeId)
      .single();

    if (currentError || !currentNotice) {
      return res.status(404).json({
        error: "Banner não encontrado."
      });
    }

    const { data: updatedNotice, error: updateError } = await adminSupabase
      .from("notices")
      .update({
        is_active: isActive
      })
      .eq("id", noticeId)
      .select("id, title, image_url, link, is_active, created_at")
      .single();

    if (updateError || !updatedNotice) {
      return res.status(500).json({
        error: updateError?.message || "Erro ao atualizar status do banner."
      });
    }

    return res.status(200).json({
      message: "Status do banner atualizado com sucesso.",
      notice: updatedNotice
    });
  } catch (error) {
    console.error("ERRO EM PUT /admin/notices/:noticeId/toggle:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
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

    const { data: currentNotice, error: currentError } = await adminSupabase
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
      const marker = "/storage/v1/object/public/notices/";
      const splitPath = currentNotice.image_url.split(marker);
      const filePath = splitPath.length > 1 ? splitPath[1] : null;

      if (filePath) {
        const { error: removeImageError } = await adminSupabase.storage
          .from("notices")
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
        error: deleteError.message || "Erro ao excluir banner."
      });
    }

    return res.status(200).json({
      message: "Banner excluído com sucesso."
    });
  } catch (error) {
    console.error("ERRO EM DELETE /admin/notices/:noticeId:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.get("/notices", async (req, res) => {
  try {
    const { data, error } = await adminSupabase
      .from("notices")
      .select("id, title, image_url, link, is_active, created_at")
      .eq("is_active", true)
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
console.log("PUT /update-password");
console.log("POST /clients");
console.log("GET /clients");
console.log("DELETE /admin/clients/:clientId");
console.log("GET /clients/:clientId/documents");
console.log("POST /admin/documents/upload");
console.log("PUT /admin/documents/:documentId/replace");
console.log("GET /documents");
console.log("POST /documents/download");
console.log("POST /admin/documents/download");
console.log("DELETE /admin/documents/:documentId");
console.log("GET /admin/notices");
console.log("POST /admin/notices/upload");
console.log("PUT /admin/notices/:noticeId/toggle");
console.log("DELETE /admin/notices/:noticeId");
console.log("GET /notices");

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});