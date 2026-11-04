var QG_quizzes = [];
var QG_scores = [];
var QG_openStudent = '';

function QG_esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function QG_norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.?!,;:]+$/g, '');
}
function QG_questions(quiz) {
  var qs = quiz && quiz.questions;
  if (typeof qs === 'string') {
    try { qs = JSON.parse(qs || '[]'); } catch (e) { qs = []; }
  }
  return Array.isArray(qs) ? qs : [];
}
function QG_parseList(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw) {
    try { var parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
  }
  return [];
}
function QG_auto(q, ans) {
  var pts = parseInt(q.points, 10) || 1;
  var type = q.type || 'mc';
  if (type === 'sa' || type === 'essay') return { review: true, earned: 0, max: pts, detail: '' };
  if (type === 'id') {
    var ok = (q.answers || []).some(function (a) { return QG_norm(a) && QG_norm(a) === QG_norm(ans); });
    return { review: false, earned: ok ? pts : 0, max: pts, detail: 'Accepted: ' + (q.answers || []).filter(Boolean).join(', ') };
  }
  if (type === 'mtf') {
    var expect = q.mtfMode === 'fix' ? String(q.mtfAnswer || '') : 'True';
    var okm = QG_norm(ans) === QG_norm(expect) || (QG_norm(expect) === 'true' && (QG_norm(ans) === 't' || QG_norm(ans) === 'true'));
    return { review: false, earned: okm ? pts : 0, max: pts, detail: 'Expected: ' + expect };
  }
  if (type === 'tf') {
    var want = (q.tfAnswer === 'true' || q.tfAnswer === true) ? 0 : 1;
    return { review: false, earned: ans === want ? pts : 0, max: pts, detail: 'Correct answer: ' + (want === 0 ? 'True' : 'False') };
  }
  if (type === 'match') {
    var pairs = q.pairs || [];
    var got = 0;
    pairs.forEach(function (p, i) {
      var pick = Array.isArray(ans) ? ans[i] : null;
      var key = (pick && typeof pick === 'object') ? pick.key : null;
      if (key === i || key === p.key) got++;
    });
    var earned = pairs.length ? Math.round(pts * got / pairs.length) : 0;
    return { review: false, earned: earned, max: pts, detail: got + ' of ' + pairs.length + ' pairs matched' };
  }
  var options = q.options || [];
  var correct = options.findIndex(function (o) { return o.correct; });
  return { review: false, earned: ans === correct ? pts : 0, max: pts, detail: 'Correct choice: ' + (options[correct] ? options[correct].text : '') };
}
function QG_answerText(q, ans) {
  var type = q.type || 'mc';
  if (ans === null || ans === undefined || ans === '') return 'No answer';
  if (type === 'mc') {
    var opt = (q.options || [])[ans];
    return opt ? opt.text : 'Choice ' + ans;
  }
  if (type === 'tf') return ans === 0 ? 'True' : ans === 1 ? 'False' : String(ans);
  if (type === 'match' && Array.isArray(ans)) {
    return (q.pairs || []).map(function (p, i) {
      var pick = ans[i];
      var text = (pick && typeof pick === 'object') ? (pick.text || '') : (pick === 0 || pick ? ('saved choice ' + pick) : '');
      return p.left + ' → ' + (text || 'blank');
    }).join('; ');
  }
  if (typeof ans === 'object') return JSON.stringify(ans);
  return String(ans);
}

async function QG_open() {
  var host = document.getElementById('grade-list');
  if (!host || !activeClassId) return;
  host.innerHTML = '<p class="qg-empty">Loading quizzes…</p>';
  try {
    QG_quizzes = await PrismQuizzes.get(activeClassId);
  } catch (e) {
    host.innerHTML = '<p class="qg-empty">Could not load quizzes.</p>';
    return;
  }
  QG_quizzes = (QG_quizzes || []).filter(function (q) { return String(q.published) === '1' || q.published === 1 || q.published === true; });
  var sel = document.getElementById('grade-quiz-select');
  if (!sel) return;
  var current = sel.value;
  var onchange = sel.onchange;
  sel.onchange = null;
  sel.innerHTML = QG_quizzes.length ? '' : '<option value="">No published quizzes yet</option>';
  QG_quizzes.forEach(function (q) {
    var opt = document.createElement('option');
    opt.value = q.id;
    var section = q.target_section ? ' · ' + q.target_section : '';
    opt.textContent = (q.title || 'Quiz') + section;
    sel.appendChild(opt);
  });
  sel.onchange = onchange;
  if (current && QG_quizzes.some(function (q) { return String(q.id) === String(current); })) sel.value = current;
  var preset = '';
  try { preset = new URLSearchParams(location.search).get('quiz') || ''; } catch (e2) { preset = ''; }
  if (preset && QG_quizzes.some(function (q) { return String(q.id) === String(preset); })) sel.value = preset;
  await QG_loadScores();
}

async function QG_loadScores() {
  var sel = document.getElementById('grade-quiz-select');
  var host = document.getElementById('grade-list');
  var detail = document.getElementById('grade-detail');
  if (!sel || !host) return;
  if (detail) detail.innerHTML = '';
  QG_openStudent = '';
  if (!sel.value) {
    host.innerHTML = '<p class="qg-empty">Publish a quiz in the Quizzes tab, then choose it here.</p>';
    return;
  }
  host.innerHTML = '<p class="qg-empty">Loading scores…</p>';
  try {
    var rows = await PrismQuizzes.getScores(sel.value);
    QG_scores = Array.isArray(rows) ? rows : [];
  } catch (e) {
    host.innerHTML = '<p class="qg-empty">Could not load scores.</p>';
    return;
  }
  QG_renderList();
}

