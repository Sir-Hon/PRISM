/** Page script for profile.html — keep HTML in the .html file. */
// 
// DATA mirrors what's in quizzes.html
// 
function getAllQuizzes() {
  var studentId = sessionStorage.getItem('prism_user_id') || 'student';
  var joined    = JSON.parse(localStorage.getItem('prism_joined_' + studentId) || '{}');
  var classIds  = Object.keys(joined);
  var all       = JSON.parse(localStorage.getItem('prism_teacher_quizzes') || '[]');
  // Return only published quizzes for classes this student has joined
  return all.filter(function(q) { return q.published && classIds.indexOf(q.classId) !== -1; })
            .map(function(q) {
              return {
                id: q.id,
                subject: q.subjectName || q.classId,
                subjectColor: q.subjectColor || '#7c3aed',
                title: q.title,
                due: q.due || '',
                status: 'pending',
                points: q.totalPoints || 0,
                total: q.questions ? q.questions.length : 0
              };
            });
}
var ALL_QUIZZES = getAllQuizzes();

function getClasswork() {
  var uid  = sessionStorage.getItem('prism_user_id') || 'student';
  var role = sessionStorage.getItem('prism_role') || 'student';
  if (role !== 'student') return [];
  var joined   = JSON.parse(localStorage.getItem('prism_joined_' + uid) || '{}');
  var classIds = Object.keys(joined);
  var allAsgns = JSON.parse(localStorage.getItem('prism_teacher_assignments') || '{}');
  var today    = new Date().toISOString().split('T')[0];
  var result   = [];
  classIds.forEach(function(cid) {
    var entry = joined[cid];
    (allAsgns[cid] || []).forEach(function(a) {
      result.push({
        subject: entry.subject, subjectColor: '#7c3aed',
        title: a.title, due: a.due || '',
        status: a.due && a.due < today ? 'overdue' : 'pending',
        type: a.type || 'assignment'
      });
    });
  });
  return result;
}
var ALL_CLASSWORK = getClasswork();

function getSubjectList() {
  var uid = sessionStorage.getItem('prism_user_id') || 'student';
  var role = sessionStorage.getItem('prism_role') || 'student';
  if (role !== 'student') return [];
  var joined = JSON.parse(localStorage.getItem('prism_joined_' + uid) || '{}');
  return Object.values(joined).map(function(e, i) {
    var col = e.color;
    if (!col) {
      var info = JSON.parse(localStorage.getItem('prism_classes_' + e.teacherId) || '[]')
                   .find(function(cl){ return cl.id === e.classId; });
      col = info ? info.color : '#7c3aed';
    }
    var asgns = (JSON.parse(localStorage.getItem('prism_teacher_assignments') || '{}')[e.classId] || []).length;
    return { id: e.classId, subject: e.subject, color: col || '#7c3aed', tasks: asgns||1, done: 0 };
  });
}
var SUBJECT_LIST = getSubjectList();

// 
// PROFILE DATA (localStorage)
// 
function getProfileKey() {
  var uid = sessionStorage.getItem('prism_user_id') || 'guest';
  return 'prism_profile_' + uid;
}
function loadProfile() {
  // Still use localStorage as a local cache for fast rendering
  return JSON.parse(localStorage.getItem(getProfileKey()) || '{}');
}
function saveProfileData(data) {
  localStorage.setItem(getProfileKey(), JSON.stringify(data));
}

// 
// INIT
// 
function paintProfilePage(profile) {
 if (profile.avatar) {
   const img = document.getElementById('avatar-img');
   if (img) { img.src = profile.avatar; img.style.display = 'block'; }
   const initial = document.getElementById('avatar-initial');
   if (initial) initial.style.display = 'none';
 }
 renderHero(profile);
 renderInfoCard(profile);
 SUBJECT_LIST = getSubjectList();
 ALL_CLASSWORK = getClasswork();
 ALL_QUIZZES = getAllQuizzes();
 renderSubjectProgress();
 renderQuizStatus();
 renderAssignments();
 renderActivity(profile);
 renderQuickStats();
 scheduleTeacherDesk();
}

async function syncProfileClasses(user) {
 const userId = user.id;
 const role = user.role;
 window.__prismProfileTeacherSubjects = undefined;
 window.__prismProfileTeacherStudents = undefined;
 window.__prismProfileAdminT = undefined;
 window.__prismProfileAdminS = undefined;
 if (role === 'student') {
   const mine = await PrismClasses.getMyClasses();
   const joined = {};
   mine.forEach(function (c) {
     joined[c.id] = {
       classId: c.id,
       teacherId: c.teacher_id,
       subject: c.subject,
       color: c.color,
       joinedAt: c.joined_at || new Date().toISOString()
     };
   });
   localStorage.setItem('prism_joined_' + userId, JSON.stringify(joined));
 } else if (role === 'teacher') {
   const mine = await PrismClasses.getMyClasses();
   let totalStu = 0;
   mine.forEach(function (c) {
     totalStu += parseInt(c.student_count, 10) || 0;
   });
   window.__prismProfileTeacherSubjects = mine.length;
   window.__prismProfileTeacherStudents = totalStu;
   localStorage.setItem('prism_classes_' + userId, JSON.stringify(mine.map(function (c) {
     return { id: c.id, subject: c.subject, color: c.color || '#7c3aed', code: c.code, teacher_id: c.teacher_id, student_count: parseInt(c.student_count, 10) || 0 };
   })));
 } else if (role === 'admin') {
   const allU = await PrismAdmin.getAllUsers();
   window.__prismProfileAdminT = allU.filter(function (x) { return x.role === 'teacher'; }).length;
   window.__prismProfileAdminS = allU.filter(function (x) { return x.role === 'student'; }).length;
 }
}

