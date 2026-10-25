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
  try { raw = JSON.parse(localStorage.getItem('prism_events') || '[]'); } catch (e) { raw = []; }
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
  document.getElementById('admin-url').textContent = location.origin + location.pathname.replace(/[^/]+$/, '') + 'admin-register.html';
  try {
    if (typeof PrismEvents !== 'undefined' && PrismEvents.get) {
      const apiEv = await PrismEvents.get();
      const mapped = apiEv.map(e => ({
        id: e.id, title: e.title, date: e.event_date, time: e.event_time || '', notes: e.notes || '', color: e.color || '#6d28d9', alarm: e.alarm
      }));
      localStorage.setItem('prism_events', JSON.stringify(mapped));
    }
  } catch (evErr) { console.warn('Events sync:', evErr); }
  renderDashboardIncomingEvents();
  await refreshAdminUsers();
  await renderStats();
  await renderTeachers();
  await renderStudents();
  await renderInviteCodes();
  await renderAnnouncements();
});

/* ── STATS ── */
async function renderStats() {
  try {
    const users = adminUsersCache;
    const codes = await PrismAdmin.getInviteCodes();
    document.getElementById('stat-teachers').textContent = users.filter(a => userRole(a) === 'teacher').length;
    document.getElementById('stat-students').textContent = users.filter(a => userRole(a) === 'student').length;
    document.getElementById('stat-codes').textContent    = codes.filter(c=>!c.used).length;
    document.getElementById('stat-quizzes').textContent  = '—';
    document.getElementById('stat-posts').textContent    = '—';
  } catch(e) { console.error('renderStats:', e); }
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
      (a.name||'').toLowerCase().includes(q) || String(a.id||'').toLowerCase().includes(q)
    ));
    document.getElementById('teacher-count').textContent = teachers.length + ' teacher' + (teachers.length!==1?'s':'');
    if (!teachers.length) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:2rem;">No teachers in the database yet.</td></tr>'; return; }
    tbody.innerHTML = teachers.map(t => `<tr>
      <td><strong style="color:#16132b;">${escHtml(t.name)}</strong></td>
      <td style="font-family:monospace;font-size:.85rem;color:#6b7280;">${escHtml(t.id)}</td>
      <td style="color:#9ca3af;">${escHtml(t.section)}</td>
      <td><span class="badge badge-active">Active</span></td>
      <td><span class="badge badge-teacher" style="font-size:.68rem;">database</span></td>
      <td><button class="icon-btn red" onclick="deleteAccount('${escJs(t.id)}')">Delete</button></td>
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
      (a.name||'').toLowerCase().includes(q) || String(a.id||'').toLowerCase().includes(q)
    ));
    document.getElementById('student-count').textContent = students.length + ' student' + (students.length!==1?'s':'');
    if (!students.length) { tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:2rem;">No students in the database yet.</td></tr>'; return; }
    tbody.innerHTML = students.map(s => `<tr>
      <td><strong style="color:#16132b;">${escHtml(s.name)}</strong></td>
      <td style="font-family:monospace;font-size:.85rem;color:#6b7280;">${escHtml(s.id)}</td>
      <td style="color:#9ca3af;">${escHtml(s.section)}</td>
      <td><span class="badge badge-student" style="font-size:.68rem;">database</span></td>
      <td><button class="icon-btn red" onclick="deleteAccount('${escJs(s.id)}')">Delete</button></td>
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

/* ── CREATE ACCOUNT MODAL ── */
let createRole = 'teacher';
function openCreateModal(role) {
  createRole = role;
  document.getElementById('create-modal-title').textContent = role==='teacher'?' Add Teacher':' Add Admin';
  document.getElementById('m-id').placeholder = role==='teacher'?'e.g. 2024-00005':'e.g. admin002';
  ['m-fname','m-lname','m-id','m-dept','m-pw'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('create-msg').textContent = '';
  document.getElementById('create-overlay').classList.add('active');
}
function closeCreateModal() { document.getElementById('create-overlay').classList.remove('active'); }

async function createAccount() {
  const fn   = document.getElementById('m-fname').value.trim();
  const ln   = document.getElementById('m-lname').value.trim();
  const id   = document.getElementById('m-id').value.trim();
  const dept = document.getElementById('m-dept').value.trim();
  const pw   = document.getElementById('m-pw').value;
  const showMsg = (t,c) => { const el=document.getElementById('create-msg'); el.textContent=t; el.className='form-msg '+c; };
  if(!fn) { showMsg('First name required.','err'); return; }
  if(!ln) { showMsg('Last name required.','err'); return; }
  if(!id||id.length<4) { showMsg('ID must be at least 4 characters.','err'); return; }
  if(!dept) { showMsg('Department required.','err'); return; }
  if(!pw||pw.length<6) { showMsg('Password must be at least 6 characters.','err'); return; }
  try {
    // Must use register_admin: the public "register" action always creates students only.
    await apiCall('auth', 'register_admin', 'POST', {
      id, password:pw, name:fn+' '+ln, section:dept, role: createRole === 'admin' ? 'admin' : 'teacher'
    });
    showMsg(' Account created!','ok');
    setTimeout(async ()=>{ closeCreateModal(); await refreshAdminUsers(); await renderTeachers(); await renderStudents(); await renderStats(); },900);
  } catch(e) { showMsg(e.message||'Failed to create account.','err'); }
}
document.getElementById('create-overlay').addEventListener('click',function(e){if(e.target===this)closeCreateModal();});

/* ── INVITE CODES ── */
async function generateCode() {
  try {
    const data = await PrismAdmin.createInvite();
    await renderInviteCodes(); await renderStats();
  } catch(e) { alert(e.message || 'Failed to generate code.'); }
}

async function deleteInviteCode(code) {
  if (!confirm('Delete invite code "' + code + '"? This cannot be undone.')) return;
  try {
    await PrismAdmin.deleteInvite(code);
    await renderInviteCodes();
    await renderStats();
  } catch (e) {
    alert(e.message || 'Failed to delete invite code.');
  }
}

let inviteCodesCache = [];
let inviteOpenCode = '';

function inviteIsUsed(c) {
  return c && (c.used === 1 || c.used === '1' || c.used === true);
}

function fmtInviteDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(v).split(' ')[0];
  return d.toLocaleDateString();
}

function teacherInfoList(c) {
  const rows = [
    ['Name', c.teacher_name || '—'],
    ['Teacher ID', c.used_by || '—'],
    ['Email', c.teacher_email || '—'],
    ['Department', c.teacher_section || '—'],
    ['Registered', fmtInviteDate(c.used_at)],
  ];
  return '<ul class="invite-teacher-info">' + rows.map(function (row) {
    return '<li><span>' + escHtml(row[0]) + '</span>' + escHtml(row[1]) + '</li>';
  }).join('') + '</ul>';
}

async function renderInviteCodes() {
  const grid = document.getElementById('invite-grid');
  try {
    inviteCodesCache = await PrismAdmin.getInviteCodes();
    paintInviteList();
  } catch (e) {
    console.error('renderInviteCodes:', e);
    if (grid) grid.innerHTML = '<p class="invite-empty">Failed to load invite codes.</p>';
  }
}

function paintInviteList() {
  const grid = document.getElementById('invite-grid');
  if (!grid) return;
  const q = (document.getElementById('invite-search')?.value || '').trim().toLowerCase();
  const codes = inviteCodesCache.filter(function (c) {
    if (!q) return true;
    return String(c.code || '').toLowerCase().indexOf(q) !== -1
      || String(c.teacher_name || '').toLowerCase().indexOf(q) !== -1;
  });
  if (!inviteCodesCache.length) {
    grid.innerHTML = '<p class="invite-empty">No codes yet. Generate one above.</p>';
    return;
  }
  if (!codes.length) {
    grid.innerHTML = '<p class="invite-empty">No codes match that search.</p>';
    return;
  }
  grid.innerHTML = codes.map(function (c) {
    const used = inviteIsUsed(c);
    const safe = escJs(c.code);
    const name = String(c.teacher_name || '').trim();
    const open = inviteOpenCode === c.code && used;
    let who = '<span class="invite-unused">Not used</span>';
    if (used) {
      const label = name || c.used_by || 'Unknown teacher';
      who = '<button type="button" class="invite-name' + (open ? ' open' : '') + '" onclick="toggleTeacherInfo(\'' + safe + '\')">' + escHtml(label) + '</button>';
    }
    return '<div class="invite-row">'
      + '<div class="invite-row-main">'
      + '<span class="invite-code">' + escHtml(c.code) + '</span>'
      + '<button type="button" class="copy-btn" onclick="copyCode(\'' + safe + '\',this)">Copy</button>'
      + who
      + '<span class="invite-when">' + (used ? 'Registered ' + escHtml(fmtInviteDate(c.used_at)) : 'Created ' + escHtml(fmtInviteDate(c.created_at))) + '</span>'
      + '<button type="button" class="inv-del" onclick="deleteInviteCode(\'' + safe + '\')">Delete</button>'
      + '</div>'
      + (open ? teacherInfoList(c) : '')
      + '</div>';
  }).join('');
}

function filterInviteCodes() {
  paintInviteList();
}

function toggleTeacherInfo(code) {
  inviteOpenCode = inviteOpenCode === code ? '' : code;
  paintInviteList();
}

function copyCode(code, btn) {
  navigator.clipboard.writeText(code).then(()=>{
    const o=btn.textContent; btn.textContent='Copied!'; btn.style.color='#10b981';
    setTimeout(()=>{btn.textContent=o;btn.style.color='';},1800);
  });
}

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
  const url = document.getElementById('admin-url').textContent;
  navigator.clipboard.writeText(url).then(()=>{
    const b=document.getElementById('copy-url-btn'); const o=b.textContent;
    b.textContent='Copied!'; setTimeout(()=>b.textContent=o,1800);
  });
}

/* ── TAB SWITCHER ── */
function switchTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.page-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  btn.classList.add('active');
}
