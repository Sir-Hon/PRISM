var QG_quizzes = [];
var QG_assignments = [];
var QG_scores = [];
var QG_log = [];
var QG_openStudent = '';
var QG_presetUsed = false;

function QG_category() {
  var el = document.getElementById('grade-category');
  var value = el ? el.value : 'quiz';
  if (value === 'exam' || value === 'activity' || value === 'assignment') return value;
  return 'quiz';
}
function QG_isAssignment() {
  return QG_category() === 'assignment';
}
function QG_quizKind(quiz) {
  var type = String(quiz && quiz.type || 'quiz').toLowerCase();
  if (type === 'exam' || type === 'activity') return type;
  return 'quiz';
}
function QG_hasScore(row) {
  return !!(row && row.score !== null && row.score !== undefined && row.score !== '');
}
function QG_currentQuiz() {
  var sel = document.getElementById('grade-quiz-select');
  return QG_quizzes.find(function (q) { return String(q.id) === String(sel && sel.value); });
}
function QG_currentAssignment() {
  var sel = document.getElementById('grade-quiz-select');
  return QG_assignments.find(function (item) { return String(item.id) === String(sel && sel.value); });
}
function QG_labels() {
  var cat = QG_category();
  var title = document.getElementById('grade-title');
  var lead = document.getElementById('grade-lead');
  var item = document.getElementById('grade-item-label');
  var heads = { quiz: 'Quiz grades', exam: 'Exam grades', activity: 'Activity grades', assignment: 'Assignment grades' };
  var leads = {
    quiz: 'Choose a quiz, then open a student to see each item. Short answers and essays stay unmarked until you set the points. You can change the points on any item.',
    exam: 'Choose an exam, then open a student to see each item. Short answers and essays stay unmarked until you set the points. You can change the points on any item.',
    activity: 'Choose an activity, then open a student to see each item. Short answers and essays stay unmarked until you set the points. You can change the points on any item.',
    assignment: 'Choose an assignment, then open a submission to give it a score.'
  };
  var items = { quiz: 'Quiz', exam: 'Exam', activity: 'Activity', assignment: 'Assignment' };
  if (title) title.textContent = heads[cat];
  if (lead) lead.textContent = leads[cat];
  if (item) item.textContent = items[cat];
}
function QG_fillSelect(rows, emptyText, labeler) {
  var sel = document.getElementById('grade-quiz-select');
  if (!sel) return;
  var current = sel.value;
  var onchange = sel.onchange;
  sel.onchange = null;
  sel.innerHTML = '';
  if (!rows.length) {
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = emptyText;
    sel.appendChild(empty);
  }
  rows.forEach(function (row) {
    var opt = document.createElement('option');
    opt.value = row.id;
    opt.textContent = labeler(row);
    sel.appendChild(opt);
  });
  sel.onchange = onchange;
  if (current && rows.some(function (row) { return String(row.id) === String(current); })) sel.value = current;
}

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
  QG_labels();
  var cat = QG_category();
  host.innerHTML = '<p class="qg-empty">Loading ' + (cat === 'assignment' ? 'assignments' : cat === 'exam' ? 'exams' : cat === 'activity' ? 'activities' : 'quizzes') + '…</p>';
  if (cat === 'assignment') {
    try {
      QG_assignments = await PrismAssignments.get(activeClassId);
    } catch (e) {
      host.innerHTML = '<p class="qg-empty">Could not load assignments.</p>';
      return;
    }
    QG_assignments = QG_assignments || [];
    var typeNames = { written: 'Written', project: 'Project', lab: 'Lab', oral: 'Oral' };
    QG_fillSelect(QG_assignments, 'No assignments yet', function (item) {
      var kind = typeNames[item.type] ? typeNames[item.type] + ' · ' : '';
      var section = item.target_section ? ' · ' + item.target_section : '';
      return kind + (item.title || 'Assignment') + section;
    });
    await QG_loadScores();
    return;
  }
  var all = [];
  try {
    all = await PrismQuizzes.get(activeClassId);
  } catch (e2) {
    host.innerHTML = '<p class="qg-empty">Could not load ' + (cat === 'exam' ? 'exams' : cat === 'activity' ? 'activities' : 'quizzes') + '.</p>';
    return;
  }
  all = (all || []).filter(function (q) { return String(q.published) === '1' || q.published === 1 || q.published === true; });
  if (!QG_presetUsed) {
    QG_presetUsed = true;
    var preset = '';
    try { preset = new URLSearchParams(location.search).get('quiz') || ''; } catch (e3) { preset = ''; }
    var presetQuiz = preset && all.find(function (q) { return String(q.id) === String(preset); });
    var presetCat = presetQuiz ? QG_quizKind(presetQuiz) : '';
    var category = document.getElementById('grade-category');
    if (presetCat && category && category.value !== presetCat) {
      category.value = presetCat;
      QG_labels();
      cat = presetCat;
    }
  }
  QG_quizzes = all.filter(function (q) { return QG_quizKind(q) === cat; });
  var empty = { quiz: 'No published quizzes yet', exam: 'No published exams yet', activity: 'No published activities yet' };
  QG_fillSelect(QG_quizzes, empty[cat] || 'Nothing in this category yet', function (q) {
    var section = q.target_section ? ' · ' + q.target_section : '';
    return (q.title || 'Untitled') + section;
  });
  var sel = document.getElementById('grade-quiz-select');
  var presetId = '';
  try { presetId = new URLSearchParams(location.search).get('quiz') || ''; } catch (e4) { presetId = ''; }
  if (sel && presetId && QG_quizzes.some(function (q) { return String(q.id) === String(presetId); })) sel.value = presetId;
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
    var waiting = QG_isAssignment()
      ? 'Create an assignment in Classwork, then choose it here.'
      : 'Publish one in the Quizzes tab, then choose it here.';
    host.innerHTML = '<p class="qg-empty">' + waiting + '</p>';
    return;
  }
  host.innerHTML = '<p class="qg-empty">Loading scores…</p>';
  if (QG_isAssignment()) {
    try {
      var submissions = await PrismSubmissions.getAll(sel.value);
      QG_scores = (Array.isArray(submissions) ? submissions : []).map(function (row) {
        return {
          student_id: row.student_id,
          student_name: row.student_name,
          score: row.score,
          taken_at: row.submitted_at,
          note: row.note || '',
          link_url: row.link_url || '',
          file_name: row.file_name || ''
        };
      });
    } catch (e) {
      host.innerHTML = '<p class="qg-empty">Could not load submissions.</p>';
      return;
    }
    QG_log = [];
    QG_renderList();
    return;
  }
  try {
    var rows = await PrismQuizzes.getScores(sel.value);
    QG_scores = Array.isArray(rows) ? rows : [];
  } catch (e) {
    host.innerHTML = '<p class="qg-empty">Could not load scores.</p>';
    return;
  }
  try {
    var log = await PrismQuizzes.getLog(sel.value);
    QG_log = Array.isArray(log) ? log : [];
  } catch (e2) {
    QG_log = [];
  }
  QG_renderList();
}