window.addEventListener('DOMContentLoaded', async () => {
 const cachedId = sessionStorage.getItem('prism_user_id') || '';
 if (cachedId) {
   initSidebar('home');
   const savedEarly = loadProfile();
   if (savedEarly && (savedEarly.name || savedEarly.avatar)) {
     paintProfilePage({
       name:    savedEarly.name    || sessionStorage.getItem('prism_user_name') || cachedId,
       id:      cachedId,
       role:    sessionStorage.getItem('prism_role') || 'student',
       section: savedEarly.section || sessionStorage.getItem('prism_section') || '',
       email:   savedEarly.email   || '',
       bio:     savedEarly.bio     || '',
       since:   savedEarly.since   || '',
       avatar:  savedEarly.avatar  || null,
     });
   }
 }

 const user = await prismAuthGuard();
 if (!user) return;
 initSidebar('home');

 const userId = user.id;
 const role   = user.role;
 let apiProfile = {};
 try {
   const pair = await Promise.all([
     PrismProfile.get().catch(function () { return {}; }),
     syncProfileClasses(user).catch(function (e) { console.warn('profile class sync:', e); }),
   ]);
   apiProfile = pair[0] || {};
 } catch (e) { console.warn('profile load:', e); }

 const saved = loadProfile();
 const profile = {
   name:    apiProfile.name    || saved.name    || user.name    || userId,
   id:      userId,
   role:    role,
   section: apiProfile.section || saved.section || user.section || sessionStorage.getItem('prism_section') || '',
   email:   apiProfile.email   || saved.email   || '',
   bio:     apiProfile.bio     || saved.bio     || '',
   since:   apiProfile.member_since ? new Date(apiProfile.member_since).toLocaleDateString('en-US',{year:'numeric',month:'long'}) : (saved.since || new Date().toLocaleDateString('en-US',{year:'numeric',month:'long'})),
   avatar:  apiProfile.avatar  || saved.avatar  || null,
 };

 saveProfileData(profile);
 sessionStorage.setItem('prism_user_name', profile.name);
 sessionStorage.setItem('prism_section', profile.section);
 paintProfilePage(profile);
 if (typeof initSidebar === 'function') initSidebar('home');
});

// 
// HERO
// 
function renderHero(profile) {
 const initial = profile.name.charAt(0).toUpperCase();
 document.getElementById('avatar-initial').textContent = initial;
 document.getElementById('display-name').textContent = profile.name;
 document.getElementById('display-id').textContent = ' ' + profile.id;
 document.getElementById('display-role').textContent = profile.role;
 document.getElementById('display-section').textContent= profile.section;

 if (profile.bio) {
 document.getElementById('display-bio').textContent = profile.bio;
 }

 // Standing based on role
  var standingEl = document.getElementById('display-standing');
  var roleForStanding = sessionStorage.getItem('prism_role') || 'student';
  if (roleForStanding === 'teacher') {
    standingEl.textContent = 'Educator';
    standingEl.style.background = 'rgba(16,185,129,.25)';
    standingEl.style.color = '#6ee7b7';
  } else if (roleForStanding === 'admin') {
    standingEl.textContent = 'Administrator';
    standingEl.style.background = 'rgba(245,158,11,.25)';
    standingEl.style.color = '#fcd34d';
  } else {
    var overdueCount = ALL_CLASSWORK.filter(function(cc){ return cc.status === 'overdue'; }).length;
    if (overdueCount === 0) { standingEl.textContent = 'Good Standing'; standingEl.style.background = 'rgba(16,185,129,.25)'; standingEl.style.color = '#6ee7b7'; }
    else if (overdueCount <= 2) { standingEl.textContent = 'At Risk'; standingEl.style.background = 'rgba(245,158,11,.25)'; standingEl.style.color = '#fcd34d'; }
    else { standingEl.textContent = 'Needs Attention'; standingEl.style.background = 'rgba(239,68,68,.25)'; standingEl.style.color = '#fca5a5'; }
  }

 // Hero stats
 const scores = JSON.parse(localStorage.getItem('prism_quiz_scores_' + (sessionStorage.getItem('prism_user_id')||'student')) || '{}');
 const completed = Object.keys(scores).length;
 const pending = ALL_CLASSWORK.filter(c => c.status === 'pending').length;
 const overdue = ALL_CLASSWORK.filter(c => c.status === 'overdue').length;
 const classes = SUBJECT_LIST.length;

   var role2 = sessionStorage.getItem('prism_role') || 'student';
  var uid2  = sessionStorage.getItem('prism_user_id') || '';
  var heroEl = document.getElementById('hero-stats');
  if (role2 === 'teacher') {
    var tClasses  = JSON.parse(localStorage.getItem('prism_classes_'+uid2)||'[]');
    var tStudents = (typeof window.__prismProfileTeacherStudents === 'number')
      ? window.__prismProfileTeacherStudents
      : tClasses.reduce(function(a,cl){ return a+(JSON.parse(localStorage.getItem('prism_students_'+cl.id)||'[]')).length; },0);
    var tClassCount = (typeof window.__prismProfileTeacherSubjects === 'number')
      ? window.__prismProfileTeacherSubjects : tClasses.length;
    var tQuizzes  = JSON.parse(localStorage.getItem('prism_teacher_quizzes')||'[]').filter(function(q){ return q.teacherId===uid2; }).length;
    var tPosts    = JSON.parse(localStorage.getItem('prism_teacher_posts')||'[]').filter(function(p){ return p.teacherId===uid2; }).length;
    heroEl.innerHTML =
      '<div class="hero-stat"><div class="hs-val">'+tClassCount+'</div><div class="hs-lbl">Subjects</div></div>'+
      '<div class="hero-stat"><div class="hs-val">'+tStudents+'</div><div class="hs-lbl">Students</div></div>'+
      '<div class="hero-stat"><div class="hs-val">'+tQuizzes+'</div><div class="hs-lbl">Quizzes</div></div>'+
      '<div class="hero-stat"><div class="hs-val">'+tPosts+'</div><div class="hs-lbl">Posts</div></div>';
  } else if (role2 === 'admin') {
    var allAcc = JSON.parse(localStorage.getItem('prism_accounts')||'[]');
    var adT = (typeof window.__prismProfileAdminT === 'number') ? window.__prismProfileAdminT : allAcc.filter(function(a){return a.role==='teacher';}).length;
    var adS = (typeof window.__prismProfileAdminS === 'number') ? window.__prismProfileAdminS : allAcc.filter(function(a){return a.role==='student';}).length;
    heroEl.innerHTML =
      '<div class="hero-stat"><div class="hs-val">'+adT+'</div><div class="hs-lbl">Teachers</div></div>'+
      '<div class="hero-stat"><div class="hs-val">'+adS+'</div><div class="hs-lbl">Students</div></div>';
  } else {
    heroEl.innerHTML =
      '<div class="hero-stat"><div class="hs-val">'+classes+'</div><div class="hs-lbl">Subjects</div></div>'+
      '<div class="hero-stat"><div class="hs-val">'+completed+'</div><div class="hs-lbl">Quizzes Done</div></div>'+
      '<div class="hero-stat"><div class="hs-val">'+pending+'</div><div class="hs-lbl">Pending Tasks</div></div>'+
      '<div class="hero-stat"><div class="hs-val"'+(overdue?' style="color:#fca5a5"':'')+'>'+overdue+'</div><div class="hs-lbl">Overdue</div></div>';
  }
}

