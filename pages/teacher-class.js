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
/** Workspace (materials & assignments): __all__ = whole class; else section label */
let activeWorkspaceSection = '__all__';
/** __all__ = list every assignment; else one assignment id (teacher assignments tab) */
let teacherAssignmentViewFilter = '__all__';
/** __all__ = list every material; else one material id (teacher materials tab) */
let teacherMaterialViewFilter = '__all__';
let activeSub      = 'materials';
let activeSection  = 'all';
let questions      = [];

/* ═══════════════════════════ INIT ═══════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  const user = await prismAuthGuard(['teacher']);
  if (!user) return;
  TEACHER_ID = user.id;
  if (typeof initSidebar === 'function') initSidebar('home');
  document.querySelectorAll('.sidebar-link').forEach(function(a) { a.classList.remove('active'); });
  try {
    const cached = JSON.parse(localStorage.getItem('prism_classes_' + TEACHER_ID) || '[]');
    if (cached.length) CLASSES = cached;
  } catch (e) {}
  await initTeacherClassPage();
});

function paintTeacherClassShell(cls) {
  if (!cls) return;
  const titleEl = document.getElementById('tc-subject-title');
  if (titleEl) {
    titleEl.textContent = typeof prismTeacherClassLabel === 'function' ? prismTeacherClassLabel(cls) : (cls.subject || 'Subject');
  }
  ensureWorkspacePanel();
  loadWorkspaceSectionForClass(activeClassId);
  loadTeacherAssignmentViewFilter();
  loadTeacherMaterialViewFilter();
  renderWorkspacePage();
  bindMatDropZone();
  bindAsgnDropZone();
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
  await refreshClassData(activeClassId);
  renderWorkspacePage();
}

/** Re-injected if #class-content is cleared. */
const TEACHER_CLASS_CONTENT_HTML = `
      <div class="sub-tabs">
        <button type="button" class="sub-tab active" onclick="switchSub('materials',this)"> Materials</button>
        <button type="button" class="sub-tab" onclick="switchSub('assignments',this)"> Assignments</button>
      </div>
      <div class="sub-panel active" id="sub-materials">
        <div class="t-card">
          <div class="t-card-title"> Add Material</div>
          <div class="m-field"><label>Title</label><input type="text" id="mat-title" placeholder="e.g. Week 1 reading or lab video"/></div>
          <div class="m-field" id="mat-file-row">
            <label>Attach a file (optional)</label>
            <div style="border:2px dashed #d1fae5;border-radius:10px;padding:1.2rem;text-align:center;cursor:pointer;background:#f0fdf4;transition:border-color .2s;" id="mat-drop-zone" onclick="document.getElementById('mat-file-input').click()">
              <div id="mat-drop-label" style="font-size:.88rem;color:#9ca3af;"> Click to choose a file, or drag &amp; drop here<br/><span style="font-size:.75rem;">PDF, images, videos, PPT, Word, Excel — max 15 MB</span></div>
              <div id="mat-file-chosen" style="display:none;font-size:.85rem;font-weight:700;color:#10b981;margin-top:.3rem;"></div>
            </div>
            <input type="file" id="mat-file-input" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.mp4,.webm,.mov,.ogg,.ogv,.zip" style="display:none;" onchange="onMatFileChosen(this)"/>
          </div>
          <div class="m-field" id="mat-url-row">
            <label id="mat-url-label">Link (optional)</label>
            <input type="text" id="mat-url" placeholder="Paste a website or YouTube link…"/>
            <p class="src-hint" id="mat-url-hint" style="margin-top:.4rem;">Valid links become clickable hyperlinks for students. You can attach a file and a link together.</p>
          </div>
          <div class="m-field"><label>Notes (optional)</label><textarea id="mat-desc" rows="3" placeholder="Short note. URLs typed here also become links for students." style="width:100%;border:1.5px solid #d1fae5;border-radius:10px;padding:.6rem .85rem;font-size:.88rem;font-family:'DM Sans',sans-serif;color:#16132b;outline:none;background:#f0fdf4;resize:vertical;box-sizing:border-box;"></textarea></div>
          <button class="t-btn" onclick="addMaterial()" id="mat-upload-btn">Share with class</button>
          <div class="form-msg" id="mat-msg"></div>
        </div>
        <div id="teacher-mat-filter-wrap" style="display:none;align-items:center;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;padding:.65rem 1rem;background:#fff;border-radius:12px;border:1.5px solid #e4dffa;box-shadow:0 2px 10px rgba(124,58,237,.06);">
          <span style="font-size:.72rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;">View material</span>
          <select id="teacher-mat-filter-select" class="t-select" style="min-width:240px;max-width:100%;font-weight:600;"></select>
        </div>
        <div id="materials-list"></div>
      </div>
      <div class="sub-panel" id="sub-assignments">
        <div class="t-card">
          <div class="t-card-title"> Create Assignment</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.9rem;margin-bottom:.9rem;">
            <div class="m-field" style="margin:0;"><label>Title</label><input type="text" id="asgn-title" placeholder="e.g. Problem Set 1"/></div>
            <div class="m-field" style="margin:0;"><label>Due Date</label><input type="date" id="asgn-due"/></div>
          </div>
          <div class="m-field" style="margin-bottom:.9rem;"><label>Points</label><input type="number" id="asgn-pts" placeholder="e.g. 50" min="1"/></div>
          <div class="m-field" style="margin-bottom:.9rem;"><label>Type</label>
            <select id="asgn-type"><option value="written"> Written</option><option value="project"> Project</option><option value="lab"> Lab</option><option value="oral"> Oral</option></select>
          </div>
          <div class="m-field" style="margin-bottom:.9rem;">
            <label>Instructions for students</label>
            <p class="src-hint">What should students do? (e.g. “Answer all parts in complete sentences.”) This appears at the top of the assignment for students.</p>
            <textarea id="asgn-instructions" rows="6" placeholder="Example: Read chapter 3 and answer the questions below." style="width:100%;border:1.5px solid #d1fae5;border-radius:10px;padding:.6rem .85rem;font-size:.88rem;font-family:'DM Sans',sans-serif;color:#16132b;outline:none;background:#f0fdf4;resize:vertical;box-sizing:border-box;"></textarea>
          </div>
          <div class="m-field" style="margin-bottom:.9rem;">
            <label>Source for students (optional)</label>
            <p class="src-hint">Attach a PDF, image, video, or PowerPoint, and/or paste a link to a website or YouTube video. Students see this with the assignment.</p>
            <div class="src-chips">
              <span class="src-chip">PDF</span>
              <span class="src-chip">Image</span>
              <span class="src-chip">Video</span>
              <span class="src-chip">PPT</span>
              <span class="src-chip">Website link</span>
            </div>
            <div style="border:2px dashed #fbcfe8;border-radius:10px;padding:1.2rem;text-align:center;cursor:pointer;background:#fff5f9;transition:border-color .2s;" id="asgn-drop-zone" onclick="document.getElementById('asgn-file-input').click()">
              <div id="asgn-drop-label" style="font-size:.88rem;color:#9ca3af;"> Click to attach a source file, or drag &amp; drop here<br/><span style="font-size:.75rem;">PDF, images, videos, PPT — max 15 MB</span></div>
              <div id="asgn-file-chosen" style="display:none;font-size:.85rem;font-weight:700;color:#be185d;margin-top:.3rem;"></div>
            </div>
            <input type="file" id="asgn-file-input" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.mp4,.webm,.mov,.ogg,.ogv,.zip" style="display:none;" onchange="onAsgnFileChosen(this)"/>
            <label style="margin-top:.75rem;">Link to a website or video</label>
            <input type="text" id="asgn-url" placeholder="e.g. https://youtube.com/watch?v=… or https://…"/>
          </div>
          <button class="t-btn" onclick="addAssignment()">Create Assignment</button>
        </div>
        <div id="teacher-asgn-filter-wrap" style="display:none;align-items:center;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;padding:.65rem 1rem;background:#fff;border-radius:12px;border:1.5px solid #fce7f3;box-shadow:0 2px 10px rgba(236,72,153,.06);">
          <span style="font-size:.72rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;">View assignment</span>
          <select id="teacher-asgn-filter-select" class="t-select" style="min-width:240px;max-width:100%;font-weight:600;"></select>
        </div>
        <div id="assignments-list"></div>
      </div>`;

