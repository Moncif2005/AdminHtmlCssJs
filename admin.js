import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
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
  setDoc,
  onSnapshot,
  limit,
  writeBatch,
  collectionGroup
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
    const currentPage = window.location.hash.substring(1) || 'dashboard';
    buildSidebar();
    navigate(currentPage);
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
let _applicationsCache = [];
let _notifsUnsubscribe = null; // real-time listener cleanup

// ── Helpers ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showToast(msg, type = "success") {
  const toast = $("toast");
  toast.textContent = msg;
  toast.className = type;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3500);
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

function fmtTimeAgo(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return fmtDate(ts);
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

    loadTranslations(currentLanguage).then(() => {
      buildSidebar();
      initTheme();
      startRealtimeNotifications(); // 🔔 Start real-time Firebase notifications
      navigate("dashboard");
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
  if (_notifsUnsubscribe) { _notifsUnsubscribe(); _notifsUnsubscribe = null; }
  await signOut(auth);
  location.reload();
});

// ═══════════════════════════════════════════════════════════════
// ── REAL-TIME FIREBASE NOTIFICATIONS ───────────────────────────
// ═══════════════════════════════════════════════════════════════

let _adminNotifs = []; // live cache of admin notifications

/**
 * Listens on the admin's own notifications subcollection in real-time.
 * Whenever a new notification arrives (e.g. new applicant, new user),
 * it updates the bell badge immediately.
 */
function startRealtimeNotifications() {
  if (!currentUser) return;
  if (_notifsUnsubscribe) _notifsUnsubscribe();

  const notifsRef = collection(db, "users", currentUser.uid, "notifications");
  const q = query(notifsRef, orderBy("createdAt", "desc"), limit(30));

  _notifsUnsubscribe = onSnapshot(q, (snap) => {
    _adminNotifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderNotifs();
  }, (err) => {
    console.error("Notification listener error:", err);
  });
}

/**
 * Push a notification to ANY user (including the admin themselves).
 * Used by admin actions like accepting/rejecting applications.
 */
async function pushNotification({ uid, title, body, type, payload = {} }) {
  try {
    // Get the user's FCM token
    const userDoc = await getDoc(doc(db, "users", uid));
    const fcmToken = userDoc.data()?.fcmToken || null;

    await addDoc(collection(db, "users", uid, "notifications"), {
      title,
      body,
      type,
      isUnread: true,
      createdAt: serverTimestamp(),
      payload,
      ...(fcmToken ? { fcmToken } : {}),
      fcmSent: false,
    });
  } catch (e) {
    console.error("pushNotification error:", e);
  }
}

function renderNotifs() {
  try {
    const prefs = getNotificationPreferences();

    // Filter by admin prefs — map firebase type → pref key
    const typeMap = {
      newApplicant: 'jobApplication',
      applicationAccepted: 'jobApplication',
      applicationRejected: 'jobApplication',
      applicationReviewing: 'jobApplication',
      applicationInterview: 'jobApplication',
      newUser: 'newUser',
      payment: 'payment',
      courseEnrolled: 'courseSubmission',
      certificateEarned: 'certificate',
      system: 'newUser',
    };

    const visibleNotifs = _adminNotifs.filter(n => {
      const prefKey = typeMap[n.type] || 'newUser';
      return prefs[prefKey] !== false;
    });

    const unread = visibleNotifs.filter(n => n.isUnread).length;
    const cnt = $("notif-count");
    cnt.textContent = unread;
    cnt.style.display = unread ? "flex" : "none";

    $("notif-list").innerHTML = visibleNotifs.length ? visibleNotifs.map(n => `
      <div class="notif-item" data-notif-id="${n.id}" data-unread="${n.isUnread}">
        <div class="notif-row">
          ${n.isUnread ? `<div class="notif-dot"></div>` : `<div style="width:7px;flex-shrink:0"></div>`}
          <div style="flex:1;">
            <div class="notif-title">${n.title || ""}</div>
            <div class="notif-msg">${n.body || ""}</div>
            <div class="notif-time">${fmtTimeAgo(n.createdAt)}</div>
          </div>
          <button class="notif-delete-btn" data-notif-id="${n.id}" style="background:none;border:none;cursor:pointer;padding:4px;color:var(--muted);font-size:18px;line-height:1;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>`).join("") :
      `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px;">${t('noNotifications')}</div>`;

    // Mark read on click
    $("notif-list").querySelectorAll(".notif-item").forEach(el => {
      el.addEventListener("click", async e => {
        if (e.target.closest('.notif-delete-btn')) return;
        const nid = el.dataset.notifId;
        if (el.dataset.unread === 'true') {
          await updateDoc(doc(db, "users", currentUser.uid, "notifications", nid), { isUnread: false });
        }
      });
    });

    // Delete
    $("notif-list").querySelectorAll(".notif-delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const nid = btn.dataset.notifId;
        await deleteDoc(doc(db, "users", currentUser.uid, "notifications", nid));
      });
    });
  } catch (err) {
    console.error('Error rendering notifications:', err);
  }
}

