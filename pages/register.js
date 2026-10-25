/** Page script for register.html — keep HTML in the .html file. */
function togglePw(id, btn) {
    const el = document.getElementById(id);
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.textContent = el.type === 'password' ? 'Show' : 'Hide';
  }

  function checkStrength() {
    const pw = document.getElementById('f-pw').value;
    const wrap = document.getElementById('strength-wrap');
    if (!pw) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    let s = 0;
    if (pw.length >= 6) s++; if (pw.length >= 10) s++;
    if (/[A-Z]/.test(pw)) s++; if (/[0-9]/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
    const L = [{pct:'20%',color:'#ef4444',text:'Very weak'},{pct:'40%',color:'#f97316',text:'Weak'},{pct:'60%',color:'#f59e0b',text:'Fair'},{pct:'80%',color:'#84cc16',text:'Strong'},{pct:'100%',color:'#22c55e',text:'Very strong'}];
    const l = L[Math.min(s-1,4)] || L[0];
    document.getElementById('strength-fill').style.width = l.pct;
    document.getElementById('strength-fill').style.background = l.color;
    document.getElementById('strength-label').textContent = l.text;
    document.getElementById('strength-label').style.color = l.color;
  }

  function checkConfirm() {
    const pw = document.getElementById('f-pw').value;
    const el = document.getElementById('f-pw2');
    if (!el.value) { el.className = ''; return; }
    el.classList.toggle('valid', pw === el.value);
    el.classList.toggle('invalid', pw !== el.value);
  }

  function showMsg(t, type) { const el = document.getElementById('reg-msg'); el.textContent = t; el.className = 'msg ' + type; }

  async function handleRegister() {
    const fn  = document.getElementById('f-firstname').value.trim();
    const ln  = document.getElementById('f-lastname').value.trim();
    const id  = document.getElementById('f-id').value.trim();
    const sec = document.getElementById('f-section').value.trim();
    const pw  = document.getElementById('f-pw').value;
    const pw2 = document.getElementById('f-pw2').value;

    if (!fn)           { showMsg('Please enter your first name.', 'error'); return; }
    if (!ln)           { showMsg('Please enter your last name.', 'error'); return; }
    if (!id)           { showMsg('Please enter your 7-digit student ID.', 'error'); return; }
    if (typeof prismIsCtuStudentId === 'function' ? !prismIsCtuStudentId(id) : !/^[0-9]{7}$/.test(id)) {
      showMsg('Student ID must be exactly 7 digits (CTU ID).', 'error');
      return;
    }
    if (!sec)          { showMsg('Please enter your section.', 'error'); return; }
    if (!pw)           { showMsg('Please create a password.', 'error'); return; }
    if (pw.length < 6) { showMsg('Password must be at least 6 characters.', 'error'); return; }
    if (pw !== pw2)    { showMsg('Passwords do not match.', 'error'); return; }

    const btn = document.getElementById('reg-btn');
    btn.classList.add('loading'); btn.textContent = 'Creating account…';

    try {
      await PrismAuth.register(id, pw, fn + ' ' + ln, sec);
      document.getElementById('reg-form').style.display = 'none';
      btn.style.display = 'none';
      document.getElementById('reg-msg').style.display = 'none';
      document.getElementById('success-id').textContent = id;
      document.getElementById('success-screen').style.display = 'flex';
    } catch (e) {
      btn.classList.remove('loading'); btn.textContent = 'Create Student Account';
      showMsg(e.message || 'Registration failed. Please try again.', 'error');
    }
  }

  var regId = document.getElementById('f-id');
  if (regId) {
    regId.addEventListener('input', function () {
      this.value = String(this.value || '').replace(/\D/g, '').slice(0, 7);
    });
  }

  document.addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister(); });
