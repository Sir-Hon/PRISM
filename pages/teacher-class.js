/** Page script for teacher-class.html — keep HTML in the .html file. */
/* ═══════════════════════════ DATA & STORAGE ═══════════════════════════ */

var TEACHER_ID = ''; // set after auth resolves
const CLASS_COLORS = ['#7c3aed','#0d9488','#d97706','#2563eb','#be123c','#15803d','#0284c7','#9333ea','#dc2626','#d97706'];

// ── API-backed data helpers ──
var CLASSES = [];
var _postsCache = [];
var _materialsCache = {};
var _assignmentsCache = {};

function teacherQuizBelongsToClass(q, classId) {
  return String(q.classId || q.class_id || '') === String(classId);
}
/** Same shape as quizmaker / student cache (incl. target_section). */
function mapApiQuizRowToLocalTeacher(q, classId) {
  let qs = q.questions;
  if (typeof qs === 'string') { try { qs = JSON.parse(qs || '[]'); } catch (e) { qs = []; } }
  const ts = q.target_section != null ? String(q.target_section).trim() : '';
  return {
    id: q.id,
    classId: q.class_id || classId,
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
    target_section: ts,
    allowSkip: !!(+q.allow_skip || q.allowSkip),
  };
}
/** Merge API quizzes into localStorage; keep unpublished local-only drafts; drop published rows deleted on server. */
async function syncTeacherQuizzesFromApiForClass(classId) {
  if (!classId || !TEACHER_ID) return;
  try {
    const list = await PrismQuizzes.get(classId);
    const apiIds = new Set((list || []).map(r => String(r.id)));
    const mapped = (list || []).map(q => mapApiQuizRowToLocalTeacher(q, classId));
    const all = getQuizzes();
    const otherClasses = all.filter(q => !teacherQuizBelongsToClass(q, classId));
    const localSame = all.filter(q => teacherQuizBelongsToClass(q, classId));
    const keepLocal = localSame.filter(q => {
      if (apiIds.has(String(q.id))) return false;
      if (!q.published) return true;
      return false;
    });
    saveQuizzes(otherClasses.concat(mapped).concat(keepLocal));
  } catch (e) {
    console.warn('syncTeacherQuizzesFromApiForClass', e);
  }
}

async function refreshClassData(classId) {
  try {
    const [posts, mats, asgns, students] = await Promise.all([
      PrismPosts.get(classId),
      PrismMaterials.get(classId),
      PrismAssignments.get(classId),
      PrismClasses.getStudents(classId),
    ]);
    syncTeacherQuizzesFromApiForClass(classId).catch(function(){});
    _postsCache        = _postsCache.filter(p=>p.class_id!==classId && p.classId!==classId).concat(posts);
    _materialsCache[classId]   = mats;
    _assignmentsCache[classId] = asgns;
    try {
      const allA = JSON.parse(localStorage.getItem('prism_teacher_assignments') || '{}');
      allA[classId] = asgns;
      localStorage.setItem('prism_teacher_assignments', JSON.stringify(allA));
      const allM = JSON.parse(localStorage.getItem('prism_teacher_materials') || '{}');
      allM[classId] = mats;
      localStorage.setItem('prism_teacher_materials', JSON.stringify(allM));
    } catch (e) { /* ignore */ }
    try {
      const allPosts = JSON.parse(localStorage.getItem('prism_teacher_posts') || '[]');
      const others = allPosts.filter(p => String(p.class_id) !== String(classId) && String(p.classId) !== String(classId));
      const merged = (posts || []).map(p => {
        const copy = Object.assign({}, p);
        copy.classId = p.class_id || p.classId;
        copy.quizId = p.quiz_id || p.quizId;
        copy.teacherId = p.teacher_id || p.teacherId;
        copy.date = p.created_at || p.date || new Date().toISOString();
        return copy;
      });
      localStorage.setItem('prism_teacher_posts', JSON.stringify(others.concat(merged)));
    } catch (e) { /* ignore */ }
    // Keep students in localStorage for records.html compatibility
    localStorage.setItem('prism_students_'+classId, JSON.stringify(
      students.map(s => typeof prismMapStudentRow === 'function' ? prismMapStudentRow(s) : { id:s.id, name:s.name, section:s.section||'', avatar:s.avatar||'' })
    ));
  } catch(e) { console.error('refreshClassData:', e); }
}

function getClasses()      { return CLASSES; }
function saveClasses()     { /* handled by API */ }
function getStudents(cid)  { return JSON.parse(localStorage.getItem('prism_students_'+cid)||'[]'); }
function saveStudents()    { /* handled by API */ }
function getPosts()        { return _postsCache; }
function savePosts()       { /* handled by API */ }
function getQuizzes()      { return JSON.parse(localStorage.getItem('prism_teacher_quizzes')||'[]'); }
function saveQuizzes(q)    { localStorage.setItem('prism_teacher_quizzes', JSON.stringify(q)); }
function getMaterials()    { return _materialsCache; }
function saveMaterials()   { /* handled by API */ }
function getAssignments()  { return _assignmentsCache; }
function saveAssignments() { /* handled by API */ }

/* ── Join-code index: code → {classId, teacherId} ── */
function getCodeIndex()   { return JSON.parse(localStorage.getItem('prism_join_codes')||'{}'); }
function saveCodeIndex(v) { localStorage.setItem('prism_join_codes', JSON.stringify(v)); }

/** Sync class list to localStorage so profile sidebar, quizmaker, and records see the same data as the API. */
function persistTeacherClassesLocal() {
  if (!TEACHER_ID) return;
  const slim = CLASSES.map(c => {
    var cover = (c.cover && String(c.cover).indexOf('data:image/') === 0) ? c.cover : '';
    if (!cover && c.cover == null && c.has_cover && typeof prismCoverRecall === 'function') cover = prismCoverRecall(c.id);
    if (typeof prismCoverRemember === 'function') prismCoverRemember(c.id, cover);
    return {
      id: c.id,
      subject: c.subject,
      color: c.color || '#7c3aed',
      code: c.code,
      teacher_id: c.teacher_id || TEACHER_ID,
      student_count: parseInt(c.student_count, 10) || 0,
      has_cover: !!cover,
    };
  });
  localStorage.setItem('prism_classes_' + TEACHER_ID, JSON.stringify(slim));
}

function genJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c='';
  for(let i=0;i<6;i++) c+=chars[Math.floor(Math.random()*chars.length)];
  return c;
}

/* ── State ── */
var activeClassId  = null;
var activeView = 'attendance';
/** Workspace (materials & assignments): __all__ = whole class; else section label */
let activeWorkspaceSection = '__all__';
/** __all__ = list every assignment; else one assignment id (teacher assignments tab) */
let teacherAssignmentViewFilter = '__all__';
/** __all__ = list every material; else one material id (teacher materials tab) */
let teacherMaterialViewFilter = '__all__';
let activeSub      = 'classwork';

