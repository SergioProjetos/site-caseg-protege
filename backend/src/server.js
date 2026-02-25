require('dotenv').config();

console.log("ESTOU NO SERVER CERTO 🚀");
console.log("ARQUIVO EM EXECUÇÃO:", __filename);

const express = require('express');
const { supabase } = require('./services/supabase');

console.log("URL:", process.env.SUPABASE_URL ? "OK" : "NÃO CARREGOU");
console.log("KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "NÃO CARREGOU");

const app = express();
app.use(express.json());

const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Servidor Caseg Protege rodando 🚀');
});
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
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
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

console.log("Rotas configuradas: GET / e POST /primeiro-acesso");

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});