// 
// INFO CARD
// 
function renderInfoCard(profile) {
 document.getElementById('info-name').textContent = profile.name;
 document.getElementById('info-id').textContent = profile.id;
 document.getElementById('info-role').textContent = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
 document.getElementById('info-section').textContent = profile.section;
 document.getElementById('info-since').textContent = profile.since;
}

// 
// TEACHER DESK
// 
var teacherDeskGen = 0;

function profileEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function deskColor(c) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? String(c) : '#7c3aed';
}
function teacherClassList() {
  var uid = sessionStorage.getItem('prism_user_id') || '';
  try { return JSON.parse(localStorage.getItem('prism_classes_' + uid) || '[]'); } catch (e) { return []; }
}
function deskQuestions(q) {
  var raw = q && q.questions;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '[]'); } catch (e) { raw = []; }
  }
  return Array.isArray(raw) ? raw : [];
}
function deskPublished(q) {
  return q && (q.published === 1 || q.published === '1' || q.published === true);
}
function deskNeedsReview(q) {
  return deskQuestions(q).some(function (item) {
    var type = item && item.type;
    return type === 'sa' || type === 'essay';
  });
}
function deskReviewed(row) {
  var raw = row && row.item_scores;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'string' && raw) {
    try { var parsed = JSON.parse(raw); return Array.isArray(parsed) && parsed.length > 0; } catch (e) { return false; }
  }
  return false;
}
function deskDayOffset(iso) {
  var day = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var when = new Date(day + 'T00:00:00');
  if (isNaN(when.getTime())) return null;
  return Math.round((when.getTime() - today.getTime()) / 86400000);
}
function deskWhen(offset) {
  if (offset < 0) return offset === -1 ? 'Due yesterday' : 'Overdue';
  if (offset === 0) return 'Due today';
  if (offset === 1) return 'Due tomorrow';
  return 'Due in ' + offset + ' days';
}
function deskEmpty(message) {
  return '<div class="p-empty"><div>' + profileEsc(message) + '</div></div>';
}
function setCardChrome(bodyId, title, href, linkText) {
  var body = document.getElementById(bodyId);
  if (!body) return;
  var card = body.closest('.p-card');
  if (!card) return;
  var titleEl = card.querySelector('.p-card-title');
  if (titleEl) titleEl.textContent = title;
  var header = card.querySelector('.p-card-header');
  var link = card.querySelector('.view-all-link');
  if (!href) {
    if (link) link.style.display = 'none';
    return;
  }
  if (!link && header) {
    link = document.createElement('a');
    link.className = 'view-all-link';
    header.appendChild(link);
  }
  if (link) {
    link.style.display = '';
    link.href = href;
    link.textContent = linkText;
  }
}
function deskLine(href, color, title, sub) {
  return '<a class="desk-line" href="' + profileEsc(href) + '">'
    + '<div class="desk-dot" style="background:' + deskColor(color) + '"></div>'
    + '<div style="flex:1;min-width:0;"><b>' + profileEsc(title) + '</b><span>' + profileEsc(sub) + '</span></div></a>';
}
function scheduleTeacherDesk() {
  if ((sessionStorage.getItem('prism_role') || '') !== 'teacher') return;
  var gen = ++teacherDeskGen;
  loadTeacherDesk(gen);
}
async function loadTeacherDesk(gen) {
  window.__prismTeacherDesk = { status: 'loading', classes: teacherClassList(), waiting: 0, reviewed: 0, reviews: [], reminders: [], activity: [], drafts: 0 };
  try {
    var classes = teacherClassList();
    var packs = await Promise.all(classes.map(function (c) {
      return Promise.all([
        (typeof PrismQuizzes !== 'undefined' ? PrismQuizzes.get(c.id) : Promise.resolve([])).catch(function () { return []; }),
        (typeof PrismAssignments !== 'undefined' ? PrismAssignments.get(c.id) : Promise.resolve([])).catch(function () { return []; }),
        (typeof PrismPosts !== 'undefined' ? PrismPosts.get(c.id) : Promise.resolve([])).catch(function () { return []; })
      ]).then(function (parts) {
        return { cls: c, quizzes: parts[0] || [], assignments: parts[1] || [], posts: parts[2] || [] };
      });
    }));
    if (gen !== teacherDeskGen) return;
    var quizzes = [];
    var assignments = [];
    var posts = [];
    packs.forEach(function (pack) {
      (pack.quizzes || []).forEach(function (q) {
        q._subject = pack.cls.subject;
        q._color = pack.cls.color;
        q._classId = pack.cls.id;
        quizzes.push(q);
      });
      (pack.assignments || []).forEach(function (a) {
        a._subject = pack.cls.subject;
        a._color = pack.cls.color;
        a._classId = pack.cls.id;
        assignments.push(a);
      });
      (pack.posts || []).forEach(function (p) {
        p._subject = pack.cls.subject;
        p._color = pack.cls.color;
        p._classId = pack.cls.id;
        posts.push(p);
      });
    });
    var reviewable = quizzes.filter(function (q) { return deskPublished(q) && deskNeedsReview(q); }).slice(0, 40);
    var scorePacks = await Promise.all(reviewable.map(function (q) {
      return PrismQuizzes.getScores(q.id).then(function (rows) {
        return { quiz: q, rows: Array.isArray(rows) ? rows : [] };
      }).catch(function () { return { quiz: q, rows: [] }; });
    }));
    if (gen !== teacherDeskGen) return;
    var waiting = 0;
    var reviewed = 0;
    var reviews = [];
    scorePacks.forEach(function (pack) {
      var open = 0;
      (pack.rows || []).forEach(function (row) {
        if (deskReviewed(row)) reviewed += 1;
        else { waiting += 1; open += 1; }
      });
      if (open) reviews.push({ quiz: pack.quiz, open: open });
    });
    reviews.sort(function (a, b) { return b.open - a.open; });
    var reminders = [];
    quizzes.forEach(function (q) {
      if (!deskPublished(q)) {
        reminders.push({
          sort: 50,
          href: 'teacher-class.html?class=' + encodeURIComponent(q._classId) + '&tab=quizzes',
          color: q._color,
          title: q.title || 'Untitled quiz',
          sub: (q._subject || 'Class') + ' · Draft'
        });
        return;
      }
      var offset = deskDayOffset(q.due_date || q.due);
      if (offset === null || offset < -7 || offset > 14) return;
      reminders.push({
        sort: offset,
        href: 'teacher-class.html?class=' + encodeURIComponent(q._classId) + '&tab=quizzes',
        color: q._color,
        title: q.title || 'Untitled quiz',
        sub: (q._subject || 'Class') + ' · Quiz · ' + deskWhen(offset)
      });
    });
    assignments.forEach(function (a) {
      var offset = deskDayOffset(a.due_date || a.due);
      if (offset === null || offset < -7 || offset > 14) return;
      reminders.push({
        sort: offset,
        href: 'teacher-class.html?class=' + encodeURIComponent(a._classId) + '&tab=assignments',
        color: a._color,
        title: a.title || 'Untitled assignment',
        sub: (a._subject || 'Class') + ' · Assignment · ' + deskWhen(offset)
      });
    });
    var events = [];
    try { events = await PrismEvents.get(); } catch (e) { events = []; }
    if (gen !== teacherDeskGen) return;
    (events || []).forEach(function (ev) {
      var offset = deskDayOffset(ev.event_date || ev.date);
      if (offset === null || offset < 0 || offset > 14) return;
      var when = offset === 0 ? 'Today' : (offset === 1 ? 'Tomorrow' : 'In ' + offset + ' days');
      if (ev.event_time) when += ' · ' + String(ev.event_time).slice(0, 5);
      reminders.push({
        sort: offset,
        href: 'calendar.html',
        color: ev.color || '#7c3aed',
        title: ev.title || 'Reminder',
        sub: when
      });
    });
    reminders.sort(function (a, b) { return a.sort - b.sort; });
    var activity = [];
    quizzes.forEach(function (q) {
      var ts = Date.parse(q.published_at || q.created_at || '') || 0;
      if (!ts) return;
      activity.push({
        ts: ts,
        href: 'teacher-class.html?class=' + encodeURIComponent(q._classId) + '&tab=' + (deskPublished(q) ? 'grades' : 'quizzes'),
        color: q._color,
        title: (deskPublished(q) ? 'Published quiz: ' : 'Saved draft: ') + (q.title || 'Untitled'),
        sub: q._subject || ''
      });
    });
    assignments.forEach(function (a) {
      var ts = Date.parse(a.created_at || '') || 0;
      if (!ts) return;
      activity.push({
        ts: ts,
        href: 'teacher-class.html?class=' + encodeURIComponent(a._classId) + '&tab=assignments',
        color: a._color,
        title: 'Posted assignment: ' + (a.title || 'Untitled'),
        sub: a._subject || ''
      });
    });
    posts.forEach(function (p) {
      var ts = Date.parse(p.created_at || '') || 0;
      if (!ts) return;
      var body = String(p.body || '').replace(/\s+/g, ' ').trim();
      activity.push({
        ts: ts,
        href: 'teacher-class.html?class=' + encodeURIComponent(p._classId),
        color: p._color,
        title: body ? body.slice(0, 72) : 'Class post',
        sub: p._subject || ''
      });
    });
    activity.sort(function (a, b) { return b.ts - a.ts; });
    window.__prismTeacherDesk = {
      status: 'ready',
      classes: classes,
      waiting: waiting,
      reviewed: reviewed,
      reviews: reviews,
      reminders: reminders,
      activity: activity,
      drafts: quizzes.filter(function (q) { return !deskPublished(q); }).length
    };
  } catch (e) {
    if (gen !== teacherDeskGen) return;
    window.__prismTeacherDesk = { status: 'error', classes: teacherClassList(), waiting: 0, reviewed: 0, reviews: [], reminders: [], activity: [], drafts: 0 };
  }
  renderSubjectProgress();
  renderQuizStatus();
  renderAssignments();
  renderActivity({});
  renderQuickStats();
}

