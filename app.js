// ============================================================================
// Variables de Estado y Configuración
// ============================================================================
let currentUser = null;
let rotationTimer = 120;
let countdownInterval = null;
let syncInterval = null;
let lastKnownSecretHash = null;

function getBackendUrl() {
  if (window._env_ && window._env_.API_URL) {
    return window._env_.API_URL.replace(/\/api\/data$/, "");
  }
  return "http://localhost:5000";
}

function getApiKey() {
  if (window._env_ && window._env_.API_KEY) {
    return window._env_.API_KEY;
  }
  return "INITIAL-SECRET-2026-KEY";
}

// ============================================================================
// Inicialización y Carga de Entorno en Caliente
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Comprobar sesión previa en sessionStorage
  const savedUser = sessionStorage.getItem("vault_ldap_user");
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      showDashboard();
    } catch (e) {
      sessionStorage.removeItem("vault_ldap_user");
    }
  }

  // Iniciar temporizador de rotación
  startCountdownTimer();

  // Iniciar sincronización periódica cada 3 segundos
  syncInterval = setInterval(() => {
    reloadEnvConfig();
    if (currentUser) {
      fetchSystemStatus();
    }
  }, 3000);

  addLog("Frontend inicializado. Escuchando rotación de secretos cada 120 segundos.", "info");
});

/**
 * Recarga dinámicamente env-config.js sin almacenar en caché
 */
function reloadEnvConfig() {
  const oldScript = document.getElementById("env-script");
  const newScript = document.createElement("script");
  newScript.id = "env-script";
  newScript.src = `env-config.js?_t=${Date.now()}`;
  
  newScript.onload = () => {
    const currentKey = getApiKey();
    const keyHash = sha256_truncate(currentKey);

    const feValEl = document.getElementById("fe-secret-val");
    const feHashEl = document.getElementById("fe-secret-hash");
    
    if (feValEl) feValEl.textContent = currentKey;
    if (feHashEl) feHashEl.textContent = keyHash;

    if (lastKnownSecretHash && lastKnownSecretHash !== keyHash) {
      addLog(`[ROTATOR] ¡Detectada rotación de Frontend API Key! Nuevo Hash: ${keyHash}`, "rotator");
      rotationTimer = 120; // Reiniciar contador
      if (currentUser) {
        fetchVaultData(); // Refrescar datos con la nueva clave
      }
    }
    lastKnownSecretHash = keyHash;
  };

  if (oldScript && oldScript.parentNode) {
    oldScript.parentNode.replaceChild(newScript, oldScript);
  } else {
    document.head.appendChild(newScript);
  }
}

// ============================================================================
// Autenticación LDAP (Login / Logout)
// ============================================================================
function quickFill(user, pass) {
  document.getElementById("login-username").value = user;
  document.getElementById("login-password").value = pass;
  document.getElementById("login-alert").classList.add("hidden");
}

async function handleLdapLogin(event) {
  event.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const alertEl = document.getElementById("login-alert");
  const btnSubmit = document.getElementById("btn-submit-login");

  alertEl.className = "alert-box hidden";
  btnSubmit.disabled = true;

  addLog(`[AUTH] Intentando autenticación LDAP para usuario '${username}'...`, "info");

  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok && data.authenticated) {
      currentUser = data;
      sessionStorage.setItem("vault_ldap_user", JSON.stringify(currentUser));
      
      addLog(`[AUTH] Autenticación LDAP EXITOSA para ${data.cn} (${data.dn})`, "success");
      
      alertEl.className = "alert-box success";
      alertEl.textContent = `¡Bienvenido ${data.cn}! Autenticado correctamente con LDAP.`;
      alertEl.classList.remove("hidden");

      setTimeout(() => {
        showDashboard();
      }, 700);
    } else {
      const errorMsg = data.detail || "Usuario o contraseña LDAP inválidos.";
      addLog(`[AUTH] Fallo de autenticación para '${username}': ${errorMsg}`, "error");
      
      alertEl.className = "alert-box error";
      alertEl.textContent = errorMsg;
      alertEl.classList.remove("hidden");
    }
  } catch (err) {
    addLog(`[AUTH] Error de conexión con Backend: ${err.message}`, "error");
    alertEl.className = "alert-box error";
    alertEl.textContent = `Error conectando con el Backend API (${err.message}).`;
    alertEl.classList.remove("hidden");
  } finally {
    btnSubmit.disabled = false;
  }
}

