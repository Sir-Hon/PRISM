/** Page script for admin.html — keep HTML in the .html file. */
function escJs(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function userRole(u) {
  return String(u && u.role != null ? u.role : '').toLowerCase().trim();
}

let adminUsersCache = [];
let adminUsersError = '';

/** Loads all users from API into adminUsersCache; clears legacy prism_accounts to avoid stale client-only data. */
async function refreshAdminUsers() {
  adminUsersError = '';
  const alertEl = document.getElementById('admin-users-alert');
  try {
    adminUsersCache = await PrismAdmin.getAllUsers();
    try { localStorage.removeItem('prism_accounts'); } catch (e) {}
    if (alertEl) { alertEl.style.display = 'none'; alertEl.textContent = ''; }
  } catch (e) {
    adminUsersCache = [];
    adminUsersError = e.message || 'Could not load users from the database.';
    console.error('refreshAdminUsers:', e);
    if (alertEl) {
      alertEl.style.display = 'block';
      alertEl.textContent = adminUsersError + ' If this is the live site, wait a few seconds and refresh — the server may still be starting.';
    }
  }
}

function fmtDashEvTime(t) {
  if (!t) return '';
  const p = String(t).split(':');
  const hr = parseInt(p[0], 10) || 0;
  const m = p[1] != null ? p[1] : '00';
  return ((hr % 12) || 12) + ':' + m + (hr >= 12 ? ' PM' : ' AM');
}
function escDash(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function renderDashboardIncomingEvents() {
  const el = document.getElementById('dash-events-list');
  if (!el) return;
  let raw = [];
  try { raw = (typeof prismLoadScopedList === 'function') ? prismLoadScopedList('prism_events') : []; } catch (e) { raw = []; }
  const todayStr = new Date().toISOString().split('T')[0];
  const upcoming = raw.filter(e => e.date >= todayStr)
    .sort((a, b) => {
      const c = a.date.localeCompare(b.date);
      return c !== 0 ? c : String(a.time || '').localeCompare(String(b.time || ''));
    })
    .slice(0, 8);
  if (!upcoming.length) {
    el.innerHTML = '<div style="text-align:center;padding:1rem 0;color:#9ca3af;font-size:.9rem;">No upcoming events. Add events on the calendar.</div>';
    return;
  }
  el.innerHTML = upcoming.map(ev => {
    const dl = new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const bar = ev.color || '#6d28d9';
    return '<div class="dash-ev-row"><div class="dash-ev-bar" style="background:' + bar + '"></div><div><div class="dash-ev-title">' + escDash(ev.title || 'Event') + '</div><div class="dash-ev-meta">' + escDash(dl) + (ev.time ? ' · ' + fmtDashEvTime(ev.time) : '') + '</div></div></div>';
  }).join('');
}

window.addEventListener('DOMContentLoaded', async () => {
  if (window.__prismAdminSession) await window.__prismAdminSession;
  const user = await prismAuthGuard(['admin']);
  if (!user) return;
  if (typeof initSidebar === 'function') initSidebar('home');
  const hour = new Date().getHours();
  const g = hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
  document.getElementById('admin-greeting').textContent = `${g}, ${user.name}`;
  if (typeof prismBannerMount === 'function') prismBannerMount(document.querySelector('.admin-hero'), 'greet');
  var adminUrl = document.getElementById('admin-url');
  if (adminUrl) adminUrl.textContent = location.origin + location.pathname.replace(/[^/]+$/, '') + 'admin-register.html';
  try {
    if (typeof PrismEvents !== 'undefined' && PrismEvents.get) {
      const apiEv = await PrismEvents.get();
      const mapped = apiEv.map(e => ({
        id: e.id, title: e.title, date: e.event_date, time: e.event_time || '', notes: e.notes || '', color: e.color || '#6d28d9', alarm: e.alarm
      }));
      if (typeof prismSaveScopedList === 'function') prismSaveScopedList('prism_events', mapped);
    }
  } catch (evErr) { console.warn('Events sync:', evErr); }
  renderDashboardIncomingEvents();
  await refreshAdminUsers();
  applyAdminCards();
  await renderStats();
  await renderTeachers();
  await renderStudents();
  await renderAnnouncements();
});

/* ── STATS ── */
async function renderStats() {
  try {
    const users = adminUsersCache || [];
    const teachers = users.filter(a => userRole(a) === 'teacher').length;
    const students = users.filter(a => userRole(a) === 'student').length;
    const teacherMeta = document.getElementById('card-teachers-meta');
    const studentMeta = document.getElementById('card-students-meta');
    if (teacherMeta) teacherMeta.textContent = teachers + ' teacher' + (teachers === 1 ? '' : 's');
    if (studentMeta) studentMeta.textContent = students + ' student' + (students === 1 ? '' : 's');
  } catch(e) { console.error('renderStats:', e); }
}

var ADMIN_CARD_PERM = { teachers: 'users', students: 'users', announce: 'announcements', security: 'security' };

function applyAdminCards() {
  document.querySelectorAll('.gc-card').forEach(function (card) {
    var onclick = card.getAttribute('onclick') || '';
    var match = onclick.match(/openAdminCard\('([^']+)'\)/);
    var name = match ? match[1] : '';
    var perm = ADMIN_CARD_PERM[name];
    if (perm && typeof prismAdminCan === 'function' && !prismAdminCan(perm)) card.style.display = 'none';
  });
  renderAdminAccess();
}

function renderAdminAccess() {
  var panel = document.getElementById('admin-access-panel');
  if (!panel) return;
  var superadmin = sessionStorage.getItem('prism_superadmin') === '1';
  if (!superadmin) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }
  var admins = (adminUsersCache || []).filter(function (u) { return userRole(u) === 'admin' && !u.superadmin; });
  var catalog = [
    ['users', 'Manage users'],
    ['roster', 'Roster'],
    ['cor', 'COR'],
    ['calendar', 'Calendar'],
    ['security', 'Security'],
    ['announcements', 'Announcements']
  ];
  panel.style.display = 'block';
  if (!admins.length) {
    panel.innerHTML = '<div class="a-card-title">Admin access</div><p style="color:#9ca3af;font-size:.9rem;">No other administrators yet. Add one from Manage Users and choose their features there. You can change those switches here later.</p>';
    return;
  }
  panel.innerHTML = '<div class="a-card-title">Admin access</div><p style="color:#9ca3af;font-size:.9rem;margin-bottom:.8rem;">Choose what each administrator can open. The superadmin always has every feature.</p>' +
    admins.map(function (a) {
      var perms = a.permissions || {};
      var toggles = catalog.map(function (item) {
        var on = !!perms[item[0]];
        return '<label style="display:flex;align-items:center;gap:.45rem;font-size:.86rem;margin:.25rem 0;"><input type="checkbox" data-admin="' + escHtml(a.id) + '" data-perm="' + item[0] + '"' + (on ? ' checked' : '') + '> ' + escHtml(item[1]) + '</label>';
      }).join('');
      return '<div style="padding:.75rem 0;border-top:1px solid rgba(124,58,237,.15);"><strong>' + escHtml(a.name || a.id) + '</strong> <span style="color:#9ca3af;font-family:monospace;">' + escHtml(a.id) + '</span> <span style="color:#d97706;font-weight:700;">' + escHtml(a.section || 'Admin') + '</span><div style="display:flex;flex-wrap:wrap;gap:.4rem 1rem;margin-top:.35rem;">' + toggles + '</div><button type="button" class="a-btn" style="margin-top:.55rem;" data-save-admin="' + escHtml(a.id) + '">Save access</button></div>';
    }).join('');
  panel.querySelectorAll('[data-save-admin]').forEach(function (btn) {
    btn.onclick = function () { saveAdminAccess(btn.getAttribute('data-save-admin')); };
  });
}

async function saveAdminAccess(id) {
  var panel = document.getElementById('admin-access-panel');
  var permissions = { dashboard: true };
  panel.querySelectorAll('input[data-admin="' + id + '"]').forEach(function (box) {
    permissions[box.getAttribute('data-perm')] = box.checked;
  });
  try {
    await PrismAdmin.setAdminPerms(id, permissions);
    var row = (adminUsersCache || []).find(function (u) { return String(u.id) === String(id); });
    if (row) row.permissions = permissions;
    alert('Access updated.');
  } catch (e) {
    alert(e.message || 'Could not update access.');
  }
}

function openAdminCard(name) {
  var perm = ADMIN_CARD_PERM[name];
  if (perm && typeof prismAdminCan === 'function' && !prismAdminCan(perm)) return;
  const titles = { teachers: 'Teachers', students: 'Students', announce: 'Announcements', security: 'Security' };
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
  const title = document.getElementById('admin-section-title');
  if (title) title.textContent = titles[name] || 'Portal';
  const home = document.getElementById('admin-home');
  const section = document.getElementById('admin-section');
  if (home) home.hidden = true;
  if (section) section.hidden = false;
}

function closeAdminCard() {
  const home = document.getElementById('admin-home');
  const section = document.getElementById('admin-section');
  if (section) section.hidden = true;
  if (home) home.hidden = false;
}

/* ── TEACHERS TABLE ── */
async function renderTeachers() {
  const q = (document.getElementById('teacher-search').value||'').toLowerCase();
  const tbody = document.getElementById('teacher-tbody');
  if (adminUsersError) {
    document.getElementById('teacher-count').textContent = '';
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:2rem;">' + escHtml(adminUsersError) + '</td></tr>';
    return;
  }
  try {
    const teachers = adminUsersCache.filter(a => userRole(a) === 'teacher' && (
      (a.name||'').toLowerCase().includes(q) || String(a.id||'').toLowerCase().includes(q) || String(a.email||'').toLowerCase().includes(q)
    ));
    document.getElementById('teacher-count').textContent = teachers.length + ' teacher' + (teachers.length!==1?'s':'');
    if (!teachers.length) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:2rem;">No teachers in the database yet.</td></tr>'; return; }
    tbody.innerHTML = teachers.map(t => `<tr>
      <td><strong style="color:#16132b;">${escHtml(t.name)}</strong></td>
      <td style="font-family:monospace;font-size:.85rem;color:#6b7280;">${escHtml(t.id)}</td>
      <td style="color:#9ca3af;">${escHtml(t.section)}</td>
      <td style="font-size:.82rem;">${emailCell(t.email)}</td>
      <td><span class="badge badge-active">Active</span></td>
      <td>
        <button class="icon-btn" onclick="openEmailModal('${escJs(t.id)}','${escJs(t.name)}','${escJs(t.email||'')}')">Email</button>
        <button class="icon-btn red" onclick="deleteAccount('${escJs(t.id)}')">Delete</button>
      </td>
    </tr>`).join('');
  } catch(e) {
    console.error('renderTeachers:', e);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:2rem;">' + escHtml(e.message || 'Failed to render teachers.') + '</td></tr>';
  }
}

/* ── STUDENTS TABLE ── */
async function renderStudents() {
  const q = (document.getElementById('student-search').value||'').toLowerCase();
  const tbody = document.getElementById('student-tbody');
  if (adminUsersError) {
    document.getElementById('student-count').textContent = '';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:2rem;">' + escHtml(adminUsersError) + '</td></tr>';
    return;
  }
  try {
    const students = adminUsersCache.filter(a => userRole(a) === 'student' && (
      (a.name||'').toLowerCase().includes(q) || String(a.id||'').toLowerCase().includes(q) || String(a.email||'').toLowerCase().includes(q)
    ));
    document.getElementById('student-count').textContent = students.length + ' student' + (students.length!==1?'s':'');
    if (!students.length) { tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:2rem;">No students in the database yet.</td></tr>'; return; }
    tbody.innerHTML = students.map(s => `<tr>
      <td><strong style="color:#16132b;">${escHtml(s.name)}</strong></td>
      <td style="font-family:monospace;font-size:.85rem;color:#6b7280;">${escHtml(s.id)}</td>
      <td style="color:#9ca3af;">${escHtml(s.section)}</td>
      <td style="font-size:.82rem;">${emailCell(s.email)}</td>
      <td>
        <button class="icon-btn" onclick="openEmailModal('${escJs(s.id)}','${escJs(s.name)}','${escJs(s.email||'')}')">Email</button>
        <button class="icon-btn red" onclick="deleteAccount('${escJs(s.id)}')">Delete</button>
      </td>
    </tr>`).join('');
  } catch(e) {
    console.error('renderStudents:', e);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:2rem;">' + escHtml(e.message || 'Failed to render students.') + '</td></tr>';
  }
}

async function deleteAccount(id) {
  if (!confirm(`Delete account "${id}"? This cannot be undone.`)) return;
  try {
    await PrismAdmin.deleteUser(id);
    await refreshAdminUsers();
    await renderTeachers(); await renderStudents(); await renderStats();
  } catch(e) { alert(e.message || 'Failed to delete account.'); }
}

function emailCell(email) {
  const value = String(email || '').trim();
  if (!value) return '<span style="color:#d97706;font-weight:700;">Not assigned</span>';
  return escHtml(value);
}

/* ── ASSIGN CTU EMAIL ── */
let emailTargetId = '';
function openEmailModal(id, name, email) {
  emailTargetId = id;
  document.getElementById('email-who').textContent = (name || 'Account') + ' (' + id + ')';
  document.getElementById('email-input').value = email || '';
  document.getElementById('email-msg').textContent = '';
  document.getElementById('email-msg').className = 'form-msg';
  document.getElementById('email-overlay').classList.add('active');
  setTimeout(function () { document.getElementById('email-input').focus(); }, 50);
}
function closeEmailModal() { document.getElementById('email-overlay').classList.remove('active'); }
async function saveUserEmail() {
  const email = document.getElementById('email-input').value.trim().toLowerCase();
  const el = document.getElementById('email-msg');
  if (typeof prismIsCtuEmail !== 'function' || !prismIsCtuEmail(email)) {
    el.textContent = 'Enter a CTU email (@ctu.edu.ph).';
    el.className = 'form-msg err';
    return;
  }
  try {
    await PrismAdmin.setUserEmail(emailTargetId, email);
    el.textContent = 'Email saved.';
    el.className = 'form-msg ok';
    await refreshAdminUsers();
    await renderTeachers();
    await renderStudents();
    setTimeout(closeEmailModal, 500);
  } catch (e) {
    el.textContent = e.message || 'Could not save that email.';
    el.className = 'form-msg err';
  }
}
var emailOverlay = document.getElementById('email-overlay');
if (emailOverlay) emailOverlay.addEventListener('click', function (e) { if (e.target === this) closeEmailModal(); });



/* ── ANNOUNCEMENTS ── */
async function postAnnouncement() {
  const text = document.getElementById('ann-text').value.trim();
  if (!text) return;
  try {
    await PrismAdmin.addAnnouncement({
      text, type: document.getElementById('ann-type').value,
      author: sessionStorage.getItem('prism_user_name')||'Admin'
    });
    document.getElementById('ann-text').value = '';
    await renderAnnouncements();
  } catch(e) { alert(e.message || 'Failed to post announcement.'); }
}

async function renderAnnouncements() {
  const feed = document.getElementById('ann-feed');
  try {
    const anns = await PrismAdmin.getAnnouncements();
    if (!anns.length) { feed.innerHTML='<p style="color:#9ca3af;font-size:.9rem;text-align:center;padding:1rem 0;">No announcements yet.</p>'; return; }
    feed.innerHTML = anns.map(a => {
      const dl = new Date(a.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div class="ann-item">
        <div class="ann-avatar">${(a.author||'A').charAt(0).toUpperCase()}</div>
        <div class="ann-body">
          <div class="ann-header">
            <span class="ann-author">${a.author||'Admin'}</span>
            <span class="ann-date">${dl}</span>
            <span class="ann-type-badge ${a.type}">${a.type==='portal'?' General':a.type==='alert'?' Alert':'ℹ Info'}</span>
          </div>
          <div class="ann-text">${a.text}</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) { console.error('renderAnnouncements:', e); }
}

function copyAdminUrl() {
  const urlEl = document.getElementById('admin-url');
  if (!urlEl) return;
  const url = urlEl.textContent;
  navigator.clipboard.writeText(url).then(()=>{
    const b=document.getElementById('copy-url-btn'); const o=b.textContent;
    b.textContent='Copied!'; setTimeout(()=>b.textContent=o,1800);
  });
}

/* ── TAB SWITCHER ── */
function switchTab(name, btn) {
  openAdminCard(name);
  if (btn) btn.classList.add('active');
}