// Mark all read
$("mark-read-btn")?.addEventListener("click", async () => {
  if (!currentUser) return;
  const batch = writeBatch(db);
  _adminNotifs.filter(n => n.isUnread).forEach(n => {
    batch.update(doc(db, "users", currentUser.uid, "notifications", n.id), { isUnread: false });
  });
  await batch.commit();
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
  { id: "applications", label: "nav_applications", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>` },
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
    btn.innerHTML = item.icon + `<span>${t(item.label) || item.label}</span>`;
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
    applications: "Job Applications",
    payments: t('payments'),
    statistics: t('statistics'),
    settings: t('settings')
  };
  $("header-title").textContent = titles[page] || page;
  const pages = {
    dashboard: renderDashboard,
    users: loadUsers,
    courses: loadCourses,
    certificates: loadCertificates,
    jobs: loadJobs,
    applications: loadApplications,
    payments: loadPayments,
    statistics: renderStatistics,
    settings: renderSettings
  };
  if (pages[page]) pages[page]();
}

// ── DROPDOWNS ─────────────────────────────────────────────────
function toggleDropdown(id) {
  const dd = $(id);
  if (dd) dd.classList.toggle("open");
}

function closeAllDropdowns() {
  document.querySelectorAll(".dropdown-menu").forEach(d => d.classList.remove("open"));
}

$("go-settings-btn").addEventListener("click", () => { closeAllDropdowns(); navigate("settings"); });
$("mobile-toggle-btn").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
  $("sidebar-overlay").classList.toggle("open");
});
function closeMobileSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebar-overlay").classList.remove("open");
}
$("sidebar-overlay").addEventListener("click", closeMobileSidebar);

$("notif-btn").addEventListener("click", () => toggleDropdown("notif-dd"));
$("user-menu-btn").addEventListener("click", () => toggleDropdown("user-dd"));
document.addEventListener("click", e => {
  if (!e.target.closest(".dropdown-wrapper")) closeAllDropdowns();
});

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
    <tr><th>${t('user')}</th><th>${t('email')}</th><th>${t('role')}</th><th>Status</th><th>${t('actions')}</th></tr>
    ${users.map(u => `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="width:32px;height:32px;font-size:12px;">${(u.name || u.displayName || u.email || "?").charAt(0).toUpperCase()}</div><strong>${u.name || u.displayName || "—"}</strong></div></td>
      <td style="color:var(--muted)">${u.email || ""}</td>
      <td>${roleBadge(u.role)}</td>
      <td><span class="status-dot ${u.isActive !== false ? 'status-active' : 'status-closed'}">${u.isActive !== false ? 'Active' : 'Inactive'}</span></td>
      <td><div class="action-btns">
        <button class="tbl-btn" data-action="edit-user" data-id="${u.id}" data-name="${(u.name || u.displayName || "").replace(/"/g, "")}" data-email="${u.email || ""}" data-role="${u.role || ""}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="tbl-btn danger" data-action="del-user" data-id="${u.id}" data-name="${(u.name || u.displayName || u.email || "").replace(/"/g, "")}">
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
    (!search || (u.name || u.displayName || "").toLowerCase().includes(search) || (u.email || "").toLowerCase().includes(search)) &&
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

$("user-save-btn").addEventListener("click", async () => {
  const name = $("u-name").value.trim();
  const email = $("u-email").value.trim();
  const role = $("u-type").value;
  const phone = ($("u-phone")?.value || "").trim();
  const password = $("u-password").value.trim();

  if (!name || !email) { showToast(t('fillAllRequiredFields'), "error"); return; }

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
        btn.disabled = false; btn.textContent = t('addUser'); return;
      }
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        await setDoc(doc(db, "users", userId), {
          name, email, role, phone,
          isActive: true,
          createdAt: serverTimestamp()
        });
        // Notify admin that a new user was added
        await pushNotification({
          uid: currentUser.uid,
          title: "New User Added",
          body: `${name} (${role}) was created by admin.`,
          type: "newUser",
          payload: { userId }
        });
        showToast(t('userAddedSuccessfully'));
      } catch (authError) {
        let errorMsg = authError.message;
        if (authError.code === "auth/email-already-in-use") errorMsg = t('emailAlreadyRegistered');
        else if (authError.code === "auth/weak-password") errorMsg = t('passwordAtLeast6Chars');
        showToast(t('errorMsg') + ": " + errorMsg, "error");
        btn.disabled = false; btn.textContent = t('addUser'); return;
      }
    }
    closeModal("user-modal");
    loadUsers();
  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = editingUserId ? t('saveChanges') : t('addUser');
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

    <!-- ROW 2 -->
    <div class="grid-2" style="margin-bottom:20px;">
      <div class="card">
        <div class="card-header">
          <h3>${t('recentUsers')}</h3>
          <button class="btn btn-outline" style="padding:6px 12px;font-size:12px;" onclick="navigate('users')">${t('viewAll')}</button>
        </div>
        <div id="dash-recent"><div class="empty-state"><p>Loading...</p></div></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Pending Applications</h3><button class="btn btn-outline" style="padding:6px 12px;font-size:12px;" onclick="navigate('applications')">Review All</button></div>
        <div id="dash-pending-apps"><div class="empty-state"><p>Loading...</p></div></div>
      </div>
    </div>

    <!-- ROW 3 -->
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

  // Activity feed from real notifications
  const activityItems = _adminNotifs.slice(0, 5).map(n => {
    const colors = {
      newApplicant: { c: "var(--warning)", bg: "#fef9c3" },
      newUser: { c: "var(--primary)", bg: "var(--primary-light)" },
      payment: { c: "var(--success)", bg: "#dcfce7" },
      courseEnrolled: { c: "var(--accent)", bg: "#dbeafe" },
      certificateEarned: { c: "var(--warning)", bg: "#fef9c3" },
    };
    const col = colors[n.type] || { c: "var(--muted)", bg: "var(--bg)" };
    return `<div class="activity-item">
      <div class="activity-dot" style="background:${col.bg};color:${col.c};">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      </div>
      <div class="activity-info">
        <div class="activity-text">${n.title}</div>
        <div class="activity-time">${fmtTimeAgo(n.createdAt)}</div>
      </div>
    </div>`;
  });

  $("dash-activity").innerHTML = activityItems.length ?
    activityItems.join("") :
    `<div class="empty-state" style="padding:20px;"><p>No recent activity</p></div>`;

  try {
    const [usersSnap] = await Promise.all([getDocs(collection(db, "users"))]);
    let coursesSnap, offersSnap, appsSnap;
    try { coursesSnap = await getDocs(collection(db, "courses")); } catch (_) { }
    try { offersSnap = await getDocs(collection(db, "offers")); } catch (_) { }
    try { appsSnap = await getDocs(query(collection(db, "applications"), where("status", "==", "pending"))); } catch (_) { }

    const totalUsers = usersSnap.size;
    const totalCourses = coursesSnap?.size || 0;
    const totalJobs = offersSnap?.size || 0;
    const pendingApps = appsSnap?.size || 0;

    $("dash-stats").innerHTML = `
      <div class="stat-card">
        <div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--primary),#6b63ff)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div></div>
        <div class="stat-label">${t('totalUsers')}</div><div class="stat-value">${totalUsers}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--accent),#0ea5e9)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></div></div>
        <div class="stat-label">${t('courses')}</div><div class="stat-value">${totalCourses}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--warning),#f97316)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></div></div>
        <div class="stat-label">Job Offers</div><div class="stat-value">${totalJobs}</div>
      </div>
      <div class="stat-card" style="cursor:pointer;" onclick="navigate('applications')">
        <div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,#f97316,#ef4444)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="stat-trend up" style="color:var(--warning);">Pending</div></div>
        <div class="stat-label">Applications to Review</div><div class="stat-value">${pendingApps}</div>
      </div>`;

    // Recent users
    const recentUsers = usersSnap.docs.slice(0, 5).map(d => ({ id: d.id, ...d.data() }));
    $("dash-recent").innerHTML = recentUsers.length ?
      recentUsers.map(u => `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div class="avatar" style="width:32px;height:32px;font-size:12px;">${(u.name || u.displayName || u.email || "?").charAt(0).toUpperCase()}</div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${u.name || u.displayName || "—"}</div><div style="font-size:12px;color:var(--muted);">${u.email || ""}</div></div>
        ${roleBadge(u.role)}
      </div>`).join("") :
      `<div class="empty-state"><p>No users yet</p></div>`;

    // Pending applications preview
    const pendingList = appsSnap?.docs.slice(0, 4).map(d => ({ id: d.id, ...d.data() })) || [];
    $("dash-pending-apps").innerHTML = pendingList.length ?
      pendingList.map(a => `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div class="avatar" style="width:32px;height:32px;font-size:12px;background:var(--primary-light);color:var(--primary);">${(a.company || "?").charAt(0)}</div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${a.offerTitle || "—"}</div><div style="font-size:12px;color:var(--muted);">${a.company || ""}</div></div>
        <span class="badge badge-orange">pending</span>
      </div>`).join("") :
      `<div class="empty-state" style="padding:20px;"><p>No pending applications 🎉</p></div>`;

    $("dash-overview").innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--muted);">Total Users</span>
          <strong>${totalUsers}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--muted);">Active Courses</span>
          <strong>${totalCourses}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--muted);">Job Offers</span>
          <strong>${totalJobs}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--muted);">Applications Pending</span>
          <strong style="color:var(--warning);">${pendingApps}</strong>
        </div>
      </div>`;

  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

// ═══════════════════════════════════════════════════════════════
// ── COURSES ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadCourses() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('courses')}</h1><p>${t('manageCoursesAndContent')}</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="course-search" placeholder="${t('searchCourses')}" /></div>
        <select class="filter-select" id="course-type-filter"><option value="">All Types</option><option>PDF</option><option>MP4</option><option>PPTX</option><option>DOC</option><option>MP3</option></select>
        <button class="btn btn-purple" id="add-course-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>${t('addUser')}</button>
      </div>
      <div id="courses-table-wrap"><div class="empty-state"><p>${t('loading')}</p></div></div>
    </div>`;

  $("add-course-btn").addEventListener("click", openAddCourse);
  $("course-search").addEventListener("input", filterCourses);
  $("course-type-filter").addEventListener("change", filterCourses);

  try {
    const snap = await getDocs(collection(db, "courses"));
    _coursesCache = [];
    snap.forEach(d => {
      const data = d.data();
      _coursesCache.push({
        id: d.id,
        name: data.title || data.name || "—",
        instructor: data.instructor || data.instructorName || "—",
        type: data.type || data.format || "—",
        price: data.price || 0,
        description: data.description || "",
        category: data.category || "",
        isPublished: data.isPublished !== false,
        enrolledCount: data.enrolledCount || 0,
        rating: data.rating || 0,
        createdAt: data.createdAt || null,
      });
    });
    renderCoursesTable(_coursesCache);
  } catch (err) {
    $("courses-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
  }
}