/* ═══════════════════════════ INIT ═══════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  const user = await prismAuthGuard(['teacher']);
  if (!user) return;
  TEACHER_ID = user.id;
  if (typeof initSidebar === 'function') initSidebar('home');
  try {
    const cached = JSON.parse(localStorage.getItem('prism_classes_' + TEACHER_ID) || '[]');
    if (cached.length) CLASSES = cached;
  } catch (e) {}
  await initTeacherClassPage();
});

function classAccentColor(raw) {
  const value = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) return '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
  return '#7c3aed';
}

function applyClassAccent(cls) {
  const color = classAccentColor(cls && cls.color);
  const gem = document.getElementById('tc-class-gem');
  if (gem) gem.style.background = color;
  document.documentElement.style.setProperty('--t', color);
  document.documentElement.style.setProperty('--t-dark', color);
}

function revealTeacherClass() {
  var pageWait = document.getElementById('tc-page-wait');
  if (pageWait) pageWait.remove();
  var content = document.getElementById('class-content');
  if (content) content.hidden = false;
}

function paintTeacherClassShell(cls) {
  if (!cls) return;
  applyClassAccent(cls);
  const titleEl = document.getElementById('tc-subject-title');
  if (titleEl) {
    titleEl.textContent = typeof prismTeacherClassLabel === 'function' ? prismTeacherClassLabel(cls) : (cls.subject || '');
  }
  revealTeacherClass();
  ensureWorkspacePanel();
  loadWorkspaceSectionForClass(activeClassId);
  loadTeacherAssignmentViewFilter();
  loadTeacherMaterialViewFilter();
  renderWorkspacePage();
  bindMatDropZone();
  bindAsgnDropZone();
  var linkList = document.getElementById('mat-link-list');
  if (linkList && !linkList.querySelector('.mat-link-input')) linkList.innerHTML = matLinkRowHtml();
}

async function initTeacherClassPage() {
  const params = new URLSearchParams(window.location.search);
  const urlClass = params.get('class');
  if (!urlClass) {
    window.location.replace('teacher.html');
    return;
  }
  activeClassId = urlClass;
  try { sessionStorage.setItem('prism_teacher_active_class_id', activeClassId); } catch (e) {}
  const cachedCls = CLASSES.find(c => c.id === urlClass);
  if (cachedCls) paintTeacherClassShell(cachedCls);
  try {
    CLASSES = await PrismClasses.getMyClasses();
    const idx = {};
    CLASSES.forEach(cls => { if (cls.code) idx[cls.code] = { classId: cls.id, teacherId: cls.teacher_id || TEACHER_ID, subject: cls.subject }; });
    saveCodeIndex(idx);
    persistTeacherClassesLocal();
  } catch (e) {
    console.error('initTeacherClassPage:', e);
    if (!CLASSES.length) CLASSES = [];
  }
  const cls = CLASSES.find(c => c.id === urlClass);
  if (!cls) {
    window.location.replace('teacher.html');
    return;
  }
  paintTeacherClassShell(cls);
  if (typeof initSidebar === 'function') initSidebar('home');
  if (typeof markSidebarClassActive === 'function') markSidebarClassActive(activeClassId);
  await refreshClassData(activeClassId);
  renderWorkspacePage();
  var openTab = params.get('tab');
  if (openTab === 'materials' || openTab === 'assignments') openTab = 'classwork';
  if (openTab) {
    var tabBtn = document.querySelector('#class-content > .sub-tabs > .sub-tab[data-sub="' + openTab + '"]');
    if (tabBtn) switchSub(openTab, tabBtn);
  }
}

/** Saved from the markup in teacher-class.html so a cleared panel can be rebuilt from one source. */
var classContentSnapshot = '';

function ensureWorkspacePanel() {
  var wrap = document.getElementById('class-content');
  if (!wrap) return;
  if (document.getElementById('classwork-list')) {
    if (!classContentSnapshot) classContentSnapshot = wrap.innerHTML;
    return;
  }
  if (!classContentSnapshot) return;
  wrap.innerHTML = classContentSnapshot;
  activeSub = 'classwork';
  wrap.querySelectorAll('.sub-panel').forEach(function (p) { p.classList.remove('active'); });
  wrap.querySelectorAll(':scope > .sub-tabs > .sub-tab').forEach(function (t) { t.classList.remove('active'); });
  var subMat = document.getElementById('sub-classwork');
  if (subMat) subMat.classList.add('active');
  var matTab = wrap.querySelector('.sub-tab[data-sub="classwork"]');
  if (matTab) matTab.classList.add('active');
  bindMatDropZone();
  resetMatComposer();
  bindAsgnDropZone();
}

function uniqueSectionsFromStudents(classId) {
  const studs = getStudents(classId) || [];
  const set = {};
  studs.forEach(s => {
    const sec = (s.section || '').trim();
    if (sec) set[sec] = true;
  });
  return Object.keys(set).sort();
}
function loadWorkspaceSectionForClass(classId) {
  try {
    let v = sessionStorage.getItem('prism_teacher_workspace_section_' + classId);
    if (v == null || v === '') {
      v = sessionStorage.getItem('prism_teacher_target_section_' + classId);
      if (v != null && v !== '') {
        sessionStorage.setItem('prism_teacher_workspace_section_' + classId, v);
      }
    }
    const secs = uniqueSectionsFromStudents(classId);
    if (v == null || v === '' || v === '__all__') {
      activeWorkspaceSection = '__all__';
      return;
    }
    if (secs.indexOf(v) >= 0) {
      activeWorkspaceSection = v;
      return;
    }
  } catch (e) { /* ignore */ }
  activeWorkspaceSection = '__all__';
}
function itemMatchesWorkspaceSectionFilter(item) {
  const t = (item && item.target_section != null) ? String(item.target_section).trim() : '';
  if (activeWorkspaceSection === '__all__') return true;
  if (!t) return true;
  return t === activeWorkspaceSection;
}
function getWorkspaceTargetSectionForApi() {
  if (activeWorkspaceSection === '__all__') return null;
  return activeWorkspaceSection;
}
function renderWorkspaceSectionPills() {
  const wrap = document.getElementById('teacher-section-pills-wrap');
  if (!wrap) return;
  const cls = CLASSES.find(c => c.id === activeClassId);
  if (!cls) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  let sections = uniqueSectionsFromStudents(activeClassId);
  if (activeWorkspaceSection !== '__all__' && sections.indexOf(activeWorkspaceSection) < 0) {
    sections = [...sections, activeWorkspaceSection].sort();
  }
  if (!sections.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '.45rem';
  wrap.style.flexWrap = 'wrap';
  let html = '<span style="font-size:.72rem;font-weight:700;color:#9ca3af;">Section</span><div class="section-pills" style="margin:0;">';
  html += '<button type="button" class="section-pill' + (activeWorkspaceSection === '__all__' ? ' active' : '') + '" data-sec="__all__">All</button>';
  sections.forEach(sec => {
    const esc = String(sec).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    html += '<button type="button" class="section-pill' + (activeWorkspaceSection === sec ? ' active' : '') + '" data-sec="' + esc + '">' + esc + '</button>';
  });
  html += '</div>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.section-pill').forEach(btn => {
    btn.onclick = function() {
      activeWorkspaceSection = btn.getAttribute('data-sec') || '__all__';
      try { sessionStorage.setItem('prism_teacher_workspace_section_' + activeClassId, activeWorkspaceSection); } catch (e) {}
      renderWorkspaceSectionPills();
      fillAnnouncementAudience();
      renderMaterials(); renderAssignments();
      renderSubjectAnnouncements();
    };
  });
  fillAsgnSide();
}

function fillAsgnSide() {
  var nameEl = document.getElementById('asgn-class-name');
  var sel = document.getElementById('asgn-assign-to');
  var cls = CLASSES.find(function (c) { return c.id === activeClassId; });
  if (nameEl) {
    nameEl.textContent = cls && typeof prismTeacherClassLabel === 'function'
      ? prismTeacherClassLabel(cls)
      : ((cls && cls.subject) || 'This class');
  }
  if (!sel) return;
  var keep = sel.value || activeWorkspaceSection || '__all__';
  var sections = uniqueSectionsFromStudents(activeClassId);
  sel.innerHTML = '';
  var all = document.createElement('option');
  all.value = '__all__';
  all.textContent = 'All students';
  sel.appendChild(all);
  sections.forEach(function (sec) {
    var o = document.createElement('option');
    o.value = sec;
    o.textContent = sec;
    sel.appendChild(o);
  });
  sel.value = (keep === '__all__' || sections.indexOf(keep) >= 0) ? keep : '__all__';
}

function syncAsgnReady() {
  var title = document.getElementById('asgn-title');
  var btn = document.getElementById('asgn-assign-btn');
  if (!title || !btn) return;
  btn.classList.toggle('is-ready', !!title.value.trim());
}

