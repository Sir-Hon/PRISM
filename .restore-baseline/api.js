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

function prismFriendlyApiParseError(text) {
  const t = (text || '').trim();
  if (t.startsWith('<') || t.includes('<!DOCTYPE')) {
    return 'Server returned a web page instead of JSON — check the app URL matches your Prism folder (e.g. http://localhost/prism/).';
  }
  return t ? t.slice(0, 200) : 'Invalid response from server';
}

function prismApiRootPrefix() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin + (API_BASE.startsWith('/') ? API_BASE : '/' + API_BASE);
  }
  return API_BASE;
}

async function apiCall(endpoint, action, method = 'GET', body = null) {
  const url = `${prismApiRootPrefix()}/${endpoint}.php?action=${action}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  try {
    const res  = await fetch(url, opts);
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      throw new Error(prismFriendlyApiParseError(text));
    }
    if (data.error) throw new Error(data.error);
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  } catch (e) {
    console.error(`[PRISM API] ${endpoint}/${action}:`, e.message);
    throw e;
  }
}

async function apiGet(endpoint, action, params = {}) {
  let url = `${prismApiRootPrefix()}/${endpoint}.php?action=${action}`;
  for (const [k,v] of Object.entries(params)) url += `&${k}=${encodeURIComponent(v)}`;
  const res  = await fetch(url, { credentials: 'include' });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (parseErr) {
    throw new Error(prismFriendlyApiParseError(text));
  }
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

function prismOpenMaterialUrl(url, mime, fileName) {
  if (!url) return;
  let m = mime || '';
  let fn = fileName || '';
  let abs = url;
  if (/^https?:\/\//i.test(url)) {
    abs = url;
  } else if (url.charAt(0) === '/') {
    abs = window.location.origin + url;
  } else {
    try {
      abs = new URL(url, window.location.href).href;
    } catch (e) {
      abs = url;
    }
  }
  function guessMime(name) {
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp') return 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    if (ext === 'txt') return 'text/plain;charset=utf-8';
    if (ext === 'mp4') return 'video/mp4';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'ogg' || ext === 'ogv') return 'video/ogg';
    if (ext === 'mov') return 'video/quicktime';
    return '';
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
      if (!r.ok) throw new Error();
      return r.blob();
    })
    .then((blob) => {
      let type =
        m && String(m).trim() && m !== 'application/octet-stream'
          ? m
          : blob.type && blob.type !== 'application/octet-stream'
            ? blob.type
            : guessMime(fn);
      if (!type) type = blob.type || 'application/octet-stream';
      const b = new Blob([blob], { type });
      const u = URL.createObjectURL(b);
      const w = window.open(u, '_blank', 'noopener');
      if (!w) {
        URL.revokeObjectURL(u);
        alert('Pop-up blocked — allow pop-ups for this site to preview files.');
        return;
      }
      setTimeout(() => URL.revokeObjectURL(u), 180000);
    })
    .catch(() => {
      window.open(abs, '_blank', 'noopener');
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
  const ext = ((fileName || '').split('.').pop() || '').toLowerCase();
  if (['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'html', 'htm', 'mp4', 'webm', 'mov'].indexOf(ext) >= 0) return true;
  if (mime && /^image\//.test(mime)) return true;
  if (mime === 'application/pdf') return true;
  if (mime && /^text\//.test(mime)) return true;
  if (mime && /^video\/(mp4|webm|ogg|quicktime)/.test(mime)) return true;
  return false;
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
  async login(id, password, role) {
    const data = await apiCall('auth', 'login', 'POST', { id, password, role });
    sessionStorage.setItem('prism_logged_in', 'true');
    sessionStorage.setItem('prism_user_id',   data.id);
    sessionStorage.setItem('prism_user_name', data.name);
    sessionStorage.setItem('prism_role',      data.role);
    sessionStorage.setItem('prism_section',   data.section || '');
    prismCacheUserProfile({ id: data.id, name: data.name, avatar: data.avatar });
    return data;
  },

  async logout() {
    await apiCall('auth', 'logout', 'POST');
    sessionStorage.clear();
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

  async register(id, password, name, section) {
    return await apiCall('auth', 'register', 'POST', { id, password, name, section });
  },

  async registerTeacher(id, password, name, invite_code) {
    return await apiCall('auth', 'register_teacher', 'POST', { id, password, name, invite_code });
  },
};

// ══════════════════════════════════════════════════════
//  CLASSES
// ══════════════════════════════════════════════════════
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
  async getStudents(class_id) {
    const data = await apiGet('classes', 'students', { class_id });
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
    return await apiCall('content', 'add_material', 'POST', mat);
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
async function prismAuthGuard(allowedRoles = []) {
  try {
    const { loggedIn, user } = await PrismAuth.checkSession();
    if (!loggedIn) {
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
    window.location.replace('login.html');
    return null;
  }
}

(function prismSyncProfileCacheBeforeInit() {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  document.addEventListener(
    'DOMContentLoaded',
    function () {
      try {
        const url = prismApiRootPrefix() + '/auth.php?action=session';
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.withCredentials = true;
        xhr.send(null);
        if (xhr.status !== 200) return;
        const data = JSON.parse(xhr.responseText || '{}');
        if (data.loggedIn && data.user) prismCacheUserProfile(data.user);
      } catch (e) {
        /* ignore */
      }
    },
    false
  );
})();

console.log('[PRISM] api.js loaded — API base:', window.__PRISM_API_BASE__);