/** Certificate of Registration — students download, admins send. */
var COR_FEES = [
  ['tuition', 'Tuition', '3000'],
  ['athletics', 'Athletics', '200'],
  ['computer', 'Computer', '400'],
  ['cultural', 'Cultural', '150'],
  ['development', 'Development', '2815'],
  ['guidance', 'Guidance', '90'],
  ['laboratory', 'Laboratory', '750'],
  ['library', 'Library', '350'],
  ['medical', 'Medical and Dental', '200'],
  ['registration', 'Registration', '50']
];
var selectedCor = null;
var adminStudents = [];
var lastAutoName = '';

function corEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function corMoney(n) {
  var x = parseFloat(n);
  if (!isFinite(x)) x = 0;
  return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function corDocument(p) {
  var subjects = Array.isArray(p.subjects) ? p.subjects : [];
  var units = 0;
  var rows = subjects.map(function (s) {
    var u = parseFloat(s.units);
    if (!isNaN(u)) units += u;
    return '<tr><td>' + corEsc(s.section) + '</td><td>' + corEsc(s.code) + '</td><td>' + corEsc(s.description) +
      '</td><td>' + corEsc(s.units) + '</td><td>' + corEsc(s.time) + '</td><td>' + corEsc(s.day) + '</td><td>' + corEsc(s.room) + '</td></tr>';
  }).join('');
  var fees = p.fees || {};
  var total = 0;
  var feeRows = COR_FEES.map(function (fee) {
    var amount = parseFloat(fees[fee[0]]) || 0;
    total += amount;
    return '<tr><td>' + corEsc(fee[1]) + '</td><td style="text-align:right;">' + corMoney(amount) + '</td></tr>';
  }).join('');
  return '<article class="cor-doc">' +
    '<div class="cor-school">CEBU TECHNOLOGICAL UNIVERSITY</div>' +
    '<h1>Certificate of Registration</h1>' +
    '<div class="cor-term">' + corEsc(p.semester || '') + ' &middot; SY ' + corEsc(p.schoolYear || '') + '</div>' +
    '<div class="cor-meta">' +
      '<div><strong>Student ID</strong> ' + corEsc(p.studentId) + '</div>' +
      '<div><strong>Name</strong> ' + corEsc(p.studentName) + '</div>' +
      '<div><strong>Program</strong> ' + corEsc(p.program) + '</div>' +
      '<div><strong>Block</strong> ' + corEsc(p.block) + '</div>' +
    '</div>' +
    '<table><thead><tr><th>Section</th><th>Subject</th><th>Description</th><th>Units</th><th>Time</th><th>Day</th><th>Room</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="7">No subjects</td></tr>') +
    '</tbody></table>' +
    '<p style="text-align:right;font-weight:800;margin:.2rem 0 .8rem;">Total Units ' + units.toFixed(2) + '</p>' +
    '<table><thead><tr><th>Fee</th><th style="text-align:right;">Amount</th></tr></thead><tbody>' + feeRows +
    '<tr><td><strong>Total Charges</strong></td><td style="text-align:right;"><strong>' + corMoney(total) + '</strong></td></tr></tbody></table>' +
    '<div class="cor-sign"><div><div class="cor-line">Student signature</div></div>' +
    '<div><div class="cor-line">' + corEsc(p.registrar || 'Registrar') + '</div><div>' + corEsc(p.issuedOn || '') + '</div></div></div>' +
    '</article>';
}

function todayISO() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

document.addEventListener('DOMContentLoaded', async function () {
  var user = await prismAuthGuard(['student', 'admin']);
  if (!user) return;
  var home = document.getElementById('cor-home');
  if (home && typeof getRoleHome === 'function') home.href = getRoleHome(user.role);
  if (user.role === 'admin') initCorAdmin();
  else initCorStudent();
});

function initCorStudent() {
  document.getElementById('cor-student').style.display = 'block';
  PrismRecords.listCors().then(renderCorChoices).catch(function (e) {
    document.getElementById('cor-choices').innerHTML = '<p class="cor-lead">' + corEsc(e.message || 'Could not load certificates') + '</p>';
  });
}

function renderCorChoices(list) {
  var host = document.getElementById('cor-choices');
  if (!list.length) {
    host.innerHTML = '<p class="cor-lead">No certificate has been sent to you yet.</p>';
    return;
  }
  host.innerHTML = '';
  list.forEach(function (item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cor-choice';
    btn.innerHTML = '<strong>' + corEsc(item.label) + '</strong><span>Sent ' + corEsc(item.sent_at || '') + '</span>';
    btn.addEventListener('click', function () { openCor(item.id, btn); });
    host.appendChild(btn);
  });
}

