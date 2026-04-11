import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  deleteUser,
  updateEmail,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMe2jwkPHneohNQOg_D_GfIGz34c4Wq80",
  authDomain: "formanova-a3d7c.firebaseapp.com",
  projectId: "formanova-a3d7c",
  storageBucket: "formanova-a3d7c.appspot.com",
  messagingSenderId: "657050782727",
  appId: "1:657050782727:web:12162875d73f9c3544eea2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── Translation System ────────────────────────────────────────
let translations = {};
let currentLanguage = localStorage.getItem('language') || 'en';

async function loadTranslations(lang) {
  try {
    const response = await fetch(`${lang}.json`);
    translations = await response.json();
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
    if (lang === 'ar') {
      document.documentElement.dir = 'rtl';
      document.body.classList.add('rtl');
    } else {
      document.documentElement.dir = 'ltr';
      document.body.classList.remove('rtl');
    }
  } catch (error) {
    console.error('Failed to load translations:', error);
  }
}

function t(key) {
  return translations[key] || key;
}

function changeLanguage(lang) {
  loadTranslations(lang).then(() => {
    // Re-render current page to apply translations
    const currentPage = window.location.hash.substring(1) || 'dashboard';
    buildSidebar(); // Rebuild sidebar with new translations
    navigate(currentPage); // This will update header title and re-render page
    showToast(`Language changed to ${lang.toUpperCase()}`, 'success');
  });
}

// ── Dark Mode System ──────────────────────────────────────────
function toggleDarkMode(enabled) {
  localStorage.setItem('darkMode', enabled);
  document.body.classList.toggle('dark-mode', enabled);
  showToast(`Switched to ${enabled ? 'dark' : 'light'} mode`, 'success');
}

function initTheme() {
  const darkMode = localStorage.getItem('darkMode') === 'true';
  document.body.classList.toggle('dark-mode', darkMode);
}

// ── State ─────────────────────────────────────────────────────
let currentUser = null;
let editingUserId = null;
let editingCourseId = null;
let editingJobId = null;
let editingCertId = null;
let pendingDeleteId = null;
let pendingDeleteType = null;
let _usersCache = [];
let _coursesCache = [];
let _jobsCache = [];
let _certsCache = [];
let _paymentsCache = [];

// ── Helpers ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showToast(msg, type = "success") {
  const t = $("toast");
  t.textContent = msg;
  t.className = type;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3500);
}

function roleBadge(role) {
  const map = { Admin: "badge-purple", Instructor: "badge-blue", Learner: "badge-green", Recruiter: "badge-orange" };
  return `<span class="badge ${map[role] || "badge-gray"}">${role || "—"}</span>`;
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function genCertId() {
  return "CERT-" + Math.random().toString(36).slice(2, 8).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
}

// ── Password toggle ────────────────────────────────────────────
$("pw-toggle").addEventListener("click", () => {
  const pw = $("login-password");
  const isHidden = pw.type === "password";
  pw.type = isHidden ? "text" : "password";
  $("eye-show").style.display = isHidden ? "none" : "";
  $("eye-hide").style.display = isHidden ? "" : "none";
});
$("login-password").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
$("login-email").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

// ── LOGIN ─────────────────────────────────────────────────────
async function doLogin() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value.trim();
  const btn = $("login-btn");
  if (!email || !password) { showToast(t('fillAllRequiredFields'), "error"); return; }
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Signing in...';
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    currentUser = cred.user;

    try {
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const role = (userDoc.data().role || "").toLowerCase();
        if (role && role !== "admin") {
          showToast(`Access denied — role "${userDoc.data().role}" is not Admin`, "error");
          await signOut(auth);
          btn.disabled = false;
          btn.innerHTML = "Sign In";
          return;
        }
      }
    } catch (_) { }

    $("login-screen").classList.remove("active");
    $("app-screen").classList.add("active");
    $("header-email").textContent = currentUser.email;
    $("header-avatar").textContent = currentUser.email.charAt(0).toUpperCase();
    showToast(t('welcomeBackAdmin'));
    renderNotifs(); navigate("dashboard");

    // Initialize translations and theme
    loadTranslations(currentLanguage).then(() => {
      buildSidebar(); // Build sidebar after translations are loaded
      initTheme();
    });
  } catch (err) {
    const friendly = {
      "auth/invalid-email": "Invalid email address.",
      "auth/user-not-found": "No account with this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/too-many-requests": "Too many attempts — try again later.",
      "auth/network-request-failed": "Network error. Check your connection.",
    };
    showToast(friendly[err.code] || err.message, "error");
    btn.disabled = false;
    btn.innerHTML = "Sign In";
  }
}
$("login-btn").addEventListener("click", doLogin);

