/** Lesson plans for the signed-in teacher. */
var lessonClassId = '';
var lessonPicked = [];
var LESSON_FILE_MAX = 8;
var LESSON_PARTS = [
  ['objective', 'Learning objective'],
  ['assessments', 'Assessments'],
  ['key_points', 'Key points'],
  ['opening', 'Opening'],
  ['introduction', 'Introduction to new material'],
  ['guided', 'Guided practice'],
  ['independent', 'Independent practice'],
  ['closing', 'Closing'],
  ['extension', 'Extension activity'],
  ['homework', 'Homework'],
  ['standards', 'Standards aligned']
];

function lessonReadParts() {
  var parts = {};
  LESSON_PARTS.forEach(function (part) {
    var el = document.getElementById('lp-' + part[0]);
    parts[part[0]] = el ? el.value.trim() : '';
  });
  return parts;
}

function lessonPartsFromPlan(plan) {
  try {
    var data = JSON.parse(plan || '');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    var known = LESSON_PARTS.some(function (part) { return Object.prototype.hasOwnProperty.call(data, part[0]); });
    return known ? data : null;
  } catch (e) {
    return null;
  }
}

function lessonClearParts() {
  LESSON_PARTS.forEach(function (part) {
    var el = document.getElementById('lp-' + part[0]);
    if (el) el.value = '';
  });
}

function lessonEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lessonMsg(text, kind) {
  var el = document.getElementById('lp-msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'lp-msg' + (kind ? ' ' + kind : '');
}

function lessonFileLabel(file) {
  var name = String(file.file_name || 'File');
  var mime = String(file.mime_type || '');
  var path = String(file.file_path || '');
  var isImage = mime.indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
  var thumb = isImage && path ? '<img src="' + lessonEsc(path) + '" alt="">' : '';
  return '<a class="lesson-file" href="' + lessonEsc(path) + '" target="_blank" rel="noopener">' + thumb + lessonEsc(name) + '</a>';
}

function renderLessons(list) {
  var host = document.getElementById('lesson-list');
  if (!host) return;
  if (!list.length) {
    host.innerHTML = '<div class="empty-lessons">No lessons for this class yet.</div>';
    return;
  }
  host.innerHTML = list.map(function (lesson) {
    var date = lesson.lesson_date
      ? new Date(lesson.lesson_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'No date';
    var files = (lesson.files || []).map(lessonFileLabel).join('');
    var parts = lessonPartsFromPlan(lesson.plan);
    var plan = parts
      ? LESSON_PARTS.map(function (part) {
          var text = parts[part[0]];
          if (!text) return '';
          return '<section class="lp-block"><h4>' + lessonEsc(part[1]) + '</h4><p>' + lessonEsc(text) + '</p></section>';
        }).join('')
      : (lesson.plan ? '<p>' + lessonEsc(lesson.plan) + '</p>' : '');
    return '<article class="lesson">'
      + '<div class="lesson-top"><h3>' + lessonEsc(lesson.title) + '</h3>'
      + '<button type="button" class="lp-del" data-id="' + lessonEsc(lesson.id) + '">Remove</button></div>'
      + '<div class="lesson-meta">' + lessonEsc(date) + '</div>'
      + plan
      + (files ? '<div class="lesson-files">' + files + '</div>' : '')
      + '</article>';
  }).join('');
  host.querySelectorAll('.lp-del').forEach(function (btn) {
    btn.addEventListener('click', function () { deleteLesson(btn.getAttribute('data-id')); });
  });
}

async function loadLessons() {
  var host = document.getElementById('lesson-list');
  if (!lessonClassId) {
    if (host) host.innerHTML = '<div class="empty-lessons">Create a class first, then plan a lesson for it.</div>';
    return;
  }
  try {
    renderLessons(await PrismLessons.list(lessonClassId));
  } catch (e) {
    if (host) host.innerHTML = '<div class="empty-lessons">' + lessonEsc(e.message || 'Could not load lessons.') + '</div>';
  }
}

async function deleteLesson(id) {
  if (!id || !confirm('Remove this lesson and its files?')) return;
  try {
    await PrismLessons.remove(id);
    await loadLessons();
  } catch (e) {
    lessonMsg(e.message || 'Could not remove the lesson.', 'err');
  }
}

function lessonRenderPicked() {
  var host = document.getElementById('lp-file-names');
  if (!host) return;
  if (!lessonPicked.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = lessonPicked.map(function (file, i) {
    return '<span class="pf-chip">' + lessonEsc(file.name)
      + '<button type="button" data-i="' + i + '" aria-label="Remove file">&times;</button></span>';
  }).join('');
  host.querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      lessonPicked.splice(parseInt(btn.getAttribute('data-i'), 10), 1);
      lessonRenderPicked();
    });
  });
}

