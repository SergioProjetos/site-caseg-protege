require("dotenv").config();

console.log("ESTOU NO SERVER CERTO 🚀");
console.log("ARQUIVO EM EXECUÇÃO:", __filename);

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

console.log("URL:", process.env.SUPABASE_URL ? "OK" : "NÃO CARREGOU");
console.log("SERVICE ROLE KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "NÃO CARREGOU");
console.log("ANON KEY:", process.env.SUPABASE_ANON_KEY ? "OK" : "NÃO CARREGOU");

/* ===============================
   CLIENTES SUPABASE
================================ */
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

/* ===============================
   CORS (PERMITIR FRONTEND)
================================ */
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

/* ===============================
   FUNÇÃO AUXILIAR - VALIDAR USUÁRIO PELO TOKEN
================================ */
async function getAuthenticatedUser(req) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        error: "Token não informado.",
        status: 401
      };
    }

    const token = authHeader.split(" ")[1];

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

/* ===============================
   FUNÇÃO AUXILIAR - BUSCAR PERFIL
================================ */
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

/* ===============================
   TESTE
================================ */
app.get("/", (req, res) => {
  res.send("Servidor Caseg Protege rodando 🚀");
});

/* ===============================
   PRIMEIRO ACESSO
================================ */
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

/* ===============================
   LOGIN
================================ */
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
      .select("user_id, email, role, full_name, company_name")
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
        email: profile.email
      },
      session: authData.session
    });
  } catch (error) {
    console.error("ERRO EM /login:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

/* ===============================
   CADASTRAR CLIENTE (BASE SEGURA ADMIN)
================================ */
app.post("/clients", async (req, res) => {
  try {
    const authResult = await getAuthenticatedUser(req);

    if (authResult.error) {
      return res.status(authResult.status).json({
        error: authResult.error
      });
    }

    const adminUserId = authResult.user.id;

    const profileResult = await getUserProfile(adminUserId);

    if (profileResult.error) {
      return res.status(profileResult.status).json({
        error: profileResult.error
      });
    }

    const adminProfile = profileResult.profile;

    if (adminProfile.role !== "admin") {
      return res.status(403).json({
        error: "Acesso restrito a administradores."
      });
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

    return res.status(200).json({
      message: "Dados recebidos com sucesso. Próximo passo: criar usuário no Auth e salvar perfil.",
      payload: {
        full_name,
        company_name,
        cpf_cnpj,
        email,
        role: "client",
        address_zip: address_zip || null,
        address_street: address_street || null,
        address_number: address_number || null,
        address_complement: address_complement || null,
        address_neighborhood: address_neighborhood || null,
        address_city: address_city || null,
        address_state: address_state || null,
        phone: phone || null,
        whatsapp: whatsapp || null
      }
    });
  } catch (error) {
    console.error("ERRO EM /clients:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

/* ===============================
   BUSCAR DOCUMENTOS (SEGURO)
================================ */
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

/* ===============================
   DOWNLOAD DOCUMENTO (SEGURO)
================================ */
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

/* ===============================
   BUSCAR AVISOS
================================ */
app.get("/notices", async (req, res) => {
  try {
    const { data, error } = await adminSupabase
      .from("notices")
      .select("*")
      .order("created_at", { ascending: false });

    console.log("AVISOS RETORNADOS:", data);
    console.log("ERRO AVISOS:", error);

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    const activeNotices = data.filter(notice => notice.is_active == true);

    res.json(activeNotices);
  } catch (err) {
    console.log("ERRO NA ROTA /notices:", err);

    res.status(500).json({
      error: String(err)
    });
  }
});

/* ===============================
   START SERVER
================================ */
console.log("Rotas configuradas:");
console.log("GET /");
console.log("POST /primeiro-acesso");
console.log("POST /login");
console.log("POST /clients");
console.log("GET /documents");
console.log("POST /documents/download");
console.log("GET /notices");

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});