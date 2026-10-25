var statusRecords = [];
var statusSelected = '';
var statusKind = 'assessment';

function statusEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusMonths(yearLabel) {
  var match = String(yearLabel || '').match(/(\d{4})\s*-\s*(\d{4})/);
  var y1 = match ? parseInt(match[1], 10) : 2026;
  var y2 = match ? parseInt(match[2], 10) : y1 + 1;
  var names = ['June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
  var nums = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  return names.map(function (name, i) {
    return { name: name, month: nums[i], year: nums[i] >= 6 ? y1 : y2 };
  });
}

function statusDays(year, month) {
  return new Date(year, month, 0).getDate();
}

function statusWeekday(year, month, day) {
  return ['Su', 'M', 'T', 'W', 'TH', 'F', 'Sa'][new Date(year, month - 1, day).getDay()];
}

function statusPad(arr, n) {
  var out = Array.isArray(arr) ? arr.slice(0, n) : [];
  while (out.length < n) out.push('');
  return out.map(function (v) { return v == null ? '' : String(v); });
}

function statusSum(arr) {
  var n = 0;
  var any = false;
  (arr || []).forEach(function (v) {
    if (v === '' || v == null) return;
    var x = parseFloat(v);
    if (!isNaN(x)) { n += x; any = true; }
  });
  return any ? n : null;
}

function statusPart(scores, hps) {
  var total = statusSum(scores);
  var h = parseFloat(hps);
  if (total == null || !(h > 0)) return null;
  return (total / h) * 100;
}

function statusQuarter(q) {
  var nums = [statusPart(q.ww, q.wwHps), statusPart(q.pt, q.ptHps), statusPart(q.qz, q.qzHps), statusPart(q.rec, q.recHps)]
    .filter(function (n) { return n != null && isFinite(n); });
  if (!nums.length) return null;
  return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
}

function statusFinal(data) {
  var nums = data.quarters.map(statusQuarter).filter(function (n) { return n != null; });
  if (!nums.length) return null;
  return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
}

function statusFmt(n) {
  if (n == null || !isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}

function statusTally(marks) {
  var t = { P: 0, A: 0, L: 0, H: 0 };
  Object.keys(marks || {}).forEach(function (key) {
    var v = String(marks[key] || '').toUpperCase();
    if (t[v] != null) t[v]++;
  });
  return t;
}

function statusWhen(value) {
  if (!value) return '';
  var d = new Date(String(value).replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBlankQuarter() {
  return {
    wwHps: '', ww: statusPad([], 10),
    ptHps: '', pt: statusPad([], 10),
    qzHps: '', qz: statusPad([], 6),
    recHps: '', rec: statusPad([], 6),
    exam: '',
    signature: ''
  };
}

function statusAssessment(saved) {
  var data = {
    name: '',
    section: '',
    subject: '',
    tracker: '',
    year: '2026-2027',
    quarters: [statusBlankQuarter(), statusBlankQuarter(), statusBlankQuarter(), statusBlankQuarter()],
    remarks: '',
    scheduleDays: { M: false, T: false, W: false, TH: false, F: false },
    scheduleTime: ''
  };
  if (!saved || typeof saved !== 'object') return data;
  ['name', 'section', 'subject', 'tracker', 'year', 'remarks', 'scheduleTime'].forEach(function (key) {
    if (saved[key] != null) data[key] = String(saved[key]);
  });
  var days = saved.scheduleDays || {};
  ['M', 'T', 'W', 'TH', 'F'].forEach(function (d) { data.scheduleDays[d] = !!days[d]; });
  if (Array.isArray(saved.quarters)) {
    for (var i = 0; i < 4; i++) {
      var q = saved.quarters[i] || {};
      data.quarters[i] = {
        wwHps: q.wwHps != null ? String(q.wwHps) : '',
        ww: statusPad(q.ww, 10),
        ptHps: q.ptHps != null ? String(q.ptHps) : '',
        pt: statusPad(q.pt, 10),
        qzHps: q.qzHps != null ? String(q.qzHps) : '',
        qz: statusPad(q.qz, 6),
        recHps: q.recHps != null ? String(q.recHps) : '',
        rec: statusPad(q.rec, 6),
        exam: q.exam != null ? String(q.exam) : '',
        signature: q.signature != null ? String(q.signature) : ''
      };
    }
  }
  return data;
}

function statusQuery() {
  var input = document.getElementById('status-search');
  return input ? input.value.trim().toLowerCase() : '';
}

function statusMatches(row, query) {
  if (!query) return true;
  var hay = [row.subject, row.code, row.teacher_name].join(' ').toLowerCase();
  return hay.indexOf(query) !== -1;
}

function statusSelectedRow() {
  for (var i = 0; i < statusRecords.length; i++) {
    if (statusRecords[i].class_id === statusSelected) return statusRecords[i];
  }
  return null;
}

function statusChip(text, waiting) {
  return '<span class="chip' + (waiting ? ' waiting' : '') + '">' + statusEsc(text) + '</span>';
}

function renderStatusList() {
  var list = document.getElementById('status-list');
  var empty = document.getElementById('status-empty');
  var count = document.getElementById('status-count');
  if (!list) return;
  var query = statusQuery();
  var shown = statusRecords.filter(function (row) { return statusMatches(row, query); });
  if (count) {
    count.textContent = statusRecords.length
      ? (shown.length + ' of ' + statusRecords.length + (statusRecords.length === 1 ? ' subject' : ' subjects'))
      : '';
  }
  if (!statusRecords.length) {
    list.innerHTML = '';
    if (empty) {
      empty.style.display = '';
      empty.textContent = 'You have not joined a class yet. Once a teacher adds you, the record will show up here.';
    }
    return;
  }
  if (!shown.length) {
    list.innerHTML = '';
    if (empty) {
      empty.style.display = '';
      empty.textContent = 'No subject matches that search.';
    }
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = shown.map(function (row) {
    var tally = row.attendance ? statusTally(row.attendance.marks) : null;
    var assess = row.assessment ? statusAssessment(row.assessment) : null;
    var avg = assess ? statusFmt(statusFinal(assess)) : '';
    var chips = '';
    chips += tally
      ? statusChip(tally.P + ' present' + (tally.A ? ' · ' + tally.A + ' absent' : ''))
      : statusChip('No attendance yet', true);
    chips += avg ? statusChip('Final average ' + avg) : statusChip('No assessment yet', true);
    return '<button type="button" class="status-card' + (row.class_id === statusSelected ? ' active' : '') + '" data-class="' + statusEsc(row.class_id) + '">' +
      '<strong>' + statusEsc(row.subject || 'Untitled subject') + '</strong>' +
      '<div class="meta">' + statusEsc(row.code || '') + (row.teacher_name ? ' · ' + statusEsc(row.teacher_name) : '') + '</div>' +
      '<div class="chips">' + chips + '</div></button>';
  }).join('');
  list.querySelectorAll('.status-card').forEach(function (btn) {
    btn.addEventListener('click', function () {
      statusSelected = btn.getAttribute('data-class') || '';
      var row = statusSelectedRow();
      if (row && !row.assessment && row.attendance) statusKind = 'attendance';
      else statusKind = 'assessment';
      renderStatusList();
      renderStatusSheet();
    });
  });
}

function statusHead(data) {
  return '<div class="paper-head">' +
    '<div><label>Name</label><div class="paper-value">' + statusEsc(data.name || '—') + '</div></div>' +
    '<div><label>Grade &amp; Section</label><div class="paper-value">' + statusEsc(data.section || '—') + '</div></div>' +
    '<div><label>Subject</label><div class="paper-value">' + statusEsc(data.subject || '—') + '</div></div>' +
    '<div><label>Tracker</label><div class="paper-value">' + statusEsc(data.tracker || '—') + '</div></div>' +
    '</div>';
}

function renderAttendancePaper(row) {
  var saved = row.attendance || {};
  var marks = saved.marks && typeof saved.marks === 'object' ? saved.marks : {};
  var year = saved.year ? String(saved.year) : '2026-2027';
  var months = statusMonths(year);
  var head = '<tr><th>Month</th>';
  for (var d = 1; d <= 31; d++) head += '<th>' + d + '</th>';
  head += '<th>Total</th></tr>';
  var body = months.map(function (month) {
    var cells = '';
    var max = statusDays(month.year, month.month);
    var present = 0;
    for (var day = 1; day <= 31; day++) {
      if (day > max) {
        cells += '<td class="mark-cell invalid"></td>';
        continue;
      }
      var key = month.year + '-' + month.month + '-' + day;
      var val = String(marks[key] || '').toUpperCase().replace(/[^PALH]/g, '').slice(0, 1);
      if (val === 'P') present++;
      var letter = statusWeekday(month.year, month.month, day);
      var weekend = letter === 'Su' || letter === 'Sa' ? ' weekend' : '';
      cells += '<td class="mark-cell' + weekend + '"><span class="wd">' + letter + '</span>' +
        '<span class="mark-show' + (val ? ' mk-' + val.toLowerCase() : '') + '">' + statusEsc(val) + '</span></td>';
    }
    return '<tr><th class="month">' + month.name + '</th>' + cells + '<td class="att-total">' + present + '</td></tr>';
  }).join('');
  var updated = statusWhen(row.attendance_updated);
  return '<div class="paper">' +
    '<div class="paper-title">Individual Attendance Record</div>' +
    '<div class="paper-year">Academic year ' + statusEsc(year) + (updated ? ' · Updated ' + statusEsc(updated) : '') + '</div>' +
    '<div class="paper-teacher">Teacher ' + statusEsc(row.teacher_name || '') + '</div>' +
    statusHead({
      name: saved.name,
      section: saved.section,
      subject: saved.subject || row.subject,
      tracker: saved.tracker
    }) +
    '<div class="legend"><span><b>P</b> Present</span><span><b>A</b> Absent</span><span><b>L</b> Late</span><span><b>H</b> Holiday</span><span>Total counts days marked present.</span></div>' +
    '<div class="att-scroll"><table class="att-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
    '</div>';
}

function statusComponent(title, part, count, data) {
  var heads = '<tr><th>Quarter</th><th>HPS</th>';
  for (var i = 1; i <= count; i++) heads += '<th>' + i + '</th>';
  heads += '<th>Total</th></tr>';
  var rows = ['1st', '2nd', '3rd', '4th'].map(function (label, qi) {
    var q = data.quarters[qi];
    var cells = '';
    for (var n = 0; n < count; n++) cells += '<td>' + statusEsc(q[part][n]) + '</td>';
    return '<tr><th class="q-name">' + label + '</th><td>' + statusEsc(q[part + 'Hps']) + '</td>' + cells +
      '<td class="score-total">' + statusEsc(statusFmt(statusSum(q[part]))) + '</td></tr>';
  }).join('');
  return '<div class="sheet-block"><h3>' + title + '</h3><div class="score-scroll"><table class="score-table"><thead>' + heads + '</thead><tbody>' + rows + '</tbody></table></div></div>';
}

function renderAssessmentPaper(row) {
  var data = statusAssessment(row.assessment);
  if (!data.subject) data.subject = row.subject || '';
  var exams = '<tr>' + ['1st', '2nd', '3rd', '4th'].map(function (label) {
    return '<th>' + label + '</th>';
  }).join('') + '</tr><tr>' + data.quarters.map(function (q) {
    return '<td>' + statusEsc(q.exam) + '</td>';
  }).join('') + '</tr>';
  var signs = ['1st', '2nd', '3rd', '4th'].map(function (label, qi) {
    return '<div><label>' + label + ' Quarter</label><div class="paper-value">' + statusEsc(data.quarters[qi].signature || '—') + '</div></div>';
  }).join('');
  var days = ['M', 'T', 'W', 'TH', 'F'].map(function (d) {
    return '<span class="day-pill' + (data.scheduleDays[d] ? ' on' : '') + '">' + d + '</span>';
  }).join('');
  var avgs = ['1st', '2nd', '3rd', '4th'].map(function (label, qi) {
    return '<div class="avg-box"><span>' + label + '</span><strong>' + statusEsc(statusFmt(statusQuarter(data.quarters[qi]))) + '</strong></div>';
  }).join('');
  var examsView = ['1st', '2nd', '3rd', '4th'].map(function (label, qi) {
    return '<div class="avg-box"><span>' + label + '</span><strong>' + statusEsc(data.quarters[qi].exam) + '</strong></div>';
  }).join('');
  var updated = statusWhen(row.assessment_updated);
  return '<div class="paper">' +
    '<div class="paper-title">Learner\'s Individual Assessment Record</div>' +
    '<div class="paper-year">Academic year ' + statusEsc(data.year) + (updated ? ' · Updated ' + statusEsc(updated) : '') + '</div>' +
    '<div class="paper-teacher">Teacher ' + statusEsc(row.teacher_name || '') + '</div>' +
    statusHead(data) +
    '<div class="sheet-grid">' +
      statusComponent('Written Works', 'ww', 10, data) +
      statusComponent('Performance Task', 'pt', 10, data) +
      statusComponent('Quizzes', 'qz', 6, data) +
      statusComponent('Recitation / Assignments (Oral)', 'rec', 6, data) +
      '<div class="sheet-block"><h3>Quarterly Examination</h3><div class="score-scroll"><table class="score-table">' + exams + '</table></div></div>' +
      '<div class="sheet-block"><h3>Parent\'s / Guardian Signature</h3><div class="sign-row">' + signs + '</div></div>' +
      '<div class="sheet-block"><h3>General Average</h3><div class="avg-row">' + avgs +
        '<div class="avg-box"><span>Final Average</span><strong>' + statusEsc(statusFmt(statusFinal(data))) + '</strong></div></div>' +
        '<p class="avg-note">Each quarter averages the written, performance, quiz, and oral scores that have a highest possible score.</p></div>' +
      '<div class="sheet-block"><h3>Exam Grade</h3><div class="avg-row">' + examsView + '</div></div>' +
      '<div class="sheet-block"><h3>Remarks</h3><div class="remarks-view">' + statusEsc(data.remarks || 'No remarks') + '</div></div>' +
      '<div class="sheet-block"><h3>Schedule</h3><div class="sched-days">' + days +
        '<span class="sched-time">' + statusEsc(data.scheduleTime || 'No time set') + '</span></div></div>' +
    '</div></div>';
}

function renderStatusSheet() {
  var host = document.getElementById('status-sheet');
  var tabs = document.getElementById('status-tabs');
  var row = statusSelectedRow();
  if (!host || !tabs) return;
  if (!row || !statusMatches(row, statusQuery())) {
    tabs.style.display = 'none';
    var query = statusQuery();
    var any = statusRecords.some(function (item) { return statusMatches(item, query); });
    host.innerHTML = any ? '<p class="status-empty">Choose a subject to open the record.</p>' : '';
    return;
  }
  tabs.style.display = 'flex';
  tabs.querySelectorAll('.status-tab').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-kind') === statusKind);
  });
  if (statusKind === 'attendance') {
    host.innerHTML = row.attendance
      ? renderAttendancePaper(row)
      : '<p class="status-empty">Your teacher has not saved an attendance record for this subject yet.</p>';
  } else {
    host.innerHTML = row.assessment
      ? renderAssessmentPaper(row)
      : '<p class="status-empty">Your teacher has not saved an assessment for this subject yet.</p>';
  }
}

function bindStatusPage() {
  var search = document.getElementById('status-search');
  if (search) {
    search.addEventListener('input', function () {
      renderStatusList();
      renderStatusSheet();
    });
  }
  var tabs = document.getElementById('status-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.status-tab');
      if (!btn) return;
      statusKind = btn.getAttribute('data-kind') || 'assessment';
      renderStatusSheet();
    });
  }
}

async function loadStatus() {
  var empty = document.getElementById('status-empty');
  try {
    statusRecords = await PrismRecords.myStatus();
  } catch (e) {
    statusRecords = [];
    if (empty) {
      empty.style.display = '';
      empty.textContent = 'The records could not be loaded. Refresh the page and try again.';
    }
    return;
  }
  renderStatusList();
  renderStatusSheet();
}

document.addEventListener('DOMContentLoaded', function () {
  bindStatusPage();
  if (typeof initSidebar === 'function') initSidebar('status');
  loadStatus();
});
