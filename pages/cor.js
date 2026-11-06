/** Certificate of Registration — students download, admins send. */
var COR_FEES = [
  ['tuition', 'Tuition', '3000'],
  ['athletics', 'Athletics Fee', '200'],
  ['computer', 'Computer Fee', '400'],
  ['cultural', 'Cultural Fee', '150'],
  ['development', 'Development Fee', '2815'],
  ['guidance', 'Guidance Fee', '90'],
  ['laboratory', 'Laboratory Fee', '750'],
  ['library', 'Library Fee', '350'],
  ['medical', 'Medical and Dental Fee', '200'],
  ['registration', 'Registration Fee', '50']
];
var selectedCor = null;
var corCatalog = null;
var corCatalogPromise = null;
var corCatalogGen = 0;
var adminStudents = [];
var lastAutoName = '';
var lastAutoProgram = '';
var lastAutoBlock = '';
var sendMode = 'section';
var selectedStudentId = '';
var irregularIds = {};
var COR_COLLEGES = {
  CoED: ['BEEd', 'BSEd-Mathematics', 'BTLEd-HE'],
  CoTE: ['BSFI', 'BSIE', 'BSIT', 'BSHM', 'BIT-ELEC', 'BIT-COMPTECH', 'BIT-AUTO']
};
var COR_COLLEGE_NAMES = { CoED: 'College of Education', CoTE: 'College of Technology' };

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
  return x.toFixed(2);
}

function corUnits(n) {
  var x = parseFloat(n);
  if (!isFinite(x)) return corEsc(n || '');
  return x.toFixed(2);
}

function corOfficialName(name) {
  var raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (raw.indexOf(',') !== -1) return raw.toUpperCase();
  var parts = raw.split(' ');
  if (parts.length < 2) return raw.toUpperCase();
  var last = parts.pop();
  return (last + ', ' + parts.join(' ')).toUpperCase();
}

function corStamp(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return corEsc(value || '');
  return Number(match[2]) + '/' + Number(match[3]) + '/' + match[1];
}

function corDocument(p) {
  var subjects = Array.isArray(p.subjects) ? p.subjects : [];
  var units = 0;
  var rows = subjects.map(function (s) {
    var u = parseFloat(s.units);
    if (!isNaN(u)) units += u;
    return '<tr><td>' + corEsc(s.section) + '</td><td>' + corEsc(s.code) + '</td><td>' + corEsc(s.description) +
      '</td><td class="num">' + corUnits(s.units) + '</td><td>' + corEsc(s.time) + '</td><td>' + corEsc(s.day) + '</td><td>' + corEsc(s.room) + '</td></tr>';
  }).join('');
  var fees = p.fees || {};
  var total = 0;
  var feeRows = COR_FEES.map(function (fee) {
    var amount = parseFloat(fees[fee[0]]) || 0;
    total += amount;
    return '<tr><td>' + corEsc(fee[1]) + '</td><td class="num">' + corMoney(amount) + '</td></tr>';
  }).join('');
  var registrar = String(p.registrar || '').trim();
  return '<article class="cor-doc">' +
    '<div class="cor-top">' +
      '<div class="cor-stamp">' + corStamp(p.issuedOn) + '</div>' +
      '<h1>Certificate of Registration</h1>' +
      '<div class="cor-term">' + corEsc(p.semester || '') + ' SY ' + corEsc(p.schoolYear || '') + '</div>' +
    '</div>' +
    '<div class="cor-idline">' +
      '<span><strong>ID Number :</strong> ' + corEsc(p.studentId) + '</span>' +
      '<span class="cor-name"><strong>Name :</strong> ' + corEsc(p.studentName) + '</span>' +
      '<span>' + corEsc(p.program) + '</span>' +
      '<span class="cor-block">' + corEsc(p.block) + '</span>' +
    '</div>' +
    '<div class="cor-split">' +
      '<table><thead><tr><th>Section</th><th>Subject</th><th>Description</th><th class="num">Unit</th><th>Time</th><th>Day</th><th>Room</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7">No subjects</td></tr>') +
      '<tr><td></td><td></td><td><strong>Total Units</strong></td><td class="num"><strong>' + units.toFixed(2) + '</strong></td><td colspan="3"></td></tr>' +
      '</tbody></table>' +
      '<table><thead><tr><th>Fee</th><th class="num">Amount</th></tr></thead><tbody>' + feeRows +
      '<tr><td><strong>Total Charges</strong></td><td class="num"><strong>' + corMoney(total) + '</strong></td></tr></tbody></table>' +
    '</div>' +
    '<div class="cor-sign">' +
      '<div><div class="cor-sign-name">' + corEsc(registrar) + '</div><div class="cor-line">Registrar II</div></div>' +
      '<div><div class="cor-sign-name"></div><div class="cor-line">Student Signature</div></div>' +
    '</div>' +
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
  document.getElementById('cor-view-year').addEventListener('change', loadStudentCors);
  document.getElementById('cor-view-sem').addEventListener('change', loadStudentCors);
  loadStudentCors();
}

