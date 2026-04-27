// ═══════════════════════════════════════════════════════
//  PRISM PORTAL — script.js  
//  Auth guard + role-based access control
// ═══════════════════════════════════════════════════════

(function () {
  // Detect current page name
  var raw = window.location.pathname.split('/').pop();
  var currentPage = raw || 'index.html';
  // Handle query strings or hash in filename
  currentPage = currentPage.split('?')[0].split('#')[0];
  if (!currentPage || currentPage === '') currentPage = 'index.html';

  // Pages that don't require login
  var PUBLIC_PAGES = [
    'login.html', 'register.html',
    'teacher-register.html', 'admin-register.html'
  ];

  // Role access rules
  var PAGE_ROLES = {
    'index.html':    ['student'],
    'calendar.html': ['student', 'teacher', 'admin'],
    'notes.html':    ['student'],
    'quizzes.html':  ['student'],
    'call.html':     ['student', 'teacher', 'admin'],
    'teacher.html':  ['teacher'],
    'quizmaker.html':['teacher'],
    'records.html':  ['teacher'],
    'grading.html':  ['teacher'],
    'admin.html':    ['admin'],
    'manage.html':   ['admin'],
    'profile.html':  ['student', 'teacher', 'admin'],
  };

  var loggedIn = sessionStorage.getItem('prism_logged_in') === 'true';
  var userRole = sessionStorage.getItem('prism_role') || '';

  // 1. Public page — always clear session and stay. Never auto-redirect from login.
  if (PUBLIC_PAGES.indexOf(currentPage) !== -1) {
    sessionStorage.clear();
    return;
  }

  // 2. Not logged in — go to login
  if (!loggedIn) {
    window.location.replace('login.html');
    return;
  }

  // 3. Wrong role — redirect to own home
  var allowed = PAGE_ROLES[currentPage];
  if (allowed && allowed.indexOf(userRole) === -1) {
    window.location.replace(getRoleHome(userRole));
    return;
  }

  // 4. Auth already handled above — pages load their own guard in DOMContentLoaded

})();

// ── HELPERS ──
function getRoleHome(role) {
  if (role === 'teacher') return 'teacher.html';
  if (role === 'admin')   return 'admin.html';
  return 'index.html';
}

function logout() {
  if (!confirm('Are you sure you want to log out?')) return;
  sessionStorage.removeItem('prism_logged_in');
  sessionStorage.removeItem('prism_user_id');
  sessionStorage.removeItem('prism_user_name');
  sessionStorage.removeItem('prism_role');
  window.location.href = 'login.html';
}

function previewImage(event, imgId, placeholderId) {
  var file = event.target.files[0];
  if (!file) return;
  var img = document.getElementById(imgId);
  var placeholder = document.getElementById(placeholderId);
  var reader = new FileReader();
  reader.onload = function(e) {
    img.src = e.target.result;
    img.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
}