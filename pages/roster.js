/** Admin roster: students by college, program, year, and section, plus teachers. */
(function () {
  var page = 1;
  var pages = 1;
  var teacherPage = 1;
  var teacherPages = 1;
  var lastFile = null;
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

  function groupRow(text, span) {
    var tr = document.createElement('tr');
    tr.className = 'group-row';
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
    var lastKey = '';
    (data.rows || []).forEach(function (row) {
      var key = [row.college, row.program, row.year, row.section].join('|');
      if (key !== lastKey) {
        body.appendChild(groupRow(
          collegeLabel(row.college) + ' · ' + (row.program || '—') + ' · Year ' + (row.year || '—') + ' · Section ' + (row.section || '—'),
          9
        ));
        lastKey = key;
      }
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
      actions.appendChild(actionButton('Delete', function () { removeStudent(row.id_number); }));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    if (!(data.rows || []).length) {
      body.appendChild(groupRow('No students in this category.', 9));
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
    var lastKey = '';
    (data.rows || []).forEach(function (row) {
      var key = (row.college || '') + '|' + (row.department || '');
      if (key !== lastKey) {
        body.appendChild(groupRow(collegeLabel(row.college) + ' · ' + (row.department || 'No department'), 8));
        lastKey = key;
      }
      var tr = document.createElement('tr');
      tr.appendChild(cell(row.id));
      tr.appendChild(cell((row.first_name || '') + ' ' + (row.last_name || '')));
      tr.appendChild(cell(row.email));
      tr.appendChild(cell(row.college || ''));
      tr.appendChild(cell(row.department || ''));
      tr.appendChild(cell(row.subjects || ''));
      tr.appendChild(passwordCell());
      var actions = document.createElement('td');
      actions.appendChild(actionButton('Delete', function () { removeTeacher(row.id); }));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    if (!(data.rows || []).length) {
      body.appendChild(groupRow('No teachers in this category.', 8));
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
    document.getElementById('student-view').style.display = which === 'students' ? '' : 'none';
    document.getElementById('teacher-view').style.display = which === 'teachers' ? '' : 'none';
    document.getElementById('tab-students').classList.toggle('active', which === 'students');
    document.getElementById('tab-teachers').classList.toggle('active', which === 'teachers');
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

  function openForm(which) {
    document.getElementById('roster-home').style.display = 'none';
    document.getElementById('add-panel').style.display = which === 'student' ? 'block' : 'none';
    document.getElementById('teacher-panel').style.display = which === 'teacher' ? 'block' : 'none';
    showError('');
  }

  function closeForm() {
    document.getElementById('add-panel').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('roster-home').style.display = '';
  }

  document.getElementById('btn-show-add').addEventListener('click', function () { openForm('student'); });
  document.getElementById('btn-show-teacher').addEventListener('click', function () { openForm('teacher'); });
  document.getElementById('btn-back-add').addEventListener('click', closeForm);
  document.getElementById('btn-back-teacher').addEventListener('click', closeForm);

  document.getElementById('a-college').addEventListener('change', function () {
    fillSelect(document.getElementById('a-program'), programsFor(this.value), this.value ? 'Choose' : 'Choose a college first');
  });
  document.getElementById('f-college').addEventListener('change', function () {
    fillSelect(document.getElementById('f-program'), programsFor(this.value), 'All programs');
  });

  document.getElementById('a-id').addEventListener('input', function () {
    this.value = String(this.value || '').replace(/\D/g, '').slice(0, 7);
  });

  document.getElementById('btn-add').addEventListener('click', async function () {
    showError('');
    try {
      await PrismRoster.add({
        id_number: document.getElementById('a-id').value.trim(),
        email: document.getElementById('a-email').value.trim(),
        first_name: document.getElementById('a-first').value.trim(),
        last_name: document.getElementById('a-last').value.trim(),
        college: document.getElementById('a-college').value,
        program: document.getElementById('a-program').value,
        year: document.getElementById('a-year').value,
        section: document.getElementById('a-section').value,
        password: document.getElementById('a-pw').value,
        confirm_password: document.getElementById('a-pw2').value
      });
      ['a-id', 'a-email', 'a-first', 'a-last', 'a-pw', 'a-pw2'].forEach(function (id) {
        document.getElementById(id).value = '';
      });
      closeForm();
      page = 1;
      await load();
    } catch (e) { showError(e.message); }
  });

  document.getElementById('btn-add-teacher').addEventListener('click', async function () {
    showError('');
    try {
      await PrismRoster.addTeacher({
        id: document.getElementById('t-id').value.trim(),
        email: document.getElementById('t-email').value.trim(),
        first_name: document.getElementById('t-first').value.trim(),
        last_name: document.getElementById('t-last').value.trim(),
        college: document.getElementById('t-college').value,
        department: document.getElementById('t-dept').value.trim(),
        subjects: document.getElementById('t-subjects').value.trim(),
        password: document.getElementById('t-pw').value,
        confirm_password: document.getElementById('t-pw2').value
      });
      ['t-id', 't-email', 't-first', 't-last', 't-dept', 't-subjects', 't-pw', 't-pw2'].forEach(function (id) {
        document.getElementById(id).value = '';
      });
      closeForm();
      teacherPage = 1;
      await loadTeachers();
    } catch (e) { showError(e.message); }
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
  document.getElementById('btn-tprev').addEventListener('click', function () {
    if (teacherPage > 1) { teacherPage--; loadTeachers().catch(function (e) { showError(e.message); }); }
  });
  document.getElementById('btn-tnext').addEventListener('click', function () {
    if (teacherPage < teacherPages) { teacherPage++; loadTeachers().catch(function (e) { showError(e.message); }); }
  });

  wireToggle('a-pw', 'a-pw-toggle');
  wireToggle('t-pw', 't-pw-toggle');

  document.addEventListener('DOMContentLoaded', function () {
    var open = '';
    try { open = new URLSearchParams(location.search).get('add') || ''; } catch (e) { open = ''; }
    PrismRoster.catalog().then(function (data) {
      catalog.colleges = data.colleges || {};
      catalog.years = data.years || catalog.years;
      catalog.sections = data.sections || catalog.sections;
      applyCatalog();
      if (open === 'teacher') {
        showView('teachers');
        openForm('teacher');
      } else if (open === 'student') {
        openForm('student');
      }
      return load();
    }).catch(function (e) { showError(e.message); });
  });
})();