// 
// SUBJECT PROGRESS
// 
function renderSubjectProgress() {
  var role = sessionStorage.getItem('prism_role') || 'student';
  var container = document.getElementById('subject-progress');
  if (!container) return;
  if (role === 'teacher') {
    setCardChrome('subject-progress', 'Classes', 'teacher.html', 'All classes');
    var desk = window.__prismTeacherDesk;
    if (!desk || desk.status === 'loading') {
      container.innerHTML = deskEmpty('Loading your classes…');
      return;
    }
    if (desk.status === 'error') {
      container.innerHTML = deskEmpty('Could not load your classes yet.');
      return;
    }
    if (!desk.classes.length) {
      container.innerHTML = deskEmpty('You have no classes yet. Create one from My Classes.');
      return;
    }
    container.innerHTML = desk.classes.map(function (c) {
      var n = parseInt(c.student_count, 10) || 0;
      return deskLine(
        'teacher-class.html?class=' + encodeURIComponent(c.id),
        c.color,
        c.subject || 'Class',
        n === 1 ? '1 student' : n + ' students'
      );
    }).join('');
    return;
  }
  SUBJECT_LIST = getSubjectList();
  if (role !== 'student' || !SUBJECT_LIST.length) {
    container.innerHTML = '<div style="text-align:center;padding:1.5rem;color:#9ca3af;font-size:.9rem;">'
      + (role !== 'student' ? 'Subject progress is only shown for students.' : 'Join a class to see your subjects here.')
      + '</div>';
    return;
  }
  container.innerHTML = SUBJECT_LIST.map(function(s) {
    var pct = s.tasks > 0 ? Math.round((s.done / s.tasks) * 100) : 0;
    return '<div class="subject-row" style="margin-bottom:1rem;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.35rem;">'
      + '<div style="display:flex;align-items:center;gap:.5rem;font-size:.9rem;font-weight:600;color:#16132b;">'
      + '<div style="width:10px;height:10px;border-radius:50%;background:'+s.color+';flex-shrink:0;"></div>'+s.subject+'</div>'
      + '<span style="font-size:.78rem;color:#9ca3af;">'+pct+'%</span></div>'
      + '<div style="height:8px;background:#f0ecff;border-radius:20px;overflow:hidden;">'
      + '<div style="height:100%;width:'+pct+'%;background:'+s.color+';border-radius:20px;transition:width .6s ease;"></div>'
      + '</div></div>';
  }).join('');
}

