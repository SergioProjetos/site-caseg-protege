const firstAccessForm = document.querySelector("#firstAccessForm");
const firstAccessMessage = document.querySelector("#firstAccessMessage");
const newPasswordInput = document.querySelector("#newPassword");
const confirmPasswordInput = document.querySelector("#confirmPassword");
const passwordMismatchMessage = document.querySelector("#passwordMismatchMessage");

const toggleNewPasswordBtn = document.querySelector("#toggleNewPassword");
const toggleConfirmPasswordBtn = document.querySelector("#toggleConfirmPassword");
const eyeIconNewPassword = document.querySelector("#eyeIconNewPassword");
const eyeIconConfirmPassword = document.querySelector("#eyeIconConfirmPassword");

const ruleMinLength = document.querySelector("#ruleMinLength");
const ruleUppercase = document.querySelector("#ruleUppercase");
const ruleNumber = document.querySelector("#ruleNumber");
let isFirstAccessLogoutInProgress = false;
const ADMIN_FIRST_ACCESS_KEY = "caseg_admin_first_access";
const isAdminFirstAccess = sessionStorage.getItem(ADMIN_FIRST_ACCESS_KEY) !== null;
let adminFirstAccessSubmitting = false;
let adminFirstAccessRefreshPromise = null;

function readAdminFirstAccess() {
  try { return JSON.parse(sessionStorage.getItem(ADMIN_FIRST_ACCESS_KEY) || "null"); }
  catch { return null; }
}