// ── LOGOUT ────────────────────────────────────────────────────
$("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

// ── SIDEBAR ───────────────────────────────────────────────────
const NAV_ITEMS = [
  { section: "nav_overview" },
  { id: "dashboard", label: "nav_dashboard", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>` },
  { id: "statistics", label: "nav_statistics", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>` },
  { section: "nav_content" },
  { id: "users", label: "nav_users", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
  { id: "courses", label: "nav_courses", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>` },
  { id: "certificates", label: "nav_certificates", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>` },
  { section: "nav_careers" },
  { id: "jobs", label: "nav_jobs", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>` },
  { section: "nav_finance" },
  { id: "payments", label: "nav_payments", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>` },
  { section: "nav_system" },
  { id: "settings", label: "nav_settings", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>` },
];

function buildSidebar() {
  const nav = $("sidebar-nav");
  nav.innerHTML = "";
  NAV_ITEMS.forEach(item => {
    if (item.section) {
      const sec = document.createElement("div");
      sec.className = "nav-section";
      sec.textContent = t(item.section);
      nav.appendChild(sec);
      return;
    }
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.dataset.id = item.id;
    btn.innerHTML = item.icon + `<span>${t(item.label)}</span>`;
    btn.addEventListener("click", () => { navigate(item.id); closeMobileSidebar(); });
    nav.appendChild(btn);
  });
}

let currentPage = "";
function navigate(page) {
  currentPage = page;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.id === page));
  const titles = { 
    dashboard: t('dashboard'), 
    users: t('userManagement'), 
    courses: t('courses'), 
    certificates: t('certificates'), 
    jobs: t('jobOffers'), 
    payments: t('payments'), 
    statistics: t('statistics'), 
    settings: t('settings') 
  };
  $("header-title").textContent = titles[page] || page;
  const pages = { dashboard: renderDashboard, users: loadUsers, courses: loadCourses, certificates: loadCertificates, jobs: loadJobs, payments: loadPayments, statistics: renderStatistics, settings: renderSettings };
  if (pages[page]) pages[page]();
}

// ── DROPDOWNS ─────────────────────────────────────────────────
function toggleDropdown(id) {
  const dd = $(id);
  const isOpen = dd.classList.contains("open");
  closeAllDropdowns();
  if (!isOpen) dd.classList.add("open");
}
function closeAllDropdowns() {
  document.querySelectorAll(".dropdown-menu").forEach(d => d.classList.remove("open"));
}
document.addEventListener("click", e => { if (!e.target.closest(".dropdown-wrapper")) closeAllDropdowns(); });
$("notif-btn").addEventListener("click", e => { e.stopPropagation(); toggleDropdown("notif-dd"); });
$("user-menu-btn").addEventListener("click", e => { e.stopPropagation(); toggleDropdown("user-dd"); });
$("go-settings-btn").addEventListener("click", () => { closeAllDropdowns(); navigate("settings"); });

// ── MOBILE ────────────────────────────────────────────────────
$("mobile-toggle-btn").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
  $("sidebar-overlay").classList.toggle("open");
});
function closeMobileSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebar-overlay").classList.remove("open");
}
$("sidebar-overlay").addEventListener("click", closeMobileSidebar);

// ── NOTIFICATIONS ─────────────────────────────────────────────
const NOTIFS = [
  { title: "New User Registered", msg: "A new learner joined the platform", time: "2 min ago", read: false },
  { title: "Job Application", msg: "3 new applications for Frontend Dev", time: "1 hr ago", read: false },
  { title: "Payment Received", msg: "$149 payment received from learner", time: "3 hr ago", read: false },
];
function renderNotifs() {
  const unread = NOTIFS.filter(n => !n.read).length;
  const cnt = $("notif-count");
  cnt.textContent = unread;
  cnt.style.display = unread ? "flex" : "none";
  $("notif-list").innerHTML = NOTIFS.length ? NOTIFS.map((n, i) => `
    <div class="notif-item" data-notif="${i}">
      <div class="notif-row">
        ${!n.read ? `<div class="notif-dot"></div>` : `<div style="width:7px;flex-shrink:0"></div>`}
        <div><div class="notif-title">${n.title}</div><div class="notif-msg">${n.msg}</div><div class="notif-time">${n.time}</div></div>
      </div>
    </div>`).join("") : `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px;">No notifications</div>`;
  $("notif-list").querySelectorAll(".notif-item").forEach(el => {
    el.addEventListener("click", () => { NOTIFS[+el.dataset.notif].read = true; renderNotifs(); });
  });
}
$("mark-read-btn").addEventListener("click", () => { NOTIFS.forEach(n => n.read = true); renderNotifs(); });

// ── MODALS ────────────────────────────────────────────────────
function openModal(id) { $(id).classList.add("open"); }
function closeModal(id) { $(id).classList.remove("open"); }

$("close-user-modal").addEventListener("click", () => closeModal("user-modal"));
$("cancel-user-btn").addEventListener("click", () => closeModal("user-modal"));
$("close-course-modal").addEventListener("click", () => closeModal("course-modal"));
$("cancel-course-btn").addEventListener("click", () => closeModal("course-modal"));
$("close-job-modal").addEventListener("click", () => closeModal("job-modal"));
$("cancel-job-btn").addEventListener("click", () => closeModal("job-modal"));
$("close-cert-modal").addEventListener("click", () => closeModal("cert-modal"));
$("cancel-cert-btn").addEventListener("click", () => closeModal("cert-modal"));

// close on overlay click
["user-modal", "course-modal", "job-modal", "cert-modal"].forEach(id => {
  $(id).addEventListener("click", e => { if (e.target === $(id)) closeModal(id); });
});

// ── CONFIRM DIALOG ────────────────────────────────────────────
function showConfirm(msg, id, type) {
  pendingDeleteId = id;
  pendingDeleteType = type;
  $("confirm-msg").textContent = msg;
  $("confirm-overlay").classList.add("open");
}
$("cancel-delete-btn").addEventListener("click", () => {
  $("confirm-overlay").classList.remove("open");
  pendingDeleteId = pendingDeleteType = null;
});

$("confirm-delete-btn").addEventListener("click", async () => {
  if (!pendingDeleteId || !pendingDeleteType) {
    $("confirm-overlay").classList.remove("open");
    return;
  }

  const collMap = {
    user: "users",
    course: "courses",
    job: "offers",
    offer: "offers",
    cert: "certificates",
    payment: "payments"
  };
  const reloads = {
    user: loadUsers,
    course: loadCourses,
    job: loadJobs,
    offer: loadJobs,
    cert: loadCertificates,
    payment: loadPayments
  };

  const coll = collMap[pendingDeleteType];

  if (!coll) {
    showToast("Unknown type: " + pendingDeleteType, "error");
    $("confirm-overlay").classList.remove("open");
    pendingDeleteId = pendingDeleteType = null;
    return;
  }

  // Block self-delete
  if (pendingDeleteType === "user" && pendingDeleteId === auth.currentUser?.uid) {
    showToast(t('cannotDeleteOwnAccount'), "error");
    $("confirm-overlay").classList.remove("open");
    pendingDeleteId = pendingDeleteType = null;
    return;
  }

  const btn = $("confirm-delete-btn");
  btn.disabled = true;
  btn.textContent = t('deleting');

  try {
    const ref = doc(db, coll, pendingDeleteId);
    await deleteDoc(ref);
    showToast(t('deletedSuccessfully'), "success");
    if (reloads[pendingDeleteType]) await reloads[pendingDeleteType]();
  } catch (err) {
    console.error("Delete error:", err.code, err.message);
    showToast(t('deleteFailed') + ": " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = t('delete');
    $("confirm-overlay").classList.remove("open");
    pendingDeleteId = pendingDeleteType = null;
  }
});

// ═══════════════════════════════════════════════════════════════
// ── USERS ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadUsers() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('userManagement')}</h1><p>${t('managePlatformUsers')}</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="user-search" placeholder="${t('searchByNameOrEmail')}" /></div>
        <select class="filter-select" id="role-filter"><option value="">${t('allRoles')}</option><option>Admin</option><option>Instructor</option><option>Learner</option><option>Recruiter</option></select>
        <button class="btn btn-purple" id="add-user-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>${t('addUser')}</button>
      </div>
      <div id="users-table-wrap"><div class="empty-state"><p>${t('loading')}</p></div></div>
    </div>`;

  $("add-user-btn").addEventListener("click", openAddUser);
  $("user-search").addEventListener("input", filterUsers);
  $("role-filter").addEventListener("change", filterUsers);

  try {
    const snap = await getDocs(collection(db, "users"));
    _usersCache = [];
    snap.forEach(d => _usersCache.push({ id: d.id, ...d.data() }));
    renderUsersTable(_usersCache);
  } catch (err) {
    $("users-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
  }
}

function renderUsersTable(users) {
  const wrap = $("users-table-wrap");
  if (!users?.length) {
    wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><h4>${t('noUsersFound')}</h4></div>`;
    return;
  }

  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>${t('user')}</th><th>${t('email')}</th><th>${t('role')}</th><th>${t('actions')}</th></tr>
    ${users.map(u => `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="width:32px;height:32px;font-size:12px;">${(u.name || u.email || "?").charAt(0).toUpperCase()}</div><strong>${u.name || "—"}</strong></div></td>
      <td style="color:var(--muted)">${u.email || ""}</td>
      <td>${roleBadge(u.role)}</td>
      <td><div class="action-btns">
        <button class="tbl-btn" data-action="edit-user" data-id="${u.id}" data-name="${(u.name || "").replace(/"/g, "")}" data-email="${u.email || ""}" data-role="${u.role || ""}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="tbl-btn danger" data-action="del-user" data-id="${u.id}" data-name="${(u.name || u.email || "").replace(/"/g, "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`).join("")}
  </table></div>`;

  wrap.querySelectorAll("[data-action='edit-user']").forEach(btn => {
    btn.addEventListener("click", () => editUser(btn.dataset.id, btn.dataset.name, btn.dataset.email, btn.dataset.role));
  });
  wrap.querySelectorAll("[data-action='del-user']").forEach(btn => {
    btn.addEventListener("click", () => showConfirm(`Delete "${btn.dataset.name}"? This cannot be undone.`, btn.dataset.id, "user"));
  });
}

function filterUsers() {
  const search = ($("user-search")?.value || "").toLowerCase();
  const role = $("role-filter")?.value || "";
  renderUsersTable(_usersCache.filter(u =>
    (!search || (u.name || "").toLowerCase().includes(search) || (u.email || "").toLowerCase().includes(search)) &&
    (!role || u.role === role)
  ));
}

function openAddUser() {
  editingUserId = null;
  ["u-name", "u-email", "u-password", "u-phone"].forEach(id => $(id) && ($(id).value = ""));
  $("u-type").value = "Learner";
  $("user-modal-title").textContent = t('addUser');
  $("user-save-btn").textContent = t('addUser');
  $("u-pw-wrap").style.display = "block";
  openModal("user-modal");
}

function editUser(id, name, email, role) {
  editingUserId = id;
  $("u-name").value = name;
  $("u-email").value = email;
  $("u-type").value = role;
  $("u-password").value = "";
  $("user-modal-title").textContent = t('edit');
  $("user-save-btn").textContent = t('saveChanges');
  $("u-pw-wrap").style.display = "none";
  openModal("user-modal");
}

// ═══════════════════════════════════════════════════════════════
// ── USER SAVE ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
$("user-save-btn").addEventListener("click", async () => {
  const name = $("u-name").value.trim();
  const email = $("u-email").value.trim();
  const role = $("u-type").value;
  const phone = ($("u-phone")?.value || "").trim();
  const password = $("u-password").value.trim();

  if (!name || !email) {
    showToast(t('fillAllRequiredFields'), "error");
    return;
  }

  const btn = $("user-save-btn");
  btn.disabled = true;
  btn.textContent = t('saving');

  try {
    if (editingUserId) {
      await updateDoc(doc(db, "users", editingUserId), { name, email, role, phone });
      showToast(t('userUpdated'));
    } else {
      if (!password || password.length < 6) {
        showToast(t('passwordAtLeast6Chars'), "error");
        btn.disabled = false;
        btn.textContent = t('addUser');
        return;
      }

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;

        await setDoc(doc(db, "users", userId), {
          name,
          email,
          role,
          phone,
          createdAt: serverTimestamp()
        });

        showToast(t('userAddedSuccessfully'));
      } catch (authError) {
        let errorMsg = authError.message;
        if (authError.code === "auth/email-already-in-use") {
          errorMsg = t('emailAlreadyRegistered');
        } else if (authError.code === "auth/weak-password") {
          errorMsg = t('passwordAtLeast6Chars');
        }
        showToast(t('errorMsg') + ": " + errorMsg, "error");
        btn.disabled = false;
        btn.textContent = t('addUser');
        return;
      }
    }

    closeModal("user-modal");
    loadUsers();

  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = editingUserId ? "Save Changes" : "Add User";
  }
});

// ═══════════════════════════════════════════════════════════════
// ── DASHBOARD ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function renderDashboard() {
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Dashboard</h1>
        <p>${greeting}, <strong>${currentUser?.email || "Admin"}</strong> — here's what's happening today.</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
        ${now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
      </div>
    </div>

    <!-- KPI CARDS -->
    <div class="stat-grid stat-grid-4" id="dash-stats">
      ${[1, 2, 3, 4].map(() => `<div class="stat-card"><div class="skeleton" style="height:100px;border-radius:8px;"></div></div>`).join("")}
    </div>

    <!-- ROW 2: recent users + role breakdown -->
    <div class="grid-2" style="margin-bottom:20px;">
      <div class="card">
        <div class="card-header">
          <h3>${t('recentUsers')}</h3>
          <button class="btn btn-outline" style="padding:6px 12px;font-size:12px;" onclick="navigate('users')">${t('viewAll')}</button>
        </div>
        <div id="dash-recent"><div class="empty-state"><p>Loading...</p></div></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>${t('userRoles')}</h3><span class="meta">${t('distribution')}</span></div>
        <div id="dash-roles"></div>
      </div>
    </div>

    <!-- ROW 3: quick stats + activity -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3>${t('platformOverview')}</h3><span class="meta">${t('allTime')}</span></div>
        <div id="dash-overview"></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>${t('recentActivity')}</h3><span class="meta">${t('platformEvents')}</span></div>
        <div id="dash-activity"></div>
      </div>
    </div>`;

  // Static activity feed
  $("dash-activity").innerHTML = [
    { color: "var(--primary)", bg: "var(--primary-light)", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>`, text: t('newLearnerReg'), time: "2 min ago" },
    { color: "var(--success)", bg: "#dcfce7", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`, text: t('paymentReceived'), time: "1 hr ago" },
    { color: "var(--warning)", bg: "#fef9c3", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`, text: t('newJobPosted'), time: "3 hr ago" },
    { color: "var(--accent)", bg: "#dbeafe", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`, text: t('certIssued'), time: "5 hr ago" },
    { color: "var(--danger)", bg: "#fee2e2", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`, text: t('newCourseSubmitted'), time: "Yesterday" },
  ].map(a => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${a.bg};color:${a.color};">${a.icon}</div>
      <div class="activity-info">
        <div class="activity-text">${a.text}</div>
        <div class="activity-time">${a.time}</div>
      </div>
    </div>`).join("");

  try {
    const [usersSnap] = await Promise.all([getDocs(collection(db, "users"))]);
    let coursesSnap, offersSnap, certsSnap, paymentsSnap;
    try { coursesSnap = await getDocs(collection(db, "courses")); } catch (_) { }
    try { offersSnap = await getDocs(collection(db, "offers")); } catch (_) { }
    try { certsSnap = await getDocs(collection(db, "certificates")); } catch (_) { }
    try { paymentsSnap = await getDocs(collection(db, "payments")); } catch (_) { }

    const totalUsers = usersSnap.size;
    const totalCourses = coursesSnap?.size || 0;
    const totalJobs = offersSnap?.size || 0;
    const totalCerts = certsSnap?.size || 0;
    const totalRevenue = paymentsSnap?.docs
      .filter(d => d.data().status === "Completed")
      .reduce((s, d) => s + (parseFloat(d.data().amount) || 0), 0) || 0;

    // ── KPI Cards
    const kpis = [
      { label: t('totalUsers'), value: totalUsers, icon: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`, grad: "var(--primary),#6b63ff", trend: "+12%" },
      { label: t('courses'), value: totalCourses, icon: `<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>`, grad: "var(--accent),#0ea5e9", trend: "+5%" },
      { label: t('jobOffers'), value: totalJobs, icon: `<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>`, grad: "var(--warning),#f97316", trend: "+8%" },
      { label: t('certificates'), value: totalCerts, icon: `<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>`, grad: "var(--success),#16a34a", trend: "+21%" },
    ];
    $("dash-stats").innerHTML = kpis.map(k => `
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon" style="background:linear-gradient(135deg,${k.grad})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${k.icon}</svg>
          </div>
          <div class="stat-trend up">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>${k.trend}
          </div>
        </div>
        <div class="stat-label">${k.label}</div>
        <div class="stat-value">${k.value}</div>
      </div>`).join("");

    // ── Recent Users
    const recent = usersSnap.docs.slice(0, 6);
    $("dash-recent").innerHTML = recent.length ? recent.map(d => {
      const u = d.data();
      return `<div class="profile-row">
        <div class="profile-avatar">${(u.name || u.email || "?").charAt(0).toUpperCase()}</div>
        <div class="profile-info">
          <div class="profile-name">${u.name || "—"}</div>
          <div class="profile-sub">${u.email || ""}</div>
        </div>
        ${roleBadge(u.role)}
      </div>`;
    }).join("") : `<div class="empty-state"><p>No users yet</p></div>`;

    // ── Role Breakdown
    const roleCounts = {};
    usersSnap.docs.forEach(d => {
      const r = d.data().role || "Unknown";
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    });
    const roleColors = { Admin: "var(--primary)", Instructor: "var(--accent)", Learner: "var(--success)", Recruiter: "var(--warning)", Unknown: "var(--muted)" };
    const roleBadgeMap = { Admin: "badge-purple", Instructor: "badge-blue", Learner: "badge-green", Recruiter: "badge-orange", Unknown: "badge-gray" };
    $("dash-roles").innerHTML = totalUsers ? Object.entries(roleCounts).map(([role, count]) => {
      const pct = Math.round((count / totalUsers) * 100);
      return `<div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="badge ${roleBadgeMap[role] || "badge-gray"}">${role}</span>
          <span style="font-size:13px;font-weight:700;color:var(--text);">${count} <span style="color:var(--muted);font-weight:400;">(${pct}%)</span></span>
        </div>
        <div class="progress-bar" style="height:8px;">
          <div class="progress-fill" style="width:${pct}%;background:${roleColors[role] || "var(--muted)"};"></div>
        </div>
      </div>`;
    }).join("") : `<div class="empty-state"><p>${t('noUsersFound')}</p></div>`;

    // ── Platform Overview quick stats
    const activeJobs = offersSnap?.docs.filter(d => d.data().status === "Active").length || 0;
    const overviewItems = [
      { label: t('totalRevenue'), value: `$${totalRevenue.toFixed(2)}`, icon: "💰", color: "var(--success)" },
      { label: t('activeJobOffers'), value: activeJobs, icon: "✅", color: "var(--accent)" },
      { label: t('coursesPublished'), value: totalCourses, icon: "📚", color: "var(--primary)" },
      { label: t('certsIssued'), value: totalCerts, icon: "🏅", color: "var(--warning)" },
    ];
    $("dash-overview").innerHTML = overviewItems.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:38px;height:38px;border-radius:10px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:18px;">${o.icon}</div>
          <span style="font-size:14px;font-weight:500;color:var(--text);">${o.label}</span>
        </div>
        <span style="font-size:18px;font-weight:800;color:${o.color};font-family:'Outfit',sans-serif;">${o.value}</span>
      </div>`).join("").replace(/border-bottom:1px solid var\(--border\);">(?![\s\S]*border-bottom)/, "border-bottom:none;\">");

  } catch (err) {
    $("dash-stats").innerHTML = `<div style="grid-column:1/-1"><div class="empty-state"><p>Error: ${err.message}</p></div></div>`;
  }
}
// ═══════════════════════════════════════════════════════════════
// ── COURSES ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadCourses() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('courses')}</h1><p>${t('managePlatformCourses')}</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="course-search" placeholder="${t('searchCourses')}" /></div>
        <button class="btn btn-purple" id="add-course-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>${t('addCourse')}</button>
      </div>
      <div id="courses-table-wrap"><div class="empty-state"><p>Loading...</p></div></div>
    </div>`;
  $("add-course-btn").addEventListener("click", openAddCourse);
  $("course-search").addEventListener("input", filterCourses);
  try {
    const snap = await getDocs(collection(db, "courses"));
    _coursesCache = [];
    snap.forEach(d => _coursesCache.push({ id: d.id, ...d.data() }));
    renderCoursesTable(_coursesCache);
  } catch (err) { $("courses-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`; }
}

function renderCoursesTable(courses) {
  const wrap = $("courses-table-wrap");
  if (!courses?.length) { wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg><h4>${t('noCoursesYet')}</h4></div>`; return; }
  const typeBadge = { PDF: "badge-red", MP4: "badge-blue", PPTX: "badge-orange", DOC: "badge-purple", MP3: "badge-green" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>${t('courseTable')}</th><th>${t('instructor')}</th><th>${t('category')}</th><th>${t('type')}</th><th>${t('price')}</th><th>${t('actions')}</th></tr>
    ${courses.map(c => `<tr>
      <td><strong>${c.name || "—"}</strong></td>
      <td style="color:var(--muted)">${c.instructor || "—"}</td>
      <td><span class="badge badge-indigo">${c.category || t('general')}</span></td>
      <td><span class="badge ${typeBadge[c.type] || "badge-gray"}">${c.type || "—"}</span></td>
      <td>${c.price ? `<strong>$${c.price}</strong>` : `<span style="color:var(--success);font-weight:700">${t('free')}</span>`}</td>
      <td><div class="action-btns">
        <button class="tbl-btn" data-action="edit-course" data-id="${c.id}" data-name="${(c.name || "").replace(/"/g, "")}" data-instructor="${(c.instructor || "").replace(/"/g, "")}" data-type="${c.type || "PDF"}" data-price="${c.price || 0}" data-desc="${(c.description || "").replace(/"/g, "")}" data-category="${(c.category || "").replace(/"/g, "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="tbl-btn danger" data-action="del-course" data-id="${c.id}" data-name="${(c.name || "").replace(/"/g, "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`).join("")}
  </table></div>`;
  wrap.querySelectorAll("[data-action='edit-course']").forEach(btn => {
    btn.addEventListener("click", () => editCourse(btn.dataset.id, btn.dataset.name, btn.dataset.instructor, btn.dataset.type, btn.dataset.price, btn.dataset.desc, btn.dataset.category));
  });
  wrap.querySelectorAll("[data-action='del-course']").forEach(btn => {
    btn.addEventListener("click", () => showConfirm(`Delete "${btn.dataset.name}"?`, btn.dataset.id, "course"));
  });
}

function filterCourses() {
  const s = ($("course-search")?.value || "").toLowerCase();
  renderCoursesTable(_coursesCache.filter(c => !s || (c.name || "").toLowerCase().includes(s) || (c.instructor || "").toLowerCase().includes(s)));
}

function openAddCourse() {
  editingCourseId = null;
  ["c-name", "c-instructor", "c-price", "c-desc", "c-category"].forEach(id => $(id) && ($(id).value = ""));
  $("c-type").value = "PDF";
  $("course-modal-title").textContent = t('addCourse');
  $("course-save-btn").textContent = t('addCourse');
  openModal("course-modal");
}

function editCourse(id, name, instructor, type, price, desc, category) {
  editingCourseId = id;
  $("c-name").value = name; $("c-instructor").value = instructor;
  $("c-type").value = type; $("c-price").value = price; $("c-desc").value = desc;
  if ($("c-category")) $("c-category").value = category || "";
  $("course-modal-title").textContent = t('editCourse');
  $("course-save-btn").textContent = t('saveChanges');
  openModal("course-modal");
}

$("course-save-btn").addEventListener("click", async () => {
  const name = ($("c-name").value || "").trim(), instructor = ($("c-instructor").value || "").trim();
  const type = $("c-type").value, price = parseFloat($("c-price").value) || 0;
  const description = ($("c-desc").value || "").trim(), category = ($("c-category")?.value || "General").trim();
  if (!name || !instructor) { showToast(t('fillAllRequiredFields'), "error"); return; }
  const btn = $("course-save-btn"); btn.disabled = true; btn.textContent = t('saving');
  try {
    if (editingCourseId) { await updateDoc(doc(db, "courses", editingCourseId), { name, instructor, type, price, description, category }); showToast(t('courseUpdated')); }
    else { await addDoc(collection(db, "courses"), { name, instructor, type, price, description, category, createdAt: serverTimestamp() }); showToast(t('courseAdded')); }
    closeModal("course-modal"); loadCourses();
  } catch (err) { showToast("Error: " + err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = editingCourseId ? "Save Changes" : "Add Course"; }
});

// ═══════════════════════════════════════════════════════════════
// ── JOB OFFERS ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadJobs() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('jobOffers')}</h1><p>${t('manageCareerOpportunities')}</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="job-search" placeholder="${t('searchJobs')}" /></div>
        <select class="filter-select" id="job-status-filter"><option value="">${t('allRoles')}</option><option>Active</option><option>Pending</option><option>Closed</option></select>
        <select class="filter-select" id="job-type-filter"><option value="">${t('allRoles')}</option><option>Full-time</option><option>Part-time</option><option>Remote</option><option>Internship</option><option>Freelance</option></select>
        <button class="btn btn-purple" id="add-job-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>${t('addUser')}</button>
      </div>
      <div id="jobs-table-wrap"><div class="empty-state"><p>${t('loading')}</p></div></div>
    </div>`;
  $("add-job-btn").addEventListener("click", openAddJob);
  $("job-search").addEventListener("input", filterJobs);
  $("job-status-filter").addEventListener("change", filterJobs);
  $("job-type-filter").addEventListener("change", filterJobs);
  try {
    const snap = await getDocs(collection(db, "offers"));
    _jobsCache = [];
    snap.forEach(d => {
      const data = d.data();
      _jobsCache.push({
        id: d.id,
        title: data.title || data.jobTitle || data.poste || "—",
        company: data.company || data.entreprise || data.companyName || "—",
        location: data.location || data.ville || data.city || "—",
        type: data.type || data.contractType || data.jobType || "Full-time",
        salary: data.salary || data.salaire || "",
        status: data.status || "Active",
        description: data.description || data.desc || "",
        createdAt: data.createdAt || null,
      });
    });
    renderJobsTable(_jobsCache);
  } catch (err) { $("jobs-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`; }
}

function renderJobsTable(jobs) {
  const wrap = $("jobs-table-wrap");
  if (!jobs?.length) { wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg><h4>${t('noJobOffersYet')}</h4><p>${t('manageCareerOpportunities')}</p></div>`; return; }
  const statusClass = { Active: "status-active", Pending: "status-pending", Closed: "status-closed" };
  const typeBadge = { "Full-time": "badge-blue", "Part-time": "badge-purple", "Remote": "badge-green", "Internship": "badge-orange", "Freelance": "badge-teal" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>${t('course')}</th><th>${t('company')}</th><th>${t('location')}</th><th>${t('type')}</th><th>${t('salary')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr>
    ${jobs.map(j => `<tr>
      <td><strong>${j.title || "—"}</strong></td>
      <td style="color:var(--muted)">${j.company || "—"}</td>
      <td style="color:var(--muted)">${j.location || "—"}</td>
      <td><span class="badge ${typeBadge[j.type] || "badge-gray"}">${j.type || "—"}</span></td>
      <td style="font-size:13px">${j.salary || "—"}</td>
      <td><span class="status-dot ${statusClass[j.status] || "status-closed"}">${j.status || "—"}</span></td>
      <td><div class="action-btns">
        <button class="tbl-btn" data-action="edit-job" data-id="${j.id}" data-title="${(j.title || "").replace(/"/g, "")}" data-company="${(j.company || "").replace(/"/g, "")}" data-location="${(j.location || "").replace(/"/g, "")}" data-type="${j.type || "Full-time"}" data-salary="${(j.salary || "").replace(/"/g, "")}" data-status="${j.status || "Active"}" data-desc="${(j.description || "").replace(/"/g, "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="tbl-btn danger" data-action="del-job" data-id="${j.id}" data-name="${(j.title || "").replace(/"/g, "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`).join("")}
  </table></div>`;
  wrap.querySelectorAll("[data-action='edit-job']").forEach(btn => {
    btn.addEventListener("click", () => editJob(btn.dataset));
  });
  wrap.querySelectorAll("[data-action='del-job']").forEach(btn => {
    btn.addEventListener("click", () => showConfirm(`Delete job "${btn.dataset.name}"?`, btn.dataset.id, "offer"));
  });
}

function filterJobs() {
  const s = ($("job-search")?.value || "").toLowerCase();
  const st = $("job-status-filter")?.value || "";
  const ty = $("job-type-filter")?.value || "";
  renderJobsTable(_jobsCache.filter(j =>
    (!s || (j.title || "").toLowerCase().includes(s) || (j.company || "").toLowerCase().includes(s)) &&
    (!st || j.status === st) && (!ty || j.type === ty)
  ));
}

function openAddJob() {
  editingJobId = null;
  ["j-title", "j-company", "j-location", "j-salary", "j-desc"].forEach(id => $(id) && ($(id).value = ""));
  if ($("j-type")) $("j-type").value = "Full-time";
  if ($("j-status")) $("j-status").value = "Active";
  $("job-modal-title").textContent = t('postJobOffer');
  $("job-save-btn").textContent = t('postJob');
  openModal("job-modal");
}

function editJob(d) {
  editingJobId = d.id;
  $("j-title").value = d.title || "";
  $("j-company").value = d.company || "";
  $("j-location").value = d.location || "";
  $("j-type").value = d.type || "Full-time";
  $("j-salary").value = d.salary || "";
  $("j-status").value = d.status || "Active";
  $("j-desc").value = d.desc || "";
  $("job-modal-title").textContent = t('editJobOffer');
  $("job-save-btn").textContent = t('saveChanges');
  openModal("job-modal");
}

$("job-save-btn").addEventListener("click", async () => {
  const title = ($("j-title").value || "").trim();
  const company = ($("j-company").value || "").trim();
  if (!title || !company) { showToast(t('fillAllRequiredFields'), "error"); return; }
  const data = {
    title, company,
    location: ($("j-location").value || "").trim(),
    type: $("j-type").value,
    salary: ($("j-salary").value || "").trim(),
    status: $("j-status").value,
    description: ($("j-desc").value || "").trim(),
  };
  const btn = $("job-save-btn"); btn.disabled = true; btn.textContent = t('saving');
  try {
    if (editingJobId) { await updateDoc(doc(db, "offers", editingJobId), data); showToast(t('jobUpdated')); }
    else { await addDoc(collection(db, "offers"), { ...data, createdAt: serverTimestamp() }); showToast(t('jobPosted')); }
    closeModal("job-modal"); loadJobs();
  } catch (err) { showToast("Error: " + err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = editingJobId ? t('saveChanges') : t('postJob'); }
});

// ═══════════════════════════════════════════════════════════════
// ── CERTIFICATES ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadCertificates() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('certificates')}</h1><p>${t('issueAndManageCertificates')}</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="cert-search" placeholder="${t('searchCertificates')}" /></div>
        <select class="filter-select" id="cert-grade-filter"><option value="">${t('allRoles')}</option><option>Distinction</option><option>Merit</option><option>Pass</option></select>
        <button class="btn btn-purple" id="add-cert-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>${t('addUser')}</button>
      </div>
      <div id="certs-table-wrap"><div class="empty-state"><p>${t('loading')}</p></div></div>
    </div>`;
  $("add-cert-btn").addEventListener("click", openAddCert);
  $("cert-search").addEventListener("input", filterCerts);
  $("cert-grade-filter").addEventListener("change", filterCerts);
  const today = new Date().toISOString().split("T")[0];
  if ($("cert-date")) $("cert-date").value = today;
  try {
    const snap = await getDocs(collection(db, "certificates"));
    _certsCache = [];
    snap.forEach(d => _certsCache.push({ id: d.id, ...d.data() }));
    renderCertsTable(_certsCache);
  } catch (err) { $("certs-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`; }
}

function renderCertsTable(certs) {
  const wrap = $("certs-table-wrap");
  if (!certs?.length) { wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg><h4>${t('noCertificatesIssued')}</h4><p>${t('issueAndManageCertificates')}</p></div>`; return; }
  const gradeBadge = { Distinction: "badge-purple", Merit: "badge-blue", Pass: "badge-green" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>${t('learner')}</th><th>${t('course')}</th><th>${t('certificateId')}</th><th>${t('grade')}</th><th>${t('issueDate')}</th><th>${t('actions')}</th></tr>
    ${certs.map(c => `<tr>
      <td><div style="display:flex;align-items:center;gap:9px;"><div class="avatar" style="width:28px;height:28px;font-size:11px;">${(c.learner || "?").charAt(0).toUpperCase()}</div><strong>${c.learner || "—"}</strong></div></td>
      <td style="color:var(--muted)">${c.course || "—"}</td>
      <td><code style="font-size:11px;background:var(--bg);padding:2px 7px;border-radius:5px;letter-spacing:0.3px;">${c.certId || "—"}</code></td>
      <td><span class="badge ${gradeBadge[c.grade] || "badge-gray"}">${c.grade || "—"}</span></td>
      <td style="color:var(--muted);font-size:13px">${c.issueDate || fmtDate(c.createdAt)}</td>
      <td><div class="action-btns">
        <button class="tbl-btn" title="Download" onclick="showToast('Certificate download coming soon','info')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        </button>
        <button class="tbl-btn danger" data-action="del-cert" data-id="${c.id}" data-name="${(c.learner || "").replace(/"/g, "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`).join("")}
  </table></div>`;
  wrap.querySelectorAll("[data-action='del-cert']").forEach(btn => {
    btn.addEventListener("click", () => showConfirm(`Revoke certificate for "${btn.dataset.name}"?`, btn.dataset.id, "cert"));
  });
}

function filterCerts() {
  const s = ($("cert-search")?.value || "").toLowerCase();
  const g = $("cert-grade-filter")?.value || "";
  renderCertsTable(_certsCache.filter(c =>
    (!s || (c.learner || "").toLowerCase().includes(s) || (c.course || "").toLowerCase().includes(s)) &&
    (!g || c.grade === g)
  ));
}

function openAddCert() {
  editingCertId = null;
  $("cert-learner").value = ""; $("cert-course").value = "";
  $("cert-grade").value = "Distinction";
  $("cert-date").value = new Date().toISOString().split("T")[0];
  $("cert-id").value = genCertId();
  $("cert-modal-title").textContent = t('addUser');
  $("cert-save-btn").textContent = t('addUser');
  openModal("cert-modal");
}

$("cert-save-btn").addEventListener("click", async () => {
  const learner = ($("cert-learner").value || "").trim();
  const course = ($("cert-course").value || "").trim();
  if (!learner || !course) { showToast(t('fillAllRequiredFields'), "error"); return; }
  const certId = $("cert-id").value || genCertId();
  const grade = $("cert-grade").value;
  const issueDate = $("cert-date").value;
  const btn = $("cert-save-btn"); btn.disabled = true; btn.textContent = t('issuing');
  try {
    await addDoc(collection(db, "certificates"), { learner, course, certId, grade, issueDate, createdAt: serverTimestamp() });
    showToast(t('certificateIssuedSuccessfully'));
    closeModal("cert-modal"); loadCertificates();
  } catch (err) { showToast("Error: " + err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = t('addUser'); }
});

// ═══════════════════════════════════════════════════════════════
// ── PAYMENTS ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadPayments() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('payments')}</h1><p>${t('trackTransactions')}</p></div>
    </div>
    <div class="stat-grid stat-grid-2" style="margin-bottom:20px;" id="pay-stats">
      <div class="stat-card"><div class="skeleton" style="height:70px;border-radius:8px;"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:70px;border-radius:8px;"></div></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="pay-search" placeholder="${t('searchByUserOrCourse')}" /></div>
        <select class="filter-select" id="pay-status-filter"><option value="">${t('allRoles')}</option><option>Completed</option><option>Pending</option><option>Refunded</option></select>
        <button class="btn btn-purple" id="add-pay-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>${t('addUser')}</button>
      </div>
      <div id="pay-table-wrap"><div class="empty-state"><p>${t('loading')}</p></div></div>
    </div>`;
  $("add-pay-btn").addEventListener("click", () => {
    showToast("Manual transaction entry coming soon", "info");
  });
  $("pay-search").addEventListener("input", filterPayments);
  $("pay-status-filter").addEventListener("change", filterPayments);
  try {
    const snap = await getDocs(collection(db, "payments"));
    _paymentsCache = [];
    snap.forEach(d => _paymentsCache.push({ id: d.id, ...d.data() }));
    const total = _paymentsCache.filter(p => p.status === "Completed").reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const pending = _paymentsCache.filter(p => p.status === "Pending").reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    $("pay-stats").innerHTML = `
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon" style="background:linear-gradient(135deg,var(--success),#16a34a)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg></div>
          <div class="stat-trend up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>+18%</div>
        </div>
        <div class="stat-label">Total Revenue</div><div class="stat-value">$${total.toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon" style="background:linear-gradient(135deg,var(--warning),#f97316)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg></div>
        </div>
        <div class="stat-label">Pending Payments</div><div class="stat-value">$${pending.toFixed(2)}</div>
      </div>`;
    renderPaymentsTable(_paymentsCache);
  } catch (err) { $("pay-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`; }
}

function renderPaymentsTable(payments) {
  const wrap = $("pay-table-wrap");
  if (!payments?.length) { wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg><h4>${t('noTransactionsYet')}</h4><p>${t('trackTransactions')}</p></div>`; return; }
  const statusBadge = { Completed: "badge-green", Pending: "badge-orange", Refunded: "badge-gray" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>${t('transactionId')}</th><th>${t('user')}</th><th>${t('course')}</th><th>${t('amount')}</th><th>${t('method')}</th><th>${t('status')}</th><th>${t('date')}</th><th>${t('actions')}</th></tr>
    ${payments.map(p => `<tr>
      <td><code style="font-size:11px;background:var(--bg);padding:2px 7px;border-radius:5px;">${p.txId || p.id.slice(0, 8).toUpperCase()}</code></td>
      <td>${p.user || "—"}</td>
      <td style="color:var(--muted)">${p.course || "—"}</td>
      <td><strong style="color:var(--success)">$${parseFloat(p.amount || 0).toFixed(2)}</strong></td>
      <td style="color:var(--muted)">${p.method || "—"}</td>
      <td><span class="badge ${statusBadge[p.status] || "badge-gray"}">${p.status || "—"}</span></td>
      <td style="color:var(--muted);font-size:13px">${p.date || fmtDate(p.createdAt)}</td>
      <td><div class="action-btns">
        <button class="tbl-btn" title="View receipt" onclick="showToast('Receipt viewer coming soon','info')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </button>
        <button class="tbl-btn danger" data-action="del-pay" data-id="${p.id}" data-name="${p.txId || p.id.slice(0, 8)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`).join("")}
  </table></div>`;
  wrap.querySelectorAll("[data-action='del-pay']").forEach(btn => {
    btn.addEventListener("click", () => showConfirm(`Delete transaction "${btn.dataset.name}"?`, btn.dataset.id, "payment"));
  });
}

function filterPayments() {
  const s = ($("pay-search")?.value || "").toLowerCase();
  const st = $("pay-status-filter")?.value || "";
  renderPaymentsTable(_paymentsCache.filter(p =>
    (!s || (p.user || "").toLowerCase().includes(s) || (p.course || "").toLowerCase().includes(s)) &&
    (!st || p.status === st)
  ));
}

// ═══════════════════════════════════════════════════════════════
// ── STATISTICS ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function renderStatistics() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('statistics')}</h1><p>${t('platformAnalytics')}</p></div>
    </div>
    <div id="stats-loading">
      <div class="stat-grid stat-grid-4" style="margin-bottom:20px;">
        ${[1, 2, 3, 4].map(() => `<div class="stat-card"><div class="skeleton" style="height:100px;border-radius:8px;"></div></div>`).join("")}
      </div>
      <div class="grid-2">
        <div class="card"><div class="skeleton" style="height:220px;border-radius:8px;"></div></div>
        <div class="card"><div class="skeleton" style="height:220px;border-radius:8px;"></div></div>
      </div>
    </div>
    <div id="stats-content" style="display:none;"></div>`;

  try {
    const [usersSnap, coursesSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "courses"))
    ]);
    let certsSnap, offersSnap, paymentsSnap;
    try { certsSnap = await getDocs(collection(db, "certificates")); } catch (_) { }
    try { offersSnap = await getDocs(collection(db, "offers")); } catch (_) { }
    try { paymentsSnap = await getDocs(collection(db, "payments")); } catch (_) { }

    const totalUsers = usersSnap.size;
    const totalCourses = coursesSnap.size;
    const totalCerts = certsSnap?.size || 0;
    const totalOffers = offersSnap?.size || 0;
    const totalRevenue = paymentsSnap?.docs.filter(d => d.data().status === "Completed").reduce((s, d) => s + (parseFloat(d.data().amount) || 0), 0) || 0;
    const pendingRev = paymentsSnap?.docs.filter(d => d.data().status === "Pending").reduce((s, d) => s + (parseFloat(d.data().amount) || 0), 0) || 0;
    const totalTx = paymentsSnap?.size || 0;

    // Role breakdown
    const roleCounts = {};
    usersSnap.docs.forEach(d => { const r = d.data().role || "Unknown"; roleCounts[r] = (roleCounts[r] || 0) + 1; });
    const roleColors = { Admin: "var(--primary)", Instructor: "var(--accent)", Learner: "var(--success)", Recruiter: "var(--warning)", Unknown: "var(--muted)" };
    const roleBadgeMap = { Admin: "badge-purple", Instructor: "badge-blue", Learner: "badge-green", Recruiter: "badge-orange", Unknown: "badge-gray" };

    // Job status breakdown
    const jobStatus = { Active: 0, Pending: 0, Closed: 0 };
    offersSnap?.docs.forEach(d => { const s = d.data().status || "Active"; if (jobStatus[s] !== undefined) jobStatus[s]++; });

    // Course type breakdown
    const courseTypes = {};
    coursesSnap.docs.forEach(d => { const t = d.data().type || "Other"; courseTypes[t] = (courseTypes[t] || 0) + 1; });
    const typeColors = { PDF: "#ef4444", MP4: "#3b82f6", PPTX: "#f97316", DOC: "#8b5cf6", MP3: "#22c55e", Other: "#64748b" };

    // Cert grade breakdown
    const gradeCount = { Distinction: 0, Merit: 0, Pass: 0 };
    certsSnap?.docs.forEach(d => { const g = d.data().grade; if (gradeCount[g] !== undefined) gradeCount[g]++; });

    $("stats-loading").style.display = "none";
    $("stats-content").style.display = "block";
    $("stats-content").innerHTML = `

      <!-- KPI Row -->
      <div class="stat-grid stat-grid-4" style="margin-bottom:20px;">
        <div class="stat-card">
          <div class="stat-card-top">
            <div class="stat-icon" style="background:linear-gradient(135deg,var(--primary),#6b63ff)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="stat-trend up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>Live</div>
          </div>
          <div class="stat-label">${t('totalUsers')}</div>
          <div class="stat-value">${totalUsers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-top">
            <div class="stat-icon" style="background:linear-gradient(135deg,var(--success),#16a34a)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            </div>
            <div class="stat-trend up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>Live</div>
          </div>
          <div class="stat-label">${t('totalRevenue')}</div>
          <div class="stat-value">$${totalRevenue.toFixed(0)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-top">
            <div class="stat-icon" style="background:linear-gradient(135deg,var(--accent),#0ea5e9)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            </div>
            <div class="stat-trend up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>Live</div>
          </div>
          <div class="stat-label">${t('courses')}</div>
          <div class="stat-value">${totalCourses}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-top">
            <div class="stat-icon" style="background:linear-gradient(135deg,var(--warning),#f97316)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
            </div>
            <div class="stat-trend up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>Live</div>
          </div>
          <div class="stat-label">${t('certificates')}</div>
          <div class="stat-value">${totalCerts}</div>
        </div>
      </div>

      <!-- Row 2: Users by Role + Course Types -->
      <div class="grid-2" style="margin-bottom:20px;">
        <div class="card">
          <div class="card-header"><h3>${t('userRoles')}</h3><span class="meta">${totalUsers} total</span></div>
          ${totalUsers ? Object.entries(roleCounts).map(([role, count]) => {
      const pct = Math.round((count / totalUsers) * 100);
      return `<div style="margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
                <span class="badge ${roleBadgeMap[role] || "badge-gray"}">${role}</span>
                <span style="font-size:13px;font-weight:700;">${count} <span style="color:var(--muted);font-weight:400;">(${pct}%)</span></span>
              </div>
              <div class="progress-bar" style="height:10px;">
                <div class="progress-fill" style="width:${pct}%;background:${roleColors[role] || "var(--muted)"};"></div>
              </div>
            </div>`;
    }).join("") : `<div class="empty-state"><p>No users yet</p></div>`}
        </div>
        <div class="card">
          <div class="card-header"><h3>${t('courses')}</h3><span class="meta">${totalCourses} total</span></div>
          ${totalCourses ? Object.entries(courseTypes).map(([type, count]) => {
      const pct = Math.round((count / totalCourses) * 100);
      return `<div style="margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
                <span class="badge" style="background:${typeColors[type] || "#64748b"}22;color:${typeColors[type] || "#64748b"};">${type}</span>
                <span style="font-size:13px;font-weight:700;">${count} <span style="color:var(--muted);font-weight:400;">(${pct}%)</span></span>
              </div>
              <div class="progress-bar" style="height:10px;">
                <div class="progress-fill" style="width:${pct}%;background:${typeColors[type] || "#64748b"};"></div>
              </div>
            </div>`;
    }).join("") : `<div class="empty-state"><p>No courses yet</p></div>`}
        </div>
      </div>

      <!-- Row 3: Job Offers Status + Payments + Certs -->
      <div class="grid-2" style="margin-bottom:20px;">
        <div class="card">
          <div class="card-header"><h3>${t('jobOffers')}</h3><span class="meta">${totalOffers} total</span></div>
          ${[
        { label: "Active", count: jobStatus.Active, color: "var(--success)", badge: "badge-green" },
        { label: "Pending", count: jobStatus.Pending, color: "var(--warning)", badge: "badge-orange" },
        { label: "Closed", count: jobStatus.Closed, color: "var(--muted)", badge: "badge-gray" },
      ].map(s => {
        const pct = totalOffers ? Math.round((s.count / totalOffers) * 100) : 0;
        return `<div style="margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
                <span class="badge ${s.badge}">${s.label}</span>
                <span style="font-size:13px;font-weight:700;">${s.count} <span style="color:var(--muted);font-weight:400;">(${pct}%)</span></span>
              </div>
              <div class="progress-bar" style="height:10px;">
                <div class="progress-fill" style="width:${pct}%;background:${s.color};"></div>
              </div>
            </div>`;
      }).join("")}
        </div>
        <div class="card">
          <div class="card-header"><h3>${t('payments')}</h3><span class="meta">${totalTx} transactions</span></div>
          ${[
        { icon: "💰", label: "Completed Revenue", value: `$${totalRevenue.toFixed(2)}`, color: "var(--success)" },
        { icon: "⏳", label: "Pending Amount", value: `$${pendingRev.toFixed(2)}`, color: "var(--warning)" },
        { icon: "🧾", label: "Total Transactions", value: totalTx, color: "var(--primary)" },
      ].map(p => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border);">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:38px;height:38px;border-radius:10px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:18px;">${p.icon}</div>
                <span style="font-size:14px;font-weight:500;">${p.label}</span>
              </div>
              <span style="font-size:17px;font-weight:800;color:${p.color};font-family:'Outfit',sans-serif;">${p.value}</span>
            </div>`).join("")}
        </div>
      </div>

      <!-- Row 4: Certificate Grades -->
      <div class="card">
        <div class="card-header"><h3>${t('certificates')}</h3><span class="meta">${totalCerts} issued</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding-top:4px;">
          ${[
        { label: "Distinction", count: gradeCount.Distinction, color: "#8b5cf6", bg: "#ede9fe", icon: "🥇" },
        { label: "Merit", count: gradeCount.Merit, color: "#3b82f6", bg: "#dbeafe", icon: "🥈" },
        { label: "Pass", count: gradeCount.Pass, color: "#22c55e", bg: "#dcfce7", icon: "🥉" },
      ].map(g => `
            <div style="background:${g.bg};border-radius:12px;padding:20px;text-align:center;">
              <div style="font-size:28px;margin-bottom:8px;">${g.icon}</div>
              <div style="font-size:28px;font-weight:800;color:${g.color};font-family:'Outfit',sans-serif;">${g.count}</div>
              <div style="font-size:13px;font-weight:600;color:${g.color};margin-top:4px;">${g.label}</div>
            </div>`).join("")}
        </div>
      </div>`;

  } catch (err) {
    $("stats-loading").style.display = "none";
    $("stats-content").style.display = "block";
    $("stats-content").innerHTML = `<div class="empty-state"><p>Error loading statistics: ${err.message}</p></div>`;
  }
}

function renderSettings() {
  const currentLang = localStorage.getItem('language') || 'en';
  const darkMode = localStorage.getItem('darkMode') === 'true';

  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('settings')}</h1><p>${t('configurePreferences')}</p></div>
    </div>

    <!-- Account Section -->
    <div class="card settings-section" style="border-left: 4px solid var(--primary);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <h3>${t('settingsAccount')}</h3>
      </div>
      <div class="settings-grid">
        <div class="settings-field">
          <label>${t('emailAddress')}</label>
          <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted);"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            <span style="color:var(--text);font-weight:500;">${currentUser?.email || "—"}</span>
          </div>
        </div>
        <div class="settings-field">
          <label>${t('role')}</label>
          <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--primary);"><circle cx="12" cy="12" r="10"/><path d="M12 6v6m3-3H9"/></svg>
            <span style="color:var(--text);font-weight:500;background:var(--primary-light);padding:4px 10px;border-radius:6px;">${t('administrator')}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Change Password Section -->
    <div class="card settings-section" style="border-left: 4px solid var(--warning);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <h3>${t('changePassword')}</h3>
      </div>
      <div class="settings-grid">
        <div class="settings-field"><label>${t('currentPassword')}</label><input type="password" id="current-password" placeholder="••••••••"/></div>
        <div class="settings-field"><label>${t('newPassword')}</label><input type="password" id="new-password" placeholder="••••••••"/></div>
        <div class="settings-field"><label>${t('confirmPassword')}</label><input type="password" id="confirm-password" placeholder="••••••••"/></div>
      </div>
      <button class="btn btn-primary" id="change-password-btn" style="margin-top:20px;align-self:flex-start;">${t('changePasswordBtn')}</button>
    </div>

    <!-- Preferences Section -->
    <div class="card settings-section" style="border-left: 4px solid var(--accent);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24"/></svg>
        <h3>${t('preferences')}</h3>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div class="settings-field">
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.5 12a10.5 10.5 0 1 1-21 0 10.5 10.5 0 0 1 21 0"/><path d="M14 12h-4m6-6a6 6 0 0 0-12 0m6 12a6 6 0 0 0-6-6"/></svg>
            ${t('language')}
          </label>
          <select id="language-select" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--white);color:var(--text);font-weight:500;cursor:pointer;">
            <option value="en" ${currentLang === 'en' ? 'selected' : ''}>${t('english')}</option>
            <option value="fr" ${currentLang === 'fr' ? 'selected' : ''}>${t('francais')}</option>
            <option value="ar" ${currentLang === 'ar' ? 'selected' : ''}>${t('arabic')}</option>
          </select>
        </div>
        <div class="settings-field">
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ${t('theme')}
          </label>
          <div class="toggle" id="dark-mode-toggle-container" style="justify-content:flex-start;">
            <input type="checkbox" id="dark-mode-toggle" ${darkMode ? 'checked' : ''}>
            <div class="track">
              <div class="thumb"></div>
            </div>
            <span class="toggle-label" style="margin-left:10px;">${darkMode ? t('dark') : t('light')}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Support Section -->
    <div class="card settings-section" style="border-left: 4px solid var(--success);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <h3>${t('support')}</h3>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:linear-gradient(135deg, rgba(34,197,94,0.05) 0%, rgba(34,197,94,0.02) 100%);border-radius:10px;border:1px solid var(--border);">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;">${t('contactSupport')}</div>
          <div style="font-size:13px;color:var(--muted);">${t('supportDescription')}</div>
        </div>
        <button class="btn btn-primary" onclick="window.open('mailto:support@formanova.com')" style="white-space:nowrap;margin-left:20px;">${t('contactSupport')}</button>
      </div>
    </div>

    <!-- Sign Out Section -->
    <div class="card settings-section" style="border-left: 4px solid var(--danger);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <h3>${t('signOut')}</h3>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(239,68,68,0.02) 100%);border-radius:10px;border:1px solid var(--border);">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;">${t('signOut')}</div>
          <div style="font-size:13px;color:var(--muted);">${t('signOutDescription')}</div>
        </div>
        <button class="btn btn-danger" id="sign-out-btn" style="white-space:nowrap;margin-left:20px;">${t('signOut')}</button>
      </div>
    </div>

    <div class="card settings-section">
      <div class="card-header"><h3>${t('dangerZone')}</h3></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.03) 100%);border-radius:10px;border:1.5px solid var(--danger);">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--danger);">${t('clearData')}</div>
          <div style="font-size:13px;color:var(--muted);">${t('clearDataDesc')}</div>
        </div>
        <button class="btn btn-danger" onclick="showToast('This action is disabled in demo mode','error')" style="white-space:nowrap;margin-left:20px;">${t('clearData')}</button>
      </div>
    </div>`;

  // Add event listeners
  const langSelect = $('language-select');
  const darkToggleContainer = $('dark-mode-toggle-container');
  const changePasswordBtn = $('change-password-btn');
  const signOutBtn = $('sign-out-btn');

  if (langSelect) {
    langSelect.addEventListener('change', (e) => {
      changeLanguage(e.target.value);
    });
  }

  if (darkToggleContainer) {
    darkToggleContainer.addEventListener('click', (e) => {
      const checkbox = darkToggleContainer.querySelector('#dark-mode-toggle');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        toggleDarkMode(checkbox.checked);
        const label = darkToggleContainer.querySelector('.toggle-label');
        if (label) label.textContent = checkbox.checked ? t('dark') : t('light');
      }
    });
  }

  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', changePasswordHandler);
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', signOutHandler);
  }
}

// ── Change Password Handler ────────────────────────────────────────
async function changePasswordHandler() {
  const currentPassword = $('current-password')?.value?.trim();
  const newPassword = $('new-password')?.value?.trim();
  const confirmPassword = $('confirm-password')?.value?.trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast(t('fillAllRequiredFields'), 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast(t('passwordsDoNotMatch'), 'error');
    return;
  }

  if (newPassword.length < 6) {
    showToast(t('passwordTooShort'), 'error');
    return;
  }

  const btn = $('change-password-btn');
  const originalText = btn.textContent;
  btn.textContent = t('saving');
  btn.disabled = true;

  try {
    // Re-authenticate the user with current password
    const user = auth.currentUser;
    if (!user || !user.email) {
      showToast(t('sessionExpired'), 'error');
      navigate('login');
      return;
    }

    // Re-authenticate using email and password
    const credential = await signInWithEmailAndPassword(auth, user.email, currentPassword);
    
    // Update password
    await updatePassword(credential.user, newPassword);
    
    // Clear password fields
    $('current-password').value = '';
    $('new-password').value = '';
    $('confirm-password').value = '';
    
    showToast(t('passwordChanged'), 'success');
  } catch (error) {
    if (error.code === 'auth/wrong-password') {
      showToast(t('invalidPassword'), 'error');
    } else if (error.code === 'auth/weak-password') {
      showToast(t('passwordTooShort'), 'error');
    } else {
      console.error('Password change error:', error);
      showToast(t('errorMsg') + ': ' + error.message, 'error');
    }
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ── Sign Out Handler ────────────────────────────────────────────────
async function signOutHandler() {
  if (!confirm(t('areYouSureSignOut'))) {
    return;
  }

  const btn = $('sign-out-btn');
  const originalText = btn.textContent;
  btn.textContent = t('signingOut');
  btn.disabled = true;

  try {
    await signOut(auth);
    localStorage.removeItem('currentUser');
    navigate('login');
    showToast(t('success'), 'success');
  } catch (error) {
    console.error('Sign out error:', error);
    showToast(t('errorMsg') + ': ' + error.message, 'error');
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ── App Usage Tracker ──────────────────────────────────────────────
let usageTrackingInterval = null;
function trackAppUsage() {
  // Clear any existing interval
  if (usageTrackingInterval) clearInterval(usageTrackingInterval);
  
  function updateUsage() {
    const dailyUsage = JSON.parse(localStorage.getItem('dailyUsage') || '{}');
    const today = new Date().toDateString();
    
    // Initialize today's usage if not exists
    if (!dailyUsage[today]) {
      dailyUsage[today] = 1; // Start with 1 minute
    } else {
      dailyUsage[today]++;
    }
    
    // Clean up old entries (keep last 90 days)
    const today_obj = new Date();
    for (const date in dailyUsage) {
      const entryDate = new Date(date);
      const daysOld = Math.floor((today_obj - entryDate) / (1000 * 60 * 60 * 24));
      if (daysOld > 90) {
        delete dailyUsage[date];
      }
    }
    
    localStorage.setItem('dailyUsage', JSON.stringify(dailyUsage));
  }
  
  // Update every minute (60000 ms)
  updateUsage(); // Update immediately on first call
  usageTrackingInterval = setInterval(updateUsage, 60000);
}
