/**
 * PRISM shared sidebar — include after api.js + script.js.
 * Call initSidebar(activePage) after DOMContentLoaded.
 * Logout is bound here so dashboards do not each paste their own handler.
 */
function prismNavIcon(name) {
  var common = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var map = {
    home: '<svg ' + common + '><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
    calendar: '<svg ' + common + '><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    notes: '<svg ' + common + '><path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2z"/></svg>',
    quizzes: '<svg ' + common + '><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8"/><path d="M12 17h.01"/></svg>',
    classes: '<svg ' + common + '><path d="M4 19V6a2 2 0 0 1 2-2h9l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M15 4v5h5"/></svg>',
    records: '<svg ' + common + '><path d="M8 6h13M8 12h13M8 18h13"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    cor: '<svg ' + common + '><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M8 13h8M8 17h5"/></svg>',
    status: '<svg ' + common + '><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3.5h6V6H9zM8 11h8M8 15h5"/></svg>',
    grading: '<svg ' + common + '><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    plan: '<svg ' + common + '><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
    users: '<svg ' + common + '><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="3.5"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    dashboard: '<svg ' + common + '><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  };
  return map[name] || '';
}

var ROLE_NAV = {
  student: [
    { page: 'home', href: 'index.html', icon: 'home', label: 'Home' },
    { page: 'status', href: 'status.html', icon: 'status', label: 'Status' },
    { page: 'calendar', href: 'calendar.html', icon: 'calendar', label: 'Calendar' },
    { page: 'notes', href: 'notes.html', icon: 'notes', label: 'Notes' },
    { page: 'quizzes', href: 'quizzes.html', icon: 'quizzes', label: 'Quizzes' },
    { page: 'cor', href: 'cor.html', icon: 'cor', label: 'COR' },
  ],
  teacher: [
    { page: 'home', href: 'teacher.html', icon: 'classes', label: 'My Classes' },
    { page: 'quizmaker', href: 'quizmaker.html', icon: 'quizzes', label: 'Quiz Maker' },
    { page: 'lesson', href: 'lesson.html', icon: 'plan', label: 'Lesson Plan' },
    { page: 'calendar', href: 'calendar.html', icon: 'calendar', label: 'Calendar' },
  ],
  admin: [
    { page: 'home', href: 'admin.html', icon: 'dashboard', label: 'Dashboard' },
    { page: 'manage', href: 'manage.html', icon: 'users', label: 'Manage Users' },
    { page: 'roster', href: 'roster.html', icon: 'records', label: 'Roster' },
    { page: 'cor', href: 'cor.html', icon: 'cor', label: 'COR' },
    { page: 'calendar', href: 'calendar.html', icon: 'calendar', label: 'Calendar' },
  ],
};

function prismSidebarEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prismSidebarColor(c) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? c : '#7c3aed';
}

function diamondSVG(color, size) {
  size = size || 14;
  var fill = prismSidebarColor(color);
  return '<svg class="sidebar-diamond" width="' + size + '" height="' + size + '" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 1L13 7L7 13L1 7Z" fill="' + fill + '" stroke="' + fill + '" stroke-width="0.5" stroke-linejoin="round"/></svg>';
}

function prismGetTheme() {
  try {
    return localStorage.getItem('prism_theme') === 'dark' ? 'dark' : 'light';
  } catch (e) {
    return 'light';
  }
}

function prismApplyTheme(theme) {
  var next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('prism_theme', next); } catch (e) { /* ignore */ }
  var btn = document.getElementById('prism-theme-toggle');
  if (btn) {
    btn.innerHTML = next === 'dark'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/></svg>';
    btn.title = next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
  }
}

function prismToggleTheme() {
  prismApplyTheme(prismGetTheme() === 'dark' ? 'light' : 'dark');
}

function prismEnsureThemeToggle() {
  var right = document.querySelector('.topbar-right');
  if (!right) return;
  var btn = document.getElementById('prism-theme-toggle');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'prism-theme-toggle';
    btn.className = 'topbar-theme-btn';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      prismToggleTheme();
    });
    var avatar = document.getElementById('topbar-avatar');
    if (avatar && avatar.parentNode === right) right.insertBefore(btn, avatar);
    else right.appendChild(btn);
  }
  prismApplyTheme(prismGetTheme());
}