function ensureWorkspacePanel() {
  if (document.getElementById('materials-list')) return;
  const wrap = document.getElementById('class-content');
  if (!wrap) return;
  wrap.innerHTML = TEACHER_CLASS_CONTENT_HTML;
  activeSub = 'materials';
  wrap.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
  wrap.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  const subMat = document.getElementById('sub-materials');
  if (subMat) subMat.classList.add('active');
  const firstTab = wrap.querySelector('.sub-tabs .sub-tab');
  if (firstTab) firstTab.classList.add('active');
  bindMatDropZone();
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
  wrap.style.display = 'block';
  let html = '<div style="font-size:.72rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.45rem;">Materials &amp; assignments — filter by section</div>'
    + '<div class="section-pills">';
  html += '<button type="button" class="section-pill' + (activeWorkspaceSection === '__all__' ? ' active' : '') + '" data-sec="__all__">All Sections</button>';
  sections.forEach(sec => {
    const esc = String(sec).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    html += '<button type="button" class="section-pill' + (activeWorkspaceSection === sec ? ' active' : '') + '" data-sec="' + esc + '">' + esc + '</button>';
  });
  html += '</div><p style="font-size:.74rem;color:#6b7280;margin:.5rem 0 0;line-height:1.45;">New uploads and assignments use the section you pick here. Announcements use a separate filter on the <a href="teacher.html" style="color:#059669;font-weight:700;">announcements</a> page.</p>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.section-pill').forEach(btn => {
    btn.onclick = function() {
      activeWorkspaceSection = btn.getAttribute('data-sec') || '__all__';
      try { sessionStorage.setItem('prism_teacher_workspace_section_' + activeClassId, activeWorkspaceSection); } catch (e) {}
      renderWorkspaceSectionPills();
      renderMaterials(); renderAssignments();
    };
  });
}

