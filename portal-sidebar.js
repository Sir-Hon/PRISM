/**
 * PRISM shared sidebar — include after api.js + script.js.
 * Call initSidebar(activePage) after DOMContentLoaded.
 * Logout is bound here so dashboards do not each paste their own handler.
 */
var ROLE_NAV = {
  student: [
    { page: 'home', href: 'index.html', icon: '🏠', label: 'Home' },
    { page: 'calendar', href: 'calendar.html', icon: '📅', label: 'Calendar' },
    { page: 'notes', href: 'notes.html', icon: '📓', label: 'Notes' },
    { page: 'quizzes', href: 'quizzes.html', icon: '🧠', label: 'Quizzes' },
    { page: 'call', href: 'call.html', icon: '📞', label: 'Organizations' },
  ],
  teacher: [
    { page: 'home', href: 'teacher.html', icon: '🏠', label: 'My Classes' },
    { page: 'quizmaker', href: 'quizmaker.html', icon: '🧪', label: 'Quiz Maker' },
    { page: 'records', href: 'records.html', icon: '📋', label: 'Records' },
    { page: 'grading', href: 'grading.html', icon: '🎯', label: 'Grading' },
    { page: 'calendar', href: 'calendar.html', icon: '📅', label: 'Calendar' },
    { page: 'call', href: 'call.html', icon: '📞', label: 'Organizations' },
  ],
  admin: [
    { page: 'home', href: 'admin.html', icon: '🏠', label: 'Dashboard' },
    { page: 'manage', href: 'manage.html', icon: '👥', label: 'Manage Users' },
    { page: 'calendar', href: 'calendar.html', icon: '📅', label: 'Calendar' },
    { page: 'call', href: 'call.html', icon: '📞', label: 'Organizations' },
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
      a.innerHTML = '<span class="s-icon">' + l.icon + '</span> ' + prismSidebarEsc(l.label);
      sec.appendChild(a);
    }
    sec.id = 'sidebar-nav';
    placeholder.parentNode.replaceChild(sec, placeholder);
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
    classCont.innerHTML = '';

    if (role === 'teacher') {
      var teacherId = sessionStorage.getItem('prism_user_id') || 'teacher';
      var teacherClasses = [];
      try {
        teacherClasses = JSON.parse(localStorage.getItem('prism_classes_' + teacherId) || '[]');
      } catch (e3) {
        teacherClasses = [];
      }
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
          btn.innerHTML = diamondSVG(cls.color || '#7c3aed', 13) +
            '<span class="sidebar-class-name">' + prismSidebarEsc(cls.subject) + '</span>';
          btn.onclick = function () {
            window.location.href = 'teacher-class.html?class=' + encodeURIComponent(cls.id);
          };
          classCont.appendChild(btn);
        });
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
            btn.innerHTML = diamondSVG(colors[i % colors.length], 13) +
              '<span class="sidebar-class-name">' + prismSidebarEsc(e.subject) + '</span>';
            btn.onclick = function () {
              if (typeof openClassDetail === 'function') {
                openClassDetail(e.classId, e.teacherId, e.subject, colors[i % colors.length]);
              } else {
                window.location.href = 'index.html';
              }
            };
            classCont.appendChild(btn);
          })(entry, idx);
        });
      }
    }
  }

  prismBindLogoutButtons();
}

document.addEventListener('DOMContentLoaded', function () {
  prismBindLogoutButtons();
});
