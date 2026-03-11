require('dotenv').config();

console.log("ESTOU NO SERVER CERTO 🚀");
console.log("ARQUIVO EM EXECUÇÃO:", __filename);

const express = require('express');
const { supabase } = require('./services/supabase');

console.log("URL:", process.env.SUPABASE_URL ? "OK" : "NÃO CARREGOU");
console.log("KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "NÃO CARREGOU");

const app = express();
app.use(express.json());

// Permitir que o navegador (Live Server) acesse a API
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

app.get('/', (req, res) => {
  res.send('Servidor Caseg Protege rodando 🚀');
});


/* ===============================
   PRIMEIRO ACESSO
================================ */
app.post('/primeiro-acesso', async (req, res) => {
  try {

    console.log("CHEGOU NO /primeiro-acesso", req.body);

    const {
      company_name,
      full_name,
      cpf_cnpj,
      email,
      password
    } = req.body;

    // 1️⃣ Criar usuário no Supabase Auth
    const { data: userData, error: userError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

    if (userError) {
      return res.status(400).json({ error: userError.message });
    }

    // 2️⃣ Criar perfil na tabela profiles
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

    // 1️⃣ Buscar email pelo CPF/CNPJ
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email, role, full_name, company_name')
      .eq('cpf_cnpj', cpf_cnpj)
      .single();

    if (profileError) {
      return res.status(400).json({
        error: "Erro ao buscar CPF/CNPJ",
        detail: profileError.message
      });
    }

    if (!profile?.email) {
      return res.status(400).json({
        error: "CPF/CNPJ não encontrado"
      });
    }

    // 2️⃣ Login no Supabase Auth
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
   BUSCAR DOCUMENTOS DO CLIENTE
================================ */
app.get("/documents/:clientId", async (req, res) => {

  const { clientId } = req.params;

  try {

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("client_id", clientId)
      .order("year", { ascending: false });

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    res.json(data);

  } catch (err) {
    res.status(500).json({
      error: "Erro ao buscar documentos."
    });
  }

});


console.log("Rotas configuradas:");
console.log("GET /");
console.log("POST /primeiro-acesso");
console.log("POST /login");
console.log("GET /documents/:clientId");


app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});