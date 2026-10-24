/** Page script for index.html — keep HTML in the .html file. */
// ── Student dashboard data layer: localStorage mirrors the API so buildPanel / stream work without refetching every frame.
//     Keys: prism_joined_*, prism_teacher_posts (flat array), prism_teacher_materials (by class id), etc.

var STUDENT_ID   = sessionStorage.getItem('prism_user_id')   || 'student';
var _studentProfile = JSON.parse(localStorage.getItem('prism_profile_' + (sessionStorage.getItem('prism_user_id')||'')) || '{}');
var STUDENT_NAME = _studentProfile.name || sessionStorage.getItem('prism_user_name') || 'Student';
if (_studentProfile.name) sessionStorage.setItem('prism_user_name', _studentProfile.name);
var activeDetailId = null;
var currentQuiz    = null;
var userAnswers    = [];

function getJoinedClasses()   { return JSON.parse(localStorage.getItem('prism_joined_'+STUDENT_ID)||'{}'); }
function saveJoinedClasses(v) { localStorage.setItem('prism_joined_'+STUDENT_ID, JSON.stringify(v)); }
function getCodeIndex()       { return JSON.parse(localStorage.getItem('prism_join_codes')||'{}'); }
function getTeacherClasses(t) { return JSON.parse(localStorage.getItem('prism_classes_'+t)||'[]'); }
function getPosts()           { return JSON.parse(localStorage.getItem('prism_teacher_posts')||'[]'); }
function getTeacherQuizzes()  { return JSON.parse(localStorage.getItem('prism_teacher_quizzes')||'[]'); }
function getMaterials()       { return JSON.parse(localStorage.getItem('prism_teacher_materials')||'{}'); }
function getAssignments()     { return JSON.parse(localStorage.getItem('prism_teacher_assignments')||'{}'); }
function getScores()          { return JSON.parse(localStorage.getItem('prism_quiz_scores_'+STUDENT_ID)||'{}'); }
function saveScores(v)        { localStorage.setItem('prism_quiz_scores_'+STUDENT_ID, JSON.stringify(v)); }

function getTeacherProfile(teacherId) {
  var profile  = JSON.parse(localStorage.getItem('prism_profile_'+teacherId)||'{}');
  var accounts = JSON.parse(localStorage.getItem('prism_accounts')||'[]');
  var account  = accounts.find(function(a){ return a.id===teacherId; }) || {};
  return { name: profile.name || account.name || teacherId, avatar: profile.avatar || null };
}
function buildTeacherChip(teacherId) {
  var p = getTeacherProfile(teacherId);
  var av = p.avatar
    ? '<img src="'+p.avatar+'" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;"/>'
    : '<div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#10b981,#6ee7b7);display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:800;color:white;flex-shrink:0;">'+p.name.charAt(0).toUpperCase()+'</div>';
  return av+'<span style="font-size:.82rem;color:#6b7280;">'+p.name+'</span>';
}
function buildTeacherChipInline(teacherId) {
  var p = getTeacherProfile(teacherId);
  var av = p.avatar
    ? '<img src="'+p.avatar+'" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:.35rem;"/>'
    : '<span style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#10b981,#6ee7b7);align-items:center;justify-content:center;font-size:.62rem;font-weight:800;color:white;vertical-align:middle;margin-right:.35rem;">'+p.name.charAt(0).toUpperCase()+'</span>';
  return av + p.name;
}

function fmtDashEvTime(t) {
  if (!t) return '';
  var p = String(t).split(':');
  var hr = parseInt(p[0], 10) || 0;
  var m = p[1] != null ? p[1] : '00';
  return ((hr % 12) || 12) + ':' + m + (hr >= 12 ? ' PM' : ' AM');
}
function escDash(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function renderDashboardIncomingEvents() {
  var el = document.getElementById('dash-events-list');
  if (!el) return;
  var raw = [];
  try { raw = JSON.parse(localStorage.getItem('prism_events') || '[]'); } catch (e) { raw = []; }
  var todayStr = new Date().toISOString().split('T')[0];
  var upcoming = raw.filter(function(e) { return e.date >= todayStr; })
    .sort(function(a, b) {
      var c = a.date.localeCompare(b.date);
      return c !== 0 ? c : String(a.time || '').localeCompare(String(b.time || ''));
    })
    .slice(0, 8);
  if (!upcoming.length) {
    el.innerHTML = '<div class="empty-state" style="padding:1rem 0;">No upcoming events. Add events on the calendar.</div>';
    return;
  }
  el.innerHTML = upcoming.map(function(ev) {
    var dl = new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    var bar = ev.color || '#6d28d9';
    return '<div class="dash-ev-row"><div class="dash-ev-bar" style="background:' + bar + '"></div><div><div class="dash-ev-title">' + escDash(ev.title || 'Event') + '</div><div class="dash-ev-meta">' + escDash(dl) + (ev.time ? ' · ' + fmtDashEvTime(ev.time) : '') + '</div></div></div>';
  }).join('');
}

window.addEventListener('DOMContentLoaded', async function() {
  if (typeof initSidebar === 'function') initSidebar('home');
  var hour = new Date().getHours();
  var g = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  var greetEl = document.getElementById('student-greeting');
  if (greetEl) greetEl.textContent = g + ', ' + STUDENT_NAME;
  renderClasses();
  renderStats();
  renderActivity();
  renderDashboardIncomingEvents();
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var ov = document.getElementById('class-view-overlay');
      if (ov) closeClassView();
    }
  });

  await Promise.all([
    (async function() {
      try {
        var user = typeof prismAuthGuard === 'function' ? await prismAuthGuard(['student']) : null;
        if (user) {
          STUDENT_ID = user.id;
          STUDENT_NAME = user.name || STUDENT_NAME;
          if (greetEl) greetEl.textContent = g + ', ' + STUDENT_NAME;
        }
      } catch (e) { console.warn('API session check failed:', e); }
    })(),
    loadClassDataFromAPI().then(function() {
      if (typeof initSidebar === 'function') initSidebar('home');
      if (!document.getElementById('class-view-overlay')) renderClasses();
      renderStats();
      renderActivity();
      if (activeDetailId) refreshOpenClassPanel();
      else tryOpenClassFromUrl();
    }).catch(function() {}),
    (async function() {
      try {
        if (typeof PrismEvents !== 'undefined' && PrismEvents.get) {
          var apiEv = await PrismEvents.get();
          var mapped = apiEv.map(function(e) {
            return { id: e.id, title: e.title, date: e.event_date, time: e.event_time || '', notes: e.notes || '', color: e.color || '#6d28d9', alarm: e.alarm };
          });
          localStorage.setItem('prism_events', JSON.stringify(mapped));
          renderDashboardIncomingEvents();
        }
      } catch (evErr) { console.warn('Events sync:', evErr); }
    })(),
    renderAnnouncements(),
  ]);
  tryOpenClassFromUrl();
});

/** After login: pull enrollments, then for each class fetch posts/materials/assignments/quizzes and merge into the same LS keys the legacy UI expects. */
async function loadClassDataFromAPI() {
  try {
    var classesList = typeof PrismClasses !== 'undefined'
      ? await PrismClasses.getMyClasses()
      : ((await fetch(API_BASE + '/classes.php?action=mine', { credentials: 'include' }).then(function(r){ return r.json(); })).classes || []);
    if (!classesList || !classesList.length) {
      localStorage.setItem('prism_joined_' + STUDENT_ID, '{}');
      return;
    }
    var joined = {};
    classesList.forEach(function(cls) {
      joined[cls.id] = { classId: cls.id, teacherId: cls.teacher_id, subject: cls.subject, color: cls.color || '', joinedAt: cls.joined_at || '' };
      var prev = {};
      try { prev = JSON.parse(localStorage.getItem('prism_profile_' + cls.teacher_id) || '{}'); } catch (e) { prev = {}; }
      prev.name = cls.teacher_name || cls.teacher_id;
      localStorage.setItem('prism_profile_' + cls.teacher_id, JSON.stringify(prev));
    });
    localStorage.setItem('prism_joined_' + STUDENT_ID, JSON.stringify(joined));
    await Promise.all(classesList.map(function(cls) {
      return syncStudentClassContent(cls.id, { skipSubs: true });
    }));
  } catch(e) { console.warn('loadClassDataFromAPI failed:', e); }
}

