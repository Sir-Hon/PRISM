/**
 * PRISM shared page helpers — include after api.js on every dashboard.
 * One logout() and one session guard for all roles, instead of pasting
 * the same block into every HTML file.
 */
(function prismApplyThemeBoot() {
  try {
    var t = localStorage.getItem('prism_theme') === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* ignore */ }
})();

(function () {
  var raw = (window.location.pathname || '').split('/').pop() || 'index.html';
  var currentPage = raw.split('?')[0].split('#')[0] || 'index.html';

  var PUBLIC_PAGES = [
    'login.html',
    'register.html',
    'teacher-register.html',
    'admin-register.html',
  ];

  var PAGE_ROLES = {
    'index.html': ['student'],
    'calendar.html': ['student', 'teacher', 'admin'],
    'notes.html': ['student'],
    'quizzes.html': ['student'],
    'teacher.html': ['teacher'],
    'teacher-class.html': ['teacher'],
    'quizmaker.html': ['teacher'],
    'records.html': ['teacher'],
    'grading.html': ['teacher'],
    'lesson.html': ['teacher'],
    'admin.html': ['admin'],
    'manage.html': ['admin'],
    'roster.html': ['admin'],
    'profile.html': ['student', 'teacher', 'admin'],
    'cor.html': ['student', 'admin'],
    'status.html': ['student'],
  };

  var portal = typeof prismPortalRole === 'function' ? prismPortalRole() : 'student';
  var pageRoles = PAGE_ROLES[currentPage];
  if (pageRoles && pageRoles.indexOf(portal) === -1) {
    window.location.replace(portal === 'teacher' ? 'teacher.html' : portal === 'admin' ? 'admin.html' : 'index.html');
    return;
  }

  if (PUBLIC_PAGES.indexOf(currentPage) !== -1) {
    return;
  }

  var embedded = false;
  try { embedded = window.top !== window.self; } catch (e) { embedded = true; }
  var homePage = typeof prismRoleHomePage === 'function' ? prismRoleHomePage() : 'index.html';
  if (!embedded && typeof prismVisitIsLive === 'function' && !prismVisitIsLive() && !(typeof prismAnotherTabOpen === 'function' && prismAnotherTabOpen())) {
    try {
      sessionStorage.removeItem('prism_open_class');
      sessionStorage.removeItem('prism_open_class_meta');
      sessionStorage.removeItem('prism_teacher_active_class_id');
    } catch (e2) { /* ignore */ }
    if (typeof prismRememberOn === 'function' && prismRememberOn()) {
      if (currentPage !== homePage) {
        window.location.replace(homePage);
        return;
      }
      if (window.location.search) {
        try { history.replaceState(null, '', homePage); } catch (e3) { /* ignore */ }
      }
    } else {
      var showLogin = function () { window.location.replace('login.html'); };
      if (typeof PrismAuth !== 'undefined' && PrismAuth.logout) {
        PrismAuth.logout().catch(showLogin);
        return;
      }
      showLogin();
      return;
    }
  }
  if (typeof prismMarkVisit === 'function') prismMarkVisit();

  // Cover only the page body. The top bar and sidebar stay put.
  document.documentElement.classList.add('prism-loading');

  function revealIfAllowed(user) {
    if (!user) return;
    var adminPerm = {
      'admin.html': 'dashboard',
      'manage.html': 'users',
      'roster.html': 'roster',
      'cor.html': 'cor',
      'calendar.html': 'calendar',
    };
    if (user.role === 'admin' && adminPerm[currentPage] && typeof prismAdminCan === 'function' && !prismAdminCan(adminPerm[currentPage])) {
      window.location.replace('admin.html');
      return;
    }
    document.documentElement.classList.remove('prism-loading');
    if (typeof prismRememberSaveHere === 'function') prismRememberSaveHere();
  }

  var allowed = PAGE_ROLES[currentPage];
  if (typeof prismAuthGuard === 'function') {
    Promise.resolve(prismAuthGuard(allowed || [])).then(revealIfAllowed).catch(function () {
      window.location.replace('login.html');
    });
    return;
  }

  if (sessionStorage.getItem('prism_logged_in') !== 'true') {
    window.location.replace('login.html');
    return;
  }
  document.documentElement.classList.remove('prism-loading');
  if (typeof prismRememberSaveHere === 'function') prismRememberSaveHere();
})();

document.addEventListener('click', function (e) {
  var link = e.target && e.target.closest ? e.target.closest('a.sidebar-link, a.topbar-logo, a.topbar-avatar') : null;
  if (!link) return;
  document.documentElement.classList.add('prism-loading');
}, true);

