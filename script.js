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
    'teacher_register.html',
    'admin-register.html',
  ];

  var PAGE_ROLES = {
    'index.html': ['student'],
    'calendar.html': ['student', 'teacher', 'admin'],
    'notes.html': ['student'],
    'quizzes.html': ['student'],
    'call.html': ['student', 'teacher', 'admin'], // leftover URL → send home below
    'teacher.html': ['teacher'],
    'teacher-class.html': ['teacher'],
    'quizmaker.html': ['teacher'],
    'records.html': ['teacher'],
    'grading.html': ['teacher'],
    'admin.html': ['admin'],
    'manage.html': ['admin'],
    'profile.html': ['student', 'teacher', 'admin'],
  };

  if (PUBLIC_PAGES.indexOf(currentPage) !== -1) {
    return;
  }

  if (currentPage === 'call.html') {
    var r = (sessionStorage.getItem('prism_role') || 'student').toLowerCase();
    window.location.replace(r === 'teacher' ? 'teacher.html' : r === 'admin' ? 'admin.html' : 'index.html');
    return;
  }

  var allowed = PAGE_ROLES[currentPage];
  if (typeof prismAuthGuard === 'function') {
    prismAuthGuard(allowed || []).catch(function () {
      window.location.replace('login.html');
    });
    return;
  }

  if (sessionStorage.getItem('prism_logged_in') !== 'true') {
    window.location.replace('login.html');
  }
})();

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
