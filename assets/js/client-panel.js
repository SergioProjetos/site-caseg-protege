const profile = JSON.parse(localStorage.getItem("profile"));

if (!profile) {
  alert("Sessão inválida. Faça login novamente.");
  window.location.href = "login.html";
}

const welcomeMessage = document.querySelector("#welcomeMessage");
const companyName = document.querySelector("#companyName");
const documentsList = document.querySelector("#documentsList");
const noticesList = document.querySelector("#noticesList");

function loadClientInfo() {
  if (profile) {
    welcomeMessage.innerText = "Bem-vindo, " + profile.full_name;
    companyName.innerText = "Empresa: " + profile.company_name;
  }
}

const logoutBtn = document.querySelector("#logoutBtn");

logoutBtn.addEventListener("click", function () {
  localStorage.removeItem("access_token");
  localStorage.removeItem("profile");

  alert("Você saiu do sistema.");
  window.location.href = "login.html";
});

// TESTE DO CARD DOCUMENTOS
function loadDocuments() {
  if (documentsList) {
    documentsList.innerHTML = "<p class='loading-message'>Carregando documentos...</p>";

    setTimeout(() => {
      documentsList.innerHTML = "<p class='empty-message'>Nenhum documento disponível no momento.</p>";
    }, 1000);
  }
}


// TESTE DO CARD AVISOS
function loadNotices() {
  if (noticesList) {
    noticesList.innerHTML = "<p class='loading-message'>Carregando avisos...</p>";

    setTimeout(() => {
      noticesList.innerHTML = "<p class='empty-message'>Nenhum aviso disponível no momento.</p>";
    }, 1000);
  }
}

function initClientPanel() {
  loadDocuments();
  loadNotices();
}

initClientPanel();