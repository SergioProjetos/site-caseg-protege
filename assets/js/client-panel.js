document.addEventListener("DOMContentLoaded", function () {
  let profile = null;
  let allClientDocuments = [];
  let clientNoticeResolver = null;
  let isClientLogoutInProgress = false;

  const RECENT_DOCUMENTS_PERIOD_DAYS = 7;
  const RECENT_DOCUMENTS_PERIOD_MS = RECENT_DOCUMENTS_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const LOGOUT_REQUEST_TIMEOUT_MS = 4000;
  const CLIENT_SESSION_REFRESH_TIMEOUT_MS = 8000;
  const CLIENT_SESSION_REFRESH_RETRY_DELAY_MS = 1000;

  let token = "";

  const welcomeMessage = document.querySelector("#welcomeMessage");
  const companyName = document.querySelector("#companyName");
  const documentsList = document.querySelector("#documentsList");
  const recentDocumentsList = document.querySelector("#recentDocumentsList");
  const logoutBtn = document.querySelector("#logoutBtn");

  const documentSearchInput = document.querySelector("#documentSearchInput");
  const clearDocumentSearchBtn = document.querySelector("#clearDocumentSearchBtn");

  const clientTopbarName = document.querySelector("#clientTopbarName");
  const clientTopbarCompany = document.querySelector("#clientTopbarCompany");
  const clientUserAvatar = document.querySelector("#clientUserAvatar");

  const clientAccountName = document.querySelector("#clientAccountName");
  const clientAccountCompany = document.querySelector("#clientAccountCompany");
  const clientAccountEmail = document.querySelector("#clientAccountEmail");

  const clientTotalDocuments = document.querySelector("#clientTotalDocuments");
  const clientTotalCategories = document.querySelector("#clientTotalCategories");
  const clientTotalSubcategories = document.querySelector("#clientTotalSubcategories");
  const clientRecentDocuments = document.querySelector("#clientRecentDocuments");

  /* ===============================
     AVISO MODERNO
  ================================ */

  function createClientNoticeModal() {
    let noticeOverlay = document.querySelector("#clientNoticeOverlay");

    if (noticeOverlay) {
      return noticeOverlay;
    }

    noticeOverlay = document.createElement("div");
    noticeOverlay.id = "clientNoticeOverlay";
    noticeOverlay.className = "client-notice-overlay";
    noticeOverlay.hidden = true;

    noticeOverlay.innerHTML = `
      <div class="client-notice-modal" role="dialog" aria-modal="true" aria-labelledby="clientNoticeTitle">
        <div class="client-notice-glow"></div>

        <div class="client-notice-header">
          <div class="client-notice-icon">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          </div>

          <div>
            <span class="client-notice-kicker">CASEG Protege</span>
            <h2 id="clientNoticeTitle">Aviso</h2>
          </div>
        </div>

        <p id="clientNoticeMessage" class="client-notice-message"></p>

        <div class="client-notice-actions">
          <button type="button" id="clientNoticeConfirmBtn" class="client-notice-confirm">
            OK
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(noticeOverlay);

    const confirmBtn = noticeOverlay.querySelector("#clientNoticeConfirmBtn");

    confirmBtn.addEventListener("click", closeClientNoticeModal);

    noticeOverlay.addEventListener("click", function (event) {
      if (event.target === noticeOverlay) {
        closeClientNoticeModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !noticeOverlay.hidden) {
        closeClientNoticeModal();
      }
    });

    return noticeOverlay;
  }

  function setClientNoticeType(type) {
    const noticeOverlay = createClientNoticeModal();
    const noticeModal = noticeOverlay.querySelector(".client-notice-modal");
    const noticeIcon = noticeOverlay.querySelector(".client-notice-icon i");

    noticeModal.classList.remove(
      "client-notice-success",
      "client-notice-warning",
      "client-notice-error",
      "client-notice-info"
    );

    noticeModal.classList.add(`client-notice-${type || "info"}`);

    if (type === "success") {
      noticeIcon.className = "fa-solid fa-circle-check";
      return;
    }

    if (type === "warning") {
      noticeIcon.className = "fa-solid fa-triangle-exclamation";
      return;
    }

    if (type === "error") {
      noticeIcon.className = "fa-solid fa-circle-exclamation";
      return;
    }

    noticeIcon.className = "fa-solid fa-circle-info";
  }

  function showClientNotice(message, options = {}) {
    const noticeOverlay = createClientNoticeModal();
    const noticeTitle = noticeOverlay.querySelector("#clientNoticeTitle");
    const noticeMessage = noticeOverlay.querySelector("#clientNoticeMessage");
    const confirmBtn = noticeOverlay.querySelector("#clientNoticeConfirmBtn");

    setClientNoticeType(options.type || "info");

    noticeTitle.textContent = options.title || "Aviso";
    noticeMessage.textContent = message || "";
    confirmBtn.textContent = options.confirmText || "OK";

    noticeOverlay.hidden = false;
    document.body.classList.add("client-notice-open");

    window.requestAnimationFrame(function () {
      noticeOverlay.classList.add("is-visible");
      confirmBtn.focus();
    });

    return new Promise((resolve) => {
      clientNoticeResolver = resolve;
    });
  }

  function closeClientNoticeModal() {
    const noticeOverlay = document.querySelector("#clientNoticeOverlay");

    if (!noticeOverlay || noticeOverlay.hidden) {
      return;
    }

    noticeOverlay.classList.remove("is-visible");
    document.body.classList.remove("client-notice-open");

    window.setTimeout(function () {
      noticeOverlay.hidden = true;

      if (typeof clientNoticeResolver === "function") {
        clientNoticeResolver();
        clientNoticeResolver = null;
      }
    }, 180);
  }

  /* ===============================
     SESSÃO
  ================================ */

  async function refreshClientSession() {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, CLIENT_SESSION_REFRESH_TIMEOUT_MS);

    try {
      const response = await fetch("http://localhost:3000/session/refresh", {
        method: "POST",
        credentials: "include",
        signal: controller.signal
      });

      let data = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      return { status: response.status, data };
    } catch {
      return { status: 0, data: null };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function isValidClientSessionRefreshData(data) {
    const session = data?.session;
    const refreshedProfile = data?.profile;

    return (
      data !== null &&
      typeof data === "object" &&
      session !== null &&
      typeof session === "object" &&
      typeof session.access_token === "string" &&
      session.access_token.length > 0 &&
      typeof session.token_type === "string" &&
      session.token_type.length > 0 &&
      typeof session.expires_in === "number" &&
      Number.isFinite(session.expires_in) &&
      session.expires_in > 0 &&
      typeof session.expires_at === "number" &&
      Number.isFinite(session.expires_at) &&
      session.expires_at > Date.now() / 1000 &&
      refreshedProfile !== null &&
      typeof refreshedProfile === "object" &&
      refreshedProfile.role === "client" &&
      typeof refreshedProfile.must_change_password === "boolean"
    );
  }

  function clearClientSession() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("profile");
    localStorage.removeItem("session_expires_at");
    localStorage.removeItem("session_expires_in");
    localStorage.removeItem("admin_session_expires_at");
  }

  async function attemptRemoteLogout(accessToken) {
    if (!accessToken) {
      return false;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, LOGOUT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("http://localhost:3000/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        signal: controller.signal
      });

      return response.ok;
    } catch (error) {
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function clearSessionAndRedirect(message = "Sua sessão expirou. Faça login novamente.") {
    clearClientSession();

    showClientNotice(message, {
      title: "Sessão encerrada",
      type: "warning",
      confirmText: "Entrar novamente"
    }).then(function () {
      window.location.href = "login.html";
    });
  }

  function validateClientAccess() {
    if (!profile || !token) {
      clearSessionAndRedirect("Sessão inválida. Faça login novamente.");
      return false;
    }

    if (profile.role !== "client") {
      clearSessionAndRedirect("Acesso restrito.");
      return false;
    }

    if (profile.must_change_password === true) {
      window.location.href = "primeiro-acesso.html";
      return false;
    }

    return true;
  }

  /* ===============================
     UTILITÁRIOS
  ================================ */

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setText(element, value) {
    if (element) {
      element.innerText = value;
    }
  }

  function getInitials(name) {
    const safeName = String(name || "Cliente").trim();
    const parts = safeName.split(" ").filter(Boolean);

    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    return safeName.slice(0, 2).toUpperCase();
  }

  function formatCountLabel(total) {
    return total === 1 ? "1 arquivo" : `${total} arquivos`;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function setDownloadLoadingState(element, isLoading) {
    if (!element) {
      return;
    }

    if (isLoading) {
      element.classList.add("is-downloading");
      element.setAttribute("aria-busy", "true");
      element.setAttribute("aria-disabled", "true");
      return;
    }

    element.classList.remove("is-downloading");
    element.removeAttribute("aria-busy");
    element.removeAttribute("aria-disabled");
  }

  function getDocumentRecentTimestamp(doc) {
    const dateValue = doc.created_at || doc.updated_at || doc.uploaded_at || "";
    const timestamp = new Date(dateValue).getTime();

    if (!Number.isFinite(timestamp)) {
      return 0;
    }

    return timestamp;
  }

  function isDocumentWithinRecentPeriod(doc) {
    const timestamp = getDocumentRecentTimestamp(doc);

    if (!timestamp) {
      return false;
    }

    return timestamp >= Date.now() - RECENT_DOCUMENTS_PERIOD_MS;
  }

  function filterRecentDocuments(documents) {
    const safeDocuments = Array.isArray(documents) ? documents : [];

    return safeDocuments.filter((doc) => isDocumentWithinRecentPeriod(doc));
  }

  /* ===============================
     MENU LATERAL ATIVO
  ================================ */

  function clearSidebarActiveLinks() {
    const sidebarLinks = document.querySelectorAll(".client-sidebar-link");

    sidebarLinks.forEach((link) => {
      if (link.id !== "logoutBtn") {
        link.classList.remove("active");
      }
    });
  }

  function setSidebarActiveLink(activeLink) {
    if (!activeLink || activeLink.id === "logoutBtn") {
      return;
    }

    clearSidebarActiveLinks();
    activeLink.classList.add("active");
  }

  function updateSidebarActiveByHash() {
    const currentHash = window.location.hash || "#painel";

    let activeLink = document.querySelector(`.client-sidebar-link[href="${currentHash}"]`);

    if (!activeLink) {
      activeLink = document.querySelector('.client-sidebar-link[href="#painel"]');
    }

    setSidebarActiveLink(activeLink);
  }

  function isTrainingPortalLink(link) {
    if (!link) {
      return false;
    }

    const linkText = normalizeSearchText(link.textContent || "");
    const linkHref = normalizeSearchText(link.getAttribute("href") || "");
    const linkId = normalizeSearchText(link.id || "");

    return (
      linkText.includes("treinamento") ||
      linkHref.includes("treinamento") ||
      linkId.includes("treinamento") ||
      linkId.includes("training")
    );
  }

  async function showTrainingPortalNotice() {
    await showClientNotice(
      "Portal de Treinamentos CASEG Protege estará disponível em breve.",
      {
        title: "Portal de treinamento",
        type: "info",
        confirmText: "Entendi"
      }
    );
  }

  function setupSidebarActiveNavigation() {
    const sidebarLinks = document.querySelectorAll(".client-sidebar-link");

    sidebarLinks.forEach((link) => {
      if (link.id === "logoutBtn") {
        return;
      }

      link.addEventListener("click", async function (event) {
        if (isTrainingPortalLink(link)) {
          event.preventDefault();
          await showTrainingPortalNotice();
          updateSidebarActiveByHash();
          return;
        }

        setSidebarActiveLink(link);
      });
    });

    window.addEventListener("hashchange", updateSidebarActiveByHash);

    updateSidebarActiveByHash();
  }

  /* ===============================
     INFORMAÇÕES DO CLIENTE
  ================================ */

  function loadClientInfo() {
    if (!profile) {
      return;
    }

    const displayName = profile.full_name || "Cliente";
    const company = profile.company_name || "-";
    const email = profile.email || "-";

    setText(welcomeMessage, "Bem-vindo, " + displayName);
    setText(companyName, "Empresa: " + company);

    setText(clientTopbarName, displayName);
    setText(clientTopbarCompany, company);
    setText(clientUserAvatar, getInitials(displayName));

    setText(clientAccountName, displayName);
    setText(clientAccountCompany, company);
    setText(clientAccountEmail, email);
  }

  /* ===============================
     DASHBOARD
  ================================ */

  function resetClientDashboardStats() {
    setText(clientTotalDocuments, "0");
    setText(clientTotalCategories, "0");
    setText(clientTotalSubcategories, "0");
    setText(clientRecentDocuments, "0");
  }

  function updateClientDashboardStats(documents) {
    const safeDocuments = Array.isArray(documents) ? documents : [];
    const recentDocuments = filterRecentDocuments(safeDocuments);

    const categories = new Set();
    const subcategories = new Set();

    safeDocuments.forEach((doc) => {
      const category = String(doc.category || "").trim();
      const subcategory = String(doc.subcategory || "").trim();

      if (category) {
        categories.add(category.toLowerCase());
      }

      if (subcategory) {
        subcategories.add(subcategory.toLowerCase());
      }
    });

    setText(clientTotalDocuments, String(safeDocuments.length));
    setText(clientTotalCategories, String(categories.size));
    setText(clientTotalSubcategories, String(subcategories.size));
    setText(clientRecentDocuments, String(recentDocuments.length));
  }

  /* ===============================
     DOCUMENTOS RECENTES
  ================================ */

  function sortDocumentsForRecent(documents) {
    const safeDocuments = filterRecentDocuments(documents);

    safeDocuments.sort((a, b) => {
      const dateA = getDocumentRecentTimestamp(a);
      const dateB = getDocumentRecentTimestamp(b);

      if (dateA !== dateB) {
        return dateB - dateA;
      }

      return Number(b.id || 0) - Number(a.id || 0);
    });

    return safeDocuments;
  }

  function renderRecentDocuments(documents) {
    if (!recentDocumentsList) {
      return;
    }

    const recentDocuments = sortDocumentsForRecent(documents);

    if (recentDocuments.length === 0) {
      recentDocumentsList.innerHTML =
        "<p class='empty-message'>Nenhum documento recente nos últimos 7 dias.</p>";
      return;
    }

    recentDocumentsList.innerHTML = "";

    recentDocuments.forEach((doc) => {
      const item = document.createElement("a");
      item.href = "#";
      item.className = "client-recent-item";
      item.dataset.documentId = doc.id;

      item.innerHTML = `
        <span class="client-recent-name">${escapeHtml(doc.file_name || "Documento")}</span>
      `;

      recentDocumentsList.appendChild(item);
    });

    setupRecentDocumentLinks();
  }

  function setupRecentDocumentLinks() {
    const recentLinks = document.querySelectorAll(".client-recent-item");

    recentLinks.forEach((link) => {
      link.addEventListener("click", async (event) => {
        event.preventDefault();

        if (link.classList.contains("is-downloading")) {
          return;
        }

        const documentId = link.dataset.documentId;

        await downloadDocument(documentId, link);
      });
    });
  }

  /* ===============================
     BUSCA DE DOCUMENTOS
  ================================ */

  function getDocumentSearchText(doc) {
    return normalizeSearchText([
      doc.file_name,
      doc.category,
      doc.subcategory,
      doc.year
    ].join(" "));
  }

  function filterDocumentsBySearch(documents, searchTerm) {
    const normalizedSearch = normalizeSearchText(searchTerm);

    if (!normalizedSearch) {
      return Array.isArray(documents) ? documents : [];
    }

    return documents.filter((doc) => {
      return getDocumentSearchText(doc).includes(normalizedSearch);
    });
  }

  function updateClearSearchButton() {
    if (!clearDocumentSearchBtn || !documentSearchInput) {
      return;
    }

    clearDocumentSearchBtn.hidden = normalizeSearchText(documentSearchInput.value) === "";
  }

  function applyDocumentSearch() {
    if (!documentsList) {
      return;
    }

    const searchTerm = documentSearchInput ? documentSearchInput.value : "";
    const normalizedSearch = normalizeSearchText(searchTerm);
    const filteredDocuments = filterDocumentsBySearch(allClientDocuments, searchTerm);

    updateClearSearchButton();

    if (!Array.isArray(allClientDocuments) || allClientDocuments.length === 0) {
      documentsList.innerHTML =
        "<p class='empty-message'>Nenhum documento disponível no momento.</p>";
      return;
    }

    if (filteredDocuments.length === 0) {
      documentsList.innerHTML =
        `<p class='empty-message'>Nenhum documento encontrado para "${escapeHtml(searchTerm)}".</p>`;
      return;
    }

    renderGroupedDocuments(filteredDocuments, {
      forceOpen: normalizedSearch !== ""
    });
  }

  function setupDocumentSearch() {
    if (!documentSearchInput) {
      return;
    }

    documentSearchInput.addEventListener("input", function () {
      applyDocumentSearch();
    });

    if (clearDocumentSearchBtn) {
      clearDocumentSearchBtn.addEventListener("click", function () {
        documentSearchInput.value = "";
        applyDocumentSearch();
        documentSearchInput.focus();
      });
    }

    updateClearSearchButton();
  }

  /* ===============================
     LOGOUT
  ================================ */

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      if (isClientLogoutInProgress) {
        return;
      }

      isClientLogoutInProgress = true;

      const accessToken = token || "";

      try {
        await attemptRemoteLogout(accessToken);
      } finally {
        clearClientSession();
      }

      try {
        await showClientNotice("Você saiu do sistema.", {
          title: "Sessão encerrada",
          type: "success",
          confirmText: "OK"
        });
      } finally {
        window.location.href = "login.html";
        isClientLogoutInProgress = false;
      }
    });
  }

  /* ===============================
     DOCUMENTOS
  ================================ */

  async function loadDocuments() {
    if (!profile) {
      return;
    }

    if (!token) {
      clearSessionAndRedirect("Sessão inválida. Faça login novamente.");
      return;
    }

    resetClientDashboardStats();

    allClientDocuments = [];

    if (documentsList) {
      documentsList.innerHTML = "<p class='loading-message'>Carregando documentos...</p>";
    }

    if (recentDocumentsList) {
      recentDocumentsList.innerHTML = "<p class='loading-message'>Carregando documentos recentes...</p>";
    }

    try {
      const response = await fetch("http://localhost:3000/documents", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const documents = await response.json();

      if (response.status === 401) {
        clearSessionAndRedirect("Sua sessão expirou. Faça login novamente.");
        return;
      }

      if (!response.ok) {
        resetClientDashboardStats();

        if (documentsList) {
          documentsList.innerHTML =
            `<p class='empty-message'>${documents.error || "Erro ao carregar documentos."}</p>`;
        }

        if (recentDocumentsList) {
          recentDocumentsList.innerHTML =
            `<p class='empty-message'>${documents.error || "Erro ao carregar documentos recentes."}</p>`;
        }

        return;
      }

      if (!Array.isArray(documents) || documents.length === 0) {
        resetClientDashboardStats();

        if (documentsList) {
          documentsList.innerHTML =
            "<p class='empty-message'>Nenhum documento disponível no momento.</p>";
        }

        if (recentDocumentsList) {
          recentDocumentsList.innerHTML =
            "<p class='empty-message'>Nenhum documento recente disponível.</p>";
        }

        return;
      }

      allClientDocuments = documents;

      updateClientDashboardStats(documents);
      renderRecentDocuments(documents);
      applyDocumentSearch();

    } catch (error) {
      console.error("Erro ao buscar documentos:", error);

      allClientDocuments = [];
      resetClientDashboardStats();

      if (documentsList) {
        documentsList.innerHTML =
          "<p class='empty-message'>Erro ao carregar documentos.</p>";
      }

      if (recentDocumentsList) {
        recentDocumentsList.innerHTML =
          "<p class='empty-message'>Erro ao carregar documentos recentes.</p>";
      }
    }
  }

  function renderGroupedDocuments(documents, options = {}) {
    if (!documentsList) {
      return;
    }

    const forceOpen = options.forceOpen === true;
    const groupedByCategory = {};

    documents.forEach((doc) => {
      const category = doc.category || "Sem categoria";

      if (!groupedByCategory[category]) {
        groupedByCategory[category] = [];
      }

      groupedByCategory[category].push(doc);
    });

    const groupedBySubcategory = {};

    Object.keys(groupedByCategory).forEach((category) => {
      groupedBySubcategory[category] = {};

      groupedByCategory[category].forEach((doc) => {
        const subcategory = doc.subcategory ? doc.subcategory : null;

        if (!groupedBySubcategory[category][subcategory]) {
          groupedBySubcategory[category][subcategory] = [];
        }

        groupedBySubcategory[category][subcategory].push(doc);
      });
    });

    const groupedByYear = {};

    Object.keys(groupedBySubcategory).forEach((category) => {
      groupedByYear[category] = {};

      Object.keys(groupedBySubcategory[category]).forEach((subcategory) => {
        groupedByYear[category][subcategory] = {};

        groupedBySubcategory[category][subcategory].forEach((doc) => {
          const year = doc.year || "Sem ano";

          if (!groupedByYear[category][subcategory][year]) {
            groupedByYear[category][subcategory][year] = [];
          }

          groupedByYear[category][subcategory][year].push(doc);
        });
      });
    });

    documentsList.innerHTML = "";

    Object.keys(groupedByYear).forEach((category) => {
      const categoryDocsTotal = groupedByCategory[category].length;

      const categoryElement = document.createElement("div");
      categoryElement.className = "doc-category";

      const categoryButton = document.createElement("button");
      categoryButton.className = "doc-category-toggle";
      categoryButton.type = "button";

      categoryButton.innerHTML = `
        <span class="doc-toggle-label">${escapeHtml(category)}</span>
        <span class="doc-count-badge">${escapeHtml(formatCountLabel(categoryDocsTotal))}</span>
      `;

      const subcategoriesContainer = document.createElement("div");
      subcategoriesContainer.className = "doc-subcategories";

      if (forceOpen) {
        subcategoriesContainer.classList.add("is-open");
        categoryButton.classList.add("is-open");
      }

      categoryElement.appendChild(categoryButton);
      categoryElement.appendChild(subcategoriesContainer);
      documentsList.appendChild(categoryElement);

      Object.keys(groupedByYear[category]).forEach((subcategory) => {
        let yearsContainer;

        if (subcategory === "null") {
          yearsContainer = document.createElement("div");
          yearsContainer.className = "doc-years is-open";
          subcategoriesContainer.appendChild(yearsContainer);
        } else {
          const subcategoryElement = document.createElement("div");
          subcategoryElement.className = "doc-subcategory";

          const subcategoryButton = document.createElement("button");
          subcategoryButton.className = "doc-subcategory-toggle";
          subcategoryButton.type = "button";
          subcategoryButton.textContent = subcategory;

          yearsContainer = document.createElement("div");
          yearsContainer.className = "doc-years";

          if (forceOpen) {
            yearsContainer.classList.add("is-open");
            subcategoryButton.classList.add("is-open");
          }

          subcategoryElement.appendChild(subcategoryButton);
          subcategoryElement.appendChild(yearsContainer);
          subcategoriesContainer.appendChild(subcategoryElement);
        }

        Object.keys(groupedByYear[category][subcategory]).forEach((year) => {
          const yearElement = document.createElement("div");
          yearElement.className = "doc-year";

          const yearButton = document.createElement("button");
          yearButton.className = "doc-year-toggle";
          yearButton.type = "button";
          yearButton.textContent = year;

          const filesContainer = document.createElement("div");
          filesContainer.className = "doc-files";

          if (forceOpen) {
            filesContainer.classList.add("is-open");
            yearButton.classList.add("is-open");
          }

          yearElement.appendChild(yearButton);
          yearElement.appendChild(filesContainer);
          yearsContainer.appendChild(yearElement);

          groupedByYear[category][subcategory][year].forEach((doc) => {
            const ul = document.createElement("ul");
            const li = document.createElement("li");
            const link = document.createElement("a");

            link.href = "#";
            link.className = "doc-file-link";
            link.dataset.documentId = doc.id;
            link.textContent = doc.file_name;

            li.appendChild(link);
            ul.appendChild(li);
            filesContainer.appendChild(ul);
          });
        });
      });
    });

    setupDocumentToggles();
    setupDocumentLinks();
  }

  /* ===============================
     TOGGLES
  ================================ */

  function syncDocumentToggleButton(button, panel) {
    if (!button || !panel) {
      return;
    }

    if (panel.classList.contains("is-open")) {
      button.classList.add("is-open");
      return;
    }

    button.classList.remove("is-open");
  }

  function toggleDocumentPanel(button, panel) {
    if (!panel) {
      return;
    }

    panel.classList.toggle("is-open");
    syncDocumentToggleButton(button, panel);
  }

  function setupDocumentToggles() {
    const categoryButtons = document.querySelectorAll(".doc-category-toggle");

    categoryButtons.forEach((button) => {
      const subcategories = button.nextElementSibling;

      syncDocumentToggleButton(button, subcategories);

      button.addEventListener("click", () => {
        toggleDocumentPanel(button, subcategories);
      });
    });

    const subcategoryButtons = document.querySelectorAll(".doc-subcategory-toggle");

    subcategoryButtons.forEach((button) => {
      const years = button.nextElementSibling;

      syncDocumentToggleButton(button, years);

      button.addEventListener("click", () => {
        toggleDocumentPanel(button, years);
      });
    });

    const yearButtons = document.querySelectorAll(".doc-year-toggle");

    yearButtons.forEach((button) => {
      const files = button.nextElementSibling;

      syncDocumentToggleButton(button, files);

      button.addEventListener("click", () => {
        toggleDocumentPanel(button, files);
      });
    });
  }

  /* ===============================
     DOWNLOAD DOCUMENTOS
  ================================ */

  function setupDocumentLinks() {
    const fileLinks = document.querySelectorAll(".doc-file-link");

    fileLinks.forEach((link) => {
      link.addEventListener("click", async (event) => {
        event.preventDefault();

        if (link.classList.contains("is-downloading")) {
          return;
        }

        const documentId = link.dataset.documentId;

        await downloadDocument(documentId, link);
      });
    });
  }

  async function downloadDocument(documentId, triggerElement = null) {
    if (!documentId) {
      await showClientNotice("Documento inválido.", {
        title: "Não foi possível continuar",
        type: "error",
        confirmText: "Entendi"
      });
      return;
    }

    setDownloadLoadingState(triggerElement, true);

    try {
      const response = await fetch("http://localhost:3000/documents/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ document_id: documentId })
      });

      const data = await response.json();

      if (response.status === 401) {
        clearSessionAndRedirect("Sua sessão expirou. Faça login novamente.");
        return;
      }

      if (!response.ok) {
        await showClientNotice(data.error || "Erro ao gerar link do documento.", {
          title: "Erro no download",
          type: "error",
          confirmText: "OK"
        });
        return;
      }

      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        await showClientNotice("Nenhuma URL foi retornada para o documento.", {
          title: "Documento indisponível",
          type: "warning",
          confirmText: "OK"
        });
      }
    } catch (error) {
      console.error("Erro ao gerar link do documento:", error);

      await showClientNotice("Erro ao gerar link do documento.", {
        title: "Erro no download",
        type: "error",
        confirmText: "OK"
      });
    } finally {
      setDownloadLoadingState(triggerElement, false);
    }
  }

  /* ===============================
     INIT
  ================================ */

  async function initClientPanel() {
    let refreshResult = await refreshClientSession();

    if (
      refreshResult.status === 0 ||
      refreshResult.status === 502
    ) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, CLIENT_SESSION_REFRESH_RETRY_DELAY_MS);
      });

      refreshResult = await refreshClientSession();
    }

    const { status, data } = refreshResult;

    if (status === 200) {
      if (!isValidClientSessionRefreshData(data)) {
        clearSessionAndRedirect();
        return;
      }

      token = data.session.access_token;
      profile = data.profile;
    } else if (status === 401 || status === 500) {
      clearSessionAndRedirect();
      return;
    } else if (status !== 0 && status !== 502) {
      clearSessionAndRedirect();
      return;
    }

    const accessAllowed = validateClientAccess();

    if (!accessAllowed) {
      return;
    }

    setupSidebarActiveNavigation();
    setupDocumentSearch();
    loadClientInfo();
    loadDocuments();
  }

  initClientPanel();
});