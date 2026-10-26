/** Admin roster page. Names from CSV are written with textContent. */
(function () {
  var page = 1;
  var pages = 1;
  var lastFile = null;
  var lastCodes = [];

  function showError(text) {
    var el = document.getElementById('page-error');
    el.style.display = text ? 'block' : 'none';
    el.textContent = text || '';
  }

  function badge(status) {
    var span = document.createElement('span');
    span.className = 'badge badge-' + status;
    var labels = { unclaimed: 'Unclaimed', claimed: 'Claimed', expired: 'Expired', revoked: 'Revoked' };
    span.textContent = labels[status] || status;
    return span;
  }

  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text == null ? '' : String(text);
    return td;
  }

  function showCode(code) {
    document.getElementById('code-value').textContent = code;
    document.getElementById('code-modal').style.display = 'block';
  }

  async function load() {
    showError('');
    var data = await PrismRoster.list(
      document.getElementById('q').value.trim(),
      document.getElementById('status').value,
      page
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
      tr.appendChild(cell((row.course || '') + ' ' + (row.year_level || '')));
      var statusTd = document.createElement('td');
      statusTd.appendChild(badge(row.status));
      tr.appendChild(statusTd);
      var actions = document.createElement('td');
      var wrap = document.createElement('div');
      wrap.className = 'row-actions';
      if (row.status === 'unclaimed' || row.status === 'expired') {
        wrap.appendChild(actionButton('New code', function () { regenerate(row.id_number); }));
      }
      if (row.status !== 'claimed') {
        wrap.appendChild(actionButton('Revoke', function () { revoke(row.id_number); }));
      }
      if (row.status === 'unclaimed' || row.status === 'expired' || row.status === 'revoked') {
        wrap.appendChild(actionButton('Delete', function () { remove(row.id_number); }));
      }
      actions.appendChild(wrap);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function actionButton(label, fn) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost';
    btn.textContent = label;
    btn.addEventListener('click', fn);
    return btn;
  }

  async function regenerate(id) {
    try {
      var data = await PrismRoster.regenerate(id);
      showCode(data.registration_code);
      await load();
    } catch (e) { showError(e.message); }
  }

  async function revoke(id) {
    if (!window.confirm('Revoke this unclaimed roster entry?')) return;
    try { await PrismRoster.revoke(id); await load(); } catch (e) { showError(e.message); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this roster entry? Claimed accounts are not removed.')) return;
    try { await PrismRoster.remove(id); await load(); } catch (e) { showError(e.message); }
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
      tr.appendChild(cell((row.course || '') + ' ' + (row.year_level || '')));
      tr.appendChild(cell(row.valid ? 'Ready' : (row.errors || []).join(' ')));
      body.appendChild(tr);
    });
    document.getElementById('preview-summary').textContent = valid + ' valid row(s). Invalid rows are highlighted and will be skipped.';
    document.getElementById('preview-wrap').style.display = 'block';
    document.getElementById('btn-download').style.display = 'none';
  }

  function csvSafe(value) {
    var text = String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    if (/[",\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function downloadCodes(codes) {
    var lines = ['id_number,email,registration_code'];
    (codes || []).forEach(function (row) {
      lines.push([csvSafe(row.id_number), csvSafe(row.email), csvSafe(row.registration_code)].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'registration-codes.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.getElementById('btn-show-add').addEventListener('click', function () {
    var panel = document.getElementById('add-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('btn-add').addEventListener('click', async function () {
    showError('');
    try {
      var data = await PrismRoster.add({
        id_number: document.getElementById('a-id').value.trim(),
        email: document.getElementById('a-email').value.trim(),
        first_name: document.getElementById('a-first').value.trim(),
        last_name: document.getElementById('a-last').value.trim(),
        course: document.getElementById('a-course').value.trim(),
        year_level: document.getElementById('a-year').value.trim()
      });
      showCode(data.registration_code);
      document.getElementById('add-panel').style.display = 'none';
      page = 1;
      await load();
    } catch (e) { showError(e.message); }
  });

  document.getElementById('btn-copy').addEventListener('click', async function () {
    var code = document.getElementById('code-value').textContent;
    try { await navigator.clipboard.writeText(code); } catch (e) { showError('Copy the code manually.'); }
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
      lastCodes = data.codes || [];
      document.getElementById('btn-download').style.display = lastCodes.length ? 'inline-flex' : 'none';
      if (lastCodes.length) downloadCodes(lastCodes);
      await load();
    } catch (e) { showError(e.message); }
  });

  document.getElementById('btn-download').addEventListener('click', function () { downloadCodes(lastCodes); });
  document.getElementById('btn-search').addEventListener('click', function () { page = 1; load().catch(function (e) { showError(e.message); }); });
  document.getElementById('btn-prev').addEventListener('click', function () { if (page > 1) { page--; load().catch(function (e) { showError(e.message); }); } });
  document.getElementById('btn-next').addEventListener('click', function () { if (page < pages) { page++; load().catch(function (e) { showError(e.message); }); } });

  document.addEventListener('DOMContentLoaded', function () {
    load().catch(function (e) { showError(e.message); });
  });
})();