function assignmentTargetSection() {
  var sel = document.getElementById('asgn-assign-to');
  if (!sel) return getWorkspaceTargetSectionForApi();
  var v = String(sel.value || '').trim();
  if (!v || v === '__all__') return null;
  return v;
}

function renderWorkspacePage() {
  const cls = CLASSES.find(c=>c.id===activeClassId);
  if (!cls) return;
  renderMaterials();
  renderAssignments();
  loadWorkspaceSectionForClass(activeClassId);
  renderWorkspaceSectionPills();
  fillAnnouncementAudience();
  const codeEl = document.getElementById('tc-code-text');
  if (codeEl) codeEl.textContent = cls.code || '\u2014';
  const copyBtn = document.getElementById('tc-copy-btn');
  if (copyBtn) copyBtn.onclick = function () { copyJoinCode(cls.code || '', copyBtn); };
  const newBtn = document.getElementById('tc-new-code-btn');
  if (newBtn) newBtn.onclick = function () { regenJoinCode(cls.id); };
  fillAsgnSide();
}

function switchSub(name, btn) {
  if (name === 'materials' || name === 'assignments') name = 'classwork';
  if (activeSub === 'records' && name !== 'records' && typeof flushSave === 'function') flushSave();
  activeSub = name;
  document.querySelectorAll('.sub-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#class-content > .sub-tabs > .sub-tab').forEach(t=>t.classList.remove('active'));
  var panel = document.getElementById('sub-' + name);
  if (panel) panel.classList.add('active');
  var tab = document.querySelector('#class-content > .sub-tabs > .sub-tab[data-sub="' + name + '"]');
  if (tab) tab.classList.add('active');
  var pick = document.getElementById('class-sub-pick');
  if (pick && pick.value !== name) pick.value = name;
  if (name === 'announcements') renderSubjectAnnouncements();
  if (name === 'quizzes') ensureClassQuizFrame();
  if (name === 'grades' && typeof QG_open === 'function') QG_open();
  if (name === 'records' && typeof renderActiveSheet === 'function') renderActiveSheet();
  if (name === 'people') renderClassPeople();
}

function prismPeopleOrder(a, b) {
  var byName = String((a && a.name) || '').localeCompare(String((b && b.name) || ''), undefined, { sensitivity: 'base' });
  if (byName) return byName;
  return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
}

function prismPeoplePhoto(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.charAt(0) === '/' || s.indexOf('uploads/') === 0) return s;
  return '';
}

function prismPeopleRow(person, role) {
  var row = document.createElement('div');
  row.className = 'people-row';
  var photo = prismPeoplePhoto(person && person.avatar);
  if (photo) {
    var img = document.createElement('img');
    img.className = 'people-av';
    img.alt = '';
    img.src = photo;
    row.appendChild(img);
  } else {
    var mark = document.createElement('span');
    mark.className = 'people-av';
    var name = String((person && person.name) || '?').trim();
    mark.textContent = (name.charAt(0) || '?').toUpperCase();
    row.appendChild(mark);
  }
  var main = document.createElement('div');
  main.className = 'people-main';
  var title = document.createElement('div');
  title.className = 'people-name';
  title.textContent = (person && person.name) || (role === 'teacher' ? 'Teacher' : 'Student');
  main.appendChild(title);
  var meta = document.createElement('div');
  meta.className = 'people-meta';
  meta.textContent = role === 'teacher' ? 'Teacher' : (person && person.section ? person.section : '');
  if (meta.textContent) main.appendChild(meta);
  row.appendChild(main);
  return row;
}

function renderClassPeople() {
  var host = document.getElementById('people-list');
  if (!host || !activeClassId) return;
  var classId = activeClassId;
  host.innerHTML = '';
  var wait = document.createElement('div');
  wait.className = 'gc-empty';
  wait.textContent = 'Loading people…';
  host.appendChild(wait);
  var task = (typeof PrismClasses !== 'undefined' && PrismClasses.getMembers)
    ? PrismClasses.getMembers(classId)
    : Promise.reject(new Error('missing'));
  task.then(function (data) {
    if (activeSub !== 'people' || String(activeClassId) !== String(classId)) return;
    host.innerHTML = '';
    var teacher = (data && data.teacher) || {};
    if (!teacher.name) {
      try { teacher.name = sessionStorage.getItem('prism_user_name') || 'Teacher'; } catch (e) { teacher.name = 'Teacher'; }
    }
    var teacherBlock = document.createElement('div');
    teacherBlock.className = 'people-block';
    var teacherHead = document.createElement('h2');
    teacherHead.textContent = 'Teacher';
    teacherBlock.appendChild(teacherHead);
    teacherBlock.appendChild(prismPeopleRow(teacher, 'teacher'));
    host.appendChild(teacherBlock);
    var students = ((data && data.students) || []).slice().sort(prismPeopleOrder);
    var studentBlock = document.createElement('div');
    studentBlock.className = 'people-block';
    var studentHead = document.createElement('h2');
    studentHead.textContent = 'Students';
    studentBlock.appendChild(studentHead);
    if (!students.length) {
      var empty = document.createElement('div');
      empty.className = 'gc-empty';
      empty.textContent = 'No students in this class yet.';
      studentBlock.appendChild(empty);
    } else {
      students.forEach(function (student) {
        studentBlock.appendChild(prismPeopleRow(student, 'student'));
      });
    }
    host.appendChild(studentBlock);
  }).catch(function () {
    if (activeSub !== 'people' || String(activeClassId) !== String(classId)) return;
    host.innerHTML = '';
    var err = document.createElement('div');
    err.className = 'gc-empty';
    err.textContent = 'Could not load the class members.';
    host.appendChild(err);
  });
}

function ensureClassQuizFrame() {
  var frame = document.getElementById('class-quiz-frame');
  if (!frame || !activeClassId) return;
  var next = 'quizmaker.html?embed=1&v=10&class=' + encodeURIComponent(activeClassId);
  if (frame.dataset.src !== next) {
    frame.dataset.src = next;
    frame.src = next;
  }
}

window.addEventListener('message', function (e) {
  if (e.origin !== location.origin || !e.data || e.data.type !== 'prism-quiz-height') return;
  var frame = document.getElementById('class-quiz-frame');
  if (!frame || e.source !== frame.contentWindow) return;
  var h = parseInt(e.data.height, 10) || 0;
  if (h > 200 && h < 20000) frame.style.height = h + 'px';
});

function openSubjectRecords() {
  var btn = document.querySelector('#class-content > .sub-tabs > .sub-tab[data-sub="records"]');
  if (btn) switchSub('records', btn);
}

