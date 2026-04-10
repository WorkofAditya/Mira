(function () {
  const USERNAME = atob("cml5YWNhcmdv");
  const PASSWORD = atob("MTIzNDU2");
  const AUTH_KEY = "mira_auth_session";
  const SESSION_TTL_MS = 60 * 60 * 1000;

  function readSession() {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;

    try {
      const session = JSON.parse(raw);
      if (!session || typeof session.expiresAt !== "number") return null;
      return session;
    } catch {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(AUTH_KEY);
  }

  function isAuthenticated() {
    const session = readSession();
    if (!session) return false;
    if (Date.now() >= session.expiresAt) {
      clearSession();
      return false;
    }
    return true;
  }

  function persistSession() {
    sessionStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        expiresAt: Date.now() + SESSION_TTL_MS
      })
    );
  }

  function showLogin() {
    if (document.getElementById("miraAuthOverlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "mira-auth-overlay";
    overlay.id = "miraAuthOverlay";
    overlay.innerHTML = `
      <form class="mira-auth-card" id="miraAuthForm" autocomplete="off">
        <h2>Login Required</h2>
        <div class="mira-auth-row">
          <label for="miraAuthUser">Username</label>
          <input id="miraAuthUser" type="text" required />
        </div>
        <div class="mira-auth-row">
          <label for="miraAuthPass">Password</label>
          <input id="miraAuthPass" type="password" required />
        </div>
        <div class="mira-auth-error" id="miraAuthError"></div>
        <button class="mira-auth-submit" type="submit">Login</button>
      </form>
    `;

    document.body.appendChild(overlay);
    const form = document.getElementById("miraAuthForm");
    const userInput = document.getElementById("miraAuthUser");
    const passInput = document.getElementById("miraAuthPass");
    const error = document.getElementById("miraAuthError");

    form.addEventListener("submit", event => {
      event.preventDefault();

      const user = String(userInput.value || "").trim();
      const pass = String(passInput.value || "");

      if (user === USERNAME && pass === PASSWORD) {
        persistSession();
        overlay.remove();
        scheduleExpiryCheck();
      } else {
        error.textContent = "Invalid username or password.";
      }
    });

    userInput.focus();
  }

  function scheduleExpiryCheck() {
    const session = readSession();
    if (!session) return;

    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      clearSession();
      showLogin();
      return;
    }

    window.setTimeout(() => {
      clearSession();
      showLogin();
    }, remaining);
  }

  function initAuth() {
    if (isAuthenticated()) {
      scheduleExpiryCheck();
      return;
    }
    showLogin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuth);
  } else {
    initAuth();
  }
})();
