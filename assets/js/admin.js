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
  const clientsSearchInput = document.getElementById("clientsSearchInput");

  const toggleHomeBannersBtn = document.getElementById("toggleHomeBannersBtn");
  const homeBannersWrapper = document.getElementById("homeBannersWrapper");

  const createClientForm = document.getElementById("createClientForm");
  const createClientMessage = document.getElementById("createClientMessage");

  const homeBannerForm = document.getElementById("homeBannerForm");
  const homeBannerMessage = document.getElementById("homeBannerMessage");
  const homeBannersListMessage = document.getElementById("homeBannersListMessage");
  const homeBannersList = document.getElementById("homeBannersList");

  const bannerActionType = document.getElementById("bannerActionType");
  const bannerLinkTarget = document.getElementById("bannerLinkTarget");
  const bannerLink = document.getElementById("bannerLink");
  const bannerDescription = document.getElementById("bannerDescription");

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
  let allClientsCache = [];

  function showAdminFeedback(message, type = "info", autoHide = true) {
    if (!adminFeedback) return;

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
    if (!adminFeedback) return;

    if (feedbackTimeout) {
      clearTimeout(feedbackTimeout);
    }

    adminFeedback.className = "admin-feedback hidden";
    adminFeedback.textContent = "";
  }

  function setInlineMessage(element, message, type = "info") {
    if (!element) return;
    element.textContent = message;
    element.className = `upload-form-message ${type}`;
  }

  function loadAdminInfo() {
    if (adminWelcome) {
      adminWelcome.textContent = `Bem-vindo, ${profile.full_name || "Administrador"}`;
    }
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
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
    if (!dateValue) return "-";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleDateString("pt-BR");
  }

  function getLinkTargetLabel(linkTarget) {
    switch (linkTarget) {
      case "contato":
        return "Página de Contato";
      case "servicos":
        return "Página de Serviços";
      case "whatsapp":
        return "WhatsApp";
      case "custom":
        return "Link Personalizado";
      default:
        return "-";
    }
  }

  function getActionTypeLabel(actionType) {
    switch (actionType) {
      case "modal":
        return "Abrir Informativo";
      case "link":
        return "Redirecionar";
      default:
        return "-";
    }
  }

  function getClientStatusLabel(isActive) {
    return isActive ? "Ativo" : "Inativo";
  }

  function prepareCollapsibleSection(element) {
    if (!element || element.dataset.collapsibleReady === "true") return;

    element.dataset.collapsibleReady = "true";
    element.style.overflow = "hidden";
    element.style.transition = "max-height 0.35s ease, opacity 0.3s ease";
    element.style.willChange = "max-height, opacity";
  }

  function collapseSectionInstant(element) {
    if (!element) return;

    prepareCollapsibleSection(element);
    element.classList.add("hidden");
    element.style.maxHeight = "0px";
    element.style.opacity = "0";
  }

  function expandSection(element) {
    if (!element) return;

    prepareCollapsibleSection(element);

    element.classList.remove("hidden");
    element.style.opacity = "0";
    element.style.maxHeight = "0px";

    requestAnimationFrame(() => {
      element.style.opacity = "1";
      element.style.maxHeight = `${element.scrollHeight}px`;
    });

    const handleTransitionEnd = (event) => {
      if (event.propertyName !== "max-height") return;

      if (!element.classList.contains("hidden")) {
        element.style.maxHeight = `${element.scrollHeight}px`;
      }

      element.removeEventListener("transitionend", handleTransitionEnd);
    };

    element.addEventListener("transitionend", handleTransitionEnd);
  }

  function collapseSection(element) {
    if (!element || element.classList.contains("hidden")) return;

    prepareCollapsibleSection(element);

    element.style.maxHeight = `${element.scrollHeight}px`;
    element.style.opacity = "1";

    requestAnimationFrame(() => {
      element.style.maxHeight = "0px";
      element.style.opacity = "0";
    });

    const handleTransitionEnd = (event) => {
      if (event.propertyName !== "max-height") return;
      element.classList.add("hidden");
      element.removeEventListener("transitionend", handleTransitionEnd);
    };

    element.addEventListener("transitionend", handleTransitionEnd);
  }

  function refreshSectionHeight(element) {
    if (!element || element.classList.contains("hidden")) return;

    prepareCollapsibleSection(element);
    element.style.maxHeight = `${element.scrollHeight}px`;
    element.style.opacity = "1";
  }

  function hidePasswordBox() {
    if (!temporaryPasswordBox || !temporaryPasswordField || !copyTemporaryPasswordBtn) return;

    temporaryPasswordBox.classList.add("hidden");
    temporaryPasswordField.value = "";
    copyTemporaryPasswordBtn.textContent = "Copiar senha";
  }

  function showPassword(password) {
    if (!temporaryPasswordBox || !temporaryPasswordField) return;

    temporaryPasswordBox.classList.remove("hidden");
    temporaryPasswordField.value = password || "";
  }

  function hideCreateClientForm() {
    collapseSection(createClientWrapper);
    if (toggleCreateClientBtn) toggleCreateClientBtn.textContent = "Novo Cliente";
  }

  function showCreateClientForm() {
    expandSection(createClientWrapper);
    if (toggleCreateClientBtn) toggleCreateClientBtn.textContent = "Fechar Formulário";
  }

  function toggleCreateClientForm() {
    if (!createClientWrapper) return;

    if (createClientWrapper.classList.contains("hidden")) {
      showCreateClientForm();
    } else {
      hideCreateClientForm();
    }
  }

  function hideClientsList() {
    collapseSection(clientsSectionWrapper);
    if (toggleClientsListBtn) toggleClientsListBtn.textContent = "Exibir Clientes";
  }

  function showClientsList() {
    expandSection(clientsSectionWrapper);
    if (toggleClientsListBtn) toggleClientsListBtn.textContent = "Ocultar Clientes";
  }

  function hideHomeBanners() {
    collapseSection(homeBannersWrapper);
    if (toggleHomeBannersBtn) toggleHomeBannersBtn.textContent = "Exibir Banners";
  }

  function showHomeBanners() {
    expandSection(homeBannersWrapper);
    if (toggleHomeBannersBtn) toggleHomeBannersBtn.textContent = "Ocultar Banners";
  }

  function closeAllDocumentMenus() {
    document.querySelectorAll(".document-actions-dropdown").forEach((dropdown) => {
      dropdown.classList.add("hidden");
    });

    document.querySelectorAll(".document-menu-toggle").forEach((button) => {
      button.textContent = "▾";
    });
  }

  function updateBannerFormVisibility() {
    const actionType = bannerActionType?.value || "link";
    const linkTargetGroup = bannerLinkTarget?.closest(".form-group");
    const linkInputGroup = bannerLink?.closest(".form-group");
    const descriptionGroup = bannerDescription?.closest(".form-group");

    if (!linkTargetGroup || !linkInputGroup || !descriptionGroup) return;

    if (actionType === "modal") {
      linkTargetGroup.classList.add("hidden");
      linkInputGroup.classList.remove("hidden");
      descriptionGroup.classList.remove("hidden");

      bannerLinkTarget.value = "";
      bannerLink.required = false;
      bannerDescription.required = true;
      bannerLink.placeholder = "Não utilizado para banners informativos";
    } else {
      linkTargetGroup.classList.remove("hidden");
      descriptionGroup.classList.add("hidden");

      bannerDescription.required = false;
      bannerDescription.value = "";

      const target = bannerLinkTarget.value;

      if (target === "custom") {
        linkInputGroup.classList.remove("hidden");
        bannerLink.required = true;
        bannerLink.placeholder = "https://...";
      } else {
        linkInputGroup.classList.add("hidden");
        bannerLink.required = false;
        bannerLink.value = "";
      }
    }

    refreshSectionHeight(homeBannersWrapper);
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

  function filterClients(clients, searchTerm) {
    const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
    const digitsSearch = onlyDigits(searchTerm || "");

    if (!normalizedSearch && !digitsSearch) {
      return clients;
    }

    return clients.filter((client) => {
      const fullName = String(client.full_name || "").toLowerCase();
      const companyName = String(client.company_name || "").toLowerCase();
      const cpfCnpj = String(client.cpf_cnpj || "");
      const formattedCpfCnpj = formatCpfCnpj(cpfCnpj).toLowerCase();

      const matchesName = fullName.includes(normalizedSearch);
      const matchesCompany = companyName.includes(normalizedSearch);
      const matchesCpfRaw = cpfCnpj.includes(digitsSearch);
      const matchesCpfFormatted = formattedCpfCnpj.includes(normalizedSearch);

      return matchesName || matchesCompany || matchesCpfRaw || matchesCpfFormatted;
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
              <option value="ASO">ASO</option>
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

  function createHomeBannerCardHtml(banner) {
    const actionTypeLabel = getActionTypeLabel(banner.action_type);
    const linkTargetLabel = getLinkTargetLabel(banner.link_target);

    let actionDetailsHtml = `
      <div class="home-banner-meta">
        <strong>Tipo de ação:</strong> ${escapeHtml(actionTypeLabel)}
      </div>
    `;

    if (banner.action_type === "modal") {
      actionDetailsHtml += `
        <div class="home-banner-meta">
          <strong>Descrição:</strong> ${escapeHtml(banner.description || "-")}
        </div>
      `;
    } else {
      actionDetailsHtml += `
        <div class="home-banner-meta">
          <strong>Destino:</strong> ${escapeHtml(linkTargetLabel)}
        </div>
      `;

      if (banner.link_target === "custom" && banner.link) {
        actionDetailsHtml += `
          <div class="home-banner-meta">
            <strong>Link:</strong>
            <a href="${escapeHtml(banner.link)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(banner.link)}
            </a>
          </div>
        `;
      }
    }

    return `
      <div class="home-banner-card">
        <div class="home-banner-top">
          <div class="home-banner-preview">
            <img src="${escapeHtml(banner.image_url || "")}" alt="${escapeHtml(banner.title || "Banner da Home")}" />
          </div>

          <div class="home-banner-info">
            <div class="home-banner-title">${escapeHtml(banner.title || "Sem título")}</div>

            ${actionDetailsHtml}

            <div class="home-banner-meta">
              <strong>Criado em:</strong> ${formatDate(banner.created_at)}
            </div>

            <span class="home-banner-status ${banner.is_active ? "active" : "inactive"}">
              ${banner.is_active ? "Ativo" : "Inativo"}
            </span>
          </div>
        </div>

        <div class="home-banner-actions">
          <button
            type="button"
            class="home-banner-action-btn toggle-home-banner-btn"
            data-banner-id="${banner.id}"
            data-is-active="${banner.is_active ? "true" : "false"}"
          >
            ${banner.is_active ? "Desativar" : "Ativar"}
          </button>

          <button
            type="button"
            class="home-banner-action-btn delete-home-banner-btn"
            data-banner-id="${banner.id}"
            data-banner-title="${escapeHtml(banner.title || "Banner")}"
          >
            Excluir
          </button>
        </div>
      </div>
    `;
  }

  function renderHomeBanners(banners) {
    if (!homeBannersList || !homeBannersListMessage) return;

    homeBannersList.innerHTML = "";

    if (!Array.isArray(banners) || banners.length === 0) {
      homeBannersListMessage.textContent = "Nenhum banner cadastrado no momento.";
      refreshSectionHeight(homeBannersWrapper);
      return;
    }

    homeBannersListMessage.textContent = `${banners.length} banner(s) encontrado(s).`;
    homeBannersList.innerHTML = banners.map(createHomeBannerCardHtml).join("");
    bindHomeBannerActionButtons();
    refreshSectionHeight(homeBannersWrapper);
  }

  function renderClients(clients) {
    if (!clientsList || !clientsListMessage) return;

    clientsList.innerHTML = "";

    if (!clients || clients.length === 0) {
      clientsListMessage.textContent = "Nenhum cliente encontrado.";
      refreshSectionHeight(clientsSectionWrapper);
      return;
    }

    clientsListMessage.textContent = `${clients.length} cliente(s) encontrado(s).`;

    clients.forEach((client) => {
      const isActive = client.is_active !== false;
      const statusLabel = getClientStatusLabel(isActive);

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
                <i class="fa-solid fa-building client-info-icon"></i>
                <div class="client-card-text">
                  <strong>Empresa</strong>
                  <span>${escapeHtml(client.company_name || "-")}</span>
                </div>
              </div>

              <div class="client-card-item">
                <i class="fa-regular fa-id-card client-info-icon"></i>
                <div class="client-card-text">
                  <strong>CPF/CNPJ</strong>
                  <span>${formatCpfCnpj(client.cpf_cnpj) || "-"}</span>
                </div>
              </div>

              <div class="client-card-item">
                <i class="fa-regular fa-envelope client-info-icon"></i>
                <div class="client-card-text">
                  <strong>E-mail</strong>
                  <span>${escapeHtml(client.email || "-")}</span>
                </div>
              </div>

              <div class="client-card-item">
                <i class="fa-solid fa-phone client-info-icon"></i>
                <div class="client-card-text">
                  <strong>Telefone</strong>
                  <span>${formatPhone(client.phone) || "-"}</span>
                </div>
              </div>

              <div class="client-card-item">
                <i class="fa-brands fa-whatsapp client-info-icon"></i>
                <div class="client-card-text">
                  <strong>WhatsApp</strong>
                  <span>${formatPhone(client.whatsapp) || "-"}</span>
                </div>
              </div>

              <div class="client-card-item">
                <i class="fa-solid fa-circle-check client-info-icon"></i>
                <div class="client-card-text">
                  <strong>Status</strong>
                  <span class="client-status-badge ${isActive ? "active" : "inactive"}">
                    ${statusLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="client-card-actions">
            <button
              type="button"
              class="client-action-btn toggle-client-status-btn"
              data-client-id="${client.user_id}"
              data-client-name="${escapeHtml(client.full_name || "Cliente")}"
              data-is-active="${isActive ? "true" : "false"}"
            >
              ${isActive ? "Inativar Cliente" : "Ativar Cliente"}
            </button>

            <button
              type="button"
              class="client-action-btn upload-documents-btn"
              data-client-id="${client.user_id}"
            >
              Upload Documentos
            </button>

            <button
              type="button"
              class="client-action-btn view-documents-btn"
              data-client-id="${client.user_id}"
            >
              Visualizar Documentos
            </button>

            <button
              type="button"
              class="client-action-btn delete-client-btn"
              data-client-id="${client.user_id}"
              data-client-name="${escapeHtml(client.full_name || "Cliente")}"
            >
              Excluir Cliente
            </button>
          </div>
        </div>

        <div id="upload-panel-${client.user_id}" class="upload-panel hidden">
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

        <div id="documents-panel-${client.user_id}" class="documents-panel hidden">
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
      `;

      clientsList.appendChild(card);
    });

    bindClientActionButtons();
    bindUploadForms();
    refreshSectionHeight(clientsSectionWrapper);
  }

  function applyClientsFilter() {
    const searchTerm = clientsSearchInput?.value || "";
    const filteredClients = filterClients(allClientsCache, searchTerm);
    renderClients(filteredClients);
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

  async function loadHomeBanners() {
    const response = await fetch("http://localhost:3000/admin/notices", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao buscar banners da Home.");
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
        if (nameInput) nameInput.value = "";
        if (categorySelect) categorySelect.value = "";
        if (yearSelect) yearSelect.value = "";
        renderFilteredDocuments(clientId);
      });
    }
  }

  function renderFilteredDocuments(clientId) {
    const content = document.getElementById(`documents-content-${clientId}`);
    const documents = clientDocumentsCache[clientId] || [];

    if (!content) return;

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
    if (!content) return;

    content.innerHTML = `<div class="empty-documents-message">Carregando documentos...</div>`;

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

  async function renderHomeBannersPanel() {
    if (!homeBannersListMessage || !homeBannersList) return;

    homeBannersListMessage.textContent = "Carregando banners...";
    homeBannersList.innerHTML = "";
    refreshSectionHeight(homeBannersWrapper);

    try {
      const banners = await loadHomeBanners();
      renderHomeBanners(banners);
    } catch (error) {
      console.error("Erro ao carregar banners da Home:", error);
      homeBannersListMessage.textContent = error.message || "Erro ao carregar banners.";
      refreshSectionHeight(homeBannersWrapper);
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
    if (!confirmed) return;

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

  async function updateClientStatusAsAdmin(clientId, clientName, currentIsActive, buttonElement) {
    const nextIsActive = !currentIsActive;
    const actionLabel = nextIsActive ? "ativar" : "inativar";

    const confirmed = window.confirm(
      `Tem certeza que deseja ${actionLabel} o cliente "${clientName}"?`
    );

    if (!confirmed) return;

    const originalText = buttonElement.textContent;
    buttonElement.textContent = nextIsActive ? "Ativando..." : "Inativando...";
    buttonElement.disabled = true;
    showAdminFeedback(`Atualizando status do cliente "${clientName}"...`, "info");

    try {
      const response = await fetch(`http://localhost:3000/admin/clients/${clientId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          is_active: nextIsActive
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao atualizar status do cliente.");
      }

      allClientsCache = allClientsCache.map((client) => {
        if (client.user_id === clientId) {
          return {
            ...client,
            is_active: nextIsActive
          };
        }
        return client;
      });

      applyClientsFilter();
      showAdminFeedback("Status do cliente atualizado com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao atualizar status do cliente:", error);
      showAdminFeedback(error.message || "Erro ao atualizar status do cliente.", "error");
    } finally {
      buttonElement.textContent = originalText;
      buttonElement.disabled = false;
    }
  }

  async function deleteClientAsAdmin(clientId, clientName, buttonElement) {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o cliente "${clientName}"?\n\nTodos os documentos e acessos serão removidos permanentemente.`
    );

    if (!confirmed) return;

    const originalText = buttonElement.textContent;
    buttonElement.textContent = "Excluindo...";
    buttonElement.disabled = true;
    showAdminFeedback("Excluindo cliente e dados vinculados...", "warning");

    try {
      const response = await fetch(`http://localhost:3000/admin/clients/${clientId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao excluir cliente.");
      }

      delete clientDocumentsCache[clientId];
      await loadClients();
      showAdminFeedback("Cliente excluído com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao excluir cliente:", error);
      showAdminFeedback(error.message || "Erro ao excluir cliente.", "error");
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

  async function createHomeBannerAsAdmin(
    title,
    link,
    description,
    actionType,
    linkTarget,
    isActive,
    imageFile,
    messageElement,
    submitButton
  ) {
    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Salvando...";
    setInlineMessage(messageElement, "Salvando banner...", "info");
    showAdminFeedback("Salvando banner da Home...", "info");

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("link", link || "");
      formData.append("description", description || "");
      formData.append("action_type", actionType);
      formData.append("link_target", linkTarget || "");
      formData.append("is_active", String(isActive));
      formData.append("image", imageFile);

      const response = await fetch("http://localhost:3000/admin/notices/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao salvar banner.");
      }

      setInlineMessage(messageElement, "Banner salvo com sucesso.", "success");
      showAdminFeedback("Banner da Home salvo com sucesso.", "success");

      await renderHomeBannersPanel();
      return true;
    } catch (error) {
      console.error("Erro ao salvar banner da Home:", error);
      setInlineMessage(messageElement, error.message || "Erro ao salvar banner.", "error");
      showAdminFeedback(error.message || "Erro ao salvar banner.", "error");
      return false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  }

  async function toggleHomeBannerAsAdmin(bannerId, currentIsActive, buttonElement) {
    const originalText = buttonElement.textContent;
    buttonElement.disabled = true;
    buttonElement.textContent = currentIsActive ? "Desativando..." : "Ativando...";
    showAdminFeedback("Atualizando status do banner...", "info");

    try {
      const response = await fetch(`http://localhost:3000/admin/notices/${bannerId}/toggle`, {
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
        throw new Error(data.error || "Erro ao atualizar status do banner.");
      }

      await renderHomeBannersPanel();
      showAdminFeedback("Status do banner atualizado com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao alternar status do banner:", error);
      showAdminFeedback(error.message || "Erro ao atualizar status do banner.", "error");
    } finally {
      buttonElement.disabled = false;
      buttonElement.textContent = originalText;
    }
  }

  async function deleteHomeBannerAsAdmin(bannerId, bannerTitle, buttonElement) {
    const confirmed = window.confirm(`Tem certeza que deseja excluir o banner "${bannerTitle}"?`);
    if (!confirmed) return;

    const originalText = buttonElement.textContent;
    buttonElement.disabled = true;
    buttonElement.textContent = "Excluindo...";
    showAdminFeedback("Excluindo banner...", "warning");

    try {
      const response = await fetch(`http://localhost:3000/admin/notices/${bannerId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao excluir banner.");
      }

      await renderHomeBannersPanel();
      showAdminFeedback("Banner excluído com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao excluir banner:", error);
      showAdminFeedback(error.message || "Erro ao excluir banner.", "error");
    } finally {
      buttonElement.disabled = false;
      buttonElement.textContent = originalText;
    }
  }

  function bindUploadForms() {
    const uploadForms = document.querySelectorAll(".upload-form");

    uploadForms.forEach((form) => {
      if (form.dataset.bound === "true") return;

      form.dataset.bound = "true";

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const clientId = form.dataset.clientId;
        const category = document.getElementById(`uploadCategory-${clientId}`)?.value || "";
        const subcategory = document.getElementById(`uploadSubcategory-${clientId}`)?.value.trim() || "";
        const year = document.getElementById(`uploadYear-${clientId}`)?.value.trim() || "";
        const fileInput = document.getElementById(`uploadFile-${clientId}`);
        const message = document.getElementById(`uploadFormMessage-${clientId}`);
        const submitButton = form.querySelector(".upload-submit-btn");

        if (!category || !year || !fileInput || !fileInput.files.length) {
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

  function bindHomeBannerForm() {
    if (!homeBannerForm || homeBannerForm.dataset.bound === "true") return;

    homeBannerForm.dataset.bound = "true";

    homeBannerForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const title = document.getElementById("bannerTitle")?.value.trim() || "";
      const actionType = document.getElementById("bannerActionType")?.value || "link";
      const linkTarget = document.getElementById("bannerLinkTarget")?.value || "";
      const link = document.getElementById("bannerLink")?.value.trim() || "";
      const description = document.getElementById("bannerDescription")?.value.trim() || "";
      const isActive = document.getElementById("bannerIsActive")?.checked || false;
      const imageInput = document.getElementById("bannerImage");
      const submitButton = document.getElementById("saveBannerBtn");

      if (!title || !imageInput || !imageInput.files.length) {
        setInlineMessage(homeBannerMessage, "Preencha o título e selecione uma imagem.", "error");
        showAdminFeedback("Preencha os campos obrigatórios do banner.", "error");
        return;
      }

      if (actionType === "modal" && !description) {
        setInlineMessage(homeBannerMessage, "Para banner informativo, preencha a descrição detalhada.", "error");
        showAdminFeedback("Descrição obrigatória para banner do tipo modal.", "error");
        return;
      }

      if (actionType === "link") {
        if (!linkTarget) {
          setInlineMessage(homeBannerMessage, "Selecione um destino para o banner.", "error");
          showAdminFeedback("Destino obrigatório para banner do tipo link.", "error");
          return;
        }

        if (linkTarget === "custom" && !link) {
          setInlineMessage(homeBannerMessage, "Informe o link personalizado.", "error");
          showAdminFeedback("Link personalizado obrigatório.", "error");
          return;
        }
      }

      const imageFile = imageInput.files[0];

      const success = await createHomeBannerAsAdmin(
        title,
        link,
        description,
        actionType,
        linkTarget,
        isActive,
        imageFile,
        homeBannerMessage,
        submitButton
      );

      if (success) {
        homeBannerForm.reset();

        const bannerIsActive = document.getElementById("bannerIsActive");
        const bannerActionTypeField = document.getElementById("bannerActionType");
        const bannerLinkTargetField = document.getElementById("bannerLinkTarget");

        if (bannerIsActive) bannerIsActive.checked = true;
        if (bannerActionTypeField) bannerActionTypeField.value = "link";
        if (bannerLinkTargetField) bannerLinkTargetField.value = "";

        updateBannerFormVisibility();
        refreshSectionHeight(homeBannersWrapper);
      }
    });
  }

  function bindHomeBannerActionButtons() {
    const toggleButtons = document.querySelectorAll(".toggle-home-banner-btn");
    const deleteButtons = document.querySelectorAll(".delete-home-banner-btn");

    toggleButtons.forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const bannerId = button.dataset.bannerId;
        const currentIsActive = button.dataset.isActive === "true";

        if (!bannerId) {
          showAdminFeedback("Banner inválido para alteração de status.", "error");
          return;
        }

        await toggleHomeBannerAsAdmin(bannerId, currentIsActive, button);
      });
    });

    deleteButtons.forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const bannerId = button.dataset.bannerId;
        const bannerTitle = button.dataset.bannerTitle || "Banner";

        if (!bannerId) {
          showAdminFeedback("Banner inválido para exclusão.", "error");
          return;
        }

        await deleteHomeBannerAsAdmin(bannerId, bannerTitle, button);
      });
    });
  }

  function bindClientActionButtons() {
    const toggleStatusButtons = document.querySelectorAll(".toggle-client-status-btn");
    const uploadButtons = document.querySelectorAll(".upload-documents-btn");
    const viewButtons = document.querySelectorAll(".view-documents-btn");
    const deleteClientButtons = document.querySelectorAll(".delete-client-btn");
    const downloadButtons = document.querySelectorAll(".download-document-btn");
    const deleteButtons = document.querySelectorAll(".delete-document-btn");
    const replaceButtons = document.querySelectorAll(".replace-document-btn");
    const replaceInputs = document.querySelectorAll(".replace-document-file-input");
    const menuToggles = document.querySelectorAll(".document-menu-toggle");

    toggleStatusButtons.forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const clientId = button.dataset.clientId;
        const clientName = button.dataset.clientName || "Cliente";
        const currentIsActive = button.dataset.isActive === "true";

        if (!clientId) {
          showAdminFeedback("Cliente inválido para alteração de status.", "error");
          return;
        }

        await updateClientStatusAsAdmin(clientId, clientName, currentIsActive, button);
      });
    });

    uploadButtons.forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const clientId = button.dataset.clientId;
        const uploadPanel = document.getElementById(`upload-panel-${clientId}`);

        if (!uploadPanel) return;

        const isHidden = uploadPanel.classList.contains("hidden");

        if (!isHidden) {
          uploadPanel.classList.add("hidden");
          button.textContent = "Upload Documentos";
          refreshSectionHeight(clientsSectionWrapper);
          return;
        }

        uploadPanel.classList.remove("hidden");
        button.textContent = "Ocultar Upload";
        refreshSectionHeight(clientsSectionWrapper);
      });
    });

    viewButtons.forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const clientId = button.dataset.clientId;
        const panel = document.getElementById(`documents-panel-${clientId}`);

        if (!panel) return;

        const isHidden = panel.classList.contains("hidden");

        if (!isHidden) {
          panel.classList.add("hidden");
          button.textContent = "Visualizar Documentos";
          refreshSectionHeight(clientsSectionWrapper);
          return;
        }

        panel.classList.remove("hidden");
        button.textContent = "Ocultar Documentos";
        refreshSectionHeight(clientsSectionWrapper);

        await renderClientDocumentsPanel(clientId);
        refreshSectionHeight(clientsSectionWrapper);
      });
    });

    deleteClientButtons.forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const clientId = button.dataset.clientId;
        const clientName = button.dataset.clientName || "Cliente";

        if (!clientId) {
          showAdminFeedback("Cliente inválido para exclusão.", "error");
          return;
        }

        await deleteClientAsAdmin(clientId, clientName, button);
      });
    });

    menuToggles.forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", (event) => {
        event.stopPropagation();

        const documentId = button.dataset.documentId;
        const dropdown = document.getElementById(`documentActions-${documentId}`);

        if (!dropdown) return;

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
      if (button.dataset.bound === "true") return;

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
      if (button.dataset.bound === "true") return;

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
      if (button.dataset.bound === "true") return;

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
      if (input.dataset.bound === "true") return;

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
  }

  document.addEventListener("click", () => {
    closeAllDocumentMenus();
  });

  async function loadClients() {
    if (!clientsListMessage || !clientsList) return;

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
        refreshSectionHeight(clientsSectionWrapper);
        return;
      }

      allClientsCache = Array.isArray(data) ? data : [];
      applyClientsFilter();
    } catch (error) {
      console.error("Erro ao carregar clientes:", error);
      clientsListMessage.textContent = "Erro ao conectar com o servidor.";
      showAdminFeedback("Erro ao conectar com o servidor.", "error");
      refreshSectionHeight(clientsSectionWrapper);
    }
  }

  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("profile");
    window.location.href = "login.html";
  });

  toggleCreateClientBtn?.addEventListener("click", () => {
    toggleCreateClientForm();
  });

  toggleClientsListBtn?.addEventListener("click", () => {
    if (!clientsSectionWrapper) return;

    const isHidden = clientsSectionWrapper.classList.contains("hidden");

    if (isHidden) {
      showClientsList();
      refreshSectionHeight(clientsSectionWrapper);
    } else {
      hideClientsList();
    }
  });

  toggleHomeBannersBtn?.addEventListener("click", async () => {
    if (!homeBannersWrapper) return;

    const isHidden = homeBannersWrapper.classList.contains("hidden");

    if (isHidden) {
      showHomeBanners();
      await renderHomeBannersPanel();
      refreshSectionHeight(homeBannersWrapper);
    } else {
      hideHomeBanners();
    }
  });

  clientsSearchInput?.addEventListener("input", () => {
    applyClientsFilter();
  });

  bannerActionType?.addEventListener("change", () => {
    updateBannerFormVisibility();
  });

  bannerLinkTarget?.addEventListener("change", () => {
    updateBannerFormVisibility();
  });

  cpfCnpjInput?.addEventListener("input", (event) => {
    event.target.value = formatCpfCnpj(event.target.value);
  });

  phoneInput?.addEventListener("input", (event) => {
    event.target.value = formatPhone(event.target.value);
  });

  whatsappInput?.addEventListener("input", (event) => {
    event.target.value = formatPhone(event.target.value);
  });

  copyTemporaryPasswordBtn?.addEventListener("click", async () => {
    const password = temporaryPasswordField?.value || "";

    if (!password) return;

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
      if (copyTemporaryPasswordBtn) {
        copyTemporaryPasswordBtn.textContent = "Copiar senha";
      }
    }, 2000);
  });

  createClientForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (createClientMessage) {
      createClientMessage.textContent = "Enviando...";
    }

    hidePasswordBox();
    hideAdminFeedback();

    const formData = {
      full_name: document.getElementById("fullName")?.value.trim() || "",
      company_name: document.getElementById("companyName")?.value.trim() || "",
      cpf_cnpj: onlyDigits(document.getElementById("cpfCnpj")?.value || ""),
      email: document.getElementById("email")?.value.trim() || "",
      role: "client",
      address_zip: onlyDigits(document.getElementById("addressZip")?.value || ""),
      address_street: document.getElementById("addressStreet")?.value.trim() || "",
      address_number: document.getElementById("addressNumber")?.value.trim() || "",
      address_complement: document.getElementById("addressComplement")?.value.trim() || "",
      address_neighborhood: document.getElementById("addressNeighborhood")?.value.trim() || "",
      address_city: document.getElementById("addressCity")?.value.trim() || "",
      address_state: document.getElementById("addressState")?.value.trim() || "",
      phone: onlyDigits(document.getElementById("phone")?.value || ""),
      whatsapp: onlyDigits(document.getElementById("whatsapp")?.value || "")
    };

    if (!formData.full_name || !formData.company_name || !formData.cpf_cnpj || !formData.email) {
      if (createClientMessage) {
        createClientMessage.textContent = "Preencha os campos obrigatórios.";
      }
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
        if (createClientMessage) {
          createClientMessage.textContent = data.error || "Erro ao cadastrar cliente.";
        }
        showAdminFeedback(data.error || "Erro ao cadastrar cliente.", "error");
        refreshSectionHeight(createClientWrapper);
        return;
      }

      if (createClientMessage) {
        createClientMessage.textContent = "Cliente cadastrado com sucesso.";
      }

      showAdminFeedback("Cliente cadastrado com sucesso.", "success");
      createClientForm.reset();

      if (data.temporary_password) {
        showPassword(data.temporary_password);
      } else {
        hidePasswordBox();
      }

      showCreateClientForm();
      refreshSectionHeight(createClientWrapper);
      await loadClients();
    } catch (error) {
      console.error("Erro ao cadastrar cliente:", error);

      if (createClientMessage) {
        createClientMessage.textContent = "Erro ao conectar.";
      }

      showAdminFeedback("Erro ao conectar para cadastrar cliente.", "error");
      refreshSectionHeight(createClientWrapper);
    }
  });

  bindHomeBannerForm();

  prepareCollapsibleSection(createClientWrapper);
  prepareCollapsibleSection(clientsSectionWrapper);
  prepareCollapsibleSection(homeBannersWrapper);

  loadAdminInfo();
  hidePasswordBox();
  collapseSectionInstant(createClientWrapper);
  collapseSectionInstant(clientsSectionWrapper);
  collapseSectionInstant(homeBannersWrapper);

  if (toggleCreateClientBtn) toggleCreateClientBtn.textContent = "Novo Cliente";
  if (toggleClientsListBtn) toggleClientsListBtn.textContent = "Exibir Clientes";
  if (toggleHomeBannersBtn) toggleHomeBannersBtn.textContent = "Exibir Banners";

  updateBannerFormVisibility();
  await loadClients();
});