function showSheetKind(kind, btn) {
  if (typeof flushSave === 'function') flushSave();
  activeView = kind === 'assessment' ? 'assessment' : 'attendance';
  var att = document.getElementById('view-attendance');
  var ass = document.getElementById('view-assessment');
  if (att) att.style.display = activeView === 'attendance' ? '' : 'none';
  if (ass) ass.style.display = activeView === 'assessment' ? '' : 'none';
  document.querySelectorAll('#sheet-kind-tabs .sub-tab').forEach(function (t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (typeof loadCurrentSheet === 'function') loadCurrentSheet();
}

function announcementStudents() {
  var list = getStudents(activeClassId) || [];
  if (activeWorkspaceSection && activeWorkspaceSection !== '__all__') {
    list = list.filter(function (s) { return String(s.section || '').trim() === activeWorkspaceSection; });
  }
  return list.slice().sort(function (a, b) {
    return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), undefined, { sensitivity: 'base' });
  });
}
function fillAnnouncementAudience() {
  var students = announcementStudents();
  var to = document.getElementById('ann-to');
  var show = document.getElementById('ann-filter');
  if (to) {
    var keepTo = to.value || '';
    to.innerHTML = '';
    var everyone = document.createElement('option');
    everyone.value = '';
    everyone.textContent = 'Everyone';
    to.appendChild(everyone);
    students.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s.id);
      var sec = String(s.section || '').trim();
      o.textContent = (s.name || s.id) + (sec ? ' · ' + sec : '');
      to.appendChild(o);
    });
    to.value = students.some(function (s) { return String(s.id) === keepTo; }) ? keepTo : '';
  }
  if (show) {
    var keepShow = show.value || '__all__';
    show.innerHTML = '';
    [['__all__', 'All'], ['__class__', 'Whole class']].forEach(function (pair) {
      var o = document.createElement('option');
      o.value = pair[0];
      o.textContent = pair[1];
      show.appendChild(o);
    });
    students.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s.id);
      o.textContent = s.name || s.id;
      show.appendChild(o);
    });
    var showOk = keepShow === '__all__' || keepShow === '__class__' || students.some(function (s) { return String(s.id) === keepShow; });
    show.value = showOk ? keepShow : '__all__';
  }
}
function announcementAudienceName(post) {
  var who = String(post && (post.target_student || '') || '').trim();
  if (!who) return '';
  var stud = (getStudents(activeClassId) || []).find(function (s) { return String(s.id) === who; });
  return stud && stud.name ? stud.name : who;
}
async function postSubjectAnnouncement() {
  const box = document.getElementById('stream-text');
  const text = box ? box.value.trim() : '';
  if (!text || !activeClassId) return;
  var to = document.getElementById('ann-to');
  var studentId = to && to.value ? String(to.value) : '';
  try {
    await PrismPosts.add({
      class_id: activeClassId,
      teacherId: TEACHER_ID,
      type: 'announcement',
      body: text,
      attachment: null,
      author: sessionStorage.getItem('prism_user_name') || 'Teacher',
      target_section: getWorkspaceTargetSectionForApi(),
      target_student: studentId,
    });
    box.value = '';
    await refreshClassData(activeClassId);
    fillAnnouncementAudience();
    renderSubjectAnnouncements();
  } catch (e) { alert(e.message || 'Failed to post.'); }
}

function announcementMatchesShowFilter(post) {
  if (!itemMatchesWorkspaceSectionFilter(post)) return false;
  var show = document.getElementById('ann-filter');
  var mode = show && show.value ? show.value : '__all__';
  var who = String(post.target_student || '').trim();
  if (mode === '__all__') return true;
  if (mode === '__class__') return !who;
  return who === mode;
}
function renderSubjectAnnouncements() {
  const feed = document.getElementById('stream-feed');
  if (!feed) return;
  if (!document.getElementById('ann-to') || !document.getElementById('ann-to').options.length) fillAnnouncementAudience();
  const posts = (getPosts() || []).filter(function (p) {
    return (p.class_id === activeClassId || p.classId === activeClassId) && announcementMatchesShowFilter(p);
  }).sort(function (a, b) {
    return new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0);
  });
  if (!posts.length) {
    feed.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b7280;font-size:.95rem;">No announcements yet.</div>';
    return;
  }
  feed.innerHTML = '';
  posts.forEach(function (p) {
    const dl = new Date(p.created_at || p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const div = document.createElement('div');
    div.className = 'stream-post';
    div.innerHTML = '<div class="post-header"><div class="post-avatar"></div><div class="post-meta"><div class="post-author"></div><div class="post-date"></div></div><span class="post-badge ' + teacherEsc(p.type || 'announcement') + '"></span></div><div class="post-body"></div>';
    div.querySelector('.post-avatar').textContent = String(p.author || 'T').charAt(0);
    div.querySelector('.post-author').textContent = p.author || 'Teacher';
    var audience = announcementAudienceName(p);
    div.querySelector('.post-date').textContent = audience ? (dl + ' · To ' + audience) : dl;
    div.querySelector('.post-badge').textContent = p.type || 'announcement';
    div.querySelector('.post-body').textContent = p.body || '';
    feed.appendChild(div);
  });
}

function copyJoinCode(code, btn) {
  const el = btn || document.getElementById('tc-copy-btn');
  const finish = function () {
    const tip = el && el.parentElement ? el.parentElement.querySelector('.tc-tip-label') : null;
    if (!tip) return;
    const orig = tip.getAttribute('data-label') || 'Copy code';
    tip.textContent = 'Copied';
    setTimeout(function () { tip.textContent = orig; }, 1600);
  };
  const text = String(code || '');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(finish).catch(function () {});
  }
}

async function regenJoinCode(classId) {
  if (!confirm('Generate a new join code? The old code will stop working.')) return;
  const cls = CLASSES.find(c=>c.id===classId);
  if (!cls) return;
  var regenBtn = document.getElementById('tc-new-code-btn');
  if (regenBtn) { regenBtn.disabled = true; regenBtn.classList.add('is-busy'); }
  const oldCode = cls.code;
  const newCode = genJoinCode();
  try {
    const res = await fetch(API_BASE + '/classes.php?action=regen_code', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ class_id: classId, code: newCode })
    });
    const j = await res.json().catch(()=>({}));
    if (j.error) throw new Error(j.error);
    cls.code = String(j.code || newCode).toUpperCase();
  } catch(e) {
    alert(e.message || 'Could not update join code on the server.');
    if (regenBtn) { regenBtn.disabled = false; regenBtn.classList.remove('is-busy'); }
    return;
  }
  const idx = getCodeIndex();
  delete idx[oldCode];
  idx[cls.code] = { classId, teacherId:TEACHER_ID, subject:cls.subject };
  saveCodeIndex(idx);
  persistTeacherClassesLocal();
  renderWorkspacePage();
  if (regenBtn) { regenBtn.disabled = false; regenBtn.classList.remove('is-busy'); }
}

/* ═══════════════════════════ MATERIALS ═══════════════════════════ */
var _matFiles = [];
var _asgnFile = null;

function prismTeacherMaxBytes() {
  return (typeof PRISM_MAX_FILE_BYTES === 'number') ? PRISM_MAX_FILE_BYTES : 15 * 1024 * 1024;
}

function prismTeacherCheckFile(file) {
  if (!file) return 'Please choose a file.';
  if (file.size > prismTeacherMaxBytes()) return 'File too large. Max 15 MB. For longer videos, paste a YouTube link instead.';
  if (typeof prismAllowedUploadExt === 'function' && !prismAllowedUploadExt(file.name)) {
    return 'That file type is not allowed. Use PDF, image, video, PPT, Word, Excel, text, or ZIP.';
  }
  return '';
}


function matLinkRowHtml() {
  return '<div class="mat-link-row">'
    + '<input type="text" class="mat-link-input" placeholder="Paste a website or YouTube link"/>'
    + '<button type="button" class="gc-link-remove" onclick="removeMatLinkRow(this)">Remove</button>'
    + '</div>';
}

function showMatLinks() {
  const panel = document.getElementById('mat-link-panel');
  const list = document.getElementById('mat-link-list');
  if (list && !list.querySelector('.mat-link-input')) list.insertAdjacentHTML('beforeend', matLinkRowHtml());
  if (panel) panel.classList.add('is-open');
  const input = list && list.querySelector('.mat-link-input');
  if (input) input.focus();
}

function showAsgnLink() {
  const panel = document.getElementById('asgn-link-panel');
  if (panel) panel.classList.add('is-open');
  const input = document.getElementById('asgn-url');
  if (input) input.focus();
}

