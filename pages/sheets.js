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

function blankQuarter() {
  return {
    wwHps: '', ww: ['', '', '', '', '', '', '', '', '', ''],
    ptHps: '', pt: ['', '', '', '', '', '', '', '', '', ''],
    qzHps: '', qz: ['', '', '', '', '', ''],
    recHps: '', rec: ['', '', '', '', '', ''],
    exam: '',
    signature: ''
  };
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
  return {
    name: base.name,
    section: base.section,
    subject: base.subject,
    tracker: '',
    year: '2026-2027',
    quarters: [blankQuarter(), blankQuarter(), blankQuarter(), blankQuarter()],
    remarks: '',
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

function refreshSheetBar() {
  var sel = document.getElementById('sheet-student');
  if (!sel) return;
  var students = typeof getStudents === 'function' ? getStudents(activeClassId) : [];
  var prev = sheetStudentId || sel.value;
  sel.innerHTML = '';
  if (!students.length) {
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'No students in this class';
    sel.appendChild(empty);
    sheetStudentId = '';
    return;
  }
  students.forEach(function (s) {
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name + (s.section ? ' · ' + s.section : '');
    sel.appendChild(opt);
  });
  var keep = students.some(function (s) { return s.id === prev; });
  sheetStudentId = keep ? prev : students[0].id;
  sel.value = sheetStudentId;
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
  if (Array.isArray(saved.quarters)) {
    for (var i = 0; i < 4; i++) {
      var q = saved.quarters[i] || {};
      base.quarters[i] = {
        wwHps: q.wwHps != null ? String(q.wwHps) : '',
        ww: padScores(q.ww, 10),
        ptHps: q.ptHps != null ? String(q.ptHps) : '',
        pt: padScores(q.pt, 10),
        qzHps: q.qzHps != null ? String(q.qzHps) : '',
        qz: padScores(q.qz, 6),
        recHps: q.recHps != null ? String(q.recHps) : '',
        rec: padScores(q.rec, 6),
        exam: q.exam != null ? String(q.exam) : '',
        signature: q.signature != null ? String(q.signature) : ''
      };
    }
  }
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
    host.innerHTML = '<div class="paper" style="color:#6b7280;">Choose a class that has students enrolled.</div>';
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

function countPresent(marks, month) {
  var n = 0;
  Object.keys(marks || {}).forEach(function (key) {
    if (key.indexOf(month.year + '-' + month.month + '-') === 0 && marks[key] === 'P') n++;
  });
  return n;
}

function renderAttendance() {
  var host = document.getElementById('attendance-sheet');
  var data = attendanceData;
  if (!host || !data) return;
  var months = schoolMonths(data.year);
  var head = '<tr><th>Month</th>';
  for (var d = 1; d <= 31; d++) head += '<th>' + d + '</th>';
  head += '<th>Total</th></tr>';
  var body = months.map(function (month, mi) {
    var cells = '';
    var max = daysInMonth(month.year, month.month);
    for (var day = 1; day <= 31; day++) {
      if (day > max) {
        cells += '<td class="mark-cell invalid"></td>';
        continue;
      }
      var key = month.year + '-' + month.month + '-' + day;
      var val = data.marks[key] || '';
      var letter = weekdayLetter(month.year, month.month, day);
      var weekend = letter === 'Su' || letter === 'Sa' ? ' weekend' : '';
      cells += '<td class="mark-cell' + weekend + '"><span class="wd">' + letter + '</span>' +
        '<input class="mark-inp mk-' + sheetEsc(val.toLowerCase()) + '" maxlength="1" data-mark="' + key + '" value="' + sheetEsc(val) + '"></td>';
    }
    return '<tr><th class="month">' + month.name + '</th>' + cells +
      '<td class="att-total" id="att-total-' + mi + '">' + countPresent(data.marks, month) + '</td></tr>';
  }).join('');
  host.innerHTML =
    '<div class="paper">' +
      '<div class="paper-title">Individual Attendance Record</div>' +
      '<div class="paper-year">Academic year <input data-field="year" value="' + sheetEsc(data.year) + '" style="width:7.2rem;border:1px solid #e7d5ee;border-radius:8px;padding:.2rem .4rem;font-family:inherit;color:#1f1630;"></div>' +
      headerFields(data) +
      '<div class="legend"><span><b>P</b> Present</span><span><b>A</b> Absent</span><span><b>L</b> Late</span><span><b>H</b> Holiday</span><span>Total counts days marked present. Weekend boxes are shaded.</span></div>' +
      '<div class="att-scroll"><table class="att-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
    '</div>';
  bindHeader(host, data, renderAttendance);
  host.querySelectorAll('[data-mark]').forEach(function (input) {
    input.addEventListener('input', function () {
      var v = input.value.toUpperCase().replace(/[^PALH]/g, '').slice(0, 1);
      input.value = v;
      input.className = 'mark-inp' + (v ? ' mk-' + v.toLowerCase() : '');
      var key = input.getAttribute('data-mark');
      if (v) data.marks[key] = v;
      else delete data.marks[key];
      months.forEach(function (month, mi) {
        var cell = document.getElementById('att-total-' + mi);
        if (cell) cell.textContent = String(countPresent(data.marks, month));
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

function quarterAverage(q) {
  var nums = [partPct(q.ww, q.wwHps), partPct(q.pt, q.ptHps), partPct(q.qz, q.qzHps), partPct(q.rec, q.recHps)]
    .filter(function (n) { return n != null && isFinite(n); });
  if (!nums.length) return null;
  return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
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

function componentTable(title, part, count) {
  var heads = '<tr><th>Quarter</th><th>HPS</th>';
  for (var i = 1; i <= count; i++) heads += '<th>' + i + '</th>';
  heads += '<th>Total</th></tr>';
  var rows = ['1st', '2nd', '3rd', '4th'].map(function (label, qi) {
    var q = assessmentData.quarters[qi];
    return '<tr><th class="q-name">' + label + '</th>' +
      '<td><input class="box-inp" inputmode="decimal" data-q="' + qi + '" data-part="' + part + 'Hps" value="' + sheetEsc(q[part + 'Hps']) + '"></td>' +
      scoreInputs(qi, part, count) +
      '<td class="score-total" id="' + part + '-total-' + qi + '">' + fmtNum(sumList(q[part])) + '</td></tr>';
  }).join('');
  return '<div class="sheet-block"><h3>' + title + '</h3><div class="score-scroll"><table class="score-table"><thead>' + heads + '</thead><tbody>' + rows + '</tbody></table></div></div>';
}

function renderAssessment() {
  var host = document.getElementById('assessment-sheet');
  var data = assessmentData;
  if (!host || !data) return;
  var exams = '<tr>' + ['1st', '2nd', '3rd', '4th'].map(function (label, qi) {
    return '<th>' + label + '</th>';
  }).join('') + '</tr><tr>' + [0, 1, 2, 3].map(function (qi) {
    return '<td><input class="box-inp" inputmode="decimal" data-q="' + qi + '" data-part="exam" value="' + sheetEsc(data.quarters[qi].exam) + '"></td>';
  }).join('') + '</tr>';
  var signs = ['1st', '2nd', '3rd', '4th'].map(function (label, qi) {
    return '<div style="flex:1;min-width:140px;"><label style="display:block;font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9a6ea8;margin-bottom:.2rem;">' + label + ' Quarter</label>' +
      '<input class="box-inp" style="border:1px solid #ead7f0;border-radius:8px;height:32px;" data-q="' + qi + '" data-part="signature" value="' + sheetEsc(data.quarters[qi].signature) + '"></div>';
  }).join('');
  var days = ['M', 'T', 'W', 'TH', 'F'].map(function (d) {
    return '<label><input type="checkbox" data-day="' + d + '"' + (data.scheduleDays[d] ? ' checked' : '') + '> ' + d + '</label>';
  }).join('');
  var avgs = ['1st', '2nd', '3rd', '4th'].map(function (label, qi) {
    return '<div class="avg-box"><span>' + label + '</span><strong id="ga-' + qi + '">' + fmtNum(quarterAverage(data.quarters[qi])) + '</strong></div>';
  }).join('');
  var examGrades = ['1st', '2nd', '3rd', '4th'].map(function (label, qi) {
    return '<div class="avg-box"><span>' + label + '</span><strong id="eg-' + qi + '">' + sheetEsc(data.quarters[qi].exam) + '</strong></div>';
  }).join('');
  host.innerHTML =
    '<div class="paper">' +
      '<div class="paper-title">Learner\'s Individual Assessment Record</div>' +
      '<div class="paper-year">Academic year <input data-field="year" value="' + sheetEsc(data.year) + '" style="width:7.2rem;border:1px solid #e7d5ee;border-radius:8px;padding:.2rem .4rem;font-family:inherit;color:#1f1630;"></div>' +
      headerFields(data) +
      '<div class="sheet-grid">' +
        componentTable('Written Works', 'ww', 10) +
        componentTable('Performance Task', 'pt', 10) +
        componentTable('Quizzes', 'qz', 6) +
        componentTable('Recitation / Assignments (Oral)', 'rec', 6) +
        '<div class="sheet-block"><h3>Quarterly Examination</h3><div class="score-scroll"><table class="score-table">' + exams + '</table></div></div>' +
        '<div class="sheet-block"><h3>Parent\'s / Guardian Signature</h3><div style="display:flex;flex-wrap:wrap;gap:.5rem;padding:.65rem;">' + signs + '</div></div>' +
        '<div class="sheet-block"><h3>General Average</h3><div class="avg-row">' + avgs + '<div class="avg-box"><span>Final Average</span><strong id="final-avg">' + fmtNum(finalAverage(data)) + '</strong></div></div><p style="margin:0;padding:0 .65rem .65rem;font-size:.72rem;color:#8b7396;">Each quarter averages the written, performance, quiz, and oral scores that have a highest possible score.</p></div>' +
        '<div class="sheet-block"><h3>Exam Grade</h3><div class="avg-row">' + examGrades + '</div></div>' +
        '<div class="sheet-block"><h3>Remarks</h3><textarea class="remarks-inp" id="sheet-remarks">' + sheetEsc(data.remarks) + '</textarea></div>' +
        '<div class="sheet-block"><h3>Schedule</h3><div class="sched-days">' + days +
          '<label>Time <input type="text" id="sheet-time" value="' + sheetEsc(data.scheduleTime) + '" placeholder="e.g. 8:00–9:00"></label></div></div>' +
      '</div>' +
    '</div>';
  bindHeader(host, data, null);
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
  ['ww', 'pt', 'qz', 'rec'].forEach(function (part) {
    data.quarters.forEach(function (q, qi) {
      var cell = document.getElementById(part + '-total-' + qi);
      if (cell) cell.textContent = fmtNum(sumList(q[part]));
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