function QG_leaveEvents(studentId) {
  return (QG_log || []).filter(function (e) {
    return String(e.student_id) === String(studentId) && (e.type === 'tab-switch' || e.type === 'abandon');
  });
}
function QG_leaveLabel(events) {
  var tabs = events.filter(function (e) { return e.type === 'tab-switch'; }).length;
  var left = events.filter(function (e) { return e.type === 'abandon'; }).length;
  var parts = [];
  if (tabs) parts.push(tabs === 1 ? 'Switched tabs once' : 'Switched tabs ' + tabs + ' times');
  if (left) parts.push(left === 1 ? 'Tried to leave' : 'Tried to leave ' + left + ' times');
  return parts.join(' · ');
}
function QG_leaveHtml(studentId) {
  var events = QG_leaveEvents(studentId);
  if (!events.length) return '';
  var lines = events.map(function (e) {
    var when = e.logged_at || e.time || '';
    var shown = when ? new Date(String(when).replace(' ', 'T')).toLocaleString() : '';
    var what = e.type === 'abandon' ? 'Tried to leave' : 'Switched tabs';
    return '<p><b>' + QG_esc(what) + '</b>' + (shown ? ' · ' + QG_esc(shown) : '') + (e.detail ? ' · ' + QG_esc(e.detail) : '') + '</p>';
  }).join('');
  return '<div class="qg-flags"><h4>' + QG_esc(QG_leaveLabel(events)) + '</h4>' + lines + '</div>';
}
function QG_people() {
  var order = [];
  var byId = {};
  (QG_scores || []).forEach(function (row) {
    var id = String(row.student_id);
    if (byId[id]) return;
    byId[id] = { id: id, name: row.student_name || row.student_id, score: row };
    order.push(id);
  });
  (QG_log || []).forEach(function (e) {
    if (e.type !== 'tab-switch' && e.type !== 'abandon') return;
    var id = String(e.student_id || '');
    if (!id || byId[id]) return;
    byId[id] = { id: id, name: e.student_name || id, score: null };
    order.push(id);
  });
  return order.map(function (id) { return byId[id]; });
}