async function refreshAdminFirstAccess() {
  if (adminFirstAccessRefreshPromise) return adminFirstAccessRefreshPromise;
  adminFirstAccessRefreshPromise = (async () => {
    const current = readAdminFirstAccess();
    if (!current?.session?.refresh_token || current.submission_started) return { status: 403, data: null };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${window.CASEG_CONFIG.API_BASE_URL}/admin/first-access/refresh-session`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({refresh_token: current.session.refresh_token}), signal: controller.signal
      });
      const data = await response.json();
      if (response.ok) {
        if (data.admin_session || data.profile?.role !== "admin" || data.profile.must_change_password !== true ||
            data.first_access?.required !== true || data.first_access.mode !== "admin" ||
            !data.session?.access_token || !data.session.refresh_token ||
            !Number.isFinite(data.session.expires_at) || data.session.expires_at <= Date.now()/1000 ||
            !Number.isFinite(Date.parse(data.first_access.expires_at)) || Date.parse(data.first_access.expires_at) <= Date.now()) {
          return {status: 502, data: null};
        }
        sessionStorage.setItem(ADMIN_FIRST_ACCESS_KEY, JSON.stringify(data));
        savedAccessToken = data.session.access_token;
        savedProfile = data.profile;
      }
      return {status: response.status, data};
    } catch { return {status: 503, data: null}; }
    finally { clearTimeout(timeout); }
  })();
  try { return await adminFirstAccessRefreshPromise; }
  finally { adminFirstAccessRefreshPromise = null; }
}

const LOGOUT_REQUEST_TIMEOUT_MS = 4000;
const CLIENT_SESSION_REFRESH_TIMEOUT_MS = 8000;
const CLIENT_SESSION_REFRESH_RETRY_DELAY_MS = 1000;

/* ===============================
   SESSÃO
================================ */
async function refreshClientSession() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, CLIENT_SESSION_REFRESH_TIMEOUT_MS);

  try {
    const response = await fetch(`${window.CASEG_CONFIG.API_BASE_URL}/session/refresh`, {
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

function clearFirstAccessSession() {
  if (isAdminFirstAccess) { sessionStorage.removeItem(ADMIN_FIRST_ACCESS_KEY); return; }
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
    const response = await fetch(`${window.CASEG_CONFIG.API_BASE_URL}/logout`, {
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

function clearSessionAndRedirect(message = "Sessão inválida. Faça login novamente.") {
  clearFirstAccessSession();
  alert(message);
  window.location.href = "login.html";
}

function setMessage(message, type = "info") {
  if (!firstAccessMessage) {
    return;
  }

  let color = "#0b6b79";

  if (type === "success") {
    color = "green";
  }

  if (type === "error") {
    color = "red";
  }

  firstAccessMessage.innerHTML = `<span style="color:${color};">${message}</span>`;
}

function showPasswordMismatch(message = "As senhas não coincidem.") {
  if (!passwordMismatchMessage) {
    return;
  }

  passwordMismatchMessage.textContent = message;
  passwordMismatchMessage.style.display = "block";
}

function hidePasswordMismatch() {
  if (!passwordMismatchMessage) {
    return;
  }

  passwordMismatchMessage.style.display = "none";
}

function validatePasswordsMatch() {
  const newPassword = newPasswordInput ? newPasswordInput.value.trim() : "";
  const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value.trim() : "";

  if (!confirmPassword) {
    hidePasswordMismatch();
    return true;
  }

  if (newPassword !== confirmPassword) {
    showPasswordMismatch("As senhas não coincidem.");
    return false;
  }

  hidePasswordMismatch();
  return true;
}

function setupPasswordToggle(button, input, icon) {
  if (!button || !input || !icon) {
    return;
  }

  button.addEventListener("click", function () {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    icon.className = isPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  });
}

function updateRuleStatus(element, isValid) {
  if (!element) {
    return;
  }

  element.classList.remove("valid", "invalid");
  element.classList.add(isValid ? "valid" : "invalid");
}

function validatePasswordStrength(password) {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password)
  };
}

function updatePasswordStrengthRules() {
  const password = newPasswordInput ? newPasswordInput.value : "";
  const rules = validatePasswordStrength(password);

  updateRuleStatus(ruleMinLength, rules.minLength);
  updateRuleStatus(ruleUppercase, rules.uppercase);
  updateRuleStatus(ruleNumber, rules.number);

  return rules;
}

function isPasswordStrongEnough(password) {
  const rules = validatePasswordStrength(password);
  return rules.minLength && rules.uppercase && rules.number;
}

/* ===============================
   VALIDAÇÃO INICIAL
================================ */
let savedAccessToken = "";
let savedProfile = null;
let isFirstAccessSessionReady = false;

async function initializeFirstAccessSession() {
  if (isAdminFirstAccess) {
    const result = await refreshAdminFirstAccess();
    if (result.status !== 200) {
      setMessage(result.status >= 500 ? "Não foi possível validar a sessão. Recarregue para tentar novamente." : "Primeiro acesso indisponível. Faça novo login; se persistir, solicite atendimento ao responsável.", "error");
      return false;
    }
    const name = document.querySelector("#clientName");
    if (name) name.textContent = savedProfile.full_name || "administrador";
    isFirstAccessSessionReady = true;
    return true;
  }
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
      return false;
    }

    savedAccessToken = data.session.access_token;
    savedProfile = data.profile;
  } else if (status === 401 || status === 500) {
    clearSessionAndRedirect();
    return false;
  } else if (status !== 0 && status !== 502) {
    clearSessionAndRedirect();
    return false;
  }

  if (
    typeof savedAccessToken !== "string" ||
    savedAccessToken.length === 0 ||
    !savedProfile
  ) {
    clearSessionAndRedirect("Sessão inválida. Faça login novamente.");
    return false;
  }

  if (savedProfile.role !== "client") {
    clearSessionAndRedirect("Acesso não permitido.");
    return false;
  }

  if (savedProfile.must_change_password !== true) {
    window.location.href = "servicos.html";
    return false;
  }

  const clientNameElement = document.querySelector("#clientName");

  if (clientNameElement) {
    clientNameElement.textContent = savedProfile.full_name || "cliente";
  }

  isFirstAccessSessionReady = true;
  return true;
}

/* ===============================
   MOSTRAR / OCULTAR SENHA
================================ */
setupPasswordToggle(toggleNewPasswordBtn, newPasswordInput, eyeIconNewPassword);
setupPasswordToggle(toggleConfirmPasswordBtn, confirmPasswordInput, eyeIconConfirmPassword);

/* ===============================
   VALIDAÇÃO EM TEMPO REAL
================================ */
if (newPasswordInput) {
  newPasswordInput.addEventListener("input", function () {
    updatePasswordStrengthRules();
    validatePasswordsMatch();
  });
}

if (confirmPasswordInput) {
  confirmPasswordInput.addEventListener("input", validatePasswordsMatch);
}

/* ===============================
   FORMULÁRIO
================================ */
if (firstAccessForm) {
  firstAccessForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!isFirstAccessSessionReady || adminFirstAccessSubmitting) {
      return;
    }

    const newPassword = newPasswordInput ? newPasswordInput.value.trim() : "";
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value.trim() : "";

    hidePasswordMismatch();
    updatePasswordStrengthRules();

    if (!newPassword || !confirmPassword) {
      setMessage("Preencha os dois campos de senha.", "error");
      return;
    }

    if (!isPasswordStrongEnough(newPassword)) {
      setMessage("A senha deve ter no mínimo 8 caracteres, 1 letra maiúscula e 1 número.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showPasswordMismatch("A confirmação da senha está diferente da nova senha.");
      setMessage("Corrija os campos de senha para continuar.", "error");
      return;
    }

    if (isAdminFirstAccess) {
      adminFirstAccessSubmitting = true;
      const current = readAdminFirstAccess();
      if (current?.submission_started) {
        setMessage("Uma troca anterior tem resultado incerto. Faça novo login; se persistir, solicite atendimento.", "error");
        return;
      }
      if (!current || current.session.expires_at <= Date.now()/1000 + 60) {
        const refreshed = await refreshAdminFirstAccess();
        if (refreshed.status !== 200) {
          adminFirstAccessSubmitting = false;
          setMessage("Não foi possível renovar o primeiro acesso. Seus campos foram preservados.", "error");
          return;
        }
      }
      sessionStorage.setItem(ADMIN_FIRST_ACCESS_KEY, JSON.stringify({...readAdminFirstAccess(), submission_started:true}));
    }
    setMessage("Salvando nova senha...", "info");

    const updateController = isAdminFirstAccess ? new AbortController() : null;
    const updateTimeout = updateController ? setTimeout(() => updateController.abort(), 10000) : null;
    try {
      const response = await fetch(`${window.CASEG_CONFIG.API_BASE_URL}/update-password`, {
        ...(updateController ? {signal:updateController.signal} : {}),
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${savedAccessToken}`
        },
        body: JSON.stringify({
          new_password: newPassword
        })
      });

      const data = await response.json();

      if (response.status === 401) {
        clearSessionAndRedirect("Sua sessão expirou. Faça login novamente.");
        return;
      }

      if (!response.ok) {
        if (isAdminFirstAccess && response.status === 400) {
          const current = readAdminFirstAccess();
          if (current) { delete current.submission_started; sessionStorage.setItem(ADMIN_FIRST_ACCESS_KEY, JSON.stringify(current)); }
          adminFirstAccessSubmitting = false;
        }
        setMessage(data.error || "Erro ao atualizar a senha.", "error");
        return;
      }

      if (isFirstAccessLogoutInProgress) {
        return;
      }

      isFirstAccessLogoutInProgress = true;

      setMessage("Senha atualizada com sucesso! Redirecionando para o login...", "success");

      setTimeout(async () => {
        let accessToken = "";

        try {
          localStorage.setItem("password_updated", "true");
          accessToken = savedAccessToken || "";
          if (!isAdminFirstAccess) await attemptRemoteLogout(accessToken);
        } finally {
          clearFirstAccessSession();
          window.location.href = "login.html";
          isFirstAccessLogoutInProgress = false;
        }
      }, 1800);

    } catch (error) {
      console.error("Erro ao atualizar senha:", error);
      setMessage(isAdminFirstAccess ? "Resultado da troca não confirmado. Não reenvie automaticamente; faça novo login ou solicite atendimento." : "Erro ao conectar com o servidor.", "error");
    } finally {
      if (updateTimeout !== null) clearTimeout(updateTimeout);
    }
  });
}

/* ===============================
   INIT
================================ */
updatePasswordStrengthRules();
hidePasswordMismatch();
initializeFirstAccessSession();