function handleLogout() {
  addLog(`[AUTH] Sesión cerrada para ${currentUser?.username || "usuario"}.`, "warn");
  currentUser = null;
  sessionStorage.removeItem("vault_ldap_user");
  
  document.getElementById("dashboard-view").classList.add("hidden");
  document.getElementById("login-view").classList.remove("hidden");
  
  const headerUser = document.getElementById("header-user-section");
  headerUser.innerHTML = `<span class="user-guest-badge">🔒 Modo Bloqueado</span>`;
  
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
  document.getElementById("login-alert").classList.add("hidden");
}

function showDashboard() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("dashboard-view").classList.remove("hidden");

  // Actualizar tarjeta de usuario
  document.getElementById("dash-avatar").textContent = (currentUser.username || "U").charAt(0).toUpperCase();
  document.getElementById("dash-user-name").textContent = currentUser.cn || currentUser.username;
  document.getElementById("dash-user-dn").textContent = currentUser.dn;
  document.getElementById("dash-user-mail").textContent = currentUser.mail || `${currentUser.username}@example.com`;
  
  const roleGroup = Array.isArray(currentUser.groups) ? currentUser.groups.join(", ") : (currentUser.groups || "developers");
  document.getElementById("dash-user-role").textContent = roleGroup;

  // Actualizar Header
  const headerUser = document.getElementById("header-user-section");
  headerUser.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; background:rgba(16,185,129,0.15); border:1px solid #10b981; padding:4px 12px; border-radius:999px;">
      <span style="font-size:0.8rem; font-weight:700; color:#34d399;">● ${currentUser.username}</span>
      <span style="font-size:0.75rem; color:#94a3b8;">(${roleGroup})</span>
    </div>
  `;

  // Cargar datos
  fetchSystemStatus();
  fetchVaultData();
}

// ============================================================================
// Consultas a la API y Gestión de la Bóveda Cifrada
// ============================================================================
async function fetchVaultData() {
  const backendUrl = getBackendUrl();
  const apiKey = getApiKey();
  const tbody = document.getElementById("vault-table-body");

  addLog(`[API] Consultando /api/data usando x-api-key: ${sha256_truncate(apiKey)}...`, "info");

  try {
    const response = await fetch(`${backendUrl}/api/data`, {
      headers: {
        "x-api-key": apiKey
      }
    });

    if (response.status === 401) {
      addLog(`[API] ERROR 401 Unauthorized: La clave x-api-key ha expirado o es rechazada por el Backend.`, "error");
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="color:#f87171; text-align:center; padding:20px;">
            ⚠️ <strong>401 Unauthorized:</strong> La API rechazó la clave actual. Esperando sincronización del Rotator...
          </td>
        </tr>
      `;
      return;
    }

    const result = await response.json();
    if (result.status === "success" && Array.isArray(result.data)) {
      renderVaultTable(result.data);
      addLog(`[API] Registros cargados y descifrados exitosamente (${result.data.length} elementos).`, "success");
    }
  } catch (err) {
    addLog(`[API] Error consultando /api/data: ${err.message}`, "error");
  }
}

