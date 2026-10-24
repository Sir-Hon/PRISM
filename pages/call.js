/** Organizations page retired — send each role to their home. */
(function () {
  var role = String(sessionStorage.getItem('prism_role') || 'student').toLowerCase();
  var home = role === 'teacher' ? 'teacher.html' : role === 'admin' ? 'admin.html' : 'index.html';
  window.location.replace(home);
})();
