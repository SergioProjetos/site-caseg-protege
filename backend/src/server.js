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

app.get("/", (req, res) => {
  res.send("Servidor Caseg Protege rodando 🚀");
});

app.post("/primeiro-acesso", async (req, res) => {
  try {
    const {
      company_name,
      full_name,
      cpf_cnpj,
      email,
      password
    } = req.body;

    const { data: userData, error: userError } =
      await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

    if (userError) {
      return res.status(400).json({ error: userError.message });
    }

    const { error: profileError } = await adminSupabase
      .from("profiles")
      .insert({
        user_id: userData.user.id,
        company_name,
        full_name,
        cpf_cnpj,
        email,
        role: "client"
      });

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    res.json({ message: "Cadastro realizado com sucesso!" });
  } catch (error) {
    console.error("ERRO EM /primeiro-acesso:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
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

    console.log("UPLOAD RECEBIDO:");
    console.log("client_id:", clientId);
    console.log("category:", category);
    console.log("subcategory:", subcategory);
    console.log("year:", year);
    console.log("file:", file ? file.originalname : "NÃO");

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

    console.log("USER ID AUTENTICADO /documents:", userId);

    const { data, error } = await adminSupabase
      .from("documents")
      .select("*")
      .eq("client_id", userId)
      .order("year", { ascending: false });

    console.log("DOCUMENTOS RETORNADOS:", data);
    console.log("ERRO DOCUMENTOS:", error);

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

    console.log("DOCUMENT_ID RECEBIDO:", document_id);
    console.log("USER ID LOGADO:", userId);

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

    console.log("DOCUMENTO ENCONTRADO:", documentData);
    console.log("ERRO AO BUSCAR DOCUMENTO:", documentError);

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

    console.log("CAMINHO USADO NO DOWNLOAD:", documentData.file_path);

    const { data, error } = await adminSupabase.storage
      .from("documents")
      .createSignedUrl(documentData.file_path.trim(), 60);

    console.log("RESPOSTA createSignedUrl:", data);
    console.log("ERRO createSignedUrl:", error);

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
   MÓDULO ADMIN DE AVISOS
========================= */

app.get("/admin/clients/:clientId/notices", async (req, res) => {
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

    const { data: clientProfile, error: clientError } = await adminSupabase
      .from("profiles")
      .select("user_id, role")
      .eq("user_id", clientId)
      .eq("role", "client")
      .single();

    if (clientError || !clientProfile) {
      return res.status(404).json({
        error: "Cliente não encontrado."
      });
    }

    const { data, error } = await adminSupabase
      .from("notices")
      .select("id, client_id, title, message, is_active, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message || "Erro ao buscar avisos do cliente."
      });
    }

    return res.status(200).json(data || []);
  } catch (error) {
    console.error("ERRO EM GET /admin/clients/:clientId/notices:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.post("/admin/notices", async (req, res) => {
  try {
    const adminAccess = await validateAdminAccess(req, res);
    if (!adminAccess) {
      return;
    }

    const clientId = normalizeText(req.body.client_id);
    const title = normalizeText(req.body.title);
    const message = normalizeText(req.body.message);
    const isActive = typeof req.body.is_active === "boolean" ? req.body.is_active : true;

    if (!clientId || !title || !message) {
      return res.status(400).json({
        error: "Campos obrigatórios: client_id, title e message."
      });
    }

    const { data: clientProfile, error: clientError } = await adminSupabase
      .from("profiles")
      .select("user_id, role")
      .eq("user_id", clientId)
      .eq("role", "client")
      .single();

    if (clientError || !clientProfile) {
      return res.status(404).json({
        error: "Cliente não encontrado."
      });
    }

    const { data: insertedNotice, error: insertError } = await adminSupabase
      .from("notices")
      .insert({
        client_id: clientId,
        title,
        message,
        is_active: isActive
      })
      .select("id, client_id, title, message, is_active, created_at")
      .single();

    if (insertError) {
      return res.status(500).json({
        error: insertError.message || "Erro ao salvar aviso."
      });
    }

    return res.status(201).json({
      message: "Aviso criado com sucesso.",
      notice: insertedNotice
    });
  } catch (error) {
    console.error("ERRO EM POST /admin/notices:", error);
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
      .select("id, client_id, title, is_active")
      .eq("id", noticeId)
      .single();

    if (currentError || !currentNotice) {
      return res.status(404).json({
        error: "Aviso não encontrado."
      });
    }

    const { data: updatedNotice, error: updateError } = await adminSupabase
      .from("notices")
      .update({
        is_active: isActive
      })
      .eq("id", noticeId)
      .select("id, client_id, title, message, is_active, created_at")
      .single();

    if (updateError || !updatedNotice) {
      return res.status(500).json({
        error: updateError?.message || "Erro ao atualizar status do aviso."
      });
    }

    return res.status(200).json({
      message: "Status do aviso atualizado com sucesso.",
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
      .select("id, client_id, title")
      .eq("id", noticeId)
      .single();

    if (currentError || !currentNotice) {
      return res.status(404).json({
        error: "Aviso não encontrado."
      });
    }

    const { error: deleteError } = await adminSupabase
      .from("notices")
      .delete()
      .eq("id", noticeId);

    if (deleteError) {
      return res.status(500).json({
        error: deleteError.message || "Erro ao excluir aviso."
      });
    }

    return res.status(200).json({
      message: "Aviso excluído com sucesso."
    });
  } catch (error) {
    console.error("ERRO EM DELETE /admin/notices/:noticeId:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.get("/notices", async (req, res) => {
  try {
    const authResult = await getAuthenticatedUser(req);

    if (authResult.error) {
      return res.status(authResult.status).json({
        error: authResult.error
      });
    }

    const userId = authResult.user.id;

    const { data, error } = await adminSupabase
      .from("notices")
      .select("*")
      .eq("client_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    console.log("AVISOS RETORNADOS:", data);
    console.log("ERRO AVISOS:", error);

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
console.log("POST /primeiro-acesso");
console.log("POST /login");
console.log("POST /clients");
console.log("GET /clients");
console.log("GET /clients/:clientId/documents");
console.log("POST /admin/documents/upload");
console.log("PUT /admin/documents/:documentId/replace");
console.log("GET /documents");
console.log("POST /documents/download");
console.log("POST /admin/documents/download");
console.log("DELETE /admin/documents/:documentId");
console.log("GET /admin/clients/:clientId/notices");
console.log("POST /admin/notices");
console.log("PUT /admin/notices/:noticeId/toggle");
console.log("DELETE /admin/notices/:noticeId");
console.log("GET /notices");

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});