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

  const BANNER_ASPECT_RATIO_WIDTH = 16;
  const BANNER_ASPECT_RATIO_HEIGHT = 5;

  const BANNER_DIMENSION_MESSAGE =
    "A imagem do banner deve estar na proporção 16:5. Exemplos aceitos: 5120x1600, 3200x1000, 2560x800, 1920x600 ou 1600x500.";

  const SESSION_REFRESH_MARGIN_SECONDS = 5 * 60;
  const ADMIN_SESSION_EXPIRES_AT_KEY = "admin_session_expires_at";

  const adminNameElement = document.getElementById("adminName");
  const adminRoleElement = document.getElementById("adminRole");
  const adminWelcome = document.getElementById("adminWelcome");
  const logoutBtn = document.getElementById("logoutBtn");
  const sidebarLogoutBtn = document.getElementById("sidebarLogoutBtn");

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
  const dashboardRecentActivitiesList = document.getElementById("dashboardRecentActivitiesList");

  const dashboardTotalDocuments = document.getElementById("dashboardTotalDocuments");
  const dashboardDocumentsThisMonth = document.getElementById("dashboardDocumentsThisMonth");
  const dashboardClientsThisMonth = document.getElementById("dashboardClientsThisMonth");
  const dashboardInactiveBanners = document.getElementById("dashboardInactiveBanners");
  const dashboardTotalAccess = document.getElementById("dashboardTotalAccess");
  const dashboardAccessThisMonth = document.getElementById("dashboardAccessThisMonth");
  const dashboardTotalDocumentDownloads = document.getElementById("dashboardTotalDocumentDownloads");
  const dashboardDocumentDownloadsThisMonth = document.getElementById("dashboardDocumentDownloadsThisMonth");

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
  let recentActivitiesCache = [];
  let dashboardSummaryCache = {};

  let clientsLoaded = false;
  let homeBannersLoaded = false;

  let clientsSearchDebounceTimer = null;

  let homeBannersSortable = null;
  let bannerOrderBeforeDrag = "";

  let adminSessionRefreshTimer = null;
  let adminSessionRefreshingPromise = null;
  let adminMaxSessionTimer = null;

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

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    const datePart = date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    const timePart = date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    return `${datePart} às ${timePart}`;
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

  function cleanRecentActivityText(value) {
    const text = String(value || "").trim();

    if (!text) {
      return "";
    }

    return text
      .replace(/\s+(no|do)\s+painel\s+administrativo\.?/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+\./g, ".")
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

  function isCurrentProfileAdmin() {
    return String(profile?.role || "").toLowerCase() === "admin";
  }

  function getAdminSessionExpiresAtMs() {
    const expiresAt = Number(localStorage.getItem(ADMIN_SESSION_EXPIRES_AT_KEY) || 0);

    return Number.isFinite(expiresAt) ? expiresAt : 0;
  }

  function hasAdminSessionExpired() {
    if (!isCurrentProfileAdmin()) {
      return false;
    }

    const expiresAt = getAdminSessionExpiresAtMs();

    if (!expiresAt) {
      return true;
    }

    return Date.now() > expiresAt;
  }

  function clearAdminMaxSessionTimer() {
    if (adminMaxSessionTimer) {
      clearTimeout(adminMaxSessionTimer);
      adminMaxSessionTimer = null;
    }
  }

  function scheduleAdminMaxSessionExpiration() {
    clearAdminMaxSessionTimer();

    if (!isCurrentProfileAdmin()) {
      return;
    }

    const expiresAt = getAdminSessionExpiresAtMs();

    if (!expiresAt) {
      return;
    }

    const delay = expiresAt - Date.now();

    if (delay <= 0) {
      redirectToLoginBecauseSessionExpired();
      return;
    }

    adminMaxSessionTimer = setTimeout(() => {
      redirectToLoginBecauseSessionExpired();
    }, delay);
  }

  function enforceAdminSessionLimit() {
    if (!hasAdminSessionExpired()) {
      return true;
    }

    redirectToLoginBecauseSessionExpired();
    return false;
  }

  function clearAdminSession() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("session_expires_at");
    localStorage.removeItem("session_expires_in");
    localStorage.removeItem("profile");
    localStorage.removeItem(ADMIN_SESSION_EXPIRES_AT_KEY);
    clearAdminMaxSessionTimer();
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

    scheduleAdminMaxSessionExpiration();
    scheduleAdminSessionRefresh();
  }

  async function refreshAdminSession() {
    if (!enforceAdminSessionLimit()) {
      throw new Error("Sessão administrativa expirada. Faça login novamente.");
    }

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
    if (!enforceAdminSessionLimit()) {
      throw new Error("Sessão administrativa expirada. Faça login novamente.");
    }

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
    if (isCurrentProfileAdmin() && hasAdminSessionExpired()) {
      redirectToLoginBecauseSessionExpired();
      return;
    }

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
        if (!enforceAdminSessionLimit()) {
          return;
        }

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
      showAdminFeedback(message || title, type === "danger" ? "error" : type);

      return Promise.resolve(showCancel ? false : true);
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
    const isAlreadyOpen = createClientModal
      ? isCreateClientModalOpen()
      : Boolean(createClientWrapper && !createClientWrapper.classList.contains("hidden"));

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

  function formatDashboardSummaryNumber(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return String(number);
  }

  function updateDashboardGeneralSummary(summary = {}) {
    const safeSummary = summary && typeof summary === "object" ? summary : {};

    const values = {
      totalDocuments: safeSummary.total_documents ?? safeSummary.totalDocuments ?? 0,
      documentsThisMonth: safeSummary.documents_this_month ?? safeSummary.documentsThisMonth ?? 0,
      clientsThisMonth: safeSummary.clients_this_month ?? safeSummary.clientsThisMonth ?? 0,
      inactiveBanners: safeSummary.inactive_banners ?? safeSummary.inactiveBanners ?? 0,
      totalAccess: safeSummary.total_access ?? safeSummary.totalAccess ?? 0,
      accessThisMonth: safeSummary.access_this_month ?? safeSummary.accessThisMonth ?? 0,
      totalDocumentDownloads:
        safeSummary.total_document_downloads ?? safeSummary.totalDocumentDownloads ?? 0,
      documentDownloadsThisMonth:
        safeSummary.document_downloads_this_month ?? safeSummary.documentDownloadsThisMonth ?? 0
    };

    if (dashboardTotalDocuments) {
      dashboardTotalDocuments.textContent = formatDashboardSummaryNumber(values.totalDocuments);
    }

    if (dashboardDocumentsThisMonth) {
      dashboardDocumentsThisMonth.textContent = formatDashboardSummaryNumber(values.documentsThisMonth);
    }

    if (dashboardClientsThisMonth) {
      dashboardClientsThisMonth.textContent = formatDashboardSummaryNumber(values.clientsThisMonth);
    }

    if (dashboardInactiveBanners) {
      dashboardInactiveBanners.textContent = formatDashboardSummaryNumber(values.inactiveBanners);
    }

    if (dashboardTotalAccess) {
      dashboardTotalAccess.textContent = formatDashboardSummaryNumber(values.totalAccess);
    }

    if (dashboardAccessThisMonth) {
      dashboardAccessThisMonth.textContent = formatDashboardSummaryNumber(values.accessThisMonth);
    }

    if (dashboardTotalDocumentDownloads) {
      dashboardTotalDocumentDownloads.textContent =
        formatDashboardSummaryNumber(values.totalDocumentDownloads);
    }

    if (dashboardDocumentDownloadsThisMonth) {
      dashboardDocumentDownloadsThisMonth.textContent =
        formatDashboardSummaryNumber(values.documentDownloadsThisMonth);
    }
  }

  async function fetchDashboardSummary() {
    try {
      const response = await adminFetch("http://localhost:3000/admin/dashboard/summary");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao carregar resumo geral do dashboard.");
      }

      dashboardSummaryCache = result && typeof result === "object" ? result : {};
      updateDashboardGeneralSummary(dashboardSummaryCache);
    } catch (error) {
      console.error("ERRO AO BUSCAR RESUMO GERAL DO DASHBOARD:", error);
      updateDashboardGeneralSummary(dashboardSummaryCache);
    }
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

    const filteredAlerts = filterRenewalAlerts(alerts);

    if (!filteredAlerts.length) {
      const row = document.createElement("tr");
      row.className = "dashboard-empty-row";

      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "Nenhum aviso de renovação encontrado.";

      row.appendChild(cell);
      dashboardRenewalAlertsBody.appendChild(row);
      return;
    }

    const fragment = document.createDocumentFragment();

    filteredAlerts.forEach((alert) => {
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

      renewalAlertsCache = Array.isArray(result)
        ? result
        : Array.isArray(result.alerts)
          ? result.alerts
          : [];

      renderRenewalAlerts(renewalAlertsCache);
    } catch (error) {
      console.error("ERRO AO BUSCAR AVISOS DE RENOVAÇÃO:", error);

      const errorRow = document.createElement("tr");
      errorRow.className = "dashboard-empty-row";

      const errorCell = document.createElement("td");
      errorCell.colSpan = 4;
      errorCell.textContent =
        error.message || "Não foi possível carregar os avisos de renovação.";

      errorRow.appendChild(errorCell);
      dashboardRenewalAlertsBody.replaceChildren(errorRow);
    }
  }

  function createRecentActivityCell(content) {
    const cell = document.createElement("td");

    if (content instanceof Node) {
      cell.appendChild(content);
    } else {
      cell.textContent = content ?? "-";
    }

    return cell;
  }

  function createRecentActivityRow(activity) {
    const row = document.createElement("tr");

    const activityBox = document.createElement("div");
    activityBox.className = "dashboard-activity-document";

    const title = document.createElement("strong");
    title.textContent = cleanRecentActivityText(activity?.title) || "Atividade registrada";

    activityBox.appendChild(title);

    const descriptionBox = document.createElement("div");
    descriptionBox.className = "dashboard-activity-document";

    const description = document.createElement("strong");
    description.textContent =
      cleanRecentActivityText(activity?.description) ||
      "Movimentação registrada.";

    descriptionBox.appendChild(description);

    const date = document.createElement("span");
    date.className = "dashboard-activity-date";
    date.textContent = formatDateTime(activity?.created_at);

    row.appendChild(createRecentActivityCell(activityBox));
    row.appendChild(createRecentActivityCell(descriptionBox));
    row.appendChild(createRecentActivityCell(date));

    return row;
  }

  function renderRecentActivities(activities) {
    if (!dashboardRecentActivitiesList) return;

    dashboardRecentActivitiesList.replaceChildren();

    const safeActivities = Array.isArray(activities) ? activities : [];

    if (!safeActivities.length) {
      const row = document.createElement("tr");
      row.className = "dashboard-empty-row";

      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.textContent = "Nenhuma atividade registrada. As movimentações recentes aparecerão aqui.";

      row.appendChild(cell);
      dashboardRecentActivitiesList.appendChild(row);
      return;
    }

    const fragment = document.createDocumentFragment();

    safeActivities.forEach((activity) => {
      fragment.appendChild(createRecentActivityRow(activity));
    });

    dashboardRecentActivitiesList.appendChild(fragment);
  }

  async function fetchRecentActivities() {
    if (!dashboardRecentActivitiesList) return;

    try {
      const loadingRow = document.createElement("tr");
      loadingRow.className = "dashboard-empty-row";

      const loadingCell = document.createElement("td");
      loadingCell.colSpan = 3;
      loadingCell.textContent = "Carregando atividades recentes...";

      loadingRow.appendChild(loadingCell);
      dashboardRecentActivitiesList.replaceChildren(loadingRow);

      const response = await adminFetch("http://localhost:3000/admin/activities?limit=20");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao carregar atividades recentes.");
      }

      recentActivitiesCache = Array.isArray(result)
        ? result
        : Array.isArray(result.activities)
          ? result.activities
          : [];

      renderRecentActivities(recentActivitiesCache);
    } catch (error) {
      console.error("ERRO AO BUSCAR ATIVIDADES RECENTES:", error);

      const errorRow = document.createElement("tr");
      errorRow.className = "dashboard-empty-row";

      const errorCell = document.createElement("td");
      errorCell.colSpan = 3;
      errorCell.textContent =
        error.message || "Não foi possível carregar as movimentações recentes.";

      errorRow.appendChild(errorCell);
      dashboardRecentActivitiesList.replaceChildren(errorRow);
    }
  }

  async function refreshRecentActivitiesSilently() {
    try {
      const response = await adminFetch("http://localhost:3000/admin/activities?limit=20");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao atualizar atividades recentes.");
      }

      recentActivitiesCache = Array.isArray(result)
        ? result
        : Array.isArray(result.activities)
          ? result.activities
          : [];

      renderRecentActivities(recentActivitiesCache);
    } catch (error) {
      console.error("ERRO AO ATUALIZAR ATIVIDADES RECENTES:", error);
    }
  }

  async function refreshDashboardDataAfterActivity() {
    await Promise.allSettled([
      fetchDashboardSummary(),
      fetchRenewalAlerts(),
      refreshRecentActivitiesSilently()
    ]);
  }

  function showCreateClientForm() {
    if (createClientWrapper) {
      openPanel(createClientWrapper);
    }

    if (createClientModal) {
      createClientModal.classList.remove("hidden");
      createClientModal.setAttribute("aria-hidden", "false");

      setTimeout(() => {
        document.getElementById("companyName")?.focus();
      }, 80);

      return;
    }

    if (!createClientWrapper) return;

    setTimeout(() => {
      createClientWrapper.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 120);
  }

  function hideCreateClientForm() {
    if (createClientModal) {
      createClientModal.classList.add("hidden");
      createClientModal.setAttribute("aria-hidden", "true");
    }

    if (createClientWrapper) {
      closePanel(createClientWrapper);
    }

    if (createClientForm) {
      createClientForm.reset();
    }

    if (createClientMessage) {
      createClientMessage.textContent = "";
      createClientMessage.className = "form-message";
    }

    if (temporaryPasswordBox) {
      temporaryPasswordBox.classList.add("hidden");
    }

    if (temporaryPasswordField) {
      temporaryPasswordField.value = "";
    }
  }

  function isCreateClientModalOpen() {
    return Boolean(createClientModal && !createClientModal.classList.contains("hidden"));
  }

  function showClientsList() {
    if (!clientsSectionWrapper) return;

    openPanel(clientsSectionWrapper);

    if (toggleClientsListBtn) {
      toggleClientsListBtn.textContent = "Ocultar Clientes";
    }
  }

  function hideClientsList() {
    if (!clientsSectionWrapper) return;

    closePanel(clientsSectionWrapper);

    if (toggleClientsListBtn) {
      toggleClientsListBtn.textContent = "Exibir Clientes";
    }
  }

  function showHomeBanners() {
    if (!homeBannersWrapper) return;

    openPanel(homeBannersWrapper);

    if (toggleHomeBannersBtn) {
      toggleHomeBannersBtn.textContent = "Ocultar Banners";
    }
  }

  function hideHomeBanners() {
    if (!homeBannersWrapper) return;

    closePanel(homeBannersWrapper);

    if (toggleHomeBannersBtn) {
      toggleHomeBannersBtn.textContent = "Exibir Banners";
    }

    if (homeBannerForm && !homeBannerForm.classList.contains("hidden")) {
      hideBannerForm();
    }
  }

  function showBannerForm() {
    if (!homeBannerForm) return;

    openPanel(homeBannerForm);

    if (toggleBannerFormBtn) {
      toggleBannerFormBtn.textContent = "Ocultar formulário";
    }

    clearBannerMessage();
    updateBannerActionFieldsVisibility();
  }

  function hideBannerForm() {
    if (!homeBannerForm) return;

    closePanel(homeBannerForm);

    if (toggleBannerFormBtn) {
      toggleBannerFormBtn.textContent = "Criar Banner";
    }

    clearBannerMessage();
  }

  function setButtonLoading(button, isLoading, loadingText = "Aguarde...") {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
      return;
    }

    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }

  function getCreateClientPayload() {
    return {
      company_name: document.getElementById("companyName")?.value?.trim() || "",
      full_name:
        document.getElementById("fullName")?.value?.trim() ||
        document.getElementById("responsibleName")?.value?.trim() ||
        "",
      cpf_cnpj: onlyDigits(cpfCnpjInput?.value || ""),
      email:
        document.getElementById("email")?.value?.trim() ||
        document.getElementById("clientEmail")?.value?.trim() ||
        "",
      address_zip: onlyDigits(document.getElementById("addressZip")?.value || ""),
      address_street: document.getElementById("addressStreet")?.value?.trim() || "",
      address_number: document.getElementById("addressNumber")?.value?.trim() || "",
      address_complement: document.getElementById("addressComplement")?.value?.trim() || "",
      address_neighborhood: document.getElementById("addressNeighborhood")?.value?.trim() || "",
      address_city: document.getElementById("addressCity")?.value?.trim() || "",
      address_state: document.getElementById("addressState")?.value?.trim() || "",
      phone: onlyDigits(phoneInput?.value || ""),
      whatsapp: onlyDigits(whatsappInput?.value || "")
    };
  }

  function validateCreateClientPayload(payload) {
    if (!payload.company_name) {
      return "Informe o nome da empresa.";
    }

    if (!payload.full_name) {
      return "Informe o nome do cliente.";
    }

    if (!payload.cpf_cnpj) {
      return "Informe o CPF ou CNPJ.";
    }

    if (![11, 14].includes(payload.cpf_cnpj.length)) {
      return "Informe um CPF ou CNPJ válido.";
    }

    if (!payload.email) {
      return "Informe o e-mail do cliente.";
    }

    return "";
  }

  function getTemporaryPasswordFromCreateClientResult(result) {
    if (!result || typeof result !== "object") {
      return "";
    }

    return (
      result.temporary_password ||
      result.temporaryPassword ||
      result.temp_password ||
      result.tempPassword ||
      result.initial_password ||
      result.initialPassword ||
      result.password ||
      result.client?.temporary_password ||
      result.client?.temporaryPassword ||
      result.client?.temp_password ||
      result.client?.tempPassword ||
      result.client?.initial_password ||
      result.client?.initialPassword ||
      result.client?.password ||
      result.data?.temporary_password ||
      result.data?.temporaryPassword ||
      result.data?.temp_password ||
      result.data?.tempPassword ||
      result.data?.initial_password ||
      result.data?.initialPassword ||
      result.data?.password ||
      ""
    );
  }

  async function handleCreateClient(event) {
    event.preventDefault();

    if (!createClientForm) return;

    const payload = getCreateClientPayload();
    const validationError = validateCreateClientPayload(payload);

    if (validationError) {
      if (createClientMessage) {
        createClientMessage.textContent = validationError;
        createClientMessage.className = "form-message error";
      }

      return;
    }

    const submitButton = createClientForm.querySelector("button[type='submit']");

    try {
      setButtonLoading(submitButton, true, "Cadastrando...");

      if (createClientMessage) {
        createClientMessage.textContent = "Cadastrando cliente...";
        createClientMessage.className = "form-message info";
      }

      const response = await adminFetch("http://localhost:3000/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao cadastrar cliente.");
      }

      const temporaryPassword = getTemporaryPasswordFromCreateClientResult(result);

      createClientForm.reset();

      if (createClientMessage) {
        createClientMessage.textContent = "Cliente cadastrado com sucesso.";
        createClientMessage.className = "form-message success";
      }

      if (temporaryPasswordField) {
        temporaryPasswordField.value = temporaryPassword;
      }

      if (temporaryPasswordBox) {
        temporaryPasswordBox.classList.toggle("hidden", !temporaryPassword);
      }

      if (!temporaryPassword) {
        console.warn(
          "Cliente cadastrado, mas a senha temporária não foi retornada pelo backend.",
          result
        );
      }

      clientsLoaded = false;
      await fetchClients();
      await refreshDashboardDataAfterActivity();

      await showAdminActionMessage({
        type: "success",
        title: "Cliente cadastrado",
        message: temporaryPassword
          ? "O cliente foi cadastrado com sucesso. A senha temporária está disponível no formulário."
          : "O cliente foi cadastrado com sucesso.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO CADASTRAR CLIENTE:", error);

      if (createClientMessage) {
        createClientMessage.textContent =
          error.message || "Não foi possível cadastrar o cliente.";
        createClientMessage.className = "form-message error";
      }
    } finally {
      setButtonLoading(submitButton, false);
    }
  }
  async function copyTemporaryPassword() {
    const password = temporaryPasswordField?.value || "";

    if (!password) {
      await showAdminActionMessage({
        type: "warning",
        title: "Senha não encontrada",
        message: "Nenhuma senha temporária foi gerada para copiar.",
        confirmText: "OK"
      });

      return;
    }

    try {
      await navigator.clipboard.writeText(password);

      await showAdminActionMessage({
        type: "success",
        title: "Senha copiada",
        message: "A senha temporária foi copiada para a área de transferência.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO COPIAR SENHA TEMPORÁRIA:", error);

      temporaryPasswordField?.select();

      await showAdminActionMessage({
        type: "warning",
        title: "Copie manualmente",
        message: "Não foi possível copiar automaticamente. Selecione a senha e copie manualmente.",
        confirmText: "OK"
      });
    }
  }

  function applyClientFilters(clients) {
    const safeClients = Array.isArray(clients) ? clients : [];
    const search = normalizeText(clientsSearchInput?.value || "");
    const searchDigits = onlyDigits(clientsSearchInput?.value || "");
    const status = clientsStatusFilter?.value || "all";
    const type = clientsTypeFilter?.value || "all";

    return safeClients.filter((client) => {
      const clientStatus = client.is_active === false ? "inactive" : "active";
      const clientType = getClientEntityType(client);

      const clientDocumentDigits = onlyDigits(client.cpf_cnpj || "");
      const clientDocumentFormatted = formatCpfCnpj(clientDocumentDigits);

      const searchSource = normalizeText(
        [
          client.company_name,
          client.full_name,
          client.email,
          client.cpf_cnpj,
          clientDocumentDigits,
          clientDocumentFormatted,
          formatCpfCnpj(client.cpf_cnpj),
          client.phone,
          client.whatsapp,
          formatPhone(client.phone),
          formatPhone(client.whatsapp)
        ].join(" ")
      );

      const matchesTextSearch = !search || searchSource.includes(search);

      const matchesDocumentSearch =
        !searchDigits ||
        clientDocumentDigits.includes(searchDigits) ||
        onlyDigits(clientDocumentFormatted).includes(searchDigits);

      const matchesSearch = matchesTextSearch || matchesDocumentSearch;
      const matchesStatus = status === "all" || clientStatus === status;
      const matchesType = type === "all" || clientType === type;

      return matchesSearch && matchesStatus && matchesType;
    });
  }

  function renderClientsMessage(message = "", type = "info") {
    if (!clientsListMessage) return;

    clientsListMessage.textContent = message;
    clientsListMessage.className = `list-message ${type}`;
  }

  function clearClientsList() {
    if (clientsList) {
      clientsList.replaceChildren();
    }
  }

  function renderClientsList(clients) {
    if (!clientsList) return;

    const filteredClients = applyClientFilters(clients);

    clearClientsList();

    if (!filteredClients.length) {
      renderClientsMessage("Nenhum cliente encontrado para os filtros selecionados.", "info");
      return;
    }

    renderClientsMessage(`${filteredClients.length} cliente(s) encontrado(s).`, "info");

    const fragment = document.createDocumentFragment();

    filteredClients.forEach((client) => {
      const card = renderClientCard(client);

      if (card) {
        fragment.appendChild(card);
      }
    });

    clientsList.appendChild(fragment);
  }

  function renderClientCard(client) {
    const card = cloneTemplate(clientCardTemplate);

    if (!card) {
      return null;
    }

    const clientId = getClientId(client);
    const isActive = client.is_active !== false;

    card.dataset.clientId = clientId;
    card.dataset.clientName = client.company_name || client.full_name || "Cliente";

    setElementText(card, "[data-client-avatar]", getClientInitials(client));
    setElementText(card, ".client-card-avatar", getClientInitials(client));

    setElementText(card, "[data-client-company]", client.company_name || "-");
    setElementText(card, ".client-company-name", client.company_name || "-");

    setElementText(card, "[data-client-name]", client.full_name || "-");
    setElementText(card, ".client-responsible-name", client.full_name || "-");

    setElementText(card, "[data-client-document-label]", getClientEntityLabel(client));
    setElementText(card, ".client-document-label", getClientEntityLabel(client));

    setElementText(card, "[data-client-document]", formatOptionalCpfCnpj(client.cpf_cnpj));
    setElementText(card, ".client-document-value", formatOptionalCpfCnpj(client.cpf_cnpj));

    setElementText(card, "[data-client-email]", client.email || "-");
    setElementText(card, ".client-email-value", client.email || "-");

    setElementText(card, "[data-client-phone]", formatOptionalPhone(client.phone));
    setElementText(card, ".client-phone-value", formatOptionalPhone(client.phone));

    setElementText(card, "[data-client-whatsapp]", formatOptionalPhone(client.whatsapp));
    setElementText(card, ".client-whatsapp-value", formatOptionalPhone(client.whatsapp));

    const statusBadge = card.querySelector("[data-client-status], .client-status-badge");

    if (statusBadge) {
      statusBadge.textContent = getClientStatusLabel(isActive);
      statusBadge.classList.toggle("active", isActive);
      statusBadge.classList.toggle("inactive", !isActive);
    }

    const documentsBtn = card.querySelector('[data-action="documents"], .show-documents-btn, .toggle-documents-btn');
    const uploadBtn = card.querySelector('[data-action="upload"], .show-upload-btn, .toggle-upload-btn');
    const statusBtn = card.querySelector('[data-action="status"], .toggle-client-status-btn');
    const deleteBtn = card.querySelector('[data-action="delete"], .delete-client-btn');

    if (documentsBtn) {
       documentsBtn.dataset.clientId = clientId;
       setClientDocumentsButtonState(card, false);
        documentsBtn.addEventListener("click", () => toggleClientDocuments(card, client));
    }

    if (uploadBtn) {
      uploadBtn.dataset.clientId = clientId;
      uploadBtn.addEventListener("click", () => toggleClientUpload(card, client));
    }

    if (statusBtn) {
      statusBtn.dataset.clientId = clientId;
      statusBtn.dataset.currentStatus = String(isActive);
      statusBtn.classList.toggle("success", !isActive);
      statusBtn.classList.toggle("warning", isActive);
      statusBtn.innerHTML = isActive
        ? '<i class="fa-solid fa-user-slash" aria-hidden="true"></i><span data-action-label>Inativar</span>'
        : '<i class="fa-solid fa-user-check" aria-hidden="true"></i><span data-action-label>Ativar</span>';

      statusBtn.addEventListener("click", () => toggleClientStatus(client));
    }

    if (deleteBtn) {
      deleteBtn.dataset.clientId = clientId;
      deleteBtn.dataset.clientName = client.company_name || client.full_name || "Cliente";
      deleteBtn.addEventListener("click", () => deleteClient(client));
    }

    return card;
  }

  async function fetchClients() {
    if (!clientsList) return;

    try {
      renderClientsMessage("Carregando clientes...", "info");
      clearClientsList();

      const response = await adminFetch("http://localhost:3000/clients");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao carregar clientes.");
      }

      allClientsCache = Array.isArray(result)
        ? result
        : Array.isArray(result.clients)
          ? result.clients
          : [];

      clientsLoaded = true;

      updateDashboardClientsSummary(allClientsCache);
      renderClientsList(allClientsCache);
    } catch (error) {
      console.error("ERRO AO BUSCAR CLIENTES:", error);

      renderClientsMessage(
        error.message || "Não foi possível carregar os clientes.",
        "error"
      );

      updateDashboardClientsSummary([]);
    }
  }

  function getClientCardById(clientId) {
    if (!clientsList || !clientId) return null;

    return clientsList.querySelector(`[data-client-id="${clientId}"]`);
  }

  function getClientDocumentsButton(card) {
  return card?.querySelector('[data-action="documents"], .show-documents-btn, .toggle-documents-btn') || null;
}

  function setClientDocumentsButtonState(card, isOpen) {
  const button = getClientDocumentsButton(card);

  if (!button) {
    return;
  }

  const label = button.querySelector("[data-action-label], span");
  const nextLabel = isOpen ? "Ocultar Documentos" : "Visualizar Documentos";

  button.classList.toggle("is-open", isOpen);
  button.setAttribute("aria-expanded", String(isOpen));

  if (label) {
    label.textContent = nextLabel;
    return;
  }

  button.textContent = nextLabel;
}

  function closeClientDocuments(card) {
  const wrapper = card?.querySelector("[data-client-documents-wrapper], .client-documents-wrapper");

  if (wrapper) {
    wrapper.classList.add("hidden");
    wrapper.replaceChildren();
  }

  setClientDocumentsButtonState(card, false);
}

  function closeClientUpload(card) {
    const wrapper = card?.querySelector("[data-client-upload-wrapper], .client-upload-wrapper");

    if (wrapper) {
      wrapper.classList.add("hidden");
      wrapper.replaceChildren();
    }
  }

  function closeOtherClientPanels(currentCard) {
    document.querySelectorAll("[data-client-card], .client-card").forEach((card) => {
      if (card === currentCard) return;

      closeClientDocuments(card);
      closeClientUpload(card);
    });
  }

  async function toggleClientDocuments(card, client) {
    if (!card || !client) return;

    const wrapper = card.querySelector("[data-client-documents-wrapper], .client-documents-wrapper");

    if (!wrapper) return;

    const isOpen = !wrapper.classList.contains("hidden");

    closeClientUpload(card);

    if (isOpen) {
      closeClientDocuments(card);
      return;
    }

    closeOtherClientPanels(card);

    wrapper.classList.remove("hidden");
    setClientDocumentsButtonState(card, true);
    wrapper.innerHTML = '<p class="documents-loading-message">Carregando documentos...</p>';

    await fetchClientDocuments(client, wrapper);
  }

  function toggleClientUpload(card, client) {
    if (!card || !client) return;

    const wrapper = card.querySelector("[data-client-upload-wrapper], .client-upload-wrapper");

    if (!wrapper) return;

    const isOpen = !wrapper.classList.contains("hidden");

    closeClientDocuments(card);

    if (isOpen) {
      closeClientUpload(card);
      return;
    }

    closeOtherClientPanels(card);

    wrapper.classList.remove("hidden");
    wrapper.replaceChildren();

    const uploadPanel = renderClientUploadPanel(client);

    if (uploadPanel) {
      wrapper.appendChild(uploadPanel);
    }
  }

  async function toggleClientStatus(client) {
    const clientId = getClientId(client);
    const isActive = client.is_active !== false;
    const nextStatus = !isActive;

    if (!clientId) return;

    const confirmed = await showAdminActionConfirm({
      type: isActive ? "warning" : "success",
      title: isActive ? "Inativar cliente" : "Ativar cliente",
      message: isActive
        ? `Deseja realmente inativar ${client.company_name || "este cliente"}?`
        : `Deseja realmente ativar ${client.company_name || "este cliente"}?`,
      confirmText: isActive ? "Inativar" : "Ativar",
      cancelText: "Cancelar"
    });

    if (!confirmed) return;

    try {
      const response = await adminFetch(`http://localhost:3000/admin/clients/${clientId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          is_active: nextStatus
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao atualizar status do cliente.");
      }

      await showAdminActionMessage({
        type: "success",
        title: nextStatus ? "Cliente ativado" : "Cliente inativado",
        message: nextStatus
          ? "O cliente foi ativado com sucesso."
          : "O cliente foi inativado com sucesso.",
        confirmText: "OK"
      });

      clientsLoaded = false;
      await fetchClients();
      await refreshDashboardDataAfterActivity();
    } catch (error) {
      console.error("ERRO AO ATUALIZAR STATUS DO CLIENTE:", error);

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao atualizar status",
        message: error.message || "Não foi possível atualizar o status do cliente.",
        confirmText: "OK"
      });
    }
  }

  async function deleteClient(client) {
    const clientId = getClientId(client);

    if (!clientId) return;

    const confirmed = await showAdminActionConfirm({
      type: "danger",
      title: "Excluir cliente",
      message: `Deseja realmente excluir ${client.company_name || "este cliente"}? Essa ação também removerá os documentos vinculados.`,
      confirmText: "Excluir",
      cancelText: "Cancelar"
    });

    if (!confirmed) return;

    try {
      const response = await adminFetch(`http://localhost:3000/admin/clients/${clientId}`, {
        method: "DELETE"
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao excluir cliente.");
      }

      await showAdminActionMessage({
        type: "success",
        title: "Cliente excluído",
        message: "O cliente foi excluído com sucesso.",
        confirmText: "OK"
      });

      delete clientDocumentsCache[clientId];

      clientsLoaded = false;
      await fetchClients();
      await refreshDashboardDataAfterActivity();
    } catch (error) {
      console.error("ERRO AO EXCLUIR CLIENTE:", error);

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao excluir cliente",
        message: error.message || "Não foi possível excluir o cliente.",
        confirmText: "OK"
      });
    }
  }

  function renderClientUploadPanel(client) {
    const form = cloneTemplate(clientUploadFormTemplate);

    if (!form) {
      return null;
    }

    const clientId = getClientId(client);

    form.dataset.clientId = clientId;

    setInputValue(form, "[data-upload-client-name]", client.full_name || "-");
    setInputValue(form, "[data-upload-company-name]", client.company_name || "-");

    const yearInput = form.querySelector("[data-upload-year]");

    if (yearInput && !yearInput.value) {
      yearInput.value = String(new Date().getFullYear());
    }

    form.addEventListener("submit", (event) => {
      handleUploadDocument(event, client);
    });

    return form;
  }

  async function handleUploadDocument(event, client) {
    event.preventDefault();

    const form = event.currentTarget;
    const clientId = getClientId(client);

    const category = form.querySelector("[data-upload-category]")?.value || "";
    const subcategory = form.querySelector("[data-upload-subcategory]")?.value?.trim() || "";
    const year = form.querySelector("[data-upload-year]")?.value || "";
    const releaseDate = form.querySelector("[data-upload-release-date]")?.value || "";
    const expirationDate = form.querySelector("[data-upload-expiration-date]")?.value || "";
    const fileInput = form.querySelector("[data-upload-file]");
    const message = form.querySelector("[data-upload-message]");
    const submitButton = form.querySelector(".upload-submit-btn");

    if (
      !clientId ||
      !category ||
      !year ||
      !fileInput?.files?.length ||
      !submitButton
    ) {
      setInlineMessage(message, "Preencha os campos obrigatórios: categoria, ano e arquivo.", "error");
      return;
    }

    if (
      releaseDate &&
      expirationDate &&
      isExpirationBeforeRelease(releaseDate, expirationDate)
    ) {
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

      await showAdminActionMessage({
        type: "success",
        title: "Documento enviado",
        message: result.message || "O documento foi enviado com sucesso.",
        confirmText: "OK"
      });

      form.reset();

      const yearInput = form.querySelector("[data-upload-year]");

      if (yearInput) {
        yearInput.value = String(new Date().getFullYear());
      }

      await fetchClientDocumentsData(clientId);

      const card = getClientCardById(clientId);
      const documentsWrapper = card?.querySelector("[data-client-documents-wrapper], .client-documents-wrapper");
      const updatedClient = allClientsCache.find((item) => getClientId(item) === clientId) || client;

      if (updatedClient && documentsWrapper && !documentsWrapper.classList.contains("hidden")) {
        renderClientDocumentsPanel(
          updatedClient,
          documentsWrapper,
          clientDocumentsCache[clientId] || []
        );
      }

      await refreshDashboardDataAfterActivity();
    } catch (error) {
      console.error("ERRO AO ENVIAR DOCUMENTO:", error);

      setInlineMessage(
        message,
        error.message || "Erro ao enviar documento.",
        "error"
      );

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao enviar documento",
        message: error.message || "Não foi possível enviar o documento.",
        confirmText: "OK"
      });
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }

  async function fetchClientDocumentsData(clientId) {
    if (!clientId) return [];

    const response = await adminFetch(
      `http://localhost:3000/clients/${clientId}/documents`
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Erro ao buscar documentos.");
    }

    clientDocumentsCache[clientId] = Array.isArray(result)
      ? result
      : Array.isArray(result.documents)
        ? result.documents
        : [];

    return clientDocumentsCache[clientId];
  }

  async function fetchClientDocuments(client, wrapper) {
    const clientId = getClientId(client);

    if (!clientId || !wrapper) return;

    try {
      wrapper.innerHTML = '<p class="documents-loading-message">Carregando documentos...</p>';

      const documents = await fetchClientDocumentsData(clientId);

      renderClientDocumentsPanel(client, wrapper, documents);
    } catch (error) {
      console.error("ERRO AO CARREGAR DOCUMENTOS DO CLIENTE:", error);

      wrapper.innerHTML = "";

      const message = document.createElement("p");
      message.className = "documents-loading-message";
      message.textContent = error.message || "Não foi possível carregar os documentos.";

      wrapper.appendChild(message);
    }
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

  function populateSelectOptions(selectElement, values, defaultLabel) {
    if (!selectElement) return;

    selectElement.replaceChildren();

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = defaultLabel;

    selectElement.appendChild(defaultOption);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;

      selectElement.appendChild(option);
    });
  }

  function populateDocumentFilters(panel, documents) {
    if (!panel) return;

    const categorySelect = panel.querySelector("[data-document-filter-category]");
    const yearSelect = panel.querySelector("[data-document-filter-year]");

    populateSelectOptions(
      categorySelect,
      getUniqueDocumentCategories(documents),
      "Todas"
    );

    populateSelectOptions(
      yearSelect,
      getUniqueDocumentYears(documents),
      "Todos"
    );
  }

  function renderClientDocumentsPanel(client, wrapper, documents) {
    if (!wrapper) return;

    const panel = cloneTemplate(documentsPanelTemplate);
    const clientId = getClientId(client);

    wrapper.replaceChildren();

    if (!panel) {
      const message = document.createElement("p");
      message.className = "documents-loading-message";
      message.textContent = "Não foi possível montar a área de documentos.";

      wrapper.appendChild(message);
      return;
    }

    panel.id = `documentsContent-${clientId}`;
    panel.dataset.clientId = clientId;

    populateDocumentFilters(panel, documents);

    wrapper.appendChild(panel);

    renderDocumentsForClient(clientId, documents);
    bindDocumentFilters(clientId);
  }

  function getDocumentFiltersFromPanel(panel) {
    if (!panel) {
      return {
        name: "",
        category: "",
        year: ""
      };
    }

    return {
      name: panel.querySelector("[data-document-filter-name]")?.value || "",
      category: panel.querySelector("[data-document-filter-category]")?.value || "",
      year: panel.querySelector("[data-document-filter-year]")?.value || ""
    };
  }

  function renderDocumentsForClient(clientId, documents) {
    const panel = document.getElementById(`documentsContent-${clientId}`);

    if (!panel) return;

    const list = panel.querySelector("[data-documents-list]");
    const resultsInfo = panel.querySelector("[data-documents-results-info]");

    if (!list) return;

    const safeDocuments = Array.isArray(documents) ? documents : [];
    const filters = getDocumentFiltersFromPanel(panel);
    const filteredDocuments = filterDocuments(safeDocuments, filters);

    list.replaceChildren();

    if (resultsInfo) {
      resultsInfo.textContent = `${filteredDocuments.length} documento(s) encontrado(s).`;
    }

    if (!filteredDocuments.length) {
      const empty = cloneTemplate(emptyDocumentsTemplate);

      if (empty) {
        list.appendChild(empty);
      } else {
        const message = document.createElement("p");
        message.className = "empty-documents-message";
        message.textContent = "Nenhum documento encontrado para este cliente com os filtros selecionados.";
        list.appendChild(message);
      }

      return;
    }

    const fragment = document.createDocumentFragment();

    filteredDocuments.forEach((documentItem) => {
      const item = renderDocumentItem(clientId, documentItem);

      if (item) {
        fragment.appendChild(item);
      }
    });

    list.appendChild(fragment);
    bindDocumentActions();
  }

  function renderDocumentItem(clientId, documentItem) {
    const item = cloneTemplate(documentItemTemplate);

    if (!item) return null;

    const documentId = documentItem.id || documentItem.document_id || "";
    const fileName = getDocumentFileName(documentItem);

    item.dataset.documentId = documentId;
    item.dataset.clientId = clientId;

    setElementText(item, "[data-document-file-name]", fileName);
    setElementText(item, "[data-document-category]", getDocumentCategory(documentItem));
    setElementText(item, "[data-document-subcategory]", getDocumentSubcategory(documentItem));
    setElementText(item, "[data-document-year]", getDocumentYear(documentItem));
    setElementText(item, "[data-document-release-date]", formatDate(getDocumentReleaseDate(documentItem)));
    setElementText(item, "[data-document-expiration-date]", formatDate(getDocumentExpirationDate(documentItem)));

    setElementDataset(item, "[data-document-menu-toggle]", "documentId", documentId);

    const actions = item.querySelector("[data-document-actions]");

    if (actions) {
      actions.classList.add("hidden");
    }

    const downloadBtn = item.querySelector("[data-document-download]");
    const replaceBtn = item.querySelector("[data-document-replace]");
    const replaceInput = item.querySelector("[data-document-replace-input]");
    const deleteBtn = item.querySelector("[data-document-delete]");

    if (downloadBtn) {
      downloadBtn.dataset.documentId = documentId;
    }

    if (replaceBtn) {
      replaceBtn.dataset.documentId = documentId;
      replaceBtn.dataset.clientId = clientId;
      replaceBtn.dataset.fileName = fileName;
    }

    if (replaceInput) {
      replaceInput.dataset.documentId = documentId;
      replaceInput.dataset.clientId = clientId;
    }

    if (deleteBtn) {
      deleteBtn.dataset.documentId = documentId;
      deleteBtn.dataset.clientId = clientId;
      deleteBtn.dataset.fileName = fileName;
    }

    return item;
  }

  function bindDocumentFilters(clientId) {
    const documents = clientDocumentsCache[clientId] || [];
    const panel = document.getElementById(`documentsContent-${clientId}`);

    if (!panel) return;

    const nameInput = panel.querySelector("[data-document-filter-name]");
    const categorySelect = panel.querySelector("[data-document-filter-category]");
    const yearSelect = panel.querySelector("[data-document-filter-year]");
    const clearBtn = panel.querySelector("[data-document-clear-filters]");

    const rerender = () => {
      renderDocumentsForClient(clientId, documents);
    };

    if (nameInput && nameInput.dataset.bound !== "true") {
      nameInput.dataset.bound = "true";

      nameInput.addEventListener("input", () => {
        rerender();
      });
    }

    if (categorySelect && categorySelect.dataset.bound !== "true") {
      categorySelect.dataset.bound = "true";

      categorySelect.addEventListener("change", () => {
        rerender();
      });
    }

    if (yearSelect && yearSelect.dataset.bound !== "true") {
      yearSelect.dataset.bound = "true";

      yearSelect.addEventListener("change", () => {
        rerender();
      });
    }

    if (clearBtn && clearBtn.dataset.bound !== "true") {
      clearBtn.dataset.bound = "true";

      clearBtn.addEventListener("click", () => {
        if (nameInput) nameInput.value = "";
        if (categorySelect) categorySelect.value = "";
        if (yearSelect) yearSelect.value = "";

        rerender();
      });
    }
  }

  function closeAllDocumentMenus() {
    document.querySelectorAll("[data-document-actions]").forEach((menu) => {
      menu.classList.add("hidden");
    });
  }

  function bindDocumentActions() {
    document.querySelectorAll("[data-document-menu-toggle]").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", (event) => {
        event.stopPropagation();

        const item = button.closest("[data-document-item]");
        const menu = item?.querySelector("[data-document-actions]");

        if (!menu) return;

        const isOpen = !menu.classList.contains("hidden");

        closeAllDocumentMenus();

        if (!isOpen) {
          menu.classList.remove("hidden");
        }
      });
    });

    document.querySelectorAll("[data-document-download]").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const documentId = button.dataset.documentId;

        if (!documentId) return;

        downloadDocument(documentId, button);
      });
    });

    document.querySelectorAll("[data-document-replace]").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const documentItem = button.closest("[data-document-item]");
        const input = documentItem?.querySelector("[data-document-replace-input]");

        if (!input) {
          showAdminActionMessage({
            type: "danger",
            title: "Campo não encontrado",
            message: "Não foi possível localizar o campo de substituição do arquivo.",
            confirmText: "OK"
          });

          return;
        }

        input.click();
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

    document.querySelectorAll("[data-document-delete]").forEach((button) => {
      if (button.dataset.bound === "true") return;

      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const documentId = button.dataset.documentId;
        const clientId = button.dataset.clientId;
        const fileName = button.dataset.fileName || "Documento";

        if (!documentId || !clientId) return;

        deleteDocument(documentId, clientId, fileName, button);
      });
    });
  }
  async function downloadDocument(documentId, buttonElement) {
    const originalText = buttonElement?.textContent || "Baixar";

    try {
      if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.textContent = "Baixando...";
      }

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

      await fetchDashboardSummary();

      await showAdminActionMessage({
        type: "success",
        title: "Download iniciado",
        message: "O documento foi aberto em uma nova aba.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO BAIXAR DOCUMENTO:", error);

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao baixar documento",
        message: error.message || "Não foi possível baixar o documento.",
        confirmText: "OK"
      });
    } finally {
      if (buttonElement) {
        buttonElement.disabled = false;
        buttonElement.textContent = originalText;
      }
    }
  }

  async function replaceDocument(documentId, clientId, file, buttonElement) {
    const originalText = buttonElement?.textContent || "Substituir";

    try {
      if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.textContent = "Enviando...";
      }

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

      const client = allClientsCache.find((item) => getClientId(item) === clientId);
      const card = getClientCardById(clientId);
      const wrapper = card?.querySelector("[data-client-documents-wrapper], .client-documents-wrapper");

      if (client && wrapper && !wrapper.classList.contains("hidden")) {
        await fetchClientDocuments(client, wrapper);
      } else {
        await fetchClientDocumentsData(clientId);
      }

      await refreshDashboardDataAfterActivity();

      await showAdminActionMessage({
        type: "success",
        title: "Documento substituído",
        message: result.message || "O documento foi substituído com sucesso.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO SUBSTITUIR DOCUMENTO:", error);

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao substituir documento",
        message: error.message || "Não foi possível substituir o documento.",
        confirmText: "OK"
      });
    } finally {
      if (buttonElement) {
        buttonElement.disabled = false;
        buttonElement.textContent = originalText;
      }
    }
  }

  async function deleteDocument(documentId, clientId, fileName, buttonElement) {
    const confirmed = await showAdminActionConfirm({
      type: "danger",
      title: "Excluir documento",
      message: `Deseja realmente excluir o documento "${fileName}"? Essa ação não poderá ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar"
    });

    if (!confirmed) return;

    const originalText = buttonElement?.textContent || "Excluir";

    try {
      if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.textContent = "Excluindo...";
      }

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

      const client = allClientsCache.find((item) => getClientId(item) === clientId);
      const card = getClientCardById(clientId);
      const wrapper = card?.querySelector("[data-client-documents-wrapper], .client-documents-wrapper");

      if (client && wrapper && !wrapper.classList.contains("hidden")) {
        await fetchClientDocuments(client, wrapper);
      } else {
        await fetchClientDocumentsData(clientId);
      }

      await refreshDashboardDataAfterActivity();

      await showAdminActionMessage({
        type: "success",
        title: "Documento excluído",
        message: result.message || "O documento foi excluído com sucesso.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO EXCLUIR DOCUMENTO:", error);

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao excluir documento",
        message: error.message || "Não foi possível excluir o documento.",
        confirmText: "OK"
      });
    } finally {
      if (buttonElement) {
        buttonElement.disabled = false;
        buttonElement.textContent = originalText;
      }
    }
  }

  function getBannerId(banner) {
    return banner?.id || banner?.notice_id || "";
  }

  function getBannerTitle(banner) {
    return banner?.title || "Banner sem título";
  }

  function getBannerImageUrl(banner) {
    return banner?.image_url || "";
  }

  function getBannerActionType(banner) {
    return banner?.action_type || "modal";
  }

  function getBannerLinkTarget(banner) {
    return banner?.link_target || "";
  }

  function getBannerLink(banner) {
    return banner?.link || "";
  }

  function getBannerDescription(banner) {
    return banner?.description || "";
  }

  function getBannerStatusLabel(isActive) {
    return isActive ? "Ativo" : "Inativo";
  }

  function isBannerActive(banner) {
    return banner?.is_active !== false;
  }

  function getBannerOrderIdsFromDOM() {
    if (!homeBannersList) return [];

    return Array.from(homeBannersList.querySelectorAll("[data-home-banner-card]"))
      .map((card) => card.dataset.bannerId)
      .filter(Boolean);
  }

  function getBannerOrderSignature() {
    return getBannerOrderIdsFromDOM().join("|");
  }

  function loadImageDimensions(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("Imagem não encontrada."));
        return;
      }

      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);

        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight
        });
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Não foi possível validar a imagem enviada."));
      };

      image.src = objectUrl;
    });
  }

  function isValidBannerAspectRatio(width, height) {
    if (!width || !height) {
      return false;
    }

    const expectedRatio = BANNER_ASPECT_RATIO_WIDTH / BANNER_ASPECT_RATIO_HEIGHT;
    const currentRatio = width / height;
    const tolerance = 0.01;

    return Math.abs(currentRatio - expectedRatio) <= tolerance;
  }

  async function validateBannerImageFile(file, isRequired = true) {
    if (!file) {
      return isRequired ? "Selecione uma imagem para o banner." : "";
    }

    if (!file.type || !file.type.startsWith("image/")) {
      return "O arquivo selecionado precisa ser uma imagem válida.";
    }

    try {
      const dimensions = await loadImageDimensions(file);

      if (!isValidBannerAspectRatio(dimensions.width, dimensions.height)) {
        return BANNER_DIMENSION_MESSAGE;
      }

      return "";
    } catch (error) {
      return error.message || "Não foi possível validar a imagem enviada.";
    }
  }

  function updateBannerActionFieldsVisibility() {
    const actionType = bannerActionType?.value || "modal";
    const linkTarget = bannerLinkTarget?.value || "contato";

    const isModal = actionType === "modal";
    const isLink = actionType === "link";
    const isCustomLink = isLink && linkTarget === "custom";

    if (bannerLinkTargetGroup) {
      bannerLinkTargetGroup.classList.toggle("hidden", !isLink);
    }

    if (bannerCustomLinkGroup) {
      bannerCustomLinkGroup.classList.toggle("hidden", !isCustomLink);
    }

    if (bannerDescriptionGroup) {
      bannerDescriptionGroup.classList.toggle("hidden", !isModal);
    }

    if (bannerDescription) {
      bannerDescription.required = isModal;
    }

    if (bannerLink) {
      bannerLink.required = isCustomLink;
    }
  }

  function getBannerFormPayloadValidation(isEditing = false) {
    const title = bannerTitle?.value?.trim() || "";
    const actionType = bannerActionType?.value || "modal";
    const linkTarget = bannerLinkTarget?.value || "";
    const link = bannerLink?.value?.trim() || "";
    const description = bannerDescription?.value?.trim() || "";

    if (!title) {
      return "Informe o título do banner.";
    }

    if (!actionType) {
      return "Selecione o tipo de ação do banner.";
    }

    if (actionType === "link") {
      if (!linkTarget) {
        return "Selecione o destino do banner.";
      }

      if (linkTarget === "custom" && !link) {
        return "Informe o link personalizado do banner.";
      }
    }

    if (actionType === "modal" && !description) {
      return "Informe a descrição que será exibida no informativo.";
    }

    if (!isEditing && !bannerImage?.files?.length) {
      return "Selecione uma imagem para o banner.";
    }

    return "";
  }

  function buildBannerFormData() {
    const formData = new FormData();

    const actionType = bannerActionType?.value || "modal";
    const linkTarget = bannerLinkTarget?.value || "";
    const customLink = bannerLink?.value?.trim() || "";
    const imageFile = bannerImage?.files?.[0] || null;

    formData.append("title", bannerTitle?.value?.trim() || "");
    formData.append("action_type", actionType);
    formData.append("link_target", actionType === "link" ? linkTarget : "");
    formData.append("description", bannerDescription?.value?.trim() || "");
    formData.append("is_active", bannerIsActive?.checked ? "true" : "false");

    if (actionType === "link" && linkTarget === "custom") {
      formData.append("link", customLink);
    } else {
      formData.append("link", "");
    }

    if (imageFile) {
      formData.append("image", imageFile);
    }

    return formData;
  }

  function renderHomeBannersMessage(message = "", type = "info") {
    if (!homeBannersListMessage) return;

    homeBannersListMessage.textContent = message;
    homeBannersListMessage.className = `list-message ${type}`;
  }

  function clearHomeBannersList() {
    if (homeBannersList) {
      homeBannersList.replaceChildren();
    }
  }

  function renderHomeBannerCard(banner) {
    const card = cloneTemplate(homeBannerCardTemplate);

    if (!card) {
      return null;
    }

    const bannerId = getBannerId(banner);
    const imageUrl = getBannerImageUrl(banner);
    const actionType = getBannerActionType(banner);
    const linkTarget = getBannerLinkTarget(banner);
    const link = getBannerLink(banner);
    const description = getBannerDescription(banner);
    const isActive = isBannerActive(banner);

    card.dataset.bannerId = bannerId;

    setElementText(card, "[data-banner-title]", getBannerTitle(banner));
    setElementText(card, "[data-banner-action-type]", getActionTypeLabel(actionType));
    setElementText(card, "[data-banner-link-target]", getLinkTargetLabel(linkTarget));
    setElementText(card, "[data-banner-created-at]", formatDateTime(banner?.created_at));

    const image = card.querySelector("[data-banner-image]");

    if (image) {
      if (imageUrl) {
        image.src = imageUrl;
      }

      image.alt = `Banner ${getBannerTitle(banner)}`;
    }

    const linkRow = card.querySelector("[data-banner-link-row]");
    const linkElement = card.querySelector("[data-banner-link]");

    if (linkRow) {
      linkRow.classList.toggle("hidden", !link);
    }

    if (linkElement && link) {
      linkElement.href = link;
      linkElement.textContent = link;
    }

    const descriptionBox = card.querySelector("[data-banner-description-box]");
    const descriptionElement = card.querySelector("[data-banner-description]");

    if (descriptionBox) {
      descriptionBox.classList.toggle("hidden", !description);
    }

    if (descriptionElement) {
      descriptionElement.textContent = description;
    }

    const status = card.querySelector("[data-banner-status]");

    if (status) {
      status.textContent = getBannerStatusLabel(isActive);
      status.classList.toggle("active", isActive);
      status.classList.toggle("inactive", !isActive);
    }

    const statusButton = card.querySelector("[data-banner-status-button]");

    if (statusButton) {
      statusButton.dataset.bannerId = bannerId;
      statusButton.dataset.currentStatus = String(isActive);
      statusButton.textContent = isActive ? "Desativar" : "Ativar";
      statusButton.classList.toggle("danger", isActive);
      statusButton.classList.toggle("success", !isActive);

      statusButton.addEventListener("click", () => {
        toggleBannerStatus(banner);
      });
    }

    const editButton = card.querySelector("[data-banner-edit]");

    if (editButton) {
      editButton.dataset.bannerId = bannerId;

      editButton.addEventListener("click", () => {
        editBanner(banner);
      });
    }

    const deleteButton = card.querySelector("[data-banner-delete]");

    if (deleteButton) {
      deleteButton.dataset.bannerId = bannerId;
      deleteButton.dataset.bannerTitle = getBannerTitle(banner);

      deleteButton.addEventListener("click", () => {
        deleteBanner(banner);
      });
    }

    return card;
  }

  function destroyHomeBannersSortable() {
    if (homeBannersSortable) {
      homeBannersSortable.destroy();
      homeBannersSortable = null;
    }
  }

  function initializeHomeBannersSortable() {
    if (!homeBannersList || typeof Sortable === "undefined") {
      return;
    }

    destroyHomeBannersSortable();

    homeBannersSortable = new Sortable(homeBannersList, {
      animation: 180,
      handle: ".home-banner-drag-hint",
      draggable: "[data-home-banner-card]",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",

      onStart() {
        bannerOrderBeforeDrag = getBannerOrderSignature();
      },

      async onEnd() {
        const nextSignature = getBannerOrderSignature();

        if (!nextSignature || nextSignature === bannerOrderBeforeDrag) {
          return;
        }

        await saveBannerOrder();
      }
    });
  }

  function renderHomeBannersList(banners) {
    if (!homeBannersList) return;

    clearHomeBannersList();

    const safeBanners = Array.isArray(banners) ? banners : [];

    if (!safeBanners.length) {
      renderHomeBannersMessage("Nenhum banner cadastrado até o momento.", "info");
      destroyHomeBannersSortable();
      updateDashboardBannersSummary([]);
      return;
    }

    renderHomeBannersMessage(`${safeBanners.length} banner(s) cadastrado(s).`, "info");

    const fragment = document.createDocumentFragment();

    safeBanners.forEach((banner) => {
      const card = renderHomeBannerCard(banner);

      if (card) {
        fragment.appendChild(card);
      }
    });

    homeBannersList.appendChild(fragment);
    initializeHomeBannersSortable();
    updateDashboardBannersSummary(safeBanners);
  }

  async function fetchHomeBanners() {
    if (!homeBannersList) return;

    try {
      renderHomeBannersMessage("Carregando banners...", "info");
      clearHomeBannersList();

      const response = await adminFetch("http://localhost:3000/admin/notices");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao carregar banners.");
      }

      allHomeBannersCache = Array.isArray(result)
        ? result
        : Array.isArray(result.notices)
          ? result.notices
          : [];

      homeBannersLoaded = true;

      renderHomeBannersList(allHomeBannersCache);
    } catch (error) {
      console.error("ERRO AO BUSCAR BANNERS:", error);

      renderHomeBannersMessage(
        error.message || "Não foi possível carregar os banners.",
        "error"
      );

      updateDashboardBannersSummary([]);
    }
  }

  async function saveBannerOrder() {
    const orderedIds = getBannerOrderIdsFromDOM();

    if (!orderedIds.length) return;

    try {
      showAdminFeedback("Salvando nova ordem dos banners...", "info", false);

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

      hideAdminFeedback();

      await fetchHomeBanners();
      await refreshDashboardDataAfterActivity();

      await showAdminActionMessage({
        type: "success",
        title: "Ordem atualizada",
        message: "A nova ordem dos banners foi salva com sucesso.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO REORDENAR BANNERS:", error);

      hideAdminFeedback();

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao salvar ordem",
        message: error.message || "Não foi possível salvar a nova ordem dos banners.",
        confirmText: "OK"
      });

      await fetchHomeBanners();
    }
  }

  function setBannerFormCreateMode() {
    if (bannerEditId) {
      bannerEditId.value = "";
    }

    if (bannerEditModeBox) {
      bannerEditModeBox.classList.add("hidden");
    }

    if (bannerCurrentImageBox) {
      bannerCurrentImageBox.classList.add("hidden");
    }

    if (bannerCurrentImage) {
      bannerCurrentImage.removeAttribute("src");
    }

    if (saveBannerBtn) {
      saveBannerBtn.textContent = "Cadastrar Banner";
    }

    if (bannerIsActive) {
      bannerIsActive.checked = true;
    }

    if (bannerActionType) {
      bannerActionType.value = "modal";
    }

    if (bannerLinkTarget) {
      bannerLinkTarget.value = "contato";
    }

    clearBannerMessage();
    updateBannerActionFieldsVisibility();
  }

  function setBannerFormEditMode(banner) {
    if (!banner) return;

    const bannerId = getBannerId(banner);
    const actionType = getBannerActionType(banner);
    const linkTarget = getBannerLinkTarget(banner);

    if (bannerEditId) {
      bannerEditId.value = bannerId;
    }

    if (bannerTitle) {
      bannerTitle.value = getBannerTitle(banner);
    }

    if (bannerActionType) {
      bannerActionType.value = actionType;
    }

    if (bannerLinkTarget) {
      bannerLinkTarget.value = linkTarget || "contato";
    }

    if (bannerLink) {
      bannerLink.value = getBannerLink(banner);
    }

    if (bannerDescription) {
      bannerDescription.value = getBannerDescription(banner);
    }

    if (bannerIsActive) {
      bannerIsActive.checked = isBannerActive(banner);
    }

    if (bannerImage) {
      bannerImage.value = "";
    }

    if (bannerEditModeBox) {
      bannerEditModeBox.classList.remove("hidden");
    }

    const imageUrl = getBannerImageUrl(banner);

    if (bannerCurrentImageBox) {
      bannerCurrentImageBox.classList.toggle("hidden", !imageUrl);
    }

    if (bannerCurrentImage && imageUrl) {
      bannerCurrentImage.src = imageUrl;
    }

    if (saveBannerBtn) {
      saveBannerBtn.textContent = "Salvar Alterações";
    }

    clearBannerMessage();
    updateBannerActionFieldsVisibility();
  }

  function cancelBannerEdit() {
    if (homeBannerForm) {
      homeBannerForm.reset();
    }

    setBannerFormCreateMode();
  }

  async function handleSaveBanner(event) {
    event.preventDefault();

    if (!homeBannerForm) return;

    const isEditing = Boolean(bannerEditId?.value);
    const validationError = getBannerFormPayloadValidation(isEditing);

    if (validationError) {
      if (homeBannerMessage) {
        homeBannerMessage.textContent = validationError;
        homeBannerMessage.className = "form-message error";
      }

      return;
    }

    const imageFile = bannerImage?.files?.[0] || null;
    const imageValidationError = await validateBannerImageFile(imageFile, !isEditing);

    if (imageValidationError) {
      if (homeBannerMessage) {
        homeBannerMessage.textContent = imageValidationError;
        homeBannerMessage.className = "form-message error";
      }

      return;
    }

    const endpoint = isEditing
      ? `http://localhost:3000/admin/notices/${bannerEditId.value}`
      : "http://localhost:3000/admin/notices/upload";

    const method = isEditing ? "PUT" : "POST";
    const loadingText = isEditing ? "Salvando..." : "Cadastrando...";

    try {
      setButtonLoading(saveBannerBtn, true, loadingText);

      if (homeBannerMessage) {
        homeBannerMessage.textContent = isEditing
          ? "Salvando alterações do banner..."
          : "Cadastrando banner...";
        homeBannerMessage.className = "form-message info";
      }

      const response = await adminFetch(endpoint, {
        method,
        body: buildBannerFormData()
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao salvar banner.");
      }

      if (homeBannerMessage) {
        homeBannerMessage.textContent = result.message || "Banner salvo com sucesso.";
        homeBannerMessage.className = "form-message success";
      }

      homeBannerForm.reset();
      setBannerFormCreateMode();
      hideBannerForm();

      homeBannersLoaded = false;
      await fetchHomeBanners();
      await refreshDashboardDataAfterActivity();

      await showAdminActionMessage({
        type: "success",
        title: isEditing ? "Banner atualizado" : "Banner cadastrado",
        message: isEditing
          ? "O banner foi atualizado com sucesso."
          : "O banner foi cadastrado com sucesso.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO SALVAR BANNER:", error);

      if (homeBannerMessage) {
        homeBannerMessage.textContent =
          error.message || "Não foi possível salvar o banner.";
        homeBannerMessage.className = "form-message error";
      }

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao salvar banner",
        message: error.message || "Não foi possível salvar o banner.",
        confirmText: "OK"
      });
    } finally {
      setButtonLoading(saveBannerBtn, false);
    }
  }

  function editBanner(banner) {
    if (!banner) return;

    if (!homeBannersWrapper || homeBannersWrapper.classList.contains("hidden")) {
      showHomeBanners();
    }

    setBannerFormEditMode(banner);
    showBannerForm();

    setTimeout(() => {
      homeBannerForm?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 180);
  }

  async function toggleBannerStatus(banner) {
    const bannerId = getBannerId(banner);
    const isActive = isBannerActive(banner);

    if (!bannerId) return;

    const confirmed = await showAdminActionConfirm({
      type: isActive ? "warning" : "success",
      title: isActive ? "Desativar banner" : "Ativar banner",
      message: isActive
        ? `Deseja realmente desativar o banner "${getBannerTitle(banner)}"?`
        : `Deseja realmente ativar o banner "${getBannerTitle(banner)}"?`,
      confirmText: isActive ? "Desativar" : "Ativar",
      cancelText: "Cancelar"
    });

    if (!confirmed) return;

    try {
      const response = await adminFetch(`http://localhost:3000/admin/notices/${bannerId}/toggle`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          is_active: !isActive
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao atualizar status do banner.");
      }

      await fetchHomeBanners();
      await refreshDashboardDataAfterActivity();

      await showAdminActionMessage({
        type: "success",
        title: !isActive ? "Banner ativado" : "Banner desativado",
        message: !isActive
          ? "O banner foi ativado com sucesso."
          : "O banner foi desativado com sucesso.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO ALTERAR STATUS DO BANNER:", error);

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao atualizar banner",
        message: error.message || "Não foi possível atualizar o status do banner.",
        confirmText: "OK"
      });
    }
  }

  async function deleteBanner(banner) {
    const bannerId = getBannerId(banner);

    if (!bannerId) return;

    const confirmed = await showAdminActionConfirm({
      type: "danger",
      title: "Excluir banner",
      message: `Deseja realmente excluir o banner "${getBannerTitle(banner)}"? Essa ação não poderá ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar"
    });

    if (!confirmed) return;

    try {
      const response = await adminFetch(`http://localhost:3000/admin/notices/${bannerId}`, {
        method: "DELETE"
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao excluir banner.");
      }

      await fetchHomeBanners();
      await refreshDashboardDataAfterActivity();

      await showAdminActionMessage({
        type: "success",
        title: "Banner excluído",
        message: result.message || "O banner foi excluído com sucesso.",
        confirmText: "OK"
      });
    } catch (error) {
      console.error("ERRO AO EXCLUIR BANNER:", error);

      await showAdminActionMessage({
        type: "danger",
        title: "Erro ao excluir banner",
        message: error.message || "Não foi possível excluir o banner.",
        confirmText: "OK"
      });
    }
  }

  function bindCreateClientModalEvents() {
    if (closeCreateClientModalBtn && closeCreateClientModalBtn.dataset.bound !== "true") {
      closeCreateClientModalBtn.dataset.bound = "true";

      closeCreateClientModalBtn.addEventListener("click", () => {
        hideCreateClientForm();
      });
    }

    if (cancelCreateClientModalBtn && cancelCreateClientModalBtn.dataset.bound !== "true") {
      cancelCreateClientModalBtn.dataset.bound = "true";

      cancelCreateClientModalBtn.addEventListener("click", () => {
        hideCreateClientForm();
      });
    }

    if (createClientModalBackdrop && createClientModalBackdrop.dataset.bound !== "true") {
      createClientModalBackdrop.dataset.bound = "true";

      createClientModalBackdrop.addEventListener("click", () => {
        hideCreateClientForm();
      });
    }
  }

  function bindClientFilters() {
    if (clientsSearchInput && clientsSearchInput.dataset.bound !== "true") {
      clientsSearchInput.dataset.bound = "true";

      clientsSearchInput.addEventListener("input", () => {
        if (clientsSearchDebounceTimer) {
          clearTimeout(clientsSearchDebounceTimer);
        }

        clientsSearchDebounceTimer = setTimeout(() => {
          renderClientsList(allClientsCache);
        }, 180);
      });
    }

    if (clientsStatusFilter && clientsStatusFilter.dataset.bound !== "true") {
      clientsStatusFilter.dataset.bound = "true";

      clientsStatusFilter.addEventListener("change", () => {
        renderClientsList(allClientsCache);
      });
    }

    if (clientsTypeFilter && clientsTypeFilter.dataset.bound !== "true") {
      clientsTypeFilter.dataset.bound = "true";

      clientsTypeFilter.addEventListener("change", () => {
        renderClientsList(allClientsCache);
      });
    }
  }

  function bindRenewalFilters() {
    if (dashboardRenewalStatusFilter && dashboardRenewalStatusFilter.dataset.bound !== "true") {
      dashboardRenewalStatusFilter.dataset.bound = "true";

      dashboardRenewalStatusFilter.addEventListener("change", () => {
        renderRenewalAlerts(renewalAlertsCache);
      });
    }

    if (dashboardRenewalClearFiltersBtn && dashboardRenewalClearFiltersBtn.dataset.bound !== "true") {
      dashboardRenewalClearFiltersBtn.dataset.bound = "true";

      dashboardRenewalClearFiltersBtn.addEventListener("click", () => {
        if (dashboardRenewalStatusFilter) {
          dashboardRenewalStatusFilter.value = "all";
        }

        renderRenewalAlerts(renewalAlertsCache);
      });
    }
  }

  function bindBannerEvents() {
    if (bannerActionType && bannerActionType.dataset.bound !== "true") {
      bannerActionType.dataset.bound = "true";

      bannerActionType.addEventListener("change", () => {
        updateBannerActionFieldsVisibility();
      });
    }

    if (bannerLinkTarget && bannerLinkTarget.dataset.bound !== "true") {
      bannerLinkTarget.dataset.bound = "true";

      bannerLinkTarget.addEventListener("change", () => {
        updateBannerActionFieldsVisibility();
      });
    }

    if (homeBannerForm && homeBannerForm.dataset.bound !== "true") {
      homeBannerForm.dataset.bound = "true";

      homeBannerForm.addEventListener("submit", handleSaveBanner);
    }

    if (toggleBannerFormBtn && toggleBannerFormBtn.dataset.bound !== "true") {
      toggleBannerFormBtn.dataset.bound = "true";

      toggleBannerFormBtn.addEventListener("click", () => {
        if (!homeBannerForm) return;

        const isOpen = !homeBannerForm.classList.contains("hidden");

        if (isOpen) {
          homeBannerForm.reset();
          setBannerFormCreateMode();
          hideBannerForm();
          return;
        }

        homeBannerForm.reset();
        setBannerFormCreateMode();
        showBannerForm();

        setTimeout(() => {
          homeBannerForm.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }, 180);
      });
    }

    if (cancelBannerEditBtn && cancelBannerEditBtn.dataset.bound !== "true") {
      cancelBannerEditBtn.dataset.bound = "true";

      cancelBannerEditBtn.addEventListener("click", () => {
        cancelBannerEdit();
      });
    }

    if (cancelBannerEditBtnBottom && cancelBannerEditBtnBottom.dataset.bound !== "true") {
      cancelBannerEditBtnBottom.dataset.bound = "true";

      cancelBannerEditBtnBottom.addEventListener("click", () => {
        cancelBannerEdit();
        hideBannerForm();
      });
    }
  }

  function bindNavigationEvents() {
    document.querySelectorAll(".admin-sidebar-link").forEach((link) => {
      if (link.dataset.bound === "true") return;

      link.dataset.bound = "true";

      link.addEventListener("click", async (event) => {
        const action = getSidebarActionFromLink(link);

        if (!action) return;

        event.preventDefault();

        await handleSidebarAction(action, true);
      });
    });

    if (toggleCreateClientBtn && toggleCreateClientBtn.dataset.bound !== "true") {
      toggleCreateClientBtn.dataset.bound = "true";

      toggleCreateClientBtn.addEventListener("click", () => {
        openCreateClientFromQuickAction();
      });
    }

    if (toggleClientsListBtn && toggleClientsListBtn.dataset.bound !== "true") {
      toggleClientsListBtn.dataset.bound = "true";

      toggleClientsListBtn.addEventListener("click", async () => {
        await openClientsFromQuickAction();
      });
    }

    if (toggleHomeBannersBtn && toggleHomeBannersBtn.dataset.bound !== "true") {
      toggleHomeBannersBtn.dataset.bound = "true";

      toggleHomeBannersBtn.addEventListener("click", async () => {
        await openBannersFromQuickAction();
      });
    }

    if (dashboardQuickNewClientBtn && dashboardQuickNewClientBtn.dataset.bound !== "true") {
      dashboardQuickNewClientBtn.dataset.bound = "true";

      dashboardQuickNewClientBtn.addEventListener("click", () => {
        openCreateClientFromQuickAction();
      });
    }

    if (dashboardQuickClientsBtn && dashboardQuickClientsBtn.dataset.bound !== "true") {
      dashboardQuickClientsBtn.dataset.bound = "true";

      dashboardQuickClientsBtn.addEventListener("click", async () => {
        await openClientsFromQuickAction();
      });
    }

    if (dashboardQuickCreateBannerBtn && dashboardQuickCreateBannerBtn.dataset.bound !== "true") {
      dashboardQuickCreateBannerBtn.dataset.bound = "true";

      dashboardQuickCreateBannerBtn.addEventListener("click", async () => {
        await openBannersFromQuickAction({
          openForm: true
        });
      });
    }

    if (dashboardQuickBannersBtn && dashboardQuickBannersBtn.dataset.bound !== "true") {
      dashboardQuickBannersBtn.dataset.bound = "true";

      dashboardQuickBannersBtn.addEventListener("click", async () => {
        await openBannersFromQuickAction();
      });
    }
  }

  function bindGeneralEvents() {
    if (logoutBtn && logoutBtn.dataset.bound !== "true") {
      logoutBtn.dataset.bound = "true";

      logoutBtn.addEventListener("click", async () => {
        await logoutAdmin();
      });
    }

    if (sidebarLogoutBtn && sidebarLogoutBtn.dataset.bound !== "true") {
      sidebarLogoutBtn.dataset.bound = "true";

      sidebarLogoutBtn.addEventListener("click", async () => {
        await logoutAdmin();
      });
    }

    if (createClientForm && createClientForm.dataset.bound !== "true") {
      createClientForm.dataset.bound = "true";

      createClientForm.addEventListener("submit", handleCreateClient);
    }

    if (copyTemporaryPasswordBtn && copyTemporaryPasswordBtn.dataset.bound !== "true") {
      copyTemporaryPasswordBtn.dataset.bound = "true";

      copyTemporaryPasswordBtn.addEventListener("click", copyTemporaryPassword);
    }

    if (clientsQuickCreateBtn && clientsQuickCreateBtn.dataset.bound !== "true") {
      clientsQuickCreateBtn.dataset.bound = "true";

      clientsQuickCreateBtn.addEventListener("click", () => {
        openCreateClientFromQuickAction();
      });
    }

    if (cpfCnpjInput && cpfCnpjInput.dataset.bound !== "true") {
      cpfCnpjInput.dataset.bound = "true";

      cpfCnpjInput.addEventListener("input", () => {
        cpfCnpjInput.value = formatCpfCnpj(cpfCnpjInput.value);
      });
    }

    if (phoneInput && phoneInput.dataset.bound !== "true") {
      phoneInput.dataset.bound = "true";

      phoneInput.addEventListener("input", () => {
        phoneInput.value = formatPhone(phoneInput.value);
      });
    }

    if (whatsappInput && whatsappInput.dataset.bound !== "true") {
      whatsappInput.dataset.bound = "true";

      whatsappInput.addEventListener("input", () => {
        whatsappInput.value = formatPhone(whatsappInput.value);
      });
    }

    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-document-menu-toggle]") && !event.target.closest("[data-document-actions]")) {
        closeAllDocumentMenus();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAllDocumentMenus();

        if (isAdminActionModalOpen()) {
          closeAdminActionModal(false);
        }

        if (isCreateClientModalOpen()) {
          hideCreateClientForm();
        }
      }
    });
  }

  function validateAdminAccess() {
    const role = String(profile?.role || "").toLowerCase();

    if (role !== "admin") {
      clearAdminSession();
      window.location.href = "login.html";
      return false;
    }

    if (!enforceAdminSessionLimit()) {
      return false;
    }

    return true;
  }

  async function loadInitialDashboardData() {
    await Promise.allSettled([
      fetchDashboardSummary(),
      fetchClients(),
      fetchHomeBanners(),
      fetchRenewalAlerts(),
      fetchRecentActivities()
    ]);
  }

  async function initializeAdminPanel() {
    if (!validateAdminAccess()) {
      return;
    }

    bindAdminActionModalEvents();
    bindCreateClientModalEvents();
    bindNavigationEvents();
    bindGeneralEvents();
    bindClientFilters();
    bindRenewalFilters();
    bindBannerEvents();

    loadAdminInfo();

    setBannerFormCreateMode();
    updateBannerActionFieldsVisibility();

    scheduleAdminMaxSessionExpiration();
    scheduleAdminSessionRefresh();

    await loadInitialDashboardData();
    await applyInitialHashNavigation();
  }

  try {
    await initializeAdminPanel();
  } catch (error) {
    console.error("ERRO AO INICIAR PAINEL ADMINISTRATIVO:", error);

    await showAdminActionMessage({
      type: "danger",
      title: "Erro ao carregar painel",
      message: error.message || "Não foi possível carregar o painel administrativo.",
      confirmText: "OK"
    });
  }
});