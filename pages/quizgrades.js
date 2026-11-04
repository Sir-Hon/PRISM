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
  return (Array.isArray(qs) ? qs : []).filter(function (q) { return q && q.type !== 'part'; });
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
    var model = QG_matchModel(q, ans);
    var got = 0;
    model.pairs.forEach(function (p, i) {
      var slot = model.picks[i];
      var right = slot >= 0 ? model.rights[slot] : null;
      if (right && (right.key === i || right.key === p.key)) got++;
    });
    var earned = model.pairs.length ? Math.round(pts * got / model.pairs.length) : 0;
    return { review: false, earned: earned, max: pts, detail: got + ' of ' + model.pairs.length + ' pairs matched' };
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
  if (type === 'match' && Array.isArray(ans)) return '';
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
    var open = String(QG_openStudent) === String(row.student_id);
    return '<button type="button" class="qg-student' + (open ? ' is-open' : '') + '" data-student="' + QG_esc(row.student_id) + '" aria-expanded="' + (open ? 'true' : 'false') + '">'
      + '<span><b>' + QG_esc(row.student_name || row.student_id) + '</b><small>' + QG_esc(when) + '</small></span>'
      + '<strong>' + QG_esc(row.score) + ' / ' + total + '</strong></button>';
  }).join('');
  host.querySelectorAll('.qg-student').forEach(function (btn) {
    btn.onclick = function () {
      var id = btn.getAttribute('data-student');
      if (String(QG_openStudent) === String(id)) QG_closeStudent();
      else QG_showStudent(id);
    };
  });
}

function QG_matchModel(q, ans) {
  var pairs = q.pairs || [];
  var order = Array.isArray(q.bankOrder) ? q.bankOrder.map(function (k) { return parseInt(k, 10); }) : [];
  var seen = {};
  var ok = order.length === pairs.length;
  order.forEach(function (k) { if (!(k >= 0) || k >= pairs.length || seen[k]) ok = false; seen[k] = true; });
  if (!ok) order = pairs.map(function (_, i) { return i; });
  var rights = order.map(function (key) {
    return { key: key, text: (pairs[key] && pairs[key].right) || '' };
  });
  var picks = pairs.map(function (_, i) {
    var pick = Array.isArray(ans) ? ans[i] : null;
    if (pick && typeof pick === 'object') {
      var byKey = rights.findIndex(function (r) { return r.key === pick.key; });
      if (byKey < 0 && pick.text) byKey = rights.findIndex(function (r) { return r.text && r.text === pick.text; });
      return byKey;
    }
    if (pick === 0 || typeof pick === 'number' || (pick && !isNaN(pick))) {
      var bi = parseInt(pick, 10);
      return rights[bi] ? bi : -1;
    }
    return -1;
  });
  return { pairs: pairs, rights: rights, picks: picks };
}
function QG_matchHtml(q, ans) {
  var model = QG_matchModel(q, ans);
  var left = model.pairs.map(function (p, i) {
    return '<div class="match-item"><span>' + QG_esc(p.left || '') + '</span><i class="match-dot" data-from="' + i + '"></i></div>';
  }).join('');
  var right = model.rights.map(function (r, slot) {
    return '<div class="match-item"><i class="match-dot" data-to="' + slot + '"></i><span>' + QG_esc(r.text || '') + '</span></div>';
  }).join('');
  var correct = model.pairs.map(function (_, i) {
    return model.rights.findIndex(function (r) { return r.key === i; });
  }).join(',');
  return '<div class="qg-match" data-picks="' + model.picks.join(',') + '" data-correct="' + correct + '">'
    + '<div class="match-col"><h4>Column A</h4>' + left + '</div>'
    + '<div class="match-col"><h4>Column B</h4>' + right + '</div>'
    + '<svg class="match-lines"></svg></div>'
    + '<p class="qg-match-legend">Solid line is the student. Dashed line is the correct answer.</p>';
}
function QG_drawMatchBoards() {
  document.querySelectorAll('.qg-match').forEach(function (board) {
    var svg = board.querySelector('.match-lines');
    if (!svg) return;
    var rect = board.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    svg.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
    function center(el) {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - rect.left, y: r.top + r.height / 2 - rect.top };
    }
    var picks = String(board.getAttribute('data-picks') || '').split(',').map(function (n) { return parseInt(n, 10); });
    var correct = String(board.getAttribute('data-correct') || '').split(',').map(function (n) { return parseInt(n, 10); });
    board.querySelectorAll('.match-dot').forEach(function (dot) {
      dot.classList.remove('used');
      dot.style.removeProperty('--dot');
    });
    var lines = '';
    function line(from, to, color, dash) {
      var a = board.querySelector('[data-from="' + from + '"]');
      var b = board.querySelector('[data-to="' + to + '"]');
      if (!a || !b || !(to >= 0)) return;
      var p1 = center(a);
      var p2 = center(b);
      a.classList.add('used');
      b.classList.add('used');
      if (!dash) {
        a.style.setProperty('--dot', color);
        b.style.setProperty('--dot', color);
      }
      lines += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"' + (dash ? ' stroke-dasharray="5 4"' : '') + '/>';
    }
    picks.forEach(function (slot, i) {
      var good = slot === correct[i] && slot >= 0;
      if (slot >= 0) line(i, slot, good ? '#059669' : '#dc2626', false);
      if (!good && correct[i] >= 0) line(i, correct[i], '#059669', true);
    });
    svg.innerHTML = lines;
  });
}
function QG_markOpenStudent() {
  document.querySelectorAll('.qg-student').forEach(function (el) {
    var open = String(el.getAttribute('data-student')) === String(QG_openStudent);
    el.classList.toggle('is-open', open);
    el.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}
function QG_closeStudent() {
  QG_openStudent = '';
  var detail = document.getElementById('grade-detail');
  if (detail) detail.innerHTML = '';
  QG_markOpenStudent();
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
      + ((q.type || 'mc') === 'match'
        ? QG_matchHtml(q, answers[i])
        : '<p><b>Student:</b> ' + QG_esc(QG_answerText(q, answers[i])) + '</p>')
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
  QG_markOpenStudent();
  requestAnimationFrame(QG_drawMatchBoards);
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
