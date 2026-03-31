document.addEventListener("DOMContentLoaded", () => {

  const profile = JSON.parse(localStorage.getItem("profile"));
  const token = localStorage.getItem("access_token");

  if (!profile || !token) {
    alert("Sessão inválida. Faça login novamente.");
    window.location.href = "login.html";
    return;
  }

  if (profile.role !== "admin") {
    alert("Acesso restrito.");
    window.location.href = "login.html";
    return;
  }

  const adminWelcome = document.getElementById("adminWelcome");
  const logoutBtn = document.getElementById("logoutBtn");

  const createClientForm = document.getElementById("createClientForm");
  const createClientMessage = document.getElementById("createClientMessage");

  const cpfCnpjInput = document.getElementById("cpfCnpj");
  const phoneInput = document.getElementById("phone");
  const whatsappInput = document.getElementById("whatsapp");

  const temporaryPasswordBox = document.getElementById("temporaryPasswordBox");
  const temporaryPasswordField = document.getElementById("temporaryPasswordField");
  const copyTemporaryPasswordBtn = document.getElementById("copyTemporaryPasswordBtn");

  console.log("Campo senha encontrado:", temporaryPasswordField);

  function loadAdminInfo() {
    adminWelcome.textContent = `Bem-vindo, ${profile.full_name || "Administrador"}`;
  }

  function onlyDigits(value) {
    return value.replace(/\D/g, "");
  }

  function formatCpfCnpj(value) {
    let digits = onlyDigits(value);

    if (digits.length > 14) digits = digits.slice(0, 14);

    if (digits.length <= 11) {
      return digits
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      return digits
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
  }

  function formatPhone(value) {
    let digits = onlyDigits(value);

    if (digits.length > 11) digits = digits.slice(0, 11);

    if (digits.length <= 10) {
      return digits
        .replace(/^(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    } else {
      return digits
        .replace(/^(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{5})(\d)/, "$1-$2");
    }
  }

  function hidePasswordBox() {
    temporaryPasswordBox.classList.add("hidden");
    temporaryPasswordField.value = "";
  }

  function showPassword(password) {
    console.log("SETANDO SENHA NO CAMPO:", password);

    temporaryPasswordBox.classList.remove("hidden");

    // força atualização
    temporaryPasswordField.value = "";
    setTimeout(() => {
      temporaryPasswordField.value = password;
    }, 50);
  }

  logoutBtn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  cpfCnpjInput.addEventListener("input", (e) => {
    e.target.value = formatCpfCnpj(e.target.value);
  });

  phoneInput.addEventListener("input", (e) => {
    e.target.value = formatPhone(e.target.value);
  });

  whatsappInput.addEventListener("input", (e) => {
    e.target.value = formatPhone(e.target.value);
  });

  copyTemporaryPasswordBtn.addEventListener("click", async () => {
    const password = temporaryPasswordField.value;

    if (!password) return;

    await navigator.clipboard.writeText(password);
    copyTemporaryPasswordBtn.textContent = "Copiado!";

    setTimeout(() => {
      copyTemporaryPasswordBtn.textContent = "Copiar senha";
    }, 2000);
  });

  createClientForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    createClientMessage.textContent = "Enviando...";
    hidePasswordBox();

    const formData = {
      full_name: document.getElementById("fullName").value.trim(),
      company_name: document.getElementById("companyName").value.trim(),
      cpf_cnpj: onlyDigits(document.getElementById("cpfCnpj").value),
      email: document.getElementById("email").value.trim(),
      role: "client",
      address_zip: onlyDigits(document.getElementById("addressZip").value),
      address_street: document.getElementById("addressStreet").value,
      address_number: document.getElementById("addressNumber").value,
      address_complement: document.getElementById("addressComplement").value,
      address_neighborhood: document.getElementById("addressNeighborhood").value,
      address_city: document.getElementById("addressCity").value,
      address_state: document.getElementById("addressState").value,
      phone: onlyDigits(document.getElementById("phone").value),
      whatsapp: onlyDigits(document.getElementById("whatsapp").value)
    };

    try {
      const response = await fetch("http://localhost:3000/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      console.log("RESPOSTA:", data);

      if (!response.ok) {
        createClientMessage.textContent = data.error;
        return;
      }

      createClientMessage.textContent = "Cliente cadastrado com sucesso.";

      if (data.temporary_password) {
        showPassword(data.temporary_password);
      }

      createClientForm.reset();

    } catch (err) {
      console.error(err);
      createClientMessage.textContent = "Erro ao conectar.";
    }
  });

  loadAdminInfo();
  hidePasswordBox();

});