async function openCor(id, btn) {
  var cor = await PrismRecords.getCor(id);
  selectedCor = cor;
  document.querySelectorAll('.cor-choice').forEach(function (el) { el.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById('cor-print').innerHTML = corDocument(cor.payload || {});
  document.getElementById('cor-download-bar').style.display = 'flex';
}

function downloadSelectedCor() {
  if (!selectedCor) return;
  var previous = document.title;
  document.title = selectedCor.label || 'Certificate of Registration';
  window.print();
  document.title = previous;
}

function blankSubject() {
  return { section: '', code: '', description: '', units: '', time: '', day: '', room: '' };
}

function subjectRow(subject) {
  var s = subject || blankSubject();
  var tr = document.createElement('tr');
  ['section', 'code', 'description', 'units', 'time', 'day', 'room'].forEach(function (key) {
    var td = document.createElement('td');
    var input = document.createElement('input');
    input.setAttribute('data-sub', key);
    input.value = s[key] || '';
    if (key === 'description') input.placeholder = 'Subject title';
    td.appendChild(input);
    tr.appendChild(td);
  });
  var remove = document.createElement('td');
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cor-btn ghost';
  btn.textContent = 'Remove';
  btn.addEventListener('click', function () {
    var body = document.getElementById('cor-subject-body');
    if (body.children.length > 1) tr.remove();
  });
  remove.appendChild(btn);
  tr.appendChild(remove);
  return tr;
}

function initCorAdmin() {
  document.getElementById('cor-admin').style.display = 'block';
  var form = document.getElementById('cor-form');
  var feeFields = COR_FEES.map(function (fee) {
    return '<div class="cor-field"><label>' + corEsc(fee[1]) + '</label><input id="fee-' + fee[0] + '" inputmode="decimal" placeholder="' + fee[2] + '" value=""></div>';
  }).join('');
  form.innerHTML =
    '<div class="cor-grid">' +
      '<div class="cor-field"><label>Student</label><select id="cor-student-pick"></select></div>' +
      '<div class="cor-field"><label>Name on certificate</label><input id="cor-name"></div>' +
      '<div class="cor-field"><label>School year</label><input id="cor-year" value="2026-2027" placeholder="2026-2027"></div>' +
      '<div class="cor-field"><label>Semester</label><select id="cor-sem"><option>1st Semester</option><option>2nd Semester</option><option>Summer</option></select></div>' +
      '<div class="cor-field"><label>Program</label><input id="cor-program" placeholder="BSIT 3"></div>' +
      '<div class="cor-field"><label>Block</label><input id="cor-block" placeholder="BLK_BSIT-3A_DAY"></div>' +
      '<div class="cor-field"><label>Registrar</label><input id="cor-registrar" placeholder="Registrar name"></div>' +
      '<div class="cor-field"><label>Date</label><input id="cor-date" type="date" value="' + todayISO() + '"></div>' +
    '</div>' +
    '<h2 style="font-size:.95rem;margin:1rem 0 .4rem;">Subjects</h2>' +
    '<div style="overflow-x:auto;"><table class="sub-table"><thead><tr><th>Section</th><th>Code</th><th>Description</th><th>Units</th><th>Time</th><th>Day</th><th>Room</th><th></th></tr></thead><tbody id="cor-subject-body"></tbody></table></div>' +
    '<div class="cor-actions"><button class="cor-btn ghost" type="button" id="cor-add-subject">Add subject</button></div>' +
    '<h2 style="font-size:.95rem;margin:.4rem 0;">Fees</h2>' +
    '<div class="cor-grid">' + feeFields + '</div>';
  document.getElementById('cor-subject-body').appendChild(subjectRow());
  document.getElementById('cor-add-subject').addEventListener('click', function () {
    document.getElementById('cor-subject-body').appendChild(subjectRow());
  });
  document.getElementById('cor-student-pick').addEventListener('change', applySelectedStudent);
  PrismAdmin.getAllUsers().then(function (users) {
    adminStudents = (users || []).filter(function (u) { return u.role === 'student'; });
    var sel = document.getElementById('cor-student-pick');
    if (!adminStudents.length) {
      sel.innerHTML = '<option value="">No students yet</option>';
      return;
    }
    adminStudents.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name + ' · ' + s.id;
      sel.appendChild(opt);
    });
    applySelectedStudent();
  }).catch(function (e) {
    setCorMsg(e.message || 'Could not load students', true);
  });
  loadSentCors();
}

function applySelectedStudent() {
  var sel = document.getElementById('cor-student-pick');
  var student = adminStudents.filter(function (s) { return s.id === sel.value; })[0];
  if (!student) return;
  var name = document.getElementById('cor-name');
  if (!name.value || name.value === lastAutoName) {
    name.value = student.name || '';
    lastAutoName = name.value;
  }
  var block = document.getElementById('cor-block');
  if (block && !block.value && student.section) block.value = student.section;
}

