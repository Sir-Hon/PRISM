/** Page script for quizzes.html — keep HTML in the .html file. */
/* ── SHARED QUIZ ENGINE ── */
var QUIZ_currentQuiz   = null;
var QUIZ_currentQ      = 0;
var QUIZ_userAnswers   = [];
var QUIZ_answered      = [];
var QUIZ_startTime     = null;
var QUIZ_tabWarnings   = 0;
var QUIZ_active        = false;
var QUIZ_reopenClassId = null;
var QUIZ_timerId       = null;
var QUIZ_timeEndsAt    = null;
var QUIZ_timedOut      = false;
var QUIZ_showMissing   = false;
var PRISM_LATE_QUIZ_MSG = 'This quiz is past its due date. If you need more time, please contact your teacher.';

function QUIZ_quizDueDate(q) {
  return (q && (q.due || q.due_date || '')) || '';
}
function QUIZ_isPastDue(q) {
  var d = QUIZ_quizDueDate(q);
  if (!d) return false;
  if (typeof prismIsPastDue === 'function') return prismIsPastDue(d, q.due_time);
  var today = new Date().toISOString().split('T')[0];
  return d < today;
}
function QUIZ_normalizeQuizFields(raw) {
  if (!raw) return raw;
  if (!raw.due && raw.due_date) raw.due = raw.due_date;
  if (!raw.due_time && raw.dueTime) raw.due_time = raw.dueTime;
  var tl = parseInt(raw.time_limit, 10);
  if (!raw.time && tl) raw.time = tl;
  return raw;
}
function QUIZ_removeViewportTimer() {
  var w = document.getElementById('quiz-viewport-timer');
  if (w) w.remove();
}
function QUIZ_ensureViewportTimer() {
  if (!QUIZ_active || !QUIZ_timeEndsAt) {
    QUIZ_removeViewportTimer();
    return;
  }
  var wrap = document.getElementById('quiz-viewport-timer');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'quiz-viewport-timer';
    wrap.setAttribute('aria-live', 'polite');
    wrap.style.cssText =
      'position:fixed;top:max(12px,env(safe-area-inset-top,0px));right:max(12px,env(safe-area-inset-right,0px));'
      + 'z-index:10050;display:flex;flex-direction:column;align-items:flex-end;gap:3px;pointer-events:none;'
      + 'padding:10px 14px;background:rgba(15,10,30,.88);border-radius:14px;border:1px solid rgba(167,139,250,.45);'
      + 'box-shadow:0 8px 32px rgba(0,0,0,.35);font-family:DM Sans,system-ui,sans-serif;';
    wrap.innerHTML =
      '<span style="font-size:10px;font-weight:800;color:#c4b5fd;text-transform:uppercase;letter-spacing:.09em;">Time left</span>'
      + '<span id="quiz-timer-display" style="font-family:DM Sans,system-ui,sans-serif;font-size:1.65rem;font-weight:800;color:#f5f3ff;line-height:1;">--:--</span>';
    document.body.appendChild(wrap);
  }
}
function QUIZ_clearTimer() {
  if (QUIZ_timerId) {
    clearInterval(QUIZ_timerId);
    QUIZ_timerId = null;
  }
  QUIZ_timeEndsAt = null;
  QUIZ_removeViewportTimer();
}
function QUIZ_tickTimer() {
  if (!QUIZ_active || !QUIZ_currentQuiz || !QUIZ_timeEndsAt) return;
  var el = document.getElementById('quiz-timer-display');
  var left = Math.max(0, Math.floor((QUIZ_timeEndsAt - Date.now()) / 1000));
  if (el) {
    var m = Math.floor(left / 60);
    var s = left % 60;
    el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    el.style.color = left <= 60 ? '#fca5a5' : '#f5f3ff';
  }
  if (left <= 0) {
    QUIZ_clearTimer();
    QUIZ_timedOut = true;
    alert('Time is up. Your quiz will be submitted now.');
    QUIZ_finish();
  }
}

