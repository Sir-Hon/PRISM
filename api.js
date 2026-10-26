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
  if (t.startsWith('<') || t.includes('<!DOCTYPE')) {
    return 'Server returned a web page instead of data. Wait a few seconds and refresh — the live site may still be starting.';
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

function prismFormatAssignmentDue(dateStr) {
  if (!dateStr) return '';
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
function prismCacheUserProfile(user) {
  if (!user || !user.id) return;
  let prev = {};
  try {
    prev = JSON.parse(localStorage.getItem('prism_profile_' + user.id) || '{}');
  } catch (e) { /* ignore */ }
  localStorage.setItem(
    'prism_profile_' + user.id,
    JSON.stringify({
      ...prev,
      name: user.name != null ? user.name : prev.name,
      avatar: user.avatar != null ? user.avatar : prev.avatar,
    })
  );
}

const PrismAuth = {
  async login(id, password, role, email) {
    const data = await apiCall('auth', 'login', 'POST', { id, password, role, email: email || '' });
    sessionStorage.setItem('prism_logged_in', 'true');
    sessionStorage.setItem('prism_user_id',   data.id);
    sessionStorage.setItem('prism_user_name', data.name);
    sessionStorage.setItem('prism_role',      data.role);
    sessionStorage.setItem('prism_section',   data.section || '');
    prismCacheUserProfile({ id: data.id, name: data.name, avatar: data.avatar });
    return data;
  },

  async logout() {
    try {
      await apiCall('auth', 'logout', 'POST');
    } catch (e) { /* still leave the page */ }
    try { sessionStorage.clear(); } catch (e2) { /* ignore */ }
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
  async listTeachers(q, college, page) {
    return await apiGet('roster', 'teacher_list', { q: q || '', college: college || '', page: page || 1 });
  },
  async addTeacher(row) {
    return await apiCall('roster', 'teacher_add', 'POST', row);
  },
  async removeTeacher(id) {
    return await apiCall('roster', 'teacher_delete', 'POST', { id: id });
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
  async delete(class_id) {
    return await apiCall('classes', 'delete', 'DELETE', { class_id });
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
  async listCors() {
    const data = await apiGet('records', 'cors');
    return data.cors || [];
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
  async getAnnouncements() {
    const data = await apiGet('profile', 'get_announcements');
    return data.announcements || [];
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

console.log('[PRISM] api.js loaded — API base:', window.__PRISM_API_BASE__);