/**
 * Refresh one class after opening it: same merge pattern as loadClassDataFromAPI but only for `classId`
 * (new posts/quizzes/materials without reloading the whole dashboard).
 */
async function syncStudentClassContent(classId, opts) {
  var cid = String(classId);
  var skipSubs = opts && opts.skipSubs;
  try {
    var posts, mats, asgns, quzRes;
    try {
      var res = await Promise.all([
        fetch(API_BASE + '/content.php?action=get_posts&class_id=' + encodeURIComponent(cid), { credentials: 'include' }).then(function(r) { return r.json(); }).catch(function() { return { posts: [] }; }),
        fetch(API_BASE + '/content.php?action=get_materials&class_id=' + encodeURIComponent(cid), { credentials: 'include' }).then(function(r) { return r.json(); }).catch(function() { return { materials: [] }; }),
        fetch(API_BASE + '/content.php?action=get_assignments&class_id=' + encodeURIComponent(cid), { credentials: 'include' }).then(function(r) { return r.json(); }).catch(function() { return { assignments: [] }; }),
        fetch(API_BASE + '/quizzes.php?action=get&class_id=' + encodeURIComponent(cid), { credentials: 'include' }).then(function(r) { return r.json(); }).catch(function() { return { quizzes: [] }; }),
      ]);
      posts = res[0]; mats = res[1]; asgns = res[2]; quzRes = res[3];
    } catch (e) { return; }
    var allPosts = JSON.parse(localStorage.getItem('prism_teacher_posts') || '[]').filter(function(p) { return String(p.classId || p.class_id) !== cid; });
    (posts.posts || []).forEach(function(p) {
      p.classId = p.class_id || p.classId;
      p.quizId = p.quiz_id || p.quizId;
      p.date = p.created_at || p.date || new Date().toISOString();
      allPosts.push(p);
    });
    localStorage.setItem('prism_teacher_posts', JSON.stringify(allPosts));
    var allQz = JSON.parse(localStorage.getItem('prism_teacher_quizzes') || '[]').filter(function(q) { return String(q.classId || q.class_id) !== cid; });
    (quzRes.quizzes || []).forEach(function(q) {
      var qs = q.questions;
      if (typeof qs === 'string') { try { qs = JSON.parse(qs || '[]'); } catch (x) { qs = []; } }
      allQz.push({
        id: q.id,
        classId: q.class_id || cid,
        teacherId: q.teacher_id,
        title: q.title,
        type: q.type || 'quiz',
        published: !!+q.published,
        due: q.due_date || q.due || '',
        due_time: q.due_time || '',
        time: parseInt(q.time_limit, 10) || 0,
        attempts: parseInt(q.attempts, 10) || 1,
        totalPoints: parseInt(q.total_points, 10) || 0,
        questions: qs || [],
      });
    });
    localStorage.setItem('prism_teacher_quizzes', JSON.stringify(allQz));
    var allMats = JSON.parse(localStorage.getItem('prism_teacher_materials') || '{}');
    allMats[cid] = (mats.materials || []).map(function(m) { return Object.assign({}, m, { desc: m.description || m.desc || '' }); });
    localStorage.setItem('prism_teacher_materials', JSON.stringify(allMats));
    var allAsgns = JSON.parse(localStorage.getItem('prism_teacher_assignments') || '{}');
    allAsgns[cid] = (asgns.assignments || []).map(function(a) {
      return normalizeAssignmentForUI(Object.assign({}, a, {
        due: a.due_date || a.due || '',
        due_time: '',
        pts: a.points || a.pts || 0,
      }));
    });
    localStorage.setItem('prism_teacher_assignments', JSON.stringify(allAsgns));
    if (!skipSubs) {
      try {
        var mineSubs = await PrismSubmissions.getMineForClass(cid);
        localStorage.setItem('prism_asgn_mine_' + STUDENT_ID + '_' + cid, JSON.stringify(mineSubs));
      } catch (eSub) { /* ignore */ }
    }
  } catch (e) { console.warn('syncStudentClassContent:', e); }
}

/** POST join code → cache profile + joined map → reload all class content from API. */
async function joinClass() {
  var code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code || code.length < 4) { showJoinMsg('Enter a valid join code.', 'err'); return; }
  try {
    var data = await PrismClasses.join(code);
    var cls  = data.class;
    // Cache teacher profile
    localStorage.setItem('prism_profile_'+cls.teacher_id, JSON.stringify({ name: data.teacher_name||cls.teacher_id, avatar: data.teacher_avatar||null }));
    // Update local joined map
    var joined = getJoinedClasses();
    joined[cls.id] = { classId:cls.id, teacherId:cls.teacher_id, subject:cls.subject, joinedAt:new Date().toISOString() };
    saveJoinedClasses(joined);
    document.getElementById('join-code-input').value = '';
    showJoinMsg(' Joined "' + cls.subject + '"!', 'ok');
    await loadClassDataFromAPI();
    renderClasses(); renderStats();
    if (typeof initSidebar === 'function') initSidebar('home');
  } catch(e) {
    showJoinMsg(e.message || 'Invalid code — check with your teacher.', 'err');
  }
}

/** API leave + remove from local joined map; close class overlay if it was showing this class. */
async function leaveClass(classId) {
  if (!confirm('Leave this class? You can rejoin with the code later.')) return;
  try {
    await PrismClasses.leave(classId);
  } catch(e) { console.warn('API leave failed:', e); }
  var joined = getJoinedClasses();
  delete joined[classId];
  saveJoinedClasses(joined);
  if (activeDetailId === classId) closeClassView();
  renderClasses(); renderStats();
  if (typeof initSidebar === 'function') initSidebar('home');
}

function showJoinMsg(msg, type) {
  var el = document.getElementById('join-msg');
  el.textContent = msg; el.className = 'join-msg ' + type;
  setTimeout(function(){ el.textContent = ''; }, 3000);
}

function renderClasses() {
  var joined  = getJoinedClasses();
  var entries = Object.values(joined);
  var area    = document.getElementById('classes-area');
  if (!entries.length) {
    area.innerHTML = '<div class="empty-state">No classes yet — enter a join code from your teacher above.</div>';
    return;
  }
  var frag = document.createDocumentFragment();
  var grid = document.createElement('div');
  grid.className = 'classes-grid';
  entries.forEach(function(entry, i) {
    var info  = getTeacherClasses(entry.teacherId).find(function(c){ return c.id===entry.classId; });
    var color = info ? info.color : '#7c3aed';
    var initial = String(entry.subject || '?').charAt(0).toUpperCase();
    var card  = document.createElement('div');
    card.className = 'class-card';
    if (activeDetailId === entry.classId) card.style.boxShadow = '0 0 0 2px '+color;
    card.innerHTML = '<div class="class-card-bar" style="background:'+color+'"></div>'
      + '<div class="class-card-body">'
      + '<div class="class-icon" style="background:'+color+'">'+initial+'</div>'
      + '<div class="class-name">'+entry.subject+'</div>'
      + (info && info.code ? '<div class="class-code">'+info.code+'</div>' : '')
      + '<div class="class-teacher" style="display:flex;align-items:center;gap:.45rem;">'
      + buildTeacherChip(entry.teacherId)
      + '</div>'
      + '<button class="leave-btn" id="leave-'+entry.classId+'">Leave Class</button>'
      + '</div>';
    card.querySelector('.leave-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      leaveClass(entry.classId);
    });
    card.addEventListener('click', function() {
      openClassDetail(entry.classId, entry.teacherId, entry.subject, color);
    });
    grid.appendChild(card);
  });
  frag.appendChild(grid);
  area.innerHTML = '';
  area.appendChild(frag);
}

var __openClassGen = 0;

function tryOpenClassFromUrl() {
  var want = '';
  try { want = new URLSearchParams(window.location.search).get('class') || ''; } catch (e) { want = ''; }
  if (!want || activeDetailId) return;
  var joined = getJoinedClasses()[want];
  if (!joined) return;
  var info = getTeacherClasses(joined.teacherId).find(function(c){ return c.id === joined.classId; });
  openClassDetail(joined.classId, joined.teacherId, joined.subject, (info && info.color) || joined.color || '#7c3aed');
}