function QUIZ_getScores() {
  var uid = sessionStorage.getItem('prism_user_id') || 'student';
  return JSON.parse(localStorage.getItem('prism_quiz_scores_' + uid) || '{}');
}
function QUIZ_saveScores(v) {
  var uid = sessionStorage.getItem('prism_user_id') || 'student';
  localStorage.setItem('prism_quiz_scores_' + uid, JSON.stringify(v));
}
function QUIZ_logEvent(type, detail) {
  if (!QUIZ_currentQuiz) return;
  var uid   = sessionStorage.getItem('prism_user_id') || 'student';
  var uname = sessionStorage.getItem('prism_user_name') || uid;
  var key   = 'prism_quiz_log_' + QUIZ_currentQuiz.classId + '_' + QUIZ_currentQuiz.id;
  var log   = JSON.parse(localStorage.getItem(key) || '[]');
  log.push({ student: uname, studentId: uid, type: type, detail: detail, time: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(log));
  if (typeof PrismQuizzes !== 'undefined' && PrismQuizzes.log) {
    PrismQuizzes.log(QUIZ_currentQuiz.id, type, detail).catch(function () { /* local log is enough */ });
  }
}
function QUIZ_onBeforeUnload(e) {
  if (!QUIZ_active) return;
  QUIZ_logEvent('abandon', 'Student attempted to close/navigate away');
  QUIZ_burnAttemptSilent();
  var msg = 'You have an active quiz. Leaving will count as an attempt.';
  e.preventDefault(); e.returnValue = msg; return msg;
}
function QUIZ_onVisibility() {
  if (!QUIZ_active) return;
  if (document.hidden) {
    QUIZ_tabWarnings++;
    QUIZ_logEvent('tab-switch', 'Student switched tab/window (warning #' + QUIZ_tabWarnings + ')');
    var banner = document.getElementById('quiz-security-banner');
    if (banner) {
      banner.textContent = 'Tab switch detected. Your teacher has been notified. (Warning ' + QUIZ_tabWarnings + ')';
      banner.style.display = 'block';
      setTimeout(function() { if (banner) banner.style.display = 'none'; }, 4000);
    }
  }
}
function QUIZ_burnAttemptSilent() {
  if (!QUIZ_currentQuiz) return;
  var uid = sessionStorage.getItem('prism_user_id') || 'student';
  var q = QUIZ_currentQuiz;
  var graded = QUIZ_gradeQuiz(q, QUIZ_userAnswers || []);
  var mcCorrect = graded.earned;
  var attKey = 'prism_quiz_attempts_' + uid;
  var atts   = JSON.parse(localStorage.getItem(attKey) || '{}');
  atts[q.id] = (atts[q.id] || 0) + 1;
  localStorage.setItem(attKey, JSON.stringify(atts));
  localStorage.setItem('prism_quiz_mc_' + uid + '_' + q.id, String(mcCorrect));
  var scores = QUIZ_getScores();
  scores[q.id] = mcCorrect;
  QUIZ_saveScores(scores);
  if (typeof PrismQuizzes !== 'undefined' && PrismQuizzes.submitScore) {
    PrismQuizzes.submitScore(q.id, mcCorrect, (QUIZ_userAnswers || []).slice()).catch(function () { /* local score is enough */ });
  }
}
function QUIZ_esc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function QUIZ_norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.?!,;:]+$/g, '');
}
function QUIZ_textMatch(ans, list) {
  var n = QUIZ_norm(ans);
  if (!n) return false;
  return (list || []).some(function (item) { return QUIZ_norm(item) === n; });
}
function QUIZ_typeLabel(type) {
  return ({
    mc: 'Multiple choice',
    tf: 'True / False',
    mtf: 'Modified true or false',
    id: 'Identification',
    match: 'Matching',
    sa: 'Short answer',
    essay: 'Essay'
  })[type] || 'Question';
}
function QUIZ_allowSkip() {
  var q = QUIZ_currentQuiz || {};
  return !!(q.allowSkip || q.allow_skip === 1 || q.allow_skip === '1' || q.allow_skip === true);
}
function QUIZ_shuffle(list) {
  var a = list.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function QUIZ_isFilled(q, ans) {
  if (!q) return false;
  if (q.type === 'match') {
    if (!Array.isArray(ans) || !q.pairs) return false;
    return q.pairs.every(function (_, i) { return ans[i] !== null && ans[i] !== undefined && ans[i] !== ''; });
  }
  if (q.type === 'sa' || q.type === 'essay' || q.type === 'id' || q.type === 'mtf') {
    return String(ans || '').trim() !== '';
  }
  return ans !== null && ans !== undefined && ans !== '';
}
function QUIZ_gradeOne(q, ans) {
  var pts = parseInt(q.points, 10) || 1;
  if (q.type === 'sa' || q.type === 'essay') return { review: pts, earned: 0, auto: 0 };
  if (q.type === 'id') {
    return { review: 0, earned: QUIZ_textMatch(ans, q.accept || []) ? pts : 0, auto: pts };
  }
  if (q.type === 'mtf') {
    var list = [q.key || ''];
    if (QUIZ_norm(q.key) === 'true') list = list.concat(['true', 't']);
    return { review: 0, earned: QUIZ_textMatch(ans, list) ? pts : 0, auto: pts };
  }
  if (q.type === 'match') {
    var pairs = q.pairs || [];
    var got = 0;
    pairs.forEach(function (p, i) {
      var pick = Array.isArray(ans) ? ans[i] : null;
      if (pick === null || pick === undefined || pick === '' || pick !== pick) return;
      var bankItem = q.bank && q.bank[pick];
      if (bankItem && bankItem.key === p.key) got++;
    });
    return { review: 0, earned: pairs.length ? Math.round(pts * got / pairs.length) : 0, auto: pts };
  }
  return { review: 0, earned: ans === q.answer ? pts : 0, auto: pts };
}
function QUIZ_gradeQuiz(quiz, answers) {
  var earned = 0, auto = 0, review = 0;
  (quiz.questions || []).forEach(function (q, i) {
    var g = QUIZ_gradeOne(q, answers ? answers[i] : null);
    earned += g.earned; auto += g.auto; review += g.review;
  });
  return { earned: earned, auto: auto, review: review };
}
function QUIZ_missingItems() {
  var out = [];
  if (!QUIZ_currentQuiz) return out;
  QUIZ_currentQuiz.questions.forEach(function (q, i) {
    if (!QUIZ_isFilled(q, QUIZ_userAnswers[i])) out.push(i);
  });
  return out;
}
function QUIZ_normalizeQuestion(raw) {
  var type = raw.type || 'mc';
  var out = {
    q:       raw.q || raw.question || '(no question text)',
    type:    type,
    points:  parseInt(raw.points, 10) || 1,
    explain: raw.explain || raw.explanation || '',
    image:   raw.image || ''
  };
  if (type === 'sa' || type === 'essay') {
    out.choices = undefined;
  } else if (type === 'tf') {
    out.choices = ['True', 'False'];
    out.answer  = (raw.tfAnswer === 'true' || raw.tfAnswer === true) ? 0 : 1;
  } else if (type === 'mtf') {
    out.choices = undefined;
    out.key = raw.mtfMode === 'fix' ? String(raw.mtfAnswer || '').trim() : 'True';
  } else if (type === 'id') {
    out.choices = undefined;
    out.accept = (raw.answers || []).map(function (a) { return String(a || '').trim(); }).filter(Boolean);
  } else if (type === 'match') {
    out.choices = undefined;
    out.pairs = (raw.pairs || []).map(function (p, i) {
      return { left: String(p.left || ''), right: String(p.right || ''), key: i };
    }).filter(function (p) { return p.left.trim() && p.right.trim(); });
    out.bank = QUIZ_shuffle(out.pairs.map(function (p) { return { text: p.right, key: p.key }; }));
  } else {
    out.type = 'mc';
    if (raw.options && raw.options.length) {
      out.choices = raw.options.map(function(o) { return o.text || ''; });
      out.answer  = raw.options.findIndex(function(o) { return o.correct; });
      if (out.answer < 0) out.answer = 0;
    } else if (raw.choices) {
      out.choices = raw.choices;
      out.answer  = raw.answer || 0;
    } else {
      out.choices = undefined;
    }
  }
  return out;
}
function QUIZ_open(qid, sourceQuizzes) {
  var all = sourceQuizzes || JSON.parse(localStorage.getItem('prism_teacher_quizzes') || '[]');
  var raw = all.find(function(q) { return String(q.id) === String(qid); });
  if (!raw) {
    alert('This quiz is no longer available. Refresh the page and try again.');
    return;
  }
  QUIZ_normalizeQuizFields(raw);
  if (typeof raw.questions === 'string') {
    try { raw.questions = JSON.parse(raw.questions || '[]'); } catch (e) { raw.questions = []; }
  }
  if (!Array.isArray(raw.questions) || !raw.questions.length) {
    alert('This quiz has no questions yet. Ask your teacher to publish it again.');
    return;
  }
  if (QUIZ_isPastDue(raw)) {
    alert(PRISM_LATE_QUIZ_MSG);
    return;
  }
  QUIZ_currentQuiz = JSON.parse(JSON.stringify(raw));
  QUIZ_currentQuiz.allowSkip = !!(raw.allowSkip || +raw.allow_skip);
  QUIZ_currentQuiz.questions = QUIZ_currentQuiz.questions.map(QUIZ_normalizeQuestion);
  QUIZ_showMissing = false;
  QUIZ_currentQ    = 0;
  QUIZ_userAnswers = new Array(QUIZ_currentQuiz.questions.length).fill(null);
  QUIZ_answered    = new Array(QUIZ_currentQuiz.questions.length).fill(false);
  QUIZ_startTime   = Date.now();
  QUIZ_tabWarnings = 0;
  QUIZ_timedOut    = false;
  QUIZ_active      = true;
  QUIZ_clearTimer();
  var tlMin = parseInt(QUIZ_currentQuiz.time, 10) || parseInt(QUIZ_currentQuiz.time_limit, 10) || 0;
  if (tlMin > 0) {
    QUIZ_timeEndsAt = Date.now() + tlMin * 60000;
    QUIZ_ensureViewportTimer();
    QUIZ_timerId = setInterval(QUIZ_tickTimer, 1000);
    QUIZ_tickTimer();
  }
  (function(){
    var uid=sessionStorage.getItem('prism_user_id')||'student';
    var ip=JSON.parse(localStorage.getItem('prism_quiz_inprogress_'+uid)||'{}');
    ip[QUIZ_currentQuiz.id]=Date.now();
    localStorage.setItem('prism_quiz_inprogress_'+uid,JSON.stringify(ip));
  })();
  QUIZ_logEvent('start', 'Quiz started');
  window.addEventListener('beforeunload', QUIZ_onBeforeUnload);
  document.addEventListener('visibilitychange', QUIZ_onVisibility);
  var overlay = document.getElementById('shared-qz-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'shared-qz-overlay';
  overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(10,10,20,.78);backdrop-filter:blur(8px);z-index:9999;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div id="shared-qz-modal" style="background:#fff;border-radius:22px;width:720px;max-width:95vw;max-height:92vh;overflow-y:auto;box-shadow:0 24px 70px rgba(0,0,0,.3);position:relative;">'
    + '<div id="quiz-security-banner" style="display:none;background:#fef3c7;color:#92400e;font-size:.82rem;font-weight:700;padding:.65rem 1.2rem;border-radius:12px 12px 0 0;text-align:center;"></div>'
    + '<div id="shared-qz-inner"></div>'
    + '</div>';
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', QUIZ_blockEsc, true);
  QUIZ_renderQuestion();
}
function QUIZ_blockEsc(e) { if (e.key === 'Escape' && QUIZ_active) e.stopImmediatePropagation(); }
function QUIZ_close() {
  if (QUIZ_active) return;
  var overlay = document.getElementById('shared-qz-overlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
  window.removeEventListener('beforeunload', QUIZ_onBeforeUnload);
  document.removeEventListener('visibilitychange', QUIZ_onVisibility);
  document.removeEventListener('keydown', QUIZ_blockEsc, true);
  QUIZ_currentQuiz = null;
  if (typeof renderGrid === 'function') renderGrid();
}
function QUIZ_captureCurrent() {
  var q = QUIZ_currentQuiz && QUIZ_currentQuiz.questions[QUIZ_currentQ];
  if (!q) return;
  if (q.type === 'match') {
    var arr = [];
    (q.pairs || []).forEach(function (_, i) {
      var el = document.getElementById('match-' + QUIZ_currentQ + '-' + i);
      arr[i] = el && el.value !== '' ? parseInt(el.value, 10) : null;
    });
    QUIZ_userAnswers[QUIZ_currentQ] = arr;
    QUIZ_answered[QUIZ_currentQ] = QUIZ_isFilled(q, arr);
    return;
  }
  var field = document.getElementById('qz-write-' + QUIZ_currentQ);
  if (field) {
    QUIZ_userAnswers[QUIZ_currentQ] = field.value;
    QUIZ_answered[QUIZ_currentQ] = !!field.value.trim();
  }
}
function QUIZ_jump(i) {
  QUIZ_captureCurrent();
  QUIZ_currentQ = i;
  QUIZ_renderQuestion();
}
function QUIZ_missingHtml(missing) {
  if (!QUIZ_showMissing || !missing.length) return '';
  var lines = missing.map(function (i) {
    var item = QUIZ_currentQuiz.questions[i];
    var text = String(item.q || '').replace(/\s+/g, ' ').trim();
    if (text.length > 72) text = text.slice(0, 72) + '\u2026';
    return '<button type="button" onclick="QUIZ_jump(' + i + ')">Question ' + (i + 1) + ' \u00b7 ' + QUIZ_esc(QUIZ_typeLabel(item.type)) + (text ? ' \u00b7 ' + QUIZ_esc(text) : '') + '</button>';
  }).join('');
  var lead = missing.length === 1
    ? 'Question ' + (missing[0] + 1) + ' still needs an answer.'
    : 'These questions still need an answer.';
  return '<div class="qz-missing"><strong>' + lead + '</strong><p>Finish the missing answer before submitting.</p>' + lines + '</div>';
}
function QUIZ_renderQuestion() {
  if (!QUIZ_currentQuiz || !QUIZ_currentQuiz.questions || !QUIZ_currentQuiz.questions.length) {
    alert('This quiz has no questions yet.');
    QUIZ_active = false;
    QUIZ_close();
    return;
  }
  var q    = QUIZ_currentQuiz.questions[QUIZ_currentQ];
  if (!q) { QUIZ_tryFinish(); return; }
  var tot  = QUIZ_currentQuiz.questions.length;
  var pct  = Math.round((QUIZ_currentQ / tot) * 100);
  var done = QUIZ_isFilled(q, QUIZ_userAnswers[QUIZ_currentQ]);
  QUIZ_answered[QUIZ_currentQ] = done;
  var sel  = QUIZ_userAnswers[QUIZ_currentQ];
  var subj = QUIZ_esc(QUIZ_currentQuiz.subjectName || '');
  var isChoice = q.type === 'mc' || q.type === 'tf';
  var lockedChoice = isChoice && !QUIZ_allowSkip();
  var choicesHtml = '';
  var imgHtml = '';
  if (q.image) {
    var src = typeof prismResolveUploadUrl === 'function' ? prismResolveUploadUrl(q.image) : q.image;
    if (src) imgHtml = '<img class="qz-q-img" src="' + QUIZ_esc(src) + '" alt="">';
  }
  if (isChoice && q.choices) {
    q.choices.forEach(function(ch, i) {
      var cls = '';
      if (lockedChoice && done) { if (i === q.answer) cls = 'correct'; else if (i === sel) cls = 'wrong'; }
      else if (i === sel) cls = 'selected';
      var letter = String.fromCharCode(65 + i);
      var bg     = cls==='correct'?'#10b981':cls==='wrong'?'#ef4444':cls==='selected'?'#7c3aed':'#e4dffa';
      var fg     = cls ? '#fff' : '#7c3aed';
      var rowBg  = cls==='correct'?'#d1fae5':cls==='wrong'?'#fee2e2':cls==='selected'?'#ede9fe':'#faf9ff';
      var rowBdr = cls==='correct'?'#10b981':cls==='wrong'?'#ef4444':cls==='selected'?'#7c3aed':'#e4dffa';
      choicesHtml += '<div onclick="QUIZ_selectAnswer(' + i + ')" style="display:flex;align-items:center;gap:.9rem;padding:.95rem 1.2rem;border:2px solid '+rowBdr+';border-radius:13px;cursor:pointer;background:'+rowBg+';font-size:.97rem;color:#374151;font-weight:500;margin-bottom:.7rem;transition:all .18s;">'
        + '<div style="width:32px;height:32px;border-radius:50%;background:'+bg+';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.88rem;color:'+fg+';flex-shrink:0;font-family:DM Sans,sans-serif;">'+letter+'</div>'
        + QUIZ_esc(ch) + '</div>';
    });
  } else if (q.type === 'mtf') {
    choicesHtml = '<div class="mtf-line"><input id="qz-write-' + QUIZ_currentQ + '" class="mtf-blank" value="' + QUIZ_esc(sel || '') + '" placeholder="Answer" oninput="QUIZ_saveWrite(this)">'
      + '<div class="mtf-stem"><span class="mtf-no">' + (QUIZ_currentQ + 1) + '.</span>' + QUIZ_esc(q.q) + '</div></div>';
  } else if (q.type === 'match') {
    var bank = (q.bank || []).map(function (b, i) {
      return '<span class="match-chip">' + String.fromCharCode(65 + i) + '. ' + QUIZ_esc(b.text) + '</span>';
    }).join('');
    var rows = (q.pairs || []).map(function (p, i) {
      var current = Array.isArray(sel) ? sel[i] : null;
      var opts = '<option value="">Choose</option>' + (q.bank || []).map(function (b, bi) {
        return '<option value="' + bi + '"' + (current === bi ? ' selected' : '') + '>' + String.fromCharCode(65 + bi) + '. ' + QUIZ_esc(b.text) + '</option>';
      }).join('');
      return '<div class="match-row"><div class="match-left"><strong>' + (i + 1) + '.</strong> ' + QUIZ_esc(p.left) + '</div><select id="match-' + QUIZ_currentQ + '-' + i + '" onchange="QUIZ_saveMatch()">' + opts + '</select></div>';
    }).join('');
    choicesHtml = '<div class="match-board"><div class="match-bank">' + bank + '</div>' + rows + '</div>';
  } else if (q.type === 'id') {
    choicesHtml = '<input id="qz-write-' + QUIZ_currentQ + '" class="qz-write" value="' + QUIZ_esc(sel || '') + '" placeholder="Type the answer" oninput="QUIZ_saveWrite(this)">';
  } else {
    var tall = q.type === 'essay' ? ' min-height:140px;' : '';
    choicesHtml = '<textarea id="qz-write-' + QUIZ_currentQ + '" class="qz-write" style="' + tall + '" placeholder="Type your answer" oninput="QUIZ_saveWrite(this)">' + QUIZ_esc(sel || '') + '</textarea>';
  }
  var feedbackHtml = '';
  if (lockedChoice && done) {
    feedbackHtml = '<div style="margin-top:1rem;padding:.9rem 1.2rem;border-radius:12px;font-size:.92rem;font-weight:600;background:'+(sel===q.answer?'#d1fae5':'#fee2e2')+';color:'+(sel===q.answer?'#065f46':'#991b1b')+';">'
      + (sel===q.answer ? 'Correct. ' : 'Incorrect. ') + QUIZ_esc(q.explain || '') + '</div>';
  }
  var isLast  = QUIZ_currentQ === tot - 1;
  var canNext = lockedChoice ? done : true;
  var missing = QUIZ_missingItems();
  var pills = '';
  if (QUIZ_allowSkip()) {
    pills = '<div class="qz-pills">' + QUIZ_currentQuiz.questions.map(function (item, i) {
      var on = QUIZ_isFilled(item, QUIZ_userAnswers[i]);
      var cls = 'qz-pill' + (i === QUIZ_currentQ ? ' now' : '') + (on ? ' on' : '') + (QUIZ_showMissing && !on ? ' need' : '');
      return '<button type="button" class="' + cls + '" onclick="QUIZ_jump(' + i + ')">' + (i + 1) + '</button>';
    }).join('') + '</div>';
  }
  var tlShow = parseInt(QUIZ_currentQuiz.time, 10) || parseInt(QUIZ_currentQuiz.time_limit, 10) || 0;
  var lockedBadge = '<div style="font-size:.72rem;font-weight:700;background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:20px;flex-shrink:0;white-space:nowrap;">Quiz locked</div>';
  if (tlShow > 0 && QUIZ_active) QUIZ_ensureViewportTimer();
  document.getElementById('shared-qz-inner').innerHTML =
    '<div style="padding:1.6rem 2rem 1rem;border-bottom:1px solid #f0ecff;position:sticky;top:0;background:#fff;z-index:2;border-radius:22px 22px 0 0;">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;width:100%;gap:.75rem;margin-bottom:.35rem;">'
    + '<div style="flex:1;min-width:0;font-size:.75rem;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.07em;">'+subj+'</div>'
    + '<div style="display:flex;align-items:flex-start;gap:.5rem;flex-shrink:0;margin-left:auto;">'
    + lockedBadge
    + '</div>'
    + '</div>'
    + '<div style="font-family:DM Sans,sans-serif;font-size:1.2rem;font-weight:800;color:#16132b;">'+QUIZ_esc(QUIZ_currentQuiz.title)+'</div>'
    + '</div>'
    + '<div style="height:6px;background:#f0ecff;"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#7c3aed,#a78bfa);transition:width .4s;"></div></div>'
    + '<div style="padding:1.5rem 2rem 2rem;">'
    + QUIZ_missingHtml(missing)
    + pills
    + '<div style="font-size:.78rem;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem;">Question '+(QUIZ_currentQ+1)+' / '+tot+' \u00b7 '+QUIZ_esc(QUIZ_typeLabel(q.type))+'</div>'
    + imgHtml
    + (q.type==='mtf' ? '' : '<div style="font-size:1.05rem;font-weight:700;color:#16132b;margin-bottom:1.2rem;line-height:1.55;">'+QUIZ_esc(q.q)+'</div>')
    + choicesHtml + feedbackHtml
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.6rem;">'
    + '<button onclick="QUIZ_goQ(-1)" '+(QUIZ_currentQ===0?'disabled':'')+' style="padding:.65rem 1.5rem;border:none;border-radius:12px;font-size:.92rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;background:#f0ecff;color:#7c3aed;opacity:'+(QUIZ_currentQ===0?'.4':'1')+';">\u2190 Prev</button>'
    + '<span style="font-size:.82rem;color:#9ca3af;">'+(QUIZ_currentQ+1)+' / '+tot+'</span>'
    + (isLast
        ? '<button onclick="QUIZ_tryFinish()" style="padding:.65rem 1.5rem;border:none;border-radius:12px;font-size:.92rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;background:#7c3aed;color:#fff;">Submit \u2192</button>'
        : '<button onclick="QUIZ_goQ(1)" '+(canNext?'':'disabled')+' style="padding:.65rem 1.5rem;border:none;border-radius:12px;font-size:.92rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;background:#7c3aed;color:#fff;opacity:'+(canNext?'1':'.4')+';">Next \u2192</button>')
    + '</div></div>';
  var write = document.getElementById('qz-write-' + QUIZ_currentQ);
  if (write) setTimeout(function () { write.focus(); }, 50);
  if (tlShow > 0 && QUIZ_active) QUIZ_tickTimer();
}
function QUIZ_saveWrite(el) {
  QUIZ_userAnswers[QUIZ_currentQ] = el.value;
  QUIZ_answered[QUIZ_currentQ] = !!String(el.value || '').trim();
}
function QUIZ_saveSA(el) { QUIZ_saveWrite(el); }
function QUIZ_saveMatch() { QUIZ_captureCurrent(); }
function QUIZ_selectAnswer(i) {
  var q = QUIZ_currentQuiz.questions[QUIZ_currentQ];
  if ((q.type === 'mc' || q.type === 'tf') && !QUIZ_allowSkip() && QUIZ_answered[QUIZ_currentQ]) return;
  QUIZ_userAnswers[QUIZ_currentQ] = i;
  QUIZ_answered[QUIZ_currentQ] = true;
  QUIZ_renderQuestion();
}
function QUIZ_goQ(dir) {
  QUIZ_captureCurrent();
  var next = QUIZ_currentQ + dir;
  if (!QUIZ_currentQuiz || next < 0 || next >= QUIZ_currentQuiz.questions.length) return;
  QUIZ_currentQ = next;
  QUIZ_renderQuestion();
}
function QUIZ_tryFinish() {
  if (QUIZ_timedOut) { QUIZ_finish(); return; }
  QUIZ_captureCurrent();
  var missing = QUIZ_missingItems();
  if (missing.length) {
    QUIZ_showMissing = true;
    QUIZ_currentQ = missing[0];
    QUIZ_renderQuestion();
    return;
  }
  QUIZ_showMissing = false;
  QUIZ_finish();
}
function QUIZ_finish() {
  QUIZ_clearTimer();
  QUIZ_timedOut = false;
  QUIZ_active = false;
  window.removeEventListener('beforeunload', QUIZ_onBeforeUnload);
  document.removeEventListener('visibilitychange', QUIZ_onVisibility);
  document.removeEventListener('keydown', QUIZ_blockEsc, true);
  (function(){
    var uid=sessionStorage.getItem('prism_user_id')||'student';
    var ip=JSON.parse(localStorage.getItem('prism_quiz_inprogress_'+uid)||'{}');
    delete ip[QUIZ_currentQuiz.id];
    localStorage.setItem('prism_quiz_inprogress_'+uid,JSON.stringify(ip));
  })();
  var q = QUIZ_currentQuiz;
  var graded = QUIZ_gradeQuiz(q, QUIZ_userAnswers);
  var mcCorrect = graded.earned, mcTotal = graded.auto, saTotal = graded.review, total = graded.auto + graded.review;
  var uid=sessionStorage.getItem('prism_user_id')||'student';
  var attKey='prism_quiz_attempts_'+uid;
  var atts=JSON.parse(localStorage.getItem(attKey)||'{}');
  atts[q.id]=(atts[q.id]||0)+1;
  localStorage.setItem(attKey,JSON.stringify(atts));
  localStorage.setItem('prism_quiz_mc_'+uid+'_'+q.id, String(mcCorrect));
  var scores=QUIZ_getScores(); scores[q.id]=mcCorrect; QUIZ_saveScores(scores);
  if (typeof PrismQuizzes !== 'undefined' && PrismQuizzes.submitScore) {
    PrismQuizzes.submitScore(q.id, mcCorrect, QUIZ_userAnswers.slice()).catch(function (e) {
      console.warn('Could not save quiz score to the server:', e);
    });
  }
  var saKey='prism_quiz_sa_'+uid+'_'+q.id;
  var saAnswers={};
  q.questions.forEach(function(qs,i){
    var ans = QUIZ_userAnswers[i];
    if (ans == null || ans === '') return;
    if (qs.type === 'sa' || qs.type === 'essay' || qs.type === 'id' || qs.type === 'mtf' || qs.type === 'match') saAnswers[i] = ans;
  });
  if(Object.keys(saAnswers).length) localStorage.setItem(saKey,JSON.stringify(saAnswers));
  QUIZ_logEvent('submit','Quiz submitted \u2014 MC: '+mcCorrect+'/'+mcTotal+', SA pending ('+saTotal+' pts), tab switches: '+QUIZ_tabWarnings);
  var hasSA=saTotal>0;
  var mcPct=mcTotal>0?Math.round(mcCorrect/mcTotal*100):0;
  var msg=hasSA?'Submitted. Written answers are waiting for your teacher.':(mcPct>=90?'Excellent work.':mcPct>=75?'Great job.':mcPct>=60?'Keep studying.':'Review the material and try again.');
  var scoreDisplay = mcTotal === 0
    ? '<div style="font-family:DM Sans,sans-serif;font-size:1.6rem;font-weight:800;color:#7c3aed;margin-bottom:.4rem;">Submitted</div>'
    : (hasSA
      ? '<div style="font-family:DM Sans,sans-serif;font-size:3rem;font-weight:800;color:#7c3aed;margin-bottom:.2rem;">'+mcCorrect+' / '+mcTotal+'</div>'
        + '<div style="font-size:.82rem;color:#d97706;font-weight:600;margin-bottom:.4rem;">Scored so far \u00b7 <span style="color:#9ca3af;">'+saTotal+' pts waiting for your teacher</span></div>'
      : '<div style="font-family:DM Sans,sans-serif;font-size:3.5rem;font-weight:800;color:#7c3aed;margin-bottom:.3rem;">'+mcCorrect+' / '+total+'</div>');
  document.getElementById('shared-qz-inner').innerHTML=
    '<div style="text-align:center;padding:2.5rem 2rem;">'
    +scoreDisplay
    +'<div style="font-size:1.05rem;font-weight:700;color:#16132b;margin-bottom:.4rem;">'+msg+'</div>'
    +'<div style="font-size:.88rem;color:#6b7280;margin-bottom:1rem;">'+(q.title||'')+'</div>'
    +(hasSA?'<div style="font-size:.82rem;background:#fef3c7;color:#92400e;padding:.75rem 1rem;border-radius:10px;margin-bottom:1.5rem;text-align:left;line-height:1.6;">Your written answers were saved. Your teacher will review them and add those points.</div>':'')
    +(QUIZ_tabWarnings>0?'<div style="font-size:.78rem;background:#fee2e2;color:#dc2626;padding:.5rem 1rem;border-radius:10px;margin-bottom:1.5rem;">'+QUIZ_tabWarnings+' tab switch(es) recorded.</div>':'')
    +'<button onclick="QUIZ_close()" style="padding:.75rem 2.2rem;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:12px;font-family:DM Sans,sans-serif;font-size:.95rem;font-weight:700;cursor:pointer;">Done</button>'
    +'</div>';
}

var STUDENT_ID = sessionStorage.getItem('prism_user_id') || 'student';

  function getJoinedClasses()  { return JSON.parse(localStorage.getItem('prism_joined_'+STUDENT_ID)||'{}'); }
  function getAllTeacherQuizzes() {
    var joined   = Object.values(getJoinedClasses());
    var allQuizzes = JSON.parse(localStorage.getItem('prism_teacher_quizzes')||'[]');
    return allQuizzes.filter(function(q) {
      if (!q.published) return false;
      var qcid = String(q.classId || q.class_id || '');
      return joined.find(function(j){ return String(j.classId) === qcid; });
    });
  }

  var activeFilter = 'all';

  function getStatus(quiz) {
    var scores = JSON.parse(localStorage.getItem('prism_quiz_scores_'+STUDENT_ID)||'{}');
    var atts   = JSON.parse(localStorage.getItem('prism_quiz_attempts_'+STUDENT_ID)||'{}');
    var ip     = JSON.parse(localStorage.getItem('prism_quiz_inprogress_'+STUDENT_ID)||'{}');
    if (scores[quiz.id] !== undefined || scores[String(quiz.id)] !== undefined) return 'completed';
    var due = quiz.due || quiz.due_date || '';
    if (due) {
      if (typeof prismIsPastDue === 'function' && prismIsPastDue(due, quiz.due_time)) return 'overdue';
      var today = new Date().toISOString().split('T')[0];
      if (due < today) return 'overdue';
    }
    if (atts[quiz.id] || ip[quiz.id]) return 'pending';
    return 'not-started';
  }

  function buildScoreDisplay(quiz, score) {
    var uid = sessionStorage.getItem('prism_user_id') || 'student';
    var hasSA = quiz.questions && quiz.questions.some(function(q){ return q.type==='sa'||q.type==='essay'; });
    var saScoreKey = 'prism_quiz_sa_scores_' + uid + '_' + quiz.id;
    var saScores = JSON.parse(localStorage.getItem(saScoreKey) || '{}');
    var saGraded = Object.keys(saScores).length > 0;
    if (hasSA && !saGraded) {
      var mcKey = 'prism_quiz_mc_' + uid + '_' + quiz.id;
      var mcStored = localStorage.getItem(mcKey);
      var mcPts = mcStored !== null ? parseFloat(mcStored) : score;
      var mcTotal = quiz.questions.reduce(function(s,q){ return s+(q.type!=='sa'&&q.type!=='essay'?(parseInt(q.points)||1):0); },0);
      return '<div style="font-size:.85rem;margin-bottom:.8rem;"><span style="color:#10b981;font-weight:700;">MC: '+mcPts+'/'+mcTotal+'</span> <span style="color:#d97706;font-weight:600;font-size:.78rem;">SA pending review</span></div>';
    }
    return '<div style="font-size:.85rem;color:#10b981;font-weight:700;margin-bottom:.8rem;"> Score: '+score+' / '+quiz.totalPoints+'</div>';
  }

  function filterQuizzes(f, btn) {
    activeFilter = f;
    document.querySelectorAll('.q-filter-btn').forEach(function(b){ b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderGrid();
  }

  function renderGrid() {
    var grid = document.getElementById('quizzes-grid');
    var quizzes = getAllTeacherQuizzes();
    if (activeFilter !== 'all') quizzes = quizzes.filter(function(q){ return getStatus(q) === activeFilter; });
    if (!quizzes.length) {
      grid.innerHTML = '<div style="text-align:center;padding:3rem;color:#9ca3af;grid-column:1/-1;">'
        + (getAllTeacherQuizzes().length ? 'No quizzes match this filter.' : 'No quizzes available yet — join a class to see quizzes from your teacher.')
        + '</div>';
      return;
    }
    grid.innerHTML = '';
    quizzes.forEach(function(quiz, i) {
      var status = getStatus(quiz);
      var scores = JSON.parse(localStorage.getItem('prism_quiz_scores_'+STUDENT_ID)||'{}');
      var score  = scores[quiz.id];
      var statusLabels = { 'not-started':'Not Started', 'completed':'Completed', 'overdue':'Overdue', 'pending':'In Progress' };
      var card = document.createElement('div');
      card.className = 'quiz-card';
      card.style.animationDelay = (i * 0.05) + 's';
      var atts = JSON.parse(localStorage.getItem('prism_quiz_attempts_'+STUDENT_ID)||'{}');
      var attCount = atts[quiz.id] || 0;
      var maxAtts  = parseInt(quiz.attempts) || 1;
      var noAttemptsLeft = maxAtts > 0 && attCount >= maxAtts;
      var btnHtml = status === 'completed'
        ? '<button class="start-quiz-btn done" disabled>Completed </button>'
        : status === 'overdue'
        ? '<button type="button" class="start-quiz-btn late-deadline" onclick="alert(PRISM_LATE_QUIZ_MSG)">Past due date — tap for info</button>'
        : noAttemptsLeft
        ? '<button class="start-quiz-btn over" disabled>No Attempts Left</button>'
        : status === 'pending'
        ? '<button class="start-quiz-btn" data-qid="'+quiz.id+'" style="background:linear-gradient(135deg,#d97706,#b45309);">Resume Quiz →</button>'
        : '<button class="start-quiz-btn" data-qid="'+quiz.id+'">Start Quiz →</button>';
      card.innerHTML =
        '<div class="quiz-card-banner" style="background:'+(quiz.subjectColor||'#7c3aed')+'"></div>'
        + '<div class="quiz-card-body">'
        + '<div class="quiz-subject-badge">'+(quiz.subjectName||'Class')+'</div>'
        + '<div class="quiz-title">'+quiz.title+'</div>'
        + '<div class="quiz-meta">'
        + '<div class="quiz-meta-item"> '+((quiz.questions && quiz.questions.length) || 0)+' questions</div>'
        + '<div class="quiz-meta-item"> '+quiz.totalPoints+' pts</div>'
        + (quiz.time ? '<div class="quiz-meta-item"> '+quiz.time+' min</div>' : '')
        + ((quiz.due || quiz.due_date) ? '<div class="quiz-meta-item"> Due '+(typeof prismFormatDueLine==='function'?prismFormatDueLine(quiz.due||quiz.due_date,quiz.due_time):(quiz.due||quiz.due_date))+'</div>' : '')
        + '</div>'
        + (score !== undefined ? buildScoreDisplay(quiz, score) : '')
        + (status==='pending' ? '<div style="font-size:.82rem;color:#d97706;font-weight:600;margin-bottom:.8rem;"> Unfinished — '+attCount+' of '+(maxAtts>0?maxAtts:'∞')+' attempt(s) used</div>' : '')
        + (maxAtts > 0 && status !== 'completed' ? '<div style="font-size:.75rem;color:#9ca3af;margin-bottom:.4rem;">Attempts: '+attCount+' / '+maxAtts+'</div>' : '')
        + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;">'
        + '<span class="quiz-status '+status+'">'+(statusLabels[status]||status)+'</span>'
        + btnHtml
        + '</div></div>';
      // Wire start button
      var btn = card.querySelector('[data-qid]');
      if (btn) btn.addEventListener('click', function() {
        QUIZ_reopenClassId = null;
        QUIZ_open(btn.dataset.qid);
        // After quiz closes, re-render grid
        var origClose = QUIZ_close;
      });
      grid.appendChild(card);
    });
  }

  function setFilter(f, btn) {
    activeFilter = f;
    document.querySelectorAll('.filter-btn').forEach(function(b){ b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    renderGrid();
  }

  async function syncQuizzesFromAPI() {
    try {
      var list = await PrismQuizzes.getMine();
      var joined = getJoinedClasses();
      var joinedClassIds = Object.keys(joined);
      var apiIds = new Set((list || []).map(function(q) { return String(q.id); }));
      var all = JSON.parse(localStorage.getItem('prism_teacher_quizzes') || '[]');
      // Remove quizzes the teacher deleted on the server so the grid does not show stale cards
      all = all.filter(function(q) {
        var cid = String(q.classId || q.class_id || '');
        if (!q.published) return true;
        if (joinedClassIds.indexOf(cid) === -1 && joinedClassIds.indexOf(String(q.classId || q.class_id || '')) === -1) return true;
        return apiIds.has(String(q.id));
      });
      (list || []).forEach(function(q) {
        var qs = q.questions;
        if (typeof qs === 'string') { try { qs = JSON.parse(qs || '[]'); } catch (e) { qs = []; } }
        var jc = joined[q.class_id] || joined[String(q.class_id)];
        var mapped = {
          id: q.id,
          classId: q.class_id,
          subjectName: jc ? jc.subject : 'Class',
          subjectColor: '#7c3aed',
          title: q.title,
          type: q.type || 'quiz',
          published: true,
          due: q.due_date || '',
          due_date: q.due_date || '',
          due_time: q.due_time || '',
          time: parseInt(q.time_limit, 10) || 0,
          time_limit: parseInt(q.time_limit, 10) || 0,
          attempts: parseInt(q.attempts, 10) || 1,
          totalPoints: parseInt(q.total_points, 10) || 0,
          questions: qs || [],
          allowSkip: !!(+q.allow_skip || q.allowSkip)
        };
        var ix = all.findIndex(function(x) { return String(x.id) === String(q.id); });
        if (ix >= 0) all[ix] = Object.assign({}, all[ix], mapped);
        else all.push(mapped);
      });
      localStorage.setItem('prism_teacher_quizzes', JSON.stringify(all));
      try {
        var apiScores = await PrismQuizzes.getMyScores();
        var scores = QUIZ_getScores();
        Object.keys(apiScores || {}).forEach(function (id) {
          if (scores[id] === undefined) scores[id] = apiScores[id];
        });
        QUIZ_saveScores(scores);
      } catch (e2) { /* local scores still apply */ }
    } catch (e) { console.warn('syncQuizzesFromAPI', e); }
  }

  window.addEventListener('DOMContentLoaded', function() {
    if (typeof initSidebar === 'function') initSidebar('quizzes');
    var wantQuiz = '';
    try { wantQuiz = new URLSearchParams(window.location.search).get('quiz') || ''; } catch (e) { wantQuiz = ''; }
    syncQuizzesFromAPI().finally(function() {
      renderGrid();
      if (wantQuiz) QUIZ_open(wantQuiz);
    });
    // Re-render grid when quiz modal closes (observe overlay display change)
    var observer = new MutationObserver(function() {
      var ov = document.getElementById('shared-qz-overlay');
      if (ov && ov.style.display === 'none') renderGrid();
    });
    setTimeout(function() {
      var ov = document.getElementById('shared-qz-overlay');
      if (ov) observer.observe(ov, { attributes: true, attributeFilter: ['style'] });
    }, 500);
  });