function renderWorkspacePage() {
  const cls = CLASSES.find(c=>c.id===activeClassId);
  if (!cls) return;
  renderMaterials();
  renderAssignments();
  const stEl = document.getElementById('tc-class-stats');
  if (stEl) {
    const nStud = getStudents(activeClassId).length;
    const mats = getMaterials()[activeClassId] || [];
    const asgn = getAssignments()[activeClassId] || [];
    stEl.textContent = nStud + ' student' + (nStud === 1 ? '' : 's') + ' · ' + mats.length + ' material' + (mats.length === 1 ? '' : 's') + ' · ' + asgn.length + ' assignment' + (asgn.length === 1 ? '' : 's');
  }
  const scopeEl = document.getElementById('teacher-class-scope-banner');
  if (scopeEl) {
    const subj = typeof prismTeacherClassLabel === 'function' ? prismTeacherClassLabel(cls) : (cls.subject || 'This class');
    const safe = String(subj).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    scopeEl.style.display = 'block';
    scopeEl.innerHTML = '<strong style="font-family:DM Sans,sans-serif;font-size:.92rem;">Workspace: ' + safe + '</strong>'
      + '<span style="display:block;margin-top:.4rem;opacity:.95;font-weight:500;">Materials and assignments for this subject. <a href="teacher.html" style="color:#059669;font-weight:700;">Post announcements</a> from the main teacher page.</span>';
  }
  loadWorkspaceSectionForClass(activeClassId);
  renderWorkspaceSectionPills();
  const jcEl = document.getElementById('join-code-display');
  if (jcEl) {
    const jc = (cls.code || '').replace(/'/g, "\\'");
    jcEl.innerHTML = `
      <span style="font-size:.78rem;color:#9ca3af;margin-right:.5rem;">Join Code:</span>
      <span style="font-family:'DM Sans',sans-serif;font-size:1.1rem;font-weight:800;color:#10b981;letter-spacing:.1em;">${cls.code || '—'}</span>
      <button type="button" onclick="copyJoinCode('${jc}', this)" style="margin-left:.6rem;background:none;border:1.5px solid #d1fae5;border-radius:7px;padding:2px 9px;font-size:.75rem;font-weight:700;color:#065f46;cursor:pointer;">Copy</button>
      <button onclick="regenJoinCode('${cls.id}')" style="margin-left:.3rem;background:none;border:1.5px solid #fde68a;border-radius:7px;padding:2px 9px;font-size:.75rem;font-weight:700;color:#92400e;cursor:pointer;">New Code</button>
    `;
  }
}

function switchSub(name, btn) {
  activeSub = name;
  document.querySelectorAll('.sub-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sub-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('sub-'+name).classList.add('active');
  btn.classList.add('active');
}

function copyJoinCode(code, btn) {
  const el = btn || (typeof event !== 'undefined' ? event.target : null);
  navigator.clipboard.writeText(code).then(()=>{
    if (!el) return;
    const orig = el.textContent;
    el.textContent='Copied!'; el.style.color='#10b981';
    setTimeout(()=>{el.textContent=orig;el.style.color='';},1800);
  });
}

async function regenJoinCode(classId) {
  if (!confirm('Generate a new join code? The old code will stop working.')) return;
  const cls = CLASSES.find(c=>c.id===classId);
  if (!cls) return;
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
    return;
  }
  const idx = getCodeIndex();
  delete idx[oldCode];
  idx[cls.code] = { classId, teacherId:TEACHER_ID, subject:cls.subject };
  saveCodeIndex(idx);
  persistTeacherClassesLocal();
  renderWorkspacePage();
}

/* ═══════════════════════════ RECORDS (stubs) ═══════════════════════════ */
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
      ${q.options.length>2?`<button class="mc-rm" onclick="removeOpt('${q.id}',${i})"></button>`:''}
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
async function deleteQuiz(id){if(!confirm('Delete this quiz?'))return;try{await PrismQuizzes.delete(id);}catch(e){alert(e.message||'Could not delete quiz.');return;}saveQuizzes(getQuizzes().filter(q=>q.id!==id));renderSavedQuizzes();}

/* ═══════════════════════════ MATERIALS ═══════════════════════════ */
var _matFile = null;
var _asgnFile = null;
var PRISM_MAT_ACCEPT = {
  file: '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.mp4,.webm,.mov,.ogg,.ogv,.zip',
  image: '.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp',
  'video-file': '.mp4,.webm,.mov,.ogg,.ogv',
};

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

function onMatTypeChange() { /* type picker removed — file + link are always available */ }

function onMatFileChosen(input) {
  const file = input.files[0];
  if (!file) return;
  const err = prismTeacherCheckFile(file);
  if (err) { alert(err); input.value = ''; _matFile = null; return; }
  _matFile = file;
  const dropLabel = document.getElementById('mat-drop-label');
  if (dropLabel) dropLabel.style.display = 'none';
  const chosen = document.getElementById('mat-file-chosen');
  if (chosen) {
    chosen.style.display = 'block';
    chosen.textContent = ' ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
  }
  const titleEl = document.getElementById('mat-title');
  if (titleEl && !titleEl.value.trim()) titleEl.value = file.name.replace(/\.[^.]+$/, '');
}

function bindDropZone(zoneId, inputId, onChosen, hoverColor, restColor) {
  const zone = document.getElementById(zoneId);
  if (!zone || zone.dataset.bound === '1') return;
  zone.dataset.bound = '1';
  zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.style.borderColor = hoverColor; });
  zone.addEventListener('dragleave', function(){ zone.style.borderColor = restColor; });
  zone.addEventListener('drop', function(e){
    e.preventDefault(); zone.style.borderColor = restColor;
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
  const dropLabel = document.getElementById('asgn-drop-label');
  if (dropLabel) dropLabel.style.display = 'none';
  const chosen = document.getElementById('asgn-file-chosen');
  if (chosen) {
    chosen.style.display = 'block';
    chosen.textContent = ' ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
  }
}

function showMatMsg(msg,type){ const el=document.getElementById('mat-msg'); if(!el) return; el.textContent=msg; el.className='form-msg '+type; setTimeout(()=>el.textContent='',3000); }

function teacherEsc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function addMaterial(){
  const title = document.getElementById('mat-title').value.trim();
  if (!title) { showMatMsg('Please enter a title.','err'); return; }
  const descEl = document.getElementById('mat-desc');
  const desc = descEl ? descEl.value.trim() : '';
  let url = document.getElementById('mat-url') ? document.getElementById('mat-url').value.trim() : '';
  if (url) {
    const normalized = typeof prismNormalizeHttpUrl === 'function' ? prismNormalizeHttpUrl(url) : url;
    if (!normalized) { showMatMsg('That link does not look valid. Use http:// or https://','err'); return; }
    url = normalized;
  } else if (typeof prismExtractFirstUrl === 'function') {
    url = prismExtractFirstUrl(desc) || '';
  }
  if (!_matFile && !url && !desc) {
    showMatMsg('Attach a file, paste a link, or add a short note.','err');
    return;
  }
  const type = _matFile ? 'file' : (url && typeof prismVideoEmbedFromUrl === 'function' && prismVideoEmbedFromUrl(url) ? 'video' : 'link');
  const btn=document.getElementById('mat-upload-btn');
  btn.disabled=true; btn.textContent='Saving…';
  try {
    const matRes = await PrismMaterials.add({
      class_id:activeClassId, title, type, url,
      file: _matFile || null,
      desc: desc,
      target_section: getWorkspaceTargetSectionForApi(),
    });
    const streamAttach = (matRes && matRes.file_path) ? matRes.file_path : url;
    await PrismPosts.add({
      class_id:activeClassId, teacherId:TEACHER_ID, type:'material',
      body:'New material: "'+title+'"', attachment: streamAttach,
      author:sessionStorage.getItem('prism_user_name')||'Teacher',
      target_section: getWorkspaceTargetSectionForApi(),
    });
    document.getElementById('mat-title').value='';
    if (descEl) descEl.value='';
    if(document.getElementById('mat-url')) document.getElementById('mat-url').value='';
    const fileInp = document.getElementById('mat-file-input');
    if (fileInp) fileInp.value='';
    _matFile=null;
    const chosen = document.getElementById('mat-file-chosen');
    const dropLabel = document.getElementById('mat-drop-label');
    if (chosen) chosen.style.display='none';
    if (dropLabel) dropLabel.style.display='block';
    await refreshClassData(activeClassId);
    renderMaterials(); renderWorkspacePage();
    showMatMsg(' Shared with the class.','ok');
  } catch(e) { showMatMsg(e.message||'Upload failed.','err'); }
  finally { btn.disabled=false; btn.textContent='Share with class'; }
}

function renderMaterials(){
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
    let actionBtn='';
    const btnBase = 'border:none;padding:.38rem .9rem;border-radius:8px;font-size:.78rem;font-weight:700;white-space:nowrap;cursor:pointer;text-decoration:none;display:inline-block;margin-left:.35rem;';
    if (it.file_path) {
      const prevT = typeof prismCanPreviewInBrowser === 'function' && prismCanPreviewInBrowser(it.mime_type, it.file_name);
      actionBtn += '<button type="button" onclick=\'prismOpenMaterialUrl('+JSON.stringify(it.file_path)+','+JSON.stringify(it.mime_type||'')+','+JSON.stringify(it.file_name||'')+')\' style="'+btnBase+'background:#10b981;color:white;margin-left:0;">'+(prevT?' View':' Open')+'</button>'
        + '<a href="'+teacherEsc(it.file_path)+'" download="'+teacherEsc(it.file_name||'file')+'" style="'+btnBase+'background:#ecfdf5;color:#065f46;"> Save</a>';
    } else if (it.file_data) {
      actionBtn += '<button type="button" onclick="downloadMaterial(\''+it.id+'\')" style="'+btnBase+'background:#10b981;color:white;margin-left:0;"> Download</button>';
    }
    const httpUrl = typeof prismMaterialHttpUrl === 'function' ? prismMaterialHttpUrl(it) : '';
    if (httpUrl) {
      actionBtn += '<a href="'+teacherEsc(httpUrl)+'" target="_blank" rel="noopener" style="'+btnBase+'background:#6366f1;color:white;"> Link</a>';
    }
    let iconHtml;
    if (kind === 'image' && it.file_path) {
      iconHtml = '<img class="mat-thumb" src="'+teacherEsc(it.file_path)+'" alt=""/>';
    } else {
      iconHtml = '<div class="mat-icon" style="'+(bgColor[kind]||bgColor[it.type]||'')+'">'+icon+'</div>';
    }
    const metaBits = [kindLabel];
    if (it.file_name) metaBits.push(it.file_name);
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
  const urlRaw = (document.getElementById('asgn-url') && document.getElementById('asgn-url').value || '').trim();
  let attachUrl = '';
  if (urlRaw) {
    attachUrl = typeof prismNormalizeHttpUrl === 'function' ? prismNormalizeHttpUrl(urlRaw) : urlRaw;
    if (!attachUrl) { alert('Please enter a valid website or video link, or leave the link field empty.'); return; }
  }
  try {
    const asgnRes = await PrismAssignments.add({
      class_id:activeClassId, title,
      due: due||null,
      due_time: null,
      pts:document.getElementById('asgn-pts').value,
      type:document.getElementById('asgn-type').value,
      instructions:document.getElementById('asgn-instructions').value.trim(),
      target_section: getWorkspaceTargetSectionForApi(),
      attach_url: attachUrl || '',
      file: _asgnFile || null,
    });
    const dueLine = due && typeof prismFormatAssignmentDue === 'function' ? prismFormatAssignmentDue(due) : due;
    const streamAttach = (asgnRes && asgnRes.attach_file_path) ? asgnRes.attach_file_path : (attachUrl || null);
    await PrismPosts.add({
      class_id:activeClassId, teacherId:TEACHER_ID, type:'assignment',
      body:'New assignment: "'+title+'"'+(due?' · Due '+dueLine:''),
      attachment: streamAttach,
      author:sessionStorage.getItem('prism_user_name')||'Teacher',
      target_section: getWorkspaceTargetSectionForApi(),
    });
    ['asgn-title','asgn-pts','asgn-instructions','asgn-due','asgn-url'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    const fileInp = document.getElementById('asgn-file-input');
    if (fileInp) fileInp.value = '';
    _asgnFile = null;
    const chosen = document.getElementById('asgn-file-chosen');
    const dropLabel = document.getElementById('asgn-drop-label');
    if (chosen) chosen.style.display = 'none';
    if (dropLabel) dropLabel.style.display = 'block';
    await refreshClassData(activeClassId);
    renderAssignments(); renderWorkspacePage();
  } catch(e){ alert(e.message||'Failed to create assignment.'); }
}

function renderAssignments(){
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
    const overdue = dStr && typeof prismIsPastDue === 'function' ? prismIsPastDue(dStr, null) : false;
    const dueDisp = dStr && typeof prismFormatAssignmentDue === 'function' ? prismFormatAssignmentDue(dStr) : dStr;
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
      +'<a href="grading.html" style="font-size:.72rem;color:#7c3aed;font-weight:700;white-space:nowrap;text-decoration:none;" title="View submissions and enter scores"> Grading →</a>'
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
