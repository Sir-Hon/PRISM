/** Admin roster: students, teachers, and administrators. */
(function () {
  var page = 1;
  var pages = 1;
  var teacherPage = 1;
  var teacherPages = 1;
  var adminPage = 1;
  var adminPages = 1;
  var lastFile = null;
  var editingStudent = '';
  var editingTeacher = '';
  var editingAdmin = '';
  var selectedAdminType = 'Security';
  var studentHint = 'The password is saved encrypted. After you leave this form it is shown only as a mask, so share it with the student before you go back.';
  var teacherHint = 'The password is saved encrypted and is not shown again after you leave this form.';
  var adminHint = 'Only the superadmin can add another administrator. admin001 stays the superadmin. The password is saved encrypted and is not shown again after you leave this form.';
  var adminTypes = [
    { id: 'Administrator', perms: ['users', 'roster', 'cor', 'calendar', 'security', 'announcements'] },
    { id: 'Academic Admin', perms: ['users', 'calendar', 'announcements'] },
    { id: 'Records Admin', perms: ['users', 'roster', 'cor'] },
    { id: 'Support Admin', perms: ['users'] },
    { id: 'Security', perms: ['security'] },
    { id: 'User management', perms: ['users'] },
    { id: 'Roster', perms: ['roster'] },
    { id: 'COR', perms: ['cor'] },
    { id: 'Calendar', perms: ['calendar'] },
    { id: 'Announcements', perms: ['announcements'] }
  ];
  var adminFeatures = [
    ['users', 'Teachers and students'],
    ['roster', 'Roster'],
    ['cor', 'COR'],
    ['calendar', 'Calendar'],
    ['security', 'Security'],
    ['announcements', 'Announcements']
  ];
  var catalog = { colleges: {}, years: ['1', '2', '3', '4'], sections: ['A', 'B', 'C', 'D', 'E', 'F'] };
  var collegeNames = { CoED: 'College of Education', CoTE: 'College of Technology' };

  function showError(text) {
    var el = document.getElementById('page-error');
    el.style.display = text ? 'block' : 'none';
    el.textContent = text || '';
  }

  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text == null ? '' : String(text);
    return td;
  }

  function collegeLabel(code) {
    if (!code) return 'Not categorized';
    return collegeNames[code] ? (code + ' — ' + collegeNames[code]) : code;
  }

  function fillSelect(select, values, placeholder, labeler) {
    var current = select.value;
    select.textContent = '';
    var first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.appendChild(first);
    values.forEach(function (value) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = labeler ? labeler(value) : value;
      select.appendChild(opt);
    });
    if (current && values.indexOf(current) !== -1) select.value = current;
  }

  function programsFor(college) {
    if (!college) {
      var all = [];
      Object.keys(catalog.colleges || {}).forEach(function (key) {
        (catalog.colleges[key] || []).forEach(function (program) {
          if (all.indexOf(program) === -1) all.push(program);
        });
      });
      return all;
    }
    return (catalog.colleges && catalog.colleges[college]) ? catalog.colleges[college].slice() : [];
  }

  function applyCatalog() {
    var colleges = Object.keys(catalog.colleges || {});
    fillSelect(document.getElementById('a-college'), colleges, 'Choose', collegeLabel);
    fillSelect(document.getElementById('t-college'), colleges, 'Choose', collegeLabel);
    fillSelect(document.getElementById('f-college'), colleges, 'All colleges', collegeLabel);
    fillSelect(document.getElementById('tf-college'), colleges, 'All colleges', collegeLabel);
    fillSelect(document.getElementById('a-year'), catalog.years, 'Choose', function (year) { return 'Year ' + year; });
    fillSelect(document.getElementById('f-year'), catalog.years, 'All years', function (year) { return 'Year ' + year; });
    fillSelect(document.getElementById('a-section'), catalog.sections, 'Choose');
    fillSelect(document.getElementById('f-section'), catalog.sections, 'All sections');
    fillSelect(document.getElementById('a-program'), [], 'Choose a college first');
    fillSelect(document.getElementById('f-program'), programsFor(''), 'All programs');
  }

  function passwordCell() {
    var td = document.createElement('td');
    var mask = document.createElement('span');
    mask.className = 'pw-mask';
    mask.textContent = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
    mask.title = 'Stored encrypted. The original password is not shown again.';
    var note = document.createElement('span');
    note.className = 'pw-note';
    note.textContent = 'encrypted';
    td.appendChild(mask);
    td.appendChild(note);
    return td;
  }

  function actionButton(label, fn) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost';
    btn.textContent = label;
    btn.addEventListener('click', fn);
    return btn;
  }

  function emptyRow(text, span) {
    var tr = document.createElement('tr');
    tr.className = 'empty-row';
    var td = document.createElement('td');
    td.colSpan = span;
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }

  async function load() {
    showError('');
    var data = await PrismRoster.list(
      document.getElementById('q').value.trim(),
      '',
      page,
      {
        college: document.getElementById('f-college').value,
        program: document.getElementById('f-program').value,
        year: document.getElementById('f-year').value,
        section: document.getElementById('f-section').value
      }
    );
    pages = data.pages || 1;
    page = data.page || 1;
    document.getElementById('page-label').textContent = 'Page ' + page + ' of ' + pages;
    var body = document.getElementById('roster-body');
    body.textContent = '';
    (data.rows || []).forEach(function (row) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(row.id_number));
      tr.appendChild(cell((row.first_name || '') + ' ' + (row.last_name || '')));
      tr.appendChild(cell(row.email));
      tr.appendChild(cell(row.college || ''));
      tr.appendChild(cell(row.program || ''));
      tr.appendChild(cell(row.year || ''));
      tr.appendChild(cell(row.section || ''));
      tr.appendChild(passwordCell());
      var actions = document.createElement('td');
      actions.className = 'row-actions';
      actions.appendChild(actionButton('Edit', function () { beginEditStudent(row); }));
      actions.appendChild(actionButton('Delete', function () { removeStudent(row.id_number); }));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    if (!(data.rows || []).length) {
      body.appendChild(emptyRow('No students in this category.', 9));
    }
  }

  async function loadTeachers() {
    showError('');
    var data = await PrismRoster.listTeachers(
      document.getElementById('tq').value.trim(),
      document.getElementById('tf-college').value,
      teacherPage
    );
    teacherPages = data.pages || 1;
    teacherPage = data.page || 1;
    document.getElementById('teacher-page-label').textContent = 'Page ' + teacherPage + ' of ' + teacherPages;
    var body = document.getElementById('teacher-body');
    body.textContent = '';
    (data.rows || []).forEach(function (row) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(row.id));
      tr.appendChild(cell((row.first_name || '') + ' ' + (row.last_name || '')));
      tr.appendChild(cell(row.email));
      tr.appendChild(cell(row.college || ''));
      tr.appendChild(cell(row.department || ''));
      tr.appendChild(cell(row.subjects || ''));
      tr.appendChild(passwordCell());
      var actions = document.createElement('td');
      actions.className = 'row-actions';
      actions.appendChild(actionButton('Edit', function () { beginEditTeacher(row); }));
      actions.appendChild(actionButton('Delete', function () { removeTeacher(row.id); }));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    if (!(data.rows || []).length) {
      body.appendChild(emptyRow('No teachers in this category.', 8));
    }
  }

  function isSuperadmin() {
    return sessionStorage.getItem('prism_superadmin') === '1';
  }

  function renderAdminChoices() {
    var pills = document.getElementById('m-types');
    var grid = document.getElementById('m-perms');
    pills.textContent = '';
    grid.textContent = '';
    adminTypes.forEach(function (type) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'type-pill' + (type.id === selectedAdminType ? ' selected' : '');
      btn.setAttribute('data-type', type.id);
      btn.textContent = type.id;
      btn.addEventListener('click', function () { selectAdminType(type.id); });
      pills.appendChild(btn);
    });
    adminFeatures.forEach(function (item) {
      var label = document.createElement('label');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.setAttribute('data-perm', item[0]);
      var name = document.createElement('span');
      name.textContent = item[1];
      label.appendChild(box);
      label.appendChild(name);
      grid.appendChild(label);
    });
    fillSelect(document.getElementById('af-type'), adminTypes.map(function (item) { return item.id; }), 'All types');
    selectAdminType(selectedAdminType);
  }

  function selectAdminType(label) {
    selectedAdminType = adminTypes.some(function (item) { return item.id === label; }) ? label : 'Security';
    document.querySelectorAll('#m-types .type-pill').forEach(function (btn) {
      btn.classList.toggle('selected', btn.getAttribute('data-type') === selectedAdminType);
    });
    applyAdminType(selectedAdminType);
  }

  function setAdminPerms(keys) {
    document.querySelectorAll('#m-perms input[data-perm]').forEach(function (box) {
      box.checked = keys.indexOf(box.getAttribute('data-perm')) !== -1;
    });
  }

  function chosenAdminPerms() {
    var permissions = { dashboard: true };
    document.querySelectorAll('#m-perms input[data-perm]').forEach(function (box) {
      permissions[box.getAttribute('data-perm')] = !!box.checked;
    });
    return permissions;
  }

  function applyAdminType(label) {
    var found = adminTypes.filter(function (item) { return item.id === label; })[0];
    if (found) setAdminPerms(found.perms);
  }

  async function loadAdmins() {
    if (!isSuperadmin()) return;
    showError('');
    var data = await PrismRoster.listAdmins(
      document.getElementById('aq').value.trim(),
      document.getElementById('af-type').value,
      adminPage
    );
    adminPages = data.pages || 1;
    adminPage = data.page || 1;
    document.getElementById('admin-page-label').textContent = 'Page ' + adminPage + ' of ' + adminPages;
    var body = document.getElementById('admin-body');
    var me = String(sessionStorage.getItem('prism_user_id') || '');
    body.textContent = '';
    (data.rows || []).forEach(function (row) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(row.id));
      tr.appendChild(cell((row.first_name || '') + ' ' + (row.last_name || '')));
      tr.appendChild(cell(row.email));
      tr.appendChild(cell(row.type || ''));
      tr.appendChild(cell(row.features || ''));
      tr.appendChild(passwordCell());
      var actions = document.createElement('td');
      actions.className = 'row-actions';
      if (!row.superadmin) {
        actions.appendChild(actionButton('Edit', function () { beginEditAdmin(row); }));
        if (String(row.id) !== me) {
          actions.appendChild(actionButton('Delete', function () { removeAdmin(row.id); }));
        }
      }
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    if (!(data.rows || []).length) {
      body.appendChild(emptyRow('No administrators in this category.', 7));
    }
  }

  async function removeStudent(id) {
    if (!window.confirm('Remove this student and their login?')) return;
    try { await PrismRoster.remove(id); await load(); } catch (e) { showError(e.message); }
  }

  async function removeTeacher(id) {
    if (!window.confirm('Remove this teacher and their login?')) return;
    try { await PrismRoster.removeTeacher(id); await loadTeachers(); } catch (e) { showError(e.message); }
  }

  async function removeAdmin(id) {
    if (!window.confirm('Remove this administrator and their login?')) return;
    try { await PrismRoster.removeAdmin(id); await loadAdmins(); } catch (e) { showError(e.message); }
  }

  function renderPreview(rows) {
    var body = document.getElementById('preview-body');
    body.textContent = '';
    var valid = 0;
    (rows || []).forEach(function (row) {
      if (row.valid) valid++;
      var tr = document.createElement('tr');
      tr.className = row.valid ? 'ok-row' : 'err-row';
      tr.appendChild(cell(row.line));
      tr.appendChild(cell(row.id_number));
      tr.appendChild(cell(row.email));
      tr.appendChild(cell((row.first_name || '') + ' ' + (row.last_name || '')));
      tr.appendChild(cell([row.college, row.program, row.year, row.section].filter(Boolean).join(' · ')));
      tr.appendChild(cell(row.valid ? 'Ready' : (row.errors || []).join(' ')));
      body.appendChild(tr);
    });
    document.getElementById('preview-summary').textContent = valid + ' valid row(s). Invalid rows are highlighted and will be skipped. Passwords are not shown here.';
    document.getElementById('preview-wrap').style.display = 'block';
  }

  function showView(which) {
    if (which === 'admins' && !isSuperadmin()) which = 'students';
    document.getElementById('student-view').style.display = which === 'students' ? '' : 'none';
    document.getElementById('teacher-view').style.display = which === 'teachers' ? '' : 'none';
    document.getElementById('admin-view').style.display = which === 'admins' ? '' : 'none';
    document.getElementById('tab-students').classList.toggle('active', which === 'students');
    document.getElementById('tab-teachers').classList.toggle('active', which === 'teachers');
    document.getElementById('tab-admins').classList.toggle('active', which === 'admins');
  }

  function wireToggle(inputId, buttonId) {
    document.getElementById(buttonId).addEventListener('click', function () {
      var input = document.getElementById(inputId);
      var shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      this.textContent = shown ? 'Show' : 'Hide';
    });
  }

  document.getElementById('tab-students').addEventListener('click', function () { showView('students'); });
  document.getElementById('tab-teachers').addEventListener('click', function () {
    showView('teachers');
    loadTeachers().catch(function (e) { showError(e.message); });
  });
  document.getElementById('tab-admins').addEventListener('click', function () {
    showView('admins');
    loadAdmins().catch(function (e) { showError(e.message); });
  });

  function openForm(which) {
    document.getElementById('roster-home').style.display = 'none';
    document.getElementById('add-panel').style.display = which === 'student' ? 'block' : 'none';
    document.getElementById('teacher-panel').style.display = which === 'teacher' ? 'block' : 'none';
    document.getElementById('admin-panel').style.display = which === 'admin' ? 'block' : 'none';
    showError('');
  }

  function resetStudentForm() {
    editingStudent = '';
    document.getElementById('add-title').textContent = 'Add student';
    document.getElementById('btn-add').textContent = 'Create student account';
    document.getElementById('a-hint').textContent = studentHint;
    document.getElementById('a-id').readOnly = false;
    ['a-id', 'a-email', 'a-first', 'a-last', 'a-pw', 'a-pw2'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('a-college').value = '';
    fillSelect(document.getElementById('a-program'), [], 'Choose a college first');
    document.getElementById('a-year').value = '';
    document.getElementById('a-section').value = '';
  }

  function resetTeacherForm() {
    editingTeacher = '';
    document.getElementById('teacher-title').textContent = 'Add teacher';
    document.getElementById('btn-add-teacher').textContent = 'Create teacher account';
    document.getElementById('t-hint').textContent = teacherHint;
    document.getElementById('t-id').readOnly = false;
    ['t-id', 't-email', 't-first', 't-last', 't-dept', 't-subjects', 't-pw', 't-pw2'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('t-college').value = '';
  }

  function resetAdminForm() {
    editingAdmin = '';
    document.getElementById('admin-title').textContent = 'Add admin';
    document.getElementById('btn-add-admin').textContent = 'Create admin account';
    document.getElementById('m-hint').textContent = adminHint;
    document.getElementById('m-id').readOnly = false;
    ['m-id', 'm-email', 'm-first', 'm-last', 'm-pw', 'm-pw2'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    selectAdminType('Security');
  }

  function placeStudent(row) {
    var college = document.getElementById('a-college');
    college.value = row.college || '';
    var programs = programsFor(college.value);
    if (row.program && programs.indexOf(row.program) === -1) programs.push(row.program);
    fillSelect(document.getElementById('a-program'), programs, college.value ? 'Choose' : 'Choose a college first');
    document.getElementById('a-program').value = row.program || '';
    document.getElementById('a-year').value = row.year || '';
    document.getElementById('a-section').value = row.section || '';
  }

  function beginEditStudent(row) {
    resetStudentForm();
    editingStudent = row.id_number;
    document.getElementById('add-title').textContent = 'Edit student';
    document.getElementById('btn-add').textContent = 'Save changes';
    document.getElementById('a-hint').textContent = 'Leave the password blank to keep the current one. A new password is saved encrypted and is not shown again.';
    document.getElementById('a-id').value = row.id_number || '';
    document.getElementById('a-id').readOnly = true;
    document.getElementById('a-email').value = row.email || '';
    document.getElementById('a-first').value = row.first_name || '';
    document.getElementById('a-last').value = row.last_name || '';
    placeStudent(row);
    openForm('student');
  }

  function beginEditTeacher(row) {
    resetTeacherForm();
    editingTeacher = row.id;
    document.getElementById('teacher-title').textContent = 'Edit teacher';
    document.getElementById('btn-add-teacher').textContent = 'Save changes';
    document.getElementById('t-hint').textContent = 'Leave the password blank to keep the current one. A new password is saved encrypted and is not shown again.';
    document.getElementById('t-id').value = row.id || '';
    document.getElementById('t-id').readOnly = true;
    document.getElementById('t-email').value = row.email || '';
    document.getElementById('t-first').value = row.first_name || '';
    document.getElementById('t-last').value = row.last_name || '';
    document.getElementById('t-college').value = row.college || '';
    document.getElementById('t-dept').value = row.department || '';
    document.getElementById('t-subjects').value = row.subjects || '';
    showView('teachers');
    openForm('teacher');
  }

  function beginEditAdmin(row) {
    resetAdminForm();
    editingAdmin = row.id;
    document.getElementById('admin-title').textContent = 'Edit admin';
    document.getElementById('btn-add-admin').textContent = 'Save changes';
    document.getElementById('m-hint').textContent = 'Leave the password blank to keep the current one. A new password is saved encrypted and is not shown again.';
    document.getElementById('m-id').value = row.id || '';
    document.getElementById('m-id').readOnly = true;
    document.getElementById('m-email').value = row.email || '';
    document.getElementById('m-first').value = row.first_name || '';
    document.getElementById('m-last').value = row.last_name || '';
    var type = row.type && adminTypes.some(function (item) { return item.id === row.type; }) ? row.type : 'Security';
    selectAdminType(type);
    var on = [];
    Object.keys(row.permissions || {}).forEach(function (key) {
      if (row.permissions[key]) on.push(key);
    });
    setAdminPerms(on);
    showView('admins');
    openForm('admin');
  }

  function closeForm() {
    resetStudentForm();
    resetTeacherForm();
    resetAdminForm();
    document.getElementById('add-panel').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('roster-home').style.display = '';
  }

  document.getElementById('btn-show-add').addEventListener('click', function () {
    resetStudentForm();
    openForm('student');
  });
  document.getElementById('btn-show-teacher').addEventListener('click', function () {
    resetTeacherForm();
    openForm('teacher');
  });
  document.getElementById('btn-show-admin').addEventListener('click', function () {
    if (!isSuperadmin()) return;
    resetAdminForm();
    openForm('admin');
  });
  document.getElementById('btn-back-add').addEventListener('click', closeForm);
  document.getElementById('btn-back-teacher').addEventListener('click', closeForm);
  document.getElementById('btn-back-admin').addEventListener('click', function () {
    var wasEditing = editingAdmin;
    closeForm();
    showView('admins');
    if (wasEditing) loadAdmins().catch(function (e) { showError(e.message); });
  });

  document.getElementById('a-college').addEventListener('change', function () {
    fillSelect(document.getElementById('a-program'), programsFor(this.value), this.value ? 'Choose' : 'Choose a college first');
  });
  document.getElementById('f-college').addEventListener('change', function () {
    fillSelect(document.getElementById('f-program'), programsFor(this.value), 'All programs');
    page = 1;
    load().catch(function (e) { showError(e.message); });
  });
  ['f-program', 'f-year', 'f-section'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', function () {
      page = 1;
      load().catch(function (e) { showError(e.message); });
    });
  });
  document.getElementById('tf-college').addEventListener('change', function () {
    teacherPage = 1;
    loadTeachers().catch(function (e) { showError(e.message); });
  });
  document.getElementById('af-type').addEventListener('change', function () {
    adminPage = 1;
    loadAdmins().catch(function (e) { showError(e.message); });
  });

  document.getElementById('a-id').addEventListener('input', function () {
    this.value = String(this.value || '').replace(/\D/g, '').slice(0, 7);
  });

  function studentPayload() {
    return {
      id_number: editingStudent || document.getElementById('a-id').value.trim(),
      email: document.getElementById('a-email').value.trim(),
      first_name: document.getElementById('a-first').value.trim(),
      last_name: document.getElementById('a-last').value.trim(),
      college: document.getElementById('a-college').value,
      program: document.getElementById('a-program').value,
      year: document.getElementById('a-year').value,
      section: document.getElementById('a-section').value,
      password: document.getElementById('a-pw').value,
      confirm_password: document.getElementById('a-pw2').value
    };
  }

  document.getElementById('btn-add').addEventListener('click', async function () {
    showError('');
    var editing = editingStudent;
    var btn = document.getElementById('btn-add');
    var ok = false;
    if (typeof prismSetBusy === 'function') prismSetBusy(btn, true, editing ? 'Saving…' : 'Creating…');
    try {
      if (editing) await PrismRoster.update(studentPayload());
      else await PrismRoster.add(studentPayload());
      closeForm();
      if (!editing) page = 1;
      await load();
      ok = true;
    } catch (e) { showError(e.message); }
    finally {
      if (typeof prismSetBusy === 'function') prismSetBusy(btn, false);
      if (ok) btn.textContent = 'Create student account';
    }
  });

  function teacherPayload() {
    return {
      id: editingTeacher || document.getElementById('t-id').value.trim(),
      email: document.getElementById('t-email').value.trim(),
      first_name: document.getElementById('t-first').value.trim(),
      last_name: document.getElementById('t-last').value.trim(),
      college: document.getElementById('t-college').value,
      department: document.getElementById('t-dept').value.trim(),
      subjects: document.getElementById('t-subjects').value.trim(),
      password: document.getElementById('t-pw').value,
      confirm_password: document.getElementById('t-pw2').value
    };
  }

  document.getElementById('btn-add-teacher').addEventListener('click', async function () {
    showError('');
    var editing = editingTeacher;
    var btn = document.getElementById('btn-add-teacher');
    var ok = false;
    if (typeof prismSetBusy === 'function') prismSetBusy(btn, true, editing ? 'Saving…' : 'Creating…');
    try {
      if (editing) await PrismRoster.updateTeacher(teacherPayload());
      else await PrismRoster.addTeacher(teacherPayload());
      closeForm();
      showView('teachers');
      if (!editing) teacherPage = 1;
      await loadTeachers();
      ok = true;
    } catch (e) { showError(e.message); }
    finally {
      if (typeof prismSetBusy === 'function') prismSetBusy(btn, false);
      if (ok) btn.textContent = 'Create teacher account';
    }
  });

  function adminPayload() {
    return {
      id: editingAdmin || document.getElementById('m-id').value.trim(),
      email: document.getElementById('m-email').value.trim(),
      first_name: document.getElementById('m-first').value.trim(),
      last_name: document.getElementById('m-last').value.trim(),
      type: selectedAdminType,
      permissions: chosenAdminPerms(),
      password: document.getElementById('m-pw').value,
      confirm_password: document.getElementById('m-pw2').value
    };
  }

  document.getElementById('btn-add-admin').addEventListener('click', async function () {
    if (!isSuperadmin()) return;
    showError('');
    var editing = editingAdmin;
    var btn = document.getElementById('btn-add-admin');
    var ok = false;
    if (typeof prismSetBusy === 'function') prismSetBusy(btn, true, editing ? 'Saving…' : 'Creating…');
    try {
      if (editing) await PrismRoster.updateAdmin(adminPayload());
      else await PrismRoster.addAdmin(adminPayload());
      closeForm();
      showView('admins');
      if (!editing) adminPage = 1;
      await loadAdmins();
      ok = true;
    } catch (e) { showError(e.message); }
    finally {
      if (typeof prismSetBusy === 'function') prismSetBusy(btn, false);
      if (ok) btn.textContent = 'Create admin account';
    }
  });

  document.getElementById('csv-file').addEventListener('change', async function () {
    var file = this.files && this.files[0];
    if (!file) return;
    lastFile = file;
    showError('');
    try {
      var data = await PrismRoster.preview(file);
      renderPreview(data.rows || []);
    } catch (e) { showError(e.message); }
  });

  document.getElementById('btn-commit').addEventListener('click', async function () {
    if (!lastFile) return;
    showError('');
    try {
      var data = await PrismRoster.import(lastFile);
      renderPreview(data.rows || []);
      page = 1;
      await load();
    } catch (e) { showError(e.message); }
  });

  document.getElementById('btn-search').addEventListener('click', function () {
    page = 1;
    load().catch(function (e) { showError(e.message); });
  });
  document.getElementById('q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      page = 1;
      load().catch(function (err) { showError(err.message); });
    }
  });
  document.getElementById('btn-prev').addEventListener('click', function () {
    if (page > 1) { page--; load().catch(function (e) { showError(e.message); }); }
  });
  document.getElementById('btn-next').addEventListener('click', function () {
    if (page < pages) { page++; load().catch(function (e) { showError(e.message); }); }
  });
  document.getElementById('btn-teacher-search').addEventListener('click', function () {
    teacherPage = 1;
    loadTeachers().catch(function (e) { showError(e.message); });
  });
  document.getElementById('tq').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      teacherPage = 1;
      loadTeachers().catch(function (err) { showError(err.message); });
    }
  });
  document.getElementById('btn-tprev').addEventListener('click', function () {
    if (teacherPage > 1) { teacherPage--; loadTeachers().catch(function (e) { showError(e.message); }); }
  });
  document.getElementById('btn-tnext').addEventListener('click', function () {
    if (teacherPage < teacherPages) { teacherPage++; loadTeachers().catch(function (e) { showError(e.message); }); }
  });
  document.getElementById('btn-admin-search').addEventListener('click', function () {
    adminPage = 1;
    loadAdmins().catch(function (e) { showError(e.message); });
  });
  document.getElementById('aq').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      adminPage = 1;
      loadAdmins().catch(function (err) { showError(err.message); });
    }
  });
  document.getElementById('btn-aprev').addEventListener('click', function () {
    if (adminPage > 1) { adminPage--; loadAdmins().catch(function (e) { showError(e.message); }); }
  });
  document.getElementById('btn-anext').addEventListener('click', function () {
    if (adminPage < adminPages) { adminPage++; loadAdmins().catch(function (e) { showError(e.message); }); }
  });

  wireToggle('a-pw', 'a-pw-toggle');
  wireToggle('t-pw', 't-pw-toggle');
  wireToggle('m-pw', 'm-pw-toggle');

  document.addEventListener('DOMContentLoaded', function () {
    var open = '';
    try { open = new URLSearchParams(location.search).get('add') || ''; } catch (e) { open = ''; }
    var catalogReady = PrismRoster.catalog().then(function (data) {
      catalog.colleges = data.colleges || {};
      catalog.years = data.years || catalog.years;
      catalog.sections = data.sections || catalog.sections;
      applyCatalog();
    });
    var listReady = load();
    renderAdminChoices();
    if (!isSuperadmin()) document.getElementById('tab-admins').style.display = 'none';
    Promise.all([catalogReady, listReady]).then(function () {
      if (open === 'teacher') {
        showView('teachers');
        openForm('teacher');
      } else if (open === 'admin' && isSuperadmin()) {
        showView('admins');
        resetAdminForm();
        openForm('admin');
      } else if (open === 'student') {
        openForm('student');
      }
    }).catch(function (e) { showError(e.message); });
  });
})();
