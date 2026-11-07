/** Page script for manage.html — security tools only. Accounts are created on the Roster. */
window.addEventListener('DOMContentLoaded', async () => {
  if (window.__prismManageSession) await window.__prismManageSession;
  try {
    if (typeof prismAuthGuard === 'function') await prismAuthGuard(['admin']);
  } catch (e) { /* the guard redirects when the session is missing */ }
  if (typeof initSidebar === 'function') initSidebar('manage');
  renderPassphraseStatus();
  renderAuditLog();
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