function refreshOpenClassPanel() {
  var panel = document.getElementById('class-panel-content');
  if (!panel || !activeDetailId) return;
  var tab = document.querySelector('.class-view-tab.active');
  panel.innerHTML = buildPanel(tab ? tab.dataset.tab : 'stream', activeDetailId);
}

function paintClassOverlay(classId, teacherId, subject, color) {
  var info = getTeacherClasses(teacherId).find(function(c){ return c.id === classId; });
  var code = info ? info.code : '';
  var overlay = document.getElementById('class-view-overlay');
  var reuse = !!overlay;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'class-view-overlay';
    overlay.id = 'class-view-overlay';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  } else {
    overlay.style.animation = 'none';
  }
  overlay.innerHTML =
    '<div class="class-view-topbar">'
    + '<button class="class-view-back" onclick="closeClassView()" title="Back">←</button>'
    + '<div>'
    + '<div class="class-view-title">' + prismEscHtml(subject) + '</div>'
    + '<div class="class-view-sub" style="display:flex;align-items:center;gap:.4rem;">' + buildTeacherChipInline(teacherId) + (code ? '  ·   ' + prismEscHtml(code) : '') + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="class-view-banner" style="background:linear-gradient(135deg,' + color + ' 0%,' + shadeColor(color,-40) + ' 100%)">'
    + '<div class="class-view-banner-content">'
    + '<div class="class-view-name">' + prismEscHtml(subject) + '</div>'
    + '<div class="class-view-teacher" style="display:flex;align-items:center;gap:.5rem;opacity:.9;">' + buildTeacherChipInline(teacherId) + '</div>'
    + '</div>'
    + (code ? '<div class="class-view-code"> ' + prismEscHtml(code) + '</div>' : '')
    + '</div>'
    + '<div class="class-view-tabs">'
    + '<button class="class-view-tab active" data-tab="stream">Stream</button>'
    + '<button class="class-view-tab" data-tab="asgn">Assignments</button>'
    + '<button class="class-view-tab" data-tab="materials">Materials</button>'
    + '</div>'
    + '<div class="class-view-body"><div class="class-view-content" id="class-panel-content"></div></div>';
  overlay.querySelectorAll('.class-view-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      overlay.querySelectorAll('.class-view-tab').forEach(function(t){ t.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('class-panel-content').innerHTML = buildPanel(btn.dataset.tab, classId);
    });
  });
  document.getElementById('class-panel-content').innerHTML = buildPanel('stream', classId);
  if (!reuse) overlay.scrollTop = 0;
}

/** Opens the class panel immediately from cache, then refreshes from the API. */
async function openClassDetail(classId, teacherId, subject, color) {
  classId = String(classId);
  if (activeDetailId === classId && document.getElementById('class-view-overlay')) {
    var genKeep = ++__openClassGen;
    syncStudentClassContent(classId).then(function() {
      if (genKeep === __openClassGen) refreshOpenClassPanel();
    }).catch(function() {});
    return;
  }
  activeDetailId = classId;
  if (typeof markSidebarClassActive === 'function') markSidebarClassActive(classId);
  paintClassOverlay(classId, teacherId, subject, color || '#7c3aed');
  var gen = ++__openClassGen;
  try {
    await syncStudentClassContent(classId);
  } catch (e) { /* keep cached view */ }
  if (gen !== __openClassGen) return;
  refreshOpenClassPanel();
}

/** Darken/lighten a #RRGGBB for banner gradient (second arg shifts each RGB channel by `amt`, negative = darker). */
function shadeColor(hex, amt) {
  try {
    var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    r = Math.max(0,Math.min(255,r+amt));
    g = Math.max(0,Math.min(255,g+amt));
    b = Math.max(0,Math.min(255,b+amt));
    return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
  } catch(e) { return hex; }
}

function closeClassView() {
  closeStudentAssignmentModal();
  var overlay = document.getElementById('class-view-overlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
  activeDetailId = null;
  __openClassGen++;
  if (typeof markSidebarClassActive === 'function') markSidebarClassActive('');
  renderClasses();
}

function buildPanel(tab, classId) {
  if (tab === 'stream')    return buildStreamPanel(classId);
  if (tab === 'asgn')      return buildAsgnPanel(classId);
  if (tab === 'materials') return buildMaterialsPanel(classId);
  return '';
}




/** Link stream post text/attachment fields to a material record (title match, then url/file_path). */
function resolveStudentStreamMaterial(classId, p) {
  if (p.type !== 'material') return null;
  var items = getMaterials()[classId] || [];
  var tm = p.body && p.body.match(/New material: "([^"]+)"/);
  if (tm) {
    var found = items.find(function(it) { return it.title === tm[1]; });
    if (found) return found;
  }
  var att = (p.attachment || '').trim();
  return items.find(function(it) {
    return it.url === att || it.file_name === att || (it.file_path && it.file_path === att);
  }) || null;
}

/** View/Download HTML for materials: server path, base64 cache, or raw URL in attachment. */
function streamMaterialActionsStudent(classId, p) {
  if (p.type !== 'material') return '';
  var mat = resolveStudentStreamMaterial(classId, p);
  var att = (p.attachment || '').trim();
  var btn = 'display:inline-flex;align-items:center;gap:.35rem;padding:.45rem .95rem;border-radius:10px;font-size:.82rem;font-weight:700;text-decoration:none;';
  var row = 'margin-top:.8rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;';
  if (mat && mat.file_path) {
    var prev = typeof prismCanPreviewInBrowser === 'function' && prismCanPreviewInBrowser(mat.mime_type, mat.file_name);
    var view = '<button type="button" onclick=\'prismOpenMaterialUrl('+JSON.stringify(mat.file_path)+','+JSON.stringify(mat.mime_type||'')+','+JSON.stringify(mat.file_name||'')+')\' style="'+btn+'background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;cursor:pointer;">'+(prev?' View':' Open')+'</button>';
    var save = '<a href="'+mat.file_path+'" download="'+prismEscAttr(mat.file_name||'file')+'" style="'+btn+'background:#ede9fe;color:#5b21b6;"> Save</a>';
    return '<div style="'+row+'">'+view+save+'</div>';
  }
  if (mat && mat.file_data) {
    var p2 = typeof prismCanPreviewInBrowser === 'function' && prismCanPreviewInBrowser(mat.mime_type, mat.file_name);
    var viewB = '<button type="button" onclick="previewStudentMaterialBlob(\''+classId+'\',\''+mat.id+'\')" style="'+btn+'background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;cursor:pointer;">'+(p2?' View':' Open')+'</button>';
    var dl = '<button type="button" onclick="downloadStudentMaterial(\''+classId+'\',\''+mat.id+'\')" style="'+btn+'background:#ede9fe;color:#5b21b6;border:none;cursor:pointer;"> Save</button>';
    return '<div style="'+row+'">'+viewB+dl+'</div>';
  }
  if (mat && mat.url) {
    var hrefM = typeof prismNormalizeHttpUrl === 'function' ? (prismNormalizeHttpUrl(mat.url) || mat.url) : mat.url;
    if (hrefM.indexOf('http') === 0 || hrefM.charAt(0) === '/') {
      return '<div style="'+row+'"><a href="'+prismEscAttr(hrefM)+'" target="_blank" rel="noopener" style="'+btn+'background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;"> Open in new tab</a></div>';
    }
  }
  if (att.indexOf('http') === 0 || att.charAt(0) === '/') {
    if (att.charAt(0) === '/') {
      return '<div style="'+row+'"><button type="button" onclick=\'prismOpenMaterialUrl('+JSON.stringify(att)+',"","")\' style="'+btn+'background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;cursor:pointer;"> Open</button></div>';
    }
    return '<div style="'+row+'"><a href="'+att+'" target="_blank" rel="noopener" style="'+btn+'background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;"> Open</a></div>';
  }
  return '';
}