function renderCoursesTable(courses) {
  const wrap = $("courses-table-wrap");
  if (!courses?.length) {
    wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg><h4>${t('noCoursesFound')}</h4></div>`;
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>${t('course')}</th><th>${t('instructor')}</th><th>Category</th><th>Type</th><th>Students</th><th>Status</th><th>${t('actions')}</th></tr>
    ${courses.map(c => `<tr>
      <td><strong>${c.name}</strong></td>
      <td style="color:var(--muted)">${c.instructor}</td>
      <td style="color:var(--muted)">${c.category || "—"}</td>
      <td><span class="badge badge-blue">${c.type}</span></td>
      <td>${c.enrolledCount}</td>
      <td><span class="status-dot ${c.isPublished ? 'status-active' : 'status-closed'}">${c.isPublished ? 'Published' : 'Draft'}</span></td>
      <td><div class="action-btns">
        <button class="tbl-btn" data-action="edit-course" data-id="${c.id}" data-name="${(c.name || "").replace(/"/g, "")}" data-instructor="${(c.instructor || "").replace(/"/g, "")}" data-type="${c.type}" data-price="${c.price}" data-desc="${(c.description || "").replace(/"/g, "")}" data-category="${(c.category || "").replace(/"/g, "")}">
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
    btn.addEventListener("click", () => showConfirm(`Delete course "${btn.dataset.name}"?`, btn.dataset.id, "course"));
  });
}

function filterCourses() {
  const s = ($("course-search")?.value || "").toLowerCase();
  const ty = $("course-type-filter")?.value || "";
  renderCoursesTable(_coursesCache.filter(c =>
    (!s || (c.name || "").toLowerCase().includes(s) || (c.instructor || "").toLowerCase().includes(s)) &&
    (!ty || c.type === ty)
  ));
}

function openAddCourse() {
  editingCourseId = null;
  ["c-name", "c-instructor", "c-price", "c-desc", "c-category"].forEach(id => $(id) && ($(id).value = ""));
  if ($("c-type")) $("c-type").value = "PDF";
  $("course-modal-title").textContent = "Add Course";
  $("course-save-btn").textContent = "Add Course";
  openModal("course-modal");
}

function editCourse(id, name, instructor, type, price, desc, category) {
  editingCourseId = id;
  $("c-name").value = name || "";
  $("c-instructor").value = instructor || "";
  $("c-type").value = type || "PDF";
  $("c-price").value = price || 0;
  $("c-desc").value = desc || "";
  $("c-category").value = category || "";
  $("course-modal-title").textContent = t('edit');
  $("course-save-btn").textContent = t('saveChanges');
  openModal("course-modal");
}

