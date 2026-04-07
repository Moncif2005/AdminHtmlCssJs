// ===== STATE =====
let state = {
  page: 'dashboard',
  isAuthenticated: localStorage.getItem('isAuthenticated') === 'true',
  userEmail: localStorage.getItem('userEmail') || 'admin@formanova.com',
  users: [],
  courses: [],
  notifications: [
    { id: 1, title: 'New User Registered', message: 'A new learner just signed up.', time: '2 min ago', unread: true },
    { id: 2, title: 'Course Submitted', message: 'A new course is pending review.', time: '1 hour ago', unread: true },
    { id: 3, title: 'Payment Received', message: 'Payment of $49.99 received.', time: '3 hours ago', unread: true },
  ],
  editingUserId: null,
  editingCourseId: null,
  pendingDeleteFn: null,
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { id: 'users', label: 'Users', icon: 'users' },
  { id: 'courses', label: 'Courses', icon: 'book-open' },
  { id: 'enrollments', label: 'Enrollments', icon: 'file-check' },
  { id: 'exams', label: 'Exams', icon: 'clipboard-list' },
  { id: 'job-offers', label: 'Job Offers', icon: 'briefcase' },
  { id: 'certificates', label: 'Certificates', icon: 'award' },
  { id: 'payments', label: 'Payments', icon: 'dollar-sign' },
  { id: 'statistics', label: 'Statistics', icon: 'bar-chart-2' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const svgIcons = {
  'layout-dashboard': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  'users': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'book-open': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  'file-check': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>`,
  'clipboard-list': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
  'briefcase': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  'award': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`,
  'dollar-sign': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  'bar-chart-2': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>`,
  'settings': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  'trending-up': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  'trending-down': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
  'database': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
  'edit': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  'trash': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  'eye': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  'plus': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>`,
  'download': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  'search': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>`,
  'bell': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
};

function icon(name, extra = '') { return svgIcons[name] || ''; }

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  buildSidebar();
  renderNotifications();

  if (state.isAuthenticated) {
    showApp();
  } else {
    showLogin();
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-wrapper')) closeAllDropdowns();
  });
});

function showLogin() {
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
}

function showApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  const avatar = state.userEmail.charAt(0).toUpperCase();
  document.getElementById('header-avatar').textContent = avatar;
  document.getElementById('header-email').textContent = state.userEmail;
  navigate('dashboard');
}

// ===== LOGIN / LOGOUT =====
let loginLoading = false;
function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('Please fill in all fields', 'error'); return; }
  if (loginLoading) return;
  loginLoading = true;
  const btn = document.getElementById('login-btn');
  btn.innerHTML = '<div class="spinner"></div> Signing in...';
  btn.disabled = true;
  setTimeout(() => {
    state.userEmail = email;
    state.isAuthenticated = true;
    localStorage.setItem('isAuthenticated', 'true');
    if (document.getElementById('remember-me').checked) localStorage.setItem('userEmail', email);
    loginLoading = false;
    btn.innerHTML = 'Sign In';
    btn.disabled = false;
    showToast('Login successful!', 'success');
    showApp();
  }, 900);
}

function doLogout() {
  closeAllDropdowns();
  localStorage.removeItem('isAuthenticated');
  state.isAuthenticated = false;
  showToast('Logged out successfully', 'info');
  showLogin();
}

function togglePw() {
  const inp = document.getElementById('login-password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ===== NAVIGATION =====
function navigate(page) {
  state.page = page;
  closeAllDropdowns();
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const nav = navItems.find(n => n.id === page);
  document.getElementById('header-title').textContent = nav ? nav.label : '';
  renderPage(page);

  // Close sidebar on mobile
  if (window.innerWidth < 1024) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }
}

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = navItems.map(item => `
    <button class="nav-item" data-page="${item.id}" onclick="navigate('${item.id}')">
      ${svgIcons[item.icon] || ''}
      ${item.label}
    </button>
  `).join('');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

// ===== DROPDOWNS =====
function toggleDropdown(id) {
  const dd = document.getElementById(id);
  const wasOpen = dd.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) dd.classList.add('open');
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('open'));
}

// ===== TOAST =====
let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); }, 3000);
}

// ===== NOTIFICATIONS =====
function renderNotifications() {
  const list = document.getElementById('notif-list');
  const unread = state.notifications.filter(n => n.unread).length;
  const badge = document.getElementById('notif-count');
  badge.textContent = unread;
  badge.style.display = unread > 0 ? 'flex' : 'none';

  if (state.notifications.length === 0) {
    list.innerHTML = `<div class="empty-notif">${svgIcons.bell}<br/>No notifications</div>`;
    return;
  }
  list.innerHTML = state.notifications.map(n => `
    <div class="notif-item" onclick="readNotif(${n.id})">
      <div class="notif-row">
        ${n.unread ? '<div class="notif-dot"></div>' : '<div style="width:7px"></div>'}
        <div>
          <div class="notif-title">${n.title}</div>
          <div class="notif-msg">${n.message}</div>
          <div class="notif-time">${n.time}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function readNotif(id) {
  const n = state.notifications.find(n => n.id === id);
  if (n) n.unread = false;
  renderNotifications();
}

function markAllRead() {
  state.notifications.forEach(n => n.unread = false);
  renderNotifications();
}

// ===== MODALS =====
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

let confirmCb = null;
function showConfirm(msg, cb) {
  document.getElementById('confirm-msg').textContent = msg;
  confirmCb = cb;
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('open'); confirmCb = null; }
function confirmDelete() { if (confirmCb) confirmCb(); closeConfirm(); }

// ===== PAGE RENDERER =====
function renderPage(page) {
  const main = document.getElementById('main-content');
  switch (page) {
    case 'dashboard': main.innerHTML = renderDashboard(); break;
    case 'users': main.innerHTML = renderUsers(); break;
    case 'courses': main.innerHTML = renderCourses(); break;
    case 'enrollments': main.innerHTML = renderSimplePage('Enrollments Management', 'Track and manage student enrollments', enrollmentStats(), 'No enrollments yet', 'Enrollments will appear once students register for courses.'); break;
    case 'exams': main.innerHTML = renderSimplePage('Exams', 'Manage quizzes and assessments', examStats(), 'No exams yet', 'Create exams from the course management panel.'); break;
    case 'job-offers': main.innerHTML = renderSimplePage('Job Offers', 'Browse and manage job postings', jobStats(), 'No job offers yet', 'Companies can post job offers for your learners here.'); break;
    case 'certificates': main.innerHTML = renderSimplePage('Certificates', 'Issue and manage certificates', certStats(), 'No certificates yet', 'Certificates are issued automatically upon course completion.'); break;
    case 'payments': main.innerHTML = renderSimplePage('Payments', 'Track all transactions', paymentStats(), 'No payments yet', 'Payment records will appear here once transactions are made.'); break;
    case 'statistics': main.innerHTML = renderStatistics(); break;
    case 'settings': main.innerHTML = renderSettings(); break;
  }
}

// ===== DASHBOARD =====
function renderDashboard() {
  return `
    <div class="page-header"><h1>Dashboard</h1><p>Welcome back! Here's what's happening.</p></div>

    <div class="stat-grid stat-grid-5" style="margin-bottom:24px;">
      ${statCard('Total Users', state.users.length, 'users', 'bg-blue', '0%', true)}
      ${statCard('Learners', state.users.filter(u => u.type === 'Learner').length, 'users', 'bg-green', '0%', true)}
      ${statCard('Instructors', state.users.filter(u => u.type === 'Instructor').length, 'book-open', 'bg-purple', '0%', true)}
      ${statCard('Courses', state.courses.length, 'book-open', 'bg-orange', '0%', true)}
      ${statCard('Revenue', '$0', 'dollar-sign', 'bg-emerald', '0%', true)}
    </div>

    <div class="chart-row chart-row-2-1">
      <div class="card">
        <div class="card-header"><h3>Visitor Statistics</h3><span class="meta">Nov – July</span></div>
        <div class="chart-legend">
          <div class="legend-item"><div class="legend-dot" style="background:#109cf1"></div><span class="legend-label">LAST 6 MONTHS</span><span class="legend-val" style="margin-left:4px;">475,273</span></div>
          <div class="legend-item"><div class="legend-dot" style="background:#2ed47a"></div><span class="legend-label">PREVIOUS</span><span class="legend-val" style="margin-left:4px;">782,396</span></div>
        </div>
        ${emptyChart('No visitor data available')}
      </div>

      <div class="card">
        <div class="card-header"><h3>Tasks</h3><span class="meta" style="font-size:12px;color:var(--accent);cursor:pointer;">This month ▾</span></div>
        ${emptyChart('No task data available', 200)}
      </div>
    </div>

    <div class="chart-row" style="grid-template-columns:1fr 1fr;">
      <div class="card">
        <div class="card-header"><h3>Recent Activities</h3></div>
        ${emptyState('No recent activities', 'Activities will appear here once users interact with the system')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Top Courses</h3></div>
        ${state.courses.length > 0 ? renderTopCourses() : emptyState('No courses available', 'Create courses to see top performers here')}
      </div>
    </div>
  `;
}

function statCard(label, value, iconName, colorClass, change, up) {
  const colors = { 'bg-blue': '#3b82f6', 'bg-green': '#22c55e', 'bg-purple': '#a855f7', 'bg-orange': '#f97316', 'bg-emerald': '#10b981' };
  const bg = colors[colorClass] || '#4139c1';
  return `
    <div class="stat-card">
      <div class="stat-card-top">
        <div class="stat-icon" style="background:${bg}">${svgIcons[iconName] || ''}</div>
        <div class="stat-trend ${up ? 'up' : 'down'}">${svgIcons[up ? 'trending-up' : 'trending-down']} ${change}</div>
      </div>
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
    </div>`;
}

function emptyChart(msg, h = 260) {
  return `<div style="height:${h}px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--muted);">
    <div style="opacity:0.3;width:40px;height:40px;">${svgIcons.database}</div>
    <span style="font-size:13px;">${msg}</span>
  </div>`;
}

function emptyState(title, sub) {
  return `<div class="empty-state"><div>${svgIcons.database}</div><h4>${title}</h4><p>${sub}</p></div>`;
}

function renderTopCourses() {
  return state.courses.slice(0, 5).map((c, i) => `
    <div class="list-item">
      <div class="list-rank">${i + 1}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:14px;">${c.name}</div>
        <div style="font-size:12px;color:var(--muted);">${c.instructor}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:600;color:var(--primary);font-size:13px;">$${c.price || 0}</div>
        <div style="font-size:12px;color:var(--muted);">0 students</div>
      </div>
    </div>
  `).join('');
}

// ===== USERS =====
let userSearch = '', userFilter = 'all';

function renderUsers() {
  const filtered = state.users.filter(u => {
    const q = userSearch.toLowerCase();
    return (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
           (userFilter === 'all' || u.type.toLowerCase() === userFilter);
  });

  const typeColors = { Learner: 'badge-blue', Instructor: 'badge-purple', Admin: 'badge-red', Recruiter: 'badge-green' };

  return `
    <div class="page-header"><h1>Users</h1><p>Manage platform users and their roles</p></div>

    <div class="toolbar">
      <div class="search-bar" style="max-width:320px;">${svgIcons.search}<input type="text" placeholder="Search users..." value="${userSearch}" oninput="userSearch=this.value;renderPage('users')" /></div>
      <select class="filter-select" onchange="userFilter=this.value;renderPage('users')">
        <option value="all" ${userFilter==='all'?'selected':''}>All Roles</option>
        <option value="learner" ${userFilter==='learner'?'selected':''}>Learners</option>
        <option value="instructor" ${userFilter==='instructor'?'selected':''}>Instructors</option>
        <option value="admin" ${userFilter==='admin'?'selected':''}>Admins</option>
        <option value="recruiter" ${userFilter==='recruiter'?'selected':''}>Recruiters</option>
      </select>
      <button class="btn btn-outline btn-sm" onclick="showToast('Exporting...','info')">${svgIcons.download} Export</button>
      <button class="btn btn-purple" onclick="openAddUser()">${svgIcons.plus} Add User</button>
    </div>

    <div class="card">
      ${filtered.length === 0
        ? emptyState('No users yet', 'Click "Add User" to create your first user.')
        : `<div class="table-wrap"><table>
          <thead><tr>
            <th><input type="checkbox" /></th>
            <th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${filtered.map(u => `
              <tr>
                <td><input type="checkbox" /></td>
                <td style="font-weight:600;">${u.name}</td>
                <td style="color:var(--muted);">${u.email}</td>
                <td><span class="badge ${typeColors[u.type] || 'badge-gray'}">${u.type}</span></td>
                <td style="color:var(--muted);font-size:13px;">${u.created}</td>
                <td>
                  <div class="action-btns">
                    <button class="tbl-btn" onclick="openEditUser(${u.id})" title="Edit">${svgIcons.edit}</button>
                    <button class="tbl-btn danger" onclick="deleteUser(${u.id})" title="Delete">${svgIcons.trash}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>`
      }
    </div>`;
}

function openAddUser() {
  state.editingUserId = null;
  document.getElementById('user-modal-title').textContent = 'Add User';
  document.getElementById('user-save-btn').textContent = 'Add User';
  document.getElementById('u-name').value = '';
  document.getElementById('u-email').value = '';
  document.getElementById('u-password').value = '';
  document.getElementById('u-type').value = 'Learner';
  document.getElementById('u-pw-wrap').style.display = '';
  openModal('user-modal');
}

function openEditUser(id) {
  const u = state.users.find(u => u.id === id);
  if (!u) return;
  state.editingUserId = id;
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('user-save-btn').textContent = 'Save Changes';
  document.getElementById('u-name').value = u.name;
  document.getElementById('u-email').value = u.email;
  document.getElementById('u-password').value = '';
  document.getElementById('u-type').value = u.type;
  document.getElementById('u-pw-wrap').style.display = 'none';
  openModal('user-modal');
}

function saveUser() {
  const name = document.getElementById('u-name').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const password = document.getElementById('u-password').value;
  const type = document.getElementById('u-type').value;

  if (!name || !email) { showToast('Please fill all required fields', 'error'); return; }
  if (!state.editingUserId && !password) { showToast('Password is required', 'error'); return; }

  if (state.editingUserId) {
    const u = state.users.find(u => u.id === state.editingUserId);
    if (u) { u.name = name; u.email = email; u.type = type; }
    showToast('User updated successfully!', 'success');
  } else {
    state.users.push({ id: Date.now(), name, email, type, created: new Date().toLocaleDateString('en-GB') });
    showToast('User added successfully!', 'success');
  }
  closeModal('user-modal');
  renderPage('users');
}

function deleteUser(id) {
  const u = state.users.find(u => u.id === id);
  showConfirm(`Are you sure you want to delete "${u?.name}"? This action cannot be undone.`, () => {
    state.users = state.users.filter(u => u.id !== id);
    showToast('User deleted.', 'info');
    renderPage('users');
  });
}

// ===== COURSES =====
let courseSearch = '', courseFilter = 'all';

function renderCourses() {
  const filtered = state.courses.filter(c => {
    const q = courseSearch.toLowerCase();
    return (c.name.toLowerCase().includes(q) || c.instructor.toLowerCase().includes(q)) &&
           (courseFilter === 'all' || c.type.toLowerCase() === courseFilter.toLowerCase());
  });

  const typeColors = { PDF: 'badge-red', MP4: 'badge-blue', PPTX: 'badge-orange', DOC: 'badge-green', MP3: 'badge-purple' };

  return `
    <div class="page-header"><h1>Courses</h1><p>Manage course catalog and content</p></div>

    <div class="toolbar">
      <div class="search-bar" style="max-width:320px;">${svgIcons.search}<input type="text" placeholder="Search courses..." value="${courseSearch}" oninput="courseSearch=this.value;renderPage('courses')" /></div>
      <select class="filter-select" onchange="courseFilter=this.value;renderPage('courses')">
        <option value="all" ${courseFilter==='all'?'selected':''}>All Types</option>
        <option value="PDF" ${courseFilter==='PDF'?'selected':''}>PDF</option>
        <option value="MP4" ${courseFilter==='MP4'?'selected':''}>MP4</option>
        <option value="PPTX" ${courseFilter==='PPTX'?'selected':''}>PPTX</option>
        <option value="DOC" ${courseFilter==='DOC'?'selected':''}>DOC</option>
        <option value="MP3" ${courseFilter==='MP3'?'selected':''}>MP3</option>
      </select>
      <button class="btn btn-outline btn-sm" onclick="showToast('Exporting...','info')">${svgIcons.download} Export</button>
      <button class="btn btn-purple" onclick="openAddCourse()">${svgIcons.plus} Add Course</button>
    </div>

    <div class="card">
      ${filtered.length === 0
        ? emptyState('No courses yet', 'Click "Add Course" to create your first course.')
        : `<div class="table-wrap"><table>
          <thead><tr>
            <th><input type="checkbox" /></th>
            <th>Course Name</th><th>Instructor</th><th>Type</th><th>Price</th><th>Created</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${filtered.map(c => `
              <tr>
                <td><input type="checkbox" /></td>
                <td style="font-weight:600;">${c.name}</td>
                <td style="color:var(--muted);">${c.instructor}</td>
                <td><span class="badge ${typeColors[c.type] || 'badge-gray'}">${c.type}</span></td>
                <td>$${c.price || 0}</td>
                <td style="color:var(--muted);font-size:13px;">${c.created}</td>
                <td>
                  <div class="action-btns">
                    <button class="tbl-btn" onclick="openEditCourse(${c.id})" title="Edit">${svgIcons.edit}</button>
                    <button class="tbl-btn danger" onclick="deleteCourse(${c.id})" title="Delete">${svgIcons.trash}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>`
      }
    </div>`;
}

function openAddCourse() {
  state.editingCourseId = null;
  document.getElementById('course-modal-title').textContent = 'Add Course';
  document.getElementById('course-save-btn').textContent = 'Add Course';
  document.getElementById('c-name').value = '';
  document.getElementById('c-instructor').value = '';
  document.getElementById('c-type').value = 'PDF';
  document.getElementById('c-price').value = '0';
  document.getElementById('c-desc').value = '';
  openModal('course-modal');
}

function openEditCourse(id) {
  const c = state.courses.find(c => c.id === id);
  if (!c) return;
  state.editingCourseId = id;
  document.getElementById('course-modal-title').textContent = 'Edit Course';
  document.getElementById('course-save-btn').textContent = 'Save Changes';
  document.getElementById('c-name').value = c.name;
  document.getElementById('c-instructor').value = c.instructor;
  document.getElementById('c-type').value = c.type;
  document.getElementById('c-price').value = c.price || 0;
  document.getElementById('c-desc').value = c.description || '';
  openModal('course-modal');
}

function saveCourse() {
  const name = document.getElementById('c-name').value.trim();
  const instructor = document.getElementById('c-instructor').value.trim();
  const type = document.getElementById('c-type').value;
  const price = document.getElementById('c-price').value || '0';
  const description = document.getElementById('c-desc').value.trim();

  if (!name || !instructor) { showToast('Please fill all required fields', 'error'); return; }

  if (state.editingCourseId) {
    const c = state.courses.find(c => c.id === state.editingCourseId);
    if (c) { c.name = name; c.instructor = instructor; c.type = type; c.price = price; c.description = description; }
    showToast('Course updated successfully!', 'success');
  } else {
    state.courses.push({ id: Date.now(), name, instructor, type, price, description, created: new Date().toLocaleDateString('en-GB') });
    showToast('Course added successfully!', 'success');
  }
  closeModal('course-modal');
  renderPage('courses');
}

function deleteCourse(id) {
  const c = state.courses.find(c => c.id === id);
  showConfirm(`Are you sure you want to delete "${c?.name}"? This action cannot be undone.`, () => {
    state.courses = state.courses.filter(c => c.id !== id);
    showToast('Course deleted.', 'info');
    renderPage('courses');
  });
}

// ===== SIMPLE PAGES (Enrollments, Exams, Jobs, Certs, Payments) =====
function enrollmentStats() {
  return [
    { label: 'Total Enrollments', value: 0, icon: 'file-check', color: '#3b82f6' },
    { label: 'Completed', value: 0, icon: 'award', color: '#22c55e' },
    { label: 'Active', value: 0, icon: 'users', color: '#a855f7' },
    { label: 'Revenue', value: '$0', icon: 'dollar-sign', color: '#10b981' },
  ];
}
function examStats() {
  return [
    { label: 'Total Exams', value: 0, icon: 'clipboard-list', color: '#4139c1' },
    { label: 'Upcoming', value: 0, icon: 'award', color: '#f97316' },
    { label: 'Active', value: 0, icon: 'bar-chart-2', color: '#a855f7' },
    { label: 'Passed', value: 0, icon: 'award', color: '#22c55e' },
  ];
}
function jobStats() {
  return [
    { label: 'Total Job Offers', value: 0, icon: 'briefcase', color: '#4139c1' },
    { label: 'Open Positions', value: 0, icon: 'award', color: '#22c55e' },
    { label: 'Closed', value: 0, icon: 'award', color: '#f7685b' },
    { label: 'Companies', value: 0, icon: 'users', color: '#109cf1' },
  ];
}
function certStats() {
  return [
    { label: 'Total Certificates', value: 0, icon: 'award', color: '#4139c1' },
    { label: 'Issued', value: 0, icon: 'file-check', color: '#22c55e' },
    { label: 'Pending', value: 0, icon: 'award', color: '#ffb946' },
    { label: 'Verified', value: 0, icon: 'file-check', color: '#109cf1' },
  ];
}
function paymentStats() {
  return [
    { label: 'Total Revenue', value: '$0', icon: 'dollar-sign', color: '#4139c1' },
    { label: 'Completed', value: 0, icon: 'file-check', color: '#22c55e' },
    { label: 'Pending', value: 0, icon: 'award', color: '#ffb946' },
    { label: 'Failed', value: 0, icon: 'award', color: '#f7685b' },
  ];
}

function renderSimplePage(title, subtitle, stats, emptyTitle, emptySubtitle) {
  return `
    <div class="page-header"><h1>${title}</h1><p>${subtitle}</p></div>
    <div class="stat-grid stat-grid-4" style="margin-bottom:24px;">
      ${stats.map(s => `
        <div class="stat-card">
          <div class="stat-card-top">
            <div class="stat-icon" style="background:${s.color}">${svgIcons[s.icon] || ''}</div>
          </div>
          <div class="stat-label">${s.label}</div>
          <div class="stat-value">${s.value}</div>
        </div>
      `).join('')}
    </div>
    <div class="card">
      <div class="toolbar" style="margin-bottom:16px;">
        <div class="search-bar" style="max-width:320px;">${svgIcons.search}<input type="text" placeholder="Search..." /></div>
        <button class="btn btn-outline btn-sm">${svgIcons.download} Export</button>
      </div>
      ${emptyState(emptyTitle, emptySubtitle)}
    </div>`;
}

// ===== STATISTICS =====
function renderStatistics() {
  return `
    <div class="page-header"><h1>Statistics</h1><p>Platform analytics and insights</p></div>
    <div class="stat-grid stat-grid-4" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:#4139c1">${svgIcons.users}</div></div><div class="stat-label" style="font-style:italic;">Total Users</div><div class="stat-value">${state.users.length}</div></div>
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:#109cf1">${svgIcons['book-open']}</div></div><div class="stat-label" style="font-style:italic;">Total Courses</div><div class="stat-value">${state.courses.length}</div></div>
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:#2ed47a">${svgIcons['file-check']}</div></div><div class="stat-label" style="font-style:italic;">Total Enrollments</div><div class="stat-value">0</div></div>
      <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:#ffb946">${svgIcons.award}</div></div><div class="stat-label" style="font-style:italic;">Certificates Issued</div><div class="stat-value">0</div></div>
    </div>
    <div class="chart-row" style="grid-template-columns: 3fr 2fr;">
      <div class="card">
        <div class="card-header">
          <h3>User Growth</h3>
          <button class="btn btn-outline btn-sm" style="font-size:11px;padding:5px 10px;">Monthly</button>
        </div>
        ${state.users.length > 0
          ? `<div style="height:280px;display:flex;align-items:flex-end;gap:12px;padding-top:16px;">
              ${['Jan','Feb','Mar','Apr','May','Jun'].map((m,i) => `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
                  <div style="width:100%;background:var(--primary-light);border-radius:6px 6px 0 0;height:${20+i*20}px;"></div>
                  <span style="font-size:11px;color:var(--muted);">${m}</span>
                </div>
              `).join('')}
            </div>`
          : emptyChart('No user growth data available', 280)
        }
      </div>
      <div class="card">
        <div class="card-header"><h3>Enrollment Trend</h3></div>
        ${emptyChart('No enrollment data available', 280)}
      </div>
    </div>`;
}

// ===== SETTINGS =====
function renderSettings() {
  return `
    <div class="page-header"><h1>Settings</h1><p>Manage your platform configuration</p></div>
    <div class="card">
      <h2 style="font-size:20px;font-weight:700;margin-bottom:28px;">General Settings</h2>
      <div class="settings-grid">
        <div class="settings-field">
          <label>System Language</label>
          <select>
            <option>English</option>
            <option>Français</option>
            <option>Español</option>
            <option>Deutsch</option>
            <option>العربية</option>
          </select>
        </div>
        <div class="settings-field">
          <label>User Sign Up</label>
          <div class="toggle-row">
            <span>Allow new registrations</span>
            <label class="toggle">
              <input type="checkbox" checked />
              <div class="track"></div>
              <div class="thumb"></div>
            </label>
          </div>
        </div>
        <div class="settings-field">
          <label>Admin Dashboard Theme</label>
          <select>
            <option>Light Theme</option>
            <option>Dark Theme</option>
            <option>Auto (System)</option>
          </select>
        </div>
        <div class="settings-field">
          <label>Default User Theme</label>
          <select>
            <option>Light Theme</option>
            <option>Dark Theme</option>
            <option>Auto (System)</option>
          </select>
        </div>
        <div class="settings-field">
          <label>Platform Name</label>
          <input type="text" value="Formanova" />
        </div>
        <div class="settings-field">
          <label>Support Email</label>
          <input type="email" value="support@formanova.com" />
        </div>
        <div class="settings-field">
          <label>Email Notifications</label>
          <div class="toggle-row">
            <span>Send system emails</span>
            <label class="toggle">
              <input type="checkbox" checked />
              <div class="track"></div>
              <div class="thumb"></div>
            </label>
          </div>
        </div>
        <div class="settings-field">
          <label>Maintenance Mode</label>
          <div class="toggle-row">
            <span>Enable maintenance mode</span>
            <label class="toggle">
              <input type="checkbox" />
              <div class="track"></div>
              <div class="thumb"></div>
            </label>
          </div>
        </div>
      </div>
      <div style="margin-top:32px;display:flex;gap:12px;">
        <button class="btn btn-purple" onclick="showToast('Settings saved!','success')">Save Changes</button>
        <button class="btn btn-outline" onclick="showToast('Settings reset to defaults','info')">Reset to Defaults</button>
      </div>
    </div>`;
}

// ===== LOGIN ENTER KEY =====
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').classList.contains('active')) doLogin();
});