// 
// QUIZ STATUS
// 
function renderQuizStatus() {
  var role = sessionStorage.getItem('prism_role') || 'student';
  var uid  = sessionStorage.getItem('prism_user_id') || 'student';
  var container = document.getElementById('quiz-status-list');
  if (!container) return;

  if (role === 'teacher') {
    var reviewHref = 'teacher.html';
    var desk = window.__prismTeacherDesk;
    if (desk && desk.reviews && desk.reviews[0] && desk.reviews[0].quiz) {
      reviewHref = 'teacher-class.html?class=' + encodeURIComponent(desk.reviews[0].quiz._classId) + '&tab=grades';
    }
    setCardChrome('quiz-status-list', 'Reviews', reviewHref, 'Open grades');
    if (!desk || desk.status === 'loading') {
      container.innerHTML = deskEmpty('Loading reviews…');
      return;
    }
    if (desk.status === 'error') {
      container.innerHTML = deskEmpty('Could not load reviews yet.');
      return;
    }
    var summary = '<div class="desk-summary">'
      + '<div class="desk-count">' + desk.waiting + '<small>To review</small></div>'
      + '<div class="desk-count">' + desk.reviewed + '<small>Reviewed</small></div>'
      + '</div>';
    var rows = (desk.reviews || []).slice(0, 6).map(function (item) {
      var q = item.quiz;
      return deskLine(
        'teacher-class.html?class=' + encodeURIComponent(q._classId) + '&tab=grades',
        q._color,
        q.title || 'Quiz',
        (q._subject || 'Class') + ' · ' + item.open + (item.open === 1 ? ' submission waiting' : ' submissions waiting')
      );
    }).join('');
    container.innerHTML = summary + (rows || deskEmpty('No short answers or essays are waiting. They show up here after students turn them in.'));
    return;
  }
  if (role !== 'student') {
    container.innerHTML = '<div class="p-empty"><div class="p-empty-icon"></div><div>Quiz status is shown for students.</div></div>';
    return;
  }

  var scores   = JSON.parse(localStorage.getItem('prism_quiz_scores_' + uid) || '{}');
  var joined   = JSON.parse(localStorage.getItem('prism_joined_' + uid) || '{}');
  var classIds = Object.keys(joined);
  var quizzes  = JSON.parse(localStorage.getItem('prism_teacher_quizzes') || '[]')
                   .filter(function(q){ return q.published && classIds.indexOf(q.classId)!==-1; });
  var today    = new Date().toISOString().split('T')[0];

  if (!quizzes.length) {
    container.innerHTML = '<div class="p-empty"><div class="p-empty-icon"></div><div>No quizzes assigned yet.</div></div>';
    return;
  }

  container.innerHTML = quizzes.slice(0,8).map(function(q) {
    var isDone    = scores[q.id] !== undefined;
    var isOverdue = !isDone && q.due && q.due < today;
    var badge  = isDone ? ' Done' : isOverdue ? ' Overdue' : ' Pending';
    var badgeBg= isDone ? '#d1fae5' : isOverdue ? '#fee2e2' : '#fef3c7';
    var badgeC = isDone ? '#065f46' : isOverdue ? '#991b1b' : '#92400e';
    return '<div style="display:flex;align-items:center;gap:.8rem;padding:.75rem 0;border-bottom:1px solid #f5f3ff;">'
      + '<div style="width:34px;height:34px;border-radius:9px;background:'+badgeBg+';display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0;"></div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:700;font-size:.88rem;color:#16132b;">'+q.title+'</div>'
      + '<div style="font-size:.74rem;color:#9ca3af;">'+(q.subjectName||'')+(q.due?' · Due '+q.due:'')+(isDone?' · Score: '+scores[q.id]+'/'+q.totalPoints:'')+'</div>'
      + '</div>'
      + '<span style="font-size:.72rem;font-weight:700;padding:3px 9px;border-radius:20px;background:'+badgeBg+';color:'+badgeC+';">'+badge+'</span>'
      + '</div>';
  }).join('');
}