$("course-save-btn").addEventListener("click", async () => {
  const name = ($("c-name").value || "").trim();
  const instructor = ($("c-instructor").value || "").trim();
  if (!name || !instructor) { showToast(t('fillAllRequiredFields'), "error"); return; }
  const data = {
    title: name, instructor,
    type: $("c-type").value,
    price: parseFloat($("c-price").value) || 0,
    description: ($("c-desc").value || "").trim(),
    category: ($("c-category")?.value || "").trim(),
  };
  const btn = $("course-save-btn"); btn.disabled = true; btn.textContent = t('saving');
  try {
    if (editingCourseId) { await updateDoc(doc(db, "courses", editingCourseId), data); showToast("Course updated"); }
    else { await addDoc(collection(db, "courses"), { ...data, isPublished: true, enrolledCount: 0, createdAt: serverTimestamp() }); showToast("Course added"); }
    closeModal("course-modal"); loadCourses();
  } catch (err) { showToast("Error: " + err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = editingCourseId ? t('saveChanges') : "Add Course"; }
});

// ═══════════════════════════════════════════════════════════════
// ── JOBS ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadJobs() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('jobOffers')}</h1><p>${t('manageCareerOpportunities')}</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="job-search" placeholder="${t('searchJobs')}" /></div>
        <select class="filter-select" id="job-status-filter"><option value="">All Status</option><option>Active</option><option>Pending</option><option>Closed</option></select>
        <select class="filter-select" id="job-type-filter"><option value="">All Types</option><option>Full-time</option><option>Part-time</option><option>Remote</option><option>Internship</option><option>Freelance</option></select>
        <button class="btn btn-purple" id="add-job-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>Add Job</button>
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
        recruiterId: data.recruiterId || data.recruteurUid || null,
        createdAt: data.createdAt || null,
      });
    });
    renderJobsTable(_jobsCache);
  } catch (err) {
    $("jobs-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
  }
}

function renderJobsTable(jobs) {
  const wrap = $("jobs-table-wrap");
  if (!jobs?.length) {
    wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg><h4>${t('noJobOffersYet')}</h4><p>${t('manageCareerOpportunities')}</p></div>`;
    return;
  }
  const statusClass = { Active: "status-active", Pending: "status-pending", Closed: "status-closed" };
  const typeBadge = { "Full-time": "badge-blue", "Part-time": "badge-purple", "Remote": "badge-green", "Internship": "badge-orange", "Freelance": "badge-teal" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>Title</th><th>Company</th><th>Location</th><th>Type</th><th>Salary</th><th>Status</th><th>${t('actions')}</th></tr>
    ${jobs.map(j => `<tr>
      <td><strong>${j.title || "—"}</strong></td>
      <td style="color:var(--muted)">${j.company || "—"}</td>
      <td style="color:var(--muted)">${j.location || "—"}</td>
      <td><span class="badge ${typeBadge[j.type] || "badge-gray"}">${j.type || "—"}</span></td>
      <td style="font-size:13px">${j.salary || "—"}</td>
      <td><span class="status-dot ${statusClass[j.status] || "status-closed"}">${j.status || "—"}</span></td>
      <td><div class="action-btns">
        <button class="tbl-btn" data-action="view-apps" data-id="${j.id}" data-title="${(j.title || "").replace(/"/g, "")}" title="View Applications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </button>
        <button class="tbl-btn" data-action="edit-job" data-id="${j.id}" data-title="${(j.title || "").replace(/"/g, "")}" data-company="${(j.company || "").replace(/"/g, "")}" data-location="${(j.location || "").replace(/"/g, "")}" data-type="${j.type || "Full-time"}" data-salary="${(j.salary || "").replace(/"/g, "")}" data-status="${j.status || "Active"}" data-desc="${(j.description || "").replace(/"/g, "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="tbl-btn danger" data-action="del-job" data-id="${j.id}" data-name="${(j.title || "").replace(/"/g, "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`).join("")}
  </table></div>`;

  wrap.querySelectorAll("[data-action='view-apps']").forEach(btn => {
    btn.addEventListener("click", () => loadApplications(btn.dataset.id, btn.dataset.title));
  });
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
    jobType: $("j-type").value, // Flutter compatibility
    salary: ($("j-salary").value || "").trim(),
    status: $("j-status").value,
    isActive: $("j-status").value === "Active",
    description: ($("j-desc").value || "").trim(),
  };
  const btn = $("job-save-btn"); btn.disabled = true; btn.textContent = t('saving');
  try {
    if (editingJobId) { await updateDoc(doc(db, "offers", editingJobId), data); showToast(t('jobUpdated')); }
    else {
      await addDoc(collection(db, "offers"), { ...data, createdAt: serverTimestamp() });
      showToast(t('jobPosted'));
    }
    closeModal("job-modal"); loadJobs();
  } catch (err) { showToast("Error: " + err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = editingJobId ? t('saveChanges') : t('postJob'); }
});

// ═══════════════════════════════════════════════════════════════
// ── APPLICATIONS (Admin Review) ────────────────────────────────
// ═══════════════════════════════════════════════════════════════

async function loadApplications(filterOfferId = null, filterOfferTitle = null) {
  // Update nav
  currentPage = "applications";
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.id === "applications"));
  $("header-title").textContent = filterOfferTitle ? `Applications — ${filterOfferTitle}` : "Job Applications";

  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Job Applications</h1>
        <p>Review, accept, or reject candidate applications. Applicants are notified automatically.</p>
      </div>
      ${filterOfferId ? `<button class="btn btn-outline" onclick="navigate('jobs')">← Back to Jobs</button>` : ""}
    </div>

    <!-- Stats Row -->
    <div class="stat-grid stat-grid-4" id="app-stats">
      ${[1,2,3,4].map(() => `<div class="stat-card"><div class="skeleton" style="height:80px;border-radius:8px;"></div></div>`).join("")}
    </div>

    <div class="card" style="margin-top:20px;">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="app-search" placeholder="Search by applicant, job, or company..." /></div>
        <select class="filter-select" id="app-status-filter">
          <option value="">All Status</option>
          <option value="pending">⏳ Pending</option>
          <option value="reviewing">🔍 Reviewing</option>
          <option value="interview">📅 Interview</option>
          <option value="accepted">✅ Accepted</option>
          <option value="rejected">❌ Rejected</option>
        </select>
      </div>
      <div id="apps-table-wrap"><div class="empty-state"><p>${t('loading')}</p></div></div>
    </div>`;

  $("app-search").addEventListener("input", filterApplications);
  $("app-status-filter").addEventListener("change", filterApplications);

  try {
    let q;
    if (filterOfferId) {
      q = query(collection(db, "applications"), where("offerId", "==", filterOfferId));
    } else {
      q = query(collection(db, "applications"), orderBy("appliedAt", "desc"));
    }

    const snap = await getDocs(q);
    _applicationsCache = [];

    // Enrich with applicant names
    const enriched = await Promise.all(snap.docs.map(async d => {
      const data = d.data();
      let applicantName = "Unknown";
      let applicantEmail = "";
      try {
        const userDoc = await getDoc(doc(db, "users", data.applicantId));
        if (userDoc.exists()) {
          const ud = userDoc.data();
          applicantName = ud.name || ud.displayName || ud.email || "Unknown";
          applicantEmail = ud.email || "";
        }
      } catch (_) { }
      return { id: d.id, ...data, applicantName, applicantEmail };
    }));

    _applicationsCache = enriched;

    // Stats
    const counts = { pending: 0, reviewing: 0, interview: 0, accepted: 0, rejected: 0 };
    enriched.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

    $("app-stats").innerHTML = `
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,#f97316,#fb923c)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg></div></div><div class="stat-label">Pending</div><div class="stat-value">${counts.pending}</div></div>
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,#3b82f6,#6b63ff)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div></div><div class="stat-label">Reviewing</div><div class="stat-value">${counts.reviewing}</div></div>
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--success),#16a34a)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div></div><div class="stat-label">Accepted</div><div class="stat-value">${counts.accepted}</div></div>
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--danger),#dc2626)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div></div><div class="stat-label">Rejected</div><div class="stat-value">${counts.rejected}</div></div>`;

    renderApplicationsTable(_applicationsCache);
  } catch (err) {
    $("apps-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
    console.error(err);
  }
}