function readSubjects() {
  var rows = [];
  document.querySelectorAll('#cor-subject-body tr').forEach(function (tr) {
    var item = {};
    tr.querySelectorAll('[data-sub]').forEach(function (input) {
      item[input.getAttribute('data-sub')] = input.value.trim();
    });
    if (item.description || item.code) rows.push(item);
  });
  return rows;
}

function readFees() {
  var fees = {};
  COR_FEES.forEach(function (fee) {
    var el = document.getElementById('fee-' + fee[0]);
    fees[fee[0]] = el && el.value !== '' ? el.value : 0;
  });
  return fees;
}

function collectCor() {
  var sel = document.getElementById('cor-student-pick');
  return {
    student_id: sel ? sel.value : '',
    student_name: document.getElementById('cor-name').value.trim(),
    school_year: document.getElementById('cor-year').value.trim(),
    semester: document.getElementById('cor-sem').value,
    program: document.getElementById('cor-program').value.trim(),
    block: document.getElementById('cor-block').value.trim(),
    registrar: document.getElementById('cor-registrar').value.trim(),
    issued_on: document.getElementById('cor-date').value,
    subjects: readSubjects(),
    fees: readFees()
  };
}

function previewPayload(body) {
  return {
    studentId: body.student_id,
    studentName: body.student_name,
    schoolYear: body.school_year,
    semester: body.semester,
    program: body.program,
    block: body.block,
    registrar: body.registrar,
    issuedOn: body.issued_on,
    subjects: body.subjects,
    fees: body.fees
  };
}

function previewAdminCor() {
  document.getElementById('cor-print').innerHTML = corDocument(previewPayload(collectCor()));
}

function setCorMsg(text, isError) {
  var el = document.getElementById('cor-msg');
  el.textContent = text || '';
  el.className = 'cor-msg' + (text ? (isError ? ' err' : ' ok') : '');
}

async function sendCor() {
  var body = collectCor();
  setCorMsg('Sending…', false);
  try {
    var res = await PrismRecords.sendCor(body);
    setCorMsg('Sent ' + (res.label || 'certificate') + '.', false);
    previewAdminCor();
    loadSentCors();
  } catch (e) {
    setCorMsg(e.message || 'Could not send the certificate', true);
  }
}

function loadSentCors() {
  PrismRecords.listCors().then(function (list) {
    var card = document.getElementById('cor-sent-card');
    var host = document.getElementById('cor-sent');
    if (!list.length) {
      card.style.display = 'none';
      return;
    }
    card.style.display = 'block';
    host.innerHTML = '';
    list.forEach(function (item) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'sent-row';
      row.style.width = '100%';
      row.style.background = 'none';
      row.style.border = 'none';
      row.style.cursor = 'pointer';
      row.style.fontFamily = 'inherit';
      row.innerHTML = '<strong>' + corEsc(item.label) + '</strong><span>' + corEsc(item.student_name || item.student_id) + '</span>';
      row.addEventListener('click', function () { editSentCor(item.id); });
      host.appendChild(row);
    });
  }).catch(function () {});
}

async function editSentCor(id) {
  var cor = await PrismRecords.getCor(id);
  var p = cor.payload || {};
  var sel = document.getElementById('cor-student-pick');
  if (sel) sel.value = cor.student_id;
  lastAutoName = p.studentName || '';
  document.getElementById('cor-name').value = p.studentName || '';
  document.getElementById('cor-year').value = p.schoolYear || cor.school_year || '';
  document.getElementById('cor-sem').value = p.semester || cor.semester || '1st Semester';
  document.getElementById('cor-program').value = p.program || '';
  document.getElementById('cor-block').value = p.block || '';
  document.getElementById('cor-registrar').value = p.registrar || '';
  if (p.issuedOn) document.getElementById('cor-date').value = p.issuedOn;
  var body = document.getElementById('cor-subject-body');
  body.innerHTML = '';
  var subjects = p.subjects && p.subjects.length ? p.subjects : [blankSubject()];
  subjects.forEach(function (s) { body.appendChild(subjectRow(s)); });
  var fees = p.fees || {};
  COR_FEES.forEach(function (fee) {
    var el = document.getElementById('fee-' + fee[0]);
    if (el) el.value = fees[fee[0]] != null ? fees[fee[0]] : '';
  });
  document.getElementById('cor-print').innerHTML = corDocument(p);
  setCorMsg('Loaded ' + (cor.label || 'certificate') + '. Send again to update it.', false);
}
