/**
 * ═══════════════════════════════════════════════════════
 *  PRISM PORTAL — api.js
 *  Drop-in replacement for localStorage.
 *  Include this BEFORE any other scripts on every page.
 *
 *  Place at: htdocs/prism/api.js
 * ═══════════════════════════════════════════════════════
 */

(function prismResolveApiBase() {
  // On Railway (not localhost), API is at /api directly
  if (window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1') {
    window.__PRISM_API_BASE__ = '/api';
    return;
  }

  // Local XAMPP — detect from script path
  let base = '';
  try {
    const cur = document.currentScript;
    if (cur && cur.src) {
      const path = new URL(cur.src, window.location.href).pathname;
      const cut = path.lastIndexOf('/api.js');
      if (cut !== -1) base = path.slice(0, cut) + '/api';
    }
  } catch (e) { /* ignore */ }

  if (!base) {
    try {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i].getAttribute('src');
        if (!src || src.indexOf('api.js') === -1) continue;
        const path = new URL(src, window.location.href).pathname;
        const cut = path.lastIndexOf('/api.js');
        if (cut !== -1) {
          base = path.slice(0, cut) + '/api';
          break;
        }
      }
    } catch (e2) { /* ignore */ }
  }

  if (!base) {
    let p = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    const last = p.split('/').pop() || '';
    if (/\.[a-z0-9]+$/i.test(last)) {
      p = p.replace(/\/[^/]+$/, '');
    }
    if (!p || p === '/') p = '';
    base = (p ? p : '') + '/api';
  }

  window.__PRISM_API_BASE__ = base;
})();

const API_BASE = window.__PRISM_API_BASE__;

var PRISM_PORTAL_ROLES = { student: 'student', faculty: 'teacher', registry: 'admin' };
function prismPortalSlug() {
  var host = (window.location.hostname || '').toLowerCase();
  var label = host.split('.')[0];
  if (PRISM_PORTAL_ROLES[label]) return label;
  var path = window.location.pathname || '';
  var match = path.match(/\/(student|faculty|registry)(\/|$)/);
  if (match) return match[1];
  return 'student';
}
function prismPortalRole() {
  return PRISM_PORTAL_ROLES[prismPortalSlug()] || 'student';
}
function prismRememberOn() {
  try { return localStorage.getItem('prism_remember') === '1'; } catch (e) { return false; }
}
function prismRememberChoose(on) {
  try {
    if (on) localStorage.setItem('prism_remember', '1');
    else localStorage.removeItem('prism_remember');
    localStorage.removeItem('prism_return');
  } catch (e) { /* ignore */ }
}
function prismRememberClear() {
  prismRememberChoose(false);
}
function prismRoleHomePage() {
  var role = prismPortalRole();
  if (role === 'teacher') return 'teacher.html';
  if (role === 'admin') return 'admin.html';
  return 'index.html';
}
function prismRememberTarget() {
  return '';
}
function prismRememberSaveHere() {}
function prismNoteLeave() {
  try { sessionStorage.setItem('prism_left_at', String(Date.now())); } catch (e) { /* ignore */ }
  prismReleaseTab();
}
function prismTabId() {
  try {
    var id = sessionStorage.getItem('prism_tab_id');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('prism_tab_id', id);
    }
    return id;
  } catch (e) { return ''; }
}
function prismReadTabs() {
  try {
    var map = JSON.parse(localStorage.getItem('prism_open_tabs') || '{}');
    return map && typeof map === 'object' ? map : {};
  } catch (e) { return {}; }
}
function prismTouchTab() {
  var id = prismTabId();
  if (!id) return;
  var map = prismReadTabs();
  var now = Date.now();
  Object.keys(map).forEach(function (key) {
    if (now - (parseInt(map[key], 10) || 0) > 20000) delete map[key];
  });
  map[id] = now;
  try { localStorage.setItem('prism_open_tabs', JSON.stringify(map)); } catch (e) { /* ignore */ }
}
function prismReleaseTab() {
  var id = '';
  try { id = sessionStorage.getItem('prism_tab_id') || ''; } catch (e) { return; }
  if (!id) return;
  var map = prismReadTabs();
  delete map[id];
  try { localStorage.setItem('prism_open_tabs', JSON.stringify(map)); } catch (e2) { /* ignore */ }
}
function prismAnotherTabOpen() {
  var mine = '';
  try { mine = sessionStorage.getItem('prism_tab_id') || ''; } catch (e) {}
  var map = prismReadTabs();
  var now = Date.now();
  return Object.keys(map).some(function (key) {
    return key !== mine && (now - (parseInt(map[key], 10) || 0)) < 20000;
  });
}
function prismVisitIsLive() {
  var on = false;
  var left = 0;
  try {
    on = sessionStorage.getItem('prism_tab_on') === '1';
    left = parseInt(sessionStorage.getItem('prism_left_at') || '0', 10) || 0;
  } catch (e) { return false; }
  if (!on) return false;
  if (!left) return true;
  return (Date.now() - left) < 60000;
}
function prismMarkVisit() {
  try {
    sessionStorage.setItem('prism_tab_on', '1');
    sessionStorage.removeItem('prism_left_at');
  } catch (e) { /* ignore */ }
  prismTouchTab();
  if (window.__prismLeaveWatch) return;
  window.__prismLeaveWatch = true;
  window.__prismTabPulse = setInterval(prismTouchTab, 8000);
  window.addEventListener('pagehide', prismNoteLeave);
  window.addEventListener('pageshow', prismTouchTab);
}
function prismStoreAdminAccess(data) {
  var role = data && data.role ? data.role : '';
  if (role !== 'admin') {
    try {
      sessionStorage.removeItem('prism_admin_perms');
      sessionStorage.removeItem('prism_superadmin');
    } catch (e) { /* ignore */ }
    return;
  }
  try {
    sessionStorage.setItem('prism_admin_perms', JSON.stringify(data.permissions || {}));
    sessionStorage.setItem('prism_superadmin', data.superadmin ? '1' : '0');
  } catch (e2) { /* ignore */ }
}
function prismAdminCan(perm) {
  var role = sessionStorage.getItem('prism_role') || '';
  if (role !== 'admin') return true;
  if (sessionStorage.getItem('prism_superadmin') === '1') return true;
  try {
    var perms = JSON.parse(sessionStorage.getItem('prism_admin_perms') || '{}');
    if (!perms || !Object.keys(perms).length) return true;
    return !!perms[perm];
  } catch (e) {
    return true;
  }
}