function downloadStudentMaterial(classId, id) {
  var items = getMaterials()[classId] || [];
  var it = items.find(function(x) { return x.id === id; });
  if (!it || !it.file_data) return;
  var a = document.createElement('a');
  a.href = it.file_data;
  a.download = it.file_name || it.title || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
function previewStudentMaterialBlob(classId, id) {
  var items = getMaterials()[classId] || [];
  var it = items.find(function(x) { return x.id === id; });
  if (!it || !it.file_data) return;
  var prev = typeof prismCanPreviewInBrowser === 'function' && prismCanPreviewInBrowser(it.mime_type, it.file_name);
  if (!prev) { downloadStudentMaterial(classId, id); return; }
  // data: URL → Blob → object URL so preview MIME matches (revoked after a few minutes)
  fetch(it.file_data)
    .then(function(r) { return r.blob(); })
    .then(function(blob) {
      var type = it.mime_type || blob.type;
      if (!type || type === 'application/octet-stream') {
        var ext = (String(it.file_name || '').split('.').pop() || '').toLowerCase();
        if (ext === 'pdf') type = 'application/pdf';
        else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp') type = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
      }
      var b = type ? new Blob([blob], { type: type }) : blob;
      var u = URL.createObjectURL(b);
      var w = window.open(u, '_blank', 'noopener');
      if (!w) {
        URL.revokeObjectURL(u);
        alert('Pop-up blocked — allow pop-ups for this site to preview files.');
        return;
      }
      setTimeout(function() { URL.revokeObjectURL(u); }, 180000);
    })
    .catch(function() {
      var w = window.open('', '_blank', 'noopener');
      if (w) w.location = it.file_data;
    });
}

function prismEscAttr(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
function prismEscHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function asgnDomId(id) { return String(id).replace(/[^a-zA-Z0-9_-]/g, '_'); }
/** Normalize API/localStorage assignment row (snake_case + occasional camelCase). */
function normalizeAssignmentForUI(a) {
  if (!a) return a;
  var o = Object.assign({}, a);
  o.attach_url = String(o.attach_url || o.attachUrl || '').trim();
  o.attach_file_path = String(o.attach_file_path || o.attachFilePath || '').trim();
  o.attach_file_name = String(o.attach_file_name || o.attachFileName || '').trim();
  o.attach_mime = String(o.attach_mime || o.attachMime || '').trim();
  o.target_section = o.target_section != null ? String(o.target_section).trim() : '';
  o.instructions = o.instructions != null ? o.instructions : '';
  if (!o.due) o.due = o.due_date || '';
  if (o.pts == null && o.points != null) o.pts = o.points;
  return o;
}
function getSubmissionMap(classId) {
  try {
    var raw = localStorage.getItem('prism_asgn_mine_'+STUDENT_ID+'_'+classId);
    var rows = raw ? JSON.parse(raw) : [];
    var m = {};
    (rows || []).forEach(function(r) {
      var aid = r.assignment_id != null ? String(r.assignment_id) : (r.assignmentId != null ? String(r.assignmentId) : '');
      if (aid) m[aid] = r;
    });
    return m;
  } catch (e) { return {}; }
}

function studentAbsUploadUrl(path) {
  if (typeof prismResolveUploadUrl === 'function') return prismResolveUploadUrl(path);
  if (!path) return '';
  var s = String(path);
  if (/^https?:\/\//i.test(s)) return s;
  if (s.charAt(0) === '/') return (window.location.origin || '') + s;
  try { return new URL(s, window.location.href).href; } catch (e) { return s; }
}
function studentIsImageMime(mime, name) {
  var m = String(mime || '').toLowerCase();
  if (m.indexOf('image/') === 0) return true;
  var ext = (String(name || '').split('.').pop() || '').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].indexOf(ext) >= 0;
}
/** Your work — Classroom-style “Files attached” + thumbnails. */
function studentSubmissionFilesHtml(sub) {
  if (!sub) return '';
  var parts = [];
  if (sub.link_url && String(sub.link_url).trim()) {
    var lu = prismEscAttr(String(sub.link_url).trim());
    parts.push('<div class="gc-files-section"><div class="gc-files-label">Link attached</div>'
      + '<div class="gc-link-row"><div class="gc-attach-bar"></div><div class="gc-link-body"><a href="' + lu + '" target="_blank" rel="noopener">' + lu + '</a></div></div></div>');
  }
  var items = [];
  var parsed = null;
  try {
    if (sub.attachments_json != null && sub.attachments_json !== '') {
      var raw = sub.attachments_json;
      if (typeof raw === 'string') {
        var t = raw.trim();
        parsed = t ? JSON.parse(t) : [];
      } else if (Array.isArray(raw)) {
        parsed = raw;
      }
    }
  } catch (e) { parsed = null; }
  var hasList = Array.isArray(parsed) && parsed.length > 0;
  if (hasList) {
    parsed.forEach(function(a) {
      if (a && a.path) items.push({ path: a.path, mime: a.mime || '', name: a.name || 'file' });
    });
  }
  if (!items.length && sub.file_path) {
    items.push({ path: sub.file_path, mime: sub.mime_type || '', name: sub.file_name || 'file' });
  }
  var inlineCount = 0;
  if (hasList) parsed.forEach(function(a) { if (a && a.inline) inlineCount++; });

  var fileCards = [];
  items.forEach(function(it) {
    var path = it.path, mime = it.mime, name = it.name || 'file';
    var urlAbs = studentAbsUploadUrl(path);
    var isImg = studentIsImageMime(mime, name);
    var oj = 'onclick=\'prismOpenMaterialUrl(' + JSON.stringify(path) + ',' + JSON.stringify(mime) + ',' + JSON.stringify(name) + ')\'';
    var thumb;
    var kind = typeof prismMaterialKind === 'function' ? prismMaterialKind(mime, name, 'file') : '';
    var extraPreview = '';
    if (isImg && urlAbs) {
      thumb = '<div class="gc-attach-preview" ' + oj + ' title="Open"><img src="' + prismEscAttr(urlAbs) + '" alt=""/></div>';
    } else if (kind === 'video-file' && urlAbs) {
      thumb = '<div class="gc-attach-preview gc-doc" ' + oj + ' title="Open"></div>';
      extraPreview = '<video src="' + prismEscAttr(urlAbs) + '" controls style="width:100%;max-height:180px;border-radius:8px;margin-top:.4rem;background:#0f172a;"></video>';
    } else {
      var ext = (name.split('.').pop() || '').toLowerCase();
      var em = '';
      if (ext === 'pdf') em = '';
      else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].indexOf(ext) >= 0) em = '';
      else if (['doc', 'docx'].indexOf(ext) >= 0) em = '';
      else if (['ppt', 'pptx'].indexOf(ext) >= 0) em = '';
      else if (['xls', 'xlsx', 'csv'].indexOf(ext) >= 0) em = '';
      else if (['zip', 'rar', '7z'].indexOf(ext) >= 0) em = '';
      thumb = '<div class="gc-attach-preview gc-doc" ' + oj + ' title="Open">' + em + '</div>';
    }
    fileCards.push('<div class="gc-attach-card"><div class="gc-attach-bar"></div>' + thumb
      + '<div class="gc-attach-body"><div class="gc-attach-name">' + prismEscHtml(name) + '</div>'
      + extraPreview
      + '<div class="gc-attach-actions"><button type="button" class="gc-attach-open" ' + oj + '>Open</button>'
      + '<a class="gc-attach-dl" href="' + prismEscAttr(studentAbsUploadUrl(path)) + '" download="' + prismEscAttr(name) + '">Download</a></div></div></div>');
  });
  if (sub.file_data && !items.length) {
    var fn = prismEscHtml(sub.file_name || 'Submitted file');
    fileCards.push('<div class="gc-attach-card"><div class="gc-attach-bar"></div><div class="gc-attach-preview gc-doc"></div>'
      + '<div class="gc-attach-body"><div class="gc-attach-name">' + fn + '</div>'
      + '<div class="gc-attach-actions"><button type="button" class="gc-attach-open student-sub-dl-btn">Download</button></div></div></div>');
  } else if (inlineCount > 0 && !items.length && !sub.file_data) {
    parsed.forEach(function(a) {
      if (a && a.inline) {
        fileCards.push('<div class="gc-attach-card"><div class="gc-attach-bar"></div><div class="gc-attach-preview gc-doc"></div>'
          + '<div class="gc-attach-body"><div class="gc-attach-name">' + prismEscHtml(a.name || 'file') + '</div>'
          + '<div class="gc-attach-actions"><span style="font-size:.72rem;color:#5f6368;">No separate file on server</span></div></div></div>');
      }
    });
  }
  if (fileCards.length) {
    var n = fileCards.length;
    parts.push('<div class="gc-files-section"><div class="gc-files-label">Files attached' + (n > 1 ? ' · ' + n : '') + '</div>' + fileCards.join('') + '</div>');
  }
  return parts.join('');
}
window.__studentAsgnPickedFiles = window.__studentAsgnPickedFiles || {};
function studentAsgnFileKey(classId, asgnId) {
  return String(classId) + '|' + String(asgnId);
}
function studentPickedFiles(classId, asgnId) {
  return window.__studentAsgnPickedFiles[studentAsgnFileKey(classId, asgnId)] || [];
}
function onStudentAsgnFilesChosen(classId, asgnId, input) {
  var list = [];
  var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
  var maxBytes = typeof PRISM_MAX_FILE_BYTES === 'number' ? PRISM_MAX_FILE_BYTES : 15 * 1024 * 1024;
  for (var i = 0; i < files.length && list.length < 10; i++) {
    var f = files[i];
    if (f.size > maxBytes) {
      alert(f.name + ' is too large. Max 15 MB. For longer videos, paste a YouTube link instead.');
      continue;
    }
    if (typeof prismAllowedUploadExt === 'function' && !prismAllowedUploadExt(f.name)) {
      alert(f.name + ' is not an allowed type. Use PDF, image, video, PPT, Word, Excel, text, or ZIP.');
      continue;
    }
    list.push(f);
  }
  window.__studentAsgnPickedFiles[studentAsgnFileKey(classId, asgnId)] = list;
  var label = document.getElementById('asgn-file-chosen-' + asgnDomId(asgnId));
  if (label) {
    if (list.length) {
      label.style.display = 'block';
      label.textContent = list.map(function(x) { return x.name; }).join(', ');
    } else {
      label.style.display = 'none';
      label.textContent = '';
    }
  }
}