function renderApplicationsTable(apps) {
  const wrap = $("apps-table-wrap");
  if (!apps?.length) {
    wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><h4>No applications found</h4><p>Applications from candidates will appear here</p></div>`;
    return;
  }

  const statusBadge = {
    pending: "badge-orange",
    reviewing: "badge-blue",
    interview: "badge-purple",
    accepted: "badge-green",
    rejected: "badge-gray"
  };
  const statusLabel = {
    pending: "⏳ Pending",
    reviewing: "🔍 Reviewing",
    interview: "📅 Interview",
    accepted: "✅ Accepted",
    rejected: "❌ Rejected"
  };

  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr>
      <th>Applicant</th>
      <th>Job</th>
      <th>Company</th>
      <th>Applied</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
    ${apps.map(a => `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="avatar" style="width:32px;height:32px;font-size:12px;">${(a.applicantName || "?").charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight:600;font-size:13px;">${a.applicantName || "—"}</div>
            <div style="font-size:11px;color:var(--muted);">${a.applicantEmail || ""}</div>
          </div>
        </div>
      </td>
      <td><strong style="font-size:13px;">${a.offerTitle || "—"}</strong></td>
      <td style="color:var(--muted);font-size:13px;">${a.company || "—"}</td>
      <td style="color:var(--muted);font-size:12px;">${fmtDate(a.appliedAt)}</td>
      <td><span class="badge ${statusBadge[a.status] || 'badge-gray'}">${statusLabel[a.status] || a.status}</span></td>
      <td>
        <div class="action-btns" style="flex-wrap:wrap;gap:4px;">
          ${a.status === 'pending' || a.status === 'reviewing' ? `
            <button class="tbl-btn" title="Mark as Reviewing" data-action="app-reviewing" data-id="${a.id}" data-uid="${a.applicantId}" data-offer="${(a.offerTitle||'').replace(/"/g,'')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </button>` : ''}
          ${a.status !== 'interview' && a.status !== 'accepted' && a.status !== 'rejected' ? `
            <button class="tbl-btn" title="Invite to Interview" data-action="app-interview" data-id="${a.id}" data-uid="${a.applicantId}" data-offer="${(a.offerTitle||'').replace(/"/g,'')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            </button>` : ''}
          ${a.status !== 'accepted' ? `
            <button class="tbl-btn" style="color:var(--success);" title="Accept Application" data-action="app-accept" data-id="${a.id}" data-uid="${a.applicantId}" data-offer="${(a.offerTitle||'').replace(/"/g,'')}" data-company="${(a.company||'').replace(/"/g,'')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            </button>` : ''}
          ${a.status !== 'rejected' ? `
            <button class="tbl-btn danger" title="Reject Application" data-action="app-reject" data-id="${a.id}" data-uid="${a.applicantId}" data-offer="${(a.offerTitle||'').replace(/"/g,'')}" data-company="${(a.company||'').replace(/"/g,'')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>` : ''}
        </div>
      </td>
    </tr>`).join("")}
  </table></div>`;

  // Action listeners
  wrap.querySelectorAll("[data-action='app-reviewing']").forEach(btn => {
    btn.addEventListener("click", () => updateApplicationStatus(btn.dataset.id, btn.dataset.uid, 'reviewing', btn.dataset.offer, ''));
  });
  wrap.querySelectorAll("[data-action='app-interview']").forEach(btn => {
    btn.addEventListener("click", () => updateApplicationStatus(btn.dataset.id, btn.dataset.uid, 'interview', btn.dataset.offer, ''));
  });
  wrap.querySelectorAll("[data-action='app-accept']").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm(`Accept this application for "${btn.dataset.offer}"? The candidate will be notified immediately.`)) {
        updateApplicationStatus(btn.dataset.id, btn.dataset.uid, 'accepted', btn.dataset.offer, btn.dataset.company);
      }
    });
  });
  wrap.querySelectorAll("[data-action='app-reject']").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm(`Reject this application for "${btn.dataset.offer}"? The candidate will be notified.`)) {
        updateApplicationStatus(btn.dataset.id, btn.dataset.uid, 'rejected', btn.dataset.offer, btn.dataset.company);
      }
    });
  });
}

/**
 * Core function: updates an application's status in Firestore
 * AND sends a push notification to the applicant.
 */
