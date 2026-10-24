/** Page script for teacher-register.html — keep HTML in the .html file. */
if (sessionStorage.getItem('prism_logged_in') === 'true') {
    window.location.replace(sessionStorage.getItem('prism_role') === 'teacher' ? 'teacher.html' : 'index.html');
  }

  const DEFAULT_IDS = ['admin001','2024-00001','2024-00002','2024-00003','2024-00004','2024-10001','2024-10002','2024-10003','2024-10004'];
  let verifiedCode = null;
  let verifiedRole = null;

  // Force clear invite input on load — prevents browser autofill showing cached code
  function clearInviteInput() {
    const el = document.getElementById('invite-code-input');
    if (el) { el.value = ''; el.removeAttribute('value'); }
  }
  window.addEventListener('DOMContentLoaded', clearInviteInput);
  // Also clear after short delays — some browsers autofill after DOMContentLoaded
  setTimeout(clearInviteInput, 100);
  setTimeout(clearInviteInput, 400);

  function formatInviteInput(el) {
    el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
    el.classList.remove('valid', 'error');
  }

  function togglePw(id, btn) {
    const el = document.getElementById(id);
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.textContent = el.type === 'password' ? 'Show' : 'Hide';
  }

  async function verifyInviteCode() {
    const inputCode = document.getElementById('invite-code-input').value.trim().toUpperCase().replace(/-/g,'');
    const msg = document.getElementById('verify-msg');
    const btn = document.getElementById('verify-btn');
    const el  = document.getElementById('invite-code-input');

    if (!inputCode || inputCode.length !== 7) { msg.textContent = 'Please enter the full 7-character invite code.'; msg.className = 'verify-msg error'; return; }

    btn.classList.add('loading'); btn.textContent = 'Verifying…';

    try {
      // Just store the code for use in registration — actual validation happens server-side
      btn.classList.remove('loading'); btn.textContent = 'Verify Code →';
      el.classList.add('valid');
      verifiedCode = inputCode;
      msg.textContent = ' Code accepted!'; msg.className = 'verify-msg success';

      setTimeout(() => {
        document.getElementById('step-1').classList.remove('active');
        document.getElementById('step-2').classList.add('active');
        document.getElementById('dot-1').className = 'step-dot done'; document.getElementById('dot-1').textContent = '';
        document.getElementById('line-1').className = 'step-line done';
        document.getElementById('dot-2').className = 'step-dot current';
        document.getElementById('code-success-notice').innerHTML = '<strong style="color:#6ee7b7;"> Code accepted.</strong> Fill in your details to complete registration as a <strong>teacher</strong>.';
        document.getElementById('f-firstname').focus();
      }, 700);
    } catch(e) {
      btn.classList.remove('loading'); btn.textContent = 'Verify Code →';
      el.classList.add('error');
      msg.textContent = e.message || 'Invalid code.'; msg.className = 'verify-msg error';
    }
  }

  function showMsg(t, type) { const el = document.getElementById('reg-msg'); el.textContent = t; el.className = 'msg ' + type; }

  async function handleRegister() {
    const fn  = document.getElementById('f-firstname').value.trim();
    const ln  = document.getElementById('f-lastname').value.trim();
    const id  = document.getElementById('f-id').value.trim();
    const pw  = document.getElementById('f-pw').value;
    const pw2 = document.getElementById('f-pw2').value;

    if (!fn)           { showMsg('Please enter your first name.','error'); return; }
    if (!ln)           { showMsg('Please enter your last name.','error'); return; }
    if (!id)           { showMsg('Please enter your teacher ID.','error'); return; }
    if (id.length < 4) { showMsg('ID must be at least 4 characters.','error'); return; }
    if (!pw)           { showMsg('Please create a password.','error'); return; }
    if (pw.length < 6) { showMsg('Password must be at least 6 characters.','error'); return; }
    if (pw !== pw2)    { showMsg('Passwords do not match.','error'); return; }

    const btn = document.getElementById('reg-btn');
    btn.classList.add('loading'); btn.textContent = 'Creating account…';

    try {
      await PrismAuth.registerTeacher(id, pw, fn + ' ' + ln, verifiedCode);
      document.getElementById('reg-form').style.display = 'none';
      btn.style.display = 'none';
      document.getElementById('reg-msg').style.display = 'none';
      document.getElementById('code-success-notice').style.display = 'none';
      document.getElementById('success-id').textContent = id;
      document.getElementById('success-screen').style.display = 'flex';
    } catch(e) {
      btn.classList.remove('loading'); btn.textContent = 'Create Teacher Account';
      showMsg(e.message || 'Registration failed. Please try again.', 'error');
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (document.getElementById('step-1').classList.contains('active')) verifyInviteCode();
      else if (document.getElementById('step-2').classList.contains('active')) handleRegister();
    }
  });
