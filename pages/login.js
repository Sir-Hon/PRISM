/** Page script for login.html — keep HTML in the .html file. */
// Clear the client cache only. Do not POST logout here — a false redirect
// to login.html would destroy a still-valid server session.
try { sessionStorage.removeItem('prism_logged_in'); } catch (e) { /* ignore */ }

  const ROLE_CONFIG = {
    student: {
      label: 'Student', accent: '#6366f1',
      badgeBg: 'rgba(99,102,241,.15)', badgeColor: '#a5b4fc',
      placeholder: 'e.g. 1234567',
      note: '<strong>Students only.</strong> Use the 7-digit ID, CTU email, and password an administrator created for you.'
    },
    teacher: {
      label: 'Teacher', accent: '#10b981',
      badgeBg: 'rgba(16,185,129,.15)', badgeColor: '#6ee7b7',
      placeholder: 'e.g. 2024-00001',
      note: '<strong>Teachers only.</strong> Use the teacher ID and CTU email an administrator created for you.'
    },
    admin: {
      label: 'Admin', accent: '#f59e0b',
      badgeBg: 'rgba(245,158,11,.15)', badgeColor: '#fcd34d',
      placeholder: 'e.g. admin001',
      note: '<strong>Administrators only.</strong> Unauthorized access attempts are logged. Use your assigned admin credentials.'
    },
  };

  let currentRole = 'student';
  let attempts = { student: 0, teacher: 0, admin: 0 };
  const MAX_ATTEMPTS = 5;

  function openModal(role) {
    currentRole = role;
    const cfg = ROLE_CONFIG[role];
    const badge = document.getElementById('modal-badge');
    badge.textContent = cfg.label;
    badge.style.background = cfg.badgeBg;
    badge.style.color = cfg.badgeColor;
    document.getElementById('modal-title').textContent = cfg.label + ' Login';
    document.getElementById('modal-sub').textContent   = `Enter your ${role} credentials to continue`;
    document.getElementById('access-note').innerHTML   = cfg.note;
    document.getElementById('modal-box').style.setProperty('--modal-accent', cfg.accent);
    document.getElementById('login-error').textContent = '';
    var idField = document.getElementById('input-id');
    idField.placeholder = cfg.placeholder;
    idField.value = '';
    if (role === 'student') {
      idField.setAttribute('maxlength', '7');
      idField.setAttribute('inputmode', 'numeric');
      idField.setAttribute('pattern', '[0-9]{7}');
    } else {
      idField.removeAttribute('maxlength');
      idField.setAttribute('inputmode', 'text');
      idField.removeAttribute('pattern');
    }
    var emailWrap = document.getElementById('email-field');
    var emailField = document.getElementById('input-email');
    if (emailWrap && emailField) {
      emailField.value = '';
      if (role === 'admin') {
        emailWrap.style.display = 'none';
        emailField.removeAttribute('required');
      } else {
        emailWrap.style.display = '';
        emailField.placeholder = 'e.g. name.surname@ctu.edu.ph';
      }
    }
    document.getElementById('input-pw').value = '';
    document.getElementById('input-pw').type  = 'password';
    const btn = document.getElementById('submit-btn');
    btn.textContent = 'Sign In'; btn.classList.remove('loading');
    if (attempts[role] >= MAX_ATTEMPTS) {
      btn.disabled = true; btn.style.opacity = '0.4';
      document.getElementById('login-error').textContent = 'Too many failed attempts. Please refresh the page.';
    } else { btn.disabled = false; btn.style.opacity = ''; }
    document.getElementById('modal-overlay').classList.add('active');
    var inputId = idField;
    function focusId() {
      try { inputId.focus({ preventScroll: true }); } catch (err) { inputId.focus(); }
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(focusId);
    });
    setTimeout(focusId, 320);
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById('login-error').textContent = '';
  }

  function togglePw() {
    const el = document.getElementById('input-pw');
    const btn = document.querySelector('.pw-toggle');
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.textContent = el.type === 'password' ? 'Show' : 'Hide';
  }

  function showError(msg) { document.getElementById('login-error').textContent = msg; }

  function friendlyLoginErr(e) {
    const m = (e && e.message) ? String(e.message) : 'Something went wrong.';
    if (m.includes('<!DOCTYPE') || m.includes('<html') || m.length > 160) {
      return 'Could not reach the login service. Wait a few seconds and refresh the page — the live site may still be starting.';
    }
    return m;
  }

  async function handleLogin() {
    const id = document.getElementById('input-id').value.trim();
    const emailEl = document.getElementById('input-email');
    const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
    const pw = document.getElementById('input-pw').value;
    if (!id) { showError('Please enter your ID number.'); return; }
    if (currentRole === 'student' && (typeof prismIsCtuStudentId === 'function' ? !prismIsCtuStudentId(id) : !/^[0-9]{7}$/.test(id))) {
      showError('Enter your 7-digit CTU student ID.');
      return;
    }
    if (currentRole === 'student' || currentRole === 'teacher') {
      if (!email) { showError('Please enter your CTU email.'); return; }
      if (typeof prismIsCtuEmail === 'function' ? !prismIsCtuEmail(email) : !/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@ctu\.edu\.ph$/.test(email)) {
        showError('Use your CTU email (@ctu.edu.ph), not a personal Gmail.');
        return;
      }
    }
    if (!pw) { showError('Please enter your password.'); return; }

    if (attempts[currentRole] >= MAX_ATTEMPTS) {
      showError('Too many failed attempts. Please refresh the page to try again.');
      return;
    }

    const btn = document.getElementById('submit-btn');
    btn.classList.add('loading'); btn.textContent = 'Signing in…';

    try {
      const data = await PrismAuth.login(id, pw, currentRole, email);
      if (data.role === 'teacher')    window.location.href = 'teacher.html';
      else if (data.role === 'admin') window.location.href = 'admin.html';
      else                            window.location.href = 'index.html';
    } catch (e) {
      btn.classList.remove('loading'); btn.textContent = 'Sign In';
      attempts[currentRole]++;
      const left = MAX_ATTEMPTS - attempts[currentRole];
      if (left <= 0) {
        showError('Too many failed attempts. Please refresh the page to try again.');
        btn.disabled = true; btn.style.opacity = '0.4';
      } else {
        showError(friendlyLoginErr(e) + ' ' + left + ' attempt' + (left !== 1 ? 's' : '') + ' remaining.');
      }
    }
  }

  document.querySelectorAll('.card[role="button"]').forEach(function (card) {
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });
  var loginIdInput = document.getElementById('input-id');
  if (loginIdInput) {
    loginIdInput.addEventListener('input', function () {
      if (currentRole !== 'student') return;
      this.value = String(this.value || '').replace(/\D/g, '').slice(0, 7);
    });
  }

  window.openModal = openModal;
  window.closeModal = closeModal;
  window.togglePw = togglePw;
  window.handleLogin = handleLogin;

  document.getElementById('modal-overlay').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key !== 'Enter' || !document.getElementById('modal-overlay').classList.contains('active')) return;
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
      return;
    }
    handleLogin();
  });