async function updateApplicationStatus(appId, applicantUid, newStatus, offerTitle, company) {
  try {
    // 1. Update the application document
    await updateDoc(doc(db, "applications", appId), {
      status: newStatus,
      statusUpdatedAt: serverTimestamp(),
    });

    // 2. Notify the applicant
    const notifMessages = {
      reviewing: {
        title: "En cours d'examen 🔍",
        body: `${company || 'L\'entreprise'} examine votre candidature pour "${offerTitle}"`,
        type: "applicationReviewing",
      },
      interview: {
        title: "Invitation à un entretien 📅",
        body: `${company || 'L\'entreprise'} vous invite pour un entretien — "${offerTitle}"`,
        type: "applicationInterview",
      },
      accepted: {
        title: "Candidature acceptée 🎉",
        body: `Félicitations! ${company || 'L\'entreprise'} a accepté votre candidature pour "${offerTitle}"`,
        type: "applicationAccepted",
      },
      rejected: {
        title: "Candidature refusée",
        body: `${company || 'L\'entreprise'} n'a pas retenu votre candidature pour "${offerTitle}"`,
        type: "applicationRejected",
      },
    };

    const notif = notifMessages[newStatus];
    if (notif && applicantUid) {
      await pushNotification({
        uid: applicantUid,
        title: notif.title,
        body: notif.body,
        type: notif.type,
        payload: { applicationId: appId, offerTitle },
      });
    }

    showToast(`Application marked as "${newStatus}" — candidate notified ✅`, "success");

    // 3. Reload table
    const currentFilter = $("app-status-filter")?.value || "";
    const currentSearch = $("app-search")?.value?.toLowerCase() || "";
    const idx = _applicationsCache.findIndex(a => a.id === appId);
    if (idx !== -1) _applicationsCache[idx].status = newStatus;
    renderApplicationsTable(_applicationsCache.filter(a =>
      (!currentFilter || a.status === currentFilter) &&
      (!currentSearch || (a.applicantName || "").toLowerCase().includes(currentSearch) ||
        (a.offerTitle || "").toLowerCase().includes(currentSearch))
    ));

  } catch (err) {
    showToast("Error: " + err.message, "error");
    console.error("updateApplicationStatus error:", err);
  }
}

function filterApplications() {
  const s = ($("app-search")?.value || "").toLowerCase();
  const st = $("app-status-filter")?.value || "";
  renderApplicationsTable(_applicationsCache.filter(a =>
    (!s || (a.applicantName || "").toLowerCase().includes(s) ||
      (a.offerTitle || "").toLowerCase().includes(s) ||
      (a.company || "").toLowerCase().includes(s)) &&
    (!st || a.status === st)
  ));
}

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
        <select class="filter-select" id="cert-grade-filter"><option value="">All Grades</option><option>Distinction</option><option>Merit</option><option>Pass</option></select>
        <button class="btn btn-purple" id="add-cert-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>Issue Certificate</button>
      </div>
      <div id="certs-table-wrap"><div class="empty-state"><p>${t('loading')}</p></div></div>
    </div>`;

  $("add-cert-btn").addEventListener("click", openAddCert);
  $("cert-search").addEventListener("input", filterCerts);
  $("cert-grade-filter").addEventListener("change", filterCerts);

  try {
    const snap = await getDocs(collection(db, "certificates"));
    _certsCache = [];
    snap.forEach(d => _certsCache.push({ id: d.id, ...d.data() }));
    renderCertsTable(_certsCache);
  } catch (err) {
    $("certs-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
  }
}

function renderCertsTable(certs) {
  const wrap = $("certs-table-wrap");
  if (!certs?.length) {
    wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg><h4>${t('noCertificatesYet')}</h4></div>`;
    return;
  }
  const gradeBadge = { Distinction: "badge-purple", Merit: "badge-blue", Pass: "badge-green" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>Learner</th><th>Course</th><th>Issue Date</th><th>Grade</th><th>Cert ID</th><th>${t('actions')}</th></tr>
    ${certs.map(c => `<tr>
      <td><strong>${c.learner || c.learnerName || "—"}</strong></td>
      <td style="color:var(--muted)">${c.course || c.courseName || "—"}</td>
      <td style="color:var(--muted);font-size:13px">${c.date || fmtDate(c.createdAt)}</td>
      <td><span class="badge ${gradeBadge[c.grade] || "badge-gray"}">${c.grade || "—"}</span></td>
      <td><code style="font-size:11px;background:var(--bg);padding:2px 7px;border-radius:5px;">${c.certId || c.id.slice(0, 10).toUpperCase()}</code></td>
      <td><div class="action-btns">
        <button class="tbl-btn danger" data-action="del-cert" data-id="${c.id}" data-name="${(c.learner || c.learnerName || "").replace(/"/g, "")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`).join("")}
  </table></div>`;

  wrap.querySelectorAll("[data-action='del-cert']").forEach(btn => {
    btn.addEventListener("click", () => showConfirm(`Delete certificate for "${btn.dataset.name}"?`, btn.dataset.id, "cert"));
  });
}

function filterCerts() {
  const s = ($("cert-search")?.value || "").toLowerCase();
  const gr = $("cert-grade-filter")?.value || "";
  renderCertsTable(_certsCache.filter(c =>
    (!s || (c.learner || c.learnerName || "").toLowerCase().includes(s) || (c.course || c.courseName || "").toLowerCase().includes(s)) &&
    (!gr || c.grade === gr)
  ));
}

function openAddCert() {
  editingCertId = null;
  ["cert-learner", "cert-course"].forEach(id => $(id) && ($(id).value = ""));
  if ($("cert-date")) $("cert-date").value = new Date().toISOString().split("T")[0];
  if ($("cert-grade")) $("cert-grade").value = "Distinction";
  if ($("cert-id")) $("cert-id").value = genCertId();
  $("cert-modal-title").textContent = "Issue Certificate";
  $("cert-save-btn").textContent = "Issue Certificate";
  openModal("cert-modal");
}

$("cert-save-btn").addEventListener("click", async () => {
  const learner = ($("cert-learner").value || "").trim();
  const course = ($("cert-course").value || "").trim();
  if (!learner || !course) { showToast(t('fillAllRequiredFields'), "error"); return; }
  const certId = $("cert-id").value || genCertId();
  const data = {
    learner, course,
    date: $("cert-date").value,
    grade: $("cert-grade").value,
    certId,
    isVerified: true,
    createdAt: serverTimestamp(),
  };
  const btn = $("cert-save-btn"); btn.disabled = true; btn.textContent = t('saving');
  try {
    await addDoc(collection(db, "certificates"), data);
    showToast("Certificate issued");
    closeModal("cert-modal"); loadCertificates();
  } catch (err) { showToast("Error: " + err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Issue Certificate"; }
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
        <select class="filter-select" id="pay-status-filter"><option value="">All</option><option>Completed</option><option>Pending</option><option>Refunded</option></select>
      </div>
      <div id="pay-table-wrap"><div class="empty-state"><p>${t('loading')}</p></div></div>
    </div>`;

  $("pay-search").addEventListener("input", filterPayments);
  $("pay-status-filter").addEventListener("change", filterPayments);

  try {
    const snap = await getDocs(collection(db, "payments"));
    _paymentsCache = [];
    snap.forEach(d => _paymentsCache.push({ id: d.id, ...d.data() }));
    const total = _paymentsCache.filter(p => p.status === "Completed").reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const pending = _paymentsCache.filter(p => p.status === "Pending").reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    $("pay-stats").innerHTML = `
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--success),#16a34a)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg></div><div class="stat-trend up">+18%</div></div><div class="stat-label">Total Revenue</div><div class="stat-value">$${total.toFixed(2)}</div></div>
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--warning),#f97316)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg></div></div><div class="stat-label">Pending Payments</div><div class="stat-value">$${pending.toFixed(2)}</div></div>`;
    renderPaymentsTable(_paymentsCache);
  } catch (err) {
    $("pay-table-wrap").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
  }
}