// 
// ASSIGNMENTS
// 
function renderAssignments() {
  var role = sessionStorage.getItem('prism_role') || 'student';
  var container = document.getElementById('asgn-list');
  if (!container) return;
  if (role === 'teacher') {
    setCardChrome('asgn-list', 'Reminders', 'calendar.html', 'Calendar');
    var desk = window.__prismTeacherDesk;
    if (!desk || desk.status === 'loading') {
      container.innerHTML = deskEmpty('Loading reminders…');
      return;
    }
    if (desk.status === 'error') {
      container.innerHTML = deskEmpty('Could not load reminders yet.');
      return;
    }
    if (!desk.reminders.length) {
      container.innerHTML = deskEmpty('Nothing due in the next two weeks. Drafts, deadlines, and calendar events show up here.');
      return;
    }
    container.innerHTML = desk.reminders.slice(0, 8).map(function (item) {
      return deskLine(item.href, item.color, item.title, item.sub);
    }).join('');
    return;
  }
  if (role !== 'student') {
    container.innerHTML = '<div class="p-empty"><div class="p-empty-icon"></div><div>Assignments are shown for students.</div></div>';
    return;
  }
  ALL_CLASSWORK = getClasswork();
  var today    = new Date().toISOString().split('T')[0];
  var combined = ALL_CLASSWORK.filter(function(a){ return a.status==='overdue'||a.status==='pending'; }).slice(0,8);
  if (!combined.length) {
    container.innerHTML = '<div class="p-empty"><div class="p-empty-icon"></div><div>No pending assignments.</div></div>';
    return;
  }
  var icons = {assignment:'',project:'',lab:'',oral:''};
  container.innerHTML = combined.map(function(a) {
    var overdue = a.status === 'overdue';
    return '<div class="asgn-row" style="display:flex;align-items:center;gap:.8rem;padding:.8rem 0;border-bottom:1px solid #f5f3ff;">'
      + '<div style="width:36px;height:36px;border-radius:10px;background:'+(overdue?'#fee2e2':'#ede9fe')+';display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">'+(icons[a.type]||'')+'</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:700;font-size:.9rem;color:#16132b;">'+a.title+'</div>'
      + '<div style="font-size:.75rem;color:#9ca3af;">'+a.subject+'</div>'
      + '</div>'
      + (a.due ? '<div style="font-size:.75rem;font-weight:700;white-space:nowrap;color:'+(overdue?'#ef4444':'#9ca3af')+'">'+(overdue?' Overdue':'Due '+a.due)+'</div>' : '')
      + '</div>';
  }).join('');
}