function fillAcademicYears(select, years) {
  var current = select.value;
  select.textContent = '';
  var first = document.createElement('option');
  first.value = '';
  first.textContent = 'All academic years';
  select.appendChild(first);
  (years || []).forEach(function (year) {
    var opt = document.createElement('option');
    opt.value = year;
    opt.textContent = 'AY ' + year;
    select.appendChild(opt);
  });
  if (current && [].some.call(select.options, function (opt) { return opt.value === current; })) select.value = current;
}

function invalidateCorCatalog() {
  corCatalog = null;
  corCatalogPromise = null;
  corCatalogGen++;
}

function fetchCorCatalog() {
  if (corCatalog) return Promise.resolve(corCatalog);
  if (!corCatalogPromise) {
    var requestGen = corCatalogGen;
    corCatalogPromise = PrismRecords.listCors().then(function (data) {
      if (requestGen !== corCatalogGen) return data;
      corCatalog = {
        cors: data.cors || [],
        years: data.years || [],
        capped: !!data.capped
      };
      return corCatalog;
    }).catch(function (err) {
      if (requestGen === corCatalogGen) corCatalogPromise = null;
      throw err;
    });
  }
  return corCatalogPromise;
}

function matchingCors(year, sem, query) {
  var q = (query || '').toLowerCase();
  return (corCatalog.cors || []).filter(function (item) {
    if (year && item.school_year !== year) return false;
    if (sem && item.semester !== sem) return false;
    if (!q) return true;
    var hay = ((item.student_name || '') + ' ' + (item.student_id || '') + ' ' + (item.label || '')).toLowerCase();
    return hay.indexOf(q) !== -1;
  });
}

function loadStudentCors() {
  var year = document.getElementById('cor-view-year').value;
  var sem = document.getElementById('cor-view-sem').value;
  var remote = corCatalog && corCatalog.capped && (year || sem);
  var requestGen = corCatalogGen;
  var pending = remote
    ? PrismRecords.listCors({ school_year: year, semester: sem })
    : fetchCorCatalog();
  pending.then(function (data) {
    if (requestGen !== corCatalogGen) return;
    var years = (corCatalog && corCatalog.years) || data.years || [];
    fillAcademicYears(document.getElementById('cor-view-year'), years);
    var list = remote ? (data.cors || []) : matchingCors(year, sem, '');
    renderCorChoices(list, !!(year && sem), years.length);
  }).catch(function (e) {
    document.getElementById('cor-choices').innerHTML = '<p class="cor-empty">' + corEsc(e.message || 'Could not load certificates') + '</p>';
  });
}

function clearStudentCor() {
  selectedCor = null;
  document.getElementById('cor-print').innerHTML = '';
  var bar = document.getElementById('cor-download-bar');
  if (bar) bar.style.display = 'none';
}

