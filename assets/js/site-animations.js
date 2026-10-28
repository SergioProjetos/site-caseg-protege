document.addEventListener("DOMContentLoaded", function () {
    const ADMIN_SESSION_STATE_KEY = "caseg_admin_session_state";

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

    function hasAdminNavigationHint() {
        const profile = getStoredProfile();
        const role = String(profile?.role || "").toLowerCase();

        if (role !== "admin") {
            return false;
        }

        const accessToken = localStorage.getItem("access_token");
        const refreshToken = localStorage.getItem("refresh_token");
        if (!accessToken && !refreshToken) {
            return false;
        }

        // Navigation hint only. Backend/admin.js enforce authorization and inactivity.
        // This shared presentation script must never clear or renew authentication.
        try {
            const state = JSON.parse(localStorage.getItem(ADMIN_SESSION_STATE_KEY) || "null");
            return typeof state?.session_id === "string" &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state.session_id) &&
                typeof state.version === "string" && /^[1-9][0-9]{0,18}$/.test(state.version);
        } catch (error) {
            return false;
        }
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
        if (!hasAdminNavigationHint()) {
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