function renderVaultTable(records) {
  const tbody = document.getElementById("vault-table-body");
  if (!records || records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No hay registros en la bóveda.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(item => `
    <tr>
      <td><strong>#${item.id}</strong></td>
      <td><strong>${escapeHtml(item.title)}</strong></td>
      <td><span class="decrypted-badge">🔓 ${escapeHtml(item.decrypted_value)}</span></td>
      <td style="color:#94a3b8; font-size:0.8rem;">${item.created_at}</td>
    </tr>
  `).join("");
}

async function handleAddSecret(event) {
  event.preventDefault();
  const titleInput = document.getElementById("new-secret-title");
  const secretInput = document.getElementById("new-secret-value");
  
  const title = titleInput.value.trim();
  const secret_value = secretInput.value.trim();

  if (!title || !secret_value) return;

  const backendUrl = getBackendUrl();
  const apiKey = getApiKey();

  addLog(`[VAULT] Cifrando y guardando nuevo secreto: '${title}'...`, "info");

  try {
    const response = await fetch(`${backendUrl}/api/data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({ title, secret_value })
    });

    const result = await response.json();
    if (response.ok && result.status === "success") {
      addLog(`[VAULT] Secreto guardado y cifrado con Fernet ID #${result.record.id}`, "success");
      titleInput.value = "";
      secretInput.value = "";
      fetchVaultData();
    } else {
      addLog(`[VAULT] Error guardando secreto: ${result.detail || "Error desconocido"}`, "error");
    }
  } catch (err) {
    addLog(`[VAULT] Error en petición POST /api/data: ${err.message}`, "error");
  }
}

async function toggleRawDatabase() {
  const panel = document.getElementById("raw-db-panel");
  const content = document.getElementById("raw-db-content");

  if (!panel.classList.contains("hidden")) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  content.textContent = "Consultando base de datos SQLite cruda...";

  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/raw-database`);
    const data = await response.json();
    content.textContent = JSON.stringify(data, null, 2);
    addLog("[VAULT] Inspección de registros cifrados en reposo generada.", "info");
  } catch (err) {
    content.textContent = `Error obteniendo base de datos cruda: ${err.message}`;
  }
}

// ============================================================================
// Monitor de Estado y Rotación de los 3 Servicios
// ============================================================================
async function fetchSystemStatus() {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/status`);
    if (!response.ok) return;

    const data = await response.json();

    // 1. Frontend
    const feKey = getApiKey();
    document.getElementById("fe-secret-val").textContent = feKey;
    document.getElementById("fe-secret-hash").textContent = sha256_truncate(feKey);

    // 2. Backend
    if (data.backend_secret) {
      document.getElementById("be-secret-val").textContent = "SHARED_VALIDATED";
      document.getElementById("be-secret-hash").textContent = data.backend_secret.active_secret_hash || "------";
    }

    // 3. LDAP
    if (data.ldap_service) {
      document.getElementById("ldap-secret-hash").textContent = data.ldap_service.admin_secret_hash || "------";
      const ldapBadge = document.getElementById("ldap-status-badge");
      if (data.ldap_service.connected) {
        ldapBadge.className = "badge-active";
        ldapBadge.textContent = "Conectado";
      } else {
        ldapBadge.className = "badge-role";
        ldapBadge.style.background = "#f43f5e";
        ldapBadge.textContent = "Desconectado";
      }
    }
  } catch (e) {
    // Backend temporalmente no disponible
  }
}

function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval);
  
  countdownInterval = setInterval(() => {
    rotationTimer--;
    if (rotationTimer <= 0) {
      rotationTimer = 120;
    }

    const mins = Math.floor(rotationTimer / 60);
    const secs = rotationTimer % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    const countdownEl = document.getElementById("rotation-countdown");
    if (countdownEl) {
      countdownEl.textContent = formatted;
    }
  }, 1000);
}

// ============================================================================
// Helpers y Consola de Logs
// ============================================================================
function addLog(message, type = "info") {
  const terminal = document.getElementById("system-logs");
  if (!terminal) return;

  const line = document.createElement("div");
  line.className = `log-line ${type}`;
  
  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");
  
  line.textContent = `[${timeStr}] ${message}`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function clearLogs() {
  const terminal = document.getElementById("system-logs");
  if (terminal) terminal.innerHTML = "";
}

function sha256_truncate(str) {
  if (!str) return "------";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `sha256:${hex}`;
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
