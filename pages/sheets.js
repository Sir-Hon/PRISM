/** Attendance and assessment sheets on records.html. */
var sheetStudentId = '';
var attendanceData = null;
var assessmentData = null;
var saveTimer = null;
var sheetLoadToken = 0;

function sheetEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function schoolMonths(yearLabel) {
  var match = String(yearLabel || '').match(/(\d{4})\s*-\s*(\d{4})/);
  var y1 = match ? parseInt(match[1], 10) : 2026;
  var y2 = match ? parseInt(match[2], 10) : y1 + 1;
  var names = ['June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
  var nums = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  return names.map(function (name, i) {
    return { name: name, month: nums[i], year: nums[i] >= 6 ? y1 : y2 };
  });
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function weekdayLetter(year, month, day) {
  return ['Su', 'M', 'T', 'W', 'TH', 'F', 'Sa'][new Date(year, month - 1, day).getDay()];
}

function quarterLabel(i) {
  var names = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
  return names[i] || ((i + 1) + 'th');
}

function defaultSheetTables() {
  return [
    { id: 'ww', title: 'Written Works', part: 'ww', count: 10 },
    { id: 'pt', title: 'Performance Task', part: 'pt', count: 10 },
    { id: 'qz', title: 'Quizzes', part: 'qz', count: 6 },
    { id: 'rec', title: 'Recitation / Assignments (Oral)', part: 'rec', count: 6 }
  ];
}

function sheetPartKey(part) {
  return String(part || '').replace(/[^a-z0-9_]/gi, '').slice(0, 24);
}

function splitWeights(count) {
  var out = [];
  if (!(count > 0)) return out;
  var used = 0;
  for (var i = 0; i < count; i++) {
    var share = i === count - 1
      ? Math.round((100 - used) * 10) / 10
      : Math.floor((100 / count) * 10) / 10;
    out.push(share);
    used += share;
  }
  return out;
}

function sheetPercentText(raw) {
  if (raw == null || raw === '') return '';
  var n = parseFloat(raw);
  if (!isFinite(n) || n < 0) return '';
  if (n > 100) n = 100;
  return String(Math.round(n * 10) / 10);
}

function normalizeSheetTable(raw, i) {
  var part = sheetPartKey(raw && raw.part) || ('t' + i);
  var count = parseInt(raw && raw.count, 10);
  if (!(count >= 1)) count = 1;
  if (count > 20) count = 20;
  return {
    id: sheetPartKey(raw && raw.id) || part,
    title: String((raw && raw.title) || 'Table').slice(0, 80),
    part: part,
    count: count,
    weight: sheetPercentText(raw && raw.weight)
  };
}

function blankQuarterFor(tables) {
  var q = { exam: '', signature: '' };
  (tables || defaultSheetTables()).forEach(function (table) {
    q[table.part + 'Hps'] = '';
    q[table.part] = padScores([], table.count);
  });
  return q;
}

function ensureQuarterShape(q, tables) {
  var out = {
    exam: q && q.exam != null ? String(q.exam) : '',
    signature: q && q.signature != null ? String(q.signature) : ''
  };
  (tables || []).forEach(function (table) {
    out[table.part + 'Hps'] = q && q[table.part + 'Hps'] != null ? String(q[table.part + 'Hps']) : '';
    out[table.part] = padScores(q && q[table.part], table.count);
  });
  return out;
}

function attendanceMonthRows(yearLabel) {
  return schoolMonths(yearLabel).map(function (m, i) {
    return { id: 'cal-' + i + '-' + m.month, name: m.name, year: m.year, month: m.month };
  });
}

function attendanceRows(data) {
  if (data && Array.isArray(data.rows) && data.rows.length) {
    return data.rows.map(function (row, i) {
      return {
        id: String((row && row.id) || ('row-' + i)),
        name: String((row && row.name) || 'Row'),
        year: parseInt(row && row.year, 10) || 0,
        month: parseInt(row && row.month, 10) || 0
      };
    });
  }
  return attendanceMonthRows(data && data.year);
}

function markKey(row, day) {
  if (row.year && row.month) return row.year + '-' + row.month + '-' + day;
  return row.id + '-' + day;
}

function padScores(arr, n) {
  var out = Array.isArray(arr) ? arr.slice(0, n) : [];
  while (out.length < n) out.push('');
  return out.map(function (v) { return v == null ? '' : String(v); });
}

function blankAttendance(student) {
  var cls = (typeof getClasses === 'function' ? getClasses() : []).filter(function (c) { return c.id === activeClassId; })[0];
  return {
    name: student ? student.name : '',
    section: student ? (student.section || '') : '',
    subject: cls ? (cls.subject || '') : '',
    tracker: '',
    year: '2026-2027',
    marks: {}
  };
}

function blankAssessment(student) {
  var base = blankAttendance(student);
  var tables = defaultSheetTables();
  var shares = splitWeights(tables.length);
  tables.forEach(function (table, i) { table.weight = String(shares[i]); });
  return {
    name: base.name,
    section: base.section,
    subject: base.subject,
    tracker: '',
    year: '2026-2027',
    tables: tables,
    quarters: [blankQuarterFor(tables), blankQuarterFor(tables), blankQuarterFor(tables), blankQuarterFor(tables)],
    remarks: '',
    units: '',
    scheduleDays: { M: false, T: false, W: false, TH: false, F: false },
    scheduleTime: ''
  };
}

function selectedStudent() {
  var students = typeof getStudents === 'function' ? getStudents(activeClassId) : [];
  for (var i = 0; i < students.length; i++) {
    if (students[i].id === sheetStudentId) return students[i];
  }
  return null;
}

function sheetRoster() {
  var students = typeof getStudents === 'function' ? getStudents(activeClassId) : [];
  return students.slice().sort(function (a, b) {
    var byName = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    if (byName) return byName;
    return String(a.id).localeCompare(String(b.id));
  });
}

function updateSheetNav() {
  var students = sheetRoster();
  var idx = -1;
  for (var i = 0; i < students.length; i++) {
    if (String(students[i].id) === String(sheetStudentId)) { idx = i; break; }
  }
  var prev = document.getElementById('sheet-prev');
  var next = document.getElementById('sheet-next');
  if (prev) prev.disabled = !students.length || idx <= 0;
  if (next) next.disabled = !students.length || idx === students.length - 1;
}

async function stepSheetStudent(dir) {
  var students = sheetRoster();
  if (!students.length) return;
  var idx = -1;
  for (var i = 0; i < students.length; i++) {
    if (String(students[i].id) === String(sheetStudentId)) { idx = i; break; }
  }
  var nextIdx = idx < 0 ? (dir < 0 ? -1 : 0) : idx + dir;
  if (nextIdx < 0 || nextIdx >= students.length) return;
  await flushSave();
  sheetStudentId = students[nextIdx].id;
  var sel = document.getElementById('sheet-student');
  if (sel) sel.value = sheetStudentId;
  updateSheetNav();
  await loadCurrentSheet();
}

function refreshSheetBar() {
  var sel = document.getElementById('sheet-student');
  if (!sel) return;
  var students = sheetRoster();
  var prev = sheetStudentId || sel.value;
  sel.innerHTML = '';
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = students.length ? 'Choose a student' : 'No students in this class';
  sel.appendChild(placeholder);
  students.forEach(function (s) {
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name + (s.section ? ' · ' + s.section : '');
    sel.appendChild(opt);
  });
  var keep = students.some(function (s) { return s.id === prev; });
  sheetStudentId = keep ? prev : '';
  sel.value = sheetStudentId;
  updateSheetNav();
}

function sheetStatus(text) {
  var el = document.getElementById('sheet-status');
  if (el) el.textContent = text || '';
}

function sheetLocalKey(kind, classId, studentId) {
  return 'prism_sheet_' + kind + '_' + classId + '_' + studentId;
}

function readLocalSheet(kind, classId, studentId) {
  try {
    return JSON.parse(localStorage.getItem(sheetLocalKey(kind, classId, studentId)) || 'null');
  } catch (e) {
    return null;
  }
}

function applyAttendance(saved, student) {
  var base = blankAttendance(student);
  if (!saved || typeof saved !== 'object') return base;
  base.name = saved.name != null ? String(saved.name) : base.name;
  base.section = saved.section != null ? String(saved.section) : base.section;
  base.subject = saved.subject != null ? String(saved.subject) : base.subject;
  base.tracker = saved.tracker != null ? String(saved.tracker) : '';
  base.year = saved.year ? String(saved.year) : base.year;
  base.marks = saved.marks && typeof saved.marks === 'object' ? saved.marks : {};
  if (Array.isArray(saved.rows) && saved.rows.length) base.rows = attendanceRows(saved);
  return base;
}

function applyAssessment(saved, student) {
  var base = blankAssessment(student);
  if (!saved || typeof saved !== 'object') return base;
  base.name = saved.name != null ? String(saved.name) : base.name;
  base.section = saved.section != null ? String(saved.section) : base.section;
  base.subject = saved.subject != null ? String(saved.subject) : base.subject;
  base.tracker = saved.tracker != null ? String(saved.tracker) : '';
  base.year = saved.year ? String(saved.year) : base.year;
  base.remarks = saved.remarks != null ? String(saved.remarks) : '';
  base.scheduleTime = saved.scheduleTime != null ? String(saved.scheduleTime) : '';
  var days = saved.scheduleDays || {};
  ['M', 'T', 'W', 'TH', 'F'].forEach(function (d) { base.scheduleDays[d] = !!days[d]; });
  var tables = Array.isArray(saved.tables) && saved.tables.length
    ? saved.tables.map(normalizeSheetTable)
    : defaultSheetTables();
  var seen = {};
  base.tables = tables.filter(function (table) {
    if (seen[table.part]) return false;
    seen[table.part] = true;
    return true;
  });
  if (base.tables.length && !base.tables.some(function (table) { return table.weight !== ''; })) {
    var shares = splitWeights(base.tables.length);
    base.tables.forEach(function (table, i) { table.weight = String(shares[i]); });
  }
  base.units = saved && saved.units != null ? String(saved.units).replace(/[^0-9.]/g, '').slice(0, 6) : '';
  var source = Array.isArray(saved.quarters) && saved.quarters.length ? saved.quarters.slice(0, 8) : [{}, {}, {}, {}];
  base.quarters = source.map(function (q) { return ensureQuarterShape(q || {}, base.tables); });
  if (!base.quarters.length) base.quarters = [ensureQuarterShape({}, base.tables)];
  return base;
}

function renderActiveSheet() {
  refreshSheetBar();
  loadCurrentSheet();
}

async function onSheetStudentChange() {
  var sel = document.getElementById('sheet-student');
  var next = sel ? sel.value : '';
  await flushSave();
  sheetStudentId = next;
  await loadCurrentSheet();
}

async function loadCurrentSheet() {
  var kind = activeView === 'assessment' ? 'assessment' : 'attendance';
  var host = document.getElementById(kind === 'attendance' ? 'attendance-sheet' : 'assessment-sheet');
  if (!host) return;
  var student = selectedStudent();
  if (!activeClassId || !sheetStudentId || !student) {
    host.innerHTML = '<div class="paper" style="color:#6b7280;">Choose a student to open attendance and assessment.</div>';
    attendanceData = null;
    assessmentData = null;
    return;
  }
  var token = ++sheetLoadToken;
  var classId = activeClassId;
  var studentId = sheetStudentId;
  var saved = readLocalSheet(kind, classId, studentId);
  if (typeof PrismRecords !== 'undefined') {
    try {
      var res = await PrismRecords.getSheet(classId, studentId, kind);
      if (token !== sheetLoadToken) return;
      if (res && res.sheet) saved = res.sheet;
    } catch (e) {
      if (token !== sheetLoadToken) return;
      sheetStatus('Showing the copy saved on this browser');
    }
  }
  if (token !== sheetLoadToken || activeClassId !== classId || sheetStudentId !== studentId) return;
  if (kind === 'attendance') {
    attendanceData = applyAttendance(saved, student);
    renderAttendance();
  } else {
    assessmentData = applyAssessment(saved, student);
    renderAssessment();
  }
  var statusEl = document.getElementById('sheet-status');
  if (statusEl && !statusEl.textContent) sheetStatus(saved ? 'Saved' : '');
}

function headerFields(data) {
  return '<div class="paper-head">' +
    '<div><label>Name</label><input data-field="name" value="' + sheetEsc(data.name) + '"></div>' +
    '<div><label>Grade &amp; Section</label><input data-field="section" value="' + sheetEsc(data.section) + '"></div>' +
    '<div><label>Subject</label><input data-field="subject" value="' + sheetEsc(data.subject) + '"></div>' +
    '<div><label>Tracker</label><input data-field="tracker" value="' + sheetEsc(data.tracker) + '"></div>' +
    '</div>';
}

function bindHeader(root, data, rerender) {
  root.querySelectorAll('[data-field]').forEach(function (input) {
    input.addEventListener('input', function () {
      data[input.getAttribute('data-field')] = input.value;
      scheduleSave();
    });
    if (input.getAttribute('data-field') === 'year') {
      input.addEventListener('change', function () {
        data.year = input.value;
        if (rerender) rerender();
      });
    }
  });
}

function countRowPresent(marks, row) {
  var n = 0;
  for (var day = 1; day <= 31; day++) {
    if ((marks || {})[markKey(row, day)] === 'P') n++;
  }
  return n;
}

function materializeAttendanceRows() {
  if (!attendanceData) return;
  if (!Array.isArray(attendanceData.rows) || !attendanceData.rows.length) {
    attendanceData.rows = attendanceRows(attendanceData);
  }
}

function shiftCalendarYears(data) {
  if (!data || !Array.isArray(data.rows)) return;
  var byMonth = {};
  schoolMonths(data.year).forEach(function (month) { byMonth[month.month] = month; });
  data.rows.forEach(function (row) {
    if (!row.year || !row.month || !byMonth[row.month]) return;
    var next = byMonth[row.month];
    if (next.year === row.year) return;
    for (var day = 1; day <= 31; day++) {
      var oldKey = row.year + '-' + row.month + '-' + day;
      var newKey = next.year + '-' + row.month + '-' + day;
      if (data.marks[oldKey] != null && data.marks[newKey] == null) data.marks[newKey] = data.marks[oldKey];
      delete data.marks[oldKey];
    }
    row.year = next.year;
  });
}

function addAttendanceRow() {
  if (!attendanceData) return;
  materializeAttendanceRows();
  if (attendanceData.rows.length >= 16) return;
  attendanceData.rows.push({ id: 'r' + Date.now(), name: 'New row', year: 0, month: 0 });
  renderAttendance();
  scheduleSave();
}

function deleteAttendanceRow(id) {
  if (!attendanceData) return;
  materializeAttendanceRows();
  if (attendanceData.rows.length <= 1) return;
  var row = null;
  attendanceData.rows.forEach(function (item) { if (item.id === id) row = item; });
  attendanceData.rows = attendanceData.rows.filter(function (item) { return item.id !== id; });
  if (row) {
    for (var day = 1; day <= 31; day++) delete attendanceData.marks[markKey(row, day)];
  }
  renderAttendance();
  scheduleSave();
}

function renderAttendance() {
  var host = document.getElementById('attendance-sheet');
  var data = attendanceData;
  if (!host || !data) return;
  var rows = attendanceRows(data);
  var head = '<tr><th>Month</th>';
  for (var d = 1; d <= 31; d++) head += '<th>' + d + '</th>';
  head += '<th>Total</th></tr>';
  var body = rows.map(function (row, mi) {
    var cells = '';
    var calendar = row.year && row.month;
    var max = calendar ? daysInMonth(row.year, row.month) : 31;
    for (var day = 1; day <= 31; day++) {
      if (day > max) {
        cells += '<td class="mark-cell invalid"></td>';
        continue;
      }
      var key = markKey(row, day);
      var val = data.marks[key] || '';
      var letter = calendar ? weekdayLetter(row.year, row.month, day) : '';
      var weekend = letter === 'Su' || letter === 'Sa' ? ' weekend' : '';
      cells += '<td class="mark-cell' + weekend + '">' +
        (letter ? '<span class="wd">' + letter + '</span>' : '') +
        '<input class="mark-inp mk-' + sheetEsc(String(val).toLowerCase()) + '" maxlength="1" data-mark="' + sheetEsc(key) + '" value="' + sheetEsc(val) + '"></td>';
    }
    return '<tr><th class="month"><span class="month-edit"><input class="month-name" data-row-name="' + sheetEsc(row.id) + '" value="' + sheetEsc(row.name) + '" aria-label="Row name">' +
      (rows.length > 1 ? '<button type="button" class="row-x" data-del-row="' + sheetEsc(row.id) + '" aria-label="Delete row">&times;</button>' : '') +
      '</span></th>' + cells +
      '<td class="att-total" id="att-total-' + mi + '">' + countRowPresent(data.marks, row) + '</td></tr>';
  }).join('');
  host.innerHTML =
    '<div class="paper">' +
      '<div class="paper-title">Individual Attendance Record</div>' +
      '<div class="paper-year">Academic year <input data-field="year" value="' + sheetEsc(data.year) + '" style="width:7.2rem;border:1px solid #e7d5ee;border-radius:8px;padding:.2rem .4rem;font-family:inherit;color:#1f1630;"></div>' +
      headerFields(data) +
      '<div class="legend"><span><b>P</b> Present</span><span><b>A</b> Absent</span><span><b>L</b> Late</span><span><b>H</b> Holiday</span><span>Total counts days marked present. Weekend boxes are shaded.</span></div>' +
      '<div class="att-scroll"><table class="att-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="sheet-actions"><button type="button" class="sheet-tool" id="add-att-row">+ Add a row</button></div>' +
    '</div>';
  bindHeader(host, data, function () {
    shiftCalendarYears(data);
    renderAttendance();
  });
  var addRow = document.getElementById('add-att-row');
  if (addRow) addRow.addEventListener('click', addAttendanceRow);
  host.querySelectorAll('[data-del-row]').forEach(function (btn) {
    btn.addEventListener('click', function () { deleteAttendanceRow(btn.getAttribute('data-del-row')); });
  });
  host.querySelectorAll('[data-row-name]').forEach(function (input) {
    input.addEventListener('input', function () {
      materializeAttendanceRows();
      var id = input.getAttribute('data-row-name');
      data.rows.forEach(function (row) {
        if (row.id === id) row.name = input.value;
      });
      scheduleSave();
    });
  });
  host.querySelectorAll('[data-mark]').forEach(function (input) {
    input.addEventListener('input', function () {
      var v = input.value.toUpperCase().replace(/[^PALH]/g, '').slice(0, 1);
      input.value = v;
      input.className = 'mark-inp' + (v ? ' mk-' + v.toLowerCase() : '');
      var key = input.getAttribute('data-mark');
      if (v) data.marks[key] = v;
      else delete data.marks[key];
      attendanceRows(data).forEach(function (row, mi) {
        var cell = document.getElementById('att-total-' + mi);
        if (cell) cell.textContent = String(countRowPresent(data.marks, row));
      });
      scheduleSave();
    });
  });
}

function sumList(arr) {
  var n = 0;
  var any = false;
  (arr || []).forEach(function (v) {
    if (v === '' || v == null) return;
    var x = parseFloat(v);
    if (!isNaN(x)) { n += x; any = true; }
  });
  return any ? n : null;
}

function partPct(scores, hps) {
  var total = sumList(scores);
  var h = parseFloat(hps);
  if (total == null || !(h > 0)) return null;
  return (total / h) * 100;
}

function weightedQuarter(q, tables, pctOf) {
  var scored = [];
  var anyWeight = false;
  (tables || []).forEach(function (table) {
    var weight = parseFloat(table && table.weight);
    if (isFinite(weight) && weight > 0) anyWeight = true;
    var pct = pctOf(q[table.part], q[table.part + 'Hps']);
    if (pct == null || !isFinite(pct) || !(weight > 0)) return;
    scored.push({ pct: pct, weight: weight });
  });
  if (!anyWeight) {
    var plain = (tables || []).map(function (table) {
      return pctOf(q[table.part], q[table.part + 'Hps']);
    }).filter(function (n) { return n != null && isFinite(n); });
    if (!plain.length) return null;
    return plain.reduce(function (a, b) { return a + b; }, 0) / plain.length;
  }
  if (!scored.length) return null;
  var weightSum = 0;
  var weighted = 0;
  scored.forEach(function (row) {
    weightSum += row.weight;
    weighted += row.pct * row.weight;
  });
  return weightSum > 0 ? weighted / weightSum : null;
}

function quarterAverage(q) {
  var tables = assessmentData && assessmentData.tables && assessmentData.tables.length
    ? assessmentData.tables
    : defaultSheetTables();
  return weightedQuarter(q, tables, partPct);
}

function weightTotal(tables) {
  var total = 0;
  (tables || []).forEach(function (table) {
    var weight = parseFloat(table && table.weight);
    if (isFinite(weight) && weight > 0) total += weight;
  });
  return total;
}

function unitEstimate(data) {
  var grade = finalAverage(data);
  var units = parseFloat(data && data.units);
  if (grade == null || !(units > 0)) return null;
  return (grade / 100) * units;
}

function finalAverage(data) {
  var nums = data.quarters.map(quarterAverage).filter(function (n) { return n != null; });
  if (!nums.length) return null;
  return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
}

function fmtNum(n) {
  if (n == null || !isFinite(n)) return '';
  var r = Math.round(n * 100) / 100;
  return String(r);
}

function scoreInputs(qIndex, part, count) {
  var html = '';
  for (var i = 0; i < count; i++) {
    html += '<td><input class="box-inp" inputmode="decimal" data-q="' + qIndex + '" data-part="' + part + '" data-i="' + i + '" value="' + sheetEsc(assessmentData.quarters[qIndex][part][i]) + '"></td>';
  }
  return html;
}

function findSheetTable(part) {
  var tables = assessmentData && assessmentData.tables ? assessmentData.tables : [];
  for (var i = 0; i < tables.length; i++) {
    if (tables[i].part === part) return tables[i];
  }
  return null;
}

function componentTable(table) {
  var part = table.part;
  var count = table.count;
  var heads = '<tr><th>Quarter</th><th>HPS</th>';
  for (var i = 1; i <= count; i++) {
    heads += '<th><span>' + i + '</span>' +
      (count > 1 ? '<button type="button" class="col-x" data-del-col="' + sheetEsc(part) + '" data-col="' + (i - 1) + '" aria-label="Delete column">&times;</button>' : '') +
      '</th>';
  }
  heads += '<th>Total</th></tr>';
  var rows = assessmentData.quarters.map(function (q, qi) {
    return '<tr><th class="q-name"><span>' + quarterLabel(qi) + '</span>' +
      (assessmentData.quarters.length > 1 ? '<button type="button" class="row-x" data-del-q="' + qi + '" aria-label="Delete row">&times;</button>' : '') +
      '</th>' +
      '<td><input class="box-inp" inputmode="decimal" data-q="' + qi + '" data-part="' + sheetEsc(part) + 'Hps" value="' + sheetEsc(q[part + 'Hps']) + '"></td>' +
      scoreInputs(qi, part, count) +
      '<td class="score-total" id="' + part + '-total-' + qi + '">' + fmtNum(sumList(q[part])) + '</td></tr>';
  }).join('');
  return '<div class="sheet-block"><div class="sheet-block-head"><h3><input class="sheet-title" data-table-title="' + sheetEsc(part) + '" value="' + sheetEsc(table.title) + '" aria-label="Table name"></h3>' +
    '<button type="button" class="sheet-tool" data-add-col="' + sheetEsc(part) + '">+ Column</button>' +
    '<button type="button" class="sheet-tool danger" data-del-table="' + sheetEsc(part) + '">Delete table</button></div>' +
    '<div class="score-scroll"><table class="score-table"><thead>' + heads + '</thead><tbody>' + rows + '</tbody></table></div></div>';
}

function addAssessmentRow() {
  if (!assessmentData || assessmentData.quarters.length >= 8) return;
  assessmentData.quarters.push(ensureQuarterShape({}, assessmentData.tables));
  renderAssessment();
  scheduleSave();
}

function deleteAssessmentRow(index) {
  if (!assessmentData || assessmentData.quarters.length <= 1) return;
  assessmentData.quarters.splice(index, 1);
  renderAssessment();
  scheduleSave();
}

function addAssessmentColumn(part) {
  var table = findSheetTable(part);
  if (!table || table.count >= 20) return;
  table.count += 1;
  assessmentData.quarters.forEach(function (q) {
    if (!Array.isArray(q[part])) q[part] = [];
    q[part].push('');
  });
  renderAssessment();
  scheduleSave();
}

function deleteAssessmentColumn(part, index) {
  var table = findSheetTable(part);
  if (!table || table.count <= 1) return;
  table.count -= 1;
  assessmentData.quarters.forEach(function (q) {
    if (Array.isArray(q[part])) q[part].splice(index, 1);
  });
  renderAssessment();
  scheduleSave();
}

function deleteAssessmentTable(part) {
  if (!assessmentData) return;
  assessmentData.tables = assessmentData.tables.filter(function (table) { return table.part !== part; });
  assessmentData.quarters.forEach(function (q) {
    delete q[part];
    delete q[part + 'Hps'];
  });
  renderAssessment();
  scheduleSave();
}

function addAssessmentTable() {
  if (!assessmentData || assessmentData.tables.length >= 8) return;
  var part = 't' + Date.now();
  assessmentData.tables.push({ id: part, title: 'New table', part: part, count: 4, weight: '' });
  assessmentData.quarters.forEach(function (q) {
    q[part + 'Hps'] = '';
    q[part] = ['', '', '', ''];
  });
  renderAssessment();
  scheduleSave();
}

function renderAssessment() {
  var host = document.getElementById('assessment-sheet');
  var data = assessmentData;
  if (!host || !data) return;
  var exams = '<tr>' + data.quarters.map(function (q, qi) {
    return '<th>' + quarterLabel(qi) + '</th>';
  }).join('') + '</tr><tr>' + data.quarters.map(function (q, qi) {
    return '<td><input class="box-inp" inputmode="decimal" data-q="' + qi + '" data-part="exam" value="' + sheetEsc(q.exam) + '"></td>';
  }).join('') + '</tr>';
  var signs = data.quarters.map(function (q, qi) {
    return '<div style="flex:1;min-width:140px;"><label style="display:block;font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9a6ea8;margin-bottom:.2rem;">' + quarterLabel(qi) + ' Quarter</label>' +
      '<input class="box-inp" style="border:1px solid #ead7f0;border-radius:8px;height:32px;" data-q="' + qi + '" data-part="signature" value="' + sheetEsc(q.signature) + '"></div>';
  }).join('');
  var days = ['M', 'T', 'W', 'TH', 'F'].map(function (d) {
    return '<label><input type="checkbox" data-day="' + d + '"' + (data.scheduleDays[d] ? ' checked' : '') + '> ' + d + '</label>';
  }).join('');
  var avgs = data.quarters.map(function (q, qi) {
    return '<div class="avg-box"><span>' + quarterLabel(qi) + '</span><strong id="ga-' + qi + '">' + fmtNum(quarterAverage(q)) + '</strong></div>';
  }).join('');
  var weightRows = (data.tables || []).map(function (table) {
    var name = table.title || 'Table';
    return '<label class="weight-row"><span data-weight-label="' + sheetEsc(table.part) + '">' + sheetEsc(name) + '</span>' +
      '<input class="weight-inp" inputmode="decimal" data-weight="' + sheetEsc(table.part) + '" value="' + sheetEsc(table.weight || '') + '" aria-label="' + sheetEsc(name) + ' percent">' +
      '<em>%</em></label>';
  }).join('');
  var listed = weightTotal(data.tables);
  var examGrades = data.quarters.map(function (q, qi) {
    return '<div class="avg-box"><span>' + quarterLabel(qi) + '</span><strong id="eg-' + qi + '">' + sheetEsc(q.exam) + '</strong></div>';
  }).join('');
  host.innerHTML =
    '<div class="paper">' +
      '<div class="paper-title">Learner\'s Individual Assessment Record</div>' +
      '<div class="paper-year">Academic year <input data-field="year" value="' + sheetEsc(data.year) + '" style="width:7.2rem;border:1px solid #e7d5ee;border-radius:8px;padding:.2rem .4rem;font-family:inherit;color:#1f1630;"></div>' +
      headerFields(data) +
      '<div class="sheet-actions"><button type="button" class="sheet-tool" id="add-assess-row">+ Add a row</button><button type="button" class="sheet-tool" id="add-assess-table">+ Add a table</button></div>' +
      '<div class="sheet-grid">' +
        data.tables.map(function (table) { return componentTable(table); }).join('') +
        '<div class="sheet-block"><h3>Quarterly Examination</h3><div class="score-scroll"><table class="score-table">' + exams + '</table></div></div>' +
        '<div class="sheet-block"><h3>Parent\'s / Guardian Signature</h3><div style="display:flex;flex-wrap:wrap;gap:.5rem;padding:.65rem;">' + signs + '</div></div>' +
        '<div class="sheet-block"><h3>Grade weights</h3><div class="weight-list">' + (weightRows || '<p class="weight-sum">Add a score table to give it a percent.</p>') + '</div>' +
          '<p class="weight-sum" id="weight-sum">' + (listed ? 'These table weights total ' + sheetEsc(fmtNum(listed)) + '%.' : 'Enter a percent for each table. Only the tables on this card are included.') + '</p>' +
          '<label class="units-field">Units <input class="weight-inp" id="sheet-units" inputmode="decimal" value="' + sheetEsc(data.units || '') + '" aria-label="Subject units"></label></div>' +
        '<div class="sheet-block"><h3>General Average</h3><div class="avg-row">' + avgs +
          '<div class="avg-box"><span>Final grade</span><strong id="final-avg">' + fmtNum(finalAverage(data)) + '</strong></div>' +
          '<div class="avg-box"><span>Unit estimate</span><strong id="unit-estimate">' + fmtNum(unitEstimate(data)) + '</strong></div></div>' +
          '<p style="margin:0;padding:0 .65rem .65rem;font-size:.72rem;color:#8b7396;">Each quarter uses the percent of the score tables that have a highest possible score. The unit estimate is that final grade times the subject units.</p></div>' +
        '<div class="sheet-block"><h3>Exam Grade</h3><div class="avg-row">' + examGrades + '</div></div>' +
        '<div class="sheet-block"><h3>Remarks</h3><textarea class="remarks-inp" id="sheet-remarks">' + sheetEsc(data.remarks) + '</textarea></div>' +
        '<div class="sheet-block"><h3>Schedule</h3><div class="sched-days">' + days +
          '<label>Time <input type="text" id="sheet-time" value="' + sheetEsc(data.scheduleTime) + '" placeholder="e.g. 8:00–9:00"></label></div></div>' +
      '</div>' +
    '</div>';
  bindHeader(host, data, null);
  var addRowBtn = document.getElementById('add-assess-row');
  var addTableBtn = document.getElementById('add-assess-table');
  if (addRowBtn) addRowBtn.addEventListener('click', addAssessmentRow);
  if (addTableBtn) addTableBtn.addEventListener('click', addAssessmentTable);
  host.querySelectorAll('[data-del-q]').forEach(function (btn) {
    btn.addEventListener('click', function () { deleteAssessmentRow(parseInt(btn.getAttribute('data-del-q'), 10)); });
  });
  host.querySelectorAll('[data-add-col]').forEach(function (btn) {
    btn.addEventListener('click', function () { addAssessmentColumn(btn.getAttribute('data-add-col')); });
  });
  host.querySelectorAll('[data-del-col]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      deleteAssessmentColumn(btn.getAttribute('data-del-col'), parseInt(btn.getAttribute('data-col'), 10));
    });
  });
  host.querySelectorAll('[data-del-table]').forEach(function (btn) {
    btn.addEventListener('click', function () { deleteAssessmentTable(btn.getAttribute('data-del-table')); });
  });
  host.querySelectorAll('[data-table-title]').forEach(function (input) {
    input.addEventListener('input', function () {
      var table = findSheetTable(input.getAttribute('data-table-title'));
      if (table) table.title = input.value.slice(0, 80);
      var label = host.querySelector('[data-weight-label="' + input.getAttribute('data-table-title') + '"]');
      if (label) label.textContent = input.value || 'Table';
      scheduleSave();
    });
  });
  host.querySelectorAll('.box-inp').forEach(function (input) {
    input.addEventListener('input', function () {
      var qi = parseInt(input.getAttribute('data-q'), 10);
      var part = input.getAttribute('data-part');
      var q = data.quarters[qi];
      if (part === 'signature') {
        q.signature = input.value;
      } else if (part === 'exam' || part.slice(-3) === 'Hps') {
        var clean = input.value.replace(/[^0-9.]/g, '');
        if (clean !== input.value) input.value = clean;
        q[part] = clean;
      } else {
        var idx = parseInt(input.getAttribute('data-i'), 10);
        var num = input.value.replace(/[^0-9.]/g, '');
        if (num !== input.value) input.value = num;
        q[part][idx] = num;
      }
      paintAssessmentTotals();
      scheduleSave();
    });
  });
  host.querySelectorAll('[data-weight]').forEach(function (input) {
    input.addEventListener('input', function () {
      var table = findSheetTable(input.getAttribute('data-weight'));
      var clean = input.value.replace(/[^0-9.]/g, '');
      if (clean !== input.value) input.value = clean;
      if (table) table.weight = clean;
      paintAssessmentTotals();
      scheduleSave();
    });
  });
  var units = document.getElementById('sheet-units');
  if (units) units.addEventListener('input', function () {
    var clean = units.value.replace(/[^0-9.]/g, '');
    if (clean !== units.value) units.value = clean;
    data.units = clean;
    paintAssessmentTotals();
    scheduleSave();
  });
  var remarks = document.getElementById('sheet-remarks');
  if (remarks) remarks.addEventListener('input', function () { data.remarks = remarks.value; scheduleSave(); });
  var time = document.getElementById('sheet-time');
  if (time) time.addEventListener('input', function () { data.scheduleTime = time.value; scheduleSave(); });
  host.querySelectorAll('[data-day]').forEach(function (box) {
    box.addEventListener('change', function () {
      data.scheduleDays[box.getAttribute('data-day')] = box.checked;
      scheduleSave();
    });
  });
}

