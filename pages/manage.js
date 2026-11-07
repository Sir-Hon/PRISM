/** Page script for manage.html — security tools only. Accounts are created on the Roster. */
window.addEventListener('DOMContentLoaded', async () => {
  if (window.__prismManageSession) await window.__prismManageSession;
  try {
    if (typeof prismAuthGuard === 'function') await prismAuthGuard(['admin']);
  } catch (e) { /* the guard redirects when the session is missing */ }
  if (typeof initSidebar === 'function') initSidebar('manage');
  renderPassphraseStatus();
  renderAuditLog();
  loadSecurityModule();
});

function renderPassphraseStatus() {
  const pp = localStorage.getItem('prism_admin_passphrase');
  const el = document.getElementById('current-pp-status');
  if (!el) return;
  if (pp) {
    el.innerHTML = '<div style="background:#d1fae5;border:1.5px solid #6ee7b7;border-radius:10px;padding:.65rem 1rem;font-size:.85rem;color:#065f46;"><strong>Passphrase is set.</strong></div>';
  } else {
    el.innerHTML = '<div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:10px;padding:.65rem 1rem;font-size:.85rem;color:#991b1b;"><strong>No passphrase set.</strong></div>';
  }
}

function ppStrengthCheck() {
  const pw = document.getElementById('new-pp').value;
  const wrap = document.getElementById('pp-strength-wrap');
  if (!pw) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const levels = [
    { p: '20%', c: '#ef4444', t: 'Very weak' },
    { p: '40%', c: '#f97316', t: 'Weak' },
    { p: '60%', c: '#f59e0b', t: 'Fair' },
    { p: '80%', c: '#84cc16', t: 'Strong' },
    { p: '100%', c: '#22c55e', t: 'Very strong' }
  ];
  const level = levels[Math.min(s - 1, 4)] || levels[0];
  document.getElementById('pp-sfill').style.width = level.p;
  document.getElementById('pp-sfill').style.background = level.c;
  document.getElementById('pp-slabel').textContent = level.t;
}

function togglePP() {
  const el = document.getElementById('new-pp');
  el.type = el.type === 'password' ? 'text' : 'password';
}
function togglePPConfirm() {
  const el = document.getElementById('confirm-pp');
  el.type = el.type === 'password' ? 'text' : 'password';
}

function savePassphrase() {
  const pp = document.getElementById('new-pp').value;
  const pp2 = document.getElementById('confirm-pp').value;
  const msg = document.getElementById('pp-msg');
  if (!pp) { msg.textContent = 'Enter a passphrase.'; msg.className = 'form-msg error'; return; }
  if (pp !== pp2) { msg.textContent = 'Passphrases do not match.'; msg.className = 'form-msg error'; return; }
  localStorage.setItem('prism_admin_passphrase', pp);
  msg.textContent = 'Passphrase saved.';
  msg.className = 'form-msg success';
  renderPassphraseStatus();
  setTimeout(function () { msg.textContent = ''; }, 3000);
}

function clearPassphrase() {
  if (!confirm('Clear the admin passphrase?')) return;
  localStorage.removeItem('prism_admin_passphrase');
  renderPassphraseStatus();
}

function renderAuditLog() {
  const log = JSON.parse(localStorage.getItem('prism_admin_audit') || '[]');
  const el = document.getElementById('audit-log-container');
  if (!el) return;
  if (!log.length) {
    el.innerHTML = '<p style="color:#9ca3af;font-size:.88rem;">No activity logged yet.</p>';
    return;
  }
  el.innerHTML = log.slice().reverse().map(function (e) {
    return '<div style="padding:.65rem 0;border-bottom:1px solid #f0ecff;font-size:.82rem;">'
      + '<div style="font-weight:700;">' + String(e.id || '—').replace(/</g, '') + '</div>'
      + '<div style="color:#9ca3af;">' + String(e.result || '').replace(/</g, '') + ' · ' + String(e.time || '').replace(/</g, '') + '</div></div>';
  }).join('');
}

function clearAuditLog() {
  if (!confirm('Clear the audit log?')) return;
  localStorage.removeItem('prism_admin_audit');
  renderAuditLog();
}

var secState = { catalog: {}, roles: [], admins: [], superadmin: false };

