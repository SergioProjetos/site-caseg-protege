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

/* ===============================
   SESSÃO
================================ */
function getSavedProfile() {
  try {
    return JSON.parse(localStorage.getItem("profile"));
  } catch (error) {
    return null;
  }
}

function clearSessionAndRedirect(message = "Sessão inválida. Faça login novamente.") {
  localStorage.removeItem("access_token");
  localStorage.removeItem("profile");
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
const savedAccessToken = localStorage.getItem("access_token");
const savedProfile = getSavedProfile();

if (!savedAccessToken || !savedProfile) {
  clearSessionAndRedirect("Sessão inválida. Faça login novamente.");
}

if (savedProfile.role !== "client") {
  clearSessionAndRedirect("Acesso não permitido.");
}

if (savedProfile.must_change_password !== true) {
  window.location.href = "servicos.html";
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

    setMessage("Salvando nova senha...", "info");

    try {
      const response = await fetch("http://localhost:3000/update-password", {
        method: "PUT",
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
        setMessage(data.error || "Erro ao atualizar a senha.", "error");
        return;
      }

      const updatedProfile = {
        ...savedProfile,
        must_change_password: false
      };

      localStorage.setItem("profile", JSON.stringify(updatedProfile));

      setMessage("Senha atualizada com sucesso! Redirecionando para o login...", "success");

      setTimeout(() => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("profile");
        window.location.href = "login.html";
      }, 1800);

    } catch (error) {
      console.error("Erro ao atualizar senha:", error);
      setMessage("Erro ao conectar com o servidor.", "error");
    }
  });
}

/* ===============================
   INIT
================================ */
updatePasswordStrengthRules();
hidePasswordMismatch();