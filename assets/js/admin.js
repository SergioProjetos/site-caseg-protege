document.addEventListener("DOMContentLoaded", async () => {
  let token = localStorage.getItem("access_token");

  let profile = {};

  try {
    profile = JSON.parse(localStorage.getItem("profile") || "{}");
  } catch (error) {
    profile = {};
  }

  if (!token && !localStorage.getItem("refresh_token")) {
    window.location.href = "login.html";
    return;
  }

  const ALLOWED_BANNER_SIZES = [
    { width: 1920, height: 600 },
    { width: 1600, height: 500 }
  ];

  const BANNER_DIMENSION_MESSAGE =
    "A imagem do banner deve ter exatamente 1920x600px ou 1600x500px.";

  const SESSION_REFRESH_MARGIN_SECONDS = 5 * 60;

  const adminNameElement = document.getElementById("adminName");
  const adminRoleElement = document.getElementById("adminRole");
  const adminWelcome = document.getElementById("adminWelcome");
  const logoutBtn = document.getElementById("logoutBtn");

  const adminFeedback = document.getElementById("adminFeedback");

  const createClientWrapper = document.getElementById("createClientWrapper");
  const clientsSectionWrapper = document.getElementById("clientsSectionWrapper");
  const homeBannersWrapper = document.getElementById("homeBannersWrapper");

  const createClientModal = document.getElementById("createClientModal");
  const createClientModalBackdrop = document.getElementById("createClientModalBackdrop");
  const closeCreateClientModalBtn = document.getElementById("closeCreateClientModalBtn");
  const cancelCreateClientModalBtn = document.getElementById("cancelCreateClientModalBtn");

  const toggleCreateClientBtn = document.getElementById("toggleCreateClientBtn");
  const toggleClientsListBtn = document.getElementById("toggleClientsListBtn");
  const toggleHomeBannersBtn = document.getElementById("toggleHomeBannersBtn");

  const dashboardQuickNewClientBtn = document.getElementById("dashboardQuickNewClientBtn");
  const dashboardQuickClientsBtn = document.getElementById("dashboardQuickClientsBtn");
  const dashboardQuickCreateBannerBtn = document.getElementById("dashboardQuickCreateBannerBtn");
  const dashboardQuickBannersBtn = document.getElementById("dashboardQuickBannersBtn");
  const dashboardRenewalAlertsBody = document.getElementById("dashboardRenewalAlertsBody");
  const dashboardRenewalStatusFilter = document.getElementById("dashboardRenewalStatusFilter");
  const dashboardRenewalClearFiltersBtn = document.getElementById("dashboardRenewalClearFiltersBtn");

  const adminActionModal = document.getElementById("adminActionModal");
  const adminActionModalBackdrop = document.getElementById("adminActionModalBackdrop");
  const adminActionModalIcon = document.getElementById("adminActionModalIcon");
  const adminActionModalIconSymbol = document.getElementById("adminActionModalIconSymbol");
  const adminActionModalKicker = document.getElementById("adminActionModalKicker");
  const adminActionModalTitle = document.getElementById("adminActionModalTitle");
  const adminActionModalMessage = document.getElementById("adminActionModalMessage");
  const adminActionModalConfirmBtn = document.getElementById("adminActionModalConfirmBtn");
  const adminActionModalCancelBtn = document.getElementById("adminActionModalCancelBtn");

  const createClientForm = document.getElementById("createClientForm");
  const createClientMessage = document.getElementById("createClientMessage");

  const cpfCnpjInput = document.getElementById("cpfCnpj");
  const phoneInput = document.getElementById("phone");
  const whatsappInput = document.getElementById("whatsapp");

  const temporaryPasswordBox = document.getElementById("temporaryPasswordBox");
  const temporaryPasswordField = document.getElementById("temporaryPasswordField");
  const copyTemporaryPasswordBtn = document.getElementById("copyTemporaryPasswordBtn");

  const clientsList = document.getElementById("clientsList");
  const clientsListMessage = document.getElementById("clientsListMessage");
  const clientsSearchInput = document.getElementById("clientsSearchInput");
  const clientsStatusFilter = document.getElementById("clientsStatusFilter");
  const clientsTypeFilter = document.getElementById("clientsTypeFilter");
  const clientsQuickCreateBtn = document.getElementById("clientsQuickCreateBtn");

  const homeBannerForm = document.getElementById("homeBannerForm");
  const homeBannerMessage = document.getElementById("homeBannerMessage");
  const homeBannersList = document.getElementById("homeBannersList");
  const homeBannersListMessage = document.getElementById("homeBannersListMessage");

  const toggleBannerFormBtn = document.getElementById("toggleBannerFormBtn");
  const saveBannerBtn = document.getElementById("saveBannerBtn");
  const cancelBannerEditBtn = document.getElementById("cancelBannerEditBtn");
  const cancelBannerEditBtnBottom = document.getElementById("cancelBannerEditBtnBottom");

  const bannerEditId = document.getElementById("bannerEditId");
  const bannerEditModeBox = document.getElementById("bannerEditModeBox");
  const bannerTitle = document.getElementById("bannerTitle");
  const bannerActionType = document.getElementById("bannerActionType");
  const bannerLinkTarget = document.getElementById("bannerLinkTarget");
  const bannerLink = document.getElementById("bannerLink");
  const bannerDescription = document.getElementById("bannerDescription");
  const bannerImage = document.getElementById("bannerImage");
  const bannerIsActive = document.getElementById("bannerIsActive");
  const bannerCurrentImageBox = document.getElementById("bannerCurrentImageBox");
  const bannerCurrentImage = document.getElementById("bannerCurrentImage");

  const bannerLinkTargetGroup = document.getElementById("bannerLinkTargetGroup");
  const bannerCustomLinkGroup = document.getElementById("bannerCustomLinkGroup");
  const bannerDescriptionGroup = document.getElementById("bannerDescriptionGroup");

  const clientCardTemplate = document.getElementById("clientCardTemplate");
  const clientUploadFormTemplate = document.getElementById("clientUploadFormTemplate");
  const documentsPanelTemplate = document.getElementById("documentsPanelTemplate");
  const documentItemTemplate = document.getElementById("documentItemTemplate");
  const emptyDocumentsTemplate = document.getElementById("emptyDocumentsTemplate");
  const homeBannerCardTemplate = document.getElementById("homeBannerCardTemplate");

  let allClientsCache = [];
  let allHomeBannersCache = [];
  let clientDocumentsCache = {};
  let renewalAlertsCache = [];

  let clientsLoaded = false;
  let homeBannersLoaded = false;

  let clientsSearchDebounceTimer = null;

  let homeBannersSortable = null;
  let bannerOrderBeforeDrag = "";

  let adminSessionRefreshTimer = null;
  let adminSessionRefreshingPromise = null;

  let adminActionModalResolver = null;
  let adminActionModalBackdropResult = true;

  function cloneTemplate(templateElement) {
    if (!templateElement) {
      return null;
    }

    return templateElement.content.firstElementChild.cloneNode(true);
  }

  function setElementText(parent, selector, value) {
    const element = parent?.querySelector(selector);

    if (element) {
      element.textContent = value ?? "";
    }
  }

  function setInputValue(parent, selector, value) {
    const element = parent?.querySelector(selector);

    if (element) {
      element.value = value ?? "";
    }
  }

  function setElementDataset(parent, selector, key, value) {
    const element = parent?.querySelector(selector);

    if (element) {
      element.dataset[key] = value ?? "";
    }
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCpfCnpj(value) {
    const digits = onlyDigits(value);

    if (!digits) return "";

    if (digits.length <= 11) {
      return digits
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2")
        .slice(0, 14);
    }

    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .slice(0, 18);
  }

  function formatPhone(value) {
    const digits = onlyDigits(value);

    if (!digits) return "";

    if (digits.length <= 10) {
      return digits
        .replace(/^(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2")
        .slice(0, 14);
    }

    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .slice(0, 15);
  }

  function formatOptionalCpfCnpj(value) {
    return formatCpfCnpj(value) || "-";
  }

  function formatOptionalPhone(value) {
    return formatPhone(value) || "-";
  }

  function formatDate(value) {
    if (!value) return "-";

    const normalizedValue = String(value).trim();
    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

    const date = dateOnlyPattern.test(normalizedValue)
      ? new Date(`${normalizedValue}T00:00:00`)
      : new Date(normalizedValue);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleDateString("pt-BR");
  }

  function isExpirationBeforeRelease(releaseDate, expirationDate) {
    if (!releaseDate || !expirationDate) {
      return false;
    }

    const release = new Date(`${releaseDate}T00:00:00`);
    const expiration = new Date(`${expirationDate}T00:00:00`);

    if (Number.isNaN(release.getTime()) || Number.isNaN(expiration.getTime())) {
      return false;
    }

    return expiration < release;
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function getClientStatusLabel(isActive) {
    return isActive ? "Ativo" : "Inativo";
  }

  function getClientEntityType(client) {
    const digits = onlyDigits(client?.cpf_cnpj || "");

    return digits.length > 11 ? "pj" : "pf";
  }

  function getClientEntityLabel(client) {
    return getClientEntityType(client) === "pj" ? "CNPJ" : "CPF";
  }

  function getClientId(client) {
    return client?.user_id || client?.id || "";
  }

  function getClientInitials(client) {
    const source = String(client?.company_name || client?.full_name || "Cliente");

    const initials = source
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();

    return initials || "CL";
  }

  function getActionTypeLabel(actionType) {
    const labels = {
      link: "Redirecionar",
      modal: "Abrir Informativo"
    };

    return labels[actionType] || "-";
  }

  function getLinkTargetLabel(linkTarget) {
    const labels = {
      whatsapp: "WhatsApp",
      contato: "Contato",
      contact: "Contato",
      servicos: "Serviços",
      services: "Serviços",
      home: "Home",
      custom: "Link personalizado"
    };

    return labels[linkTarget] || "-";
  }

  function getDocumentFileName(documentItem) {
    return (
      documentItem.file_name ||
      documentItem.original_name ||
      documentItem.name ||
      documentItem.title ||
      "Documento"
    );
  }

  function getDocumentCategory(documentItem) {
    return documentItem.category || documentItem.document_category || "-";
  }

  function getDocumentSubcategory(documentItem) {
    return documentItem.subcategory || documentItem.document_subcategory || "-";
  }

  function getDocumentYear(documentItem) {
    return documentItem.year || documentItem.document_year || "-";
  }

  function getDocumentDate(documentItem) {
    return (
      documentItem.created_at ||
      documentItem.uploaded_at ||
      documentItem.sent_at ||
      documentItem.updated_at ||
      null
    );
  }

  function getDocumentReleaseDate(documentItem) {
    return documentItem.release_date || documentItem.document_release_date || null;
  }

  function getDocumentExpirationDate(documentItem) {
    return documentItem.expiration_date || documentItem.document_expiration_date || null;
  }

  function clearAdminSession() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("session_expires_at");
    localStorage.removeItem("session_expires_in");
    localStorage.removeItem("profile");
  }

  function redirectToLoginBecauseSessionExpired() {
    clearAdminSession();
    window.location.href = "login.html";
  }

  function getRefreshToken() {
    return localStorage.getItem("refresh_token") || "";
  }

  function getSessionExpiresAtSeconds() {
    const rawExpiresAt = localStorage.getItem("session_expires_at");
    const expiresAt = Number(rawExpiresAt || 0);

    return Number.isFinite(expiresAt) ? expiresAt : 0;
  }

  function shouldRefreshAdminSession() {
    const expiresAt = getSessionExpiresAtSeconds();

    if (!expiresAt) {
      return false;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);

    return expiresAt - nowInSeconds <= SESSION_REFRESH_MARGIN_SECONDS;
  }

  function saveAdminSessionFromResponse(data) {
    if (!data || !data.session || !data.session.access_token) {
      throw new Error("Resposta inválida ao renovar sessão.");
    }

    token = data.session.access_token;

    localStorage.setItem("access_token", data.session.access_token);

    if (data.session.refresh_token) {
      localStorage.setItem("refresh_token", data.session.refresh_token);
    }

    if (data.session.expires_at) {
      localStorage.setItem("session_expires_at", String(data.session.expires_at));
    }

    if (data.session.expires_in) {
      localStorage.setItem("session_expires_in", String(data.session.expires_in));
    }

    if (data.profile) {
      profile = data.profile;
      localStorage.setItem("profile", JSON.stringify(data.profile));
      loadAdminInfo();
    }

    scheduleAdminSessionRefresh();
  }

  async function refreshAdminSession() {
    if (adminSessionRefreshingPromise) {
      return adminSessionRefreshingPromise;
    }

    adminSessionRefreshingPromise = (async () => {
      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        throw new Error("Refresh token não encontrado.");
      }

      const response = await fetch("http://localhost:3000/admin/refresh-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Sessão expirada. Faça login novamente.");
      }

      saveAdminSessionFromResponse(result);

      return result.session.access_token;
    })();

    try {
      return await adminSessionRefreshingPromise;
    } finally {
      adminSessionRefreshingPromise = null;
    }
  }

  async function ensureValidAdminSession() {
    token = localStorage.getItem("access_token");

    if (!token && getRefreshToken()) {
      await refreshAdminSession();
      return localStorage.getItem("access_token");
    }

    if (token && shouldRefreshAdminSession() && getRefreshToken()) {
      await refreshAdminSession();
      return localStorage.getItem("access_token");
    }

    return token;
  }

  async function adminFetch(url, options = {}) {
    const validToken = await ensureValidAdminSession();

    if (!validToken) {
      redirectToLoginBecauseSessionExpired();
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${validToken}`);

    let response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status !== 401) {
      return response;
    }

    if (!getRefreshToken()) {
      redirectToLoginBecauseSessionExpired();
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    const refreshedToken = await refreshAdminSession();

    const retryHeaders = new Headers(options.headers || {});
    retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);

    response = await fetch(url, {
      ...options,
      headers: retryHeaders
    });

    if (response.status === 401) {
      redirectToLoginBecauseSessionExpired();
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    return response;
  }

  function scheduleAdminSessionRefresh() {
    if (adminSessionRefreshTimer) {
      clearTimeout(adminSessionRefreshTimer);
      adminSessionRefreshTimer = null;
    }

    const expiresAt = getSessionExpiresAtSeconds();
    const refreshToken = getRefreshToken();

    if (!expiresAt || !refreshToken) {
      return;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);

    const delaySeconds = Math.max(
      30,
      expiresAt - nowInSeconds - SESSION_REFRESH_MARGIN_SECONDS
    );

    adminSessionRefreshTimer = setTimeout(async () => {
      try {
        await refreshAdminSession();
      } catch (error) {
        console.error("ERRO AO RENOVAR SESSÃO ADMINISTRATIVA:", error);
      }
    }, delaySeconds * 1000);
  }

  function setTextByIds(ids, value) {
    ids.forEach((id) => {
      const element = document.getElementById(id);

      if (element) {
        element.textContent = value;
      }
    });
  }

  function showAdminFeedback(message, type = "info", autoHide = true) {
    if (!adminFeedback) return;

    adminFeedback.textContent = message;
    adminFeedback.className = `admin-feedback ${type}`;
    adminFeedback.classList.remove("hidden");

    if (autoHide) {
      setTimeout(() => {
        hideAdminFeedback();
      }, 4500);
    }
  }

  function hideAdminFeedback() {
    if (!adminFeedback) return;

    adminFeedback.textContent = "";
    adminFeedback.className = "admin-feedback hidden";
  }

  function getAdminActionModalIconClass(type) {
    const icons = {
      success: "fa-solid fa-check",
      warning: "fa-solid fa-triangle-exclamation",
      danger: "fa-solid fa-trash-can",
      info: "fa-solid fa-circle-info"
    };

    return icons[type] || icons.success;
  }

  function isAdminActionModalAvailable() {
    return Boolean(
      adminActionModal &&
      adminActionModalIcon &&
      adminActionModalIconSymbol &&
      adminActionModalKicker &&
      adminActionModalTitle &&
      adminActionModalMessage &&
      adminActionModalConfirmBtn &&
      adminActionModalCancelBtn
    );
  }

  function isAdminActionModalOpen() {
    return Boolean(adminActionModal && !adminActionModal.classList.contains("hidden"));
  }

  function closeAdminActionModal(result = false) {
    if (adminActionModal) {
      adminActionModal.classList.add("hidden");
      adminActionModal.classList.remove("is-danger");
      adminActionModal.setAttribute("aria-hidden", "true");
    }

    if (adminActionModalConfirmBtn) {
      adminActionModalConfirmBtn.textContent = "OK";
    }

    if (adminActionModalCancelBtn) {
      adminActionModalCancelBtn.textContent = "Cancelar";
      adminActionModalCancelBtn.classList.add("hidden");
    }

    const resolver = adminActionModalResolver;
    adminActionModalResolver = null;

    if (typeof resolver === "function") {
      resolver(result);
    }
  }

  function openAdminActionModal(options = {}) {
    const type = options.type || "success";
    const title = options.title || "Ação concluída";
    const message = options.message || "Operação realizada com sucesso.";
    const kicker = options.kicker || "CASEG PROTEGE";
    const confirmText = options.confirmText || "OK";
    const cancelText = options.cancelText || "Cancelar";
    const showCancel = Boolean(options.showCancel);

    if (!isAdminActionModalAvailable()) {
      if (showCancel) {
        return Promise.resolve(confirm(`${title}\n\n${message}`));
      }

      alert(message);
      return Promise.resolve(true);
    }

    if (adminActionModalResolver) {
      closeAdminActionModal(false);
    }

    adminActionModal.classList.remove("hidden");
    adminActionModal.classList.toggle("is-danger", type === "danger");
    adminActionModal.setAttribute("aria-hidden", "false");

    adminActionModalIcon.className = `admin-action-modal-icon ${type}`;
    adminActionModalIconSymbol.className = getAdminActionModalIconClass(type);

    adminActionModalKicker.textContent = kicker;
    adminActionModalTitle.textContent = title;
    adminActionModalMessage.textContent = message;

    adminActionModalConfirmBtn.textContent = confirmText;
    adminActionModalCancelBtn.textContent = cancelText;
    adminActionModalCancelBtn.classList.toggle("hidden", !showCancel);

    adminActionModalBackdropResult = showCancel ? false : true;

    setTimeout(() => {
      adminActionModalConfirmBtn.focus();
    }, 80);

    return new Promise((resolve) => {
      adminActionModalResolver = resolve;
    });
  }

  function showAdminActionMessage(options = {}) {
    return openAdminActionModal({
      type: options.type || "success",
      title: options.title || "Ação concluída",
      message: options.message || "Operação realizada com sucesso.",
      kicker: options.kicker || "CASEG PROTEGE",
      confirmText: options.confirmText || "OK",
      showCancel: false
    });
  }

  function showAdminActionConfirm(options = {}) {
    return openAdminActionModal({
      type: options.type || "danger",
      title: options.title || "Confirmar ação",
      message: options.message || "Deseja realmente continuar?",
      kicker: options.kicker || "CASEG PROTEGE",
      confirmText: options.confirmText || "Confirmar",
      cancelText: options.cancelText || "Cancelar",
      showCancel: true
    });
  }

  function bindAdminActionModalEvents() {
    if (adminActionModalConfirmBtn && adminActionModalConfirmBtn.dataset.bound !== "true") {
      adminActionModalConfirmBtn.dataset.bound = "true";

      adminActionModalConfirmBtn.addEventListener("click", () => {
        closeAdminActionModal(true);
      });
    }

    if (adminActionModalCancelBtn && adminActionModalCancelBtn.dataset.bound !== "true") {
      adminActionModalCancelBtn.dataset.bound = "true";

      adminActionModalCancelBtn.addEventListener("click", () => {
        closeAdminActionModal(false);
      });
    }

    if (adminActionModalBackdrop && adminActionModalBackdrop.dataset.bound !== "true") {
      adminActionModalBackdrop.dataset.bound = "true";

      adminActionModalBackdrop.addEventListener("click", () => {
        closeAdminActionModal(adminActionModalBackdropResult);
      });
    }
  }

  function setInlineMessage(element, message, type = "info") {
    if (!element) return;

    element.textContent = message || "";
    element.className = `upload-form-message ${type}`;
  }

  function clearBannerMessage() {
    if (!homeBannerMessage) return;

    homeBannerMessage.textContent = "";
    homeBannerMessage.className = "form-message";
  }

  function openPanel(panelElement) {
    if (!panelElement) return;

    panelElement.classList.remove("hidden");
    panelElement.classList.add("is-open");
    panelElement.classList.remove("is-closed");
  }

  function closePanel(panelElement) {
    if (!panelElement) return;

    panelElement.classList.add("hidden");
    panelElement.classList.remove("is-open");
    panelElement.classList.add("is-closed");
  }

  function refreshSectionHeight() {
    return;
  }

  function loadAdminInfo() {
    const responsibleName =
      profile.full_name ||
      profile.name ||
      profile.email ||
      "Administrador";

    if (adminNameElement) {
      adminNameElement.textContent = responsibleName;
    }

    if (adminRoleElement) {
      adminRoleElement.textContent = "Administrador";
    }

    if (adminWelcome) {
      adminWelcome.textContent = `Bem-vindo, ${responsibleName}`;
    }
  }

  async function logoutAdmin() {
    await showAdminActionMessage({
      type: "success",
      title: "Sessão encerrada",
      message: "Você saiu do painel administrativo com segurança.",
      confirmText: "OK"
    });

    clearAdminSession();
    window.location.href = "login.html";
  }

  function getSidebarActionFromLink(link) {
    if (!link) return null;

    const href = String(link.getAttribute("href") || "").toLowerCase();
    const text = normalizeText(link.textContent || "");

    if (
      href.includes("#dashboard") ||
      href.includes("dashboard") ||
      text.includes("dashboard")
    ) {
      return "dashboard";
    }

    if (
      href.includes("#clientes") ||
      href.includes("clientes") ||
      href.includes("clients") ||
      text.includes("clientes")
    ) {
      return "clients";
    }

    if (
      href.includes("#banners") ||
      href.includes("banners") ||
      text.includes("banners")
    ) {
      return "banners";
    }

    if (
      href.includes("#sair") ||
      href.includes("logout") ||
      href.includes("login") ||
      text.includes("sair")
    ) {
      return "logout";
    }

    return null;
  }

  function setSidebarActive(action) {
    document.querySelectorAll(".admin-sidebar-link").forEach((link) => {
      const linkAction = getSidebarActionFromLink(link);
      link.classList.toggle("active", linkAction === action);
    });
  }

  function scrollToSection(sectionWrapper) {
    const target = sectionWrapper?.closest(".admin-section") || sectionWrapper;

    if (!target) return;

    setTimeout(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 180);
  }

  function scrollToDashboard() {
    setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }, 100);
  }

  function updateHash(hash) {
    if (!hash || !window.history?.pushState) return;

    window.history.pushState(null, "", hash);
  }

  function showDashboardFromSidebar(shouldUpdateHash = true) {
    hideClientsList();
    hideHomeBanners();

    if (isCreateClientModalOpen() || (createClientWrapper && !createClientWrapper.classList.contains("hidden"))) {
      hideCreateClientForm();

      if (toggleCreateClientBtn) {
        toggleCreateClientBtn.textContent = "Novo Cliente";
      }
    }

    closeAllDocumentMenus();
    setSidebarActive("dashboard");

    if (shouldUpdateHash) {
      updateHash("#dashboard");
    }

    scrollToDashboard();
  }

  async function openClientsFromSidebar(shouldUpdateHash = true) {
    if (!clientsSectionWrapper) return;

    const isAlreadyOpen = !clientsSectionWrapper.classList.contains("hidden");

    setSidebarActive("clients");

    if (shouldUpdateHash) {
      updateHash("#clientes");
    }

    if (isAlreadyOpen) {
      hideClientsList();
      return;
    }

    showClientsList();

    if (!clientsLoaded) {
      await fetchClients();
    } else {
      renderClientsList(allClientsCache);
    }

    scrollToSection(clientsSectionWrapper);
  }

  async function openBannersFromSidebar(shouldUpdateHash = true) {
    if (!homeBannersWrapper) return;

    const isAlreadyOpen = !homeBannersWrapper.classList.contains("hidden");

    setSidebarActive("banners");

    if (shouldUpdateHash) {
      updateHash("#banners");
    }

    if (isAlreadyOpen) {
      hideHomeBanners();
      return;
    }

    showHomeBanners();

    if (!homeBannersLoaded) {
      await fetchHomeBanners();
    } else {
      renderHomeBannersList(allHomeBannersCache);
    }

    scrollToSection(homeBannersWrapper);
  }

  async function openClientsFromQuickAction() {
    if (!clientsSectionWrapper) return;

    const isAlreadyOpen = !clientsSectionWrapper.classList.contains("hidden");

    if (isAlreadyOpen) {
      hideClientsList();
      closeAllDocumentMenus();
      setSidebarActive("dashboard");
      updateHash("#dashboard");
      scrollToDashboard();
      return;
    }

    setSidebarActive("clients");
    updateHash("#clientes");
    showClientsList();

    if (!clientsLoaded) {
      await fetchClients();
    } else {
      renderClientsList(allClientsCache);
    }

    scrollToSection(clientsSectionWrapper);
  }
  async function openBannersFromQuickAction(options = {}) {
    if (!homeBannersWrapper) return;

    const shouldOpenForm = Boolean(options.openForm);
    const isBannersAlreadyOpen = !homeBannersWrapper.classList.contains("hidden");
    const isBannerFormAlreadyOpen =
      homeBannerForm && !homeBannerForm.classList.contains("hidden");

    if (shouldOpenForm && isBannersAlreadyOpen && isBannerFormAlreadyOpen) {
      homeBannerForm?.reset();
      setBannerFormCreateMode();
      hideBannerForm();
      hideHomeBanners();

      setSidebarActive("dashboard");
      updateHash("#dashboard");
      scrollToDashboard();
      return;
    }

    if (!shouldOpenForm && isBannersAlreadyOpen) {
      if (isBannerFormAlreadyOpen) {
        homeBannerForm?.reset();
        setBannerFormCreateMode();
        hideBannerForm();
      }

      hideHomeBanners();

      setSidebarActive("dashboard");
      updateHash("#dashboard");
      scrollToDashboard();
      return;
    }

    setSidebarActive("banners");
    updateHash("#banners");
    showHomeBanners();

    if (!homeBannersLoaded) {
      await fetchHomeBanners();
    } else {
      renderHomeBannersList(allHomeBannersCache);
    }

    if (shouldOpenForm) {
      if (homeBannerForm) {
        homeBannerForm.reset();
      }

      setBannerFormCreateMode();
      showBannerForm();

      setTimeout(() => {
        homeBannerForm?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 180);

      return;
    }

    scrollToSection(homeBannersWrapper);
  }

  function openCreateClientFromQuickAction() {
    const isAlreadyOpen =
      isCreateClientModalOpen() ||
      Boolean(createClientWrapper && !createClientWrapper.classList.contains("hidden"));

    if (isAlreadyOpen) {
      hideCreateClientForm();

      setSidebarActive("dashboard");
      updateHash("#dashboard");
      scrollToDashboard();
      return;
    }

    showCreateClientForm();
    setSidebarActive("clients");
    updateHash("#clientes");
  }

  async function handleSidebarAction(action, shouldUpdateHash = true) {
    if (action === "dashboard") {
      showDashboardFromSidebar(shouldUpdateHash);
      return;
    }

    if (action === "clients") {
      await openClientsFromSidebar(shouldUpdateHash);
      return;
    }

    if (action === "banners") {
      await openBannersFromSidebar(shouldUpdateHash);
      return;
    }

    if (action === "logout") {
      await logoutAdmin();
    }
  }

  async function applyInitialHashNavigation() {
    const hash = String(window.location.hash || "").toLowerCase();

    if (hash.includes("clientes")) {
      await openClientsFromSidebar(false);
      return;
    }

    if (hash.includes("banners")) {
      await openBannersFromSidebar(false);
      return;
    }

    setSidebarActive("dashboard");
  }

  function updateDashboardClientsSummary(clients) {
    const totalClients = Array.isArray(clients) ? clients.length : 0;

    const activeClients = Array.isArray(clients)
      ? clients.filter((client) => client.is_active !== false).length
      : 0;

    const inactiveClients = totalClients - activeClients;

    setTextByIds(
      ["dashboardTotalClients", "totalClients", "clientsTotalCount"],
      totalClients
    );

    setTextByIds(
      ["dashboardActiveClients", "activeClients", "clientsActiveCount"],
      activeClients
    );

    setTextByIds(
      ["dashboardInactiveClients", "inactiveClients", "clientsInactiveCount"],
      inactiveClients
    );
  }

  function updateDashboardBannersSummary(banners) {
    const activeBanners = Array.isArray(banners)
      ? banners.filter((banner) => banner.is_active !== false).length
      : 0;

    setTextByIds(
      ["dashboardActiveBanners", "activeBanners", "bannersActiveCount"],
      activeBanners
    );
  }

  function getRenewalAlertStatusClass(alert) {
    const status = String(alert?.status || "").trim();

    if (["expired", "due_today", "due_soon"].includes(status)) {
      return status;
    }

    return "due_soon";
  }

  function filterRenewalAlerts(alerts) {
    const selectedStatus = dashboardRenewalStatusFilter?.value || "all";
    const safeAlerts = Array.isArray(alerts) ? alerts : [];

    if (selectedStatus === "all") {
      return safeAlerts;
    }

    return safeAlerts.filter((alert) => {
      return getRenewalAlertStatusClass(alert) === selectedStatus;
    });
  }

  function createRenewalAlertCell(content) {
    const cell = document.createElement("td");

    if (content instanceof Node) {
      cell.appendChild(content);
    } else {
      cell.textContent = content ?? "-";
    }

    return cell;
  }

  function createRenewalAlertRow(alert) {
    const row = document.createElement("tr");

    const companyBox = document.createElement("div");
    companyBox.className = "dashboard-renewal-document";

    const companyName = document.createElement("strong");
    companyName.textContent = alert?.company_name || "-";

    const clientName = document.createElement("small");
    clientName.textContent =
      alert?.client_name && alert.client_name !== "-"
        ? alert.client_name
        : "Cliente não informado";

    companyBox.appendChild(companyName);
    companyBox.appendChild(clientName);

    const documentBox = document.createElement("div");
    documentBox.className = "dashboard-renewal-document";

    const documentName = document.createElement("strong");
    documentName.textContent = alert?.file_name || "Documento";

    const documentMeta = document.createElement("small");
    const category = alert?.category || "-";
    const subcategory = alert?.subcategory || "-";
    const year = alert?.year || "-";
    documentMeta.textContent = `${category} / ${subcategory} · ${year}`;

    documentBox.appendChild(documentName);
    documentBox.appendChild(documentMeta);

    const deadline = document.createElement("span");
    deadline.className = `dashboard-renewal-deadline ${getRenewalAlertStatusClass(alert)}`;
    deadline.textContent = alert?.deadline_label || "Verificar validade";

    const observationBox = document.createElement("div");
    observationBox.className = "dashboard-renewal-document";

    const observation = document.createElement("strong");
    observation.textContent = alert?.observation || "Renovação pendente";

    const expiration = document.createElement("small");
    expiration.textContent = `Validade: ${formatDate(alert?.expiration_date)}`;

    observationBox.appendChild(observation);
    observationBox.appendChild(expiration);

    row.appendChild(createRenewalAlertCell(companyBox));
    row.appendChild(createRenewalAlertCell(documentBox));
    row.appendChild(createRenewalAlertCell(deadline));
    row.appendChild(createRenewalAlertCell(observationBox));

    return row;
  }

  function renderRenewalAlerts(alerts) {
    if (!dashboardRenewalAlertsBody) return;

    dashboardRenewalAlertsBody.replaceChildren();

    const safeAlerts = filterRenewalAlerts(alerts);

    if (!safeAlerts.length) {
      const row = document.createElement("tr");
      row.className = "dashboard-empty-row";

      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "Nenhum aviso de renovação encontrado para o prazo selecionado.";

      row.appendChild(cell);
      dashboardRenewalAlertsBody.appendChild(row);
      return;
    }

    const fragment = document.createDocumentFragment();

    safeAlerts.forEach((alert) => {
      fragment.appendChild(createRenewalAlertRow(alert));
    });

    dashboardRenewalAlertsBody.appendChild(fragment);
  }

  async function fetchRenewalAlerts() {
    if (!dashboardRenewalAlertsBody) return;

    try {
      const loadingRow = document.createElement("tr");
      loadingRow.className = "dashboard-empty-row";

      const loadingCell = document.createElement("td");
      loadingCell.colSpan = 4;
      loadingCell.textContent = "Carregando avisos de renovação...";

      loadingRow.appendChild(loadingCell);
      dashboardRenewalAlertsBody.replaceChildren(loadingRow);

      const response = await adminFetch("http://localhost:3000/admin/documents/renewal-alerts");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao carregar avisos de renovação.");
      }

      renewalAlertsCache = Array.isArray(result.alerts) ? result.alerts : [];
      renderRenewalAlerts(renewalAlertsCache);
    } catch (error) {
      console.error("ERRO AO BUSCAR AVISOS DE RENOVAÇÃO:", error);

      const row = document.createElement("tr");
      row.className = "dashboard-empty-row";

      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = error.message || "Erro ao carregar avisos de renovação.";

      row.appendChild(cell);
      dashboardRenewalAlertsBody.replaceChildren(row);
    }
  }

  function filterClients(clients, searchTerm, statusFilter) {
    const normalizedSearch = normalizeText(searchTerm);
    const selectedType = clientsTypeFilter?.value || "all";

    return clients.filter((client) => {
      const isActive = client.is_active !== false;
      const clientType = getClientEntityType(client);

      const matchesStatus =
        statusFilter === "all" ||
        !statusFilter ||
        (statusFilter === "active" && isActive) ||
        (statusFilter === "inactive" && !isActive);

      const matchesType =
        selectedType === "all" || clientType === selectedType;

      const searchableText = normalizeText(
        [
          client.full_name,
          client.company_name,
          client.cpf_cnpj,
          client.email,
          client.phone,
          client.whatsapp
        ].join(" ")
      );

      const matchesSearch =
        !normalizedSearch || searchableText.includes(normalizedSearch);

      return matchesStatus && matchesType && matchesSearch;
    });
  }

  function updateClientsSummary(filteredClients) {
    setTextByIds(
      ["clientsFilteredCount", "clientsListCount"],
      filteredClients.length
    );
  }

  function filterDocuments(documents, filters) {
    const nameFilter = normalizeText(filters?.name || "");
    const categoryFilter = String(filters?.category || "").trim();
    const yearFilter = String(filters?.year || "").trim();

    return documents.filter((documentItem) => {
      const fileName = getDocumentFileName(documentItem);
      const category = getDocumentCategory(documentItem);
      const year = String(getDocumentYear(documentItem));

      const matchesName =
        !nameFilter || normalizeText(fileName).includes(nameFilter);

      const matchesCategory =
        !categoryFilter || category === categoryFilter;

      const matchesYear =
        !yearFilter || year === yearFilter;

      return matchesName && matchesCategory && matchesYear;
    });
  }

  function getUniqueDocumentCategories(documents) {
    return [
      ...new Set(
        documents
          .map((documentItem) => getDocumentCategory(documentItem))
          .filter((category) => category && category !== "-")
      )
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function getUniqueDocumentYears(documents) {
    return [
      ...new Set(
        documents
          .map((documentItem) => String(getDocumentYear(documentItem)))
          .filter((year) => year && year !== "-")
      )
    ].sort((a, b) => Number(b) - Number(a));
  }

  function fillSelectOptions(selectElement, values, selectedValue, defaultLabel) {
    if (!selectElement) return;

    selectElement.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = defaultLabel;
    selectElement.appendChild(defaultOption);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = String(value) === String(selectedValue || "");
      selectElement.appendChild(option);
    });
  }

  function createClientUploadFormElement(client) {
    const form = cloneTemplate(clientUploadFormTemplate);

    if (!form) {
      return document.createElement("div");
    }

    const clientId = getClientId(client);

    form.dataset.clientId = clientId;
    form.id = `uploadForm-${clientId}`;

    setInputValue(form, "[data-upload-client-name]", client.full_name || "-");
    setInputValue(form, "[data-upload-company-name]", client.company_name || "-");

    return form;
  }

  function createClientCardElement(client) {
    const card = cloneTemplate(clientCardTemplate);

    if (!card) {
      return document.createElement("article");
    }

    const clientId = getClientId(client);
    const isActive = client.is_active !== false;

    card.dataset.clientId = clientId;

    setElementText(card, "[data-client-avatar]", getClientInitials(client));
    setElementText(card, "[data-client-company]", client.company_name || "-");
    setElementText(card, "[data-client-name]", client.full_name || "-");
    setElementText(card, "[data-client-document-label]", getClientEntityLabel(client));
    setElementText(card, "[data-client-document]", formatOptionalCpfCnpj(client.cpf_cnpj));
    setElementText(card, "[data-client-email]", client.email || "-");
    setElementText(card, "[data-client-phone]", formatOptionalPhone(client.phone));
    setElementText(card, "[data-client-whatsapp]", formatOptionalPhone(client.whatsapp));

    const statusBadge = card.querySelector("[data-client-status]");

    if (statusBadge) {
      statusBadge.textContent = getClientStatusLabel(isActive);
      statusBadge.classList.toggle("active", isActive);
      statusBadge.classList.toggle("inactive", !isActive);
    }

    const documentsButton = card.querySelector("[data-action='documents']");
    const uploadButton = card.querySelector("[data-action='upload']");
    const statusButton = card.querySelector("[data-action='status']");
    const deleteButton = card.querySelector("[data-action='delete']");

    if (documentsButton) {
      documentsButton.dataset.clientId = clientId;
    }

    if (uploadButton) {
      uploadButton.dataset.clientId = clientId;
    }

    if (statusButton) {
      statusButton.dataset.clientId = clientId;
      statusButton.dataset.currentStatus = String(isActive);
      statusButton.classList.toggle("warning", isActive);
      statusButton.classList.toggle("success", !isActive);

      const statusButtonLabel = statusButton.querySelector("[data-action-label]");
      const statusIcon = statusButton.querySelector("i");

      if (statusButtonLabel) {
        statusButtonLabel.textContent = isActive ? "Inativar" : "Ativar";
      }

      if (statusIcon) {
        statusIcon.className = `fa-solid ${isActive ? "fa-user-slash" : "fa-user-check"}`;
      }
    }

    if (deleteButton) {
      deleteButton.dataset.clientId = clientId;
      deleteButton.dataset.clientName = client.full_name || "Cliente";
    }

    const documentsWrapper = card.querySelector("[data-client-documents-wrapper]");
    const documentsLoading = card.querySelector("[data-client-documents-loading]");
    const documentsContent = card.querySelector("[data-client-documents-content]");
    const uploadWrapper = card.querySelector("[data-client-upload-wrapper]");

    if (documentsWrapper) {
      documentsWrapper.id = `documentsWrapper-${clientId}`;
      documentsWrapper.dataset.clientId = clientId;
    }

    if (documentsLoading) {
      documentsLoading.id = `documentsLoading-${clientId}`;
    }

    if (documentsContent) {
      documentsContent.id = `documentsContent-${clientId}`;
    }

    if (uploadWrapper) {
      uploadWrapper.id = `uploadWrapper-${clientId}`;
      uploadWrapper.dataset.clientId = clientId;
      uploadWrapper.appendChild(createClientUploadFormElement(client));
    }

    return card;
  }

  function renderClientsList(clients) {
    if (!clientsList || !clientsListMessage) return;

    const filteredClients = filterClients(
      Array.isArray(clients) ? clients : [],
      clientsSearchInput?.value || "",
      clientsStatusFilter?.value || "all"
    );

    updateClientsSummary(filteredClients);

    clientsList.replaceChildren();

    if (!filteredClients.length) {
      clientsListMessage.textContent = "Nenhum cliente encontrado.";
      return;
    }

    clientsListMessage.textContent = `${filteredClients.length} cliente(s) encontrado(s).`;

    const fragment = document.createDocumentFragment();

    filteredClients.forEach((client) => {
      fragment.appendChild(createClientCardElement(client));
    });

    clientsList.appendChild(fragment);

    attachClientActionEvents();
  }

  function createDocumentsPanelElement(clientId, documents) {
    const panel = cloneTemplate(documentsPanelTemplate);

    if (!panel) {
      return document.createElement("div");
    }

    const safeDocuments = Array.isArray(documents) ? documents : [];

    const nameInput = panel.querySelector("[data-document-filter-name]");
    const categorySelect = panel.querySelector("[data-document-filter-category]");
    const yearSelect = panel.querySelector("[data-document-filter-year]");
    const clearButton = panel.querySelector("[data-document-clear-filters]");
    const resultsInfo = panel.querySelector("[data-documents-results-info]");
    const list = panel.querySelector("[data-documents-list]");

    const existingFilters = {
      name: nameInput?.dataset.currentValue || "",
      category: categorySelect?.dataset.currentValue || "",
      year: yearSelect?.dataset.currentValue || ""
    };

    const currentPanel = document.getElementById(`documentsContent-${clientId}`)?.querySelector("[data-documents-panel]");

    if (currentPanel) {
      existingFilters.name =
        currentPanel.querySelector("[data-document-filter-name]")?.value || "";
      existingFilters.category =
        currentPanel.querySelector("[data-document-filter-category]")?.value || "";
      existingFilters.year =
        currentPanel.querySelector("[data-document-filter-year]")?.value || "";
    }

    const filteredDocuments = filterDocuments(safeDocuments, existingFilters);

    const categories = getUniqueDocumentCategories(safeDocuments);
    const years = getUniqueDocumentYears(safeDocuments);

    panel.dataset.clientId = clientId;

    if (nameInput) {
      nameInput.value = existingFilters.name || "";
      nameInput.dataset.clientId = clientId;
    }

    fillSelectOptions(categorySelect, categories, existingFilters.category, "Todas");
    fillSelectOptions(yearSelect, years, existingFilters.year, "Todos");

    if (categorySelect) {
      categorySelect.dataset.clientId = clientId;
    }

    if (yearSelect) {
      yearSelect.dataset.clientId = clientId;
    }

    if (clearButton) {
      clearButton.dataset.clientId = clientId;
    }

    if (resultsInfo) {
      if (filteredDocuments.length) {
        resultsInfo.textContent = `Exibindo ${filteredDocuments.length} de ${safeDocuments.length} documento(s).`;
      } else {
        resultsInfo.textContent = `Nenhum documento encontrado. Total cadastrado: ${safeDocuments.length}.`;
      }
    }

    if (list) {
      if (filteredDocuments.length) {
        const fragment = document.createDocumentFragment();

        filteredDocuments.forEach((documentItem) => {
          fragment.appendChild(createDocumentItemElement(documentItem, clientId));
        });

        list.appendChild(fragment);
      } else {
        const emptyElement = cloneTemplate(emptyDocumentsTemplate);

        if (emptyElement) {
          list.appendChild(emptyElement);
        }
      }
    }

    return panel;
  }

  function createDocumentItemElement(documentItem, fallbackClientId) {
    const item = cloneTemplate(documentItemTemplate);

    if (!item) {
      return document.createElement("div");
    }

    const documentId = documentItem.id || "";
    const clientId = documentItem.client_id || documentItem.user_id || fallbackClientId || "";
    const fileName = getDocumentFileName(documentItem);

    item.dataset.documentId = documentId;
    item.dataset.clientId = clientId;

    setElementText(item, "[data-document-file-name]", fileName);
    setElementText(item, "[data-document-category]", getDocumentCategory(documentItem));
    setElementText(item, "[data-document-subcategory]", getDocumentSubcategory(documentItem));
    setElementText(item, "[data-document-year]", getDocumentYear(documentItem));
    setElementText(item, "[data-document-release-date]", formatDate(getDocumentReleaseDate(documentItem)));
    setElementText(item, "[data-document-expiration-date]", formatDate(getDocumentExpirationDate(documentItem)));
    setElementText(item, "[data-document-created-at]", formatDate(getDocumentDate(documentItem)));

    setElementDataset(item, "[data-document-menu-toggle]", "documentId", documentId);
    setElementDataset(item, "[data-document-download]", "documentId", documentId);

    setElementDataset(item, "[data-document-replace]", "documentId", documentId);
    setElementDataset(item, "[data-document-replace]", "clientId", clientId);
    setElementDataset(item, "[data-document-replace]", "fileName", fileName);

    setElementDataset(item, "[data-document-replace-input]", "documentId", documentId);
    setElementDataset(item, "[data-document-replace-input]", "clientId", clientId);

    setElementDataset(item, "[data-document-delete]", "documentId", documentId);
    setElementDataset(item, "[data-document-delete]", "clientId", clientId);
    setElementDataset(item, "[data-document-delete]", "fileName", fileName);

    return item;
  }

  function renderDocumentsForClient(clientId, documents) {
    const content = document.getElementById(`documentsContent-${clientId}`);
    const loading = document.getElementById(`documentsLoading-${clientId}`);

    if (!content) return;

    if (loading) {
      loading.classList.add("hidden");
    }

    content.replaceChildren(createDocumentsPanelElement(clientId, documents));

    bindDocumentFilters(clientId);
    attachDocumentActionEvents();
  }

  function getCurrentBannerOrderKey() {
    if (!homeBannersList) return "";

    return Array.from(homeBannersList.querySelectorAll(".home-banner-card"))
      .map((card) => card.dataset.bannerId)
      .filter(Boolean)
      .join("|");
  }

  function createBannerCardElement(banner) {
    const card = cloneTemplate(homeBannerCardTemplate);

    if (!card) {
      return document.createElement("article");
    }

    const bannerId = banner.id || "";
    const isActive = banner.is_active !== false;

    card.dataset.bannerId = bannerId;

    const image = card.querySelector("[data-banner-image]");

    if (image) {
      image.src = banner.image_url || "";
      image.alt = banner.title || "Banner";
    }

    setElementText(card, "[data-banner-title]", banner.title || "-");
    setElementText(card, "[data-banner-action-type]", getActionTypeLabel(banner.action_type));
    setElementText(card, "[data-banner-link-target]", getLinkTargetLabel(banner.link_target));
    setElementText(card, "[data-banner-created-at]", formatDate(banner.created_at));

    const linkRow = card.querySelector("[data-banner-link-row]");
    const link = card.querySelector("[data-banner-link]");

    if (linkRow && link) {
      const hasLink = Boolean(banner.link);
      linkRow.classList.toggle("hidden", !hasLink);
      link.href = hasLink ? banner.link : "#";
      link.textContent = hasLink ? banner.link : "";
    }

    const descriptionBox = card.querySelector("[data-banner-description-box]");
    const description = card.querySelector("[data-banner-description]");

    if (descriptionBox && description) {
      const hasDescription = Boolean(banner.description);
      descriptionBox.classList.toggle("hidden", !hasDescription);
      description.textContent = hasDescription ? banner.description : "";
    }

    const status = card.querySelector("[data-banner-status]");

    if (status) {
      status.textContent = isActive ? "Ativo" : "Inativo";
      status.classList.toggle("active", isActive);
      status.classList.toggle("inactive", !isActive);
    }

    const statusButton = card.querySelector("[data-banner-status-button]");
    const editButton = card.querySelector("[data-banner-edit]");
    const deleteButton = card.querySelector("[data-banner-delete]");

    if (statusButton) {
      statusButton.dataset.bannerId = bannerId;
      statusButton.dataset.currentStatus = String(isActive);
      statusButton.textContent = isActive ? "Desativar" : "Ativar";
      statusButton.classList.toggle("danger", isActive);
      statusButton.classList.toggle("success", !isActive);
    }

    if (editButton) {
      editButton.dataset.bannerId = bannerId;
    }

    if (deleteButton) {
      deleteButton.dataset.bannerId = bannerId;
      deleteButton.dataset.bannerTitle = banner.title || "Banner";
    }

    return card;
  }
  function renderHomeBannersList(banners) {
    if (!homeBannersList || !homeBannersListMessage) return;

    allHomeBannersCache = Array.isArray(banners) ? [...banners] : [];

    homeBannersList.replaceChildren();

    if (!allHomeBannersCache.length) {
      homeBannersListMessage.textContent = "Nenhum banner cadastrado.";
      return;
    }

    homeBannersListMessage.textContent = `${allHomeBannersCache.length} banner(s) cadastrado(s).`;

    const orderedBanners = [...allHomeBannersCache].sort((a, b) => {
      const orderA = Number(a.display_order || 0);
      const orderB = Number(b.display_order || 0);

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return new Date(b.created_at) - new Date(a.created_at);
    });

    const fragment = document.createDocumentFragment();

    orderedBanners.forEach((banner) => {
      fragment.appendChild(createBannerCardElement(banner));
    });

    homeBannersList.appendChild(fragment);

    initializeBannerSortable();
    attachBannerActionEvents();
  }

  function attachBannerDescriptionEvents() {
    document.querySelectorAll(".home-banner-description").forEach((details) => {
      if (details.dataset.bound === "true") return;

      details.dataset.bound = "true";

      details.addEventListener("toggle", () => {
        refreshSectionHeight(homeBannersWrapper);
      });
    });
  }

  function initializeBannerSortable() {
    if (!homeBannersList || typeof Sortable === "undefined") return;

    if (homeBannersSortable) {
      homeBannersSortable.destroy();
      homeBannersSortable = null;
    }

    bannerOrderBeforeDrag = getCurrentBannerOrderKey();

    homeBannersSortable = new Sortable(homeBannersList, {
      animation: 160,
      handle: ".home-banner-drag-hint",
      ghostClass: "sortable-drag",
      chosenClass: "sortable-chosen",
      dragClass: "dragging",

      onStart() {
        bannerOrderBeforeDrag = getCurrentBannerOrderKey();
      },

      async onEnd() {
        const currentOrderKey = getCurrentBannerOrderKey();

        if (currentOrderKey === bannerOrderBeforeDrag) {
          return;
        }

        await updateHomeBannersOrder();
      }
    });
  }

  async function updateHomeBannersOrder() {
    if (!homeBannersList) return;

    const orderedIds = Array.from(homeBannersList.querySelectorAll(".home-banner-card"))
      .map((card) => card.dataset.bannerId)
      .filter(Boolean);

    if (!orderedIds.length) return;

    showAdminFeedback("Salvando nova ordem dos banners...", "info", false);

    try {
      const response = await adminFetch("http://localhost:3000/admin/notices/reorder", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderedIds
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao salvar a ordem dos banners.");
      }

      showAdminFeedback(
        result.message || "Ordem dos banners atualizada com sucesso.",
        "success"
      );

      await fetchHomeBanners();
    } catch (error) {
      console.error("ERRO AO REORDENAR BANNERS:", error);

      showAdminFeedback(
        error.message || "Erro ao salvar a ordem dos banners.",
        "error"
      );

      await fetchHomeBanners();
    }
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

    if (copyTemporaryPasswordBtn) {
      copyTemporaryPasswordBtn.textContent = "Copiar senha";
    }
  }

  function isCreateClientModalOpen() {
    return Boolean(createClientModal && !createClientModal.classList.contains("hidden"));
  }

  function resetCreateClientFormState() {
    if (createClientForm) {
      createClientForm.reset();
    }

    if (createClientMessage) {
      createClientMessage.textContent = "";
      createClientMessage.className = "form-message";
    }

    hidePasswordBox();
  }

  function openCreateClientModal() {
    if (!createClientModal) {
      openPanel(createClientWrapper);
      return;
    }

    createClientModal.classList.remove("hidden");
    createClientModal.setAttribute("aria-hidden", "false");

    openPanel(createClientWrapper);

    setTimeout(() => {
      document.getElementById("fullName")?.focus();
    }, 80);
  }

  function closeCreateClientModal(options = {}) {
    const shouldResetForm = Boolean(options.resetForm);

    if (shouldResetForm) {
      resetCreateClientFormState();
    }

    if (createClientModal) {
      createClientModal.classList.add("hidden");
      createClientModal.setAttribute("aria-hidden", "true");
    }

    closePanel(createClientWrapper);
  }

  function hideCreateClientForm(options = {}) {
    closeCreateClientModal(options);

    if (toggleCreateClientBtn) {
      toggleCreateClientBtn.textContent = "Novo Cliente";
    }
  }

  function showCreateClientForm() {
    openCreateClientModal();

    if (toggleCreateClientBtn) {
      toggleCreateClientBtn.textContent = "Fechar Formulário";
    }
  }

  function toggleCreateClientForm() {
    const isHidden = createClientModal
      ? createClientModal.classList.contains("hidden")
      : createClientWrapper?.classList.contains("hidden");

    if (isHidden) {
      showCreateClientForm();
      setSidebarActive("clients");
      updateHash("#clientes");
    } else {
      hideCreateClientForm();
    }
  }

  function hideClientsList() {
    closePanel(clientsSectionWrapper);
    closeAllDocumentMenus();

    if (toggleClientsListBtn) {
      toggleClientsListBtn.textContent = "Exibir Clientes";
    }
  }

  function showClientsList() {
    openPanel(clientsSectionWrapper);

    if (toggleClientsListBtn) {
      toggleClientsListBtn.textContent = "Ocultar Clientes";
    }
  }

  function hideHomeBanners() {
    closePanel(homeBannersWrapper);

    if (toggleHomeBannersBtn) {
      toggleHomeBannersBtn.textContent = "Exibir Banners";
    }
  }

  function showHomeBanners() {
    openPanel(homeBannersWrapper);

    if (toggleHomeBannersBtn) {
      toggleHomeBannersBtn.textContent = "Ocultar Banners";
    }
  }

  function hideBannerForm() {
    if (!homeBannerForm) return;

    closePanel(homeBannerForm);

    if (toggleBannerFormBtn) {
      toggleBannerFormBtn.textContent = "Criar Banner";
    }
  }

  function showBannerForm() {
    if (!homeBannerForm) return;

    openPanel(homeBannerForm);

    if (toggleBannerFormBtn) {
      toggleBannerFormBtn.textContent = "Fechar Formulário";
    }
  }

  function toggleBannerForm() {
    if (!homeBannerForm) return;

    const isHidden = homeBannerForm.classList.contains("hidden");

    if (isHidden) {
      showBannerForm();
    } else {
      hideBannerForm();
    }
  }

  function isBannerEditMode() {
    return Boolean(bannerEditId?.value);
  }

  function updateBannerFormVisibility() {
    const actionType = bannerActionType?.value || "link";
    const linkTarget = bannerLinkTarget?.value || "";

    if (bannerLinkTargetGroup) {
      bannerLinkTargetGroup.classList.toggle("hidden", actionType !== "link");
    }

    if (bannerCustomLinkGroup) {
      bannerCustomLinkGroup.classList.toggle(
        "hidden",
        actionType !== "link" || linkTarget !== "custom"
      );
    }

    if (bannerDescriptionGroup) {
      bannerDescriptionGroup.classList.toggle("hidden", actionType !== "modal");
    }

    if (bannerLink) {
      bannerLink.required = actionType === "link" && linkTarget === "custom";
    }

    if (bannerDescription) {
      bannerDescription.required = actionType === "modal";
    }

    if (bannerLinkTarget) {
      bannerLinkTarget.required = actionType === "link";
    }
  }

  function setBannerFormCreateMode() {
    if (bannerEditId) {
      bannerEditId.value = "";
    }

    if (bannerEditModeBox) {
      bannerEditModeBox.classList.add("hidden");
    }

    if (cancelBannerEditBtnBottom) {
      cancelBannerEditBtnBottom.classList.add("hidden");
    }

    if (bannerCurrentImageBox) {
      bannerCurrentImageBox.classList.add("hidden");
    }

    if (bannerCurrentImage) {
      bannerCurrentImage.src = "";
    }

    if (bannerImage) {
      bannerImage.required = true;
    }

    if (saveBannerBtn) {
      saveBannerBtn.textContent = "Salvar Banner";
    }

    clearBannerMessage();
    updateBannerFormVisibility();
  }

  function setBannerFormEditMode(banner) {
    if (!banner || !homeBannerForm) return;

    if (bannerEditId) {
      bannerEditId.value = banner.id || "";
    }

    if (bannerTitle) {
      bannerTitle.value = banner.title || "";
    }

    if (bannerActionType) {
      bannerActionType.value = banner.action_type || "link";
    }

    if (bannerLinkTarget) {
      bannerLinkTarget.value = banner.link_target || "";
    }

    if (bannerLink) {
      bannerLink.value = banner.link || "";
    }

    if (bannerDescription) {
      bannerDescription.value = banner.description || "";
    }

    if (bannerIsActive) {
      bannerIsActive.checked = banner.is_active !== false;
    }

    if (bannerImage) {
      bannerImage.required = false;
      bannerImage.value = "";
    }

    if (bannerCurrentImageBox && bannerCurrentImage) {
      if (banner.image_url) {
        bannerCurrentImageBox.classList.remove("hidden");
        bannerCurrentImage.src = banner.image_url;
      } else {
        bannerCurrentImageBox.classList.add("hidden");
        bannerCurrentImage.src = "";
      }
    }

    if (bannerEditModeBox) {
      bannerEditModeBox.classList.remove("hidden");
    }

    if (cancelBannerEditBtnBottom) {
      cancelBannerEditBtnBottom.classList.remove("hidden");
    }

    if (saveBannerBtn) {
      saveBannerBtn.textContent = "Atualizar Banner";
    }

    showBannerForm();
    updateBannerFormVisibility();

    setTimeout(() => {
      homeBannerForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 180);
  }

  function getImageDimensions(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("Nenhuma imagem selecionada."));
        return;
      }

      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        const dimensions = {
          width: image.naturalWidth,
          height: image.naturalHeight
        };

        URL.revokeObjectURL(objectUrl);
        resolve(dimensions);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Não foi possível validar as dimensões da imagem."));
      };

      image.src = objectUrl;
    });
  }

  function isAllowedBannerSize(width, height) {
    return ALLOWED_BANNER_SIZES.some((size) => {
      return size.width === width && size.height === height;
    });
  }

  async function validateBannerImageBeforeSubmit(file) {
    try {
      const dimensions = await getImageDimensions(file);

      if (!isAllowedBannerSize(dimensions.width, dimensions.height)) {
        return {
          valid: false,
          error: `${BANNER_DIMENSION_MESSAGE} Imagem selecionada: ${dimensions.width}x${dimensions.height}px.`
        };
      }

      return {
        valid: true,
        dimensions
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message || BANNER_DIMENSION_MESSAGE
      };
    }
  }

  async function fetchClients() {
    try {
      if (clientsListMessage) {
        clientsListMessage.textContent = "Carregando clientes...";
      }

      const response = await adminFetch("http://localhost:3000/clients");

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao carregar clientes.");
      }

      allClientsCache = Array.isArray(result) ? result : [];
      clientsLoaded = true;

      updateDashboardClientsSummary(allClientsCache);
      renderClientsList(allClientsCache);
    } catch (error) {
      console.error("ERRO AO BUSCAR CLIENTES:", error);

      if (clientsListMessage) {
        clientsListMessage.textContent =
          error.message || "Erro ao carregar clientes.";
      }

      showAdminFeedback(
        error.message || "Erro ao carregar clientes.",
        "error"
      );
    }
  }

  async function fetchHomeBanners() {
    try {
      if (homeBannersListMessage) {
        homeBannersListMessage.textContent = "Carregando banners...";
      }

      const response = await adminFetch("http://localhost:3000/admin/notices");

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao carregar banners.");
      }

      allHomeBannersCache = Array.isArray(result) ? result : [];
      homeBannersLoaded = true;

      updateDashboardBannersSummary(allHomeBannersCache);
      renderHomeBannersList(allHomeBannersCache);
    } catch (error) {
      console.error("ERRO AO BUSCAR BANNERS:", error);

      if (homeBannersListMessage) {
        homeBannersListMessage.textContent =
          error.message || "Erro ao carregar banners.";
      }

      showAdminFeedback(
        error.message || "Erro ao carregar banners.",
        "error"
      );
    }
  }

  async function fetchClientDocuments(clientId) {
    if (!clientId) return [];

    try {
      const response = await adminFetch(
        `http://localhost:3000/clients/${clientId}/documents`
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao buscar documentos.");
      }

      clientDocumentsCache[clientId] = Array.isArray(result) ? result : [];

      return clientDocumentsCache[clientId];
    } catch (error) {
      console.error("ERRO AO BUSCAR DOCUMENTOS:", error);
      throw error;
    }
  }

  async function createClient(event) {
    event.preventDefault();

    if (!createClientForm) return;

    const submitButton = document.getElementById("createClientBtn");

    const fullName = document.getElementById("fullName")?.value.trim() || "";
    const companyName = document.getElementById("companyName")?.value.trim() || "";
    const cpfCnpj = onlyDigits(document.getElementById("cpfCnpj")?.value || "");
    const email = document.getElementById("email")?.value.trim() || "";
    const addressZip = onlyDigits(document.getElementById("addressZip")?.value || "");
    const addressStreet = document.getElementById("addressStreet")?.value.trim() || "";
    const addressNumber = document.getElementById("addressNumber")?.value.trim() || "";
    const addressComplement = document.getElementById("addressComplement")?.value.trim() || "";
    const addressNeighborhood = document.getElementById("addressNeighborhood")?.value.trim() || "";
    const addressCity = document.getElementById("addressCity")?.value.trim() || "";
    const addressState = document.getElementById("addressState")?.value.trim() || "";
    const phone = onlyDigits(document.getElementById("phone")?.value || "");
    const whatsapp = onlyDigits(document.getElementById("whatsapp")?.value || "");

    hidePasswordBox();

    if (!fullName || !companyName || !cpfCnpj || !email) {
      if (createClientMessage) {
        createClientMessage.textContent = "Preencha nome, empresa, CPF/CNPJ e e-mail.";
        createClientMessage.className = "form-message error";
      }

      return;
    }

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Cadastrando...";
      }

      if (createClientMessage) {
        createClientMessage.textContent = "Cadastrando cliente...";
        createClientMessage.className = "form-message info";
      }

      const response = await adminFetch("http://localhost:3000/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          full_name: fullName,
          company_name: companyName,
          cpf_cnpj: cpfCnpj,
          email,
          address_zip: addressZip,
          address_street: addressStreet,
          address_number: addressNumber,
          address_complement: addressComplement,
          address_neighborhood: addressNeighborhood,
          address_city: addressCity,
          address_state: addressState,
          phone,
          whatsapp
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao cadastrar cliente.");
      }

      const temporaryPassword =
        result.temporary_password ||
        result.temporaryPassword ||
        result.tempPassword ||
        result.initialPassword ||
        result.initial_password ||
        result.password ||
        "";

      createClientForm.reset();

      if (temporaryPassword) {
        showPassword(temporaryPassword);

        if (createClientMessage) {
          createClientMessage.textContent =
            result.message || "Cliente cadastrado com sucesso.";
          createClientMessage.className = "form-message success";
        }

        showAdminFeedback(
          result.message || "Cliente cadastrado com sucesso.",
          "success"
        );
      } else {
        hidePasswordBox();

        if (createClientMessage) {
          createClientMessage.textContent =
            "Cliente cadastrado com sucesso, mas a senha temporária não foi retornada pelo servidor.";
          createClientMessage.className = "form-message error";
        }

        showAdminFeedback(
          "Cliente cadastrado, mas a senha temporária não foi retornada pelo servidor.",
          "error"
        );
      }

      await fetchClients();
    } catch (error) {
      console.error("ERRO AO CADASTRAR CLIENTE:", error);

      if (createClientMessage) {
        createClientMessage.textContent = error.message || "Erro ao cadastrar cliente.";
        createClientMessage.className = "form-message error";
      }

      showAdminFeedback(
        error.message || "Erro ao cadastrar cliente.",
        "error"
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Cadastrar Cliente";
      }
    }
  }

  async function toggleClientStatus(clientId, currentStatus) {
    try {
      const nextStatus = !currentStatus;
      const actionLabel = nextStatus ? "ativar" : "inativar";
      const actionTitle = nextStatus ? "Ativar cliente?" : "Inativar cliente?";
      const actionConfirmText = nextStatus ? "Ativar" : "Inativar";
      const actionType = nextStatus ? "success" : "warning";

      const confirmation = await showAdminActionConfirm({
        type: actionType,
        title: actionTitle,
        message: `Deseja realmente ${actionLabel} este cliente?`,
        confirmText: actionConfirmText,
        cancelText: "Cancelar"
      });

      if (!confirmation) {
        return;
      }

      showAdminFeedback(
        `${nextStatus ? "Ativando" : "Inativando"} cliente...`,
        "info",
        false
      );

      const response = await adminFetch(
        `http://localhost:3000/admin/clients/${clientId}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            is_active: nextStatus
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Erro ao atualizar status do cliente."
        );
      }

      showAdminFeedback(result.message || "Status do cliente atualizado.", "success");

      await fetchClients();
    } catch (error) {
      console.error("ERRO AO ALTERAR STATUS:", error);

      showAdminFeedback(
        error.message || "Erro ao atualizar status do cliente.",
        "error"
      );

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao atualizar",
        message: error.message || "Não foi possível atualizar o status do cliente.",
        confirmText: "OK"
      });
    }
  }

  async function deleteClient(clientId, clientName) {
    try {
      const confirmation = await showAdminActionConfirm({
        type: "danger",
        title: "Excluir cliente?",
        message: `Deseja realmente excluir o cliente "${clientName}"? Esta ação removerá o perfil, o login e todos os documentos vinculados. Essa ação não poderá ser desfeita.`,
        confirmText: "Excluir",
        cancelText: "Cancelar"
      });

      if (!confirmation) {
        return;
      }

      showAdminFeedback("Excluindo cliente...", "warning", false);

      const response = await adminFetch(
        `http://localhost:3000/admin/clients/${clientId}`,
        {
          method: "DELETE"
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao excluir cliente.");
      }

      delete clientDocumentsCache[clientId];

      showAdminFeedback(result.message || "Cliente excluído com sucesso.", "success");

      await fetchClients();
      await fetchRenewalAlerts();

      await showAdminActionMessage({
        type: "success",
        title: "Cliente excluído",
        message: result.message || "O cliente foi excluído com sucesso.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO EXCLUIR CLIENTE:", error);

      showAdminFeedback(
        error.message || "Erro ao excluir cliente.",
        "error"
      );

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao excluir",
        message: error.message || "Não foi possível excluir o cliente.",
        confirmText: "OK"
      });
    }
  }

  function closeAllDocumentMenus() {
    document.querySelectorAll(".document-actions-dropdown").forEach((dropdown) => {
      dropdown.classList.add("hidden");
    });

    document.querySelectorAll(".document-menu-toggle").forEach((button) => {
      button.textContent = "▾";
    });
  }

  function attachClientActionEvents() {
    document.querySelectorAll(".toggle-documents-btn").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const clientId = button.dataset.clientId;
        const wrapper = document.getElementById(`documentsWrapper-${clientId}`);
        const label = button.querySelector("[data-action-label]");

        if (!clientId || !wrapper) return;

        const isHidden = wrapper.classList.contains("hidden");

        if (!isHidden) {
          wrapper.classList.add("hidden");

          if (label) {
            label.textContent = "Visualizar Documentos";
          }

          return;
        }

        wrapper.classList.remove("hidden");

        if (label) {
          label.textContent = "Ocultar Documentos";
        }

        try {
          const documents = await fetchClientDocuments(clientId);
          renderDocumentsForClient(clientId, documents);
        } catch (error) {
          const loading = document.getElementById(`documentsLoading-${clientId}`);

          if (loading) {
            loading.classList.remove("hidden");
            loading.textContent = error.message || "Erro ao carregar documentos.";
          }

          showAdminFeedback(
            error.message || "Erro ao carregar documentos.",
            "error"
          );
        }
      });
    });

    document.querySelectorAll(".toggle-upload-btn").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const clientId = button.dataset.clientId;
        const wrapper = document.getElementById(`uploadWrapper-${clientId}`);
        const label = button.querySelector("[data-action-label]");

        if (!wrapper) return;

        const isHidden = wrapper.classList.contains("hidden");

        if (isHidden) {
          wrapper.classList.remove("hidden");

          if (label) {
            label.textContent = "Ocultar Upload";
          }
        } else {
          wrapper.classList.add("hidden");

          if (label) {
            label.textContent = "Upload de Documento";
          }
        }
      });
    });

    document.querySelectorAll(".toggle-client-status-btn").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const clientId = button.dataset.clientId;
        const currentStatus = button.dataset.currentStatus === "true";

        if (!clientId) {
          showAdminFeedback("Cliente inválido para alteração de status.", "error");
          return;
        }

        await toggleClientStatus(clientId, currentStatus);
      });
    });

    document.querySelectorAll(".delete-client-btn").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const clientId = button.dataset.clientId;
        const clientName = button.dataset.clientName || "Cliente";

        if (!clientId) {
          showAdminFeedback("Cliente inválido para exclusão.", "error");
          return;
        }

        await deleteClient(clientId, clientName);
      });
    });

    document.querySelectorAll(".upload-form").forEach((form) => {
      if (form.dataset.bound === "true") return;

      form.dataset.bound = "true";

      form.addEventListener("submit", uploadClientDocument);
    });
  }
  async function uploadClientDocument(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const clientId = form?.dataset?.clientId;

    const category = form.querySelector("[data-upload-category]")?.value || "";
    const subcategory = form.querySelector("[data-upload-subcategory]")?.value.trim() || "";
    const year = form.querySelector("[data-upload-year]")?.value.trim() || "";
    const releaseDate = form.querySelector("[data-upload-release-date]")?.value || "";
    const expirationDate = form.querySelector("[data-upload-expiration-date]")?.value || "";
    const fileInput = form.querySelector("[data-upload-file]");
    const message = form.querySelector("[data-upload-message]");
    const submitButton = form.querySelector(".upload-submit-btn");

    if (
      !clientId ||
      !category ||
      !year ||
      !releaseDate ||
      !expirationDate ||
      !fileInput?.files?.length ||
      !submitButton
    ) {
      setInlineMessage(message, "Preencha todos os campos obrigatórios.", "error");
      return;
    }

    if (isExpirationBeforeRelease(releaseDate, expirationDate)) {
      setInlineMessage(
        message,
        "A data de validade não pode ser menor que a data de lançamento.",
        "error"
      );
      return;
    }

    const originalText = submitButton.textContent;

    try {
      submitButton.disabled = true;
      submitButton.textContent = "Enviando...";

      setInlineMessage(message, "Enviando documento...", "info");
      showAdminFeedback("Enviando documento...", "info", false);

      const formData = new FormData();
      formData.append("client_id", clientId);
      formData.append("category", category);
      formData.append("subcategory", subcategory);
      formData.append("year", year);
      formData.append("release_date", releaseDate);
      formData.append("expiration_date", expirationDate);
      formData.append("file", fileInput.files[0]);

      const response = await adminFetch("http://localhost:3000/admin/documents/upload", {
        method: "POST",
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao enviar documento.");
      }

      setInlineMessage(
        message,
        result.message || "Documento enviado com sucesso.",
        "success"
      );

      showAdminFeedback(
        result.message || "Documento enviado com sucesso.",
        "success"
      );

      form.reset();

      const documentsWrapper = document.getElementById(`documentsWrapper-${clientId}`);
      const documentsButton = document.querySelector(
        `.toggle-documents-btn[data-client-id="${clientId}"]`
      );

      if (documentsWrapper) {
        documentsWrapper.classList.remove("hidden");
      }

      if (documentsButton) {
        const label = documentsButton.querySelector("[data-action-label]");

        if (label) {
          label.textContent = "Ocultar Documentos";
        }
      }

      const documents = await fetchClientDocuments(clientId);
      renderDocumentsForClient(clientId, documents);
      await fetchRenewalAlerts();
    } catch (error) {
      console.error("ERRO AO ENVIAR DOCUMENTO:", error);

      setInlineMessage(
        message,
        error.message || "Erro ao enviar documento.",
        "error"
      );

      showAdminFeedback(
        error.message || "Erro ao enviar documento.",
        "error"
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }

  function bindDocumentFilters(clientId) {
    const documents = clientDocumentsCache[clientId] || [];
    const content = document.getElementById(`documentsContent-${clientId}`);

    if (!content) return;

    const nameInput = content.querySelector("[data-document-filter-name]");
    const categorySelect = content.querySelector("[data-document-filter-category]");
    const yearSelect = content.querySelector("[data-document-filter-year]");
    const clearButton = content.querySelector("[data-document-clear-filters]");

    function rerenderDocuments() {
      renderDocumentsForClient(clientId, documents);
    }

    if (nameInput) {
      nameInput.addEventListener("input", () => {
        rerenderDocuments();
      });
    }

    if (categorySelect) {
      categorySelect.addEventListener("change", () => {
        rerenderDocuments();
      });
    }

    if (yearSelect) {
      yearSelect.addEventListener("change", () => {
        rerenderDocuments();
      });
    }

    if (clearButton) {
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

        rerenderDocuments();
      });
    }
  }

  function attachDocumentActionEvents() {
    document.querySelectorAll("[data-document-menu-toggle]").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", (event) => {
        event.stopPropagation();

        const documentItem = button.closest("[data-document-item]");
        const dropdown = documentItem?.querySelector("[data-document-actions]");

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

    document.querySelectorAll("[data-document-download]").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async (event) => {
        event.stopPropagation();

        const documentId = button.dataset.documentId;

        if (!documentId) {
          showAdminFeedback("Documento inválido para download.", "error");
          return;
        }

        await downloadDocument(documentId, button);
      });
    });

    document.querySelectorAll("[data-document-delete]").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async (event) => {
        event.stopPropagation();

        const documentId = button.dataset.documentId;
        const clientId = button.dataset.clientId;
        const fileName = button.dataset.fileName || "Documento";

        if (!documentId || !clientId) {
          showAdminFeedback("Documento inválido para exclusão.", "error");
          return;
        }

        await deleteDocument(documentId, clientId, fileName, button);
      });
    });

    document.querySelectorAll("[data-document-replace]").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", (event) => {
        event.stopPropagation();

        const documentItem = button.closest("[data-document-item]");
        const fileInput = documentItem?.querySelector("[data-document-replace-input]");

        if (!fileInput) {
          showAdminFeedback("Campo de substituição não encontrado.", "error");
          return;
        }

        fileInput.click();
      });
    });

    document.querySelectorAll("[data-document-replace-input]").forEach((input) => {
      if (input.dataset.bound === "true") return;

      input.dataset.bound = "true";

      input.addEventListener("change", async () => {
        const documentId = input.dataset.documentId;
        const clientId = input.dataset.clientId;
        const file = input.files?.[0];
        const documentItem = input.closest("[data-document-item]");
        const button = documentItem?.querySelector("[data-document-replace]");

        if (!documentId || !clientId || !file || !button) {
          input.value = "";
          return;
        }

        await replaceDocument(documentId, clientId, file, button);
        input.value = "";
      });
    });
  }

  async function downloadDocument(documentId, buttonElement) {
    const originalText = buttonElement.textContent;

    try {
      buttonElement.disabled = true;
      buttonElement.textContent = "Baixando...";

      showAdminFeedback("Preparando download do documento...", "info", false);

      const response = await adminFetch("http://localhost:3000/admin/documents/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          document_id: documentId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao gerar download.");
      }

      if (!result.url) {
        throw new Error("Link de download não foi gerado.");
      }

      window.open(result.url, "_blank");

      showAdminFeedback("Download iniciado com sucesso.", "success");
    } catch (error) {
      console.error("ERRO AO BAIXAR DOCUMENTO:", error);

      showAdminFeedback(
        error.message || "Erro ao baixar documento.",
        "error"
      );
    } finally {
      buttonElement.disabled = false;
      buttonElement.textContent = originalText;
    }
  }

  async function deleteDocument(documentId, clientId, fileName, buttonElement) {
    const confirmation = confirm(
      `Deseja realmente excluir o documento "${fileName}"?`
    );

    if (!confirmation) return;

    const originalText = buttonElement.textContent;

    try {
      buttonElement.disabled = true;
      buttonElement.textContent = "Excluindo...";

      showAdminFeedback("Excluindo documento...", "warning", false);

      const response = await adminFetch(
        `http://localhost:3000/admin/documents/${documentId}`,
        {
          method: "DELETE"
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao excluir documento.");
      }

      const documents = await fetchClientDocuments(clientId);
      renderDocumentsForClient(clientId, documents);
      await fetchRenewalAlerts();

      showAdminFeedback(
        result.message || "Documento excluído com sucesso.",
        "success"
      );
    } catch (error) {
      console.error("ERRO AO EXCLUIR DOCUMENTO:", error);

      showAdminFeedback(
        error.message || "Erro ao excluir documento.",
        "error"
      );
    } finally {
      buttonElement.disabled = false;
      buttonElement.textContent = originalText;
    }
  }

  async function replaceDocument(documentId, clientId, file, buttonElement) {
    const originalText = buttonElement.textContent;

    try {
      buttonElement.disabled = true;
      buttonElement.textContent = "Substituindo...";

      showAdminFeedback("Substituindo documento...", "info", false);

      const formData = new FormData();
      formData.append("file", file);

      const response = await adminFetch(
        `http://localhost:3000/admin/documents/${documentId}/replace`,
        {
          method: "PUT",
          body: formData
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao substituir documento.");
      }

      const documents = await fetchClientDocuments(clientId);
      renderDocumentsForClient(clientId, documents);
      await fetchRenewalAlerts();

      showAdminFeedback(
        result.message || "Documento substituído com sucesso.",
        "success"
      );
    } catch (error) {
      console.error("ERRO AO SUBSTITUIR DOCUMENTO:", error);

      showAdminFeedback(
        error.message || "Erro ao substituir documento.",
        "error"
      );
    } finally {
      buttonElement.disabled = false;
      buttonElement.textContent = originalText;
    }
  }

  function attachBannerActionEvents() {
    attachBannerDescriptionEvents();

    document.querySelectorAll(".toggle-banner-status-btn").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const bannerId = button.dataset.bannerId;
        const currentStatus = button.dataset.currentStatus === "true";

        if (!bannerId) {
          showAdminFeedback("Banner inválido para alteração de status.", "error");
          return;
        }

        await toggleBannerStatus(bannerId, currentStatus);
      });
    });

    document.querySelectorAll(".edit-banner-btn").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const bannerId = button.dataset.bannerId;
        const banner = allHomeBannersCache.find((item) => {
          return String(item.id) === String(bannerId);
        });

        if (!banner) {
          showAdminFeedback("Banner não encontrado para edição.", "error");
          return;
        }

        setBannerFormEditMode(banner);
      });
    });

    document.querySelectorAll(".delete-banner-btn").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", async () => {
        const bannerId = button.dataset.bannerId;
        const bannerTitle = button.dataset.bannerTitle || "Banner";

        if (!bannerId) {
          showAdminFeedback("Banner inválido para exclusão.", "error");
          return;
        }

        await deleteHomeBanner(bannerId, bannerTitle);
      });
    });
  }

  async function toggleBannerStatus(bannerId, currentStatus) {
    const nextStatus = !currentStatus;

    const confirmation = confirm(
      `Deseja realmente ${nextStatus ? "ativar" : "desativar"} este banner?`
    );

    if (!confirmation) return;

    showAdminFeedback("Atualizando status do banner...", "info", false);

    try {
      const banner = allHomeBannersCache.find((item) => {
        return String(item.id) === String(bannerId);
      });

      if (!banner) {
        throw new Error("Banner não encontrado para alteração de status.");
      }

      const formData = new FormData();

      formData.append("title", banner.title || "");
      formData.append("action_type", banner.action_type || "link");
      formData.append(
        "link_target",
        banner.action_type === "link" ? banner.link_target || "" : ""
      );
      formData.append("link", banner.link || "");
      formData.append(
        "description",
        banner.action_type === "modal" ? banner.description || "" : ""
      );
      formData.append("is_active", String(nextStatus));

      const response = await adminFetch(
        `http://localhost:3000/admin/notices/${bannerId}`,
        {
          method: "PUT",
          body: formData
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao atualizar status do banner.");
      }

      showAdminFeedback(
        result.message || "Status do banner atualizado com sucesso.",
        "success"
      );

      await fetchHomeBanners();
    } catch (error) {
      console.error("ERRO AO ALTERAR STATUS DO BANNER:", error);

      showAdminFeedback(
        error.message || "Erro ao atualizar status do banner.",
        "error"
      );
    }
  }

  async function deleteHomeBanner(bannerId, bannerTitle) {
    const confirmation = await showAdminActionConfirm({
      type: "danger",
      title: "Excluir banner?",
      message: `Deseja realmente excluir o banner "${bannerTitle}"? Essa ação não poderá ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar"
    });

    if (!confirmation) return;

    showAdminFeedback("Excluindo banner...", "warning", false);

    try {
      const response = await adminFetch(
        `http://localhost:3000/admin/notices/${bannerId}`,
        {
          method: "DELETE"
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao excluir banner.");
      }

      showAdminFeedback(
        result.message || "Banner excluído com sucesso.",
        "success"
      );

      if (String(bannerEditId?.value || "") === String(bannerId)) {
        homeBannerForm?.reset();
        setBannerFormCreateMode();
        hideBannerForm();
      }

      await fetchHomeBanners();

      await showAdminActionMessage({
        type: "success",
        title: "Banner excluído",
        message: result.message || "O banner foi excluído com sucesso.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO EXCLUIR BANNER:", error);

      showAdminFeedback(
        error.message || "Erro ao excluir banner.",
        "error"
      );

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao excluir",
        message: error.message || "Não foi possível excluir o banner.",
        confirmText: "OK"
      });
    }
  }

  async function submitHomeBanner(event) {
    event.preventDefault();

    if (!homeBannerForm || !saveBannerBtn) return;

    clearBannerMessage();

    const title = bannerTitle?.value.trim() || "";
    const actionType = bannerActionType?.value || "link";
    const linkTarget = bannerLinkTarget?.value || "";
    const link = bannerLink?.value.trim() || "";
    const description = bannerDescription?.value.trim() || "";
    const isActive = bannerIsActive?.checked !== false;
    const selectedFile = bannerImage?.files?.[0] || null;
    const editing = isBannerEditMode();
    const currentBannerId = bannerEditId?.value || "";

    if (!title) {
      homeBannerMessage.textContent = "Digite o título do banner.";
      homeBannerMessage.className = "form-message error";
      return;
    }

    if (actionType === "link" && !linkTarget) {
      homeBannerMessage.textContent = "Selecione o destino do banner.";
      homeBannerMessage.className = "form-message error";
      return;
    }

    if (actionType === "link" && linkTarget === "custom" && !link) {
      homeBannerMessage.textContent = "Digite o link personalizado do banner.";
      homeBannerMessage.className = "form-message error";
      return;
    }

    if (actionType === "modal" && !description) {
      homeBannerMessage.textContent = "Digite a descrição detalhada do banner.";
      homeBannerMessage.className = "form-message error";
      return;
    }

    if (!editing && !selectedFile) {
      homeBannerMessage.textContent = "Selecione a imagem do banner.";
      homeBannerMessage.className = "form-message error";
      return;
    }

    if (selectedFile) {
      const imageValidation = await validateBannerImageBeforeSubmit(selectedFile);

      if (!imageValidation.valid) {
        homeBannerMessage.textContent = imageValidation.error || BANNER_DIMENSION_MESSAGE;
        homeBannerMessage.className = "form-message error";
        return;
      }
    }

    const originalText = saveBannerBtn.textContent;

    try {
      saveBannerBtn.disabled = true;
      saveBannerBtn.textContent = editing ? "Atualizando..." : "Salvando...";

      homeBannerMessage.textContent = editing
        ? "Atualizando banner..."
        : "Salvando banner...";
      homeBannerMessage.className = "form-message info";

      const formData = new FormData();

      formData.append("title", title);
      formData.append("action_type", actionType);
      formData.append("link_target", actionType === "link" ? linkTarget : "");
      formData.append("link", actionType === "link" ? link : "");
      formData.append("description", actionType === "modal" ? description : "");
      formData.append("is_active", String(isActive));

      if (selectedFile) {
        formData.append("image", selectedFile);
      }

      const url = editing
        ? `http://localhost:3000/admin/notices/${currentBannerId}`
        : "http://localhost:3000/admin/notices/upload";

      const method = editing ? "PUT" : "POST";

      const response = await adminFetch(url, {
        method,
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao salvar banner.");
      }

      homeBannerMessage.textContent =
        result.message || (editing ? "Banner atualizado com sucesso." : "Banner salvo com sucesso.");
      homeBannerMessage.className = "form-message success";

      showAdminFeedback(
        result.message || (editing ? "Banner atualizado com sucesso." : "Banner salvo com sucesso."),
        "success"
      );

      homeBannerForm.reset();
      setBannerFormCreateMode();
      hideBannerForm();

      await fetchHomeBanners();
    } catch (error) {
      console.error("ERRO AO SALVAR BANNER:", error);

      homeBannerMessage.textContent = error.message || "Erro ao salvar banner.";
      homeBannerMessage.className = "form-message error";

      showAdminFeedback(
        error.message || "Erro ao salvar banner.",
        "error"
      );
    } finally {
      saveBannerBtn.disabled = false;
      saveBannerBtn.textContent = editing ? "Atualizar Banner" : "Salvar Banner";
    }
  }

  function bindMasks() {
    if (cpfCnpjInput) {
      cpfCnpjInput.addEventListener("input", () => {
        cpfCnpjInput.value = formatCpfCnpj(cpfCnpjInput.value);
      });
    }

    if (phoneInput) {
      phoneInput.addEventListener("input", () => {
        phoneInput.value = formatPhone(phoneInput.value);
      });
    }

    if (whatsappInput) {
      whatsappInput.addEventListener("input", () => {
        whatsappInput.value = formatPhone(whatsappInput.value);
      });
    }
  }

  function bindSidebarEvents() {
    document.querySelectorAll(".admin-sidebar-link").forEach((link) => {
      if (link.dataset.sidebarBound === "true") return;

      const action = getSidebarActionFromLink(link);

      if (!action) return;

      link.dataset.sidebarBound = "true";

      link.addEventListener("click", async (event) => {
        event.preventDefault();
        await handleSidebarAction(action);
      });
    });
  }

  function bindGeneralEvents() {
    document.addEventListener("click", () => {
      closeAllDocumentMenus();
    });

    bindSidebarEvents();
    bindAdminActionModalEvents();

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await logoutAdmin();
      });
    }

    if (toggleCreateClientBtn) {
      toggleCreateClientBtn.addEventListener("click", toggleCreateClientForm);
    }

    if (clientsQuickCreateBtn) {
      clientsQuickCreateBtn.addEventListener("click", () => {
        showCreateClientForm();
        setSidebarActive("clients");
        updateHash("#clientes");
      });
    }

    if (dashboardQuickNewClientBtn) {
      dashboardQuickNewClientBtn.addEventListener("click", openCreateClientFromQuickAction);
    }

    if (dashboardQuickClientsBtn) {
      dashboardQuickClientsBtn.addEventListener("click", async () => {
        await openClientsFromQuickAction();
      });
    }

    if (dashboardQuickCreateBannerBtn) {
      dashboardQuickCreateBannerBtn.addEventListener("click", async () => {
        await openBannersFromQuickAction({
          openForm: true
        });
      });
    }

    if (dashboardQuickBannersBtn) {
      dashboardQuickBannersBtn.addEventListener("click", async () => {
        await openBannersFromQuickAction();
      });
    }

    if (dashboardRenewalStatusFilter) {
      dashboardRenewalStatusFilter.addEventListener("change", () => {
        renderRenewalAlerts(renewalAlertsCache);
      });
    }

    if (dashboardRenewalClearFiltersBtn) {
      dashboardRenewalClearFiltersBtn.addEventListener("click", () => {
        if (dashboardRenewalStatusFilter) {
          dashboardRenewalStatusFilter.value = "all";
        }

        renderRenewalAlerts(renewalAlertsCache);
      });
    }

    if (closeCreateClientModalBtn) {
      closeCreateClientModalBtn.addEventListener("click", () => {
        hideCreateClientForm();
      });
    }

    if (cancelCreateClientModalBtn) {
      cancelCreateClientModalBtn.addEventListener("click", () => {
        hideCreateClientForm({
          resetForm: true
        });
      });
    }

    if (createClientModalBackdrop) {
      createClientModalBackdrop.addEventListener("click", () => {
        hideCreateClientForm();
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (isAdminActionModalOpen()) {
        closeAdminActionModal(false);
        return;
      }

      if (isCreateClientModalOpen()) {
        hideCreateClientForm();
      }
    });

    if (toggleClientsListBtn) {
      toggleClientsListBtn.addEventListener("click", async () => {
        if (!clientsSectionWrapper) return;

        setSidebarActive("clients");
        updateHash("#clientes");

        if (clientsSectionWrapper.classList.contains("hidden")) {
          showClientsList();

          if (!clientsLoaded) {
            await fetchClients();
          } else {
            renderClientsList(allClientsCache);
          }

          scrollToSection(clientsSectionWrapper);
        } else {
          hideClientsList();
        }
      });
    }

    if (toggleHomeBannersBtn) {
      toggleHomeBannersBtn.addEventListener("click", async () => {
        if (!homeBannersWrapper) return;

        setSidebarActive("banners");
        updateHash("#banners");

        if (homeBannersWrapper.classList.contains("hidden")) {
          showHomeBanners();

          if (!homeBannersLoaded) {
            await fetchHomeBanners();
          } else {
            renderHomeBannersList(allHomeBannersCache);
          }

          scrollToSection(homeBannersWrapper);
        } else {
          hideHomeBanners();
        }
      });
    }

    if (toggleBannerFormBtn) {
      toggleBannerFormBtn.addEventListener("click", toggleBannerForm);
    }

    if (createClientForm) {
      createClientForm.addEventListener("submit", createClient);
    }

    if (homeBannerForm) {
      homeBannerForm.addEventListener("submit", submitHomeBanner);
    }

    if (bannerActionType) {
      bannerActionType.addEventListener("change", updateBannerFormVisibility);
    }

    if (bannerLinkTarget) {
      bannerLinkTarget.addEventListener("change", updateBannerFormVisibility);
    }

    if (cancelBannerEditBtn) {
      cancelBannerEditBtn.addEventListener("click", () => {
        homeBannerForm?.reset();
        setBannerFormCreateMode();
        hideBannerForm();
      });
    }

    if (cancelBannerEditBtnBottom) {
      cancelBannerEditBtnBottom.addEventListener("click", () => {
        homeBannerForm?.reset();
        setBannerFormCreateMode();
        hideBannerForm();
      });
    }

    if (copyTemporaryPasswordBtn && temporaryPasswordField) {
      copyTemporaryPasswordBtn.addEventListener("click", async () => {
        const password = temporaryPasswordField.value;

        if (!password) return;

        try {
          await navigator.clipboard.writeText(password);
          copyTemporaryPasswordBtn.textContent = "Copiado!";
          showAdminFeedback("Senha temporária copiada.", "success");

          setTimeout(() => {
            copyTemporaryPasswordBtn.textContent = "Copiar senha";
          }, 1800);
        } catch (error) {
          console.error("ERRO AO COPIAR SENHA:", error);

          temporaryPasswordField.select();
          document.execCommand("copy");

          copyTemporaryPasswordBtn.textContent = "Copiado!";
          showAdminFeedback("Senha temporária copiada.", "success");

          setTimeout(() => {
            copyTemporaryPasswordBtn.textContent = "Copiar senha";
          }, 1800);
        }
      });
    }

    if (clientsSearchInput) {
      clientsSearchInput.addEventListener("input", () => {
        if (clientsSearchDebounceTimer) {
          clearTimeout(clientsSearchDebounceTimer);
        }

        clientsSearchDebounceTimer = setTimeout(() => {
          renderClientsList(allClientsCache);
        }, 250);
      });
    }

    if (clientsStatusFilter) {
      clientsStatusFilter.addEventListener("change", () => {
        renderClientsList(allClientsCache);
      });
    }

    if (clientsTypeFilter) {
      clientsTypeFilter.addEventListener("change", () => {
        renderClientsList(allClientsCache);
      });
    }
  }

  function prepareInitialLayout() {
    closeCreateClientModal();
    closePanel(clientsSectionWrapper);
    closePanel(homeBannersWrapper);
    closeAdminActionModal(false);

    hidePasswordBox();
    setBannerFormCreateMode();

    if (homeBannerForm) {
      closePanel(homeBannerForm);
    }

    if (toggleCreateClientBtn) {
      toggleCreateClientBtn.textContent = "Novo Cliente";
    }

    if (toggleClientsListBtn) {
      toggleClientsListBtn.textContent = "Exibir Clientes";
    }

    if (toggleHomeBannersBtn) {
      toggleHomeBannersBtn.textContent = "Exibir Banners";
    }

    if (toggleBannerFormBtn) {
      toggleBannerFormBtn.textContent = "Criar Banner";
    }

    if (dashboardRenewalStatusFilter) {
      dashboardRenewalStatusFilter.value = "all";
    }

    updateBannerFormVisibility();
    setSidebarActive("dashboard");
  }

  async function initializeAdminPanel() {
    try {
      await ensureValidAdminSession();

      loadAdminInfo();
      bindMasks();
      bindGeneralEvents();
      prepareInitialLayout();
      scheduleAdminSessionRefresh();

      hideAdminFeedback();

      await Promise.allSettled([
        fetchClients(),
        fetchHomeBanners(),
        fetchRenewalAlerts()
      ]);

      await applyInitialHashNavigation();
    } catch (error) {
      console.error("ERRO AO INICIALIZAR PAINEL ADMINISTRATIVO:", error);

      showAdminFeedback(
        error.message || "Erro ao inicializar painel administrativo.",
        "error",
        false
      );
    }
  }

  await initializeAdminPanel();
});