/** Submit note/link/files to API, reload class data, refresh open overlay panel if still on this class. */
async function submitStudentAssignment(classId, asgnId) {
  var sid = asgnDomId(asgnId);
  var noteEl = document.getElementById('asgn-note-'+sid);
  var linkEl = document.getElementById('asgn-link-'+sid);
  var note = noteEl ? noteEl.value.trim() : '';
  var linkUrl = linkEl ? linkEl.value.trim() : '';
  if (linkUrl && typeof prismNormalizeHttpUrl === 'function') {
    linkUrl = prismNormalizeHttpUrl(linkUrl) || linkUrl;
  }
  var files = studentPickedFiles(classId, asgnId);
  var prev = getSubmissionMap(classId)[String(asgnId)];
  var hasExistingFiles = prev && (prev.file_path || prev.file_data || (prev.attachments_json && String(prev.attachments_json).trim() && String(prev.attachments_json).trim() !== '[]'));
  if (!note && !linkUrl && !files.length && !hasExistingFiles) {
    alert('Add a written response, a file (PDF, image, video…), or a link.');
    return;
  }
  var payload = { assignment_id: asgnId, class_id: classId, note: note, link_url: linkUrl };
  if (files.length) payload.files = files;
  try {
    await PrismSubmissions.submit(payload);
    window.__studentAsgnPickedFiles[studentAsgnFileKey(classId, asgnId)] = [];
    alert('Work submitted.');
    closeStudentAssignmentModal();
    await loadClassDataFromAPI();
    var ov = document.getElementById('class-view-overlay');
    if (ov && activeDetailId === classId) {
      var activeTab = ov.querySelector('.class-view-tab.active');
      var tab = activeTab ? activeTab.dataset.tab : 'asgn';
      var el = document.getElementById('class-panel-content');
      if (el) el.innerHTML = buildPanel(tab, classId);
    }
  } catch (err) {
    alert(err.message || 'Could not submit.');
  }
}

function postsNewestFirstStudent(arr) {
  return arr.slice().sort(function(a, b) {
    var ta = new Date(a.created_at || a.date || 0).getTime();
    var tb = new Date(b.created_at || b.date || 0).getTime();
    return tb - ta;
  });
}

function postBelongsToStudentClass(p, classId) {
  var cid = String(classId);
  var pc = String(p.classId != null ? p.classId : (p.class_id != null ? p.class_id : ''));
  return pc === cid;
}

/** Stream tab: posts newest-first; quiz posts match quiz row by id or title; material posts get View/Download. */
function buildStreamPanel(classId) {
  var posts = postsNewestFirstStudent(getPosts().filter(function(p){ return postBelongsToStudentClass(p, classId); }));
  if (!posts.length) return '<div class="empty-state">No posts in this class yet.</div>';
  var scores = getScores();
  var allQuizzes = getTeacherQuizzes().filter(function(q){ return q.classId===classId && q.published; });
  return posts.map(function(p) {
    var dl = new Date(p.date || p.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    // For quiz-type posts, find matching quiz and render a Take Quiz button
    var quizActionHtml = '';
    if (p.type === 'quiz') {
      var matchedQuiz = null;
      if (p.quizId) {
        matchedQuiz = allQuizzes.find(function(q){ return q.id === p.quizId; });
      }
      // Fallback: match by title extracted from post body for old posts
      if (!matchedQuiz) {
        var titleMatch = p.body && p.body.match(/New quiz: "([^"]+)"/);
        if (titleMatch) {
          matchedQuiz = allQuizzes.find(function(q){ return q.title === titleMatch[1]; });
        }
      }
      if (matchedQuiz) {
        var done    = scores[matchedQuiz.id] !== undefined;
        var qDue    = matchedQuiz.due || matchedQuiz.due_date || '';
        var overdue = qDue && typeof prismIsPastDue === 'function' && prismIsPastDue(qDue, matchedQuiz.due_time) && !done;
        if (done) {
          quizActionHtml = '<div style="margin-top:.8rem;"><button class="take-btn done" disabled>Completed  · Score: '+scores[matchedQuiz.id]+'/'+matchedQuiz.totalPoints+'</button></div>';
        } else if (overdue) {
          quizActionHtml = '<div style="margin-top:.8rem;"><button type="button" class="take-btn" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;" onclick="alert(\'This quiz is past its due date. Please contact your teacher if you need an extension.\')">Past deadline — tap for info</button></div>';
        } else {
          quizActionHtml = '<div style="margin-top:.8rem;"><button class="take-btn" onclick="window.location.href=\'quizzes.html\'"> Take Quiz →</button></div>';
        }
      }
    }
    var materialActionHtml = streamMaterialActionsStudent(classId, p);
    return '<div class="stream-post">'
      + '<div class="post-header">'
      + '<div class="post-avatar">'+(p.author||'T').charAt(0)+'</div>'
      + '<div class="post-meta"><div class="post-author">'+(p.author||'Teacher')+'</div><div class="post-date">'+dl+'</div></div>'
      + '<span class="post-badge '+p.type+'">'+p.type+'</span>'
      + '</div>'
      + '<div class="post-body">'+p.body+'</div>'
      + (p.attachment && p.type !== 'announcement' ? '<div class="post-attach"> '+p.attachment+'</div>' : '')
      + materialActionHtml
      + quizActionHtml
      + '</div>';
  }).join('');
}

function closeStudentAssignmentModal() {
  if (window.__studentAsgnModalEsc) {
    document.removeEventListener('keydown', window.__studentAsgnModalEsc);
    window.__studentAsgnModalEsc = null;
  }
  var el = document.getElementById('student-asgn-modal-overlay');
  if (el) el.remove();
  document.body.style.overflow = '';
}

