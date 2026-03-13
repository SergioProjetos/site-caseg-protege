const profile = JSON.parse(localStorage.getItem("profile"));

if (!profile) {
  alert("Sessão inválida. Faça login novamente.");
  window.location.href = "login.html";
}

const welcomeMessage = document.querySelector("#welcomeMessage");
const companyName = document.querySelector("#companyName");
const documentsList = document.querySelector("#documentsList");
const noticesList = document.querySelector("#noticesList");
const logoutBtn = document.querySelector("#logoutBtn");

function loadClientInfo() {
  if (profile) {
    welcomeMessage.innerText = "Bem-vindo, " + profile.full_name;
    companyName.innerText = "Empresa: " + profile.company_name;
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", function () {
    localStorage.removeItem("access_token");
    localStorage.removeItem("profile");

    alert("Você saiu do sistema.");
    window.location.href = "login.html";
  });
}

async function loadDocuments() {

  if (!profile) return;

  if (documentsList) {
    documentsList.innerHTML = "<p class='loading-message'>Carregando documentos...</p>";
  }

  try {

    const response = await fetch(
      `http://localhost:3000/documents/${profile.user_id}`
    );

    const documents = await response.json();

    console.log("DOCUMENTOS DO CLIENTE:", documents);

    const documentsContainer = document.querySelector("#documentsList");

    if (!documentsContainer) return;

    if (!documents.length) {
      documentsContainer.innerHTML = "<p class='empty-message'>Nenhum documento disponível no momento.</p>";
      return;
    }

    const groupedByCategory = {};

    documents.forEach(doc => {
      if (!groupedByCategory[doc.category]) {
        groupedByCategory[doc.category] = [];
      }

      groupedByCategory[doc.category].push(doc);
    });

    const groupedBySubcategory = {};

    Object.keys(groupedByCategory).forEach(category => {

      groupedBySubcategory[category] = {};

      groupedByCategory[category].forEach(doc => {

        const subcategory = doc.subcategory ? doc.subcategory : null;

        if (!groupedBySubcategory[category][subcategory]) {
          groupedBySubcategory[category][subcategory] = [];
        }

        groupedBySubcategory[category][subcategory].push(doc);

      });

    });

    const groupedByYear = {};

    Object.keys(groupedBySubcategory).forEach(category => {

      groupedByYear[category] = {};

      Object.keys(groupedBySubcategory[category]).forEach(subcategory => {

        groupedByYear[category][subcategory] = {};

        groupedBySubcategory[category][subcategory].forEach(doc => {

          const year = doc.year;

          if (!groupedByYear[category][subcategory][year]) {
            groupedByYear[category][subcategory][year] = [];
          }

          groupedByYear[category][subcategory][year].push(doc);

        });

      });

    });

    documentsContainer.innerHTML = "";

    Object.keys(groupedByYear).forEach(category => {

      const categoryHTML = `
        <div class="doc-category">
          <button class="doc-category-toggle">${category}</button>
          <div class="doc-subcategories"></div>
        </div>
      `;

      documentsContainer.innerHTML += categoryHTML;

      const subcategoriesContainer =
        documentsContainer.lastElementChild.querySelector(".doc-subcategories");

      Object.keys(groupedByYear[category]).forEach(subcategory => {

        let yearsContainer;

        if (subcategory === null) {

          const yearsOnlyHTML = `
            <div class="doc-years"></div>
          `;

          subcategoriesContainer.innerHTML += yearsOnlyHTML;

          yearsContainer = subcategoriesContainer.lastElementChild;

        } else {

          const subcategoryHTML = `
            <div class="doc-subcategory">
              <button class="doc-subcategory-toggle">${subcategory}</button>
              <div class="doc-years"></div>
            </div>
          `;

          subcategoriesContainer.innerHTML += subcategoryHTML;

          yearsContainer =
            subcategoriesContainer.lastElementChild.querySelector(".doc-years");

        }

        Object.keys(groupedByYear[category][subcategory]).forEach(year => {

          const yearHTML = `
            <div class="doc-year">
              <button class="doc-year-toggle">${year}</button>
              <div class="doc-files"></div>
            </div>
          `;

          yearsContainer.innerHTML += yearHTML;

          const filesContainer =
            yearsContainer.lastElementChild.querySelector(".doc-files");

          groupedByYear[category][subcategory][year].forEach(doc => {

            const fileHTML = `
              <ul>
                <li>
                  <a href="#" class="doc-file-link" data-path="${doc.file_path}">
                    ${doc.file_name}
                  </a>
                </li>
              </ul>
            `;

            filesContainer.innerHTML += fileHTML;

          });

        });

      });

    });

    setupDocumentToggles();
    setupDocumentLinks();

  } catch (error) {

    console.error("Erro ao buscar documentos:", error);

    if (documentsList) {
      documentsList.innerHTML = "<p class='empty-message'>Erro ao carregar documentos.</p>";
    }

  }

}

function setupDocumentToggles() {

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

}

function setupDocumentLinks() {

  const fileLinks = document.querySelectorAll(".doc-file-link");

  fileLinks.forEach(link => {

    link.addEventListener("click", (event) => {

      event.preventDefault();

      const filePath = link.dataset.path;

      console.log("CLICOU NO ARQUIVO:", filePath);

    });

  });

}

function loadNotices() {

  if (noticesList) {

    noticesList.innerHTML = "<p class='loading-message'>Carregando avisos...</p>";

    setTimeout(() => {

      noticesList.innerHTML = "<p class='empty-message'>Nenhum aviso disponível no momento.</p>";

    }, 1000);

  }

}

function initClientPanel() {

  loadClientInfo();
  loadNotices();

}

initClientPanel();
loadDocuments();