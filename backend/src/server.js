require('dotenv').config();

console.log("ESTOU NO SERVER CERTO 🚀");
console.log("ARQUIVO EM EXECUÇÃO:", __filename);

const express = require('express');
const { supabase } = require('./services/supabase');

console.log("URL:", process.env.SUPABASE_URL ? "OK" : "NÃO CARREGOU");
console.log("KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "NÃO CARREGOU");

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
   TESTE
================================ */
app.get('/', (req, res) => {
  res.send('Servidor Caseg Protege rodando 🚀');
});

/* ===============================
   PRIMEIRO ACESSO
================================ */
app.post('/primeiro-acesso', async (req, res) => {
  try {
    const {
      company_name,
      full_name,
      cpf_cnpj,
      email,
      password
    } = req.body;

    const { data: userData, error: userError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

    if (userError) {
      return res.status(400).json({ error: userError.message });
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: userData.user.id,
        company_name,
        full_name,
        cpf_cnpj,
        email,
        role: 'client'
      });

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    res.json({ message: 'Cadastro realizado com sucesso!' });

  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/* ===============================
   LOGIN
================================ */
app.post('/login', async (req, res) => {
  try {
    const { cpf_cnpj, password } = req.body;

    if (!cpf_cnpj || !password) {
      return res.status(400).json({
        error: 'cpf_cnpj e password são obrigatórios'
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email, role, full_name, company_name')
      .eq('cpf_cnpj', cpf_cnpj)
      .single();

    if (profileError || !profile) {
      return res.status(400).json({
        error: "CPF/CNPJ não encontrado"
      });
    }

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: profile.email,
        password
      });

    if (authError) {
      return res.status(401).json({
        error: 'Senha inválida'
      });
    }

    res.json({
      message: 'Login realizado com sucesso',
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
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/* ===============================
   BUSCAR DOCUMENTOS (SEGURO)
================================ */
app.get("/documents", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Token não informado."
      });
    }

    const token = authHeader.split(" ")[1];

    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({
        error: "Usuário não autenticado."
      });
    }

    const userId = userData.user.id;

    const { data, error } = await supabase
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

/* ===============================
   DOWNLOAD DOCUMENTO
================================ */
app.post("/documents/download", async (req, res) => {
  console.log("REQUISIÇÃO DE DOWNLOAD RECEBIDA");
  console.log("BODY:", req.body);

  const { file_path } = req.body;

  if (!file_path) {
    return res.status(400).json({
      error: "file_path é obrigatório"
    });
  }

  try {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(file_path.trim(), 60);

    if (error) {
      console.log("ERRO AO GERAR SIGNED URL:", error);

      return res.status(500).json({
        error: error.message
      });
    }

    res.json({
      url: data.signedUrl
    });

  } catch (err) {
    console.log("ERRO INTERNO:", err);

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
    const { data, error } = await supabase
      .from("notices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    const activeNotices = data.filter(notice => notice.is_active === true);

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
console.log("GET /documents");
console.log("POST /documents/download");
console.log("GET /notices");

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});