function renderPaymentsTable(payments) {
  const wrap = $("pay-table-wrap");
  if (!payments?.length) {
    wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg><h4>${t('noTransactionsYet')}</h4></div>`;
    return;
  }
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
    </div>
    <div id="stats-content" style="display:none;"></div>`;

  try {
    const [usersSnap, coursesSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "courses"))
    ]);
    let certsSnap, offersSnap, appsSnap;
    try { certsSnap = await getDocs(collection(db, "certificates")); } catch (_) { }
    try { offersSnap = await getDocs(collection(db, "offers")); } catch (_) { }
    try { appsSnap = await getDocs(collection(db, "applications")); } catch (_) { }

    const totalUsers = usersSnap.size;
    const totalCourses = coursesSnap.size;
    const totalCerts = certsSnap?.size || 0;
    const totalOffers = offersSnap?.size || 0;
    const totalApps = appsSnap?.size || 0;

    const roleCounts = {};
    usersSnap.docs.forEach(d => { const r = d.data().role || "Unknown"; roleCounts[r] = (roleCounts[r] || 0) + 1; });
    const roleColors = { Admin: "var(--primary)", Instructor: "var(--accent)", Learner: "var(--success)", Recruiter: "var(--warning)", Unknown: "var(--muted)" };
    const roleBadgeMap = { Admin: "badge-purple", Instructor: "badge-blue", Learner: "badge-green", Recruiter: "badge-orange" };

    const appStatus = { pending: 0, reviewing: 0, interview: 0, accepted: 0, rejected: 0 };
    appsSnap?.docs.forEach(d => { const s = d.data().status; if (appStatus[s] !== undefined) appStatus[s]++; });

    $("stats-loading").style.display = "none";
    $("stats-content").style.display = "block";
    $("stats-content").innerHTML = `
      <div class="stat-grid stat-grid-4" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--primary),#6b63ff)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div></div><div class="stat-label">${t('totalUsers')}</div><div class="stat-value">${totalUsers}</div></div>
        <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--accent),#0ea5e9)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></div></div><div class="stat-label">Courses</div><div class="stat-value">${totalCourses}</div></div>
        <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--warning),#f97316)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></div></div><div class="stat-label">Job Offers</div><div class="stat-value">${totalOffers}</div></div>
        <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:linear-gradient(135deg,var(--success),#16a34a)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div></div><div class="stat-label">Total Applications</div><div class="stat-value">${totalApps}</div></div>
      </div>

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
              <div class="progress-bar" style="height:10px;"><div class="progress-fill" style="width:${pct}%;background:${roleColors[role] || "var(--muted);"};"></div></div>
            </div>`;
          }).join("") : `<div class="empty-state"><p>No users yet</p></div>`}
        </div>
        <div class="card">
          <div class="card-header"><h3>Application Funnel</h3><span class="meta">${totalApps} total</span></div>
          ${totalApps ? Object.entries(appStatus).map(([status, count]) => {
            const pct = Math.round((count / totalApps) * 100);
            const colors = { pending: "#f97316", reviewing: "#3b82f6", interview: "#8b5cf6", accepted: "#22c55e", rejected: "#ef4444" };
            return `<div style="margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                <span style="font-size:13px;text-transform:capitalize;">${status}</span>
                <span style="font-size:13px;font-weight:700;">${count}</span>
              </div>
              <div class="progress-bar" style="height:8px;"><div class="progress-fill" style="width:${pct}%;background:${colors[status]};"></div></div>
            </div>`;
          }).join("") : `<div class="empty-state"><p>No applications yet</p></div>`}
        </div>
      </div>`;
  } catch (err) {
    $("stats-content").innerHTML = `<div class="empty-state"><p>Error loading statistics: ${err.message}</p></div>`;
    $("stats-loading").style.display = "none";
    $("stats-content").style.display = "block";
  }
}

// ═══════════════════════════════════════════════════════════════
// ── SETTINGS ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
function renderSettings() {
  const currentLang = localStorage.getItem('language') || 'en';
  const darkMode = localStorage.getItem('darkMode') === 'true';

  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>${t('settings')}</h1><p>${t('configurePreferences')}</p></div>
    </div>

    <div class="card settings-section" style="border-left:4px solid var(--primary);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <h3>${t('settingsAccount')}</h3>
      </div>
      <div class="settings-grid">
        <div class="settings-field">
          <label>${t('emailAddress')}</label>
          <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);">
            <span style="color:var(--text);font-weight:500;">${currentUser?.email || "—"}</span>
          </div>
        </div>
        <div class="settings-field">
          <label>${t('role')}</label>
          <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);">
            <span style="color:var(--text);font-weight:500;background:var(--primary-light);padding:4px 10px;border-radius:6px;">Administrator</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card settings-section" style="border-left:4px solid var(--warning);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <h3>${t('changePassword')}</h3>
      </div>
      <div class="settings-grid">
        <div class="settings-field"><label>${t('currentPassword')}</label><input type="password" id="current-password" placeholder="••••••••"/></div>
        <div class="settings-field"><label>${t('newPassword')}</label><input type="password" id="new-password" placeholder="••••••••"/></div>
        <div class="settings-field"><label>${t('confirmPassword')}</label><input type="password" id="confirm-password" placeholder="••••••••"/></div>
      </div>
      <button class="btn btn-primary" id="change-password-btn" style="margin-top:20px;">${t('changePasswordBtn')}</button>
    </div>

    <div class="card settings-section" style="border-left:4px solid var(--accent);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
        <h3>${t('preferences')}</h3>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div class="settings-field">
          <label>${t('language')}</label>
          <select id="language-select" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--white);color:var(--text);">
            <option value="en" ${currentLang==='en'?'selected':''}>${t('english')}</option>
            <option value="fr" ${currentLang==='fr'?'selected':''}>${t('francais')}</option>
            <option value="ar" ${currentLang==='ar'?'selected':''}>${t('arabic')}</option>
          </select>
        </div>
        <div class="settings-field">
          <label>${t('theme')}</label>
          <div class="toggle" id="dark-mode-toggle-container" style="justify-content:flex-start;">
            <input type="checkbox" id="dark-mode-toggle" ${darkMode?'checked':''}>
            <div class="track"><div class="thumb"></div></div>
            <span class="toggle-label" style="margin-left:10px;">${darkMode?t('dark'):t('light')}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card settings-section" style="border-left:4px solid var(--primary);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        <h3>${t('notificationSettings')}</h3>
      </div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">${t('notificationPreferencesDesc')}</p>
      <div id="notification-prefs"></div>
    </div>

    <div class="card settings-section" style="border-left:4px solid var(--danger);">
      <div class="card-header" style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <h3>${t('signOut')}</h3>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:rgba(239,68,68,0.05);border-radius:10px;border:1px solid var(--border);">
        <div>
          <div style="font-size:14px;font-weight:600;">${t('signOut')}</div>
          <div style="font-size:13px;color:var(--muted);">${t('signOutDescription')}</div>
        </div>
        <button class="btn btn-danger" id="sign-out-btn" style="white-space:nowrap;margin-left:20px;">${t('signOut')}</button>
      </div>
    </div>`;

  $('language-select').addEventListener('change', e => changeLanguage(e.target.value));
  $('dark-mode-toggle-container').addEventListener('click', () => {
    const checkbox = $('dark-mode-toggle');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      toggleDarkMode(checkbox.checked);
      const label = $('dark-mode-toggle-container').querySelector('.toggle-label');
      if (label) label.textContent = checkbox.checked ? t('dark') : t('light');
    }
  });
  $('change-password-btn').addEventListener('click', changePasswordHandler);
  $('sign-out-btn').addEventListener('click', signOutHandler);
  initNotificationPreferences();
}