/** CTU Daanbantayan student ID: exactly 7 digits. */
function prismIsCtuStudentId(id) {
  return /^[0-9]{7}$/.test(String(id || '').trim());
}

/** CTU institutional email (Google Workspace), e.g. name.surname@ctu.edu.ph */
function prismIsCtuEmail(email) {
  return /^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@ctu\.edu\.ph$/.test(String(email || '').trim().toLowerCase());
}

let __prismCsrf = '';
let __prismCsrfSynced = false;
try {
  __prismCsrf = sessionStorage.getItem('prism_csrf') || '';
} catch (e) {
  __prismCsrf = '';
}

function prismRememberCsrf(token) {
  if (!token) return;
  __prismCsrf = String(token);
  __prismCsrfSynced = true;
  try { sessionStorage.setItem('prism_csrf', __prismCsrf); } catch (e) { /* ignore */ }
}

function prismCsrfHeaders() {
  const h = {};
  if (__prismCsrf) h['X-CSRF-Token'] = __prismCsrf;
  return h;
}

function prismFriendlyApiParseError(text) {
  const t = (text || '').trim();
  if (/content-length|post_max_size|upload_max_filesize|exceeds the limit|allowed memory size/i.test(t)) {
    return 'That file is too large for the server. Keep it under 15 MB, or paste a link instead.';
  }
  if (t.startsWith('<') || t.includes('<!DOCTYPE') || t.includes('<b>')) {
    return 'The server could not accept that. If a file was attached, use one under 15 MB or paste a link, then try again.';
  }
  return t ? t.slice(0, 200) : 'Invalid response from server';
}

function prismApiRootPrefix() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin + (API_BASE.startsWith('/') ? API_BASE : '/' + API_BASE);
  }
  return API_BASE;
}

function prismIsSessionExpiredError(err) {
  const m = err && err.message ? String(err.message) : '';
  return /session expired/i.test(m);
}

async function prismRefreshCsrf() {
  try {
    const res = await fetch(prismApiRootPrefix() + '/auth.php?action=session', {
      credentials: 'include',
      headers: prismCsrfHeaders(),
    });
    const data = await res.json();
    if (data && data.csrf_token) prismRememberCsrf(data.csrf_token);
    return data;
  } catch (e) {
    return null;
  }
}

async function prismEnsureCsrf() {
  if (__prismCsrfSynced && __prismCsrf) return;
  await prismRefreshCsrf();
}

function prismFormWithCsrf(formData) {
  const fd = new FormData();
  if (__prismCsrf) fd.append('csrf_token', __prismCsrf);
  if (!formData || typeof formData.forEach !== 'function') return fd;
  formData.forEach(function (value, key) {
    if (key === 'csrf_token') return;
    if (value instanceof File) fd.append(key, value, value.name);
    else fd.append(key, value);
  });
  return fd;
}

async function apiCall(endpoint, action, method = 'GET', body = null, _retried) {
  if (method && method !== 'GET') await prismEnsureCsrf();
  const url = `${prismApiRootPrefix()}/${endpoint}.php?action=${action}`;
  const payload = body && typeof body === 'object' ? Object.assign({}, body) : body;
  if (payload && method !== 'GET' && __prismCsrf && payload.csrf_token == null) {
    payload.csrf_token = __prismCsrf;
  }
  const opts = {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, prismCsrfHeaders()),
    credentials: 'include',
  };
  if (payload && method !== 'GET') opts.body = JSON.stringify(payload);
  try {
    const res  = await fetch(url, opts);
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      throw new Error(prismFriendlyApiParseError(text));
    }
    if (data.csrf_token) prismRememberCsrf(data.csrf_token);
    if (data.error) throw new Error(data.error);
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  } catch (e) {
    if (!_retried && method !== 'GET' && prismIsSessionExpiredError(e)) {
      __prismCsrfSynced = false;
      await prismRefreshCsrf();
      return apiCall(endpoint, action, method, body, true);
    }
    console.error(`[PRISM API] ${endpoint}/${action}:`, e.message);
    throw e;
  }
}

async function apiGet(endpoint, action, params = {}) {
  let url = `${prismApiRootPrefix()}/${endpoint}.php?action=${action}`;
  for (const [k,v] of Object.entries(params)) url += `&${k}=${encodeURIComponent(v)}`;
  const res  = await fetch(url, { credentials: 'include', headers: prismCsrfHeaders() });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (parseErr) {
    throw new Error(prismFriendlyApiParseError(text));
  }
  if (data.csrf_token) prismRememberCsrf(data.csrf_token);
  if (data.error) throw new Error(data.error);
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function prismDueEndMs(dateStr, timeStr) {
  if (!dateStr) return null;
  let t = timeStr != null && String(timeStr).trim() !== '' ? String(timeStr).trim() : '23:59:59';
  if (t && /^\d{1,2}:\d{2}:\d{2}/.test(t)) t = t.slice(0, 8);
  if (/^\d{2}:\d{2}$/.test(t)) t += ':00';
  const ms = new Date(dateStr + 'T' + t).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function prismIsPastDue(dateStr, timeStr) {
  const end = prismDueEndMs(dateStr, timeStr);
  if (end === null) return false;
  return Date.now() > end;
}

function prismFormatDueLine(dateStr, timeStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const ds = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  let tRaw = timeStr != null && String(timeStr).trim() !== '' ? String(timeStr).trim() : '';
  if (tRaw && /^\d{1,2}:\d{2}:\d{2}/.test(tRaw)) tRaw = tRaw.slice(0, 8);
  if (!tRaw) return ds + ' · end of day';
  const m = tRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return ds + ' · ' + tRaw;
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const am = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return ds + ' · ' + h12 + ':' + mm + ' ' + am;
}

function prismFormatAssignmentDue(dateStr, timeStr) {
  if (!dateStr) return '';
  var t = timeStr != null ? String(timeStr).trim() : '';
  if (t) return prismFormatDueLine(dateStr, t);
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function prismTeacherClassLabel(c) {
  if (!c) return '';
  return String(c.subject || '').trim() || 'Class';
}

const PRISM_MAX_FILE_BYTES = 15 * 1024 * 1024;
const PRISM_UPLOAD_EXTS = [
  'pdf', 'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'txt',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
  'mp4', 'webm', 'mov', 'ogg', 'ogv', 'zip',
];

function prismFileExt(name) {
  return (String(name || '').split('.').pop() || '').toLowerCase();
}

function prismGuessMimeFromName(name) {
  const ext = prismFileExt(name);
  const map = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    txt: 'text/plain;charset=utf-8',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    ogv: 'video/ogg',
    mov: 'video/quicktime',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
  };
  return map[ext] || '';
}

function prismAllowedUploadExt(name) {
  return PRISM_UPLOAD_EXTS.indexOf(prismFileExt(name)) >= 0;
}

function prismNormalizeHttpUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (/^(javascript|data|file|vbscript):/i.test(s)) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch (e) {
    return '';
  }
}

function prismExtractFirstUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/i);
  if (!m) return '';
  return prismNormalizeHttpUrl(m[0]);
}

