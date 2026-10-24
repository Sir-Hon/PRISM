/** Page script for admin-register.html — keep HTML in the .html file. */
/* ── Redirect if already logged in ── */
  if (sessionStorage.getItem('prism_logged_in') === 'true') {
    window.location.replace(sessionStorage.getItem('prism_role') === 'admin' ? 'manage.html' : 'login.html');
  }

  /* ── State ── */
  const MAX_TOTAL_ATTEMPTS = 5;
  let totalAttempts = parseInt(sessionStorage.getItem('prism_admin_reg_attempts') || '0');
  let verifiedCode  = null;
  let currentStep   = 1;

  const DEFAULT_IDS = ['admin001','2024-00001','2024-00002','2024-00003','2024-00004',
                       '2024-10001','2024-10002','2024-10003','2024-10004'];

  /* ── On load: check if already locked ── */
  window.addEventListener('DOMContentLoaded', () => {
    updatePips();
    if (totalAttempts >= MAX_TOTAL_ATTEMPTS) showLockout();
  });

  /* ── Attempt tracking ── */
  function recordAttempt() {
    totalAttempts++;
    sessionStorage.setItem('prism_admin_reg_attempts', totalAttempts);
    updatePips();
    if (totalAttempts >= MAX_TOTAL_ATTEMPTS) {
      setTimeout(showLockout, 600);
      return true; // locked
    }
    return false;
  }

  function updatePips() {
    for (let i = 1; i <= 5; i++) {
      const pip = document.getElementById('pip-' + i);
      if (pip) pip.classList.toggle('used', i <= totalAttempts);
    }
  }

  function showLockout() {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById('attempts-bar').style.display = 'none';
    document.getElementById('step-indicator') && (document.getElementById('step-indicator').style.display = 'none');
    document.querySelector('.step-indicator').style.display = 'none';
    document.getElementById('lockout-screen').classList.add('active');
  }

  /* ── Helpers ── */
  function fmtCode(el) {
    let v = el.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (v.length > 4) v = v.slice(0,4)+'-'+v.slice(4);
    if (v.length > 9) v = v.slice(0,9)+'-'+v.slice(9);
    el.value = v.slice(0,14);
    el.classList.remove('valid','err');
  }

  function toggleEye(id, btn) {
    const el = document.getElementById(id);
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.textContent = el.type === 'password' ? '👁' : '🙈';
  }

  function setFb(id, msg, type) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = 'feedback ' + type;
  }

  function stepToNext(from, to) {
    document.getElementById('step-' + from).classList.remove('active');
    document.getElementById('dot-' + from).className = 'step-dot done';
    document.getElementById('dot-' + from).textContent = '✓';
    if (from < 3) {
      document.getElementById('line-' + from).className = 'step-line done';
    }
    document.getElementById('dot-' + to).className = 'step-dot current';
    document.getElementById('step-' + to).classList.add('active');
    currentStep = to;
  }

  /* ── STEP 1: Invite Code ── */
  function verifyCode() {
    const raw = document.getElementById('invite-input').value.trim().toUpperCase();
    const el  = document.getElementById('invite-input');
    const btn = document.getElementById('btn-step1');

    if (raw.length < 14) { setFb('fb-step1','Enter the full 12-character code.','err'); el.classList.add('err'); setTimeout(()=>el.classList.remove('err'),600); return; }

    btn.classList.add('loading'); btn.textContent = 'Verifying…';

    setTimeout(() => {
      btn.classList.remove('loading'); btn.textContent = 'Verify Invite Code →';

      const codes = JSON.parse(localStorage.getItem('prism_invite_codes') || '[]');
      const code  = codes.find(c => c.code.toUpperCase() === raw);

      if (!code) {
        el.classList.add('err'); setTimeout(()=>el.classList.remove('err'),600);
        setFb('fb-step1','❌ Invalid invite code.','err');
        if (recordAttempt()) return;
        return;
      }
      if (code.used) {
        el.classList.add('err');
        setFb('fb-step1','❌ This code has already been used.','err');
        if (recordAttempt()) return;
        return;
      }
      if (code.expires && Date.now() > code.expires) {
        el.classList.add('err');
        setFb('fb-step1','❌ This code has expired.','err');
        if (recordAttempt()) return;
        return;
      }
      if (code.role !== 'admin') {
        el.classList.add('err');
        setFb('fb-step1','❌ This code is not for an admin account.','err');
        if (recordAttempt()) return;
        return;
      }

      // Valid admin code
      verifiedCode = raw;
      el.classList.add('valid');
      setFb('fb-step1','✅ Code verified — proceed to passphrase.','ok');
      setTimeout(() => stepToNext(1, 2), 700);
    }, 700);
  }

  /* ── STEP 2: Portal Passphrase ── */
  function verifyPassphrase() {
    const input = document.getElementById('passphrase-input').value;
    const el    = document.getElementById('passphrase-input');
    const btn   = document.getElementById('btn-step2');

    if (!input.trim()) { setFb('fb-step2','Please enter the passphrase.','err'); return; }

    btn.classList.add('loading'); btn.textContent = 'Verifying…';

    setTimeout(() => {
      btn.classList.remove('loading'); btn.textContent = 'Verify Passphrase →';

      const storedPP = localStorage.getItem('prism_admin_passphrase');

      if (!storedPP) {
        // No passphrase has been set — block registration
        el.classList.add('err'); setTimeout(()=>el.classList.remove('err'),600);
        setFb('fb-step2','❌ No admin passphrase has been configured. Ask your administrator to set one in the portal.','err');
        if (recordAttempt()) return;
        return;
      }

      if (input !== storedPP) {
        el.classList.add('err'); setTimeout(()=>el.classList.remove('err'),600);
        const left = MAX_TOTAL_ATTEMPTS - totalAttempts - 1;
        setFb('fb-step2',`❌ Incorrect passphrase. ${left > 0 ? left+' attempt'+(left!==1?'s':'')+' remaining.' : 'Last attempt.'}`, 'err');
        if (recordAttempt()) return;
        el.value = '';
        return;
      }

      el.classList.add('valid');
      setFb('fb-step2','✅ Passphrase accepted.','ok');

      document.getElementById('s3-notice').innerHTML =
        '<strong style="color:#fcd34d;">✅ Both credentials verified.</strong> Complete your account details below.';

      setTimeout(() => stepToNext(2, 3), 700);
    }, 600);
  }

  /* ── STEP 3: Create Account ── */
  function checkPwStrength() {
    const pw = document.getElementById('pw1').value;
    const wrap = document.getElementById('pp-strength');
    if (!pw) { wrap.style.display='none'; return; }
    wrap.style.display = 'block';
    let s = 0;
    if (pw.length >= 8)  s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    const L = [
      {pct:'20%',c:'#ef4444',t:'Very weak'},
      {pct:'40%',c:'#f97316',t:'Weak'},
      {pct:'60%',c:'#f59e0b',t:'Fair'},
      {pct:'80%',c:'#84cc16',t:'Strong'},
      {pct:'100%',c:'#22c55e',t:'Very strong'}
    ];
    const l = L[Math.min(s-1,4)] || L[0];
    document.getElementById('pp-fill').style.width = l.pct;
    document.getElementById('pp-fill').style.background = l.c;
    document.getElementById('pp-label').textContent = l.t;
    document.getElementById('pp-label').style.color = l.c;
  }

  function checkConfirm() {
    const pw  = document.getElementById('pw1').value;
    const el  = document.getElementById('pw2');
    if (!el.value) { el.className='field-input'; return; }
    el.classList.toggle('valid', pw === el.value);
    el.classList.toggle('err',   pw !== el.value);
  }

  function createAdmin() {
    const fn   = document.getElementById('fn').value.trim();
    const ln   = document.getElementById('ln').value.trim();
    const uid  = document.getElementById('uid').value.trim();
    const dept = document.getElementById('dept').value.trim();
    const pw1  = document.getElementById('pw1').value;
    const pw2  = document.getElementById('pw2').value;
    const btn  = document.getElementById('btn-step3');

    if (!fn)           { setFb('fb-step3','First name is required.','err'); return; }
    if (!ln)           { setFb('fb-step3','Last name is required.','err'); return; }
    if (!uid || uid.length < 4) { setFb('fb-step3','ID must be at least 4 characters.','err'); return; }
    if (!dept)         { setFb('fb-step3','Department / office is required.','err'); return; }
    if (!pw1 || pw1.length < 8) { setFb('fb-step3','Password must be at least 8 characters.','err'); return; }
    if (pw1 !== pw2)   { setFb('fb-step3','Passwords do not match.','err'); return; }

    // Uniqueness check
    const stored = JSON.parse(localStorage.getItem('prism_accounts') || '[]');
    const allIds = [...DEFAULT_IDS, ...stored.map(a => a.id.toLowerCase())];
    if (allIds.includes(uid.toLowerCase())) {
      setFb('fb-step3','That ID is already in use. Choose a different one.','err');
      return;
    }

    btn.classList.add('loading'); btn.textContent = 'Creating account…';

    // Mark invite code as used
    const codes = JSON.parse(localStorage.getItem('prism_invite_codes') || '[]');
    const ci = codes.findIndex(c => c.code.toUpperCase() === verifiedCode);
    if (ci !== -1) {
      codes[ci].used = true;
      codes[ci].usedBy = fn + ' ' + ln + ' (' + uid + ')';
      codes[ci].usedAt = new Date().toISOString();
    }
    localStorage.setItem('prism_invite_codes', JSON.stringify(codes));

    // Log the creation attempt
    const auditLog = JSON.parse(localStorage.getItem('prism_admin_audit') || '[]');
    auditLog.push({
      event:     'admin_registration',
      name:      fn + ' ' + ln,
      id:        uid,
      inviteCode:verifiedCode,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent.slice(0,80),
    });
    localStorage.setItem('prism_admin_audit', JSON.stringify(auditLog));

    // Create account
    stored.push({
      id: uid, password: pw1, role: 'admin',
      name: fn + ' ' + ln, section: dept,
      source: 'invite-registered',
      inviteCode: verifiedCode,
      registered: new Date().toISOString()
    });
    localStorage.setItem('prism_accounts', JSON.stringify(stored));

    // Clear session attempt counter on success
    sessionStorage.removeItem('prism_admin_reg_attempts');

    setTimeout(() => {
      document.querySelector('.step-indicator').style.display = 'none';
      document.getElementById('attempts-bar').style.display = 'none';
      document.getElementById('step-3').classList.remove('active');
      document.getElementById('success-id').textContent = uid;
      document.getElementById('success-screen').classList.add('active');
    }, 700);
  }

  /* ── Enter key support ── */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (currentStep === 1) verifyCode();
    else if (currentStep === 2) verifyPassphrase();
    else if (currentStep === 3) createAdmin();
  });