function QG_renderList() {
  var host = document.getElementById('grade-list');
  var quiz = QG_isAssignment() ? null : QG_currentQuiz();
  var assignment = QG_isAssignment() ? QG_currentAssignment() : null;
  var filter = (document.getElementById('grade-student-filter').value || '').trim().toLowerCase();
  var people = QG_people().filter(function (person) {
    var name = String(person.name || '').toLowerCase();
    return !filter || name.indexOf(filter) !== -1;
  });
  if (!people.length) {
    var noun = QG_isAssignment() ? 'assignment' : (QG_category() === 'exam' ? 'exam' : QG_category() === 'activity' ? 'activity' : 'quiz');
    host.innerHTML = '<p class="qg-empty">' + (QG_people().length ? 'No student matches that filter.' : 'No submissions for this ' + noun + ' yet.') + '</p>';
    return;
  }
  var total = assignment ? (parseInt(assignment.points || assignment.pts, 10) || 0) : (quiz ? (parseInt(quiz.total_points, 10) || 0) : 0);
  host.innerHTML = people.map(function (person) {
    var row = person.score;
    var when = row && row.taken_at ? new Date(String(row.taken_at).replace(' ', 'T')).toLocaleString() : '';
    var flag = QG_leaveLabel(QG_leaveEvents(person.id));
    var whenHtml = QG_esc(when);
    if (flag) whenHtml += (when ? ' · ' : '') + '<span class="qg-flag">' + QG_esc(flag) + '</span>';
    var open = String(QG_openStudent) === String(person.id);
    var scoreText = 'No score';
    if (row && QG_isAssignment()) scoreText = QG_hasScore(row) ? (QG_esc(row.score) + (total ? ' / ' + total : '')) : 'Not graded';
    else if (row) scoreText = QG_esc(row.score) + ' / ' + total;
    return '<button type="button" class="qg-student' + (open ? ' is-open' : '') + (flag ? ' has-flag' : '') + '" data-student="' + QG_esc(person.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '">'
      + '<span><b>' + QG_esc(person.name) + '</b><small>' + whenHtml + '</small></span>'
      + '<strong>' + scoreText + '</strong></button>';
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
  if (QG_isAssignment()) {
    QG_showAssignment(studentId);
    return;
  }
  var quiz = QG_currentQuiz();
  var person = QG_people().find(function (p) { return String(p.id) === String(studentId); });
  var row = person && person.score;
  var detail = document.getElementById('grade-detail');
  if (!quiz || !person || !detail) return;
  QG_openStudent = studentId;
  if (!row) {
    detail.innerHTML = '<div class="qg-detail-head"><h3>' + QG_esc(person.name) + '</h3></div>'
      + QG_leaveHtml(studentId)
      + '<p class="qg-empty">No submission yet.</p>';
    QG_markOpenStudent();
    return;
  }
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
    + QG_leaveHtml(studentId)
    + (blocks || '<p class="qg-empty">This quiz has no questions to review.</p>')
    + '<p class="qg-note" id="qg-note"></p>';
  var save = document.getElementById('qg-save');
  if (save) save.onclick = function () { QG_save(studentId, questions.length); };
  QG_markOpenStudent();
  requestAnimationFrame(QG_drawMatchBoards);
}

function QG_safeLink(url) {
  var raw = String(url || '').trim();
  if (typeof prismNormalizeHttpUrl === 'function') return prismNormalizeHttpUrl(raw) || '';
  return /^https?:\/\//i.test(raw) ? raw : '';
}
function QG_showAssignment(studentId) {
  var assignment = QG_currentAssignment();
  var person = QG_people().find(function (p) { return String(p.id) === String(studentId); });
  var row = person && person.score;
  var detail = document.getElementById('grade-detail');
  if (!assignment || !person || !detail) return;
  QG_openStudent = studentId;
  if (!row) {
    detail.innerHTML = '<div class="qg-detail-head"><h3>' + QG_esc(person.name) + '</h3></div><p class="qg-empty">No submission yet.</p>';
    QG_markOpenStudent();
    return;
  }
  var total = parseInt(assignment.points || assignment.pts, 10) || 0;
  var href = QG_safeLink(row.link_url);
  var bits = '';
  if (row.note) bits += '<p>' + QG_esc(row.note) + '</p>';
  if (href) bits += '<p><a href="' + QG_esc(href) + '" target="_blank" rel="noopener">Open the submitted link</a></p>';
  if (row.file_name) bits += '<p>File: ' + QG_esc(row.file_name) + '</p>';
  detail.innerHTML = '<div class="qg-detail-head"><h3>' + QG_esc(row.student_name || studentId) + '</h3>'
    + '<button type="button" class="t-btn" id="qg-save">Save score</button></div>'
    + (bits || '<p class="qg-note">No note or file was attached.</p>')
    + '<label>Points <input type="number" min="0"' + (total ? ' max="' + total + '"' : '') + ' id="qg-asgn-score" value="' + (QG_hasScore(row) ? QG_esc(row.score) : '') + '">' + (total ? ' / ' + total : '') + '</label>'
    + '<p class="qg-note" id="qg-note"></p>';
  var save = document.getElementById('qg-save');
  if (save) save.onclick = function () { QG_saveAssignment(studentId); };
  QG_markOpenStudent();
}
async function QG_saveAssignment(studentId) {
  var note = document.getElementById('qg-note');
  var input = document.getElementById('qg-asgn-score');
  var max = input ? parseInt(input.max, 10) : 0;
  var n = input ? parseInt(input.value, 10) : NaN;
  if (isNaN(n) || n < 0) n = 0;
  if (max && n > max) n = max;
  var btn = document.getElementById('qg-save');
  if (typeof prismSetBusy === 'function') prismSetBusy(btn, true, 'Saving…');
  try {
    var sel = document.getElementById('grade-quiz-select');
    await PrismSubmissions.grade(sel.value, studentId, n);
    await QG_loadScores();
    QG_showAssignment(studentId);
    var done = document.getElementById('qg-note');
    if (done) done.textContent = 'Saved. Score is now ' + n + '.';
  } catch (e) {
    if (note) note.textContent = (e && e.message) ? e.message : 'Could not save the score.';
    if (typeof prismSetBusy === 'function') prismSetBusy(btn, false);
  }
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
