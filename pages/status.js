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

function statusExamPct(q) {
  if (!q || q.exam === '' || q.exam == null) return null;
  var score = parseFloat(q.exam);
  var hps = parseFloat(q.examHps);
  if (!isFinite(score) || !(hps > 0)) return null;
  return (score / hps) * 100;
}

function statusQuarter(q, tables, examWeight) {
  var list = tables && tables.length ? tables : [
    { part: 'ww' }, { part: 'pt' }, { part: 'qz' }, { part: 'rec' }
  ];
  var scored = [];
  var anyWeight = false;
  list.forEach(function (table) {
    var weight = parseFloat(table && table.weight);
    if (isFinite(weight) && weight > 0) anyWeight = true;
    var pct = statusPart(q[table.part], q[table.part + 'Hps']);
    if (pct == null || !isFinite(pct) || !(weight > 0)) return;
    scored.push({ pct: pct, weight: weight });
  });
  var examShare = parseFloat(examWeight);
  if (isFinite(examShare) && examShare > 0) anyWeight = true;
  var examPercent = statusExamPct(q);
  if (examPercent != null && examShare > 0) scored.push({ pct: examPercent, weight: examShare });
  if (!anyWeight) {
    var plain = list.map(function (table) {
      return statusPart(q[table.part], q[table.part + 'Hps']);
    }).filter(function (n) { return n != null && isFinite(n); });
    if (examPercent != null) plain.push(examPercent);
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

function statusUnitEstimate(data) {
  var grade = statusFinal(data);
  var units = parseFloat(data && data.units);
  if (grade == null || !(units > 0)) return null;
  return (grade / 100) * units;
}

function statusQuarterLabel(i) {
  var names = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
  return names[i] || ((i + 1) + 'th');
}

function statusTables(saved) {
  if (saved && Array.isArray(saved.tables) && saved.tables.length) {
    return saved.tables.map(function (table, i) {
      var part = String((table && table.part) || ('t' + i)).replace(/[^a-z0-9_]/gi, '').slice(0, 24) || ('t' + i);
      var count = parseInt(table && table.count, 10);
      if (!(count >= 1)) count = 1;
      if (count > 20) count = 20;
      var weight = table && table.weight != null ? String(table.weight).replace(/[^0-9.]/g, '') : '';
      return { title: String((table && table.title) || 'Table'), part: part, count: count, weight: weight };
    });
  }
  return [
    { title: 'Written Works', part: 'ww', count: 10 },
    { title: 'Performance Task', part: 'pt', count: 10 },
    { title: 'Quizzes', part: 'qz', count: 6 },
    { title: 'Recitation / Assignments (Oral)', part: 'rec', count: 6 }
  ];
}

function statusAttendanceRows(saved, year) {
  if (saved && Array.isArray(saved.rows) && saved.rows.length) {
    return saved.rows.map(function (row, i) {
      return {
        id: String((row && row.id) || ('row-' + i)),
        name: String((row && row.name) || 'Row'),
        year: parseInt(row && row.year, 10) || 0,
        month: parseInt(row && row.month, 10) || 0
      };
    });
  }
  return statusMonths(year).map(function (m, i) {
    return { id: 'cal-' + i, name: m.name, year: m.year, month: m.month };
  });
}

function statusFinal(data) {
  var nums = data.quarters.map(function (q) { return statusQuarter(q, data.tables, data.examWeight); }).filter(function (n) { return n != null; });
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

function statusBlankQuarter(tables) {
  var q = { exam: '', examHps: '', signature: '' };
  (tables || statusTables(null)).forEach(function (table) {
    q[table.part + 'Hps'] = '';
    q[table.part] = statusPad([], table.count);
  });
  return q;
}

function statusAssessment(saved) {
  var tables = statusTables(saved);
  var data = {
    name: '',
    section: '',
    subject: '',
    tracker: '',
    year: '2026-2027',
    tables: tables,
    quarters: [statusBlankQuarter(tables), statusBlankQuarter(tables), statusBlankQuarter(tables), statusBlankQuarter(tables)],
    remarks: '',
    scheduleDays: { M: false, T: false, W: false, TH: false, F: false },
    scheduleTime: '',
    units: '',
    examWeight: ''
  };
  if (!saved || typeof saved !== 'object') return data;
  if (saved.units != null) data.units = String(saved.units).replace(/[^0-9.]/g, '').slice(0, 6);
  if (saved.examWeight != null) data.examWeight = String(saved.examWeight).replace(/[^0-9.]/g, '').slice(0, 6);
  ['name', 'section', 'subject', 'tracker', 'year', 'remarks', 'scheduleTime'].forEach(function (key) {
    if (saved[key] != null) data[key] = String(saved[key]);
  });
  var days = saved.scheduleDays || {};
  ['M', 'T', 'W', 'TH', 'F'].forEach(function (d) { data.scheduleDays[d] = !!days[d]; });
  var source = Array.isArray(saved.quarters) && saved.quarters.length ? saved.quarters.slice(0, 8) : null;
  if (source) {
    data.quarters = source.map(function (q) {
      var shaped = {
        exam: q && q.exam != null ? String(q.exam) : '',
        examHps: q && q.examHps != null ? String(q.examHps).replace(/[^0-9.]/g, '') : '',
        signature: q && q.signature != null ? String(q.signature) : ''
      };
      tables.forEach(function (table) {
        shaped[table.part + 'Hps'] = q && q[table.part + 'Hps'] != null ? String(q[table.part + 'Hps']) : '';
        shaped[table.part] = statusPad(q && q[table.part], table.count);
      });
      return shaped;
    });
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
      var id = btn.getAttribute('data-class') || '';
      if (statusSelected === id) {
        statusSelected = '';
        renderStatusList();
        renderStatusSheet();
        return;
      }
      statusSelected = id;
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
  var months = statusAttendanceRows(saved, year);
  var head = '<tr><th>Month</th>';
  for (var d = 1; d <= 31; d++) head += '<th>' + d + '</th>';
  head += '<th>Total</th></tr>';
  var body = months.map(function (month) {
    var cells = '';
    var calendar = month.year && month.month;
    var max = calendar ? statusDays(month.year, month.month) : 31;
    var present = 0;
    for (var day = 1; day <= 31; day++) {
      if (day > max) {
        cells += '<td class="mark-cell invalid"></td>';
        continue;
      }
      var key = calendar ? (month.year + '-' + month.month + '-' + day) : (month.id + '-' + day);
      var val = String(marks[key] || '').toUpperCase().replace(/[^PALH]/g, '').slice(0, 1);
      if (val === 'P') present++;
      var letter = calendar ? statusWeekday(month.year, month.month, day) : '';
      var weekend = letter === 'Su' || letter === 'Sa' ? ' weekend' : '';
      cells += '<td class="mark-cell' + weekend + '">' +
        (letter ? '<span class="wd">' + letter + '</span>' : '') +
        '<span class="mark-show' + (val ? ' mk-' + val.toLowerCase() : '') + '">' + statusEsc(val) + '</span></td>';
    }
    return '<tr><th class="month">' + statusEsc(month.name) + '</th>' + cells + '<td class="att-total">' + present + '</td></tr>';
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
  var rows = data.quarters.map(function (q, qi) {
    var label = statusQuarterLabel(qi);
    var cells = '';
    for (var n = 0; n < count; n++) cells += '<td>' + statusEsc(q[part][n]) + '</td>';
    return '<tr><th class="q-name">' + label + '</th><td>' + statusEsc(q[part + 'Hps']) + '</td>' + cells +
      '<td class="score-total">' + statusEsc(statusFmt(statusSum(q[part]))) + '</td></tr>';
  }).join('');
  return '<div class="sheet-block"><h3>' + statusEsc(title) + '</h3><div class="score-scroll"><table class="score-table"><thead>' + heads + '</thead><tbody>' + rows + '</tbody></table></div></div>';
}

function renderAssessmentPaper(row) {
  var data = statusAssessment(row.assessment);
  if (!data.subject) data.subject = row.subject || '';
  var exams = '<tr>' + data.quarters.map(function (q, qi) {
    return '<th>' + statusQuarterLabel(qi) + '</th>';
  }).join('') + '</tr><tr>' + data.quarters.map(function (q) {
    return '<td class="exam-pair">' + statusEsc(q.exam || '—') + ' / ' + statusEsc(q.examHps || '—') + '</td>';
  }).join('') + '</tr>';
  var signs = data.quarters.map(function (q, qi) {
    var label = statusQuarterLabel(qi);
    return '<div><label>' + label + ' Quarter</label><div class="paper-value">' + statusEsc(data.quarters[qi].signature || '—') + '</div></div>';
  }).join('');
  var days = ['M', 'T', 'W', 'TH', 'F'].map(function (d) {
    return '<span class="day-pill' + (data.scheduleDays[d] ? ' on' : '') + '">' + d + '</span>';
  }).join('');
  var avgs = data.quarters.map(function (q, qi) {
    return '<div class="avg-box"><span>' + statusQuarterLabel(qi) + '</span><strong>' + statusEsc(statusFmt(statusQuarter(q, data.tables, data.examWeight))) + '</strong></div>';
  }).join('');
  var updated = statusWhen(row.assessment_updated);
  return '<div class="paper">' +
    '<div class="paper-title">Learner\'s Individual Assessment Record</div>' +
    '<div class="paper-year">Academic year ' + statusEsc(data.year) + (updated ? ' · Updated ' + statusEsc(updated) : '') + '</div>' +
    '<div class="paper-teacher">Teacher ' + statusEsc(row.teacher_name || '') + '</div>' +
    statusHead(data) +
    '<div class="sheet-grid">' +
      (data.tables || []).map(function (table) {
        return statusComponent(table.title, table.part, table.count, data);
      }).join('') +
      '<div class="sheet-block"><h3>Quarterly Examination</h3><div class="score-scroll"><table class="score-table">' + exams + '</table></div></div>' +
      '<div class="sheet-block"><h3>Parent\'s / Guardian Signature</h3><div class="sign-row">' + signs + '</div></div>' +
      '<div class="sheet-block"><h3>Grade weights</h3><div class="weight-list">' +
        ((data.tables || []).map(function (table) {
          return '<div class="weight-row"><span>' + statusEsc(table.title || 'Table') + '</span><strong>' + statusEsc(table.weight || '—') + '%</strong></div>';
        }).join('') +
          '<div class="weight-row"><span>Quarterly Examination</span><strong>' + statusEsc(data.examWeight || '—') + '%</strong></div>') +
        '</div><p class="avg-note">Units ' + statusEsc(data.units || '—') + '</p></div>' +
      '<div class="sheet-block"><h3>General Average</h3><div class="avg-row">' + avgs +
        '<div class="avg-box"><span>Final grade</span><strong>' + statusEsc(statusFmt(statusFinal(data))) + '</strong></div>' +
        '<div class="avg-box"><span>Unit estimate</span><strong>' + statusEsc(statusFmt(statusUnitEstimate(data))) + '</strong></div></div>' +
        '<p class="avg-note">Each quarter uses the percent of the score tables and the exam score out of its highest possible score. The unit estimate is that final grade times the subject units.</p></div>' +
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
      empty.textContent = (e && e.message) ? e.message : 'The records could not be loaded. Refresh the page and try again.';
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
