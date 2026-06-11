document.addEventListener("DOMContentLoaded", function () {
    const ADMIN_SESSION_EXPIRES_AT_KEY = "admin_session_expires_at";

    function showRevealAnimations() {
        const elements = document.querySelectorAll(".reveal-on-load, .reveal-fade");

        if (!elements.length) return;

        requestAnimationFrame(() => {
            elements.forEach((element) => {
                element.classList.add("is-visible");
            });
        });
    }

    function getStoredProfile() {
        try {
            return JSON.parse(localStorage.getItem("profile") || "{}");
        } catch (error) {
            return {};
        }
    }

    function clearStoredSession() {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("session_expires_at");
        localStorage.removeItem("session_expires_in");
        localStorage.removeItem("profile");
        localStorage.removeItem(ADMIN_SESSION_EXPIRES_AT_KEY);
    }

    function isAdminSessionValid() {
        const profile = getStoredProfile();
        const role = String(profile.role || "").toLowerCase();

        if (role !== "admin") {
            return false;
        }

        const accessToken = localStorage.getItem("access_token");
        const refreshToken = localStorage.getItem("refresh_token");
        const adminExpiresAt = Number(localStorage.getItem(ADMIN_SESSION_EXPIRES_AT_KEY) || 0);

        if (!accessToken && !refreshToken) {
            return false;
        }

        if (!adminExpiresAt || !Number.isFinite(adminExpiresAt)) {
            return false;
        }

        return Date.now() <= adminExpiresAt;
    }

    function clearExpiredAdminSessionIfNeeded() {
        const profile = getStoredProfile();
        const role = String(profile.role || "").toLowerCase();

        if (role !== "admin") {
            return;
        }

        const adminExpiresAt = Number(localStorage.getItem(ADMIN_SESSION_EXPIRES_AT_KEY) || 0);

        if (adminExpiresAt && Number.isFinite(adminExpiresAt) && Date.now() <= adminExpiresAt) {
            return;
        }

        clearStoredSession();
    }

    function getAdminPagePath() {
        const path = String(window.location.pathname || "");

        if (path.includes("/pages/")) {
            return "admin.html";
        }

        return "pages/admin.html";
    }

    function normalizeText(value) {
        return String(value || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    function findTopLoginButton() {
        const header = document.querySelector(".site-header") || document.querySelector("header");

        if (!header) {
            return null;
        }

        const buttonByClass = header.querySelector(".header-login-button");

        if (buttonByClass) {
            return buttonByClass;
        }

        const headerLinks = Array.from(header.querySelectorAll("a"));

        return headerLinks.find((link) => {
            const href = String(link.getAttribute("href") || "").toLowerCase();
            const text = normalizeText(link.textContent || "");

            return href.includes("login.html") || text === "entrar";
        }) || null;
    }

    function applyAdminIconButtonStyle(loginButton) {
        if (!loginButton) return;

        loginButton.style.setProperty("width", "36px", "important");
        loginButton.style.setProperty("min-width", "36px", "important");
        loginButton.style.setProperty("max-width", "36px", "important");
        loginButton.style.setProperty("height", "36px", "important");
        loginButton.style.setProperty("min-height", "36px", "important");
        loginButton.style.setProperty("padding", "0", "important");
        loginButton.style.setProperty("gap", "0", "important");
        loginButton.style.setProperty("display", "inline-flex", "important");
        loginButton.style.setProperty("align-items", "center", "important");
        loginButton.style.setProperty("justify-content", "center", "important");
        loginButton.style.setProperty("flex", "0 0 36px", "important");
        loginButton.style.setProperty("box-sizing", "border-box", "important");
        loginButton.style.setProperty("border-radius", "8px", "important");

        const icon = loginButton.querySelector("i");

        if (icon) {
            icon.style.setProperty("font-size", "15px", "important");
            icon.style.setProperty("line-height", "1", "important");
            icon.style.setProperty("margin", "0", "important");
        }
    }

    function updateTopLoginButtonForAdmin() {
        clearExpiredAdminSessionIfNeeded();

        if (!isAdminSessionValid()) {
            return;
        }

        const loginButton = findTopLoginButton();

        if (!loginButton) {
            return;
        }

        loginButton.href = getAdminPagePath();
        loginButton.innerHTML = '<i class="fa-regular fa-user" aria-hidden="true"></i>';
        loginButton.setAttribute("aria-label", "Abrir painel administrativo");
        loginButton.setAttribute("title", "Abrir painel administrativo");
        loginButton.classList.add("admin-user-only-button");

        applyAdminIconButtonStyle(loginButton);
    }

    showRevealAnimations();
    updateTopLoginButtonForAdmin();
});