function lessonAddFiles(list) {
  var stopped = false;
  Array.prototype.forEach.call(list || [], function (file) {
    if (lessonPicked.length >= LESSON_FILE_MAX) {
      stopped = true;
      return;
    }
    var same = lessonPicked.some(function (have) {
      return have.name === file.name && have.size === file.size && have.lastModified === file.lastModified;
    });
    if (!same) lessonPicked.push(file);
  });
  if (stopped) lessonMsg('You can attach up to 8 files.', 'err');
  lessonRenderPicked();
}

async function saveLesson() {
  var title = document.getElementById('lp-title').value.trim();
  var btn = document.getElementById('lp-save');
  if (!lessonClassId) { lessonMsg('Choose a class first.', 'err'); return; }
  if (!title) { lessonMsg('Give the lesson a title.', 'err'); return; }
  var files = lessonPicked.slice();
  if (typeof prismSetBusy === 'function') prismSetBusy(btn, true, 'Saving…');
  else btn.disabled = true;
  lessonMsg('Saving…');
  try {
    await PrismLessons.save({
      class_id: lessonClassId,
      title: title,
      lesson_date: document.getElementById('lp-date').value,
      plan: JSON.stringify(lessonReadParts()),
      files: files
    });
    document.getElementById('lp-title').value = '';
    document.getElementById('lp-date').value = '';
    lessonClearParts();
    lessonPicked = [];
    lessonRenderPicked();
    lessonMsg('Lesson saved.', 'ok');
    await loadLessons();
  } catch (e) {
    lessonMsg(e.message || 'Could not save the lesson.', 'err');
  } finally {
    if (typeof prismSetBusy === 'function') prismSetBusy(btn, false);
    else btn.disabled = false;
  }
}

function fillClassSelect(classes) {
  var sel = document.getElementById('class-select');
  sel.innerHTML = '';
  if (!classes.length) {
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'No classes yet';
    sel.appendChild(empty);
    sel.disabled = true;
    lessonClassId = '';
    return;
  }
  sel.disabled = false;
  classes.forEach(function (cls) {
    var opt = document.createElement('option');
    opt.value = cls.id;
    opt.textContent = cls.subject || 'Class';
    sel.appendChild(opt);
  });
  var preferred = '';
  try {
    preferred = new URLSearchParams(location.search).get('class') || sessionStorage.getItem('prism_teacher_active_class_id') || '';
  } catch (e) {}
  if (preferred && classes.some(function (c) { return c.id === preferred; })) lessonClassId = preferred;
  else lessonClassId = classes[0].id;
  sel.value = lessonClassId;
  try { sessionStorage.setItem('prism_teacher_active_class_id', lessonClassId); } catch (e2) {}
  if (typeof markSidebarClassActive === 'function') markSidebarClassActive(lessonClassId);
}

document.addEventListener('DOMContentLoaded', async function () {
  var user = await prismAuthGuard(['teacher']);
  if (!user) return;
  if (typeof initSidebar === 'function') initSidebar('lesson');
  var fileInput = document.getElementById('lp-files');
  var clip = document.getElementById('lp-clip');
  fileInput.addEventListener('change', function () {
    lessonAddFiles(this.files);
    this.value = '';
  });
  if (clip) clip.addEventListener('click', function () { fileInput.click(); });
  document.getElementById('lp-save').addEventListener('click', saveLesson);
  document.getElementById('class-select').addEventListener('change', function () {
    lessonClassId = this.value;
    try { sessionStorage.setItem('prism_teacher_active_class_id', lessonClassId); } catch (e) {}
    if (typeof markSidebarClassActive === 'function') markSidebarClassActive(lessonClassId);
    loadLessons();
  });
  var classes = [];
  try { classes = await PrismClasses.getMyClasses(); } catch (e) { classes = []; }
  fillClassSelect(classes || []);
  await loadLessons();
});
