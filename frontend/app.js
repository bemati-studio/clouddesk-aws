const config = window.CLOUDDESK_CONFIG;
const elements = {
  setup: document.querySelector("#setupPanel"),
  auth: document.querySelector("#authPanel"),
  workspace: document.querySelector("#workspace"),
  login: document.querySelector("#loginButton"),
  authLogin: document.querySelector("#authLoginButton"),
  logout: document.querySelector("#logoutButton"),
  user: document.querySelector("#userLabel"),
  newTicket: document.querySelector("#newTicketButton"),
  dialog: document.querySelector("#ticketDialog"),
  form: document.querySelector("#ticketForm"),
  formError: document.querySelector("#formError"),
  loading: document.querySelector("#loadingState"),
  empty: document.querySelector("#emptyState"),
  table: document.querySelector("#ticketsTable"),
  body: document.querySelector("#ticketsBody"),
  search: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  connection: document.querySelector("#connectionLabel"),
  statusDot: document.querySelector(".status-dot"),
  toast: document.querySelector("#toast")
};

let tickets = [];

init();

async function init() {
  bindEvents();
  if (!isConfigured()) {
    elements.setup.hidden = false;
    elements.connection.textContent = "Pendiente de despliegue";
    return;
  }

  elements.statusDot.classList.add("connected");
  elements.connection.textContent = `Conectado a ${config.region}`;

  try {
    if (new URLSearchParams(location.search).has("code")) await completeLogin();
  } catch (error) {
    showToast(error.message);
  }

  const session = getSession();
  if (!session) {
    showLoggedOut();
    return;
  }

  showLoggedIn(session);
  await loadData();
}

function bindEvents() {
  elements.login.addEventListener("click", startLogin);
  elements.authLogin.addEventListener("click", startLogin);
  elements.logout.addEventListener("click", logout);
  elements.newTicket.addEventListener("click", () => elements.dialog.showModal());
  document.querySelector("#closeDialog").addEventListener("click", () => elements.dialog.close());
  document.querySelector("#cancelDialog").addEventListener("click", () => elements.dialog.close());
  elements.form.addEventListener("submit", createTicket);
  elements.search.addEventListener("input", renderTickets);
  elements.statusFilter.addEventListener("change", renderTickets);
}

function isConfigured() {
  return config &&
    config.apiUrl?.startsWith("https://") &&
    !config.apiUrl.includes("__API_URL__") &&
    config.clientId &&
    !config.clientId.includes("__CLIENT_ID__");
}

function showLoggedOut() {
  elements.auth.hidden = false;
  elements.workspace.hidden = true;
  elements.login.hidden = false;
  elements.logout.hidden = true;
  elements.newTicket.hidden = true;
  elements.user.hidden = true;
}

function showLoggedIn(session) {
  const claims = decodeJwt(session.idToken);
  elements.auth.hidden = true;
  elements.workspace.hidden = false;
  elements.login.hidden = true;
  elements.logout.hidden = false;
  elements.newTicket.hidden = false;
  elements.user.hidden = false;
  elements.user.textContent = claims.email ?? "Sesión activa";
}

async function startLogin() {
  const verifier = randomString(64);
  const challenge = await sha256base64url(verifier);
  sessionStorage.setItem("clouddesk_pkce", verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid email profile",
    code_challenge_method: "S256",
    code_challenge: challenge
  });
  location.assign(`${config.cognitoDomain}/oauth2/authorize?${params}`);
}

async function completeLogin() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const verifier = sessionStorage.getItem("clouddesk_pkce");
  if (!code || !verifier) throw new Error("No fue posible validar el inicio de sesión.");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier
  });

  const response = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error("Amazon Cognito rechazó el inicio de sesión.");

  const tokens = await response.json();
  sessionStorage.setItem("clouddesk_session", JSON.stringify({
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in * 1000)
  }));
  sessionStorage.removeItem("clouddesk_pkce");
  history.replaceState({}, document.title, location.pathname);
}

function logout() {
  sessionStorage.removeItem("clouddesk_session");
  const params = new URLSearchParams({ client_id: config.clientId, logout_uri: config.redirectUri });
  location.assign(`${config.cognitoDomain}/logout?${params}`);
}

function getSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem("clouddesk_session"));
    if (!session?.idToken || session.expiresAt < Date.now()) {
      sessionStorage.removeItem("clouddesk_session");
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

async function loadData() {
  elements.loading.hidden = false;
  elements.empty.hidden = true;
  elements.table.hidden = true;

  try {
    const [ticketData, metrics] = await Promise.all([api("/tickets"), api("/metrics")]);
    tickets = ticketData;
    updateMetrics(metrics);
    renderTickets();
  } catch (error) {
    elements.loading.textContent = "No fue posible consultar la API de AWS.";
    showToast(error.message);
  }
}

function updateMetrics(metrics) {
  document.querySelector("#metricTotal").textContent = metrics.total;
  document.querySelector("#metricOpen").textContent = metrics.open;
  document.querySelector("#metricProgress").textContent = metrics.inProgress;
  document.querySelector("#metricCritical").textContent = metrics.critical;
}

function renderTickets() {
  const query = elements.search.value.trim().toLowerCase();
  const selectedStatus = elements.statusFilter.value;
  const filtered = tickets.filter((ticket) => {
    const matchesQuery = !query || `${ticket.title} ${ticket.ticketId} ${ticket.assignedTo}`.toLowerCase().includes(query);
    const matchesStatus = !selectedStatus || ticket.status === selectedStatus;
    return matchesQuery && matchesStatus;
  });

  elements.loading.hidden = true;
  elements.empty.hidden = filtered.length > 0;
  elements.table.hidden = filtered.length === 0;
  elements.body.innerHTML = filtered.map((ticket) => `
    <tr>
      <td><span class="ticket-title">${escapeHtml(ticket.title)}</span><span class="ticket-id">#${escapeHtml(ticket.ticketId.slice(0, 8))}</span></td>
      <td><span class="badge priority-${ticket.priority}">${priorityLabel(ticket.priority)}</span></td>
      <td>
        <select class="status-select" data-ticket-id="${escapeHtml(ticket.ticketId)}" aria-label="Estado de ${escapeHtml(ticket.title)}">
          ${["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((status) => `<option value="${status}" ${status === ticket.status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}
        </select>
      </td>
      <td>${escapeHtml(ticket.assignedTo || "Sin asignar")}</td>
      <td>${formatDate(ticket.updatedAt)}</td>
    </tr>
  `).join("");

  elements.body.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", () => changeStatus(select));
  });
}

async function createTicket(event) {
  event.preventDefault();
  elements.formError.hidden = true;
  const submit = elements.form.querySelector("[type=submit]");
  submit.disabled = true;

  try {
    const data = Object.fromEntries(new FormData(elements.form));
    await api("/tickets", { method: "POST", body: JSON.stringify(data) });
    elements.form.reset();
    elements.dialog.close();
    showToast("Ticket creado correctamente.");
    await loadData();
  } catch (error) {
    elements.formError.textContent = error.message;
    elements.formError.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

async function changeStatus(select) {
  const previous = tickets.find((ticket) => ticket.ticketId === select.dataset.ticketId)?.status;
  select.disabled = true;
  try {
    await api(`/tickets/${select.dataset.ticketId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: select.value })
    });
    showToast("Estado actualizado.");
    await loadData();
  } catch (error) {
    select.value = previous;
    showToast(error.message);
  } finally {
    select.disabled = false;
  }
}

async function api(path, options = {}) {
  const session = getSession();
  if (!session) {
    showLoggedOut();
    throw new Error("La sesión expiró. Inicia sesión nuevamente.");
  }

  const response = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? `Error HTTP ${response.status}`);
  return data;
}

function decodeJwt(token) {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(decodeURIComponent(atob(base64).split("").map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
}

function randomString(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[byte % 66]).join("");
}

async function sha256base64url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function statusLabel(status) {
  return ({ OPEN: "Abierto", IN_PROGRESS: "En curso", RESOLVED: "Resuelto", CLOSED: "Cerrado" })[status] ?? status;
}

function priorityLabel(priority) {
  return ({ LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica" })[priority] ?? priority;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, 3500);
}