// 
// ACTIVITY FEED
// 
function renderActivity(profile) {
  var role = sessionStorage.getItem('prism_role') || 'student';
  var container = document.getElementById('activity-feed') || document.getElementById('activity-list');
  if (!container) return;
  if (role === 'teacher') {
    setCardChrome('activity-feed', 'Recent work', '', '');
    var desk = window.__prismTeacherDesk;
    if (!desk || desk.status === 'loading') {
      container.innerHTML = deskEmpty('Loading recent work…');
      return;
    }
    if (desk.status === 'error') {
      container.innerHTML = deskEmpty('Could not load recent work yet.');
      return;
    }
    if (!desk.activity.length) {
      container.innerHTML = deskEmpty('Quizzes, assignments, and class posts you publish show up here.');
      return;
    }
    container.innerHTML = desk.activity.slice(0, 6).map(function (item) {
      return deskLine(item.href, item.color, item.title, item.sub);
    }).join('');
    return;
  }
  if (role !== 'student') {
    container.innerHTML = '<div class="p-empty"><div class="p-empty-icon"></div><div>Activity is shown for students.</div></div>';
    return;
  }
  var uid      = sessionStorage.getItem('prism_user_id') || 'student';
  var joined   = JSON.parse(localStorage.getItem('prism_joined_' + uid) || '{}');
  var classIds = Object.keys(joined);
  var posts    = JSON.parse(localStorage.getItem('prism_teacher_posts') || '[]')
                   .filter(function(p){ return classIds.indexOf(p.classId) !== -1; });
  var notes    = (typeof prismLoadScopedList === 'function') ? prismLoadScopedList('prism_notebooks') : [];
  var events   = (typeof prismLoadScopedList === 'function') ? prismLoadScopedList('prism_events') : [];
  var scores   = JSON.parse(localStorage.getItem('prism_quiz_scores_'+uid) || '{}');

  var activities = [];
  // Quiz completions
  Object.keys(scores).forEach(function(qid) {
    var q = JSON.parse(localStorage.getItem('prism_teacher_quizzes')||'[]').find(function(x){ return x.id===qid; });
    if (q) activities.push({ icon:'', color:'#ede9fe', text:'Completed: '+q.title, sub:'Score: '+scores[qid]+'/'+q.totalPoints, ts: Date.now()-1000 });
  });
  // Recent posts from classes
  posts.slice(-5).forEach(function(p) {
    var subj = joined[p.classId] ? joined[p.classId].subject : '';
    activities.push({ icon:'', color:'#dbeafe', text:p.body.slice(0,60)+(p.body.length>60?'…':''), sub:subj, ts: new Date(p.date).getTime() });
  });
  // Notes
  notes.slice(-3).forEach(function(n) {
    activities.push({ icon:'', color:'#fef3c7', text:'Note: '+(n.title||'Untitled'), sub:(n.notes||[]).length+' notes', ts: Date.now()-2000 });
  });
  activities.sort(function(a,b){ return b.ts-a.ts; });
  if (!activities.length) {
    container.innerHTML = '<div class="p-empty"><div class="p-empty-icon"></div><div>No recent activity yet.</div></div>';
    return;
  }
  container.innerHTML = activities.slice(0,8).map(function(a) {
    return '<div style="display:flex;align-items:flex-start;gap:.8rem;padding:.8rem 0;border-bottom:1px solid #f5f3ff;">'
      + '<div style="width:8px;height:8px;border-radius:50%;background:'+a.color+';flex-shrink:0;margin-top:.55rem;"></div>'
      + '<div style="flex:1;min-width:0;"><div style="font-size:.88rem;font-weight:600;color:#16132b;line-height:1.4;">'+a.text+'</div>'
      + '<div style="font-size:.75rem;color:#9ca3af;margin-top:.1rem;">'+a.sub+'</div></div></div>';
  }).join('');
}

// 
// QUICK STATS
// 
function renderQuickStats() {
  var role = sessionStorage.getItem('prism_role') || 'student';
  var uid  = sessionStorage.getItem('prism_user_id') || 'student';

  if (role === 'teacher') {
    var desk = window.__prismTeacherDesk;
    if (desk && desk.status === 'ready') {
      renderStatCards([
        { icon:'', label:'To review', val: desk.waiting },
        { icon:'', label:'Reviewed', val: desk.reviewed },
        { icon:'', label:'Reminders', val: desk.reminders.length },
        { icon:'', label:'Drafts', val: desk.drafts },
      ]);
      return;
    }
    var classes   = JSON.parse(localStorage.getItem('prism_classes_' + uid) || '[]');
    var allPosts  = JSON.parse(localStorage.getItem('prism_teacher_posts') || '[]');
    var allQuizzes= JSON.parse(localStorage.getItem('prism_teacher_quizzes') || '[]');
    var myStudents = (typeof window.__prismProfileTeacherStudents === 'number')
      ? window.__prismProfileTeacherStudents
      : classes.reduce(function(n, cls) {
          return n + (JSON.parse(localStorage.getItem('prism_students_'+cls.id)||'[]')).length;
        }, 0);
    var subjCount = (typeof window.__prismProfileTeacherSubjects === 'number')
      ? window.__prismProfileTeacherSubjects : classes.length;
    var stats = [
      { icon:'', label:'Subjects', val: subjCount },
      { icon:'', label:'Students', val: myStudents },
      { icon:'', label:'Quizzes', val: allQuizzes.filter(function(q){ return q.teacherId===uid; }).length },
      { icon:'', label:'Posts', val: allPosts.filter(function(p){ return p.teacherId===uid; }).length },
    ];
    renderStatCards(stats);
    return;
  }

  if (role === 'admin') {
    var allAccounts = JSON.parse(localStorage.getItem('prism_accounts') || '[]');
    var stats = [
      { icon:'', label:'Teachers', val: (typeof window.__prismProfileAdminT === 'number') ? window.__prismProfileAdminT : allAccounts.filter(function(a){ return a.role==='teacher'; }).length },
      { icon:'',  label:'Students', val: (typeof window.__prismProfileAdminS === 'number') ? window.__prismProfileAdminS : allAccounts.filter(function(a){ return a.role==='student'; }).length },
    ];
    renderStatCards(stats);
    return;
  }

  // Student stats
  var scores    = JSON.parse(localStorage.getItem('prism_quiz_scores_' + uid) || '{}');
  var joined    = JSON.parse(localStorage.getItem('prism_joined_' + uid) || '{}');
  var classIds  = Object.keys(joined);
  var allQuizzes2 = JSON.parse(localStorage.getItem('prism_teacher_quizzes') || '[]')
                    .filter(function(q){ return q.published && classIds.indexOf(q.classId)!==-1; });
  var done    = Object.keys(scores).length;
  var pending = allQuizzes2.filter(function(q){ return scores[q.id]===undefined; }).length;
  var notes   = ((typeof prismLoadScopedList === 'function') ? prismLoadScopedList('prism_notebooks') : []).length;
  var stats = [
    { icon:'', label:'Quizzes Done',    val: done },
    { icon:'', label:'Pending Quizzes', val: pending },
    { icon:'', label:'Classes Joined',  val: classIds.length },
    { icon:'', label:'Notebooks',       val: notes },
  ];
  renderStatCards(stats);
}