function markSidebarClassActive(classId) {
  window.__prismActiveClassId = classId ? String(classId) : '';
  document.querySelectorAll('.sidebar-class-item').forEach(function (btn) {
    if (window.__prismActiveClassId && btn.getAttribute('data-class-id') === window.__prismActiveClassId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function prismBindLogoutButtons() {
  document.querySelectorAll('button.sidebar-logout').forEach(function (btn) {
    if (btn.dataset.prismLogoutBound === '1') return;
    btn.dataset.prismLogoutBound = '1';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof logout === 'function') logout();
    });
  });
}

function initSidebar(activePage) {
  prismEnsureThemeToggle();
  var uid = sessionStorage.getItem('prism_user_id') || '';
  var profile = {};
  try {
    profile = JSON.parse(localStorage.getItem('prism_profile_' + uid) || '{}');
  } catch (e) {
    profile = {};
  }
  var userName = profile.name || sessionStorage.getItem('prism_user_name') || uid || 'User';
  if (profile.name) sessionStorage.setItem('prism_user_name', profile.name);
  var roleRaw = sessionStorage.getItem('prism_role') || 'student';
  var role = String(roleRaw).toLowerCase().trim();
  if (!ROLE_NAV[role]) role = 'student';
  try { document.body.setAttribute('data-prism-role', role); } catch (e2) { /* ignore */ }
  var initial = String(userName).charAt(0).toUpperCase();

  var logoLinks = document.querySelectorAll('.topbar-logo');
  var homeHref = role === 'admin' ? 'admin.html' : role === 'teacher' ? 'teacher.html' : 'index.html';
  for (var li = 0; li < logoLinks.length; li++) {
    logoLinks[li].href = homeHref;
    var gem = logoLinks[li].querySelector('.topbar-logo-gem');
    if (gem) {
      gem.innerHTML = '<img src="Prismcrys.png" style="width:100%;height:100%;object-fit:contain;display:block;" alt="PRISM"/>';
    }
  }

  var tbName = document.getElementById('topbar-name');
  var tbRole = document.getElementById('topbar-role');
  var tbAvatar = document.getElementById('topbar-avatar');
  if (tbName) tbName.textContent = userName;
  if (tbRole) {
    tbRole.textContent = role;
    var roleColors = { student: '#7c3aed', teacher: '#10b981', admin: '#f59e0b' };
    var roleBgs = { student: '#ede9fe', teacher: '#d1fae5', admin: '#fef3c7' };
    tbRole.style.color = roleColors[role] || '#7c3aed';
    tbRole.style.background = roleBgs[role] || '#ede9fe';
    tbRole.style.borderColor = (roleColors[role] || '#7c3aed') + '33';
  }
  if (tbAvatar) {
    if (profile.avatar && String(profile.avatar).indexOf('data:image/') === 0) {
      tbAvatar.innerHTML = '<img src="' + profile.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" alt=""/>';
    } else {
      tbAvatar.textContent = initial;
    }
  }

  var userCard = document.getElementById('sidebar-user-card');
  if (userCard) userCard.innerHTML = '';

  var placeholder = document.getElementById('sidebar-nav');
  if (placeholder) {
    var links = ROLE_NAV[role] || ROLE_NAV.student;
    var navKey = role + '|' + String(activePage || '');
    if (placeholder.dataset.prismNavKey === navKey) {
      placeholder.querySelectorAll('.sidebar-link').forEach(function (a) {
        if (a.getAttribute('data-page') === activePage) a.classList.add('active');
        else a.classList.remove('active');
      });
    } else {
      var lbl = role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher' : 'Main';
      var sec = document.createElement('div');
      sec.className = 'sidebar-section';
      var secLbl = document.createElement('div');
      secLbl.className = 'sidebar-section-label';
      secLbl.textContent = lbl;
      sec.appendChild(secLbl);
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        var a = document.createElement('a');
        a.className = 'sidebar-link' + (l.page === activePage ? ' active' : '');
        a.setAttribute('data-page', l.page);
        a.href = l.href;
        a.innerHTML = '<span class="s-icon">' + prismNavIcon(l.icon) + '</span> ' + prismSidebarEsc(l.label);
        sec.appendChild(a);
      }
      sec.id = 'sidebar-nav';
      sec.dataset.prismNavKey = navKey;
      placeholder.parentNode.replaceChild(sec, placeholder);
    }
  }

  var classCont = document.getElementById('sidebar-classes');
  if (classCont) {
    if (role === 'admin') {
      var node = classCont.parentNode;
      while (node && !(node.className && String(node.className).indexOf('sidebar-section') !== -1)) {
        node = node.parentNode;
      }
      if (node) node.style.display = 'none';
      var prev = node && node.previousElementSibling;
      if (prev && prev.className && String(prev.className).indexOf('sidebar-divider') !== -1) {
        prev.style.display = 'none';
      }
      prismBindLogoutButtons();
      return;
    }

    var classSection = classCont.parentNode;
    if (classSection) {
      var classLabel = classSection.querySelector('.sidebar-section-label');
      if (classLabel) classLabel.textContent = role === 'teacher' ? 'Classes' : 'My Classes';
    }
    if (role === 'teacher') {
      var teacherId = sessionStorage.getItem('prism_user_id') || 'teacher';
      var teacherClasses = [];
      try {
        teacherClasses = JSON.parse(localStorage.getItem('prism_classes_' + teacherId) || '[]');
      } catch (e3) {
        teacherClasses = [];
      }
      var tSig = teacherClasses.map(function (c) { return String(c.id) + '|' + String(c.subject || ''); }).join(',');
      if (classCont.dataset.prismClassSig !== tSig) {
        classCont.dataset.prismClassSig = tSig;
        classCont.innerHTML = '';
        if (!teacherClasses.length) {
          var emp = document.createElement('div');
          emp.style.cssText = 'font-size:.78rem;color:#6b7280;padding:.4rem 1.3rem;';
          emp.textContent = 'No subjects yet';
          classCont.appendChild(emp);
        } else {
          teacherClasses.forEach(function (cls) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sidebar-class-item';
            btn.setAttribute('data-class-id', cls.id);
            btn.innerHTML = diamondSVG(cls.color || '#7c3aed', 13) +
              '<span class="sidebar-class-name">' + prismSidebarEsc(cls.subject) + '</span>';
            btn.onclick = function () {
              window.location.href = 'teacher-class.html?class=' + encodeURIComponent(cls.id);
            };
            classCont.appendChild(btn);
          });
        }
      }
    } else {
      var studentId = sessionStorage.getItem('prism_user_id') || 'student';
      var joinedRaw = {};
      try {
        joinedRaw = JSON.parse(localStorage.getItem('prism_joined_' + studentId) || '{}');
      } catch (e4) {
        joinedRaw = {};
      }
      var joinedList = Object.values(joinedRaw);
      var sSig = joinedList.map(function (e) { return String(e.classId) + '|' + String(e.subject || ''); }).join(',');
      if (classCont.dataset.prismClassSig !== sSig) {
        classCont.dataset.prismClassSig = sSig;
        classCont.innerHTML = '';
        if (!joinedList.length) {
          var emp2 = document.createElement('div');
          emp2.style.cssText = 'font-size:.78rem;color:#6b7280;padding:.4rem 1.3rem;';
          emp2.textContent = 'No classes joined yet';
          classCont.appendChild(emp2);
        } else {
          var colors = ['#7c3aed', '#0d9488', '#d97706', '#2563eb', '#be123c', '#15803d'];
          joinedList.forEach(function (entry, idx) {
            (function (e, i) {
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'sidebar-class-item';
              btn.setAttribute('data-class-id', e.classId);
              btn.innerHTML = diamondSVG(e.color || colors[i % colors.length], 13) +
                '<span class="sidebar-class-name">' + prismSidebarEsc(e.subject) + '</span>';
              btn.onclick = function (ev) {
                if (ev) { ev.preventDefault(); ev.stopPropagation(); }
                prismGoToStudentClass(e.classId, e.teacherId, e.subject, e.color || colors[i % colors.length]);
              };
              classCont.appendChild(btn);
            })(entry, idx);
          });
        }
      }
    }
    markSidebarClassActive(window.__prismActiveClassId || '');
  }

  prismBindLogoutButtons();
  if (!window.__prismSidebarSkipRefresh && role !== 'admin') {
    prismRefreshSidebarClasses(role, activePage);
  }
}