function addMatLinkRow() {
  const list = document.getElementById('mat-link-list');
  if (!list) return;
  if (list.querySelectorAll('.mat-link-input').length >= 8) {
    alert('You can attach up to 8 links.');
    return;
  }
  const panel = document.getElementById('mat-link-panel');
  if (panel) panel.classList.add('is-open');
  list.insertAdjacentHTML('beforeend', matLinkRowHtml());
  const inputs = list.querySelectorAll('.mat-link-input');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function removeMatLinkRow(btn) {
  const list = document.getElementById('mat-link-list');
  const row = btn && btn.closest ? btn.closest('.mat-link-row') : null;
  if (!list || !row) return;
  if (list.querySelectorAll('.mat-link-row').length <= 1) {
    const input = row.querySelector('.mat-link-input');
    if (input) input.value = '';
    return;
  }
  row.remove();
}

function renderMatChosenFiles() {
  const chosen = document.getElementById('mat-file-chosen');
  if (!chosen) return;
  if (!_matFiles.length) {
    chosen.style.display = 'none';
    chosen.innerHTML = '';
    return;
  }
  chosen.style.display = 'flex';
  chosen.innerHTML = _matFiles.map(function (file, i) {
    return '<span class="pf-chip" onclick="event.stopPropagation()">' + teacherEsc(file.name)
      + '<button type="button" onclick="event.stopPropagation();removeMatFile(' + i + ')" aria-label="Remove file">\u00d7</button></span>';
  }).join('');
}

function removeMatFile(index) {
  _matFiles.splice(index, 1);
  renderMatChosenFiles();
}

function onMatFileChosen(input) {
  const incoming = input && input.files ? Array.prototype.slice.call(input.files) : [];
  if (!incoming.length) return;
  incoming.forEach(function (file) {
    if (_matFiles.length >= 8) {
      alert('You can attach up to 8 files.');
      return;
    }
    const err = prismTeacherCheckFile(file);
    if (err) { alert(file.name + ': ' + err); return; }
    _matFiles.push(file);
  });
  input.value = '';
  const titleEl = document.getElementById('mat-title');
  if (titleEl && !titleEl.value.trim() && _matFiles[0]) titleEl.value = _matFiles[0].name.replace(/\.[^.]+$/, '');
  renderMatChosenFiles();
}

function resetMatComposer() {
  _matFiles = [];
  const fileInp = document.getElementById('mat-file-input');
  if (fileInp) fileInp.value = '';
  renderMatChosenFiles();
  const list = document.getElementById('mat-link-list');
  if (list) list.innerHTML = matLinkRowHtml();
  const panel = document.getElementById('mat-link-panel');
  if (panel) panel.classList.remove('is-open');
}

function bindDropZone(zoneId, inputId, onChosen) {
  const zone = document.getElementById(zoneId);
  if (!zone || zone.dataset.bound === '1') return;
  zone.dataset.bound = '1';
  zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('is-drag'); });
  zone.addEventListener('dragleave', function(){ zone.classList.remove('is-drag'); });
  zone.addEventListener('drop', function(e){
    e.preventDefault(); zone.classList.remove('is-drag');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const inp = document.getElementById(inputId);
    if (!inp) return;
    try {
      inp.files = e.dataTransfer.files;
      onChosen(inp);
    } catch (err) {
      onChosen({ files: e.dataTransfer.files });
    }
  });
}

function bindMatDropZone() {
  bindDropZone('mat-drop-zone', 'mat-file-input', onMatFileChosen, '#10b981', '#d1fae5');
}

function bindAsgnDropZone() {
  bindDropZone('asgn-drop-zone', 'asgn-file-input', onAsgnFileChosen, '#ec4899', '#fbcfe8');
}

function onAsgnFileChosen(input) {
  const file = input.files[0];
  if (!file) return;
  const err = prismTeacherCheckFile(file);
  if (err) { alert(err); input.value = ''; _asgnFile = null; return; }
  _asgnFile = file;
  const chosen = document.getElementById('asgn-file-chosen');
  if (chosen) {
    chosen.style.display = 'flex';
    chosen.innerHTML = '<span class="pf-chip">' + teacherEsc(file.name)
      + '<button type="button" onclick="clearAsgnFile()" aria-label="Remove file">\u00d7</button></span>';
  }
}

function clearAsgnFile() {
  _asgnFile = null;
  const input = document.getElementById('asgn-file-input');
  if (input) input.value = '';
  const chosen = document.getElementById('asgn-file-chosen');
  if (chosen) { chosen.style.display = 'none'; chosen.innerHTML = ''; }
}

function showMatMsg(msg,type){ const el=document.getElementById('mat-msg'); if(!el) return; el.textContent=msg; el.className='form-msg '+type; setTimeout(()=>el.textContent='',3000); }

function teacherEsc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function collectMatLinks() {
  const urls = [];
  document.querySelectorAll('.mat-link-input').forEach(function (input) {
    const raw = input.value.trim();
    if (!raw) return;
    const normalized = typeof prismNormalizeHttpUrl === 'function' ? prismNormalizeHttpUrl(raw) : raw;
    if (!normalized) {
      urls.push(null);
      return;
    }
    if (urls.indexOf(normalized) === -1) urls.push(normalized);
  });
  return urls;
}

async function addMaterial(){
  const title = document.getElementById('mat-title').value.trim();
  if (!title) { showMatMsg('Please enter a title.','err'); return; }
  const descEl = document.getElementById('mat-desc');
  const desc = descEl ? descEl.value.trim() : '';
  let urls = collectMatLinks();
  if (urls.indexOf(null) !== -1) {
    showMatMsg('That link does not look valid. Use http:// or https://','err');
    return;
  }
  if (!urls.length && typeof prismExtractFirstUrl === 'function') {
    const found = prismExtractFirstUrl(desc) || '';
    if (found) urls = [found];
  }
  if (!_matFiles.length && !urls.length && !desc) {
    showMatMsg('Attach a file, paste a link, or add a short note.','err');
    return;
  }
  const type = _matFiles.length ? 'file' : (urls[0] && typeof prismVideoEmbedFromUrl === 'function' && prismVideoEmbedFromUrl(urls[0]) ? 'video' : 'link');
  const btn=document.getElementById('mat-upload-btn');
  if (typeof prismSetBusy === 'function') prismSetBusy(btn, true, 'Saving…');
  else { btn.disabled=true; btn.textContent='Saving…'; }
  try {
    const matRes = await PrismMaterials.add({
      class_id:activeClassId, title, type, urls: urls,
      files: _matFiles.slice(),
      desc: desc,
      target_section: getWorkspaceTargetSectionForApi(),
    });
    const streamAttach = (matRes && matRes.file_path) ? matRes.file_path : (urls[0] || '');
    await PrismPosts.add({
      class_id:activeClassId, teacherId:TEACHER_ID, type:'material',
      body:'New material: "'+title+'"', attachment: streamAttach,
      author:sessionStorage.getItem('prism_user_name')||'Teacher',
      target_section: getWorkspaceTargetSectionForApi(),
    });
    document.getElementById('mat-title').value='';
    if (descEl) descEl.value='';
    resetMatComposer();
    await refreshClassData(activeClassId);
    renderMaterials(); renderWorkspacePage();
    closeClassworkComposer();
    showMatMsg(' Shared with the class.','ok');
  } catch(e) { showMatMsg(e.message||'Upload failed.','err'); }
  finally {
    if (typeof prismSetBusy === 'function') prismSetBusy(btn, false);
    else { btn.disabled=false; btn.textContent='Share with class'; }
  }
}

function teacherMaterialPieces(it) {
  var raw = it && it.attachments_json;
  if (typeof raw === 'string' && raw.trim()) {
    try { raw = JSON.parse(raw); } catch (e) { raw = []; }
  }
  var pieces = [];
  if (Array.isArray(raw)) {
    raw.forEach(function (a) {
      if (!a) return;
      if (a.path) pieces.push({ kind: 'file', name: a.name || 'Attachment', path: a.path, mime: a.mime || '' });
      else if (a.url) pieces.push({ kind: 'link', url: a.url });
    });
  }
  if (!pieces.length && it) {
    if (it.file_path || it.file_data) pieces.push({ kind: 'file', name: it.file_name || 'Attachment', path: it.file_path || '', mime: it.mime_type || '', legacyId: it.id });
    var href = typeof prismMaterialHttpUrl === 'function' ? prismMaterialHttpUrl(it) : (it.url || '');
    if (href) pieces.push({ kind: 'link', url: href });
  }
  return pieces;
}

