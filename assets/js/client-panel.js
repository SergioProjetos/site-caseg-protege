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
  // loadDocuments();
  loadNotices();
}

initClientPanel();
const categoryButtons = document.querySelectorAll(".doc-category-toggle");

categoryButtons.forEach(button => {
  button.addEventListener("click", () => {
    const subcategories = button.nextElementSibling;

    if (subcategories.style.display === "block") {
      subcategories.style.display = "none";
    } else {
      subcategories.style.display = "block";
    }
  });
});
const subcategoryButtons = document.querySelectorAll(".doc-subcategory-toggle");

subcategoryButtons.forEach(button => {
  button.addEventListener("click", () => {
    const years = button.nextElementSibling;

    if (years.style.display === "block") {
      years.style.display = "none";
    } else {
      years.style.display = "block";
    }
  });
});
const yearButtons = document.querySelectorAll(".doc-year-toggle");

yearButtons.forEach(button => {
  button.addEventListener("click", () => {
    const files = button.nextElementSibling;

    if (files.style.display === "block") {
      files.style.display = "none";
    } else {
      files.style.display = "block";
    }
  });
});
async function loadDocuments() {

  const profile = JSON.parse(localStorage.getItem("profile"));

  if (!profile) return;

  try {

    const response = await fetch(
      `http://localhost:3000/documents/${profile.user_id}`
    );

    const documents = await response.json();

    console.log("DOCUMENTOS DO CLIENTE:", documents);

  } catch (error) {
    console.error("Erro ao buscar documentos:", error);
  }

}

loadDocuments();