function prismLinkifyHtml(text) {
  const esc = typeof prismEscHtml === 'function' ? prismEscHtml(text) : String(text || '');
  return esc.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, function (raw) {
    const href = prismNormalizeHttpUrl(raw.replace(/&amp;/g, '&'));
    if (!href) return raw;
    const attr = typeof prismEscAttr === 'function' ? prismEscAttr(href) : href;
    return '<a href="' + attr + '" target="_blank" rel="noopener">' + raw + '</a>';
  });
}

function prismMaterialHttpUrl(it) {
  if (!it || !it.url) return '';
  const s = String(it.url).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || /^www\./i.test(s)) return prismNormalizeHttpUrl(s);
  return '';
}

function prismMaterialKind(mime, fileName, type) {
  const t = String(type || '').toLowerCase();
  if (t === 'video') return 'video';
  if (t === 'link') return 'link';
  const m = String(mime || '').toLowerCase();
  const ext = prismFileExt(fileName);
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.indexOf('image/') === 0 || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].indexOf(ext) >= 0) return 'image';
  if (m.indexOf('video/') === 0 || ['mp4', 'webm', 'mov', 'ogg', 'ogv'].indexOf(ext) >= 0) return 'video-file';
  if (['ppt', 'pptx'].indexOf(ext) >= 0 || m.indexOf('powerpoint') >= 0 || m.indexOf('presentation') >= 0) return 'ppt';
  return 'file';
}

function prismMaterialIcon(kind) {
  const icons = {
    pdf: 'PDF',
    image: 'IMG',
    'video-file': 'VID',
    video: 'VID',
    ppt: 'PPT',
    link: 'URL',
    file: 'FILE',
  };
  return icons[kind] || 'FILE';
}

function prismMaterialKindLabel(kind) {
  const labels = {
    pdf: 'PDF',
    image: 'Image',
    'video-file': 'Video',
    video: 'Video link',
    ppt: 'Presentation',
    link: 'Link',
    file: 'File',
  };
  return labels[kind] || 'File';
}

function prismOpenMaterialUrl(url, mime, fileName) {
  if (!url) return;
  let m = mime || '';
  let fn = fileName || '';
  let abs = typeof prismResolveUploadUrl === 'function' ? prismResolveUploadUrl(url) : url;
  if (!abs) abs = url;
  if (!/^https?:\/\//i.test(abs) && abs.indexOf('data:') !== 0) {
    if (abs.charAt(0) === '/') {
      abs = (window.location.origin || '') + abs;
    } else {
      try {
        abs = new URL(abs, window.location.href).href;
      } catch (e) {
        abs = url;
      }
    }
  }
  try {
    const absUrl = new URL(abs, window.location.href);
    if (absUrl.origin !== window.location.origin && /^https?:$/i.test(absUrl.protocol)) {
      window.open(absUrl.href, '_blank', 'noopener');
      return;
    }
  } catch (e) { /* fall through to fetch */ }
  fetch(abs, { credentials: 'same-origin' })
    .then((r) => {
      if (!r.ok) throw new Error('missing');
      return r.blob();
    })
    .then((blob) => {
      let type =
        m && String(m).trim() && m !== 'application/octet-stream'
          ? m
          : blob.type && blob.type !== 'application/octet-stream'
            ? blob.type
            : prismGuessMimeFromName(fn);
      if (!type) type = blob.type || 'application/octet-stream';
      const b = new Blob([blob], { type });
      const u = URL.createObjectURL(b);
      const preview = typeof prismCanPreviewInBrowser === 'function' && prismCanPreviewInBrowser(type, fn);
      if (!preview) {
        const a = document.createElement('a');
        a.href = u;
        a.download = fn || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 2000);
        return;
      }
      const w = window.open(u, '_blank', 'noopener');
      if (!w) {
        URL.revokeObjectURL(u);
        alert('Pop-up blocked — allow pop-ups for this site to preview files.');
        return;
      }
      setTimeout(() => URL.revokeObjectURL(u), 180000);
    })
    .catch(() => {
      alert('This file could not be opened. Ask your teacher to share it again.');
    });
}

function prismVideoEmbedFromUrl(pageUrl) {
  if (!pageUrl || typeof pageUrl !== 'string') return null;
  const s = pageUrl.trim();
  let m;
  if ((m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/))) {
    return { type: 'youtube', embed: 'https://www.youtube.com/embed/' + m[1] };
  }
  if ((m = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/))) {
    return { type: 'youtube', embed: 'https://www.youtube.com/embed/' + m[1] };
  }
  if ((m = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/))) {
    return { type: 'youtube', embed: 'https://www.youtube.com/embed/' + m[1] };
  }
  if ((m = s.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/))) {
    return { type: 'youtube', embed: 'https://www.youtube.com/embed/' + m[1] };
  }
  if ((m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
    return { type: 'vimeo', embed: 'https://player.vimeo.com/video/' + m[1] };
  }
  return null;
}