function toggleClassworkMenu(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  var menu = document.getElementById('cw-menu');
  if (menu) menu.hidden = !menu.hidden;
}
function openClassworkComposer(kind) {
  var menu = document.getElementById('cw-menu');
  if (menu) menu.hidden = true;
  var mat = document.getElementById('cw-composer-material');
  var asgn = document.getElementById('cw-composer-assignment');
  if (mat) mat.hidden = kind !== 'material';
  if (asgn) asgn.hidden = kind !== 'assignment';
  if (kind === 'assignment') fillAsgnSide();
  var box = kind === 'assignment' ? asgn : mat;
  if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
}
function closeClassworkComposer() {
  var mat = document.getElementById('cw-composer-material');
  var asgn = document.getElementById('cw-composer-assignment');
  if (mat) mat.hidden = true;
  if (asgn) asgn.hidden = true;
}
document.addEventListener('click', function (e) {
  var menu = document.getElementById('cw-menu');
  if (!menu || menu.hidden) return;
  if (menu.contains(e.target)) return;
  menu.hidden = true;
});

function classworkPosted(raw) {
  var t = Date.parse(raw || '');
  if (!t) return '';
  return 'Posted ' + new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function classworkIcon(kind) {
  if (kind === 'assignment') {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 3.5h6v2.5H9z"/></svg>';
  }
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 3v5h5"/></svg>';
}
function classworkTopic(title, rows) {
  return '<details class="cw-topic" open><summary><span>' + teacherEsc(title) + '</span>'
    + '<svg class="cw-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>'
    + rows + '</details>';
}
function renderClasswork() {
  var list = document.getElementById('classwork-list');
  if (!list || !activeClassId) return;
  var filterEl = document.getElementById('cw-filter');
  var searchEl = document.getElementById('cw-search');
  var filter = filterEl ? filterEl.value : 'all';
  var q = searchEl ? String(searchEl.value || '').trim().toLowerCase() : '';
  function named(title) {
    if (!q) return true;
    return String(title || '').toLowerCase().indexOf(q) !== -1;
  }
  var mats = ((getMaterials()[activeClassId]) || []).filter(itemMatchesWorkspaceSectionFilter).filter(function (it) { return named(it.title); });
  var asgns = ((getAssignments()[activeClassId]) || []).filter(itemMatchesWorkspaceSectionFilter).filter(function (it) { return named(it.title); });
  if (filter === 'material') asgns = [];
  else if (filter === 'assignment') mats = [];
  else if (filter === 'written' || filter === 'project' || filter === 'lab' || filter === 'oral') {
    mats = [];
    asgns = asgns.filter(function (it) { return (it.type || 'written') === filter; });
  }
  var btn = 'border:none;padding:.32rem .7rem;border-radius:8px;font-size:.72rem;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block;background:#ede9fe;color:#5b21b6;';
  function matRow(it) {
    var pieces = teacherMaterialPieces(it);
    var actions = pieces.map(function (p) {
      if (p.kind === 'file' && p.path) {
        return '<button type="button" onclick=\'prismOpenMaterialUrl(' + JSON.stringify(p.path) + ',' + JSON.stringify(p.mime || '') + ',' + JSON.stringify(p.name || '') + ')\' style="' + btn + '">' + teacherEsc(p.name || 'File') + '</button>';
      }
      if (p.kind === 'file') return '<button type="button" onclick="downloadMaterial(\'' + it.id + '\')" style="' + btn + '">' + teacherEsc(p.name || 'Download') + '</button>';
      return '<a href="' + teacherEsc(p.url) + '" target="_blank" rel="noopener" style="' + btn + '">Open link</a>';
    }).join('');
    var note = it.description || it.desc || '';
    var sec = (it.target_section && String(it.target_section).trim()) ? teacherEsc(String(it.target_section).trim()) : '';
    var body = (sec ? '<div>' + sec + '</div>' : '')
      + (note ? '<div style="margin-top:.25rem;white-space:pre-wrap;">' + teacherEsc(note) + '</div>' : '')
      + '<div class="cw-actions">' + actions
      + '<button type="button" class="mat-del" onclick="deleteMaterial(\'' + it.id + '\')">Remove</button></div>';
    return '<details class="cw-item"><summary><span class="cw-ico">' + classworkIcon('material') + '</span><span class="cw-title">' + teacherEsc(it.title || 'Material') + '</span><span class="cw-date">' + teacherEsc(classworkPosted(it.created_at || it.date)) + '</span></summary><div class="cw-body">' + body + '</div></details>';
  }
  function asgnRow(it) {
    var dStr = it.due_date || it.due || '';
    var dTime = it.due_time || '';
    var dueDisp = dStr && typeof prismFormatAssignmentDue === 'function' ? prismFormatAssignmentDue(dStr, dTime) : dStr;
    var attachPath = String(it.attach_file_path || it.attachFilePath || '').trim();
    var attachName = String(it.attach_file_name || it.attachFileName || 'file').trim();
    var attachMime = String(it.attach_mime || it.attachMime || '').trim();
    var attachUrl = String(it.attach_url || it.attachUrl || '').trim();
    var actions = '';
    if (attachPath) actions += '<button type="button" onclick=\'prismOpenMaterialUrl(' + JSON.stringify(attachPath) + ',' + JSON.stringify(attachMime) + ',' + JSON.stringify(attachName) + ')\' style="' + btn + '">' + teacherEsc(attachName) + '</button>';
    if (attachUrl) {
      var href = typeof prismNormalizeHttpUrl === 'function' ? (prismNormalizeHttpUrl(attachUrl) || attachUrl) : attachUrl;
      actions += '<a href="' + teacherEsc(href) + '" target="_blank" rel="noopener" style="' + btn + '">Open link</a>';
    }
    var bits = [];
    if (it.points || it.pts) bits.push((it.points || it.pts) + ' pts');
    if (dueDisp) bits.push('Due ' + dueDisp);
    if (it.target_section && String(it.target_section).trim()) bits.push(String(it.target_section).trim());
    var instructions = String(it.instructions || '').trim();
    var body = (bits.length ? '<div>' + teacherEsc(bits.join(' · ')) + '</div>' : '')
      + (instructions ? '<div style="margin-top:.25rem;white-space:pre-wrap;">' + teacherEsc(instructions) + '</div>' : '')
      + '<div class="cw-actions">' + actions
      + '<button type="button" onclick="openSubjectRecords()" style="border:none;background:none;color:#059669;font-weight:700;cursor:pointer;font-family:inherit;font-size:.78rem;">Records</button>'
      + '<button type="button" class="mat-del" onclick="deleteAssignment(\'' + it.id + '\')">Remove</button></div>';
    return '<details class="cw-item"><summary><span class="cw-ico assignment">' + classworkIcon('assignment') + '</span><span class="cw-title">' + teacherEsc(it.title || 'Assignment') + '</span><span class="cw-date">' + teacherEsc(classworkPosted(it.created_at || it.date)) + '</span></summary><div class="cw-body">' + body + '</div></details>';
  }
  var groups = [];
  if (mats.length) groups.push(classworkTopic('Materials', mats.map(matRow).join('')));
  var typeNames = { written: 'Written', project: 'Projects', lab: 'Laboratory exercises', oral: 'Oral' };
  var typeOrder = ['lab', 'written', 'project', 'oral'];
  typeOrder.forEach(function (type) {
    var rows = asgns.filter(function (it) { return (it.type || 'written') === type; });
    if (rows.length) groups.push(classworkTopic(typeNames[type], rows.map(asgnRow).join('')));
  });
  var empty = (filter === 'all' && !q)
    ? 'No classwork yet. Use the plus button to add a material or an assignment.'
    : 'Nothing matches this filter.';
  list.innerHTML = groups.length ? groups.join('') : '<div class="cw-empty">' + empty + '</div>';
}

function renderMaterials(){
  if (document.getElementById('classwork-list')) { renderClasswork(); return; }
  loadTeacherMaterialViewFilter();
  const m=getMaterials(),list=document.getElementById('materials-list'),raw=(m[activeClassId]||[]);
  const items=raw.filter(itemMatchesWorkspaceSectionFilter);
  populateTeacherMaterialFilterSelect(items);
  if(!list) return;
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:2rem;color:#9ca3af;font-size:.9rem;">No materials yet. Add a PDF, image, video, or link above.</div>';return;}
  const displayItems=teacherMaterialViewFilter==='__all__'?items:items.filter(it=>String(it.id)===teacherMaterialViewFilter);
  if(!displayItems.length){
    list.innerHTML='<div style="text-align:center;padding:2rem;color:#9ca3af;font-size:.9rem;">No material matches this filter. Choose <strong>All materials</strong> above.</div>';
    return;
  }
  const bgColor={pdf:'background:#fee2e2;',image:'background:#dbeafe;',file:'background:#dbeafe;',link:'background:#fce7f3;',video:'background:#fee2e2;','video-file':'background:#ffedd5;',ppt:'background:#ffedd5;'};
  list.innerHTML=displayItems.map(it=>{
    const kind = typeof prismMaterialKind === 'function'
      ? prismMaterialKind(it.mime_type, it.file_name || it.url, it.type)
      : (it.type || 'file');
    const icon = typeof prismMaterialIcon === 'function' ? prismMaterialIcon(kind) : '';
    const kindLabel = typeof prismMaterialKindLabel === 'function' ? prismMaterialKindLabel(kind) : (it.type || 'File');
    const secTag = (it.target_section && String(it.target_section).trim()) ? '<span style="font-size:.68rem;font-weight:700;color:#059669;margin-left:.35rem;">· '+teacherEsc(String(it.target_section).trim())+'</span>' : '';
    const pieces = teacherMaterialPieces(it);
    const filePieces = pieces.filter(function (p) { return p.kind === 'file'; });
    const linkPieces = pieces.filter(function (p) { return p.kind === 'link'; });
    const btnBase = 'border:none;padding:.38rem .9rem;border-radius:8px;font-size:.78rem;font-weight:700;white-space:nowrap;cursor:pointer;text-decoration:none;display:inline-block;margin:.2rem .35rem .2rem 0;';
    let actionBtn = filePieces.map(function (p) {
      if (p.path) {
        return '<button type="button" onclick=\'prismOpenMaterialUrl('+JSON.stringify(p.path)+','+JSON.stringify(p.mime||'')+','+JSON.stringify(p.name||'')+')\' style="'+btnBase+'background:#10b981;color:white;">'+teacherEsc(p.name || 'File')+'</button>';
      }
      return '<button type="button" onclick="downloadMaterial(\''+it.id+'\')" style="'+btnBase+'background:#10b981;color:white;">'+teacherEsc(p.name || 'Download')+'</button>';
    }).join('') + linkPieces.map(function (p) {
      return '<a href="'+teacherEsc(p.url)+'" target="_blank" rel="noopener" style="'+btnBase+'background:#6366f1;color:white;">'+teacherEsc(p.url)+'</a>';
    }).join('');
    let iconHtml;
    if (kind === 'image' && it.file_path) {
      iconHtml = '<img class="mat-thumb" src="'+teacherEsc(it.file_path)+'" alt=""/>';
    } else {
      iconHtml = '<div class="mat-icon" style="'+(bgColor[kind]||bgColor[it.type]||'')+'">'+icon+'</div>';
    }
    const metaBits = [];
    if (filePieces.length) metaBits.push(filePieces.length + (filePieces.length === 1 ? ' file' : ' files'));
    if (linkPieces.length) metaBits.push(linkPieces.length + (linkPieces.length === 1 ? ' link' : ' links'));
    if (!metaBits.length) metaBits.push(kindLabel);
    const note = it.description || it.desc || '';
    const noteHtml = note
      ? '<div class="mat-meta" style="margin-top:.25rem;white-space:pre-wrap;">'+(typeof prismLinkifyHtml==='function'?prismLinkifyHtml(note):teacherEsc(note))+'</div>'
      : '';
    return '<div class="mat-item">'
      + iconHtml
      + '<div class="mat-info"><div class="mat-title">'+teacherEsc(it.title)+'</div>'
      + '<div class="mat-meta">'+teacherEsc(metaBits.join(' · '))+secTag+' · '+new Date(it.created_at||it.date).toLocaleDateString()+'</div>'
      + noteHtml + '</div>'
      + actionBtn
      + '<button class="mat-del" onclick="deleteMaterial(\''+it.id+'\')">Remove</button>'
      + '</div>';
  }).join('');
}

function downloadMaterial(id){
  const items=getMaterials()[activeClassId]||[];
  const it=items.find(x=>x.id===id);
  if(!it||!it.file_data)return;
  const a=document.createElement('a'); a.href=it.file_data; a.download=it.file_name||it.title;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function deleteMaterial(id){
  try {
    await PrismMaterials.delete(id);
    await refreshClassData(activeClassId);
    renderMaterials(); renderWorkspacePage();
  } catch(e){ alert(e.message||'Failed to delete material.'); }
}

/* ═══════════════════════════ ASSIGNMENTS ═══════════════════════════ */
async function addAssignment(){
  const title=document.getElementById('asgn-title').value.trim();
  if(!title){alert('Title is required.');return;}
  const due=document.getElementById('asgn-due').value;
  const dueTimeEl=document.getElementById('asgn-due-time');
  const dueTime=due && dueTimeEl && dueTimeEl.value ? dueTimeEl.value.trim() : '';
  const urlRaw = (document.getElementById('asgn-url') && document.getElementById('asgn-url').value || '').trim();
  let attachUrl = '';
  if (urlRaw) {
    attachUrl = typeof prismNormalizeHttpUrl === 'function' ? prismNormalizeHttpUrl(urlRaw) : urlRaw;
    if (!attachUrl) { alert('Please enter a valid website or video link, or leave the link field empty.'); return; }
  }
  var asgnBtn = document.querySelector('button[onclick="addAssignment()"]');
  if (typeof prismSetBusy === 'function') prismSetBusy(asgnBtn, true, 'Creating…');
  try {
    const asgnRes = await PrismAssignments.add({
      class_id:activeClassId, title,
      due: due||null,
      due_time: dueTime || null,
      pts:document.getElementById('asgn-pts').value,
      type:document.getElementById('asgn-type').value,
      instructions:document.getElementById('asgn-instructions').value.trim(),
      target_section: assignmentTargetSection(),
      attach_url: attachUrl || '',
      file: _asgnFile || null,
    });
    const dueLine = due && typeof prismFormatAssignmentDue === 'function' ? prismFormatAssignmentDue(due, dueTime) : due;
    const streamAttach = (asgnRes && asgnRes.attach_file_path) ? asgnRes.attach_file_path : (attachUrl || null);
    await PrismPosts.add({
      class_id:activeClassId, teacherId:TEACHER_ID, type:'assignment',
      body:'New assignment: "'+title+'"'+(due?' · Due '+dueLine:''),
      attachment: streamAttach,
      author:sessionStorage.getItem('prism_user_name')||'Teacher',
      target_section: assignmentTargetSection(),
    });
    ['asgn-title','asgn-pts','asgn-instructions','asgn-due','asgn-due-time','asgn-url'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    syncAsgnReady();
    closeClassworkComposer();
    clearAsgnFile();
    const linkPanel = document.getElementById('asgn-link-panel');
    if (linkPanel) linkPanel.classList.remove('is-open');
    await refreshClassData(activeClassId);
    renderAssignments(); renderWorkspacePage();
  } catch(e){ alert(e.message||'Failed to create assignment.'); }
  finally { if (typeof prismSetBusy === 'function') prismSetBusy(asgnBtn, false); }
}

function renderAssignments(){
  if (document.getElementById('classwork-list')) return;
  loadTeacherAssignmentViewFilter();
  const a=getAssignments(),list=document.getElementById('assignments-list'),raw=(a[activeClassId]||[]);
  const items=raw.filter(itemMatchesWorkspaceSectionFilter);
  populateTeacherAssignmentFilterSelect(items);
  if(!list) return;
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:2rem;color:#9ca3af;font-size:.9rem;">No assignments yet. Create one above.</div>';return;}
  const displayItems=teacherAssignmentViewFilter==='__all__'?items:items.filter(it=>String(it.id)===teacherAssignmentViewFilter);
  if(!displayItems.length){
    list.innerHTML='<div style="text-align:center;padding:2rem;color:#9ca3af;font-size:.9rem;">No assignment matches this filter. Choose <strong>All assignments</strong> above.</div>';
    return;
  }
  const typeIcons={written:'Written',project:'Project',lab:'Lab',oral:'Oral'};
  const btnBase = 'border:none;padding:.32rem .7rem;border-radius:8px;font-size:.72rem;font-weight:700;white-space:nowrap;cursor:pointer;text-decoration:none;';
  list.innerHTML=displayItems.map(it=>{
    const dStr = it.due_date||it.due||'';
    const dTime = it.due_time||'';
    const overdue = dStr && typeof prismIsPastDue === 'function' ? prismIsPastDue(dStr, dTime) : false;
    const dueDisp = dStr && typeof prismFormatAssignmentDue === 'function' ? prismFormatAssignmentDue(dStr, dTime) : dStr;
    const attachPath = String(it.attach_file_path || it.attachFilePath || '').trim();
    const attachName = String(it.attach_file_name || it.attachFileName || 'file').trim();
    const attachMime = String(it.attach_mime || it.attachMime || '').trim();
    const attachUrl = String(it.attach_url || it.attachUrl || '').trim();
    let srcBtns = '';
    if (attachPath) {
      const prev = typeof prismCanPreviewInBrowser === 'function' && prismCanPreviewInBrowser(attachMime, attachName);
      srcBtns += '<button type="button" onclick=\'prismOpenMaterialUrl('+JSON.stringify(attachPath)+','+JSON.stringify(attachMime)+','+JSON.stringify(attachName)+')\' style="'+btnBase+'background:#ede9fe;color:#5b21b6;">'+(prev?' Source':' Source')+'</button>';
    }
    if (attachUrl) {
      const href = typeof prismNormalizeHttpUrl === 'function' ? (prismNormalizeHttpUrl(attachUrl) || attachUrl) : attachUrl;
      srcBtns += '<a href="'+teacherEsc(href)+'" target="_blank" rel="noopener" style="'+btnBase+'background:#ede9fe;color:#5b21b6;"> Link</a>';
    }
    const srcMeta = attachPath ? attachName : (attachUrl ? 'Link attached' : '');
    return '<div class="asgn-item">'
      +'<div style="font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#059669;min-width:3.6rem;">'+(typeIcons[it.type]||'')+'</div>'
      +'<div class="asgn-info"><div class="asgn-title">'+teacherEsc(it.title)+'</div>'
      +'<div class="asgn-meta">'+(it.points||it.pts?((it.points||it.pts)+' pts · '):'')+((it.target_section&&String(it.target_section).trim())?('<span style="color:#059669;font-weight:700;">'+teacherEsc(String(it.target_section).trim())+'</span> · '):'')+(srcMeta?teacherEsc(srcMeta)+' · ':'')+(it.instructions?teacherEsc(it.instructions.slice(0,60))+'…':'')+'</div></div>'
      + srcBtns
      +(dStr?'<div class="asgn-due'+(overdue?' overdue':'')+'">'+( overdue?' ':'' )+'Due '+dueDisp+'</div>':'')
      +'<button type="button" onclick="openSubjectRecords()" style="font-size:.72rem;color:#059669;font-weight:700;white-space:nowrap;background:none;border:none;cursor:pointer;font-family:\'DM Sans\',sans-serif;">Records</button>'
      +'<button class="mat-del" onclick="deleteAssignment(\''+it.id+'\')">Remove</button>'
      +'</div>';
  }).join('');
}

async function deleteAssignment(id){
  try {
    await PrismAssignments.delete(id);
    await refreshClassData(activeClassId);
    renderAssignments(); renderWorkspacePage();
  } catch(e){ alert(e.message||'Failed to delete assignment.'); }
}

function loadTeacherAssignmentViewFilter() {
  if (!activeClassId) { teacherAssignmentViewFilter = '__all__'; return; }
  try {
    const v = sessionStorage.getItem('prism_teacher_asgn_view_filter_' + activeClassId);
    teacherAssignmentViewFilter = (v != null && v !== '') ? v : '__all__';
  } catch (e) { teacherAssignmentViewFilter = '__all__'; }
}
function saveTeacherAssignmentViewFilter(id) {
  teacherAssignmentViewFilter = id;
  try {
    if (activeClassId) sessionStorage.setItem('prism_teacher_asgn_view_filter_' + activeClassId, id);
  } catch (e) { /* ignore */ }
}
function populateTeacherAssignmentFilterSelect(items) {
  const wrap = document.getElementById('teacher-asgn-filter-wrap');
  const sel = document.getElementById('teacher-asgn-filter-select');
  if (!wrap || !sel) return;
  const sorted = items.slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
  sel.innerHTML = '';
  const o0 = document.createElement('option');
  o0.value = '__all__';
  o0.textContent = 'All assignments';
  sel.appendChild(o0);
  sorted.forEach(it => {
    const o = document.createElement('option');
    o.value = String(it.id);
    o.textContent = it.title || 'Untitled';
    sel.appendChild(o);
  });
  const ids = new Set(sorted.map(it => String(it.id)));
  if (teacherAssignmentViewFilter !== '__all__' && !ids.has(teacherAssignmentViewFilter)) {
    teacherAssignmentViewFilter = '__all__';
    saveTeacherAssignmentViewFilter('__all__');
  }
  sel.value = teacherAssignmentViewFilter;
  sel.onchange = () => {
    saveTeacherAssignmentViewFilter(sel.value);
    renderAssignments();
  };
  wrap.style.display = sorted.length ? 'flex' : 'none';
}

function loadTeacherMaterialViewFilter() {
  if (!activeClassId) { teacherMaterialViewFilter = '__all__'; return; }
  try {
    const v = sessionStorage.getItem('prism_teacher_mat_view_filter_' + activeClassId);
    teacherMaterialViewFilter = (v != null && v !== '') ? v : '__all__';
  } catch (e) { teacherMaterialViewFilter = '__all__'; }
}
function saveTeacherMaterialViewFilter(id) {
  teacherMaterialViewFilter = id;
  try {
    if (activeClassId) sessionStorage.setItem('prism_teacher_mat_view_filter_' + activeClassId, id);
  } catch (e) { /* ignore */ }
}
function populateTeacherMaterialFilterSelect(items) {
  const wrap = document.getElementById('teacher-mat-filter-wrap');
  const sel = document.getElementById('teacher-mat-filter-select');
  if (!wrap || !sel) return;
  const sorted = items.slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
  sel.innerHTML = '';
  const o0 = document.createElement('option');
  o0.value = '__all__';
  o0.textContent = 'All materials';
  sel.appendChild(o0);
  sorted.forEach(it => {
    const o = document.createElement('option');
    o.value = String(it.id);
    o.textContent = it.title || 'Untitled';
    sel.appendChild(o);
  });
  const ids = new Set(sorted.map(it => String(it.id)));
  if (teacherMaterialViewFilter !== '__all__' && !ids.has(teacherMaterialViewFilter)) {
    teacherMaterialViewFilter = '__all__';
    saveTeacherMaterialViewFilter('__all__');
  }
  sel.value = teacherMaterialViewFilter;
  sel.onchange = () => {
    saveTeacherMaterialViewFilter(sel.value);
    renderMaterials();
  };
  wrap.style.display = sorted.length ? 'flex' : 'none';
}