async function changePasswordHandler() {
  const currentPassword = $('current-password')?.value?.trim();
  const newPassword = $('new-password')?.value?.trim();
  const confirmPassword = $('confirm-password')?.value?.trim();
  if (!currentPassword || !newPassword || !confirmPassword) { showToast(t('fillAllRequiredFields'), 'error'); return; }
  if (newPassword !== confirmPassword) { showToast(t('passwordsDoNotMatch'), 'error'); return; }
  if (newPassword.length < 6) { showToast(t('passwordTooShort'), 'error'); return; }
  const btn = $('change-password-btn');
  const orig = btn.textContent; btn.textContent = t('saving'); btn.disabled = true;
  try {
    const user = auth.currentUser;
    if (!user?.email) { showToast(t('sessionExpired'), 'error'); return; }
    const credential = await signInWithEmailAndPassword(auth, user.email, currentPassword);
    await updatePassword(credential.user, newPassword);
    $('current-password').value = ''; $('new-password').value = ''; $('confirm-password').value = '';
    showToast(t('passwordChanged'), 'success');
  } catch (error) {
    if (error.code === 'auth/wrong-password') showToast(t('invalidPassword'), 'error');
    else if (error.code === 'auth/weak-password') showToast(t('passwordTooShort'), 'error');
    else showToast(t('errorMsg') + ': ' + error.message, 'error');
  } finally { btn.textContent = orig; btn.disabled = false; }
}

async function signOutHandler() {
  if (!confirm(t('areYouSureSignOut'))) return;
  if (_notifsUnsubscribe) { _notifsUnsubscribe(); _notifsUnsubscribe = null; }
  await signOut(auth);
  location.reload();
}

// ── NOTIFICATION PREFERENCES ────────────────────────────────────
const DEFAULT_NOTIFICATION_PREFS = {
  newUser: true,
  jobApplication: true,
  payment: true,
  courseSubmission: true,
  certificate: true
};

function getNotificationPreferences() {
  try {
    const saved = localStorage.getItem('notificationPreferences');
    return saved ? JSON.parse(saved) : DEFAULT_NOTIFICATION_PREFS;
  } catch (err) {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

function saveNotificationPreferences(prefs) {
  localStorage.setItem('notificationPreferences', JSON.stringify(prefs));
  showToast(t('notificationsSaved'), 'success');
}

function initNotificationPreferences() {
  const prefs = getNotificationPreferences();
  const container = $('notification-prefs');
  if (!container) return;
  const notificationTypes = [
    { key: 'newUser', title: t('notificationType_newUser'), desc: t('notificationType_userDesc') },
    { key: 'jobApplication', title: t('notificationType_jobApplication'), desc: t('notificationType_jobDesc') },
    { key: 'payment', title: t('notificationType_payment'), desc: t('notificationType_paymentDesc') },
    { key: 'courseSubmission', title: t('notificationType_courseSubmission'), desc: t('notificationType_courseDesc') },
    { key: 'certificate', title: t('notificationType_certificate'), desc: t('notificationType_certDesc') }
  ];
  container.innerHTML = notificationTypes.map(type => `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:16px;background:var(--bg);border-radius:10px;border:1px solid var(--border);margin-bottom:12px;">
      <div style="flex:1;"><div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;">${type.title}</div><div style="font-size:13px;color:var(--muted);">${type.desc}</div></div>
      <div class="toggle" style="margin-left:20px;justify-content:flex-end;">
        <input type="checkbox" class="notif-toggle" data-type="${type.key}" ${prefs[type.key] ? 'checked' : ''}>
        <div class="track"><div class="thumb"></div></div>
      </div>
    </div>`).join('');

  container.querySelectorAll('.notif-toggle').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const updatedPrefs = getNotificationPreferences();
      updatedPrefs[toggle.dataset.type] = toggle.checked;
      saveNotificationPreferences(updatedPrefs);
    });
  });
}

// ── App Usage Tracker ────────────────────────────────────────────
let usageTrackingInterval = null;
function trackAppUsage() {
  if (usageTrackingInterval) clearInterval(usageTrackingInterval);
  function updateUsage() {
    const dailyUsage = JSON.parse(localStorage.getItem('dailyUsage') || '{}');
    const today = new Date().toDateString();
    dailyUsage[today] = (dailyUsage[today] || 0) + 1;
    const today_obj = new Date();
    for (const date in dailyUsage) {
      if (Math.floor((today_obj - new Date(date)) / (86400000)) > 90) delete dailyUsage[date];
    }
    localStorage.setItem('dailyUsage', JSON.stringify(dailyUsage));
  }
  updateUsage();
  usageTrackingInterval = setInterval(updateUsage, 60000);
}

// ── Auth persistence ──────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
  }
});