function prismCanPreviewInBrowser(mime, fileName) {
  const ext = prismFileExt(fileName);
  if (['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'txt', 'html', 'htm', 'mp4', 'webm', 'mov', 'ogg', 'ogv'].indexOf(ext) >= 0) return true;
  if (mime && /^image\//.test(mime)) return true;
  if (mime === 'application/pdf') return true;
  if (mime && /^text\//.test(mime)) return true;
  if (mime && /^video\/(mp4|webm|ogg|quicktime)/.test(mime)) return true;
  return false;
}

function prismEscAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function prismEscHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function prismAppRootPrefix() {
  if (typeof API_BASE === 'string' && API_BASE) {
    return String(API_BASE).replace(/\/api\/?$/, '');
  }
  return '';
}

/** Turn a stored upload path into a URL that works whether Prism is at /prism or site root. */
function prismResolveUploadUrl(path) {
  if (!path) return '';
  let s = String(path);
  if (s.indexOf('data:') === 0) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const abs = new URL(s, window.location.href);
      if (abs.pathname.indexOf('/uploads/') !== -1) {
        s = abs.pathname;
      } else {
        return s;
      }
    } catch (e) {
      return s;
    }
  }
  const root = prismAppRootPrefix();
  if (s.indexOf('/prism/uploads/') === 0) {
    s = '/uploads/' + s.slice('/prism/uploads/'.length);
  } else if (s.indexOf('uploads/') === 0) {
    s = '/' + s;
  }
  const uploadAt = s.indexOf('/uploads/');
  if (uploadAt !== -1) {
    const stored = s.slice(uploadAt);
    const api = (typeof API_BASE === 'string' && API_BASE) ? API_BASE.replace(/\/$/, '') : ((root || '') + '/api');
    return (window.location.origin || '') + api + '/file.php?path=' + encodeURIComponent(stored);
  }
  if (s.charAt(0) === '/') return (window.location.origin || '') + s;
  try {
    return new URL(s, window.location.href).href;
  } catch (e) {
    return s;
  }
}

function prismSafeAvatarUrl(avatar) {
  const s = String(avatar || '');
  if (s.indexOf('data:image/') === 0) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.charAt(0) === '/' || s.indexOf('uploads/') === 0) return prismResolveUploadUrl(s);
  return '';
}

function prismRosterAvatarHtml(person, sizePx) {
  const size = sizePx || 30;
  const name = String((person && (person.name || person.id)) || '?');
  const initial = name.charAt(0).toUpperCase();
  const src = prismSafeAvatarUrl(person && person.avatar);
  const box = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;flex-shrink:0;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;';
  if (src) {
    return '<span class="student-avatar" style="' + box + 'padding:0;background:#e5e7eb;"><img src="' + prismEscAttr(src) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"/></span>';
  }
  return '<span class="student-avatar" style="' + box + '">' + prismEscHtml(initial) + '</span>';
}

function prismMapStudentRow(s) {
  return {
    id: s && s.id,
    name: (s && s.name) || '',
    section: (s && s.section) || '',
    avatar: (s && s.avatar) || '',
  };
}

async function apiForm(endpoint, action, formData, _retried) {
  await prismEnsureCsrf();
  const payload = prismFormWithCsrf(formData);
  const url = `${prismApiRootPrefix()}/${endpoint}.php?action=${action}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: prismCsrfHeaders(),
      body: payload,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      throw new Error(prismFriendlyApiParseError(text));
    }
    if (data.csrf_token) prismRememberCsrf(data.csrf_token);
    if (data.error) throw new Error(data.error);
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  } catch (e) {
    if (!_retried && prismIsSessionExpiredError(e)) {
      __prismCsrfSynced = false;
      await prismRefreshCsrf();
      return apiForm(endpoint, action, formData, true);
    }
    console.error(`[PRISM API] ${endpoint}/${action}:`, e.message);
    throw e;
  }
}

// ══════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════
function prismPaintTopbarAvatar(profile) {
  const tb = document.getElementById('topbar-avatar');
  if (!tb) return;
  const name = (profile && profile.name) || sessionStorage.getItem('prism_user_name') || '';
  const initial = String(name || 'U').charAt(0).toUpperCase();
  const src = typeof prismSafeAvatarUrl === 'function' ? prismSafeAvatarUrl(profile && profile.avatar) : '';
  if (src) {
    tb.innerHTML = '<img src="' + prismEscAttr(src) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" alt=""/>';
    return;
  }
  tb.textContent = initial;
}

function prismCacheUserProfile(user) {
  if (!user || !user.id) return;
  let prev = {};
  try {
    prev = JSON.parse(localStorage.getItem('prism_profile_' + user.id) || '{}');
  } catch (e) { /* ignore */ }
  const next = Object.assign({}, prev);
  if (user.name != null) next.name = user.name;
  if (Object.prototype.hasOwnProperty.call(user, 'avatar')) {
    const incoming = user.avatar || '';
    if (user.avatarPending) {
      next.avatar = incoming || prev.avatar || '';
      next.avatarPending = true;
    } else if (prev.avatarPending && prev.avatar && prev.avatar !== incoming) {
      next.avatar = prev.avatar;
      next.avatarPending = true;
    } else {
      next.avatar = incoming;
      next.avatarPending = false;
    }
  }
  try {
    localStorage.setItem('prism_profile_' + user.id, JSON.stringify(next));
  } catch (e) { /* keep the previous photo if this one cannot be stored */ }
  prismPaintTopbarAvatar(next);
}

const PrismAuth = {
  async login(id, password, role, email, remember) {
    const data = await apiCall('auth', 'login', 'POST', { id, password, role, email: email || '', remember: !!remember });
    sessionStorage.setItem('prism_logged_in', 'true');
    sessionStorage.setItem('prism_user_id',   data.id);
    sessionStorage.setItem('prism_user_name', data.name);
    sessionStorage.setItem('prism_role',      data.role);
    sessionStorage.setItem('prism_section',   data.section || '');
    prismStoreAdminAccess(data);
    prismCacheUserProfile({ id: data.id, name: data.name, avatar: data.avatar });
    return data;
  },

  async logout() {
    try {
      await apiCall('auth', 'logout', 'POST');
    } catch (e) { /* still leave the page */ }
    try { sessionStorage.clear(); } catch (e2) { /* ignore */ }
    if (typeof prismRememberClear === 'function') prismRememberClear();
    window.location.href = 'login.html';
  },

  async checkSession() {
    const data = await apiGet('auth', 'session');
    if (data.loggedIn && data.user) {
      sessionStorage.setItem('prism_logged_in', 'true');
      sessionStorage.setItem('prism_user_id',   data.user.id);
      sessionStorage.setItem('prism_user_name', data.user.name);
      sessionStorage.setItem('prism_role',      data.user.role);
      sessionStorage.setItem('prism_section',   data.user.section || '');
      prismStoreAdminAccess(data.user);
      prismCacheUserProfile(data.user);
    }
    return data;
  },

};

// ══════════════════════════════════════════════════════
//  CLASSES
// ══════════════════════════════════════════════════════
const PrismRoster = {
  async catalog() {
    return await apiGet('roster', 'catalog');
  },
  async list(q, status, page, filters) {
    filters = filters || {};
    return await apiGet('roster', 'list', {
      q: q || '',
      status: status || '',
      page: page || 1,
      college: filters.college || '',
      program: filters.program || '',
      year: filters.year || '',
      section: filters.section || ''
    });
  },
  async add(row) {
    return await apiCall('roster', 'add', 'POST', row);
  },
  async update(row) {
    return await apiCall('roster', 'update', 'POST', row);
  },
  async listTeachers(q, college, page) {
    return await apiGet('roster', 'teacher_list', { q: q || '', college: college || '', page: page || 1 });
  },
  async addTeacher(row) {
    return await apiCall('roster', 'teacher_add', 'POST', row);
  },
  async updateTeacher(row) {
    return await apiCall('roster', 'teacher_update', 'POST', row);
  },
  async removeTeacher(id) {
    return await apiCall('roster', 'teacher_delete', 'POST', { id: id });
  },
  async listAdmins(q, type, page) {
    return await apiGet('roster', 'admin_list', { q: q || '', type: type || '', page: page || 1 });
  },
  async addAdmin(row) {
    return await apiCall('roster', 'admin_add', 'POST', row);
  },
  async updateAdmin(row) {
    return await apiCall('roster', 'admin_update', 'POST', row);
  },
  async removeAdmin(id) {
    return await apiCall('roster', 'admin_delete', 'POST', { id: id });
  },
  async preview(file) {
    const fd = new FormData();
    fd.append('file', file);
    return await apiForm('roster', 'preview', fd);
  },
  async import(file) {
    const fd = new FormData();
    fd.append('file', file);
    return await apiForm('roster', 'import', fd);
  },
  async regenerate(idNumber) {
    return await apiCall('roster', 'regenerate', 'POST', { id_number: idNumber });
  },
  async revoke(idNumber) {
    return await apiCall('roster', 'revoke', 'POST', { id_number: idNumber });
  },
  async remove(idNumber) {
    return await apiCall('roster', 'delete', 'POST', { id_number: idNumber });
  },
};

const PrismClasses = {
  async getMyClasses() {
    const data = await apiGet('classes', 'mine');
    return data.classes || [];
  },
  async create(subject, color) {
    return await apiCall('classes', 'create', 'POST', { subject, color });
  },
  async join(code) {
    return await apiCall('classes', 'join', 'POST', { code });
  },
  async leave(class_id) {
    return await apiCall('classes', 'leave', 'POST', { class_id });
  },
  async getStudents(class_id, opts) {
    const params = { class_id };
    if (opts && opts.avatars) params.avatars = '1';
    const data = await apiGet('classes', 'students', params);
    return data.students || [];
  },
  async getMembers(class_id) {
    const data = await apiGet('classes', 'students', { class_id: class_id, avatars: '1' });
    return {
      teacher: data.teacher || null,
      students: data.students || [],
    };
  },
  async delete(class_id) {
    return await apiCall('classes', 'delete', 'DELETE', { class_id });
  },
  async style(class_id, look) {
    look = look || {};
    return await apiCall('classes', 'style', 'POST', {
      class_id: class_id,
      color: look.color || '',
      cover: look.cover || '',
    });
  },
};

// ══════════════════════════════════════════════════════
//  POSTS
// ══════════════════════════════════════════════════════
const PrismPosts = {
  async get(class_id) {
    const data = await apiGet('content', 'get_posts', { class_id });
    return data.posts || [];
  },
  async add(post) {
    return await apiCall('content', 'add_post', 'POST', post);
  },
  async delete(id) {
    return await apiCall('content', 'delete_post', 'POST', { id });
  },
};

// ══════════════════════════════════════════════════════
//  MATERIALS
// ══════════════════════════════════════════════════════
const PrismMaterials = {
  async get(class_id) {
    const data = await apiGet('content', 'get_materials', { class_id });
    return data.materials || [];
  },
  async add(mat) {
    const files = [];
    if (mat && Array.isArray(mat.files)) {
      mat.files.forEach(function (f) { if (f instanceof File) files.push(f); });
    }
    if (mat && mat.file instanceof File) files.push(mat.file);
    const urls = [];
    if (mat && Array.isArray(mat.urls)) {
      mat.urls.forEach(function (u) { if (u) urls.push(String(u)); });
    } else if (mat && mat.url) {
      urls.push(String(mat.url));
    }
    if (files.length) {
      const fd = new FormData();
      fd.append('class_id', mat.class_id || '');
      fd.append('title', mat.title || '');
      fd.append('type', mat.type || 'file');
      fd.append('url', urls[0] || '');
      fd.append('urls', JSON.stringify(urls));
      fd.append('desc', mat.desc || '');
      if (mat.target_section != null && mat.target_section !== '') {
        fd.append('target_section', mat.target_section);
      }
      files.forEach(function (f) { fd.append('files[]', f, f.name); });
      return await apiForm('content', 'add_material', fd);
    }
    const payload = Object.assign({}, mat || {});
    delete payload.file;
    delete payload.files;
    payload.urls = urls;
    payload.url = urls[0] || '';
    return await apiCall('content', 'add_material', 'POST', payload);
  },
  async delete(id) {
    return await apiCall('content', 'delete_material', 'POST', { id });
  },
};

// ══════════════════════════════════════════════════════
//  ASSIGNMENTS
// ══════════════════════════════════════════════════════
const PrismAssignments = {
  async get(class_id) {
    const data = await apiGet('content', 'get_assignments', { class_id });
    return data.assignments || [];
  },
  async add(asgn) {
    if (asgn && asgn.file instanceof File) {
      const fd = new FormData();
      fd.append('class_id', asgn.class_id || '');
      fd.append('title', asgn.title || '');
      fd.append('type', asgn.type || 'written');
      fd.append('instructions', asgn.instructions || '');
      fd.append('pts', asgn.pts != null ? String(asgn.pts) : '0');
      if (asgn.due) fd.append('due', asgn.due);
      if (asgn.due_time) fd.append('due_time', asgn.due_time);
      if (asgn.target_section != null && asgn.target_section !== '') {
        fd.append('target_section', asgn.target_section);
      }
      if (asgn.attach_url) fd.append('attach_url', asgn.attach_url);
      fd.append('file', asgn.file, asgn.file.name);
      return await apiForm('content', 'add_assignment', fd);
    }
    return await apiCall('content', 'add_assignment', 'POST', asgn);
  },
  async delete(id) {
    return await apiCall('content', 'delete_assignment', 'POST', { id });
  },
};

// ══════════════════════════════════════════════════════
//  SUBMISSIONS
// ══════════════════════════════════════════════════════
const PrismSubmissions = {
  async getAll(assignment_id) {
    const data = await apiGet('content', 'get_submissions', { assignment_id });
    return data.submissions || [];
  },
  async getMine(assignment_id, class_id) {
    const data = await apiGet('content', 'get_my_submission', { assignment_id, class_id });
    return data.submission;
  },
  async getMineForClass(class_id) {
    const data = await apiGet('content', 'get_my_submissions', { class_id });
    return data.submissions || [];
  },
  async submit(submission) {
    const files = submission && Array.isArray(submission.files)
      ? submission.files.filter(function (f) { return f instanceof File; })
      : (submission && submission.file instanceof File ? [submission.file] : []);
    if (files.length) {
      const fd = new FormData();
      fd.append('assignment_id', submission.assignment_id || '');
      fd.append('class_id', submission.class_id || '');
      fd.append('note', submission.note || '');
      fd.append('link_url', submission.link_url || '');
      files.forEach(function (f) {
        fd.append('files[]', f, f.name);
      });
      return await apiForm('content', 'submit', fd);
    }
    return await apiCall('content', 'submit', 'POST', submission);
  },
};

if (typeof window !== 'undefined') {
  window.PrismSubmissions = PrismSubmissions;
  window.PrismAssignments = PrismAssignments;
}

// ══════════════════════════════════════════════════════
//  QUIZZES
// ══════════════════════════════════════════════════════
const PrismNotebooks = {
  async get() {
    const data = await apiGet('notebooks', 'get');
    return data.notebooks || [];
  },
  async save(notebooks) {
    return await apiCall('notebooks', 'save', 'POST', { notebooks: notebooks || [] });
  },
};

const PrismQuizzes = {
  async get(class_id) {
    const data = await apiGet('quizzes', 'get', { class_id });
    return data.quizzes || [];
  },
  async getMine() {
    const data = await apiGet('quizzes', 'get_mine');
    return data.quizzes || [];
  },
  async save(quiz) {
    return await apiCall('quizzes', 'save', 'POST', quiz);
  },
  async uploadImage(file) {
    const fd = new FormData();
    fd.append('image', file, file.name);
    return await apiForm('quizzes', 'upload_image', fd);
  },
  async delete(id) {
    return await apiCall('quizzes', 'delete', 'DELETE', { id });
  },
  async getScores(quiz_id) {
    const data = await apiGet('quizzes', 'get_scores', { quiz_id });
    return data.scores || data.score;
  },
  async getMyScores() {
    const data = await apiGet('quizzes', 'get_my_scores');
    return data.scores || {};
  },
  async submitScore(quiz_id, score, answers) {
    return await apiCall('quizzes', 'submit_score', 'POST', { quiz_id, score, answers });
  },
  async reviewScore(quiz_id, student_id, item_scores) {
    return await apiCall('quizzes', 'review_score', 'POST', { quiz_id, student_id, item_scores });
  },
  async log(quiz_id, type, detail) {
    return await apiCall('quizzes', 'log', 'POST', { quiz_id, type, detail });
  },
  async getLog(quiz_id) {
    const data = await apiGet('quizzes', 'get_log', { quiz_id });
    return data.log || [];
  },
};

// ══════════════════════════════════════════════════════
//  RECORDS
// ══════════════════════════════════════════════════════
const PrismRecords = {
  async get(class_id, session_date = '') {
    const data = await apiGet('content', 'get_records', { class_id, session_date });
    return data.records || [];
  },
  async getSessionDates(class_id) {
    const data = await apiGet('content', 'get_session_dates', { class_id });
    return data.dates || [];
  },
  async save(record) {
    return await apiCall('content', 'save_record', 'POST', record);
  },
  async myStatus() {
    const data = await apiGet('records', 'my_status');
    return data.records || [];
  },
  async getSheet(classId, studentId, kind) {
    return await apiGet('records', 'sheet', { class_id: classId, student_id: studentId, kind: kind });
  },
  async saveSheet(classId, studentId, kind, payload) {
    return await apiCall('records', 'save_sheet', 'POST', {
      class_id: classId,
      student_id: studentId,
      kind: kind,
      payload: payload,
    });
  },
  async listCors(filters) {
    filters = filters || {};
    const data = await apiGet('records', 'cors', {
      school_year: filters.school_year || '',
      semester: filters.semester || '',
      q: filters.q || ''
    });
    return { cors: data.cors || [], years: data.years || [], capped: !!data.capped };
  },
  async getCor(id) {
    const data = await apiGet('records', 'cor', { id: id });
    return data.cor;
  },
  async sendCor(body) {
    return await apiCall('records', 'send_cor', 'POST', body);
  },
};

const PrismLessons = {
  async list(classId) {
    const data = await apiGet('lessons', 'list', { class_id: classId });
    return data.lessons || [];
  },
  async save(fields) {
    const fd = new FormData();
    fd.append('class_id', fields.class_id || '');
    fd.append('title', fields.title || '');
    fd.append('lesson_date', fields.lesson_date || '');
    fd.append('plan', fields.plan || '');
    (fields.files || []).forEach(function (file) {
      if (file instanceof File) fd.append('files[]', file, file.name);
    });
    return await apiForm('lessons', 'save', fd);
  },
  async remove(id) {
    return await apiCall('lessons', 'delete', 'POST', { id: id });
  },
};

// ══════════════════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════════════════
const PrismProfile = {
  async get(user_id = '') {
    const data = await apiGet('profile', 'get', user_id ? { user_id } : {});
    return data.profile;
  },
  async save(profile) {
    return await apiCall('profile', 'save', 'POST', profile);
  },
  async changePassword(old_password, new_password) {
    return await apiCall('profile', 'change_password', 'POST', { old_password, new_password });
  },
};

// ══════════════════════════════════════════════════════
//  EVENTS
// ══════════════════════════════════════════════════════
const PrismEvents = {
  async get() {
    const data = await apiGet('profile', 'get_events');
    return data.events || [];
  },
  async save(event) {
    return await apiCall('profile', 'save_event', 'POST', event);
  },
  async delete(id) {
    return await apiCall('profile', 'delete_event', 'DELETE', { id });
  },
};

// ══════════════════════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════════════════════
const PrismAdmin = {
  async getAllUsers() {
    const data = await apiGet('profile', 'get_all_users');
    return data.users || [];
  },
  async deleteUser(id) {
    return await apiCall('profile', 'delete_user', 'POST', { id });
  },
  async getInviteCodes() {
    const data = await apiGet('profile', 'get_invite_codes');
    return data.codes || [];
  },
  async createInvite() {
    return await apiCall('profile', 'create_invite', 'POST');
  },
  async deleteInvite(code) {
    return await apiCall('profile', 'delete_invite', 'POST', { code });
  },
  async setUserEmail(id, email) {
    return await apiCall('profile', 'set_user_email', 'POST', { id, email });
  },
  async getAnnouncements(opts) {
    opts = opts || {};
    const data = await apiGet('profile', 'get_announcements', opts.manage ? { manage: '1' } : {});
    return data.announcements || [];
  },
  async setAdminPerms(id, permissions) {
    return await apiCall('profile', 'set_admin_perms', 'POST', { id, permissions });
  },
  async addAnnouncement(ann) {
    return await apiCall('profile', 'add_announcement', 'POST', ann);
  },
};

// ══════════════════════════════════════════════════════
//  AUTH GUARD
// ══════════════════════════════════════════════════════
let __prismAuthPromise = null;

function prismCachedSessionUser() {
  const id = sessionStorage.getItem('prism_user_id') || '';
  const role = sessionStorage.getItem('prism_role') || '';
  if (!id || !role) return null;
  return {
    id: id,
    name: sessionStorage.getItem('prism_user_name') || id,
    role: role,
    section: sessionStorage.getItem('prism_section') || '',
  };
}

async function prismAuthGuard(allowedRoles = []) {
  try {
    if (!__prismAuthPromise) {
      __prismAuthPromise = PrismAuth.checkSession();
    }
    let data;
    try {
      data = await __prismAuthPromise;
    } catch (e) {
      __prismAuthPromise = null;
      try {
        __prismAuthPromise = PrismAuth.checkSession();
        data = await __prismAuthPromise;
      } catch (e2) {
        const cached = prismCachedSessionUser();
        if (cached) return cached;
        window.location.replace('login.html');
        return null;
      }
    }
    const loggedIn = data && data.loggedIn;
    const user = data && data.user;
    if (!loggedIn || !user) {
      window.location.replace('login.html');
      return null;
    }
    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
      const home = user.role === 'teacher' ? 'teacher.html' : user.role === 'admin' ? 'admin.html' : 'index.html';
      window.location.replace(home);
      return null;
    }
    return user;
  } catch (e) {
    __prismAuthPromise = null;
    const cached = prismCachedSessionUser();
    if (cached) return cached;
    window.location.replace('login.html');
    return null;
  }
}

var PRISM_BANNER_COLORS = ['#1e1b2e','#064e3b','#0f766e','#0d9488','#1d4ed8','#7c3aed','#be123c','#9a3412','#1e293b','#0e7490'];
var __prismBannerPop = null;

function prismBannerKey(scope) {
  var uid = '';
  try { uid = sessionStorage.getItem('prism_user_id') || ''; } catch (e) { uid = ''; }
  return 'prism_banner_' + (uid || 'local') + '_' + String(scope || 'greet').replace(/[^A-Za-z0-9_-]/g, '');
}

function prismBannerRead(scope) {
  try {
    var raw = localStorage.getItem(prismBannerKey(scope));
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    var color = /^#[0-9a-fA-F]{6}$/.test(data.color || '') ? data.color : '';
    var image = typeof data.image === 'string' && data.image.indexOf('data:image/') === 0 ? data.image : '';
    if (!color && !image) return null;
    return { color: color, image: image };
  } catch (e) { return null; }
}

var __prismBannerServer = {};
var __prismBannerGen = {};

function prismBannerWrite(scope, data, skipServer) {
  var key = prismBannerKey(scope);
  if (!skipServer) __prismBannerGen[scope] = (__prismBannerGen[scope] || 0) + 1;
  try {
    if (!data || (!data.color && !data.image)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ color: data.color || '', image: data.image || '' }));
  } catch (e) { /* this browser may refuse a large photo; the account copy still saves */ }
  if (skipServer) return;
  __prismBannerServer[scope] = data && (data.color || data.image) ? { color: data.color || '', image: data.image || '' } : null;
  prismBannerServerPut(scope, data);
}

function prismBannerServerPut(scope, data) {
  var color = data && data.color ? data.color : '';
  var image = data && data.image ? data.image : '';
  return apiCall('profile', 'save_banner', 'POST', { scope: scope, color: color, image: image }).catch(function () {
    return null;
  });
}

function prismBannerServerGet(scope) {
  var cached = __prismBannerServer[scope];
  if (cached && cached.__promise) return cached.__promise;
  if (cached && cached.__pending !== true && (cached.color || cached.image)) return Promise.resolve(cached);
  var gen = __prismBannerGen[scope] || 0;
  var promise = apiGet('profile', 'banner', { scope: scope }).then(function (res) {
    var banner = res && res.banner;
    var saved = banner && (banner.color || banner.image) ? { color: banner.color || '', image: banner.image || '' } : null;
    if ((__prismBannerGen[scope] || 0) !== gen) {
      var newer = __prismBannerServer[scope];
      return newer && (newer.color || newer.image) ? newer : saved;
    }
    __prismBannerServer[scope] = saved;
    if (saved) prismBannerWrite(scope, saved, true);
    return saved;
  }).catch(function () {
    if ((__prismBannerGen[scope] || 0) === gen) __prismBannerServer[scope] = null;
    return null;
  });
  __prismBannerServer[scope] = { __pending: true, __promise: promise };
  return promise;
}

function prismCoverKey(id) {
  return 'prism_cover_' + String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
}

function prismCoverRecall(id) {
  try {
    var cover = localStorage.getItem(prismCoverKey(id)) || '';
    return cover.indexOf('data:image/') === 0 ? cover : '';
  } catch (e) {
    return '';
  }
}

function prismCoverRemember(id, cover) {
  try {
    if (cover && String(cover).indexOf('data:image/') === 0) localStorage.setItem(prismCoverKey(id), cover);
    else localStorage.removeItem(prismCoverKey(id));
  } catch (e) {
    try { localStorage.removeItem(prismCoverKey(id)); } catch (err) {}
  }
}

function prismCoversWarm(urls) {
  return Promise.all((urls || []).map(function (src) {
    if (!src || String(src).indexOf('data:image/') !== 0) return Promise.resolve();
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = img.onerror = function () { resolve(); };
      img.src = src;
    });
  }));
}

function prismBannerApply(el, saved) {
  if (!el) return;
  if (el.dataset.bannerReady !== '1') {
    el.dataset.bannerReady = '1';
    el.dataset.bannerDefault = el.style.background || '';
  }
  el.style.backgroundSize = '';
  el.style.backgroundPosition = '';
  if (!saved || (!saved.color && !saved.image)) {
    el.style.background = el.dataset.bannerDefault || '';
    return;
  }
  var color = saved.color || '#1e1b2e';
  if (saved.image) {
    var safe = String(saved.image).replace(/["\\()]/g, '');
    el.style.backgroundColor = color;
    el.style.backgroundImage = 'linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.45)),url("' + safe + '")';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat = 'no-repeat';
    return;
  }
  el.style.background = color;
}

function prismBannerClose() {
  document.querySelectorAll('.banner-open').forEach(function (node) { node.classList.remove('banner-open'); });
  if (__prismBannerPop) {
    __prismBannerPop.remove();
    __prismBannerPop = null;
  }
}

function prismBannerEncode(file, done) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    done(new Error('Use a JPG, PNG, or WebP photo.'));
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    done(new Error('Choose a photo under 8 MB.'));
    return;
  }
  var reader = new FileReader();
  reader.onerror = function () { done(new Error('Could not read that photo.')); };
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      var max = 1100;
      var w = img.width;
      var h = img.height;
      if (w > max) { h = Math.round(h * max / w); w = max; }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      var url = canvas.toDataURL('image/jpeg', 0.72);
      if (url.length > 900000) url = canvas.toDataURL('image/jpeg', 0.5);
      if (url.length > 1200000) { done(new Error('That photo is too large to save.')); return; }
      done(null, url);
    };
    img.onerror = function () { done(new Error('Could not read that photo.')); };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function prismBannerOpen(wrap, el, scope, opts) {
  prismBannerClose();
  opts = opts || {};
  var saved = opts.saved || prismBannerRead(scope) || { color: '', image: '' };
  var pop = document.createElement('div');
  pop.className = 'banner-pop';
  pop.addEventListener('click', function (ev) { ev.stopPropagation(); });
  var label = document.createElement('div');
  label.className = 'banner-pop-label';
  label.textContent = opts.onSave ? 'Card color' : 'Banner color';
  pop.appendChild(label);
  var row = document.createElement('div');
  row.className = 'banner-swatches';
  function prismBannerCommit(next) {
    if (typeof opts.onSave === 'function') {
      var note = pop.querySelector('.banner-pop-msg');
      if (note) note.textContent = 'Saving…';
      Promise.resolve(opts.onSave(next)).then(function () {
        prismBannerClose();
      }).catch(function (err) {
        if (note) note.textContent = (err && err.message) ? err.message : 'Could not save that look.';
      });
      return;
    }
    prismBannerApply(el, next && (next.color || next.image) ? next : null);
    prismBannerWrite(scope, next && (next.color || next.image) ? next : null);
    prismBannerClose();
  }
  PRISM_BANNER_COLORS.forEach(function (hex) {
    var swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'banner-swatch' + (saved.color === hex && (opts.onSave || !saved.image) ? ' selected' : '');
    swatch.style.background = hex;
    swatch.title = hex;
    swatch.addEventListener('click', function () {
      var keep = (opts.onSave && saved.image) ? saved.image : '';
      prismBannerCommit({ color: hex, image: keep });
    });
    row.appendChild(swatch);
  });
  pop.appendChild(row);
  var upload = document.createElement('label');
  upload.className = 'banner-upload';
  upload.textContent = 'Use a photo';
  var file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/jpeg,image/png,image/webp';
  file.hidden = true;
  file.addEventListener('change', function () {
    var chosen = file.files && file.files[0];
    var msg = pop.querySelector('.banner-pop-msg');
    prismBannerEncode(chosen, function (err, url) {
      if (err) { if (msg) msg.textContent = err.message; return; }
      var prev = opts.saved || prismBannerRead(scope) || __prismBannerServer[scope] || {};
      if (prev && prev.__pending) prev = {};
      var next = { color: prev.color || saved.color || '#1e1b2e', image: url };
      prismBannerCommit(next);
    });
  });
  upload.appendChild(file);
  pop.appendChild(upload);
  var reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'banner-reset';
  reset.textContent = opts.onSave ? 'Remove photo' : 'Use default';
  reset.addEventListener('click', function () {
    prismBannerCommit(null);
  });
  pop.appendChild(reset);
  var msg = document.createElement('div');
  msg.className = 'banner-pop-msg';
  pop.appendChild(msg);
  wrap.appendChild(pop);
  el.classList.add('banner-open');
  __prismBannerPop = pop;
}

function prismBannerMount(el, scope, opts) {
  if (!el) return;
  opts = opts || {};
  if (opts.saved) prismBannerApply(el, opts.saved);
  else {
    var local = prismBannerRead(scope);
    if (local) prismBannerApply(el, local);
    prismBannerServerGet(scope).then(function (remote) {
      if (!el.isConnected) return;
      if (remote) {
        prismBannerApply(el, remote);
        return;
      }
      if (local) prismBannerServerPut(scope, local);
    });
  }
  if (el.querySelector('.banner-custom')) return;
  var wrap = document.createElement('div');
  wrap.className = 'banner-custom';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'banner-custom-btn';
  btn.setAttribute('aria-label', 'Customize');
  btn.title = 'Customize';
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  [
    'm14.622 17.897-10.68-2.913',
    'M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z',
    'M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15'
  ].forEach(function (d) {
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  });
  btn.appendChild(svg);
  btn.addEventListener('click', function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (wrap.querySelector('.banner-pop')) prismBannerClose();
    else prismBannerOpen(wrap, el, scope, opts);
  });
  wrap.appendChild(btn);
  el.appendChild(wrap);
}

document.addEventListener('click', function () { prismBannerClose(); });

console.log('[PRISM] api.js loaded — API base:', window.__PRISM_API_BASE__);