function getRoleHome(role) {
  if (role === 'teacher') return 'teacher.html';
  if (role === 'admin') return 'admin.html';
  return 'index.html';
}

function logout() {
  if (!confirm('Are you sure you want to log out?')) return;
  var go = function () {
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    if (typeof prismRememberClear === 'function') prismRememberClear();
    window.location.href = 'login.html';
  };
  if (typeof PrismAuth !== 'undefined' && PrismAuth.logout) {
    PrismAuth.logout().catch(go).then(function () { /* PrismAuth already redirects */ });
    return;
  }
  var base = typeof API_BASE !== 'undefined' ? API_BASE : '/api';
  fetch(base + '/auth.php?action=logout', {
    method: 'POST',
    credentials: 'include',
    headers: typeof prismCsrfHeaders === 'function' ? prismCsrfHeaders() : {},
  }).finally(go);
}

function prismSetBusy(el, on, label) {
  if (!el) return;
  if (on) {
    if (el.getAttribute('data-prism-busy') === '1') return;
    el.setAttribute('data-prism-busy', '1');
    el.setAttribute('data-prism-label', el.textContent);
    el.classList.add('is-busy');
    el.disabled = true;
    el.setAttribute('aria-busy', 'true');
    if (label) el.textContent = label;
    return;
  }
  el.classList.remove('is-busy');
  el.disabled = false;
  el.removeAttribute('aria-busy');
  if (el.hasAttribute('data-prism-label')) el.textContent = el.getAttribute('data-prism-label');
  el.removeAttribute('data-prism-busy');
  el.removeAttribute('data-prism-label');
}

function prismShowWait(el, message) {
  if (!el) return;
  var note = document.createElement('div');
  note.className = 'prism-wait';
  note.textContent = message || 'Loading';
  el.textContent = '';
  el.appendChild(note);
}

function prismLocalUserId() {
  try { return sessionStorage.getItem('prism_user_id') || ''; } catch (e) { return ''; }
}

function prismScopedKey(base) {
  var id = prismLocalUserId();
  return base + '_' + (id || 'guest');
}

function prismInferLocalOwner() {
  var score = {};
  var order = [];
  var skip = { student: 1, teacher: 1, guest: 1, undefined: 1 };
  function add(id, n) {
    if (!id || skip[id]) return;
    if (score[id] == null) order.push(id);
    score[id] = (score[id] || 0) + n;
  }
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i) || '';
      var m = /^(prism_profile|prism_joined|prism_classes|prism_quiz_scores|prism_quiz_attempts|prism_quiz_inprogress)_(.+)$/.exec(k);
      if (m) add(m[2], m[1] === 'prism_profile' ? 1 : 3);
      var mine = /^prism_asgn_mine_([^_]+)_/.exec(k);
      if (mine) add(mine[1], 2);
    }
  } catch (e) { /* ignore */ }
  var bestN = 0;
  order.forEach(function (id) { if (score[id] > bestN) bestN = score[id]; });
  if (!bestN) return prismLocalUserId();
  for (var j = 0; j < order.length; j++) {
    if (score[order[j]] === bestN) return order[j];
  }
  return prismLocalUserId();
}

/* Move a shared local list onto the account that already used this browser. */
function prismLoadScopedList(base) {
  var uid = prismLocalUserId();
  var ownerKey = base + '_owner';
  var legacy = null;
  var owner = '';
  try { legacy = localStorage.getItem(base); } catch (e) { legacy = null; }
  try { owner = localStorage.getItem(ownerKey) || ''; } catch (e2) { owner = ''; }
  if (legacy != null && !owner) {
    owner = prismInferLocalOwner();
    if (owner) {
      try {
        if (localStorage.getItem(base + '_' + owner) == null) localStorage.setItem(base + '_' + owner, legacy);
        localStorage.setItem(ownerKey, owner);
        localStorage.removeItem(base);
      } catch (e3) { /* ignore */ }
    }
  }
  var key = base + '_' + (uid || 'guest');
  try {
    var mine = localStorage.getItem(key);
    if (mine != null) return JSON.parse(mine);
  } catch (e4) { /* ignore */ }
  return [];
}

function prismSaveScopedList(base, value) {
  try { localStorage.setItem(prismScopedKey(base), JSON.stringify(value)); } catch (e) { /* ignore */ }
}

function previewImage(event, imgId, placeholderId) {
  var file = event.target.files[0];
  if (!file) return;
  var img = document.getElementById(imgId);
  var placeholder = document.getElementById(placeholderId);
  var reader = new FileReader();
  reader.onload = function (e) {
    if (img) {
      img.src = e.target.result;
      img.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
}
