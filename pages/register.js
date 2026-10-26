/** Page script for register.html — keep HTML in the .html file. */
function togglePw(id, btn) {
  var el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'password' ? 'Show' : 'Hide';
}

function checkStrength() {
  var pw = document.getElementById('f-pw').value;
  var wrap = document.getElementById('strength-wrap');
  if (!pw) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  var s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) s++;
  if (/[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  var L = [
    { pct: '25%', color: '#ef4444', text: 'Too short' },
    { pct: '50%', color: '#f59e0b', text: 'Add a letter and a number' },
    { pct: '75%', color: '#84cc16', text: 'Good' },
    { pct: '100%', color: '#22c55e', text: 'Strong' }
  ];
  var l = L[Math.min(s, 3)];
  document.getElementById('strength-fill').style.width = l.pct;
  document.getElementById('strength-fill').style.background = l.color;
  document.getElementById('strength-label').textContent = l.text;
  document.getElementById('strength-label').style.color = l.color;
}

function checkConfirm() {
  var pw = document.getElementById('f-pw').value;
  var el = document.getElementById('f-pw2');
  if (!el.value) { el.className = ''; return; }
  el.classList.toggle('valid', pw === el.value);
  el.classList.toggle('invalid', pw !== el.value);
}

function showBanner(text) {
  var el = document.getElementById('reg-banner');
  if (!text) { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'block';
  el.textContent = text;
}

function setHint(id, text, bad) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '';
  el.style.color = bad ? '#f87171' : '#6b7280';
}

function formatProblems() {
  var id = document.getElementById('f-id').value.trim();
  var email = document.getElementById('f-email').value.trim().toLowerCase();
  var pw = document.getElementById('f-pw').value;
  var pw2 = document.getElementById('f-pw2').value;
  var problems = [];
  if (!/^[0-9]{7}$/.test(id)) {
    setHint('hint-id', 'Student ID must be exactly 7 digits.', true);
    problems.push('id');
  } else {
    setHint('hint-id', 'Exactly 7 digits.', false);
  }
  if (!/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@ctu\.edu\.ph$/.test(email)) {
    setHint('hint-email', 'Use your @ctu.edu.ph email.', true);
    problems.push('email');
  } else {
    setHint('hint-email', '', false);
  }
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    problems.push('password');
  }
  if (pw !== pw2) problems.push('confirm');
  return problems;
}

async function handleRegister() {
  showBanner('');
  var id = document.getElementById('f-id').value.trim();
  var email = document.getElementById('f-email').value.trim().toLowerCase();
  var code = document.getElementById('f-code').value.trim().toUpperCase();
  var pw = document.getElementById('f-pw').value;
  var pw2 = document.getElementById('f-pw2').value;
  var problems = formatProblems();
  if (!code) {
    setHint('hint-code', 'Enter the 8-character code from your administrator.', true);
    problems.push('code');
  } else {
    setHint('hint-code', '8 characters from your administrator.', false);
  }
  if (problems.indexOf('password') !== -1) {
    showBanner('Password must be at least 8 characters and include a letter and a number.');
    return;
  }
  if (problems.indexOf('confirm') !== -1) {
    showBanner('Passwords do not match.');
    return;
  }
  if (problems.length) return;

  var btn = document.getElementById('reg-btn');
  btn.classList.add('loading');
  btn.textContent = 'Creating account…';
  try {
    await PrismAuth.register(id, pw, pw2, email, code);
    document.getElementById('reg-form').style.display = 'none';
    btn.style.display = 'none';
    document.getElementById('success-id').textContent = id;
    document.getElementById('success-screen').style.display = 'flex';
  } catch (e) {
    btn.classList.remove('loading');
    btn.textContent = 'Create Student Account';
    showBanner(e.message || "Your details don't match our records. Please check them or contact the registrar/admin.");
  }
}

var regId = document.getElementById('f-id');
if (regId) {
  regId.addEventListener('input', function () {
    this.value = String(this.value || '').replace(/\D/g, '').slice(0, 7);
  });
}
var regCode = document.getElementById('f-code');
if (regCode) {
  regCode.addEventListener('input', function () {
    this.value = String(this.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  });
}

window.togglePw = togglePw;
window.checkStrength = checkStrength;
window.checkConfirm = checkConfirm;
window.handleRegister = handleRegister;
