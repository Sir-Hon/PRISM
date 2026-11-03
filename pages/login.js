/** Page script for login.html — one portal, one sign-in form. */
try { sessionStorage.removeItem('prism_logged_in'); } catch (e) { /* ignore */ }

var ROLE_CONFIG = {
  student: {
    label: 'Student', accent: '#6366f1',
    badgeBg: 'rgba(99,102,241,.15)', badgeColor: '#a5b4fc',
    placeholder: 'e.g. 1234567',
    note: 'Use the 7-digit ID, CTU email, and password an administrator created for you.'
  },
  teacher: {
    label: 'Teacher', accent: '#10b981',
    badgeBg: 'rgba(16,185,129,.15)', badgeColor: '#6ee7b7',
    placeholder: 'e.g. 2024-00001',
    note: 'Use the teacher ID and CTU email an administrator created for you.'
  },
  admin: {
    label: 'Admin', accent: '#f59e0b',
    badgeBg: 'rgba(245,158,11,.15)', badgeColor: '#fcd34d',
    placeholder: 'e.g. admin001',
    note: 'Use the admin ID, CTU email, and password you were given.'
  },
};

var currentRole = typeof prismPortalRole === 'function' ? prismPortalRole() : 'student';
if (!ROLE_CONFIG[currentRole]) currentRole = 'student';
var attempts = 0;
var MAX_ATTEMPTS = 5;

function showError(msg) { document.getElementById('login-error').textContent = msg; }

function friendlyLoginErr(e) {
  var m = (e && e.message) ? String(e.message) : 'Something went wrong.';
  if (m.indexOf('<!DOCTYPE') !== -1 || m.indexOf('<html') !== -1 || m.length > 160) {
    return 'Could not reach the login service. Wait a few seconds and refresh the page.';
  }
  return m;
}

function togglePw() {
  var el = document.getElementById('input-pw');
  var btn = document.querySelector('.pw-toggle');
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'password' ? 'Show' : 'Hide';
}

function prepareLoginForm() {
  var cfg = ROLE_CONFIG[currentRole];
  var badge = document.getElementById('modal-badge');
  badge.textContent = cfg.label;
  badge.style.background = cfg.badgeBg;
  badge.style.color = cfg.badgeColor;
  document.getElementById('modal-title').textContent = cfg.label + ' sign in';
  document.getElementById('modal-sub').textContent = cfg.note;
  document.getElementById('portal-subtitle').textContent = cfg.label + ' portal';
  document.title = 'PRISM ' + cfg.label + ' sign in';
  document.getElementById('access-note').innerHTML = cfg.note;
  document.getElementById('modal-box').style.setProperty('--modal-accent', cfg.accent);
  var idField = document.getElementById('input-id');
  idField.placeholder = cfg.placeholder;
  if (currentRole === 'student') {
    idField.setAttribute('maxlength', '7');
    idField.setAttribute('inputmode', 'numeric');
    idField.setAttribute('pattern', '[0-9]{7}');
  } else {
    idField.removeAttribute('maxlength');
    idField.setAttribute('inputmode', 'text');
    idField.removeAttribute('pattern');
  }
  var emailWrap = document.getElementById('email-field');
  if (emailWrap) emailWrap.style.display = '';
  var btn = document.getElementById('submit-btn');
  btn.textContent = 'Sign In';
  btn.classList.remove('loading');
  btn.disabled = false;
  btn.style.opacity = '';
  ['input-id', 'input-email', 'input-pw'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    el.setAttribute('readonly', 'readonly');
    el.addEventListener('focus', function () { el.removeAttribute('readonly'); });
  });
}

function clearBrowserFill() {
  if (document.activeElement && document.activeElement.form && document.activeElement.form.id === 'login-form') return;
  ['input-id', 'input-email', 'input-pw'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
}

async function handleLogin() {
  var id = document.getElementById('input-id').value.trim();
  var emailEl = document.getElementById('input-email');
  var email = emailEl ? emailEl.value.trim().toLowerCase() : '';
  var pw = document.getElementById('input-pw').value;
  if (!id) { showError('Please enter your ID number.'); return; }
  if (currentRole === 'student' && (typeof prismIsCtuStudentId === 'function' ? !prismIsCtuStudentId(id) : !/^[0-9]{7}$/.test(id))) {
    showError('Enter your 7-digit CTU student ID.');
    return;
  }
  if (currentRole === 'student' || currentRole === 'teacher' || currentRole === 'admin') {
    if (!email) { showError('Please enter your CTU email.'); return; }
    if (typeof prismIsCtuEmail === 'function' ? !prismIsCtuEmail(email) : !/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@ctu\.edu\.ph$/.test(email)) {
      showError('Use your CTU email (@ctu.edu.ph).');
      return;
    }
  }
  if (!pw) { showError('Please enter your password.'); return; }
  if (attempts >= MAX_ATTEMPTS) {
    showError('Too many failed attempts. Please refresh the page to try again.');
    return;
  }
  var btn = document.getElementById('submit-btn');
  btn.classList.add('loading');
  btn.textContent = 'Signing in…';
  try {
    var data = await PrismAuth.login(id, pw, currentRole, email);
    if (data.role === 'teacher') window.location.href = 'teacher.html';
    else if (data.role === 'admin') window.location.href = 'admin.html';
    else window.location.href = 'index.html';
  } catch (e) {
    btn.classList.remove('loading');
    btn.textContent = 'Sign In';
    attempts++;
    var left = MAX_ATTEMPTS - attempts;
    if (left <= 0) {
      showError('Too many failed attempts. Please refresh the page to try again.');
      btn.disabled = true;
      btn.style.opacity = '0.4';
    } else {
      showError(friendlyLoginErr(e) + ' ' + left + ' attempt' + (left !== 1 ? 's' : '') + ' remaining.');
    }
  }
}

prepareLoginForm();
clearBrowserFill();
setTimeout(clearBrowserFill, 60);
setTimeout(clearBrowserFill, 400);
var loginIdInput = document.getElementById('input-id');
if (loginIdInput) {
  loginIdInput.addEventListener('input', function () {
    if (currentRole !== 'student') return;
    this.value = String(this.value || '').replace(/\D/g, '').slice(0, 7);
  });
}
window.togglePw = togglePw;
window.handleLogin = handleLogin;
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  var t = e.target;
  if (t && t.id === 'input-id') {
    e.preventDefault();
    var em = document.getElementById('input-email');
    var emWrap = document.getElementById('email-field');
    if (em && emWrap && emWrap.style.display !== 'none') em.focus();
    else document.getElementById('input-pw').focus();
    return;
  }
  if (t && t.id === 'input-email') {
    e.preventDefault();
    document.getElementById('input-pw').focus();
  }
});
