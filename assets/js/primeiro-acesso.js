const firstAccessForm = document.querySelector("#firstAccessForm");
const firstAccessMessage = document.querySelector("#firstAccessMessage");

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

/* ===============================
   VALIDAÇÃO INICIAL
================================ */
const token = localStorage.getItem("access_token");
const profile = getSavedProfile();

if (!token || !profile) {
  clearSessionAndRedirect("Sessão inválida. Faça login novamente.");
}

if (profile.role !== "client") {
  clearSessionAndRedirect("Acesso não permitido.");
}

if (profile.must_change_password !== true) {
  window.location.href = "servicos.html";
}

/* ===============================
   FORMULÁRIO
================================ */
if (firstAccessForm) {
  firstAccessForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const newPassword = document.querySelector("#newPassword").value.trim();
    const confirmPassword = document.querySelector("#confirmPassword").value.trim();

    if (!newPassword || !confirmPassword) {
      setMessage("Preencha os dois campos de senha.", "error");
      return;
    }

    if (newPassword.length < 6) {
      setMessage("A nova senha deve ter pelo menos 6 caracteres.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("As senhas não coincidem.", "error");
      return;
    }

    setMessage("Salvando nova senha...", "info");

    try {
      const response = await fetch("http://localhost:3000/update-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
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
        ...profile,
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