document.addEventListener("DOMContentLoaded", async () => {
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

  const toggleCreateClientBtn = document.getElementById("toggleCreateClientBtn");
  const createClientWrapper = document.getElementById("createClientWrapper");

  const toggleClientsListBtn = document.getElementById("toggleClientsListBtn");
  const clientsSectionWrapper = document.getElementById("clientsSectionWrapper");

  const createClientForm = document.getElementById("createClientForm");
  const createClientMessage = document.getElementById("createClientMessage");

  const cpfCnpjInput = document.getElementById("cpfCnpj");
  const phoneInput = document.getElementById("phone");
  const whatsappInput = document.getElementById("whatsapp");

  const temporaryPasswordBox = document.getElementById("temporaryPasswordBox");
  const temporaryPasswordField = document.getElementById("temporaryPasswordField");
  const copyTemporaryPasswordBtn = document.getElementById("copyTemporaryPasswordBtn");

  const clientsListMessage = document.getElementById("clientsListMessage");
  const clientsList = document.getElementById("clientsList");

  function loadAdminInfo() {
    adminWelcome.textContent = `Bem-vindo, ${profile.full_name || "Administrador"}`;
  }

  function onlyDigits(value) {
    return (value || "").replace(/\D/g, "");
  }

  function formatCpfCnpj(value) {
    let digits = onlyDigits(value);

    if (digits.length > 14) {
      digits = digits.slice(0, 14);
    }

    if (!digits) {
      return "";
    }

    if (digits.length <= 11) {
      return digits
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }

    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  function formatPhone(value) {
    let digits = onlyDigits(value);

    if (digits.length > 11) {
      digits = digits.slice(0, 11);
    }

    if (!digits) {
      return "";
    }

    if (digits.length <= 10) {
      return digits
        .replace(/^(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }

    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  }

  function formatDate(dateValue) {
    if (!dateValue) {
      return "-";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleDateString("pt-BR");
  }

  function hidePasswordBox() {
    temporaryPasswordBox.classList.add("hidden");
    temporaryPasswordField.value = "";
    copyTemporaryPasswordBtn.textContent = "Copiar senha";
  }

  function showPassword(password) {
    temporaryPasswordBox.classList.remove("hidden");
    temporaryPasswordField.value = password;
  }

  function hideCreateClientForm() {
    createClientWrapper.classList.add("hidden");
    toggleCreateClientBtn.textContent = "Novo Cliente";
  }

  function showCreateClientForm() {
    createClientWrapper.classList.remove("hidden");
    toggleCreateClientBtn.textContent = "Fechar Formulário";
  }

  function toggleCreateClientForm() {
    if (createClientWrapper.classList.contains("hidden")) {
      showCreateClientForm();
    } else {
      hideCreateClientForm();
    }
  }

  function hideClientsList() {
    clientsSectionWrapper.classList.add("hidden");
    toggleClientsListBtn.textContent = "Exibir Clientes";
  }

  function showClientsList() {
    clientsSectionWrapper.classList.remove("hidden");
    toggleClientsListBtn.textContent = "Ocultar Clientes";
  }

  function getMockDocumentsByClient(clientId, clientName) {
    const mockDatabase = {
      "mock-client-1": [
        {
          file_name: "Contrato Social.pdf",
          category: "Contrato",
          subcategory: "Societário",
          year: "2026",
          created_at: "2026-03-18T10:30:00"
        }
      ]
    };

    if (mockDatabase[clientId]) {
      return mockDatabase[clientId];
    }

    return [
      {
        file_name: `${clientName || "Documento"} - Exemplo.pdf`,
        category: "Financeiro",
        subcategory: "Mensal",
        year: "2026",
        created_at: "2026-04-01T09:00:00"
      },
      {
        file_name: "Relatorio de Servico.pdf",
        category: "Operacional",
        subcategory: "Relatório",
        year: "2026",
        created_at: "2026-04-02T14:15:00"
      }
    ];
  }

  function createDocumentsHtml(documents) {
    if (!documents || documents.length === 0) {
      return `
        <div class="empty-documents-message">
          Nenhum documento encontrado para este cliente.
        </div>
      `;
    }

    return `
      <div class="documents-list">
        ${documents.map((document) => `
          <div class="document-item">
            <div class="document-item-grid">
              <div class="document-item-field">
                <strong>Nome do arquivo</strong>
                ${document.file_name || "-"}
              </div>

              <div class="document-item-field">
                <strong>Categoria</strong>
                ${document.category || "-"}
              </div>

              <div class="document-item-field">
                <strong>Subcategoria</strong>
                ${document.subcategory || "-"}
              </div>

              <div class="document-item-field">
                <strong>Ano</strong>
                ${document.year || "-"}
              </div>

              <div class="document-item-field">
                <strong>Data de envio</strong>
                ${formatDate(document.created_at)}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderClients(clients) {
    clientsList.innerHTML = "";

    if (!clients || clients.length === 0) {
      clientsListMessage.textContent = "Nenhum cliente cadastrado no momento.";
      return;
    }

    clientsListMessage.textContent = `${clients.length} cliente(s) encontrado(s).`;

    clients.forEach((client) => {
      const card = document.createElement("div");
      card.className = "client-card";

      card.innerHTML = `
        <div class="client-card-content">
          <div class="client-card-info">
            <div class="client-card-header">
              <div class="client-card-title">${client.full_name || "-"}</div>
            </div>

            <div class="client-card-grid">
              <div class="client-card-item">
                <strong>Empresa:</strong> ${client.company_name || "-"}
              </div>

              <div class="client-card-item">
                <strong>CPF/CNPJ:</strong> ${formatCpfCnpj(client.cpf_cnpj) || "-"}
              </div>

              <div class="client-card-item">
                <strong>Telefone:</strong> ${formatPhone(client.phone) || "-"}
              </div>

              <div class="client-card-item">
                <strong>WhatsApp:</strong> ${formatPhone(client.whatsapp) || "-"}
              </div>
            </div>
          </div>

          <div class="client-card-actions">
            <button
              type="button"
              class="client-action-btn upload-documents-btn"
              data-client-id="${client.user_id}"
              data-client-name="${client.full_name || ""}"
              data-company-name="${client.company_name || ""}"
            >
              Upload Documentos
            </button>

            <button
              type="button"
              class="client-action-btn view-documents-btn"
              data-client-id="${client.user_id}"
              data-client-name="${client.full_name || ""}"
              data-company-name="${client.company_name || ""}"
            >
              Visualizar Documentos
            </button>

            <button
              type="button"
              class="client-action-btn client-notices-btn"
              data-client-id="${client.user_id}"
              data-client-name="${client.full_name || ""}"
              data-company-name="${client.company_name || ""}"
            >
              Avisos
            </button>
          </div>
        </div>

        <div
          id="documents-panel-${client.user_id}"
          class="documents-panel hidden"
        >
          <div class="documents-panel-header">
            <div>
              <div class="documents-panel-title">Documentos enviados</div>
              <div class="documents-panel-subtitle">
                Cliente: ${client.full_name || "-"}${client.company_name ? ` - ${client.company_name}` : ""}
              </div>
            </div>
          </div>

          <div id="documents-content-${client.user_id}"></div>
        </div>
      `;

      clientsList.appendChild(card);
    });

    bindClientActionButtons();
  }

  function bindClientActionButtons() {
    const uploadButtons = document.querySelectorAll(".upload-documents-btn");
    const viewButtons = document.querySelectorAll(".view-documents-btn");
    const noticeButtons = document.querySelectorAll(".client-notices-btn");

    uploadButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const clientId = button.dataset.clientId;
        const clientName = button.dataset.clientName;
        const companyName = button.dataset.companyName;

        alert(`Upload de documentos do cliente: ${clientName} (${companyName})\nID: ${clientId}`);
      });
    });

    viewButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const clientId = button.dataset.clientId;
        const clientName = button.dataset.clientName;

        const panel = document.getElementById(`documents-panel-${clientId}`);
        const content = document.getElementById(`documents-content-${clientId}`);

        if (!panel || !content) {
          return;
        }

        const isHidden = panel.classList.contains("hidden");

        if (!isHidden) {
          panel.classList.add("hidden");
          button.textContent = "Visualizar Documentos";
          return;
        }

        const documents = getMockDocumentsByClient(clientId, clientName);
        content.innerHTML = createDocumentsHtml(documents);
        panel.classList.remove("hidden");
        button.textContent = "Ocultar Documentos";
      });
    });

    noticeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const clientId = button.dataset.clientId;
        const clientName = button.dataset.clientName;
        const companyName = button.dataset.companyName;

        alert(`Gerenciar avisos do cliente: ${clientName} (${companyName})\nID: ${clientId}`);
      });
    });
  }

  async function loadClients() {
    clientsListMessage.textContent = "Carregando clientes...";
    clientsList.innerHTML = "";

    try {
      const response = await fetch("http://localhost:3000/clients", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        clientsListMessage.textContent = data.error || "Erro ao carregar clientes.";
        return;
      }

      renderClients(data);
    } catch (error) {
      console.error("Erro ao carregar clientes:", error);
      clientsListMessage.textContent = "Erro ao conectar com o servidor.";
    }
  }

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("profile");
    window.location.href = "login.html";
  });

  toggleCreateClientBtn.addEventListener("click", () => {
    toggleCreateClientForm();
  });

  toggleClientsListBtn.addEventListener("click", async () => {
    const isHidden = clientsSectionWrapper.classList.contains("hidden");

    if (isHidden) {
      showClientsList();
    } else {
      hideClientsList();
    }
  });

  cpfCnpjInput.addEventListener("input", (event) => {
    event.target.value = formatCpfCnpj(event.target.value);
  });

  phoneInput.addEventListener("input", (event) => {
    event.target.value = formatPhone(event.target.value);
  });

  whatsappInput.addEventListener("input", (event) => {
    event.target.value = formatPhone(event.target.value);
  });

  copyTemporaryPasswordBtn.addEventListener("click", async () => {
    const password = temporaryPasswordField.value;

    if (!password) {
      return;
    }

    try {
      await navigator.clipboard.writeText(password);
      copyTemporaryPasswordBtn.textContent = "Senha copiada!";
    } catch (error) {
      console.error("Erro ao copiar senha:", error);
      copyTemporaryPasswordBtn.textContent = "Erro ao copiar";
    }

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
      address_street: document.getElementById("addressStreet").value.trim(),
      address_number: document.getElementById("addressNumber").value.trim(),
      address_complement: document.getElementById("addressComplement").value.trim(),
      address_neighborhood: document.getElementById("addressNeighborhood").value.trim(),
      address_city: document.getElementById("addressCity").value.trim(),
      address_state: document.getElementById("addressState").value.trim(),
      phone: onlyDigits(document.getElementById("phone").value),
      whatsapp: onlyDigits(document.getElementById("whatsapp").value)
    };

    if (!formData.full_name || !formData.company_name || !formData.cpf_cnpj || !formData.email) {
      createClientMessage.textContent = "Preencha os campos obrigatórios.";
      return;
    }

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

      if (!response.ok) {
        createClientMessage.textContent = data.error || "Erro ao cadastrar cliente.";
        return;
      }

      createClientMessage.textContent = "Cliente cadastrado com sucesso.";

      if (data.temporary_password) {
        showPassword(data.temporary_password);
      }

      createClientForm.reset();
      showCreateClientForm();

      await loadClients();
    } catch (error) {
      console.error("Erro ao cadastrar cliente:", error);
      createClientMessage.textContent = "Erro ao conectar.";
    }
  });

  loadAdminInfo();
  hidePasswordBox();
  hideCreateClientForm();
  showClientsList();
  await loadClients();
});