/** Page script for manage.html — keep HTML in the .html file. */
let myId = '';
  let filterRole = 'all';
  let allUsers = [];
  let usersLoadError = '';

  function escJs(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.addEventListener('DOMContentLoaded', async () => {
    if (window.__prismManageSession) await window.__prismManageSession;
    myId = sessionStorage.getItem('prism_user_id') || '';
    if (typeof initSidebar === 'function') initSidebar('manage');
    await loadUsers();
    renderPassphraseStatus();
  });

  // ── LOAD USERS FROM API ──
  async function loadUsers() {
    usersLoadError = '';
    try {
      allUsers = await PrismAdmin.getAllUsers();
      try { localStorage.removeItem('prism_accounts'); } catch (e) {}
    } catch(e) {
      allUsers = [];
      usersLoadError = e.message || 'Could not load users. Check that you are logged in as admin and the database is running.';
      console.error('Failed to load users:', e);
    }
    renderTable();
  }

  // ── SWITCH TAB ──
  function switchTab(name, btn) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    btn.classList.add('active');
    if (name === 'users') renderTable();
    if (name === 'security') { renderPassphraseStatus(); renderAuditLog(); }
  }

  // ── ROLE SELECTOR ──
  let createRole = 'teacher';
  function selectRole(role) {
    createRole = role;
    document.querySelectorAll('.role-pill').forEach(p => p.classList.remove('sel-teacher','sel-admin'));
    document.querySelector('.role-pill[data-role="'+role+'"]').classList.add('sel-'+role);
  }

  // ── CREATE ACCOUNT (via API) ──
  async function handleCreate() {
    const fn   = document.getElementById('c-fname').value.trim();
    const ln   = document.getElementById('c-lname').value.trim();
    const id   = document.getElementById('c-id').value.trim();
    const dept = document.getElementById('c-dept').value.trim();
    const email = document.getElementById('c-email').value.trim().toLowerCase();
    const pw   = document.getElementById('c-pw').value;
    const msg  = document.getElementById('create-msg');

    if (!fn || !ln) { showFormMsg('Please enter first and last name.', 'error'); return; }
    if (!id)        { showFormMsg('Please enter an ID.', 'error'); return; }
    if (createRole === 'teacher' && (typeof prismIsCtuEmail !== 'function' || !prismIsCtuEmail(email))) {
      showFormMsg('Enter a CTU email (@ctu.edu.ph) for the teacher.', 'error'); return;
    }
    if (createRole !== 'teacher' && email && (typeof prismIsCtuEmail !== 'function' || !prismIsCtuEmail(email))) {
      showFormMsg('Enter a CTU email (@ctu.edu.ph).', 'error'); return;
    }
    if (!pw || pw.length < 6) { showFormMsg('Password must be at least 6 characters.', 'error'); return; }

    const btn = document.getElementById('create-btn');
    btn.disabled = true; btn.textContent = 'Creating…';

    try {
      await apiCall('auth', 'register_admin', 'POST', {
        id, password: pw, name: fn + ' ' + ln, role: createRole, section: dept, email
      });
      showFormMsg('Account created successfully!', 'success');
      document.getElementById('c-fname').value = '';
      document.getElementById('c-lname').value = '';
      document.getElementById('c-id').value = '';
      document.getElementById('c-dept').value = '';
      document.getElementById('c-email').value = '';
      document.getElementById('c-pw').value = '';
      await loadUsers();
    } catch(e) {
      showFormMsg(e.message || 'Failed to create account.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  }

  function showFormMsg(msg, type) {
    const el = document.getElementById('create-msg');
    el.textContent = msg;
    el.className = 'form-msg ' + type;
    setTimeout(() => { el.textContent = ''; }, 4000);
  }

  // ── RENDER USERS TABLE (from API data) ──
  function renderTable() {
    const tbody = document.getElementById('users-tbody');
    const query = (document.getElementById('search-input').value || '').toLowerCase();
    let users = allUsers.slice();
    if (filterRole !== 'all') users = users.filter(u => String(u.role || '').toLowerCase() === filterRole);
    if (query) users = users.filter(u =>
      (u.name || '').toLowerCase().includes(query) || String(u.id || '').toLowerCase().includes(query) || String(u.email || '').toLowerCase().includes(query)
    );
    document.getElementById('total-badge').textContent = users.length + ' user' + (users.length !== 1 ? 's' : '');
    if (usersLoadError) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6" style="color:#ef4444;">' + usersLoadError.replace(/</g,'&lt;') + '</td></tr>';
      return;
    }
    if (!users.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No accounts found.</td></tr>';
      return;
    }
    const me = myId.toLowerCase();
    tbody.innerHTML = users.map(u => {
      const canDel = u.id.toLowerCase() !== me;
      const role = String(u.role || '').toLowerCase();
      const email = String(u.email || '').trim();
      const emailHtml = email ? escHtml(email) : '<span style="color:#d97706;font-weight:700;">Not assigned</span>';
      const emailBtn = (role === 'student' || role === 'teacher')
        ? '<button class="del-btn" style="border-color:#e4dffa;color:#6d28d9;margin-right:.35rem;" onclick="openEmailModal(\'' + escJs(u.id) + '\',\'' + escJs(u.name || '') + '\',\'' + escJs(email) + '\')">Email</button>'
        : '';
      return `<tr>
        <td><strong style="color:#16132b;">${escHtml(u.name || '—')}</strong></td>
        <td style="font-family:monospace;font-size:.88rem;color:#6b7280;">${escHtml(u.id)}</td>
        <td><span class="role-tag ${role}">${escHtml(u.role || '—')}</span></td>
        <td style="color:#9ca3af;">${escHtml(u.section || '—')}</td>
        <td style="font-size:.82rem;">${emailHtml}</td>
        <td>${emailBtn}<button class="del-btn" ${!canDel ? 'disabled' : ''} onclick="deleteAccount('${escJs(u.id)}')"> Delete</button></td>
      </tr>`;
    }).join('');
  }

  function setFilter(role, btn) {
    filterRole = role;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.className = 'filter-btn';
      if (b.dataset.filter === role) b.classList.add('active-' + role);
    });
    renderTable();
  }

  // ── DELETE ACCOUNT (via API) ──
  async function deleteAccount(id) {
    if (!confirm('Delete account "' + id + '"? This cannot be undone.')) return;
    try {
      await PrismAdmin.deleteUser(id);
      allUsers = allUsers.filter(u => u.id !== id);
      renderTable();
    } catch(e) {
      alert(e.message || 'Failed to delete account.');
    }
  }

  let emailTargetId = '';
  function openEmailModal(id, name, email) {
    emailTargetId = id;
    document.getElementById('email-who').textContent = (name || 'Account') + ' (' + id + ')';
    document.getElementById('email-input').value = email || '';
    document.getElementById('email-msg').textContent = '';
    document.getElementById('email-overlay').style.display = 'flex';
  }
  function closeEmailModal() {
    document.getElementById('email-overlay').style.display = 'none';
  }
  async function saveUserEmail() {
    const email = document.getElementById('email-input').value.trim().toLowerCase();
    const el = document.getElementById('email-msg');
    if (typeof prismIsCtuEmail !== 'function' || !prismIsCtuEmail(email)) {
      el.textContent = 'Enter a CTU email (@ctu.edu.ph).';
      el.style.color = '#ef4444';
      return;
    }
    try {
      await PrismAdmin.setUserEmail(emailTargetId, email);
      el.textContent = 'Email saved.';
      el.style.color = '#10b981';
      await loadUsers();
      setTimeout(closeEmailModal, 400);
    } catch (e) {
      el.textContent = e.message || 'Could not save that email.';
      el.style.color = '#ef4444';
    }
  }

  function togglePw(id, btn) {
    const el = document.getElementById(id);
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.textContent = el.type === 'password' ? 'Show' : 'Hide';
  }

  // ── PASSPHRASE (localStorage — local admin tool only) ──
  function renderPassphraseStatus() {
    const pp = localStorage.getItem('prism_admin_passphrase');
    const el = document.getElementById('current-pp-status');
    if (!el) return;
    if (pp) {
      el.innerHTML = '<div style="background:#d1fae5;border:1.5px solid #6ee7b7;border-radius:10px;padding:.65rem 1rem;font-size:.85rem;color:#065f46;display:flex;align-items:center;gap:.6rem;"><span></span><span><strong>Passphrase is set.</strong></span></div>';
    } else {
      el.innerHTML = '<div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:10px;padding:.65rem 1rem;font-size:.85rem;color:#991b1b;display:flex;align-items:center;gap:.6rem;"><span></span><span><strong>No passphrase set.</strong></span></div>';
    }
    const urlEl = document.getElementById('admin-reg-url');
    if (urlEl) urlEl.textContent = location.origin + location.pathname.replace('manage.html','') + 'admin-register.html';
  }

  function ppStrengthCheck() {
    const pw = document.getElementById('new-pp').value;
    const wrap = document.getElementById('pp-strength-wrap');
    if (!pw) { wrap.style.display='none'; return; }
    wrap.style.display='block';
    let s=0;
    if(pw.length>=6)s++;if(pw.length>=12)s++;if(/[A-Z]/.test(pw))s++;if(/[0-9]/.test(pw))s++;if(/[^A-Za-z0-9]/.test(pw))s++;
    const L=[{p:'20%',c:'#ef4444',t:'Very weak'},{p:'40%',c:'#f97316',t:'Weak'},{p:'60%',c:'#f59e0b',t:'Fair'},{p:'80%',c:'#84cc16',t:'Strong'},{p:'100%',c:'#22c55e',t:'Very strong'}];
    const l=L[Math.min(s-1,4)]||L[0];
    document.getElementById('pp-sfill').style.width=l.p;
    document.getElementById('pp-sfill').style.background=l.c;
    document.getElementById('pp-slabel').textContent=l.t;
  }

  function togglePP() { const el=document.getElementById('new-pp'); el.type=el.type==='password'?'text':'password'; }
  function togglePPConfirm() { const el=document.getElementById('confirm-pp'); el.type=el.type==='password'?'text':'password'; }

  function savePassphrase() {
    const pp=document.getElementById('new-pp').value;
    const pp2=document.getElementById('confirm-pp').value;
    const msg=document.getElementById('pp-msg');
    if(!pp){msg.textContent='Enter a passphrase.';msg.className='form-msg error';return;}
    if(pp!==pp2){msg.textContent='Passphrases do not match.';msg.className='form-msg error';return;}
    localStorage.setItem('prism_admin_passphrase',pp);
    msg.textContent='Passphrase saved.';msg.className='form-msg success';
    renderPassphraseStatus();
    setTimeout(()=>{msg.textContent='';},3000);
  }

  function clearPassphrase() {
    if(!confirm('Clear the admin passphrase?'))return;
    localStorage.removeItem('prism_admin_passphrase');
    renderPassphraseStatus();
  }

  function copyAdminUrl() {
    const url=document.getElementById('admin-reg-url').textContent;
    navigator.clipboard.writeText(url).then(()=>{
      const btn=document.getElementById('copy-url-btn');
      btn.textContent='Copied!';setTimeout(()=>btn.textContent='Copy URL',1800);
    });
  }

  // ── AUDIT LOG ──
  function renderAuditLog() {
    const log=JSON.parse(localStorage.getItem('prism_admin_audit')||'[]');
    const el=document.getElementById('audit-log-container');
    if(!el)return;
    if(!log.length){el.innerHTML='<p style="color:#c4b5fd;font-size:.88rem;">No activity logged yet.</p>';return;}
    el.innerHTML=log.slice().reverse().map(e=>`
      <div style="padding:.65rem 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:.82rem;">
        <div style="font-weight:700;color:#f0f0f5;">${e.id||'—'}</div>
        <div style="color:#9ca3af;">${e.result||''} · ${e.time||''}</div>
      </div>`).join('');
  }

  function clearAuditLog() {
    if(!confirm('Clear the audit log?'))return;
    localStorage.removeItem('prism_admin_audit');
    renderAuditLog();
  }