function paintAssessmentTotals() {
  var data = assessmentData;
  if (!data) return;
  (data.tables || []).forEach(function (table) {
    data.quarters.forEach(function (q, qi) {
      var cell = document.getElementById(table.part + '-total-' + qi);
      if (cell) cell.textContent = fmtNum(sumList(q[table.part]));
    });
  });
  data.quarters.forEach(function (q, qi) {
    var ga = document.getElementById('ga-' + qi);
    var eg = document.getElementById('eg-' + qi);
    if (ga) ga.textContent = fmtNum(quarterAverage(q));
    if (eg) eg.textContent = q.exam || '';
  });
  var fin = document.getElementById('final-avg');
  if (fin) fin.textContent = fmtNum(finalAverage(data));
  var estimate = document.getElementById('unit-estimate');
  if (estimate) estimate.textContent = fmtNum(unitEstimate(data));
  var sumEl = document.getElementById('weight-sum');
  if (sumEl) {
    var listed = weightTotal(data.tables);
    sumEl.textContent = listed
      ? 'These table weights total ' + fmtNum(listed) + '%.'
      : 'Enter a percent for each table. Only the tables on this card are included.';
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  sheetStatus('Saving…');
  saveTimer = setTimeout(function () { flushSave(); }, 500);
}

function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  var kind = activeView === 'assessment' ? 'assessment' : (activeView === 'attendance' ? 'attendance' : '');
  var payload = kind === 'attendance' ? attendanceData : kind === 'assessment' ? assessmentData : null;
  var classId = activeClassId;
  var studentId = sheetStudentId;
  if (!kind || !payload || !classId || !studentId) return Promise.resolve();
  try {
    localStorage.setItem(sheetLocalKey(kind, classId, studentId), JSON.stringify(payload));
  } catch (e) { /* ignore quota */ }
  if (typeof PrismRecords === 'undefined') {
    sheetStatus('Saved on this browser');
    return Promise.resolve();
  }
  sheetStatus('Saving…');
  return PrismRecords.saveSheet(classId, studentId, kind, payload).then(function () {
    if (activeClassId === classId && sheetStudentId === studentId && (activeView === kind)) sheetStatus('Saved');
  }).catch(function () {
    if (activeClassId === classId && sheetStudentId === studentId) sheetStatus('Saved on this browser. The server copy did not update.');
  });
}
