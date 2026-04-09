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
  if (!email || !password) { showToast("Please fill in all fields", "error"); return; }
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
    showToast("Welcome back, Admin!");
    buildSidebar(); renderNotifs(); navigate("dashboard");
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
  { section: "Overview" },
  { id: "dashboard", label: "Dashboard", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>` },
  { id: "statistics", label: "Statistics", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>` },
  { section: "Content" },
  { id: "users", label: "Users", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
  { id: "courses", label: "Courses", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>` },
  { id: "certificates", label: "Certificates", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>` },
  { section: "Careers" },
  { id: "jobs", label: "Job Offers", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>` },
  { section: "Finance" },
  { id: "payments", label: "Payments", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>` },
  { section: "System" },
  { id: "settings", label: "Settings", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>` },
];

function buildSidebar() {
  const nav = $("sidebar-nav");
  nav.innerHTML = "";
  NAV_ITEMS.forEach(item => {
    if (item.section) {
      const sec = document.createElement("div");
      sec.className = "nav-section";
      sec.textContent = item.section;
      nav.appendChild(sec);
      return;
    }
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.dataset.id = item.id;
    btn.innerHTML = item.icon + `<span>${item.label}</span>`;
    btn.addEventListener("click", () => { navigate(item.id); closeMobileSidebar(); });
    nav.appendChild(btn);
  });
}

let currentPage = "";
function navigate(page) {
  currentPage = page;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.id === page));
  const titles = { dashboard: "Dashboard", users: "User Management", courses: "Courses", certificates: "Certificates", jobs: "Job Offers", payments: "Payments", statistics: "Statistics", settings: "Settings" };
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
    job: "jobs",
    offer: "offers",
    cert: "certificates",
    payment: "payments"
  };
  const coll = collMap[pendingDeleteType];
  const reloads = {
    user: loadUsers,
    course: loadCourses,
    job: loadJobs,
    offer: loadJobs,
    cert: loadCertificates,
    payment: loadPayments
  };

  try {
    console.log(`Deleting ${pendingDeleteType}: ${pendingDeleteId}`);

    if (pendingDeleteType === "user" && pendingDeleteId === auth.currentUser?.uid) {
      showToast("You cannot delete your own account", "error");
      $("confirm-overlay").classList.remove("open");
      pendingDeleteId = pendingDeleteType = null;
      return;
    }

    await deleteDoc(doc(db, coll, pendingDeleteId));
    showToast("Deleted successfully!");

    if (reloads[pendingDeleteType]) {
      await reloads[pendingDeleteType]();
    }
  } catch (err) {
    console.error("Delete error:", err);
    showToast("Error: " + err.message, "error");
  }

  $("confirm-overlay").classList.remove("open");
  pendingDeleteId = pendingDeleteType = null;
});

// ═══════════════════════════════════════════════════════════════
// ── USERS ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadUsers() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>User Management</h1><p>Manage all platform users</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="user-search" placeholder="Search by name or email..." /></div>
        <select class="filter-select" id="role-filter"><option value="">All Roles</option><option>Admin</option><option>Instructor</option><option>Learner</option><option>Recruiter</option></select>
        <button class="btn btn-purple" id="add-user-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>Add User</button>
      </div>
      <div id="users-table-wrap"><div class="empty-state"><p>Loading...</p></div></div>
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
    wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><h4>No users found</h4></div>`;
    return;
  }

  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>User</th><th>Email</th><th>Role</th><th>Actions</th></tr>
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
  $("user-modal-title").textContent = "Add User";
  $("user-save-btn").textContent = "Add User";
  $("u-pw-wrap").style.display = "block";
  openModal("user-modal");
}

