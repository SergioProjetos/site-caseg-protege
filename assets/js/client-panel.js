const profile = JSON.parse(localStorage.getItem("profile"));

if (!profile) {
  alert("Sessão inválida. Faça login novamente.");
  window.location.href = "login.html";
}

const welcomeMessage = document.querySelector("#welcomeMessage");
const companyName = document.querySelector("#companyName");
const documentsList = document.querySelector("#documentsList");
const logoutBtn = document.querySelector("#logoutBtn");

/* ===============================
   SESSÃO
================================ */
function clearSessionAndRedirect(message = "Sua sessão expirou. Faça login novamente.") {
  localStorage.removeItem("access_token");
  localStorage.removeItem("profile");
  alert(message);
  window.location.href = "login.html";
}

/* ===============================
   INFORMAÇÕES DO CLIENTE
================================ */
function loadClientInfo() {
  if (profile) {
    welcomeMessage.innerText = "Bem-vindo, " + profile.full_name;
    companyName.innerText = "Empresa: " + profile.company_name;
  }
}

/* ===============================
   LOGOUT
================================ */
if (logoutBtn) {
  logoutBtn.addEventListener("click", function () {
    localStorage.removeItem("access_token");
    localStorage.removeItem("profile");

    alert("Você saiu do sistema.");
    window.location.href = "login.html";
  });
}

/* ===============================
   DOCUMENTOS
================================ */
async function loadDocuments() {
  if (!profile) return;

  const token = localStorage.getItem("access_token");

  console.log("PROFILE SALVO:", profile);
  console.log("TOKEN ENCONTRADO:", token ? "SIM" : "NÃO");

  if (!token) {
    clearSessionAndRedirect("Sessão inválida. Faça login novamente.");
    return;
  }

  if (documentsList) {
    documentsList.innerHTML =
      "<p class='loading-message'>Carregando documentos...</p>";
  }

  try {
    const response = await fetch("http://localhost:3000/documents", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log("STATUS /documents:", response.status);

    const documents = await response.json();

    console.log("DOCUMENTOS DO CLIENTE:", documents);

    const documentsContainer = document.querySelector("#documentsList");

    if (!documentsContainer) return;

    if (response.status === 401) {
      clearSessionAndRedirect("Sua sessão expirou. Faça login novamente.");
      return;
    }

    if (!response.ok) {
      documentsContainer.innerHTML =
        `<p class='empty-message'>${documents.error || "Erro ao carregar documentos."}</p>`;
      return;
    }

    if (!Array.isArray(documents) || documents.length === 0) {
      documentsContainer.innerHTML =
        "<p class='empty-message'>Nenhum documento disponível no momento.</p>";
      return;
    }

    const groupedByCategory = {};

    documents.forEach((doc) => {
      if (!groupedByCategory[doc.category]) {
        groupedByCategory[doc.category] = [];
      }
      groupedByCategory[doc.category].push(doc);
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
          const year = doc.year;

          if (!groupedByYear[category][subcategory][year]) {
            groupedByYear[category][subcategory][year] = [];
          }

          groupedByYear[category][subcategory][year].push(doc);
        });
      });
    });

    documentsContainer.innerHTML = "";

    Object.keys(groupedByYear).forEach((category) => {
      const categoryElement = document.createElement("div");
      categoryElement.className = "doc-category";

      const categoryButton = document.createElement("button");
      categoryButton.className = "doc-category-toggle";
      categoryButton.textContent = category;

      const subcategoriesContainer = document.createElement("div");
      subcategoriesContainer.className = "doc-subcategories";

      categoryElement.appendChild(categoryButton);
      categoryElement.appendChild(subcategoriesContainer);
      documentsContainer.appendChild(categoryElement);

      Object.keys(groupedByYear[category]).forEach((subcategory) => {
        let yearsContainer;

        if (subcategory === "null") {
          yearsContainer = document.createElement("div");
          yearsContainer.className = "doc-years";
          yearsContainer.style.display = "block";
          subcategoriesContainer.appendChild(yearsContainer);
        } else {
          const subcategoryElement = document.createElement("div");
          subcategoryElement.className = "doc-subcategory";

          const subcategoryButton = document.createElement("button");
          subcategoryButton.className = "doc-subcategory-toggle";
          subcategoryButton.textContent = subcategory;

          yearsContainer = document.createElement("div");
          yearsContainer.className = "doc-years";

          subcategoryElement.appendChild(subcategoryButton);
          subcategoryElement.appendChild(yearsContainer);
          subcategoriesContainer.appendChild(subcategoryElement);
        }

        Object.keys(groupedByYear[category][subcategory]).forEach((year) => {
          const yearElement = document.createElement("div");
          yearElement.className = "doc-year";

          const yearButton = document.createElement("button");
          yearButton.className = "doc-year-toggle";
          yearButton.textContent = year;

          const filesContainer = document.createElement("div");
          filesContainer.className = "doc-files";

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

  } catch (error) {
    console.error("Erro ao buscar documentos:", error);

    if (documentsList) {
      documentsList.innerHTML =
        "<p class='empty-message'>Erro ao carregar documentos.</p>";
    }
  }
}

/* ===============================
   TOGGLES (ABRIR/FECHAR)
================================ */
function setupDocumentToggles() {
  const categoryButtons = document.querySelectorAll(".doc-category-toggle");

  categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const subcategories = button.nextElementSibling;

      subcategories.style.display =
        subcategories.style.display === "block" ? "none" : "block";
    });
  });

  const subcategoryButtons = document.querySelectorAll(".doc-subcategory-toggle");

  subcategoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const years = button.nextElementSibling;

      years.style.display =
        years.style.display === "block" ? "none" : "block";
    });
  });

  const yearButtons = document.querySelectorAll(".doc-year-toggle");

  yearButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const files = button.nextElementSibling;

      files.style.display =
        files.style.display === "block" ? "none" : "block";
    });
  });
}

/* ===============================
   DOWNLOAD DOCUMENTOS
================================ */
function setupDocumentLinks() {
  const fileLinks = document.querySelectorAll(".doc-file-link");
  const token = localStorage.getItem("access_token");

  fileLinks.forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();

      const documentId = link.dataset.documentId;

      console.log("DOCUMENT ID CLICADO:", documentId);

      try {
        const response = await fetch(
          "http://localhost:3000/documents/download",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ document_id: documentId })
          }
        );

        console.log("STATUS /documents/download:", response.status);

        const data = await response.json();

        console.log("RESPOSTA DOWNLOAD:", data);

        if (response.status === 401) {
          clearSessionAndRedirect("Sua sessão expirou. Faça login novamente.");
          return;
        }

        if (!response.ok) {
          alert(data.error || "Erro ao gerar link do documento.");
          return;
        }

        if (data.url) {
          window.open(data.url, "_blank");
        } else {
          alert("Nenhuma URL foi retornada para o documento.");
        }
      } catch (error) {
        console.error("Erro ao gerar link do documento:", error);
      }
    });
  });
}

/* ===============================
   INIT
================================ */
function initClientPanel() {
  loadClientInfo();
  loadDocuments();
}

initClientPanel();