/** Assignment modal: refresh row from API (instructions/attachments), merge into LS, then build modal DOM. */
async function openStudentAssignmentModal(classId, asgnId) {
  var aid = String(asgnId);
  var items = (getAssignments()[classId] || []);
  var a = items.find(function(x) { return String(x.id) === aid; });
  if (!a) return;
  try {
    // Fresh copy so teacher edits after page load still show
    var res = await fetch(API_BASE + '/content.php?action=get_assignments&class_id=' + encodeURIComponent(classId), { credentials: 'include' });
    var text = await res.text();
    var data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      data = {};
    }
    if (data.assignments && data.assignments.length) {
      var fresh = data.assignments.find(function(x) { return String(x.id) === aid; });
      if (fresh) {
        a = normalizeAssignmentForUI(Object.assign({}, a, fresh));
        var allAsgns = JSON.parse(localStorage.getItem('prism_teacher_assignments') || '{}');
        var list = allAsgns[classId] || [];
        var ix = list.findIndex(function(x) { return String(x.id) === aid; });
        if (ix >= 0) list[ix] = Object.assign({}, list[ix], a);
        else list.push(a);
        allAsgns[classId] = list;
        localStorage.setItem('prism_teacher_assignments', JSON.stringify(allAsgns));
      }
    }
  } catch (e) {
    console.warn('openStudentAssignmentModal: refresh from API failed', e);
  }
  a = normalizeAssignmentForUI(a);
  closeStudentAssignmentModal();
  var overdue = a.due && typeof prismIsPastDue === 'function' && prismIsPastDue(a.due, null);
  var dueLine = a.due && typeof prismFormatAssignmentDue === 'function' ? prismFormatAssignmentDue(a.due) : a.due;
  var sid = asgnDomId(a.id);
  var subMap = getSubmissionMap(classId);
  var sub = subMap[String(a.id)];
  var hasSub = sub && (sub.note || sub.link_url || sub.file_path || sub.file_data || sub.attachments_json);
  var existingFilesBlock = '';
  if (hasSub && (sub.file_path || sub.file_data || sub.link_url || (sub.attachments_json && String(sub.attachments_json).trim() && String(sub.attachments_json).trim() !== '[]'))) {
    existingFilesBlock = '<div style="margin:.55rem 0 0;">'
      + '<p style="font-size:.72rem;color:#6b7280;margin:0 0 .5rem;line-height:1.45;">Your submission:</p>'
      + studentSubmissionFilesHtml(sub)
      + '</div>';
  }
  var inst = prismEscHtml(a.instructions || '');
  var instructionsBlock = '';
  if (inst) {
    instructionsBlock = '<div style="margin-top:.65rem;">'
      + '<div style="font-size:.72rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.35rem;">Instructions</div>'
      + '<div style="font-size:.88rem;color:#374151;line-height:1.55;white-space:pre-wrap;">' + inst + '</div></div>';
  }
  var title = prismEscHtml(a.title || '');
  var icons = { written: 'WR', project: 'PR', lab: 'LB', oral: 'OR' };
  var teacherRefInner = '';
  if (a.attach_url) {
    var au = String(a.attach_url).trim();
    var hrefAu = /^https?:\/\//i.test(au) ? au : ('https://' + au);
    var vidEmb = typeof prismVideoEmbedFromUrl === 'function' ? prismVideoEmbedFromUrl(hrefAu) : null;
    if (vidEmb && vidEmb.embed) {
      teacherRefInner += '<div style="margin:.35rem 0 0;">'
        + '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;background:#0f172a;margin-bottom:.5rem;">'
        + '<iframe src="' + prismEscAttr(vidEmb.embed) + '" title="Reference video" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>'
        + '<a href="' + prismEscAttr(hrefAu) + '" target="_blank" rel="noopener" style="font-size:.8rem;font-weight:700;color:#7c3aed;"> Open video in new tab</a></div>';
    } else {
      teacherRefInner += '<div style="margin:.35rem 0 0;"><a href="' + prismEscAttr(hrefAu) + '" target="_blank" rel="noopener" style="font-size:.85rem;font-weight:700;color:#7c3aed;word-break:break-all;"> ' + prismEscHtml(au.length > 72 ? au.slice(0, 72) + '…' : au) + '</a></div>';
    }
  }
  var attachPath = String(a.attach_file_path || '').trim();
  if (attachPath) {
    var prev = typeof prismCanPreviewInBrowser === 'function' && prismCanPreviewInBrowser(a.attach_mime, a.attach_file_name);
    var attachKind = typeof prismMaterialKind === 'function' ? prismMaterialKind(a.attach_mime, a.attach_file_name, 'file') : '';
    var absAttach = studentAbsUploadUrl(attachPath);
    if (attachKind === 'image' || studentIsImageMime(a.attach_mime, a.attach_file_name)) {
      teacherRefInner += '<div style="margin:.5rem 0 0;"><img src="' + prismEscAttr(absAttach) + '" alt="" style="max-width:100%;max-height:220px;border-radius:10px;border:1px solid #e2e8f0;"/></div>';
    } else if (attachKind === 'video-file') {
      teacherRefInner += '<video src="' + prismEscAttr(absAttach) + '" controls style="width:100%;max-height:240px;border-radius:10px;margin-top:.5rem;background:#0f172a;"></video>';
    }
    teacherRefInner += '<div style="display:flex;flex-wrap:wrap;gap:.5rem;margin:.5rem 0 0;align-items:center;"><span style="font-size:.75rem;color:#64748b;font-weight:600;">Teacher file</span>'
      + '<button type="button" onclick=\'prismOpenMaterialUrl(' + JSON.stringify(attachPath) + ',' + JSON.stringify(a.attach_mime || '') + ',' + JSON.stringify(a.attach_file_name || '') + ')\' style="padding:.35rem .8rem;border-radius:9px;background:#7c3aed;color:#fff;font-size:.76rem;font-weight:700;border:none;cursor:pointer;">' + (prev ? ' View' : ' Open') + '</button>'
      + '<a href="' + prismEscAttr(absAttach) + '" download="' + prismEscAttr(a.attach_file_name || 'file') + '" style="padding:.35rem .8rem;border-radius:9px;background:#ede9fe;color:#5b21b6;font-size:.76rem;font-weight:700;text-decoration:none;"> Save</a></div>';
  }
  var teacherRef = '';
  if (teacherRefInner) {
    teacherRef = '<div style="margin-top:.85rem;padding:.85rem 1rem;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">'
      + '<div style="font-size:.72rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.45rem;">Reference materials</div>'
      + teacherRefInner + '</div>';
  }
  var submitBlock = '';
  if (overdue) {
    submitBlock = '<div style="font-size:.78rem;color:#991b1b;margin-top:.75rem;padding-top:.65rem;border-top:1px dashed #fecdd3;">Deadline passed — contact your teacher if you need to submit late.</div>';
  } else {
    var statusLine = '';
    if (hasSub && sub.submitted_at) {
      statusLine = '<div style="font-size:.8rem;color:#059669;font-weight:700;margin:.65rem 0 .35rem;"> Turned in · ' + new Date(sub.submitted_at).toLocaleString() + '</div>';
    }
    var pickOnchange = 'onStudentAsgnFilesChosen(' + JSON.stringify(classId) + ',' + JSON.stringify(a.id) + ',this)';
    submitBlock = statusLine
      + existingFilesBlock
      + '<div style="margin-top:.5rem;padding-top:.75rem;border-top:1px solid #fce7f3;">'
      + '<div style="font-size:.72rem;font-weight:700;color:#9d174d;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.4rem;">Turn in</div>'
      + '<textarea id="asgn-note-' + sid + '" placeholder="Write your response…" style="width:100%;min-height:90px;border:1.5px solid #fce7f3;border-radius:10px;padding:.65rem .85rem;font-size:.88rem;font-family:inherit;resize:vertical;box-sizing:border-box;">' + prismEscHtml(hasSub && sub.note ? sub.note : '') + '</textarea>'
      + '<div style="margin-top:.65rem;border:2px dashed #fbcfe8;border-radius:10px;padding:.9rem;text-align:center;cursor:pointer;background:#fff5f9;" onclick="document.getElementById(\'asgn-file-' + sid + '\').click()">'
      + '<div style="font-size:.84rem;color:#6b7280;"> Attach PDF, image, video, or PPT<br/><span style="font-size:.74rem;">Max 15 MB each · up to 10 files</span></div>'
      + '<div id="asgn-file-chosen-' + sid + '" style="display:none;font-size:.82rem;font-weight:700;color:#be185d;margin-top:.35rem;"></div>'
      + '</div>'
      + '<input type="file" id="asgn-file-' + sid + '" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.mp4,.webm,.mov,.ogg,.ogv,.zip" style="display:none;" onchange=\'' + pickOnchange + '\'/>'
      + '<input type="url" id="asgn-link-' + sid + '" placeholder="Or paste a link (article, Google Doc, YouTube…)" value="' + prismEscAttr(hasSub && sub.link_url ? sub.link_url : '') + '" style="width:100%;margin-top:.5rem;border:1.5px solid #fce7f3;border-radius:10px;padding:.5rem .85rem;font-size:.85rem;box-sizing:border-box;"/>'
      + '<button type="button" onclick=\'submitStudentAssignment(' + JSON.stringify(classId) + ',' + JSON.stringify(a.id) + ')\' style="margin-top:.85rem;padding:.58rem 1.5rem;background:linear-gradient(135deg,#ec4899,#be185d);color:#fff;border:none;border-radius:10px;font-weight:800;font-size:.9rem;cursor:pointer;font-family:\'DM Sans\',sans-serif;">Submit work</button>'
      + '</div>';
  }
  var inner = '<div class="student-asgn-modal" role="dialog" aria-modal="true" aria-labelledby="student-asgn-modal-title">'
    + '<button type="button" class="student-asgn-modal-close" onclick="closeStudentAssignmentModal()" aria-label="Close">×</button>'
    + '<div style="display:flex;align-items:flex-start;gap:.75rem;padding-right:1.5rem;">'
    + '<div style="font-size:.68rem;font-weight:800;letter-spacing:.04em;color:#be185d;flex-shrink:0;text-transform:uppercase;">' + (icons[a.type] || '') + '</div>'
    + '<div style="flex:1;min-width:0;">'
    + '<div id="student-asgn-modal-title" style="font-family:DM Sans,sans-serif;font-weight:800;font-size:1.05rem;color:#16132b;">' + title + '</div>'
    + '<div style="font-size:.8rem;color:#6b7280;margin-top:.25rem;">' + (a.pts ? a.pts + ' points · ' : '') + (a.due ? 'Due ' + dueLine : 'No due date') + '</div>'
    + instructionsBlock
    + teacherRef
    + submitBlock
    + '</div></div></div>';
  var overlay = document.createElement('div');
  overlay.id = 'student-asgn-modal-overlay';
  overlay.className = 'student-asgn-modal-overlay';
  overlay.innerHTML = inner;
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeStudentAssignmentModal();
  });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  if (hasSub && sub.file_data) {
    overlay.querySelectorAll('.student-sub-dl-btn').forEach(function(dlBtn) {
      dlBtn.onclick = function() {
        var ax = document.createElement('a');
        ax.href = sub.file_data;
        ax.download = sub.file_name || 'submission';
        document.body.appendChild(ax);
        ax.click();
        document.body.removeChild(ax);
      };
    });
  }
  window.__studentAsgnModalEsc = function(e) {
    if (e.key === 'Escape') closeStudentAssignmentModal();
  };
  document.addEventListener('keydown', window.__studentAsgnModalEsc);
}

