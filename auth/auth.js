(() => {
  const AUTH_USERNAME_B64 = "cml5YWNhcmdv";
  const AUTH_PASSWORD_B64 = "MTIzNDU2";
  const AUTH_SESSION_KEY = "miraAuthSession";
  const AUTH_EXPIRY_KEY = "miraAuthExpiry";
  const AUTH_DURATION_MS = 60 * 60 * 1000;
  const INDEX_URL = "https://workofaditya.github.io/Mira/";
  const INDEX_PATH = new URL(INDEX_URL).pathname;
  let expiryTimer = null;

  const decodeBase64 = value => {
    try {
      return atob(value);
    } catch {
      return "";
    }
  };

  const getExpiry = () => Number(sessionStorage.getItem(AUTH_EXPIRY_KEY));

  const hasValidSession = () => {
    const sessionValue = sessionStorage.getItem(AUTH_SESSION_KEY);
    const expiry = getExpiry();
    return sessionValue === "active" && Number.isFinite(expiry) && Date.now() < expiry;
  };

  const clearSession = () => {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(AUTH_EXPIRY_KEY);
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  };

  const isIndexPage = () =>
    window.location.href === INDEX_URL ||
    window.location.pathname === INDEX_PATH ||
    window.location.pathname === `${INDEX_PATH}index.html`;

  const redirectToLogin = () => {
    const redirectTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const url = new URL(INDEX_URL);
    url.searchParams.set("redirect", redirectTarget);
    window.location.replace(url.toString());
  };

  const scheduleExpiry = () => {
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }

    const expiry = getExpiry();
    if (!Number.isFinite(expiry)) return;

    const remaining = expiry - Date.now();
    if (remaining <= 0) {
      clearSession();
      if (!isIndexPage()) {
        redirectToLogin();
        return;
      }
      showLoginModal();
      return;
    }

    expiryTimer = setTimeout(() => {
      clearSession();
      if (!isIndexPage()) {
        redirectToLogin();
        return;
      }
      showLoginModal();
    }, remaining + 50);
  };

  const createSession = () => {
    const expiry = Date.now() + AUTH_DURATION_MS;
    sessionStorage.setItem(AUTH_SESSION_KEY, "active");
    sessionStorage.setItem(AUTH_EXPIRY_KEY, String(expiry));
    scheduleExpiry();
  };

  const closeModal = () => {
    document.body.classList.remove("auth-locked");
    const modal = document.getElementById("authOverlay");
    if (modal) modal.remove();
  };

  const goToRedirectTarget = () => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    if (!redirect || redirect === "/" || redirect === INDEX_PATH || redirect === `${INDEX_PATH}index.html`) return;
    window.location.replace(redirect);
  };

  function showLoginModal() {
    if (!isIndexPage()) {
      redirectToLogin();
      return;
    }

    const existing = document.getElementById("authOverlay");
    if (existing) existing.remove();

    document.body.classList.add("auth-locked");

    const overlay = document.createElement("div");
    overlay.className = "auth-overlay";
    overlay.id = "authOverlay";
    overlay.innerHTML = `
      <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <h2 id="authTitle">Sign in</h2>
        <p>Enter credentials to continue.</p>
        <label for="authUsername">Username</label>
        <input type="text" id="authUsername" autocomplete="username" />
        <label for="authPassword">Password</label>
        <input type="password" id="authPassword" autocomplete="current-password" />
        <button type="button" id="authLoginBtn">Login</button>
        <div id="authErrorMsg" class="auth-error" aria-live="polite"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const usernameInput = overlay.querySelector("#authUsername");
    const passwordInput = overlay.querySelector("#authPassword");
    const loginBtn = overlay.querySelector("#authLoginBtn");
    const errorMsg = overlay.querySelector("#authErrorMsg");

    const handleLogin = () => {
      const expectedUsername = decodeBase64(AUTH_USERNAME_B64);
      const expectedPassword = decodeBase64(AUTH_PASSWORD_B64);

      if (usernameInput.value.trim() === expectedUsername && passwordInput.value === expectedPassword) {
        createSession();
        closeModal();
        goToRedirectTarget();
        return;
      }

      errorMsg.textContent = "Incorrect username or password.";
      passwordInput.value = "";
      passwordInput.focus();
    };

    loginBtn.addEventListener("click", handleLogin);
    overlay.addEventListener("keydown", event => {
      if (event.key === "Enter") handleLogin();
    });
    usernameInput.focus();
  }

  if (hasValidSession()) {
    scheduleExpiry();
    return;
  }

  if (isIndexPage()) {
    showLoginModal();
  } else {
    redirectToLogin();
  }
})();