function renderStatCards(stats) {
  var el = document.getElementById('stat-chips');
  if (!el) return;
  el.innerHTML = stats.map(function(s) {
    return '<div class="stat-chip">'
      + '<div class="sc-val">'+s.val+'</div>'
      + '<div class="sc-lbl">'+s.label+'</div>'
      + '</div>';
  }).join('');
}

// 
// AVATAR UPLOAD
// 
function downscaleAvatarDataUrl(dataUrl, maxDim, quality, done) {
 var img = new Image();
 img.onload = function() {
   var w = img.width, h = img.height;
   if (!w || !h) { done(dataUrl); return; }
   if (w <= maxDim && h <= maxDim) { done(dataUrl); return; }
   var scale = maxDim / Math.max(w, h);
   w = Math.round(w * scale);
   h = Math.round(h * scale);
   var c = document.createElement('canvas');
   c.width = w;
   c.height = h;
   var ctx = c.getContext('2d');
   ctx.drawImage(img, 0, 0, w, h);
   done(c.toDataURL('image/jpeg', quality));
 };
 img.onerror = function() { done(dataUrl); };
 img.src = dataUrl;
}

function handleAvatarUpload(event) {
 const file = event.target.files[0];
 if (!file) return;
 if (file.size > 8 * 1024 * 1024) {
   alert('Image is too large. Please choose one under 8 MB.');
   event.target.value = '';
   return;
 }
 const reader = new FileReader();
 reader.onload = function(e) {
   const raw = e.target.result;
   downscaleAvatarDataUrl(raw, 512, 0.88, async function(dataUrl) {
     const img = document.getElementById('avatar-img');
     img.src = dataUrl;
     img.style.display = 'block';
     document.getElementById('avatar-initial').style.display = 'none';

     const saved = loadProfile();
     const userId = sessionStorage.getItem('prism_user_id') || '';
     const name = saved.name || sessionStorage.getItem('prism_user_name') || userId;
     const section = saved.section || sessionStorage.getItem('prism_section') || '';
     const bio = saved.bio || '';
     saved.avatar = dataUrl;
     saveProfileData(saved);
     if (typeof prismCacheUserProfile === 'function') {
       prismCacheUserProfile({ id: userId, name: name, avatar: dataUrl });
     }
     try {
       await PrismProfile.save({ name: name, section: section, email: '', bio: bio, avatar: dataUrl });
     } catch (err) {
       console.warn('Avatar server sync failed:', err);
       alert('Photo updated on this device only. Could not save to the server: ' + (err && err.message ? err.message : 'try a smaller image or check PHP upload/body limits.'));
     }
     initSidebar('home');
   });
 };
 reader.readAsDataURL(file);
 event.target.value = '';
}

// 
// EDIT MODAL
// 
function openEditModal() {
 const saved = loadProfile();
 const userId = sessionStorage.getItem('prism_user_id') || '';
 const userName = sessionStorage.getItem('prism_user_name') || userId || 'Student';
 document.getElementById('edit-name').value = saved.name || userName;
 document.getElementById('edit-section').value = saved.section || 'BSIT 1-A';
 document.getElementById('edit-bio').value = saved.bio || '';
 document.getElementById('edit-overlay').classList.add('active');
}

function closeEditModal() {
 document.getElementById('edit-overlay').classList.remove('active');
}

async function saveProfile() {
 const name    = document.getElementById('edit-name').value.trim();
 const section = document.getElementById('edit-section').value.trim();
 const bio     = document.getElementById('edit-bio').value.trim();

 if (!name) { alert('Name cannot be empty.'); return; }

 try {
   await PrismProfile.save({ name, section, email: '', bio });
 } catch(e) { console.warn('API save failed, saving locally only:', e.message); }

 // Update local cache and sessionStorage
 const saved = loadProfile();
 saved.name = name; saved.section = section; saved.email = ''; saved.bio = bio;
 saved.since = saved.since || new Date().toLocaleDateString('en-US',{year:'numeric',month:'long'});
 saveProfileData(saved);
 sessionStorage.setItem('prism_user_name', name);
 sessionStorage.setItem('prism_section', section);

 // Sync name into class rosters
 const role   = sessionStorage.getItem('prism_role') || 'student';
 const userId = sessionStorage.getItem('prism_user_id') || '';
 if (role === 'student' && userId) {
   const joined = JSON.parse(localStorage.getItem('prism_joined_' + userId) || '{}');
   Object.keys(joined).forEach(function(classId) {
     const roster = JSON.parse(localStorage.getItem('prism_students_' + classId) || '[]');
     let changed = false;
     roster.forEach(function(s) {
       if (s.id === userId) { s.name = name; s.section = section || s.section; changed = true; }
     });
     if (changed) localStorage.setItem('prism_students_' + classId, JSON.stringify(roster));
   });
 }

 closeEditModal();
 const profile = { ...saved, id: userId, role };
 renderHero(profile);
 renderInfoCard(profile);
 initSidebar('home');
}

document.getElementById('edit-overlay').addEventListener('click', function(e) {
 if (e.target === this) closeEditModal();
});