function secEsc(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function secGroups(targetId) {
  var catalog = secState.catalog || {};
  var groups = {};
  Object.keys(catalog).forEach(function (key) {
    var item = catalog[key];
    var name = item.group || 'Access';
    if (!groups[name]) groups[name] = [];
    groups[name].push({ key: key, label: item.label || key });
  });
  var html = '';
  Object.keys(groups).forEach(function (name) {
    html += '<div style="margin:.8rem 0 .3rem;font-size:.75rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#b45309;">' + secEsc(name) + '</div><div class="perm-grid">';
    groups[name].forEach(function (item) {
      html += '<label><input type="checkbox" data-sec-box="' + secEsc(targetId) + '" data-fine="' + secEsc(item.key) + '"> ' + secEsc(item.label) + '</label>';
    });
    html += '</div>';
  });
  return html;
}

function secRead(targetId) {
  var fine = {};
  document.querySelectorAll('[data-sec-box="' + targetId + '"]').forEach(function (box) {
    fine[box.getAttribute('data-fine')] = box.checked;
  });
  return fine;
}

function secWrite(targetId, fine) {
  document.querySelectorAll('[data-sec-box="' + targetId + '"]').forEach(function (box) {
    box.checked = !!(fine && fine[box.getAttribute('data-fine')]);
  });
}

function secRoleFine(roleId) {
  var found = (secState.roles || []).filter(function (role) { return role.id === roleId; })[0];
  return found ? found.fine : {};
}

function secSummary(fine) {
  var catalog = secState.catalog || {};
  var gates = {};
  Object.keys(catalog).forEach(function (key) {
    if (fine && fine[key]) gates[catalog[key].gate] = true;
  });
  var pages = ['Dashboard'];
  if (gates.users) pages.push('Teachers and students');
  if (gates.roster) pages.push('Roster');
  if (gates.cor) pages.push('Certificates of registration');
  if (gates.calendar) pages.push('Calendar');
  if (gates.announcements) pages.push('Announcements');
  if (gates.security) pages.push('Security');
  var body = document.getElementById('sec-summary-body');
  if (body) body.textContent = pages.join(' · ');
}

function secSelectAdmin() {
  var select = document.getElementById('sec-admin');
  var admin = (secState.admins || []).filter(function (row) { return row.id === select.value; })[0];
  var meta = document.getElementById('sec-admin-meta');
  var rolePick = document.getElementById('sec-role');
  if (!admin) return;
  if (admin.superadmin) {
    if (meta) meta.textContent = admin.name + ' is the superadmin and always has every permission.';
    if (rolePick) rolePick.disabled = true;
    secWrite('access', admin.fine || {});
    document.querySelectorAll('[data-sec-box="access"]').forEach(function (box) { box.disabled = true; });
    document.getElementById('sec-save-access').disabled = true;
  } else {
    if (meta) meta.textContent = (admin.email || admin.id) + ' · ' + (admin.role_name || 'Custom') + '. They receive this access the next time they sign in.';
    if (rolePick) {
      rolePick.disabled = false;
      rolePick.value = (secState.roles || []).some(function (role) { return role.id === admin.role_id; }) ? admin.role_id : 'custom';
    }
    document.querySelectorAll('[data-sec-box="access"]').forEach(function (box) { box.disabled = false; });
    document.getElementById('sec-save-access').disabled = false;
    secWrite('access', admin.fine || {});
  }
  secSummary(secRead('access'));
}

async function loadSecurityModule() {
  if (typeof PrismSecurity === 'undefined') return;
  try {
    var data = await PrismSecurity.bootstrap();
    secState = data || secState;
    var access = document.getElementById('sec-access');
    var roles = document.getElementById('sec-roles');
    var summary = document.getElementById('sec-summary');
    if (data.superadmin) {
      if (access) access.hidden = false;
      if (roles) roles.hidden = false;
      if (summary) summary.hidden = false;
    }
    var policyBtn = document.getElementById('sec-save-policy');
    if (policyBtn) policyBtn.hidden = !data.superadmin;
    if (data.policy) {
      document.getElementById('sec-fails').value = data.policy.max_fails;
      document.getElementById('sec-minutes').value = data.policy.lock_minutes;
    }
    if (!data.superadmin) {
      document.getElementById('sec-fails').disabled = true;
      document.getElementById('sec-minutes').disabled = true;
    }
    var matrix = document.getElementById('sec-matrix');
    var roleMatrix = document.getElementById('sec-role-matrix');
    if (matrix) matrix.innerHTML = secGroups('access');
    if (roleMatrix) roleMatrix.innerHTML = secGroups('role');
    var adminPick = document.getElementById('sec-admin');
    var rolePick = document.getElementById('sec-role');
    if (adminPick) {
      adminPick.innerHTML = (data.admins || []).map(function (admin) {
        return '<option value="' + secEsc(admin.id) + '">' + secEsc(admin.name || admin.id) + (admin.superadmin ? ' · Super Admin' : ' · ' + secEsc(admin.role_name || 'Custom')) + '</option>';
      }).join('');
      adminPick.onchange = secSelectAdmin;
    }
    if (rolePick) {
      rolePick.innerHTML = '<option value="custom">Custom</option>' + (data.roles || []).map(function (role) {
        return '<option value="' + secEsc(role.id) + '">' + secEsc(role.name) + (role.builtin ? '' : ' · custom') + '</option>';
      }).join('');
      rolePick.onchange = function () {
        if (rolePick.value === 'custom') return;
        secWrite('access', secRoleFine(rolePick.value));
        secSummary(secRead('access'));
      };
    }
    document.querySelectorAll('[data-sec-box="access"]').forEach(function (box) {
      box.addEventListener('change', function () { secSummary(secRead('access')); });
    });
    var list = document.getElementById('sec-role-list');
    if (list) {
      var custom = (data.roles || []).filter(function (role) { return !role.builtin; });
      list.innerHTML = custom.length ? custom.map(function (role) {
        return '<div style="display:flex;justify-content:space-between;gap:.6rem;padding:.35rem 0;border-bottom:1px solid #f0ecff;"><span>' + secEsc(role.name) + '</span><button type="button" data-del-role="' + secEsc(role.id) + '" style="border:none;background:none;color:#ef4444;font-weight:700;cursor:pointer;">Remove</button></div>';
      }).join('') : '<p class="card-sub">No custom roles yet.</p>';
      list.querySelectorAll('[data-del-role]').forEach(function (btn) {
        btn.onclick = async function () {
          if (!confirm('Remove this role?')) return;
          try {
            await PrismSecurity.deleteRole(btn.getAttribute('data-del-role'));
            await loadSecurityModule();
          } catch (e) { alert(e.message || 'Could not remove that role.'); }
        };
      });
    }
    if (data.superadmin) secSelectAdmin();
    var rows = await PrismSecurity.log();
    var log = document.getElementById('sec-log-body');
    if (log) {
      log.innerHTML = rows.length ? rows.map(function (row) {
        return '<div style="padding:.55rem 0;border-bottom:1px solid #f0ecff;font-size:.84rem;"><strong>' + secEsc(row.event) + '</strong> · ' + secEsc(row.actor_id || '') + '<div style="color:#6b7280;">' + secEsc(row.detail) + ' · ' + secEsc(row.created_at || '') + '</div></div>';
      }).join('') : '<p class="card-sub">No security events yet.</p>';
    }
  } catch (e) {
    var log = document.getElementById('sec-log-body');
    if (log) log.textContent = e.message || 'Security settings could not be loaded.';
  }
}

document.getElementById('sec-save-access') && document.getElementById('sec-save-access').addEventListener('click', async function () {
  var msg = document.getElementById('sec-access-msg');
  msg.className = 'form-msg';
  try {
    await PrismSecurity.saveAccess({
      id: document.getElementById('sec-admin').value,
      role_id: document.getElementById('sec-role').value,
      fine: secRead('access')
    });
    msg.textContent = 'Access saved. It applies the next time that administrator signs in.';
    msg.className = 'form-msg success';
    await loadSecurityModule();
  } catch (e) {
    msg.textContent = e.message || 'Could not save access.';
    msg.className = 'form-msg error';
  }
});

document.getElementById('sec-save-role') && document.getElementById('sec-save-role').addEventListener('click', async function () {
  var msg = document.getElementById('sec-role-msg');
  try {
    await PrismSecurity.saveRole({ name: document.getElementById('sec-role-name').value.trim(), fine: secRead('role') });
    document.getElementById('sec-role-name').value = '';
    msg.textContent = 'Role saved.';
    msg.className = 'form-msg success';
    await loadSecurityModule();
  } catch (e) {
    msg.textContent = e.message || 'Could not save that role.';
    msg.className = 'form-msg error';
  }
});

document.getElementById('sec-save-policy') && document.getElementById('sec-save-policy').addEventListener('click', async function () {
  var msg = document.getElementById('sec-policy-msg');
  try {
    await PrismSecurity.savePolicy({
      max_fails: document.getElementById('sec-fails').value,
      lock_minutes: document.getElementById('sec-minutes').value
    });
    msg.textContent = 'Sign-in lock saved.';
    msg.className = 'form-msg success';
  } catch (e) {
    msg.textContent = e.message || 'Could not save the lock.';
    msg.className = 'form-msg error';
  }
});