function renderCorChoices(list, openOnlyMatch, yearCount) {
  var host = document.getElementById('cor-choices');
  host.textContent = '';
  if (!list.length) {
    var empty = document.createElement('p');
    empty.className = 'cor-empty';
    empty.textContent = yearCount ? 'No certificate matches that academic year.' : 'No certificate has been sent to you yet.';
    host.appendChild(empty);
    clearStudentCor();
    return;
  }
  var lastYear = null;
  var onlyBtn = null;
  list.forEach(function (item) {
    if (item.school_year !== lastYear) {
      lastYear = item.school_year;
      var head = document.createElement('div');
      head.className = 'cor-year-head';
      head.textContent = 'AY ' + (item.school_year || '');
      host.appendChild(head);
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cor-choice';
    btn.innerHTML = '<strong>' + corEsc(item.semester || item.label) + '</strong><span>Sent ' + corEsc(item.sent_at || '') + '</span>';
    btn.addEventListener('click', function () { openCor(item.id, btn); });
    host.appendChild(btn);
    onlyBtn = btn;
  });
  var ids = list.map(function (item) { return String(item.id); });
  if (selectedCor && ids.indexOf(String(selectedCor.id)) === -1) clearStudentCor();
  if (openOnlyMatch && list.length === 1) openCor(list[0].id, onlyBtn);
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
    input.type = 'text';
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
    return '<div class="cor-field"><label>' + corEsc(fee[1]) + '</label><input id="fee-' + fee[0] + '" type="text" inputmode="decimal" value="' + fee[2] + '"></div>';
  }).join('');
  form.innerHTML =
    '<div class="cor-grid">' +
      '<div class="cor-field full">' +
        '<label>Send to</label>' +
        '<div class="cor-modes">' +
          '<button type="button" class="cor-mode active" id="cor-mode-section">Section</button>' +
          '<button type="button" class="cor-mode" id="cor-mode-student">One student</button>' +
        '</div>' +
        '<div class="cor-pick-filters" id="cor-section-filters">' +
          '<select id="cor-f-college" aria-label="College"><option value="">All colleges</option></select>' +
          '<select id="cor-f-program" aria-label="Program"><option value="">All programs</option></select>' +
          '<select id="cor-f-year" aria-label="Year"><option value="">All years</option></select>' +
          '<select id="cor-f-section" aria-label="Section"><option value="">All sections</option></select>' +
        '</div>' +
        '<div id="cor-one-student" style="display:none;">' +
          '<input id="cor-student-search" type="text" placeholder="Search a name or ID" style="margin-top:.55rem;">' +
          '<div class="cor-people" id="cor-student-matches" style="display:none;"></div>' +
        '</div>' +
        '<p class="cor-pick-count" id="cor-pick-count"></p>' +
        '<div class="cor-people" id="cor-section-people" style="display:none;"></div>' +
      '</div>' +
      '<div class="cor-field" id="cor-name-wrap"><label>Name on certificate</label><input id="cor-name"></div>' +
      '<div class="cor-field"><label for="cor-year">Academic year</label><input id="cor-year" value="2026-2027" placeholder="2026-2027"></div>' +
      '<div class="cor-field"><label>Semester</label><select id="cor-sem"><option>1st Semester</option><option>2nd Semester</option><option>Summer</option></select></div>' +
      '<div class="cor-field"><label>Program</label><input id="cor-program" placeholder="BSIT 3"></div>' +
      '<div class="cor-field"><label>Block</label><input id="cor-block" placeholder="BLK_BSIT-3A_DAY"></div>' +
      '<div class="cor-field"><label>Registrar name</label><input id="cor-registrar" placeholder="Name printed above Registrar II"></div>' +
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
  fillCorFilters();
  document.getElementById('cor-mode-section').addEventListener('click', function () { setSendMode('section'); });
  document.getElementById('cor-mode-student').addEventListener('click', function () { setSendMode('student'); });
  document.getElementById('cor-student-search').addEventListener('input', renderSendTo);
  document.getElementById('cor-f-college').addEventListener('change', function () {
    fillCorPrograms(this.value);
    renderSendTo();
  });
  ['cor-f-program', 'cor-f-year', 'cor-f-section'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', renderSendTo);
  });
  PrismAdmin.getAllUsers().then(function (users) {
    adminStudents = (users || []).filter(function (u) { return u.role === 'student'; });
    adminStudents.forEach(function (s) { s._place = corPlacement(s); });
    setSendMode('section');
  }).catch(function (e) {
    setCorMsg(e.message || 'Could not load students', true);
  });
  document.getElementById('cor-sent-year').addEventListener('change', loadSentCors);
  document.getElementById('cor-sent-sem').addEventListener('change', loadSentCors);
  document.getElementById('cor-sent-q').addEventListener('input', loadSentCors);
  loadSentCors();
}

function corCollegeLabel(code) {
  return COR_COLLEGE_NAMES[code] ? (code + ' — ' + COR_COLLEGE_NAMES[code]) : code;
}

function corPrograms(college) {
  if (college && COR_COLLEGES[college]) return COR_COLLEGES[college].slice();
  var all = [];
  Object.keys(COR_COLLEGES).forEach(function (code) {
    COR_COLLEGES[code].forEach(function (program) {
      if (all.indexOf(program) === -1) all.push(program);
    });
  });
  return all;
}