function QG_renderList() {
  var host = document.getElementById('grade-list');
  var quiz = QG_quizzes.find(function (q) { return String(q.id) === String(document.getElementById('grade-quiz-select').value); });
  var filter = (document.getElementById('grade-student-filter').value || '').trim().toLowerCase();
  var rows = QG_scores.filter(function (row) {
    var name = String(row.student_name || row.student_id || '').toLowerCase();
    return !filter || name.indexOf(filter) !== -1;
  });
  if (!rows.length) {
    host.innerHTML = '<p class="qg-empty">' + (QG_scores.length ? 'No student matches that filter.' : 'No submissions for this quiz yet.') + '</p>';
    return;
  }
  var total = quiz ? (parseInt(quiz.total_points, 10) || 0) : 0;
  host.innerHTML = rows.map(function (row) {
    var when = row.taken_at ? new Date(String(row.taken_at).replace(' ', 'T')).toLocaleString() : '';
    return '<button type="button" class="qg-student" data-student="' + QG_esc(row.student_id) + '">'
      + '<span><b>' + QG_esc(row.student_name || row.student_id) + '</b><small>' + QG_esc(when) + '</small></span>'
      + '<strong>' + QG_esc(row.score) + ' / ' + total + '</strong></button>';
  }).join('');
  host.querySelectorAll('.qg-student').forEach(function (btn) {
    btn.onclick = function () { QG_showStudent(btn.getAttribute('data-student')); };
  });
}

function QG_showStudent(studentId) {
  var quiz = QG_quizzes.find(function (q) { return String(q.id) === String(document.getElementById('grade-quiz-select').value); });
  var row = QG_scores.find(function (r) { return String(r.student_id) === String(studentId); });
  var detail = document.getElementById('grade-detail');
  if (!quiz || !row || !detail) return;
  QG_openStudent = studentId;
  var questions = QG_questions(quiz);
  var answers = QG_parseList(row.answers);
  var saved = QG_parseList(row.item_scores);
  var blocks = questions.map(function (q, i) {
    var auto = QG_auto(q, answers[i]);
    var awarded = saved.length ? (parseInt(saved[i], 10) || 0) : auto.earned;
    var judged = saved.length ? awarded : auto.earned;
    var status = auto.review && !saved.length ? 'Needs review' : (judged >= auto.max && auto.max > 0 ? 'Correct' : (judged > 0 ? 'Partial' : 'Incorrect'));
    var cls = auto.review && !saved.length ? 'qg-wait' : (judged >= auto.max && auto.max > 0 ? 'qg-ok' : (judged > 0 ? 'qg-wait' : 'qg-bad'));
    return '<article class="qg-item ' + cls + '">'
      + '<div class="qg-status">' + status + '</div>'
      + '<h4>' + (i + 1) + '. ' + QG_esc(q.question || q.q || 'Question') + '</h4>'
      + '<p><b>Student:</b> ' + QG_esc(QG_answerText(q, answers[i])) + '</p>'
      + (auto.detail ? '<p class="qg-key">' + QG_esc(auto.detail) + '</p>' : '')
      + '<label>Points <input type="number" min="0" max="' + auto.max + '" data-qg-i="' + i + '" value="' + awarded + '"> / ' + auto.max + '</label>'
      + '</article>';
  }).join('');
  detail.innerHTML = '<div class="qg-detail-head"><h3>' + QG_esc(row.student_name || studentId) + '</h3>'
    + '<button type="button" class="t-btn" id="qg-save">Save scores</button></div>'
    + (blocks || '<p class="qg-empty">This quiz has no questions to review.</p>')
    + '<p class="qg-note" id="qg-note"></p>';
  var save = document.getElementById('qg-save');
  if (save) save.onclick = function () { QG_save(studentId, questions.length); };
}

async function QG_save(studentId, count) {
  var note = document.getElementById('qg-note');
  var values = [];
  for (var i = 0; i < count; i++) {
    var input = document.querySelector('[data-qg-i="' + i + '"]');
    var max = input ? parseInt(input.max, 10) : 0;
    var n = input ? parseInt(input.value, 10) : 0;
    if (isNaN(n) || n < 0) n = 0;
    if (max && n > max) n = max;
    values.push(n);
  }
  var btn = document.getElementById('qg-save');
  if (typeof prismSetBusy === 'function') prismSetBusy(btn, true, 'Saving…');
  try {
    var saved = await PrismQuizzes.reviewScore(document.getElementById('grade-quiz-select').value, studentId, values);
    var total = saved && saved.score != null ? saved.score : values.reduce(function (a, b) { return a + b; }, 0);
    await QG_loadScores();
    QG_showStudent(studentId);
    var done = document.getElementById('qg-note');
    if (done) done.textContent = 'Saved. Total is now ' + total + '.';
  } catch (e) {
    if (note) note.textContent = (e && e.message) ? e.message : 'Could not save scores.';
    if (typeof prismSetBusy === 'function') prismSetBusy(btn, false);
  }
}