var __prismSidebarRefreshGen = 0;

function prismRefreshSidebarClasses(role, activePage) {
  if (typeof PrismClasses === 'undefined' || !PrismClasses.getMyClasses) return;
  var gen = ++__prismSidebarRefreshGen;
  PrismClasses.getMyClasses().then(function (list) {
    if (gen !== __prismSidebarRefreshGen) return;
    var uid = sessionStorage.getItem('prism_user_id') || '';
    if (!uid) return;
    if (role === 'teacher') {
      var normalized = (list || []).map(function (c) {
        return {
          id: c.id,
          subject: c.subject,
          color: c.color || '#7c3aed',
          code: c.code,
          teacher_id: c.teacher_id || uid,
          student_count: parseInt(c.student_count, 10) || 0
        };
      });
      localStorage.setItem('prism_classes_' + uid, JSON.stringify(normalized));
    } else {
      var joined = {};
      (list || []).forEach(function (cls) {
        joined[cls.id] = {
          classId: cls.id,
          teacherId: cls.teacher_id,
          subject: cls.subject,
          color: cls.color || '',
          joinedAt: cls.joined_at || ''
        };
      });
      localStorage.setItem('prism_joined_' + uid, JSON.stringify(joined));
    }
    window.__prismSidebarSkipRefresh = true;
    initSidebar(activePage || prismActivePageFromPath());
    window.__prismSidebarSkipRefresh = false;
  }).catch(function () { /* keep the list already on screen */ });
}

