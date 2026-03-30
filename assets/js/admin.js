const profile = JSON.parse(localStorage.getItem("profile"));
const token = localStorage.getItem("access_token");

if (!profile || !token) {
  alert("Sessão inválida. Faça login novamente.");
  window.location.href = "login.html";
}

if (profile.role !== "admin") {
  alert("Acesso restrito.");
  window.location.href = "login.html";
}

const adminWelcome = document.getElementById("adminWelcome");
const logoutBtn = document.getElementById("logoutBtn");
const createClientForm = document.getElementById("createClientForm");
const createClientMessage = document.getElementById("createClientMessage");

function loadAdminInfo() {
  adminWelcome.textContent = `Bem-vindo, ${profile.full_name || profile.name || "Administrador"}`;
}

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("profile");
  window.location.href = "login.html";
});

createClientForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = {
    full_name: document.getElementById("fullName").value.trim(),
    company_name: document.getElementById("companyName").value.trim(),
    cpf_cnpj: document.getElementById("cpfCnpj").value.trim(),
    email: document.getElementById("email").value.trim(),
    role: "client",
    address_zip: document.getElementById("addressZip").value.trim(),
    address_street: document.getElementById("addressStreet").value.trim(),
    address_number: document.getElementById("addressNumber").value.trim(),
    address_complement: document.getElementById("addressComplement").value.trim(),
    address_neighborhood: document.getElementById("addressNeighborhood").value.trim(),
    address_city: document.getElementById("addressCity").value.trim(),
    address_state: document.getElementById("addressState").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    whatsapp: document.getElementById("whatsapp").value.trim()
  };

  if (!formData.full_name || !formData.company_name || !formData.cpf_cnpj || !formData.email) {
    createClientMessage.textContent = "Preencha os campos obrigatórios: nome, empresa, CPF/CNPJ e e-mail.";
    return;
  }

  console.log("Dados do cliente prontos para envio:", formData);

  createClientMessage.textContent =
    "Formulário capturado com sucesso. No próximo passo vamos enviar esses dados para o backend.";
});

loadAdminInfo();