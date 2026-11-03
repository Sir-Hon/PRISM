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
