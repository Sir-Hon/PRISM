/** Page script for teacher.html — keep HTML in the .html file. */
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
  const slim = CLASSES.map(c => ({
    id: c.id,
    subject: c.subject,
    color: c.color || '#7c3aed',
    code: c.code,
    teacher_id: c.teacher_id || TEACHER_ID,
    student_count: parseInt(c.student_count, 10) || 0,
  }));
  localStorage.setItem('prism_classes_' + TEACHER_ID, JSON.stringify(slim));
}

function genJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c='';
  for(let i=0;i<6;i++) c+=chars[Math.floor(Math.random()*chars.length)];
  return c;
}

/* ── State ── */
let activeClassId  = null;
/** Announcements: __all__ = whole class; else section label */
let activeStreamSection = '__all__';
let activeSection  = 'all';
let questions      = [];

function fmtDashEvTime(t) {
  if (!t) return '';
  const p = String(t).split(':');
  const hr = parseInt(p[0], 10) || 0;
  const m = p[1] != null ? p[1] : '00';
  return ((hr % 12) || 12) + ':' + m + (hr >= 12 ? ' PM' : ' AM');
}
function escDash(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
async function renderTeacherPortalAnnouncements() {
  var feed = document.getElementById('teacher-portal-ann-feed');
  if (!feed) return;
  var anns = [];
  try {
    if (typeof PrismAdmin !== 'undefined' && PrismAdmin.getAnnouncements) {
      anns = await PrismAdmin.getAnnouncements();
    }
  } catch (e) { console.warn('Portal announcements:', e); }
  if (!anns.length) {
    feed.innerHTML = '<div style="text-align:center;padding:1rem 0;color:#9ca3af;font-size:.9rem;">No portal announcements yet.</div>';
    return;
  }
  var typeCls = { portal:'background:#d1fae5;color:#065f46;', alert:'background:#fee2e2;color:#991b1b;', info:'background:#dbeafe;color:#1d4ed8;' };
  var typeIco = { portal:'General', alert:'Alert', info:'Info' };
  feed.innerHTML = anns.slice(0, 5).map(function(a) {
    var rawDate = a.created_at || a.date;
    var dl = rawDate ? new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    var t = a.type || 'portal';
    var pill = '<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:.4rem;' + (typeCls[t] || typeCls.portal) + '">' + (typeIco[t] || '') + '</span>';
    var text = String(a.text == null ? '' : a.text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<div style="display:flex;gap:.8rem;padding:.75rem 0;border-bottom:1px solid #ecfdf5;">'
      + '<div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;flex-shrink:0;">' + String(a.author || 'A').charAt(0) + '</div>'
      + '<div style="min-width:0;flex:1;"><div style="font-size:.88rem;font-weight:700;color:#16132b;">' + String(a.author || 'Admin').replace(/</g, '&lt;') + pill + ' <span style="font-size:.74rem;color:#9ca3af;">' + dl + '</span></div>'
      + '<div style="font-size:.88rem;color:#374151;line-height:1.65;margin-top:.25rem;">' + text + '</div></div></div>';
  }).join('');
}

function renderDashboardIncomingEvents() {
  const el = document.getElementById('dash-events-list');
  if (!el) return;
  let raw = [];
  try { raw = JSON.parse(localStorage.getItem('prism_events') || '[]'); } catch (e) { raw = []; }
  const todayStr = new Date().toISOString().split('T')[0];
  const upcoming = raw.filter(e => e.date >= todayStr)
    .sort((a, b) => {
      const c = a.date.localeCompare(b.date);
      return c !== 0 ? c : String(a.time || '').localeCompare(String(b.time || ''));
    })
    .slice(0, 8);
  if (!upcoming.length) {
    el.innerHTML = '<div style="text-align:center;padding:1rem 0;color:#9ca3af;font-size:.9rem;">No upcoming events. Add events on the calendar.</div>';
    return;
  }
  el.innerHTML = upcoming.map(ev => {
    const dl = new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const bar = ev.color || '#6d28d9';
    return '<div class="dash-ev-row"><div class="dash-ev-bar" style="background:' + bar + '"></div><div><div class="dash-ev-title">' + escDash(ev.title || 'Event') + '</div><div class="dash-ev-meta">' + escDash(dl) + (ev.time ? ' · ' + fmtDashEvTime(ev.time) : '') + '</div></div></div>';
  }).join('');
}

/* ═══════════════════════════ INIT ═══════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  const user = await prismAuthGuard(['teacher']);
  if (!user) return;
  TEACHER_ID = user.id; // set AFTER auth resolves
  if(typeof initSidebar==='function') initSidebar('home');
  const hour = new Date().getHours();
  const g = hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
  document.getElementById('teacher-greeting').textContent = `${g}, ${user.name}`;
  paintTeacherClassesFromCache();
  renderDashboardIncomingEvents();
  await Promise.all([
    (async function(){
      try {
        if (typeof PrismEvents !== 'undefined' && PrismEvents.get) {
          const apiEv = await PrismEvents.get();
          const mapped = apiEv.map(e => ({
            id: e.id, title: e.title, date: e.event_date, time: e.event_time || '', notes: e.notes || '', color: e.color || '#6d28d9', alarm: e.alarm
          }));
          localStorage.setItem('prism_events', JSON.stringify(mapped));
          renderDashboardIncomingEvents();
        }
      } catch (evErr) { console.warn('Events sync:', evErr); }
    })(),
    renderTeacherPortalAnnouncements().catch(function(){}),
    loadClasses(),
  ]);
  renderStats();
});

function paintTeacherClassesFromCache() {
  if (CLASSES.length) return false;
  try {
    const cached = JSON.parse(localStorage.getItem('prism_classes_' + TEACHER_ID) || '[]');
    if (!cached.length) return false;
    CLASSES = cached;
    const savedTab = sessionStorage.getItem('prism_teacher_active_class_id');
    if (savedTab && CLASSES.find(c => c.id === savedTab)) activeClassId = savedTab;
    else activeClassId = CLASSES[0].id;
    ensureTeacherClassPanel();
    buildClassSelect();
    renderAll();
    renderStats();
    if (typeof initSidebar === 'function') initSidebar('home');
    return true;
  } catch (e) {
    return false;
  }
}

async function loadClasses() {
  paintTeacherClassesFromCache();
  try {
    CLASSES = await PrismClasses.getMyClasses();
    const idx = {};
    CLASSES.forEach(cls => { if(cls.code) idx[cls.code] = { classId:cls.id, teacherId:cls.teacher_id||TEACHER_ID, subject:cls.subject }; });
    saveCodeIndex(idx);
    persistTeacherClassesLocal();
  } catch(e) { console.error('loadClasses:', e); if (!CLASSES.length) CLASSES = []; }

  if (!CLASSES.length) {
    if (TEACHER_ID) localStorage.setItem('prism_classes_' + TEACHER_ID, '[]');
    showEmptyState(); return;
  }
  const params = new URLSearchParams(window.location.search);
  const urlClass = params.get('class');
  if (urlClass && CLASSES.find(c=>c.id===urlClass)) activeClassId = urlClass;
  else {
    const savedTab = sessionStorage.getItem('prism_teacher_active_class_id');
    if (savedTab && CLASSES.find(c=>c.id===savedTab)) activeClassId = savedTab;
    else if (!activeClassId || !CLASSES.find(c=>c.id===activeClassId)) activeClassId = CLASSES[0].id;
  }
  try { sessionStorage.setItem('prism_teacher_active_class_id', activeClassId); } catch (e) {}
  ensureTeacherClassPanel();
  buildClassSelect();
  renderAll();
  renderStats();
  if (typeof initSidebar === 'function') initSidebar('home');
  if (typeof markSidebarClassActive === 'function') markSidebarClassActive(activeClassId);
  await refreshClassData(activeClassId);
  renderAll();
  renderStats();
  CLASSES.filter(function(c){ return c.id !== activeClassId; }).forEach(function(cls){
    refreshClassData(cls.id).catch(function(){});
  });
}

async function onTeacherClassChange(id) {
  if (!id || !CLASSES.find(c => c.id === id)) return;
  activeClassId = id;
  try { sessionStorage.setItem('prism_teacher_active_class_id', id); } catch (e) {}
  if (typeof markSidebarClassActive === 'function') markSidebarClassActive(id);
  activeSection = 'all';
  loadStreamSectionForClass(id);
  await refreshClassData(id);
  renderAll();
  renderStats();
}

function buildClassSelect() {
  const sel = document.getElementById('teacher-class-select');
  if (!sel) return;
  sel.innerHTML = '';
  if (!CLASSES.length) {
    sel.innerHTML = '<option value="">No subjects yet</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  CLASSES.forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls.id;
    opt.textContent = typeof prismTeacherClassLabel === 'function' ? prismTeacherClassLabel(cls) : (cls.subject || 'Class');
    if (cls.id === activeClassId) opt.selected = true;
    sel.appendChild(opt);
  });
  if (activeClassId && CLASSES.find(c => c.id === activeClassId)) sel.value = activeClassId;
  else if (CLASSES[0]) {
    activeClassId = CLASSES[0].id;
    sel.value = activeClassId;
    try { sessionStorage.setItem('prism_teacher_active_class_id', activeClassId); } catch (e) {}
  }
}

/** Re-injected after empty state reset */
const TEACHER_CLASS_CONTENT_HTML = `
      <div class="t-card" style="margin-bottom:1.2rem;">
        <div class="t-card-title"> Announcements</div>
        <textarea class="composer" id="stream-text" placeholder="Write an announcement for your class…"></textarea>
        <div class="composer-row" style="justify-content:flex-end;margin-top:.75rem;">
          <button class="t-btn" onclick="postStream()">Post announcement →</button>
        </div>
      </div>
      <div id="stream-feed"></div>`;

function ensureTeacherClassPanel() {
  if (document.getElementById('stream-feed')) return;
  const wrap = document.getElementById('class-content');
  if (!wrap) return;
  wrap.innerHTML = TEACHER_CLASS_CONTENT_HTML;
}

function showEmptyState() {
  const tsel = document.getElementById('teacher-class-select');
  if (tsel) {
    tsel.innerHTML = '<option value="">No subjects yet — create your first one</option>';
    tsel.disabled = true;
  }
  const ow = document.getElementById('teacher-open-workspace');
  if (ow) { ow.style.display = 'none'; }
  const scopeBanner = document.getElementById('teacher-class-scope-banner');
  if (scopeBanner) { scopeBanner.style.display = 'none'; scopeBanner.innerHTML = ''; }
  const secWrap = document.getElementById('teacher-section-pills-wrap');
  if (secWrap) { secWrap.style.display = 'none'; secWrap.innerHTML = ''; }
  document.getElementById('class-content').innerHTML = `
    <div style="text-align:center;padding:4rem 2rem;background:#fff;border-radius:18px;border:2px dashed #d1fae5;">
      <div style="font-family:'DM Sans',sans-serif;font-size:1.15rem;font-weight:700;color:#16132b;margin-bottom:.5rem;">No subjects yet</div>
      <p style="color:#9ca3af;font-size:.95rem;margin-bottom:1.5rem;">Create your first subject to get started.</p>
      <button class="t-btn" onclick="openCreateClass()" style="padding:.75rem 2rem;font-size:1rem;">+ Create Subject</button>
    </div>`;
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
function loadStreamSectionForClass(classId) {
  try {
    let v = sessionStorage.getItem('prism_teacher_stream_section_' + classId);
    if (v == null || v === '') {
      v = sessionStorage.getItem('prism_teacher_target_section_' + classId);
      if (v != null && v !== '') sessionStorage.setItem('prism_teacher_stream_section_' + classId, v);
    }
    const secs = uniqueSectionsFromStudents(classId);
    if (v == null || v === '' || v === '__all__') {
      activeStreamSection = '__all__';
      return;
    }
    if (secs.indexOf(v) >= 0) {
      activeStreamSection = v;
      return;
    }
  } catch (e) { /* ignore */ }
  activeStreamSection = '__all__';
}
function itemMatchesStreamSectionFilter(item) {
  const t = (item && item.target_section != null) ? String(item.target_section).trim() : '';
  if (activeStreamSection === '__all__') return true;
  if (!t) return true;
  return t === activeStreamSection;
}
function getStreamTargetSectionForApi() {
  if (activeStreamSection === '__all__') return null;
  return activeStreamSection;
}
function renderTeacherSectionPills() {
  const wrap = document.getElementById('teacher-section-pills-wrap');
  if (!wrap) return;
  const cls = CLASSES.find(c => c.id === activeClassId);
  if (!cls) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  let sections = uniqueSectionsFromStudents(activeClassId);
  if (activeStreamSection !== '__all__' && sections.indexOf(activeStreamSection) < 0) {
    sections = [...sections, activeStreamSection].sort();
  }
  wrap.style.display = 'block';
  let html = '<div style="font-size:.72rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.45rem;">Announcements — filter by section</div>'
    + '<div class="section-pills">';
  html += '<button type="button" class="section-pill' + (activeStreamSection === '__all__' ? ' active' : '') + '" data-sec="__all__">All Sections</button>';
  sections.forEach(sec => {
    const esc = String(sec).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    html += '<button type="button" class="section-pill' + (activeStreamSection === sec ? ' active' : '') + '" data-sec="' + esc + '">' + esc + '</button>';
  });
  html += '</div><p style="font-size:.74rem;color:#6b7280;margin:.5rem 0 0;line-height:1.45;">Applies to <strong>announcements</strong> only. Materials and assignments use the <a href="teacher-class.html?class=' + encodeURIComponent(activeClassId) + '" style="color:#059669;font-weight:700;">subject workspace</a>.</p>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.section-pill').forEach(btn => {
    btn.onclick = function() {
      activeStreamSection = btn.getAttribute('data-sec') || '__all__';
      try { sessionStorage.setItem('prism_teacher_stream_section_' + activeClassId, activeStreamSection); } catch (e) {}
      renderTeacherSectionPills();
      renderStream();
    };
  });
}

function renderStats() {
  const totalStudents = CLASSES.reduce((a,cls)=>a+(parseInt(cls.student_count,10)||getStudents(cls.id).length),0);
  document.getElementById('stat-classes').textContent    = CLASSES.length;
  document.getElementById('stat-students').textContent   = totalStudents;
  document.getElementById('stat-quizzes').textContent    = getQuizzes().filter(q=>q.teacherId===TEACHER_ID).length;
  const mats=getMaterials(); let mc=0; Object.values(mats).forEach(a=>mc+=a.length);
  document.getElementById('stat-materials').textContent  = mc;
  const asgns=getAssignments(); let ac=0; Object.values(asgns).forEach(a=>ac+=a.length);
  document.getElementById('stat-assignments').textContent= ac;
}

function renderAll() {
  const cls = CLASSES.find(c=>c.id===activeClassId);
  if (!cls) return;
  renderStream();
  const scopeEl = document.getElementById('teacher-class-scope-banner');
  if (scopeEl) {
    const subj = typeof prismTeacherClassLabel === 'function' ? prismTeacherClassLabel(cls) : (cls.subject || 'This class');
    const safe = String(subj).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    scopeEl.style.display = 'block';
    scopeEl.innerHTML = '<strong style="font-family:DM Sans,sans-serif;font-size:.92rem;">Announcements for: ' + safe + '</strong>'
      + '<span style="display:block;margin-top:.4rem;opacity:.95;font-weight:500;">Students in this class see these posts in their feed. Switch class above or use the sidebar to change subject.</span>';
  }
  loadStreamSectionForClass(activeClassId);
  renderTeacherSectionPills();
  const ow = document.getElementById('teacher-open-workspace');
  if (ow) {
    ow.style.display = 'inline-flex';
    ow.href = 'teacher-class.html?class=' + encodeURIComponent(activeClassId);
  }
}

/* ═══════════════════════════ CREATE / DELETE CLASS ═══════════════════════════ */
function openCreateClass() {
  document.getElementById('cc-subject').value='';
  document.getElementById('cc-code').value='';
  const cm = document.getElementById('cc-msg');
  cm.textContent='';
  cm.className='form-msg';
  document.getElementById('create-class-overlay').classList.add('active');
  setTimeout(()=>document.getElementById('cc-subject').focus(),100);
}
function closeCreateClass() { document.getElementById('create-class-overlay').classList.remove('active'); }

async function handleCreateClass() {
  const subject = document.getElementById('cc-subject').value.trim();
  const msgEl = document.getElementById('cc-msg');
  if (!subject) { msgEl.textContent='Subject name is required.'; msgEl.className='form-msg err'; return; }
  try {
    const colorIdx = CLASSES.length % CLASS_COLORS.length;
    const data = await PrismClasses.create(subject, CLASS_COLORS[colorIdx]);
    const code = (data.code || '').toUpperCase();
    // Sync join code to localStorage
    const idx = getCodeIndex();
    if (code) idx[code] = { classId:data.id, teacherId:TEACHER_ID, subject: data.subject || subject };
    saveCodeIndex(idx);
    CLASSES.push({
      id: data.id,
      subject: data.subject || subject,
      code: code,
      color: data.color || CLASS_COLORS[colorIdx],
      teacher_id: TEACHER_ID,
    });
    await refreshClassData(data.id);
    persistTeacherClassesLocal();
    activeClassId = data.id;
    document.getElementById('cc-code').value = code;
    msgEl.textContent = 'Class created. Share the join code above with students.';
    msgEl.className = 'form-msg ok';
    ensureTeacherClassPanel();
    buildClassSelect();
    renderAll();
    renderStats();
    if (typeof initSidebar === 'function') initSidebar('home');
    setTimeout(() => {
      closeCreateClass();
      msgEl.textContent = '';
      msgEl.className = 'form-msg';
    }, 2800);
  } catch(e) {
    msgEl.textContent = e.message || 'Failed to create class.';
    msgEl.className = 'form-msg err';
  }
}

async function deleteCurrentClass() {
  const cls = CLASSES.find(c=>c.id===activeClassId);
  if (!cls) return;
  if (!confirm(`Delete "${cls.subject}"? All posts, quizzes, and records for this class will be removed.`)) return;
  try {
    await PrismClasses.delete(activeClassId);
    // Clean up localStorage join code
    const idx = getCodeIndex();
    delete idx[cls.code];
    saveCodeIndex(idx);
    activeClassId = null;
    await loadClasses();
    renderStats();
  } catch(e) { alert(e.message || 'Failed to delete class.'); }
}

/* ═══════════════════════════ STREAM ═══════════════════════════ */
async function postStream() {
  const text = document.getElementById('stream-text').value.trim();
  if (!text) return;
  try {
    await PrismPosts.add({
      class_id: activeClassId, teacherId: TEACHER_ID,
      type: 'announcement',
      body: text,
      attachment: null,
      author: sessionStorage.getItem('prism_user_name')||'Teacher',
      target_section: getStreamTargetSectionForApi(),
    });
    document.getElementById('stream-text').value='';
    await refreshClassData(activeClassId);
    renderStream();
  } catch(e) { alert(e.message||'Failed to post.'); }
}

function resolveStreamMaterial(p) {
  if (p.type !== 'material') return null;
  const items = getMaterials()[activeClassId] || [];
  const tm = p.body && p.body.match(/New material: "([^"]+)"/);
  if (tm) {
    const found = items.find(it => it.title === tm[1]);
    if (found) return found;
  }
  const att = p.attachment || '';
  return items.find(it => it.url === att || it.file_name === att || (it.file_path && it.file_path === att)) || null;
}

function streamMaterialActionsHtml(p) {
  if (p.type !== 'material') return '';
  const att = (p.attachment || '').trim();
  const mat = resolveStreamMaterial(p);
  const btn = 'display:inline-flex;align-items:center;gap:.35rem;padding:.45rem .95rem;border-radius:10px;font-size:.82rem;font-weight:700;font-family:\'DM Sans\',sans-serif;text-decoration:none;cursor:pointer;border:none;';
  if (mat && mat.file_path) {
    return `<div style="margin-top:.75rem;"><a href="${mat.file_path}" download target="_blank" style="${btn}background:linear-gradient(135deg,#10b981,#059669);color:#fff;"> Download</a></div>`;
  }
  if (mat && mat.file_data) {
    return `<div style="margin-top:.75rem;"><button type="button" onclick="downloadMaterial('${mat.id}')" style="${btn}background:linear-gradient(135deg,#10b981,#059669);color:#fff;"> Download</button></div>`;
  }
  if (mat && mat.url && (mat.url.startsWith('http') || mat.url.startsWith('/'))) {
    const label = mat.type === 'file' ? ' Download' : ' Open';
    return `<div style="margin-top:.75rem;"><a href="${mat.url}" target="_blank" rel="noopener" download style="${btn}background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;">${label}</a></div>`;
  }
  if (att.startsWith('http') || att.startsWith('/')) {
    return `<div style="margin-top:.75rem;"><a href="${att}" target="_blank" rel="noopener" download style="${btn}background:linear-gradient(135deg,#10b981,#059669);color:#fff;"> Download</a></div>`;
  }
  return '';
}

function postsNewestFirst(arr) {
  return [...arr].sort((a, b) => {
    const ta = new Date(a.created_at || a.date || 0).getTime();
    const tb = new Date(b.created_at || b.date || 0).getTime();
    return tb - ta;
  });
}

function renderStream() {
  const posts = postsNewestFirst(getPosts().filter(p=>(p.class_id===activeClassId||p.classId===activeClassId) && itemMatchesStreamSectionFilter(p)));
  const feed  = document.getElementById('stream-feed');
  if (!feed) return;
  if (!posts.length) { feed.innerHTML='<div style="text-align:center;padding:2.5rem;color:#9ca3af;font-size:.95rem;">No posts yet. Be the first to post!</div>'; return; }
  feed.innerHTML='';
  posts.forEach(p=>{
    const dl=new Date(p.created_at||p.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const div=document.createElement('div'); div.className='stream-post';
    const qid = p.quiz_id || p.quizId || '';
    const quizRow = (p.type === 'quiz' && qid)
      ? `<div style="margin-top:.75rem;"><a href="quizmaker.html" style="display:inline-flex;align-items:center;gap:.35rem;padding:.45rem .95rem;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;border-radius:10px;font-size:.82rem;font-weight:700;font-family:'DM Sans',sans-serif;"> Open in Quiz Maker</a></div>`
      : '';
    const matRow = streamMaterialActionsHtml(p);
    const attachLine = (p.attachment && p.type !== 'announcement') ? `<div class="post-attach"> ${p.attachment}</div>` : '';
    div.innerHTML=`
      <div class="post-header">
        <div class="post-avatar">${(p.author||'T').charAt(0)}</div>
        <div class="post-meta"><div class="post-author">${p.author||'Teacher'}</div><div class="post-date">${dl}</div></div>
        <span class="post-badge ${p.type}">${p.type}</span>
        <button class="post-del" onclick="deletePost('${p.id}')">Remove</button>
      </div>
      <div class="post-body">${p.body}</div>
      ${attachLine}
      ${matRow}
      ${quizRow}`;
    feed.appendChild(div);
  });
}

async function deletePost(id) {
  try {
    await PrismPosts.delete(id);
    await refreshClassData(activeClassId);
    renderStream();
  } catch(e) { alert(e.message||'Failed to delete post.'); }
}

/** For legacy material posts with base64-only files (stream preview). */
function downloadMaterial(id) {
  const items = getMaterials()[activeClassId] || [];
  const it = items.find(x => x.id === id);
  if (!it || !it.file_data) return;
  const a = document.createElement('a');
  a.href = it.file_data;
  a.download = it.file_name || it.title;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ═══════════════════════════ RECORDS ═══════════════════════════ */
function renderSectionPills(){ /* moved to records.html */ }
function setSection(sec) { activeSection=sec; renderSectionPills(); renderRecords(); }

function calcGWA(rec) {
  const q=parseFloat(rec.quiz)||0,a=parseFloat(rec.activity)||0,m=parseFloat(rec.midterm)||0,f=parseFloat(rec.final)||0;
  if(!q&&!a&&!m&&!f) return null;
  return ((q*.2)+(a*.2)+(m*.3)+(f*.3)).toFixed(1);
}
function gradeInfo(gwa) {
  if(gwa===null) return{l:'—',c:'gF'};
  const s=parseFloat(gwa);
  if(s>=90)return{l:'A',c:'gA'};if(s>=80)return{l:'B',c:'gB'};
  if(s>=75)return{l:'C',c:'gC'};if(s>=60)return{l:'D',c:'gD'};
  return{l:'F',c:'gF'};
}

function getRecords()    { return JSON.parse(localStorage.getItem('prism_student_records')||'{}'); }
function saveRecords(r)  { localStorage.setItem('prism_student_records',JSON.stringify(r)); }

function renderRecords(){ /* moved to records.html */ }
function updateRec(key,field,val){const r=getRecords();if(!r[key])r[key]={};r[key][field]=val;saveRecords(r);renderRecords();}

function exportCSV() {
  const cls=CLASSES.find(c=>c.id===activeClassId), students=getStudents(activeClassId), r=getRecords();
  let csv='Name,ID,Section,Attendance,Quiz,Activity,Midterm,Final,GWA,Grade,Remarks\n';
  students.forEach(s=>{
    const rec=r[cls.id+':'+s.id]||{};
    const gwa=calcGWA(rec)||''; const{l}=gradeInfo(gwa?parseFloat(gwa):null);
    csv+=`"${s.name}","${s.id}","${s.section||''}","${rec.attendance||''}","${rec.quiz||''}","${rec.activity||''}","${rec.midterm||''}","${rec.final||''}","${gwa}","${l}","${rec.remarks||''}"\n`;
  });
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=(cls?cls.subject:'class').replace(/\s+/g,'-')+'-records.csv';
  a.click();
}

function openBulkModal(){document.getElementById('bulk-overlay').classList.add('active');}
function closeBulk(){document.getElementById('bulk-overlay').classList.remove('active');}
function saveBulk(){
  const comp=document.getElementById('bulk-comp').value, grade=document.getElementById('bulk-grade').value;
  if(!grade) return;
  const r=getRecords(), students=getStudents(activeClassId);
  students.forEach(s=>{const key=activeClassId+':'+s.id;if(!r[key])r[key]={};r[key][comp]=grade;});
  saveRecords(r); closeBulk(); renderRecords();
}
document.getElementById('bulk-overlay').addEventListener('click',function(e){if(e.target===this)closeBulk();});

/* ═══════════════════════════ QUIZ MAKER ═══════════════════════════ */
function addQuestion(pre) {
  const q=pre||{id:Date.now().toString(),type:'mc',question:'',points:5,options:[{text:'',correct:true},{text:'',correct:false},{text:'',correct:false},{text:'',correct:false}],tfAnswer:'true'};
  questions.push(q); renderQMQuestions();
}
function removeQuestion(id){questions=questions.filter(q=>q.id!==id);renderQMQuestions();}
function renderQMQuestions(){ /* moved to quizmaker.html */ }
function renderOpts(q){
  if(q.type==='mc')return`<div class="mc-opts">${q.options.map((o,i)=>`
    <div class="mc-opt-row">
      <input type="radio" class="mc-radio" name="cr-${q.id}" ${o.correct?'checked':''} onchange="setCorrect('${q.id}',${i})"/>
      <input class="mc-opt-inp" type="text" value="${esc(o.text)}" placeholder="Option ${['A','B','C','D'][i]||i+1}…" oninput="updateOpt('${q.id}',${i},this.value)"/>
      ${q.options.length>2?`<button class="mc-rm" onclick="removeOpt('${q.id}',${i})" title="Remove option" aria-label="Remove option">&times;</button>`:''}
    </div>`).join('')}
    ${q.options.length<6?`<button class="mc-add" onclick="addOpt('${q.id}')">＋ Add Option</button>`:''}
  </div>`;
  if(q.type==='tf')return`<div class="tf-row">
    <button class="tf-btn ${q.tfAnswer==='true'?'sel-true':''}" onclick="setTF('${q.id}','true')"> True</button>
    <button class="tf-btn ${q.tfAnswer==='false'?'sel-false':''}" onclick="setTF('${q.id}','false')"> False</button>
  </div>`;
  if(q.type==='sa')return`<div class="sa-ph">Students will type a short answer.</div>`;
  if(q.type==='essay')return`<div class="sa-ph" style="min-height:50px;">Students will write a long response.</div>`;
  return '';
}
function changeQType(id,type){const q=questions.find(x=>x.id===id);if(!q)return;q.type=type;if(type==='mc'&&(!q.options||!q.options.length))q.options=[{text:'',correct:true},{text:'',correct:false},{text:'',correct:false},{text:'',correct:false}];if(type==='tf')q.tfAnswer=q.tfAnswer||'true';document.getElementById('qo-'+id).innerHTML=renderOpts(q);}
function updateQ(id,f,v){const q=questions.find(x=>x.id===id);if(q)q[f]=f==='points'?parseInt(v)||1:v;}
function updateOpt(id,i,v){const q=questions.find(x=>x.id===id);if(q&&q.options[i])q.options[i].text=v;}
function setCorrect(id,i){const q=questions.find(x=>x.id===id);if(!q)return;q.options.forEach((o,j)=>o.correct=j===i);}
function addOpt(id){const q=questions.find(x=>x.id===id);if(!q||q.options.length>=6)return;q.options.push({text:'',correct:false});document.getElementById('qo-'+id).innerHTML=renderOpts(q);}
function removeOpt(id,i){const q=questions.find(x=>x.id===id);if(!q||q.options.length<=2)return;q.options.splice(i,1);if(!q.options.some(o=>o.correct))q.options[0].correct=true;document.getElementById('qo-'+id).innerHTML=renderOpts(q);}
function setTF(id,v){const q=questions.find(x=>x.id===id);if(!q)return;q.tfAnswer=v;document.getElementById('qo-'+id).innerHTML=renderOpts(q);}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function getQMData(){ return null; /* moved to quizmaker.html */ }
function publishQuiz(){ /* moved to quizmaker.html */ }
function saveDraft(){ /* moved to quizmaker.html */ }
function showQMsg(m,t){ console.log('QM:',m); }
function resetQM(){ questions=[]; }
function renderSavedQuizzes(){ /* moved to quizmaker.html */ }
async function deleteQuiz(id){if(!confirm('Delete this quiz?'))return;try{await PrismQuizzes.delete(id);}catch(e){alert(e.message||'Could not delete quiz.');return;}saveQuizzes(getQuizzes().filter(q=>q.id!==id));renderSavedQuizzes();renderStats();}