function fillCorSelect(select, values, placeholder, labeler) {
  var current = select.value;
  select.textContent = '';
  var first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  select.appendChild(first);
  values.forEach(function (value) {
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = labeler ? labeler(value) : value;
    select.appendChild(opt);
  });
  if (current && values.indexOf(current) !== -1) select.value = current;
}

function fillCorPrograms(college) {
  fillCorSelect(document.getElementById('cor-f-program'), corPrograms(college), 'All programs');
}

function fillCorFilters() {
  fillCorSelect(document.getElementById('cor-f-college'), Object.keys(COR_COLLEGES), 'All colleges', corCollegeLabel);
  fillCorPrograms('');
  fillCorSelect(document.getElementById('cor-f-year'), ['1', '2', '3', '4'], 'All years', function (year) { return 'Year ' + year; });
  fillCorSelect(document.getElementById('cor-f-section'), ['A', 'B', 'C', 'D', 'E', 'F'], 'All sections');
}

function corPlacement(student) {
  var match = String(student.section || '').match(/^(.*) ([1-4])-([A-F])$/);
  if (!match) return { college: '', program: '', year: '', section: '' };
  var program = match[1];
  var college = '';
  Object.keys(COR_COLLEGES).forEach(function (code) {
    if (COR_COLLEGES[code].indexOf(program) !== -1) college = code;
  });
  return { college: college, program: program, year: match[2], section: match[3] };
}

function setSendMode(mode) {
  sendMode = mode === 'student' ? 'student' : 'section';
  document.getElementById('cor-mode-section').classList.toggle('active', sendMode === 'section');
  document.getElementById('cor-mode-student').classList.toggle('active', sendMode === 'student');
  document.getElementById('cor-section-filters').style.display = sendMode === 'section' ? '' : 'none';
  document.getElementById('cor-one-student').style.display = sendMode === 'student' ? '' : 'none';
  document.getElementById('cor-name-wrap').style.display = sendMode === 'student' ? '' : 'none';
  var irregularBtn = document.getElementById('cor-send-irregular');
  if (irregularBtn && sendMode !== 'section') irregularBtn.style.display = 'none';
  var btn = document.getElementById('cor-send-btn');
  if (btn && btn.getAttribute('data-prism-busy') !== '1') btn.textContent = sendMode === 'section' ? 'Send to section' : 'Send to student';
  renderSendTo();
}

function filteredStudents() {
  var college = document.getElementById('cor-f-college').value;
  var program = document.getElementById('cor-f-program').value;
  var year = document.getElementById('cor-f-year').value;
  var section = document.getElementById('cor-f-section').value;
  return adminStudents.filter(function (student) {
    var place = student._place || corPlacement(student);
    if (college && place.college !== college) return false;
    if (program && place.program !== program) return false;
    if (year && place.year !== year) return false;
    if (section && place.section !== section) return false;
    return true;
  });
}

function sectionReady() {
  return !!(document.getElementById('cor-f-program').value && document.getElementById('cor-f-year').value && document.getElementById('cor-f-section').value);
}

function applySectionDefaults() {
  if (!sectionReady()) return;
  var program = document.getElementById('cor-f-program').value;
  var year = document.getElementById('cor-f-year').value;
  var section = document.getElementById('cor-f-section').value;
  var programText = program + ' ' + year;
  var blockText = program + ' ' + year + '-' + section;
  var programEl = document.getElementById('cor-program');
  var blockEl = document.getElementById('cor-block');
  if (!programEl.value || programEl.value === lastAutoProgram) {
    programEl.value = programText;
    lastAutoProgram = programText;
  }
  if (!blockEl.value || blockEl.value === lastAutoBlock) {
    blockEl.value = blockText;
    lastAutoBlock = blockText;
  }
}