function buildAsgnPanel(classId) {
  var raw = (getAssignments()[classId] || []);
  if (!raw.length) return '<div class="empty-state">No assignments yet.</div>';
  var items = raw.map(function(x) { return normalizeAssignmentForUI(x); }).sort(function(a, b) {
    var ta = (a.title || '').toLowerCase();
    var tb = (b.title || '').toLowerCase();
    if (ta !== tb) return ta.localeCompare(tb);
    return String(a.id).localeCompare(String(b.id));
  });
  var icons = { written: 'WR', project: 'PR', lab: 'LB', oral: 'OR' };
  var bgs = { written: '#fce7f3', project: '#fef3c7', lab: '#dbeafe', oral: '#e0e7ff' };
  var subMap = getSubmissionMap(classId);
  var btnStyle = 'padding:.38rem .85rem;border:1.5px solid #fbcfe8;border-radius:9px;font-size:.78rem;font-weight:700;white-space:nowrap;background:linear-gradient(135deg,#ec4899,#be185d);color:#fff;border:none;cursor:pointer;font-family:\'DM Sans\',sans-serif;';
  return items.map(function(a) {
    var overdue = a.due && typeof prismIsPastDue === 'function' && prismIsPastDue(a.due, null);
    var dueLine = a.due && typeof prismFormatAssignmentDue === 'function' ? prismFormatAssignmentDue(a.due) : a.due;
    var sub = subMap[String(a.id)];
    var hasSub = sub && (sub.note || sub.link_url || sub.file_path || sub.file_data || sub.attachments_json);
    var title = prismEscHtml(a.title || 'Untitled');
    var metaParts = [];
    if (a.pts) metaParts.push(a.pts + ' pts');
    metaParts.push(a.due ? 'Due ' + dueLine : 'No due date');
    if (overdue) metaParts.push('Past due');
    else if (hasSub) metaParts.push('Turned in');
    var meta = metaParts.join(' · ');
    var filesHtml = hasSub ? studentSubmissionFilesHtml(sub) : '';
    var innerSub = '';
    if (!hasSub) {
      innerSub = '<p style="font-size:.82rem;color:#9ca3af;margin:0;line-height:1.5;">You have not turned anything in yet. Use <strong>Open</strong> below for instructions and submit.</p>';
    } else {
      if (filesHtml) innerSub += filesHtml;
      if (sub.note && String(sub.note).trim()) {
        innerSub += '<div style="margin-top:' + (filesHtml ? '.65' : '0') + 'rem;"><div style="font-size:.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.35rem;">Written response</div>'
          + '<div style="font-size:.85rem;color:#374151;line-height:1.55;white-space:pre-wrap;padding:.65rem .85rem;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">' + prismEscHtml(sub.note) + '</div></div>';
      }
      if (!filesHtml && !(sub.note && String(sub.note).trim())) {
        innerSub += '<p style="font-size:.82rem;color:#059669;margin:0;"> Submitted' + (sub.submitted_at ? ' · ' + new Date(sub.submitted_at).toLocaleString() : '') + '</p>';
      }
    }
    var openOnclick = 'event.stopPropagation();openStudentAssignmentModal(' + JSON.stringify(classId) + ',' + JSON.stringify(a.id) + ')';
    return '<details class="student-asgn-acc">'
      + '<summary>'
      + '<div class="mat-icon-box" style="background:' + (bgs[a.type] || '#fce7f3') + '">' + (icons[a.type] || '') + '</div>'
      + '<div class="mat-info"><div class="mat-title">' + title + '</div>'
      + '<div class="mat-meta">' + prismEscHtml(meta) + '</div></div>'
      + '</summary>'
      + '<div class="student-asgn-acc-body">'
      + '<div class="student-asgn-acc-hint">Your submission for this assignment · <strong>Open</strong> for instructions &amp; teacher files</div>'
      + innerSub
      + '<div style="margin-top:.85rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;">'
      + '<button type="button" onclick=\'' + openOnclick + '\' style="' + btnStyle + '">Open</button>'
      + '</div>'
      + '</div>'
      + '</details>';
  }).join('');
}