function prismActivePageFromPath() {
  var raw = (window.location.pathname || '').split('/').pop() || '';
  var file = raw.split('?')[0].split('#')[0].replace(/\.html$/i, '');
  var map = {
    index: 'home',
    teacher: 'home',
    'teacher-class': 'home',
    admin: 'home',
    notes: 'notes',
    calendar: 'calendar',
    quizzes: 'quizzes',
    quizmaker: 'quizmaker',
    records: 'records',
    grading: 'lesson',
    lesson: 'lesson',
    cor: 'cor',
    status: 'status',
    manage: 'manage',
    roster: 'roster',
    profile: 'home',
  };
  return map[file] || file || 'home';
}

function prismStudentPageFile() {
  return ((window.location.pathname || '').split('/').pop() || '').split('?')[0].split('#')[0].toLowerCase();
}

function prismRememberOpenClass(classId, teacherId, subject, color) {
  try {
    sessionStorage.setItem('prism_open_class', String(classId));
    sessionStorage.setItem('prism_open_class_meta', JSON.stringify({
      classId: String(classId),
      teacherId: teacherId || '',
      subject: subject || 'Class',
      color: color || '#7c3aed'
    }));
  } catch (e) { /* ignore */ }
}

function prismReadOpenClassMeta(classId) {
  try {
    var meta = JSON.parse(sessionStorage.getItem('prism_open_class_meta') || 'null');
    if (meta && String(meta.classId) === String(classId)) return meta;
  } catch (e) { /* ignore */ }
  return null;
}

function prismGoToStudentClass(classId, teacherId, subject, color) {
  if (!classId) return;
  prismRememberOpenClass(classId, teacherId, subject, color);
  var here = prismStudentPageFile();
  if (typeof openClassDetail === 'function' && (here === '' || here === 'index.html')) {
    openClassDetail(classId, teacherId, subject, color || '#7c3aed');
    return;
  }
  window.location.assign('index.html?class=' + encodeURIComponent(classId));
}

function prismOpenClassFromLocation() {
  var here = prismStudentPageFile();
  if (here !== '' && here !== 'index.html') return;
  if (typeof openClassDetail !== 'function') return;
  if (document.getElementById('class-view-overlay')) return;
  var classId = '';
  try { classId = new URLSearchParams(window.location.search).get('class') || ''; } catch (e) { classId = ''; }
  if (!classId) {
    try { classId = sessionStorage.getItem('prism_open_class') || ''; } catch (e2) { classId = ''; }
  }
  if (!classId) return;
  var meta = prismReadOpenClassMeta(classId);
  var teacherId = meta ? meta.teacherId : '';
  var subject = meta ? meta.subject : '';
  var color = meta ? meta.color : '';
  if (!subject) {
    try {
      var uid = sessionStorage.getItem('prism_user_id') || '';
      var joined = JSON.parse(localStorage.getItem('prism_joined_' + uid) || '{}');
      var row = joined[classId];
      if (!row) {
        Object.keys(joined).some(function (key) {
          var item = joined[key];
          if (item && String(item.classId || key) === String(classId)) { row = item; return true; }
          return false;
        });
      }
      if (row) {
        teacherId = row.teacherId || teacherId;
        subject = row.subject || subject;
        color = row.color || color;
      }
    } catch (e3) { /* ignore */ }
  }
  openClassDetail(classId, teacherId, subject || 'Class', color || '#7c3aed');
}

document.addEventListener('DOMContentLoaded', function () {
  prismEnsureThemeToggle();
  prismBindLogoutButtons();
  if (typeof initSidebar === 'function') initSidebar(prismActivePageFromPath());
  prismOpenClassFromLocation();
});
