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
  const adminFeedback = document.getElementById("adminFeedback");

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

  let feedbackTimeout = null;
  const clientDocumentsCache = {};
  const clientNoticesCache = {};

  function showAdminFeedback(message, type = "info", autoHide = true) {
    adminFeedback.textContent = message;
    adminFeedback.className = `admin-feedback ${type}`;

    if (feedbackTimeout) {
      clearTimeout(feedbackTimeout);
    }

    if (autoHide) {
      feedbackTimeout = setTimeout(() => {
        adminFeedback.className = "admin-feedback hidden";
        adminFeedback.textContent = "";
      }, 4000);
    }
  }

  function hideAdminFeedback() {
    if (feedbackTimeout) {
      clearTimeout(feedbackTimeout);
    }

    adminFeedback.className = "admin-feedback hidden";
    adminFeedback.textContent = "";
  }

  function setInlineMessage(element, message, type = "info") {
    if (!element) {
      return;
    }

    element.textContent = message;
    element.className = `upload-form-message ${type}`;
  }

  function loadAdminInfo() {
    adminWelcome.textContent = `Bem-vindo, ${profile.full_name || "Administrador"}`;
  }

  function onlyDigits(value) {
    return (value || "").replace(/\D/g, "");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    temporaryPasswordField.value = password || "";
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

  function closeAllDocumentMenus() {
    document.querySelectorAll(".document-actions-dropdown").forEach((dropdown) => {
      dropdown.classList.add("hidden");
    });

    document.querySelectorAll(".document-menu-toggle").forEach((button) => {
      button.textContent = "▾";
    });
  }

  function getUniqueCategories(documents) {
    return [...new Set(documents.map((doc) => doc.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
  }

  function getUniqueYears(documents) {
    return [...new Set(documents.map((doc) => String(doc.year || "")).filter(Boolean))].sort((a, b) =>
      b.localeCompare(a, "pt-BR")
    );
  }

  function filterDocuments(documents, filters) {
    return documents.filter((document) => {
      const fileName = String(document.file_name || "").toLowerCase();
      const category = String(document.category || "");
      const year = String(document.year || "");

      const matchesName = !filters.name || fileName.includes(filters.name.toLowerCase());
      const matchesCategory = !filters.category || category === filters.category;
      const matchesYear = !filters.year || year === filters.year;

      return matchesName && matchesCategory && matchesYear;
    });
  }

  function createDocumentsFiltersHtml(clientId, documents, filteredDocuments) {
    const categories = getUniqueCategories(documents);
    const years = getUniqueYears(documents);

    return `
      <div class="documents-filters">
        <div class="documents-filter-group">
          <label for="filterName-${clientId}">Nome do arquivo</label>
          <input
            type="text"
            id="filterName-${clientId}"
            class="document-filter-name"
            data-client-id="${clientId}"
            placeholder="Buscar por nome do arquivo"
          />
        </div>

        <div class="documents-filter-group">
          <label for="filterCategory-${clientId}">Categoria</label>
          <select
            id="filterCategory-${clientId}"
            class="document-filter-category"
            data-client-id="${clientId}"
          >
            <option value="">Todas</option>
            ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
          </select>
        </div>

        <div class="documents-filter-group">
          <label for="filterYear-${clientId}">Ano</label>
          <select
            id="filterYear-${clientId}"
            class="document-filter-year"
            data-client-id="${clientId}"
          >
            <option value="">Todos</option>
            ${years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join("")}
          </select>
        </div>

        <div class="documents-filter-actions">
          <button
            type="button"
            class="clear-filters-btn"
            data-client-id="${clientId}"
          >
            Limpar filtros
          </button>
        </div>
      </div>

      <div class="documents-results-info">
        Exibindo ${filteredDocuments.length} de ${documents.length} documento(s).
      </div>
    `;
  }

  function createDocumentsListHtml(documents) {
    if (!documents || documents.length === 0) {
      return `
        <div class="empty-documents-message">
          Nenhum documento encontrado para este cliente com os filtros selecionados.
        </div>
      `;
    }

    return `
      <div class="documents-list">
        ${documents.map((document) => `
          <div class="document-item">
            <div class="document-item-top">
              <div class="document-item-grid">
                <div class="document-item-field">
                  <strong>Nome do arquivo</strong>
                  ${escapeHtml(document.file_name || "-")}
                </div>

                <div class="document-item-field">
                  <strong>Categoria</strong>
                  ${escapeHtml(document.category || "-")}
                </div>

                <div class="document-item-field">
                  <strong>Subcategoria</strong>
                  ${escapeHtml(document.subcategory || "-")}
                </div>

                <div class="document-item-field">
                  <strong>Ano</strong>
                  ${escapeHtml(document.year || "-")}
                </div>

                <div class="document-item-field">
                  <strong>Data de envio</strong>
                  ${formatDate(document.created_at)}
                </div>
              </div>

              <div class="document-menu-wrapper">
                <button
                  type="button"
                  class="document-menu-toggle"
                  data-document-id="${document.id}"
                >
                  ▾
                </button>

                <div
                  class="document-actions-dropdown hidden"
                  id="documentActions-${document.id}"
                >
                  <button
                    type="button"
                    class="document-action-btn download-document-btn"
                    data-document-id="${document.id}"
                  >
                    Baixar
                  </button>

                  <button
                    type="button"
                    class="document-action-btn replace-document-btn"
                    data-document-id="${document.id}"
                    data-client-id="${document.client_id}"
                    data-file-name="${escapeHtml(document.file_name || "Documento")}"
                  >
                    Substituir
                  </button>

                  <input
                    type="file"
                    class="replace-document-file-input hidden"
                    id="replaceFileInput-${document.id}"
                    data-document-id="${document.id}"
                    data-client-id="${document.client_id}"
                  />

                  <button
                    type="button"
                    class="document-action-btn delete-document-btn"
                    data-document-id="${document.id}"
                    data-client-id="${document.client_id}"
                    data-file-name="${escapeHtml(document.file_name || "Documento")}"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function createDocumentsHtml(clientId, documents, filters = { name: "", category: "", year: "" }) {
    const filteredDocuments = filterDocuments(documents, filters);

    return `
      ${createDocumentsFiltersHtml(clientId, documents, filteredDocuments)}
      ${createDocumentsListHtml(filteredDocuments)}
    `;
  }

  function createUploadPanelHtml(client) {
    return `
      <form
        class="upload-form"
        data-client-id="${client.user_id}"
        id="uploadForm-${client.user_id}"
      >
        <div class="upload-form-grid">
          <div class="form-group">
            <label>Cliente</label>
            <input type="text" value="${escapeHtml(client.full_name || "-")}" readonly />
          </div>

          <div class="form-group">
            <label>Empresa</label>
            <input type="text" value="${escapeHtml(client.company_name || "-")}" readonly />
          </div>

          <div class="form-group">
            <label for="uploadCategory-${client.user_id}">Categoria</label>
            <select id="uploadCategory-${client.user_id}" required>
              <option value="">Selecione a categoria</option>
              <option value="PGR">PGR</option>
              <option value="LTCAT">LTCAT</option>
              <option value="PPP">PPP</option>
              <option value="PCMSO">PCMSO</option>
              <option value="Laudo de Insalubridade">Laudo de Insalubridade</option>
              <option value="Laudo Ergonômico NR-17">Laudo Ergonômico NR-17</option>
              <option value="Laudo de Periculosidade">Laudo de Periculosidade</option>
              <option value="AET - Análise Ergonômica do Trabalho">AET - Análise Ergonômica do Trabalho</option>
              <option value="PCA - Programa de Conservação Auditiva">PCA - Programa de Conservação Auditiva</option>
              <option value="PPR - Programa de Proteção Respiratória">PPR - Programa de Proteção Respiratória</option>
              <option value="APR - Análise Preliminar de Risco/HO">APR - Análise Preliminar de Risco/HO</option>
              <option value="Manual de EPIs">Manual de EPIs</option>
              <option value="Ordem de Serviço (NR 01)">Ordem de Serviço (NR 01)</option>
              <option value="Certificados">Certificados</option>
            </select>
          </div>

          <div class="form-group">
            <label for="uploadSubcategory-${client.user_id}">Subcategoria</label>
            <input
              type="text"
              id="uploadSubcategory-${client.user_id}"
              placeholder="Digite a subcategoria"
            />
          </div>

          <div class="form-group">
            <label for="uploadYear-${client.user_id}">Ano</label>
            <input
              type="number"
              id="uploadYear-${client.user_id}"
              placeholder="Digite o ano"
              min="2000"
              max="2100"
              required
            />
          </div>

          <div class="form-group">
            <label for="uploadFile-${client.user_id}">Arquivo</label>
            <input
              type="file"
              id="uploadFile-${client.user_id}"
              required
            />
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="upload-submit-btn">
            Enviar Documento
          </button>
        </div>

        <div
          class="upload-form-message"
          id="uploadFormMessage-${client.user_id}"
        ></div>
      </form>
    `;
  }

  function createNoticePanelHtml(client) {
    return `
      <form
        class="notice-form"
        data-client-id="${client.user_id}"
        id="noticeForm-${client.user_id}"
      >
        <div class="notice-form-grid">
          <div class="form-group">
            <label>Cliente</label>
            <input type="text" value="${escapeHtml(client.full_name || "-")}" readonly />
          </div>

          <div class="form-group">
            <label>Empresa</label>
            <input type="text" value="${escapeHtml(client.company_name || "-")}" readonly />
          </div>

          <div class="form-group notice-form-full">
            <label for="noticeTitle-${client.user_id}">Título do aviso</label>
            <input
              type="text"
              id="noticeTitle-${client.user_id}"
              placeholder="Digite o título do aviso"
              required
            />
          </div>

          <div class="form-group notice-form-full">
            <label for="noticeMessage-${client.user_id}">Mensagem</label>
            <textarea
              id="noticeMessage-${client.user_id}"
              placeholder="Digite a mensagem do aviso"
              required
            ></textarea>
          </div>

          <div class="notice-checkbox-row">
            <label class="notice-checkbox-label">
              <input type="checkbox" id="noticeIsActive-${client.user_id}" checked />
              Criar aviso como ativo
            </label>
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="notice-submit-btn">
            Salvar Aviso
          </button>
        </div>

        <div
          class="upload-form-message"
          id="noticeFormMessage-${client.user_id}"
        ></div>
      </form>
    `;
  }

  function createNoticesListHtml(notices) {
    if (!notices || notices.length === 0) {
      return `
        <div class="empty-documents-message">
          Nenhum aviso cadastrado para este cliente.
        </div>
      `;
    }

    return `
      <div class="notices-list">
        ${notices.map((notice) => `
          <div class="notice-item">
            <div class="notice-item-header">
              <div>
                <div class="notice-item-title">${escapeHtml(notice.title || "Sem título")}</div>
                <div class="notice-item-meta">
                  Criado em ${formatDate(notice.created_at)} •
                  Status:
                  <span class="notice-status ${notice.is_active ? "active" : "inactive"}">
                    ${notice.is_active ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
            </div>

            <div class="notice-item-message">
              ${escapeHtml(notice.message || "-").replace(/\n/g, "<br>")}
            </div>

            <div class="notice-item-actions">
              <button
                type="button"
                class="notice-action-btn toggle-notice-btn"
                data-notice-id="${notice.id}"
                data-client-id="${notice.client_id}"
                data-is-active="${notice.is_active ? "true" : "false"}"
              >
                ${notice.is_active ? "Desativar" : "Ativar"}
              </button>

              <button
                type="button"
                class="notice-action-btn delete-notice-btn"
                data-notice-id="${notice.id}"
                data-client-id="${notice.client_id}"
                data-title="${escapeHtml(notice.title || "Aviso")}"
              >
                Excluir
              </button>
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
              <div class="client-card-title">${escapeHtml(client.full_name || "-")}</div>
            </div>

            <div class="client-card-grid">
              <div class="client-card-item">
                <strong>Empresa:</strong> ${escapeHtml(client.company_name || "-")}
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
              data-client-name="${escapeHtml(client.full_name || "")}"
              data-company-name="${escapeHtml(client.company_name || "")}"
            >
              Upload Documentos
            </button>

            <button
              type="button"
              class="client-action-btn view-documents-btn"
              data-client-id="${client.user_id}"
              data-client-name="${escapeHtml(client.full_name || "")}"
              data-company-name="${escapeHtml(client.company_name || "")}"
            >
              Visualizar Documentos
            </button>

            <button
              type="button"
              class="client-action-btn client-notices-btn"
              data-client-id="${client.user_id}"
              data-client-name="${escapeHtml(client.full_name || "")}"
              data-company-name="${escapeHtml(client.company_name || "")}"
            >
              Avisos
            </button>
          </div>
        </div>

        <div
          id="upload-panel-${client.user_id}"
          class="upload-panel hidden"
        >
          <div class="upload-panel-header">
            <div>
              <div class="upload-panel-title">Enviar documento</div>
              <div class="upload-panel-subtitle">
                Cliente: ${escapeHtml(client.full_name || "-")}${client.company_name ? ` - ${escapeHtml(client.company_name)}` : ""}
              </div>
            </div>
          </div>

          <div id="upload-content-${client.user_id}">
            ${createUploadPanelHtml(client)}
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
                Cliente: ${escapeHtml(client.full_name || "-")}${client.company_name ? ` - ${escapeHtml(client.company_name)}` : ""}
              </div>
            </div>
          </div>

          <div id="documents-content-${client.user_id}"></div>
        </div>

        <div
          id="notices-panel-${client.user_id}"
          class="notices-panel hidden"
        >
          <div class="notices-panel-header">
            <div>
              <div class="notices-panel-title">Avisos do cliente</div>
              <div class="notices-panel-subtitle">
                Cliente: ${escapeHtml(client.full_name || "-")}${client.company_name ? ` - ${escapeHtml(client.company_name)}` : ""}
              </div>
            </div>
          </div>

          <div class="notices-panel-body">
            ${createNoticePanelHtml(client)}
            <div id="notices-content-${client.user_id}" class="notices-content"></div>
          </div>
        </div>
      `;

      clientsList.appendChild(card);
    });

    bindClientActionButtons();
    bindUploadForms();
    bindNoticeForms();
  }

  async function loadClientDocuments(clientId) {
    const response = await fetch(`http://localhost:3000/clients/${clientId}/documents`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao buscar documentos do cliente.");
    }

    return data;
  }

  async function loadClientNotices(clientId) {
    const response = await fetch(`http://localhost:3000/admin/clients/${clientId}/notices`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao buscar avisos do cliente.");
    }

    return data;
  }

  function bindDocumentFilters(clientId) {
    const nameInput = document.getElementById(`filterName-${clientId}`);
    const categorySelect = document.getElementById(`filterCategory-${clientId}`);
    const yearSelect = document.getElementById(`filterYear-${clientId}`);
    const clearButton = document.querySelector(`.clear-filters-btn[data-client-id="${clientId}"]`);

    if (nameInput && nameInput.dataset.bound !== "true") {
      nameInput.dataset.bound = "true";
      nameInput.addEventListener("input", () => {
        renderFilteredDocuments(clientId);
      });
    }

    if (categorySelect && categorySelect.dataset.bound !== "true") {
      categorySelect.dataset.bound = "true";
      categorySelect.addEventListener("change", () => {
        renderFilteredDocuments(clientId);
      });
    }

    if (yearSelect && yearSelect.dataset.bound !== "true") {
      yearSelect.dataset.bound = "true";
      yearSelect.addEventListener("change", () => {
        renderFilteredDocuments(clientId);
      });
    }

    if (clearButton && clearButton.dataset.bound !== "true") {
      clearButton.dataset.bound = "true";
      clearButton.addEventListener("click", () => {
        if (nameInput) {
          nameInput.value = "";
        }

        if (categorySelect) {
          categorySelect.value = "";
        }

        if (yearSelect) {
          yearSelect.value = "";
        }

        renderFilteredDocuments(clientId);
      });
    }
  }

  function renderFilteredDocuments(clientId) {
    const content = document.getElementById(`documents-content-${clientId}`);
    const documents = clientDocumentsCache[clientId] || [];

    if (!content) {
      return;
    }

    const filters = {
      name: document.getElementById(`filterName-${clientId}`)?.value || "",
      category: document.getElementById(`filterCategory-${clientId}`)?.value || "",
      year: document.getElementById(`filterYear-${clientId}`)?.value || ""
    };

    content.innerHTML = createDocumentsHtml(clientId, documents, filters);
    bindClientActionButtons();
    bindDocumentFilters(clientId);
  }

  async function renderClientDocumentsPanel(clientId) {
    const content = document.getElementById(`documents-content-${clientId}`);

    if (!content) {
      return;
    }

    content.innerHTML = `
      <div class="empty-documents-message">
        Carregando documentos...
      </div>
    `;

    try {
      const documents = await loadClientDocuments(clientId);
      clientDocumentsCache[clientId] = documents;
      content.innerHTML = createDocumentsHtml(clientId, documents);
      bindClientActionButtons();
      bindDocumentFilters(clientId);
    } catch (error) {
      console.error("Erro ao carregar documentos do cliente:", error);
      content.innerHTML = `
        <div class="empty-documents-message">
          ${escapeHtml(error.message || "Erro ao carregar documentos.")}
        </div>
      `;
    }
  }

  async function renderClientNoticesPanel(clientId) {
    const content = document.getElementById(`notices-content-${clientId}`);

    if (!content) {
      return;
    }

    content.innerHTML = `
      <div class="empty-documents-message">
        Carregando avisos...
      </div>
    `;

    try {
      const notices = await loadClientNotices(clientId);
      clientNoticesCache[clientId] = notices;
      content.innerHTML = createNoticesListHtml(notices);
      bindClientActionButtons();
    } catch (error) {
      console.error("Erro ao carregar avisos do cliente:", error);
      content.innerHTML = `
        <div class="empty-documents-message">
          ${escapeHtml(error.message || "Erro ao carregar avisos.")}
        </div>
      `;
    }
  }

  async function downloadDocumentAsAdmin(documentId, buttonElement) {
    const originalText = buttonElement.textContent;
    buttonElement.textContent = "Baixando...";
    buttonElement.disabled = true;
    showAdminFeedback("Preparando download do documento...", "info");

    try {
      const response = await fetch("http://localhost:3000/admin/documents/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          document_id: documentId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao baixar documento.");
      }

      if (!data.url) {
        throw new Error("Link de download não foi gerado.");
      }

      window.open(data.url, "_blank");
      showAdminFeedback("Download iniciado com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao baixar documento no admin:", error);
      showAdminFeedback(error.message || "Erro ao baixar documento.", "error");
    } finally {
      buttonElement.textContent = originalText;
      buttonElement.disabled = false;
    }
  }

  async function deleteDocumentAsAdmin(documentId, clientId, fileName, buttonElement) {
    const confirmed = window.confirm(`Tem certeza que deseja excluir o documento "${fileName}"?`);

    if (!confirmed) {
      return;
    }

    const originalText = buttonElement.textContent;
    buttonElement.textContent = "Excluindo...";
    buttonElement.disabled = true;
    showAdminFeedback("Excluindo documento...", "warning");

    try {
      const response = await fetch(`http://localhost:3000/admin/documents/${documentId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao excluir documento.");
      }

      await renderClientDocumentsPanel(clientId);
      showAdminFeedback("Documento excluído com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao excluir documento no admin:", error);
      showAdminFeedback(error.message || "Erro ao excluir documento.", "error");
    } finally {
      buttonElement.textContent = originalText;
      buttonElement.disabled = false;
    }
  }

  async function replaceDocumentAsAdmin(documentId, clientId, file, buttonElement) {
    const originalText = buttonElement.textContent;
    buttonElement.textContent = "Substituindo...";
    buttonElement.disabled = true;
    showAdminFeedback("Substituindo documento...", "info");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`http://localhost:3000/admin/documents/${documentId}/replace`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao substituir documento.");
      }

      await renderClientDocumentsPanel(clientId);
      showAdminFeedback("Documento substituído com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao substituir documento no admin:", error);
      showAdminFeedback(error.message || "Erro ao substituir documento.", "error");
    } finally {
      buttonElement.textContent = originalText;
      buttonElement.disabled = false;
    }
  }

  async function uploadDocumentAsAdmin(clientId, category, subcategory, year, file, messageElement, submitButton) {
    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Enviando...";
    setInlineMessage(messageElement, "Enviando documento...", "info");
    showAdminFeedback("Enviando documento...", "info");

    try {
      const formData = new FormData();
      formData.append("client_id", clientId);
      formData.append("category", category);
      formData.append("subcategory", subcategory || "");
      formData.append("year", year);
      formData.append("file", file);

      const response = await fetch("http://localhost:3000/admin/documents/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao enviar documento.");
      }

      setInlineMessage(messageElement, "Documento enviado com sucesso.", "success");
      showAdminFeedback("Documento enviado com sucesso.", "success");

      const documentsPanel = document.getElementById(`documents-panel-${clientId}`);
      const viewDocumentsButton = document.querySelector(`.view-documents-btn[data-client-id="${clientId}"]`);

      if (documentsPanel) {
        documentsPanel.classList.remove("hidden");
      }

      if (viewDocumentsButton) {
        viewDocumentsButton.textContent = "Ocultar Documentos";
      }

      await renderClientDocumentsPanel(clientId);

      return true;
    } catch (error) {
      console.error("Erro ao enviar documento no admin:", error);
      setInlineMessage(messageElement, error.message || "Erro ao enviar documento.", "error");
      showAdminFeedback(error.message || "Erro ao enviar documento.", "error");
      return false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  }

  async function createNoticeAsAdmin(clientId, title, message, isActive, messageElement, submitButton) {
    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Salvando...";
    setInlineMessage(messageElement, "Salvando aviso...", "info");
    showAdminFeedback("Salvando aviso...", "info");

    try {
      const response = await fetch("http://localhost:3000/admin/notices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          client_id: clientId,
          title,
          message,
          is_active: isActive
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao salvar aviso.");
      }

      setInlineMessage(messageElement, "Aviso salvo com sucesso.", "success");
      showAdminFeedback("Aviso salvo com sucesso.", "success");

      await renderClientNoticesPanel(clientId);
      return true;
    } catch (error) {
      console.error("Erro ao salvar aviso no admin:", error);
      setInlineMessage(messageElement, error.message || "Erro ao salvar aviso.", "error");
      showAdminFeedback(error.message || "Erro ao salvar aviso.", "error");
      return false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  }

  async function toggleNoticeAsAdmin(noticeId, clientId, currentIsActive, buttonElement) {
    const originalText = buttonElement.textContent;
    buttonElement.disabled = true;
    buttonElement.textContent = currentIsActive ? "Desativando..." : "Ativando...";
    showAdminFeedback("Atualizando status do aviso...", "info");

    try {
      const response = await fetch(`http://localhost:3000/admin/notices/${noticeId}/toggle`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          is_active: !currentIsActive
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao atualizar status do aviso.");
      }

      await renderClientNoticesPanel(clientId);
      showAdminFeedback("Status do aviso atualizado com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao alternar status do aviso:", error);
      showAdminFeedback(error.message || "Erro ao atualizar status do aviso.", "error");
    } finally {
      buttonElement.disabled = false;
      buttonElement.textContent = originalText;
    }
  }

  async function deleteNoticeAsAdmin(noticeId, clientId, title, buttonElement) {
    const confirmed = window.confirm(`Tem certeza que deseja excluir o aviso "${title}"?`);

    if (!confirmed) {
      return;
    }

    const originalText = buttonElement.textContent;
    buttonElement.disabled = true;
    buttonElement.textContent = "Excluindo...";
    showAdminFeedback("Excluindo aviso...", "warning");

    try {
      const response = await fetch(`http://localhost:3000/admin/notices/${noticeId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao excluir aviso.");
      }

      await renderClientNoticesPanel(clientId);
      showAdminFeedback("Aviso excluído com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao excluir aviso:", error);
      showAdminFeedback(error.message || "Erro ao excluir aviso.", "error");
    } finally {
      buttonElement.disabled = false;
      buttonElement.textContent = originalText;
    }
  }

  function bindUploadForms() {
    const uploadForms = document.querySelectorAll(".upload-form");

    uploadForms.forEach((form) => {
      if (form.dataset.bound === "true") {
        return;
      }

      form.dataset.bound = "true";

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const clientId = form.dataset.clientId;
        const category = document.getElementById(`uploadCategory-${clientId}`).value;
        const subcategory = document.getElementById(`uploadSubcategory-${clientId}`).value.trim();
        const year = document.getElementById(`uploadYear-${clientId}`).value.trim();
        const fileInput = document.getElementById(`uploadFile-${clientId}`);
        const message = document.getElementById(`uploadFormMessage-${clientId}`);
        const submitButton = form.querySelector(".upload-submit-btn");

        if (!category || !year || !fileInput.files.length) {
          setInlineMessage(message, "Preencha os campos obrigatórios e selecione um arquivo.", "error");
          showAdminFeedback("Preencha os campos obrigatórios do upload.", "error");
          return;
        }

        const file = fileInput.files[0];

        const success = await uploadDocumentAsAdmin(
          clientId,
          category,
          subcategory,
          year,
          file,
          message,
          submitButton
        );

        if (success) {
          form.reset();
        }
      });
    });
  }

  function bindNoticeForms() {
    const noticeForms = document.querySelectorAll(".notice-form");

    noticeForms.forEach((form) => {
      if (form.dataset.bound === "true") {
        return;
      }

      form.dataset.bound = "true";

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const clientId = form.dataset.clientId;
        const title = document.getElementById(`noticeTitle-${clientId}`).value.trim();
        const messageText = document.getElementById(`noticeMessage-${clientId}`).value.trim();
        const isActive = document.getElementById(`noticeIsActive-${clientId}`).checked;
        const messageElement = document.getElementById(`noticeFormMessage-${clientId}`);
        const submitButton = form.querySelector(".notice-submit-btn");

        if (!title || !messageText) {
          setInlineMessage(messageElement, "Preencha título e mensagem do aviso.", "error");
          showAdminFeedback("Preencha os campos obrigatórios do aviso.", "error");
          return;
        }

        const success = await createNoticeAsAdmin(
          clientId,
          title,
          messageText,
          isActive,
          messageElement,
          submitButton
        );

        if (success) {
          form.reset();
          const activeCheckbox = document.getElementById(`noticeIsActive-${clientId}`);
          if (activeCheckbox) {
            activeCheckbox.checked = true;
          }
        }
      });
    });
  }

  function bindClientActionButtons() {
    const uploadButtons = document.querySelectorAll(".upload-documents-btn");
    const viewButtons = document.querySelectorAll(".view-documents-btn");
    const noticeButtons = document.querySelectorAll(".client-notices-btn");
    const downloadButtons = document.querySelectorAll(".download-document-btn");
    const deleteButtons = document.querySelectorAll(".delete-document-btn");
    const replaceButtons = document.querySelectorAll(".replace-document-btn");
    const replaceInputs = document.querySelectorAll(".replace-document-file-input");
    const menuToggles = document.querySelectorAll(".document-menu-toggle");
    const toggleNoticeButtons = document.querySelectorAll(".toggle-notice-btn");
    const deleteNoticeButtons = document.querySelectorAll(".delete-notice-btn");

    uploadButtons.forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const clientId = button.dataset.clientId;
        const uploadPanel = document.getElementById(`upload-panel-${clientId}`);

        if (!uploadPanel) {
          return;
        }

        const isHidden = uploadPanel.classList.contains("hidden");

        if (!isHidden) {
          uploadPanel.classList.add("hidden");
          button.textContent = "Upload Documentos";
          return;
        }

        uploadPanel.classList.remove("hidden");
        button.textContent = "Ocultar Upload";
      });
    });

    viewButtons.forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const clientId = button.dataset.clientId;
        const panel = document.getElementById(`documents-panel-${clientId}`);

        if (!panel) {
          return;
        }

        const isHidden = panel.classList.contains("hidden");

        if (!isHidden) {
          panel.classList.add("hidden");
          button.textContent = "Visualizar Documentos";
          return;
        }

        panel.classList.remove("hidden");
        button.textContent = "Ocultar Documentos";

        await renderClientDocumentsPanel(clientId);
      });
    });

    noticeButtons.forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const clientId = button.dataset.clientId;
        const panel = document.getElementById(`notices-panel-${clientId}`);

        if (!panel) {
          return;
        }

        const isHidden = panel.classList.contains("hidden");

        if (!isHidden) {
          panel.classList.add("hidden");
          button.textContent = "Avisos";
          return;
        }

        panel.classList.remove("hidden");
        button.textContent = "Ocultar Avisos";

        await renderClientNoticesPanel(clientId);
      });
    });

    menuToggles.forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";

      button.addEventListener("click", (event) => {
        event.stopPropagation();

        const documentId = button.dataset.documentId;
        const dropdown = document.getElementById(`documentActions-${documentId}`);

        if (!dropdown) {
          return;
        }

        const isHidden = dropdown.classList.contains("hidden");

        closeAllDocumentMenus();

        if (isHidden) {
          dropdown.classList.remove("hidden");
          button.textContent = "▴";
        } else {
          dropdown.classList.add("hidden");
          button.textContent = "▾";
        }
      });
    });

    downloadButtons.forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const documentId = button.dataset.documentId;

        if (!documentId) {
          showAdminFeedback("Documento inválido para download.", "error");
          return;
        }

        await downloadDocumentAsAdmin(documentId, button);
      });
    });

    deleteButtons.forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const documentId = button.dataset.documentId;
        const clientId = button.dataset.clientId;
        const fileName = button.dataset.fileName || "Documento";

        if (!documentId || !clientId) {
          showAdminFeedback("Documento inválido para exclusão.", "error");
          return;
        }

        await deleteDocumentAsAdmin(documentId, clientId, fileName, button);
      });
    });

    replaceButtons.forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const documentId = button.dataset.documentId;
        const fileInput = document.getElementById(`replaceFileInput-${documentId}`);

        if (!fileInput) {
          showAdminFeedback("Campo de substituição não encontrado.", "error");
          return;
        }

        fileInput.click();
      });
    });

    replaceInputs.forEach((input) => {
      if (input.dataset.bound === "true") {
        return;
      }

      input.dataset.bound = "true";

      input.addEventListener("change", async () => {
        const documentId = input.dataset.documentId;
        const clientId = input.dataset.clientId;
        const file = input.files[0];
        const button = document.querySelector(`.replace-document-btn[data-document-id="${documentId}"]`);

        if (!documentId || !clientId || !file || !button) {
          input.value = "";
          return;
        }

        await replaceDocumentAsAdmin(documentId, clientId, file, button);
        input.value = "";
      });
    });

    toggleNoticeButtons.forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const noticeId = button.dataset.noticeId;
        const clientId = button.dataset.clientId;
        const currentIsActive = button.dataset.isActive === "true";

        if (!noticeId || !clientId) {
          showAdminFeedback("Aviso inválido para alteração de status.", "error");
          return;
        }

        await toggleNoticeAsAdmin(noticeId, clientId, currentIsActive, button);
      });
    });

    deleteNoticeButtons.forEach((button) => {
      if (button.dataset.bound === "true") {
        return;
      }

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const noticeId = button.dataset.noticeId;
        const clientId = button.dataset.clientId;
        const title = button.dataset.title || "Aviso";

        if (!noticeId || !clientId) {
          showAdminFeedback("Aviso inválido para exclusão.", "error");
          return;
        }

        await deleteNoticeAsAdmin(noticeId, clientId, title, button);
      });
    });
  }

  document.addEventListener("click", () => {
    closeAllDocumentMenus();
  });

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
        showAdminFeedback(data.error || "Erro ao carregar clientes.", "error");
        return;
      }

      renderClients(data);
    } catch (error) {
      console.error("Erro ao carregar clientes:", error);
      clientsListMessage.textContent = "Erro ao conectar com o servidor.";
      showAdminFeedback("Erro ao conectar com o servidor.", "error");
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

  toggleClientsListBtn.addEventListener("click", () => {
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
      showAdminFeedback("Senha temporária copiada com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao copiar senha:", error);
      copyTemporaryPasswordBtn.textContent = "Erro ao copiar";
      showAdminFeedback("Erro ao copiar senha temporária.", "error");
    }

    setTimeout(() => {
      copyTemporaryPasswordBtn.textContent = "Copiar senha";
    }, 2000);
  });

  createClientForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    createClientMessage.textContent = "Enviando...";
    hidePasswordBox();
    hideAdminFeedback();

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
      showAdminFeedback("Preencha os campos obrigatórios do cadastro.", "error");
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
        showAdminFeedback(data.error || "Erro ao cadastrar cliente.", "error");
        return;
      }

      createClientMessage.textContent = "Cliente cadastrado com sucesso.";
      showAdminFeedback("Cliente cadastrado com sucesso.", "success");

      createClientForm.reset();

      if (data.temporary_password) {
        showPassword(data.temporary_password);
      } else {
        hidePasswordBox();
      }

      showCreateClientForm();

      await loadClients();
    } catch (error) {
      console.error("Erro ao cadastrar cliente:", error);
      createClientMessage.textContent = "Erro ao conectar.";
      showAdminFeedback("Erro ao conectar para cadastrar cliente.", "error");
    }
  });

  loadAdminInfo();
  hidePasswordBox();
  hideCreateClientForm();
  showClientsList();
  await loadClients();
});