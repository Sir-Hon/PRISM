/** Page script for register.html — keep HTML in the .html file. */
var CTU_PROGRAMS = {
  CoED: ['BEEd', 'BSEd-Mathematics', 'BTLEd-HE'],
  CoTE: ['BSFI', 'BSIE', 'BSIT', 'BSHM', 'BIT-ELEC', 'BIT-COMPTECH', 'BIT-AUTO']
};

function fillSelect(sel, placeholder, values, enabled) {
  if (!sel) return;
  sel.innerHTML = '';
  var blank = document.createElement('option');
  blank.value = '';
  blank.textContent = placeholder;
  sel.appendChild(blank);
  (values || []).forEach(function (v) {
    var o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
  sel.disabled = !enabled;
  sel.value = '';
}

function onCollegeChange() {
  var college = document.getElementById('f-college').value;
  var prog = document.getElementById('f-program');
  var year = document.getElementById('f-year');
  var letter = document.getElementById('f-secletter');
  if (!college || !CTU_PROGRAMS[college]) {
    fillSelect(prog, 'Select college first', [], false);
    year.disabled = true; year.value = '';
    letter.disabled = true; letter.value = '';
    return;
  }
  fillSelect(prog, 'Select program', CTU_PROGRAMS[college], true);
  year.disabled = true; year.value = '';
  letter.disabled = true; letter.value = '';
}

function onProgramChange() {
  var program = document.getElementById('f-program').value;
  var year = document.getElementById('f-year');
  var letter = document.getElementById('f-secletter');
  year.disabled = !program;
  year.value = '';
  letter.disabled = true;
  letter.value = '';
}

function onYearChange() {
  var year = document.getElementById('f-year').value;
  var letter = document.getElementById('f-secletter');
  letter.disabled = !year;
  letter.value = '';
}

function buildCtuSection() {
  var program = (document.getElementById('f-program').value || '').trim();
  var year = (document.getElementById('f-year').value || '').trim();
  var letter = (document.getElementById('f-secletter').value || '').trim();
  if (!program || !year || !letter) return '';
  return program + ' ' + year + '-' + letter;
}

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
    const email = (document.getElementById('f-email').value || '').trim().toLowerCase();
    const college = document.getElementById('f-college').value.trim();
    const program = document.getElementById('f-program').value.trim();
    const year = document.getElementById('f-year').value.trim();
    const letter = document.getElementById('f-secletter').value.trim();
    const sec = buildCtuSection();
    const pw  = document.getElementById('f-pw').value;
    const pw2 = document.getElementById('f-pw2').value;

    if (!fn)           { showMsg('Please enter your first name.', 'error'); return; }
    if (!ln)           { showMsg('Please enter your last name.', 'error'); return; }
    if (!id)           { showMsg('Please enter your 7-digit student ID.', 'error'); return; }
    if (typeof prismIsCtuStudentId === 'function' ? !prismIsCtuStudentId(id) : !/^[0-9]{7}$/.test(id)) {
      showMsg('Student ID must be exactly 7 digits (CTU ID).', 'error');
      return;
    }
    if (!email)        { showMsg('Please enter your CTU email.', 'error'); return; }
    if (typeof prismIsCtuEmail === 'function' ? !prismIsCtuEmail(email) : !/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@ctu\.edu\.ph$/.test(email)) {
      showMsg('Use your CTU email (@ctu.edu.ph), not a personal Gmail.', 'error');
      return;
    }
    if (!college)      { showMsg('Please select your college.', 'error'); return; }
    if (!program)      { showMsg('Please select your program.', 'error'); return; }
    if (!year)         { showMsg('Please select your year.', 'error'); return; }
    if (!letter)       { showMsg('Please select your section.', 'error'); return; }
    if (!sec)          { showMsg('Please complete college, program, year, and section.', 'error'); return; }
    if (!pw)           { showMsg('Please create a password.', 'error'); return; }
    if (pw.length < 6) { showMsg('Password must be at least 6 characters.', 'error'); return; }
    if (pw !== pw2)    { showMsg('Passwords do not match.', 'error'); return; }

    const btn = document.getElementById('reg-btn');
    btn.classList.add('loading'); btn.textContent = 'Creating account…';

    try {
      await PrismAuth.register(id, pw, fn + ' ' + ln, sec, email);
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
  var collegeEl = document.getElementById('f-college');
  var programEl = document.getElementById('f-program');
  var yearEl = document.getElementById('f-year');
  if (collegeEl) collegeEl.addEventListener('change', onCollegeChange);
  if (programEl) programEl.addEventListener('change', onProgramChange);
  if (yearEl) yearEl.addEventListener('change', onYearChange);

  window.togglePw = togglePw;
  window.checkStrength = checkStrength;
  window.checkConfirm = checkConfirm;
  window.handleRegister = handleRegister;

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    var t = e.target;
    if (t && (t.tagName === 'SELECT' || t.tagName === 'BUTTON')) return;
    handleRegister();
  });