function renderSendTo() {
  var count = document.getElementById('cor-pick-count');
  var people = document.getElementById('cor-section-people');
  var matches = document.getElementById('cor-student-matches');
  if (sendMode === 'student') {
    people.style.display = 'none';
    var query = document.getElementById('cor-student-search').value.trim().toLowerCase();
    matches.textContent = '';
    if (!query) {
      matches.style.display = 'none';
      var chosen = adminStudents.filter(function (s) { return s.id === selectedStudentId; })[0];
      count.textContent = chosen ? (corOfficialName(chosen.name || '') + ' · ' + chosen.id) : 'Search for one student.';
      return;
    }
    var hits = adminStudents.filter(function (student) {
      var hay = ((student.name || '') + ' ' + student.id).toLowerCase();
      return hay.indexOf(query) !== -1;
    }).slice(0, 8);
    matches.style.display = hits.length ? 'block' : 'none';
    hits.forEach(function (student) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cor-match' + (student.id === selectedStudentId ? ' active' : '');
      var place = student._place || corPlacement(student);
      var sec = place.program && place.year && place.section ? (place.program + ' ' + place.year + '-' + place.section) : (student.section || '');
      btn.textContent = corOfficialName(student.name || student.id) + ' · ' + student.id + (sec ? ' · ' + sec : '');
      btn.addEventListener('click', function () { chooseOneStudent(student.id); });
      matches.appendChild(btn);
    });
    count.textContent = hits.length ? 'Pick a student from the matches.' : 'No student matches that search.';
    return;
  }
  matches.style.display = 'none';
  applySectionDefaults();
  if (!sectionReady()) {
    people.style.display = 'none';
    people.textContent = '';
    count.textContent = 'Choose a program, year, and section. Everyone in that section gets the same subjects.';
    return;
  }
  var rows = filteredStudents();
  var regular = rows.filter(function (s) { return !irregularIds[s.id]; });
  var leftOut = rows.length - regular.length;
  people.style.display = rows.length ? 'block' : 'none';
  people.textContent = '';
  rows.forEach(function (student) {
    var row = document.createElement('div');
    row.className = 'cor-person';
    var text = document.createElement('div');
    var name = document.createElement('b');
    name.textContent = corOfficialName(student.name || student.id);
    var id = document.createElement('small');
    id.textContent = student.id;
    text.appendChild(name);
    text.appendChild(id);
    var label = document.createElement('label');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!irregularIds[student.id];
    box.addEventListener('change', function () {
      if (box.checked) irregularIds[student.id] = true;
      else delete irregularIds[student.id];
      renderSendTo();
    });
    label.appendChild(box);
    label.appendChild(document.createTextNode(' Irregular'));
    row.appendChild(text);
    row.appendChild(label);
    people.appendChild(row);
  });
  var group = document.getElementById('cor-f-program').value + ' ' + document.getElementById('cor-f-year').value + '-' + document.getElementById('cor-f-section').value;
  if (!rows.length) count.textContent = 'No students are in ' + group + '.';
  else count.textContent = regular.length + ' student' + (regular.length === 1 ? '' : 's') + ' in ' + group + ' will get this certificate.' + (leftOut ? ' ' + leftOut + ' irregular ' + (leftOut === 1 ? 'student is' : 'students are') + ' left out.' : '');
  var irregularBtn = document.getElementById('cor-send-irregular');
  if (irregularBtn) irregularBtn.style.display = sendMode === 'section' && leftOut ? '' : 'none';
}