function buildMaterialsPanel(classId) {
  var items = (getMaterials()[classId]||[]);
  if (!items.length) return '<div class="empty-state">No materials uploaded yet.</div>';
  var bgs = { file:'#dbeafe', pdf:'#fee2e2', image:'#dbeafe', link:'#fce7f3', video:'#fee2e2', 'video-file':'#ffedd5', ppt:'#ffedd5' };
  var btnStyle = 'padding:.38rem .85rem;border:1.5px solid #e4dffa;border-radius:9px;font-size:.78rem;font-weight:700;text-decoration:none;white-space:nowrap;cursor:pointer;';
  return items.map(function(it) {
    var kind = typeof prismMaterialKind === 'function' ? prismMaterialKind(it.mime_type, it.file_name || it.url, it.type) : (it.type || 'file');
    var icon = typeof prismMaterialIcon === 'function' ? prismMaterialIcon(kind) : '';
    var kindLabel = typeof prismMaterialKindLabel === 'function' ? prismMaterialKindLabel(kind) : (it.type || 'File');
    var metaBits = [kindLabel];
    if (it.file_name) metaBits.push(it.file_name);
    var action = '';
    if (it.file_path) {
      var prev = typeof prismCanPreviewInBrowser === 'function' && prismCanPreviewInBrowser(it.mime_type, it.file_name);
      action += '<button type="button" onclick=\'prismOpenMaterialUrl('+JSON.stringify(it.file_path)+','+JSON.stringify(it.mime_type||'')+','+JSON.stringify(it.file_name||'')+')\' style="'+btnStyle+'background:#7c3aed;color:#fff;border-color:#7c3aed;">'+(prev?' View':' Open')+'</button>'
        + '<a href="'+prismEscAttr(it.file_path)+'" download="'+prismEscAttr(it.file_name||'file')+'" style="'+btnStyle+'background:#faf9ff;color:#6d28d9;"> Save</a>';
    } else if (it.file_data) {
      var p2 = typeof prismCanPreviewInBrowser === 'function' && prismCanPreviewInBrowser(it.mime_type, it.file_name);
      action += '<button type="button" onclick="previewStudentMaterialBlob(\''+classId+'\',\''+it.id+'\')" style="'+btnStyle+'background:#7c3aed;color:#fff;border-color:#7c3aed;">'+(p2?' View':' Open')+'</button>'
        + '<button type="button" onclick="downloadStudentMaterial(\''+classId+'\',\''+it.id+'\')" style="'+btnStyle+'background:#faf9ff;color:#6d28d9;"> Save</button>';
    }
    var href = typeof prismMaterialHttpUrl === 'function' ? prismMaterialHttpUrl(it) : '';
    if (href) {
      action += '<a href="'+prismEscAttr(href)+'" target="_blank" rel="noopener" style="'+btnStyle+'background:#7c3aed;color:#fff;border-color:#7c3aed;"> Open link</a>';
    }
    var iconHtml;
    if ((kind === 'image' || studentIsImageMime(it.mime_type, it.file_name)) && it.file_path) {
      iconHtml = '<div class="mat-icon-box" style="background:#dbeafe;padding:0;"><img src="'+prismEscAttr(it.file_path)+'" alt=""/></div>';
    } else {
      iconHtml = '<div class="mat-icon-box" style="background:'+(bgs[kind]||bgs[it.type]||'#f5f3ff')+'">'+icon+'</div>';
    }
    var preview = '';
    if (kind === 'video' && it.url) {
      var vHref = typeof prismNormalizeHttpUrl === 'function' ? (prismNormalizeHttpUrl(it.url) || it.url) : it.url;
      var vidEmb = typeof prismVideoEmbedFromUrl === 'function' ? prismVideoEmbedFromUrl(vHref) : null;
      if (vidEmb && vidEmb.embed) {
        preview = '<div style="flex-basis:100%;margin-top:.15rem;"><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;background:#0f172a;"><iframe src="'+prismEscAttr(vidEmb.embed)+'" title="Video" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></div>';
      }
    } else if (kind === 'video-file' && it.file_path) {
      preview = '<div style="flex-basis:100%;margin-top:.15rem;"><video src="'+prismEscAttr(it.file_path)+'" controls style="width:100%;max-height:260px;border-radius:10px;background:#0f172a;"></video></div>';
    } else if ((kind === 'image' || studentIsImageMime(it.mime_type, it.file_name)) && it.file_path) {
      preview = '<div style="flex-basis:100%;margin-top:.15rem;"><img src="'+prismEscAttr(it.file_path)+'" alt="" style="max-width:100%;max-height:240px;border-radius:10px;border:1px solid #e4dffa;"/></div>';
    }
    if (!preview && href) {
      var extraEmb = typeof prismVideoEmbedFromUrl === 'function' ? prismVideoEmbedFromUrl(href) : null;
      if (extraEmb && extraEmb.embed) {
        preview = '<div style="flex-basis:100%;margin-top:.15rem;"><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;background:#0f172a;"><iframe src="'+prismEscAttr(extraEmb.embed)+'" title="Video" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></div>';
      }
    }
    var note = it.desc || it.description || '';
    var noteHtml = note
      ? '<div class="mat-meta" style="margin-top:.3rem;white-space:pre-wrap;">'+(typeof prismLinkifyHtml==='function'?prismLinkifyHtml(note):prismEscHtml(note))+'</div>'
      : '';
    return '<div class="mat-item">'
      + iconHtml
      + '<div class="mat-info"><div class="mat-title">'+prismEscHtml(it.title)+'</div>'
      + '<div class="mat-meta">'+prismEscHtml(metaBits.join(' · '))+'</div>'
      + noteHtml + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;">'+action+'</div>'
      + preview
      + '</div>';
  }).join('');
}



function renderStats() {
  var joined   = getJoinedClasses();
  var classIds = Object.keys(joined);
  document.getElementById('stat-classes').textContent = classIds.length;
  var qCount=0, aCount=0, mCount=0;
  classIds.forEach(function(cid) {
    getTeacherQuizzes().filter(function(q){ return q.classId===cid && q.published; }).forEach(function(){ qCount++; });
    (getAssignments()[cid]||[]).forEach(function(){ aCount++; });
    (getMaterials()[cid]||[]).forEach(function(){ mCount++; });
  });
  document.getElementById('stat-quizzes').textContent     = qCount;
  document.getElementById('stat-assignments').textContent = aCount;
  document.getElementById('stat-materials').textContent   = mCount;
}

async function renderAnnouncements() {
  var feed = document.getElementById('ann-feed');
  if (!feed) return;
  var anns = [];
  try {
    if (typeof PrismAdmin !== 'undefined' && PrismAdmin.getAnnouncements) {
      anns = await PrismAdmin.getAnnouncements();
    }
  } catch (e) { console.warn('Portal announcements:', e); }
  if (!anns.length) {
    feed.innerHTML = '<div class="empty-state">No portal announcements yet.</div>';
    return;
  }
  try { localStorage.setItem('prism_admin_announcements', JSON.stringify(anns)); } catch (e) {}
  var typeCls = { portal:'background:#fef3c7;color:#92400e;', alert:'background:#fee2e2;color:#991b1b;', info:'background:#dbeafe;color:#1d4ed8;' };
  var typeIco = { portal:'General', alert:'Alert', info:'Info' };
  feed.innerHTML = anns.slice(0, 5).map(function(a) {
    var rawDate = a.created_at || a.date;
    var dl = rawDate ? new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    var t = a.type || 'portal';
    var pill = '<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:.4rem;' + (typeCls[t] || typeCls.portal) + '">' + (typeIco[t] || '') + '</span>';
    var text = String(a.text == null ? '' : a.text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<div style="display:flex;gap:.8rem;padding:.8rem 0;border-bottom:1px solid #f5f3ff;">'
      + '<div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;flex-shrink:0;">' + String(a.author || 'A').charAt(0) + '</div>'
      + '<div><div style="font-size:.88rem;font-weight:700;color:#16132b;">' + String(a.author || 'Admin').replace(/</g, '&lt;') + pill + ' <span style="font-size:.74rem;color:#9ca3af;">' + dl + '</span></div>'
      + '<div style="font-size:.88rem;color:#374151;line-height:1.65;margin-top:.25rem;">' + text + '</div></div></div>';
  }).join('');
}

function renderActivity() {
  var joined   = getJoinedClasses();
  var classIds = Object.keys(joined).map(function(id) { return String(id); });
  var posts    = postsNewestFirstStudent(getPosts().filter(function(p) {
    var pc = String(p.classId != null ? p.classId : (p.class_id != null ? p.class_id : ''));
    return classIds.indexOf(pc) !== -1;
  }));
  var feed     = document.getElementById('activity-feed');
  if (!posts.length) { feed.innerHTML = '<div class="empty-state">No activity from your classes yet.</div>'; return; }
  var cfg = { announcement:{bg:'#ede9fe',icon:'AN'}, material:{bg:'#d1fae5',icon:'MT'}, assignment:{bg:'#fce7f3',icon:'AS'}, quiz:{bg:'#dbeafe',icon:'QZ'} };
  feed.innerHTML = posts.slice(0,8).map(function(p) {
    var c    = cfg[p.type] || {bg:'#f5f3ff',icon:''};
    var dl   = new Date(p.date || p.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    var pk = String(p.classId != null ? p.classId : (p.class_id != null ? p.class_id : ''));
    var subj = joined[pk] ? joined[pk].subject : '';
    return '<div style="display:flex;align-items:flex-start;gap:.8rem;padding:.8rem 0;border-bottom:1px solid #f5f3ff;">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:'+c.bg+';display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:800;letter-spacing:.04em;color:#4c1d95;flex-shrink:0;">'+c.icon+'</div>'
      + '<div style="flex:1;min-width:0;"><div style="font-size:.88rem;font-weight:600;color:#16132b;line-height:1.4;">'+(p.body.length>65?p.body.slice(0,65)+'…':p.body)+'</div>'
      + '<div style="font-size:.75rem;color:#9ca3af;margin-top:.15rem;">'+(subj?subj+' · ':'')+dl+'</div></div></div>';
  }).join('');
}