function editUser(id, name, email, role) {
  editingUserId = id;
  $("u-name").value = name;
  $("u-email").value = email;
  $("u-type").value = role;
  $("u-password").value = "";
  $("user-modal-title").textContent = "Edit User";
  $("user-save-btn").textContent = "Save Changes";
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
    showToast("Fill all required fields", "error");
    return;
  }

  const btn = $("user-save-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    if (editingUserId) {
      await updateDoc(doc(db, "users", editingUserId), { name, email, role, phone });
      showToast("User updated");
    } else {
      if (!password || password.length < 6) {
        showToast("Password must be at least 6 characters", "error");
        btn.disabled = false;
        btn.textContent = "Add User";
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

        showToast("User added successfully!");
      } catch (authError) {
        let errorMsg = authError.message;
        if (authError.code === "auth/email-already-in-use") {
          errorMsg = "This email is already registered";
        } else if (authError.code === "auth/weak-password") {
          errorMsg = "Password should be at least 6 characters";
        }
        showToast("Error: " + errorMsg, "error");
        btn.disabled = false;
        btn.textContent = "Add User";
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
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>Dashboard</h1><p>Welcome back, ${currentUser?.email || "Admin"}</p></div>
    </div>
    <div class="stat-grid stat-grid-4" id="dash-stats">
      ${[1, 2, 3, 4].map(() => `<div class="stat-card"><div class="skeleton" style="height:80px;border-radius:8px;"></div></div>`).join("")}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3>Recent Users</h3><span class="meta">Latest registrations</span></div>
        <div id="dash-recent"><div class="empty-state"><p>Loading...</p></div></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Recent Activity</h3><span class="meta">Platform events</span></div>
        <div id="dash-activity"></div>
      </div>
    </div>`;

  $("dash-activity").innerHTML = [
    { color: "var(--primary)", bg: "var(--primary-light)", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>`, text: "New learner registered", time: "2 min ago" },
    { color: "var(--success)", bg: "#dcfce7", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`, text: "Payment of $149 received", time: "1 hr ago" },
    { color: "var(--warning)", bg: "#fef9c3", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`, text: "New job offer posted", time: "3 hr ago" },
    { color: "var(--accent)", bg: "#dbeafe", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`, text: "Certificate issued to learner", time: "5 hr ago" },
    { color: "var(--danger)", bg: "#fee2e2", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`, text: "New course submitted", time: "Yesterday" },
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
    let coursesSize = 0, jobsSize = 0, certsSize = 0;
    try { const cs = await getDocs(collection(db, "courses")); coursesSize = cs.size; } catch (_) { }
    try { const js = await getDocs(collection(db, "offers")); jobsSize = js.size; } catch (_) { }
    try { const ce = await getDocs(collection(db, "certificates")); certsSize = ce.size; } catch (_) { }
    const total = usersSnap.size;

    $("dash-stats").innerHTML = `
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon" style="background:linear-gradient(135deg,var(--primary),#6b63ff)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <div class="stat-trend up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>+12%</div>
        </div>
        <div class="stat-label">Total Users</div><div class="stat-value">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon" style="background:linear-gradient(135deg,var(--accent),#0ea5e9)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></div>
          <div class="stat-trend up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>+5%</div>
        </div>
        <div class="stat-label">Courses</div><div class="stat-value">${coursesSize}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon" style="background:linear-gradient(135deg,var(--warning),#f97316)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></div>
          <div class="stat-trend up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>+8%</div>
        </div>
        <div class="stat-label">Job Offers</div><div class="stat-value">${jobsSize}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon" style="background:linear-gradient(135deg,var(--success),#16a34a)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg></div>
          <div class="stat-trend up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>+21%</div>
        </div>
        <div class="stat-label">Certificates</div><div class="stat-value">${certsSize}</div>
      </div>`;

    const recent = usersSnap.docs.slice(0, 5);
    $("dash-recent").innerHTML = recent.length ? `
      <div class="table-wrap"><table>
        <tr><th>Name</th><th>Role</th></tr>
        ${recent.map(d => {
      const u = d.data(); return `
          <tr>
            <td><div style="display:flex;align-items:center;gap:10px;">
              <div class="avatar" style="width:30px;height:30px;font-size:11px;">${(u.name || u.email || "?").charAt(0).toUpperCase()}</div>
              <div><div style="font-weight:600;font-size:13.5px;">${u.name || "—"}</div><div style="font-size:12px;color:var(--muted);">${u.email || ""}</div></div>
            </div></td>
            <td>${roleBadge(u.role)}</td>
          </tr>`;
    }).join("")}
      </table></div>` : `<div class="empty-state"><p>No users yet</p></div>`;
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
      <div class="page-header-left"><h1>Courses</h1><p>Manage all platform courses</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="course-search" placeholder="Search courses..." /></div>
        <button class="btn btn-purple" id="add-course-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>Add Course</button>
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
  if (!courses?.length) { wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg><h4>No courses yet</h4></div>`; return; }
  const typeBadge = { PDF: "badge-red", MP4: "badge-blue", PPTX: "badge-orange", DOC: "badge-purple", MP3: "badge-green" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>Course</th><th>Instructor</th><th>Category</th><th>Type</th><th>Price</th><th>Actions</th></tr>
    ${courses.map(c => `<tr>
      <td><strong>${c.name || "—"}</strong></td>
      <td style="color:var(--muted)">${c.instructor || "—"}</td>
      <td><span class="badge badge-indigo">${c.category || "General"}</span></td>
      <td><span class="badge ${typeBadge[c.type] || "badge-gray"}">${c.type || "—"}</span></td>
      <td>${c.price ? `<strong>$${c.price}</strong>` : `<span style="color:var(--success);font-weight:700">Free</span>`}</td>
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
  $("course-modal-title").textContent = "Add Course";
  $("course-save-btn").textContent = "Add Course";
  openModal("course-modal");
}

function editCourse(id, name, instructor, type, price, desc, category) {
  editingCourseId = id;
  $("c-name").value = name; $("c-instructor").value = instructor;
  $("c-type").value = type; $("c-price").value = price; $("c-desc").value = desc;
  if ($("c-category")) $("c-category").value = category || "";
  $("course-modal-title").textContent = "Edit Course";
  $("course-save-btn").textContent = "Save Changes";
  openModal("course-modal");
}

$("course-save-btn").addEventListener("click", async () => {
  const name = ($("c-name").value || "").trim(), instructor = ($("c-instructor").value || "").trim();
  const type = $("c-type").value, price = parseFloat($("c-price").value) || 0;
  const description = ($("c-desc").value || "").trim(), category = ($("c-category")?.value || "General").trim();
  if (!name || !instructor) { showToast("Fill all required fields", "error"); return; }
  const btn = $("course-save-btn"); btn.disabled = true; btn.textContent = "Saving...";
  try {
    if (editingCourseId) { await updateDoc(doc(db, "courses", editingCourseId), { name, instructor, type, price, description, category }); showToast("Course updated"); }
    else { await addDoc(collection(db, "courses"), { name, instructor, type, price, description, category, createdAt: serverTimestamp() }); showToast("Course added"); }
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
      <div class="page-header-left"><h1>Job Offers</h1><p>Manage career opportunities on the platform</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="job-search" placeholder="Search jobs..." /></div>
        <select class="filter-select" id="job-status-filter"><option value="">All Status</option><option>Active</option><option>Pending</option><option>Closed</option></select>
        <select class="filter-select" id="job-type-filter"><option value="">All Types</option><option>Full-time</option><option>Part-time</option><option>Remote</option><option>Internship</option><option>Freelance</option></select>
        <button class="btn btn-purple" id="add-job-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>Post Job</button>
      </div>
      <div id="jobs-table-wrap"><div class="empty-state"><p>Loading...</p></div></div>
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
  if (!jobs?.length) { wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg><h4>No job offers yet</h4><p>Post the first job offer for learners</p></div>`; return; }
  const statusClass = { Active: "status-active", Pending: "status-pending", Closed: "status-closed" };
  const typeBadge = { "Full-time": "badge-blue", "Part-time": "badge-purple", "Remote": "badge-green", "Internship": "badge-orange", "Freelance": "badge-teal" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>Title</th><th>Company</th><th>Location</th><th>Type</th><th>Salary</th><th>Status</th><th>Actions</th></tr>
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
  $("job-modal-title").textContent = "Post Job Offer";
  $("job-save-btn").textContent = "Post Job";
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
  $("job-modal-title").textContent = "Edit Job Offer";
  $("job-save-btn").textContent = "Save Changes";
  openModal("job-modal");
}

$("job-save-btn").addEventListener("click", async () => {
  const title = ($("j-title").value || "").trim();
  const company = ($("j-company").value || "").trim();
  if (!title || !company) { showToast("Fill all required fields", "error"); return; }
  const data = {
    title, company,
    location: ($("j-location").value || "").trim(),
    type: $("j-type").value,
    salary: ($("j-salary").value || "").trim(),
    status: $("j-status").value,
    description: ($("j-desc").value || "").trim(),
  };
  const btn = $("job-save-btn"); btn.disabled = true; btn.textContent = "Saving...";
  try {
    if (editingJobId) { await updateDoc(doc(db, "offers", editingJobId), data); showToast("Job updated"); }
    else { await addDoc(collection(db, "offers"), { ...data, createdAt: serverTimestamp() }); showToast("Job posted"); }
    closeModal("job-modal"); loadJobs();
  } catch (err) { showToast("Error: " + err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = editingJobId ? "Save Changes" : "Post Job"; }
});

// ═══════════════════════════════════════════════════════════════
// ── CERTIFICATES ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadCertificates() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>Certificates</h1><p>Issue and manage learner certificates</p></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="cert-search" placeholder="Search certificates..." /></div>
        <select class="filter-select" id="cert-grade-filter"><option value="">All Grades</option><option>Distinction</option><option>Merit</option><option>Pass</option></select>
        <button class="btn btn-purple" id="add-cert-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>Issue Certificate</button>
      </div>
      <div id="certs-table-wrap"><div class="empty-state"><p>Loading...</p></div></div>
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
  if (!certs?.length) { wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg><h4>No certificates issued</h4><p>Issue your first certificate to a learner</p></div>`; return; }
  const gradeBadge = { Distinction: "badge-purple", Merit: "badge-blue", Pass: "badge-green" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>Learner</th><th>Course</th><th>Certificate ID</th><th>Grade</th><th>Issue Date</th><th>Actions</th></tr>
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
  $("cert-modal-title").textContent = "Issue Certificate";
  $("cert-save-btn").textContent = "Issue Certificate";
  openModal("cert-modal");
}

$("cert-save-btn").addEventListener("click", async () => {
  const learner = ($("cert-learner").value || "").trim();
  const course = ($("cert-course").value || "").trim();
  if (!learner || !course) { showToast("Fill all required fields", "error"); return; }
  const certId = $("cert-id").value || genCertId();
  const grade = $("cert-grade").value;
  const issueDate = $("cert-date").value;
  const btn = $("cert-save-btn"); btn.disabled = true; btn.textContent = "Issuing...";
  try {
    await addDoc(collection(db, "certificates"), { learner, course, certId, grade, issueDate, createdAt: serverTimestamp() });
    showToast("Certificate issued successfully");
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
      <div class="page-header-left"><h1>Payments</h1><p>Track all transactions and revenue</p></div>
    </div>
    <div class="stat-grid stat-grid-2" style="margin-bottom:20px;" id="pay-stats">
      <div class="stat-card"><div class="skeleton" style="height:70px;border-radius:8px;"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:70px;border-radius:8px;"></div></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="pay-search" placeholder="Search by user or course..." /></div>
        <select class="filter-select" id="pay-status-filter"><option value="">All Status</option><option>Completed</option><option>Pending</option><option>Refunded</option></select>
        <button class="btn btn-purple" id="add-pay-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>Add Transaction</button>
      </div>
      <div id="pay-table-wrap"><div class="empty-state"><p>Loading...</p></div></div>
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
  if (!payments?.length) { wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg><h4>No transactions yet</h4><p>Payment records will appear here</p></div>`; return; }
  const statusBadge = { Completed: "badge-green", Pending: "badge-orange", Refunded: "badge-gray" };
  wrap.innerHTML = `<div class="table-wrap"><table>
    <tr><th>Transaction ID</th><th>User</th><th>Course</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th><th>Actions</th></tr>
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
// ── STATISTICS & SETTINGS ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function renderStatistics() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>Statistics</h1><p>Platform analytics and insights</p></div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Platform Statistics</h3></div>
      <div id="stats-content"><div class="empty-state"><p>Loading statistics...</p></div></div>
    </div>`;

  try {
    const [usersSnap, coursesSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "courses"))
    ]);

    let certsSnap, jobsSnap, paymentsSnap;
    try { certsSnap = await getDocs(collection(db, "certificates")); } catch (_) { }
    try { jobsSnap = await getDocs(collection(db, "offers")); } catch (_) { }
    try { paymentsSnap = await getDocs(collection(db, "payments")); } catch (_) { }

    const totalUsers = usersSnap.size;
    const totalCourses = coursesSnap.size;
    const totalCerts = certsSnap?.size || 0;
    const totalJobs = jobsSnap?.size || 0;
    const totalRevenue = paymentsSnap?.docs.filter(d => d.data().status === "Completed").reduce((s, d) => s + (parseFloat(d.data().amount) || 0), 0) || 0;

    $("stats-content").innerHTML = `
      <div class="stat-grid stat-grid-4" style="margin-bottom:20px;">
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--primary)"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
          <div class="stat-label">Total Users</div><div class="stat-value">${totalUsers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent)"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg></div>
          <div class="stat-label">Total Courses</div><div class="stat-value">${totalCourses}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--warning)"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect width="20" height="14" x="2" y="7" rx="2"/></svg></div>
          <div class="stat-label">Job Offers</div><div class="stat-value">${totalJobs}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--success)"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/></svg></div>
          <div class="stat-label">Total Revenue</div><div class="stat-value">$${totalRevenue.toFixed(2)}</div>
        </div>
      </div>
      <div class="grid-2">
        <div class="info-box">
          <h4>Certificates Issued</h4>
          <p style="font-size:32px;font-weight:700;color:var(--primary);">${totalCerts}</p>
        </div>
        <div class="info-box">
          <h4>Active Jobs</h4>
          <p style="font-size:32px;font-weight:700;color:var(--accent);">${jobsSnap?.docs.filter(d => d.data().status === "Active").length || 0}</p>
        </div>
      </div>
    `;
  } catch (err) {
    $("stats-content").innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
  }
}

function renderSettings() {
  $("main-content").innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>Settings</h1><p>Configure your platform preferences</p></div>
    </div>
    <div class="card settings-section">
      <div class="card-header"><h3>Account Information</h3></div>
      <div class="settings-grid">
        <div class="settings-field"><label>Email Address</label><input type="email" value="${currentUser?.email || ""}" readonly style="opacity:0.7;cursor:default;background:#f8fafc"/></div>
        <div class="settings-field"><label>Role</label><input type="text" value="Administrator" readonly style="opacity:0.7;cursor:default;background:#f8fafc"/></div>
      </div>
    </div>
    <div class="card settings-section">
      <div class="card-header"><h3>Danger Zone</h3></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;border:1.5px solid var(--danger);border-radius:10px;background:#fff5f5;">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--danger);">Clear All Data</div>
          <div style="font-size:13px;color:var(--muted);">This will permanently delete all users, courses, and records</div>
        </div>
        <button class="btn btn-danger" onclick="showToast('This action is disabled in demo mode','error')">Clear Data</button>
      </div>
    </div>`;
}