function chooseOneStudent(id) {
  selectedStudentId = id;
  var student = adminStudents.filter(function (s) { return s.id === id; })[0];
  if (!student) return;
  var name = document.getElementById('cor-name');
  name.value = corOfficialName(student.name || '');
  lastAutoName = name.value;
  var place = student._place || corPlacement(student);
  if (place.program && place.year) {
    var programEl = document.getElementById('cor-program');
    var blockEl = document.getElementById('cor-block');
    var programText = place.program + ' ' + place.year;
    var blockText = place.section ? (programText + '-' + place.section) : programText;
    if (!programEl.value || programEl.value === lastAutoProgram) {
      programEl.value = programText;
      lastAutoProgram = programText;
    }
    if (!blockEl.value || blockEl.value === lastAutoBlock) {
      blockEl.value = blockText;
      lastAutoBlock = blockText;
    }
  }
  document.getElementById('cor-student-search').value = '';
  renderSendTo();
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

function recipients() {
  if (sendMode === 'student') return selectedStudentId ? [selectedStudentId] : [];
  if (!sectionReady()) return [];
  return filteredStudents().filter(function (s) { return !irregularIds[s.id]; }).map(function (s) { return s.id; });
}

function collectCor() {
  var ids = recipients();
  return {
    student_id: ids.length === 1 ? ids[0] : '',
    student_ids: ids,
    student_name: sendMode === 'student' ? document.getElementById('cor-name').value.trim() : '',
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
  var body = collectCor();
  var payload = previewPayload(body);
  if (sendMode === 'section' && body.student_ids && body.student_ids.length) {
    var sample = adminStudents.filter(function (s) { return s.id === body.student_ids[0]; })[0];
    if (sample) {
      payload.studentName = corOfficialName(sample.name || '');
      payload.studentId = sample.id;
    }
  }
  document.getElementById('cor-print').innerHTML = corDocument(payload);
}

function setCorMsg(text, isError) {
  var el = document.getElementById('cor-msg');
  el.textContent = text || '';
  el.className = 'cor-msg' + (text ? (isError ? ' err' : ' ok') : '');
}

async function sendIrregular() {
  if (!sectionReady()) {
    setCorMsg('Choose a program, year, and section first.', true);
    return;
  }
  var ids = filteredStudents().filter(function (s) { return irregularIds[s.id]; }).map(function (s) { return s.id; });
  if (!ids.length) {
    setCorMsg('Mark the irregular students in this section first.', true);
    return;
  }
  var body = collectCor();
  body.student_ids = ids;
  body.student_id = ids.length === 1 ? ids[0] : '';
  body.student_name = '';
  await deliverCor(body, document.getElementById('cor-send-irregular'));
}

async function sendCor() {
  var body = collectCor();
  if (!body.student_ids.length) {
    setCorMsg(sendMode === 'section' ? 'Choose a program, year, and section that still has students to send to.' : 'Search for a student first.', true);
    return;
  }
  await deliverCor(body, document.getElementById('cor-send-btn'));
}

async function deliverCor(body, sendBtn) {
  if (typeof prismSetBusy === 'function') prismSetBusy(sendBtn, true, 'Sending…');
  setCorMsg('Sending…', false);
  try {
    var res = await PrismRecords.sendCor(body);
    var n = res && res.count ? res.count : (body.student_ids || []).length;
    setCorMsg('Sent ' + (res.label || 'certificate') + ' to ' + n + (n === 1 ? ' student.' : ' students.'), false);
    previewAdminCor();
    invalidateCorCatalog();
    loadSentCors();
  } catch (e) {
    setCorMsg(e.message || 'Could not send the certificate', true);
  } finally {
    if (typeof prismSetBusy === 'function') prismSetBusy(sendBtn, false);
  }
}

function loadSentCors() {
  var yearEl = document.getElementById('cor-sent-year');
  var semEl = document.getElementById('cor-sent-sem');
  var qEl = document.getElementById('cor-sent-q');
  var year = yearEl.value;
  var sem = semEl.value;
  var query = qEl.value.trim();
  var remote = corCatalog && corCatalog.capped && (year || sem || query);
  var requestGen = corCatalogGen;
  var pending = remote
    ? PrismRecords.listCors({ school_year: year, semester: sem, q: query })
    : fetchCorCatalog();
  pending.then(function (data) {
    if (requestGen !== corCatalogGen) return;
    var years = (corCatalog && corCatalog.years) || data.years || [];
    fillAcademicYears(yearEl, years);
    var host = document.getElementById('cor-sent');
    var list = remote ? (data.cors || []) : matchingCors(year, sem, query);
    data.years = years;
    host.textContent = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'cor-empty';
      empty.textContent = (data.years || []).length ? 'No certificate matches those filters.' : 'No certificates have been sent yet.';
      host.appendChild(empty);
      return;
    }
    var lastYear = null;
    list.forEach(function (item) {
      if (item.school_year !== lastYear) {
        lastYear = item.school_year;
        var head = document.createElement('div');
        head.className = 'cor-year-head';
        head.textContent = 'AY ' + (item.school_year || '');
        host.appendChild(head);
      }
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'sent-row';
      row.style.width = '100%';
      row.style.background = 'none';
      row.style.border = 'none';
      row.style.cursor = 'pointer';
      row.style.fontFamily = 'inherit';
      row.style.color = 'inherit';
      row.style.textAlign = 'left';
      var detail = [item.semester, item.student_id].filter(Boolean).join(' · ');
      row.innerHTML = '<strong>' + corEsc(item.student_name || item.student_id) + '</strong><span>' + corEsc(detail) + '</span>';
      row.addEventListener('click', function () { editSentCor(item.id); });
      host.appendChild(row);
    });
  }).catch(function () {});
}

async function editSentCor(id) {
  var cor = await PrismRecords.getCor(id);
  var p = cor.payload || {};
  document.getElementById('cor-student-search').value = '';
  document.getElementById('cor-f-college').value = '';
  fillCorPrograms('');
  document.getElementById('cor-f-year').value = '';
  document.getElementById('cor-f-section').value = '';
  selectedStudentId = cor.student_id || '';
  setSendMode('student');
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
