/** Page script for quizmaker.html — keep HTML in the .html file. */
var TEACHER_ID = sessionStorage.getItem('prism_user_id') || 'teacher';
const CLASS_COLORS = ['#7c3aed','#0d9488','#d97706','#2563eb','#be123c','#15803d','#0284c7','#9333ea','#dc2626','#d97706'];
function getClasses()    { return JSON.parse(localStorage.getItem('prism_classes_'+TEACHER_ID)||'[]'); }
function getQuizzes()    { return JSON.parse(localStorage.getItem('prism_teacher_quizzes')||'[]'); }
function saveQuizzes(q)  { localStorage.setItem('prism_teacher_quizzes', JSON.stringify(q)); }
function qmQuizBelongsToClass(q, classId) {
  return String(q.classId || q.class_id || '') === String(classId);
}
/** Map API row to local quiz shape (same as student home cache). */
function mapApiQuizRowToLocal(q, classId) {
  var qs = q.questions;
  if (typeof qs === 'string') { try { qs = JSON.parse(qs || '[]'); } catch (e) { qs = []; } }
  var ts = q.target_section != null ? String(q.target_section).trim() : '';
  return {
    id: q.id,
    classId: q.class_id || classId,
    teacherId: q.teacher_id,
    title: q.title,
    type: q.type || 'quiz',
    published: !!+q.published,
    due: q.due_date || q.due || '',
    due_time: q.due_time || '',
    time: parseInt(q.time_limit, 10) || 0,
    attempts: parseInt(q.attempts, 10) || 1,
    totalPoints: parseInt(q.total_points, 10) || 0,
    questions: qs || [],
    target_section: ts,
    allowSkip: !!(+q.allow_skip || q.allowSkip),
  };
}
/** Drop server-deleted quizzes from cache and merge API rows; keep local-only drafts. */
async function syncQuizzesFromApiForClass(classId) {
  if (!classId || !TEACHER_ID) return;
  try {
    var list = await PrismQuizzes.get(classId);
    var apiIds = new Set((list || []).map(function (r) { return String(r.id); }));
    var mapped = (list || []).map(function (q) { return mapApiQuizRowToLocal(q, classId); });
    var all = getQuizzes();
    var otherClasses = all.filter(function (q) { return !qmQuizBelongsToClass(q, classId); });
    var localSame = all.filter(function (q) { return qmQuizBelongsToClass(q, classId); });
    var keepLocal = localSame.filter(function (q) {
      if (apiIds.has(String(q.id))) return false;
      if (!q.published) return true;
      return false;
    });
    saveQuizzes(otherClasses.concat(mapped).concat(keepLocal));
  } catch (e) {
    console.warn('syncQuizzesFromApiForClass', e);
  }
}
function getPosts()      { return JSON.parse(localStorage.getItem('prism_teacher_posts')||'[]'); }
function savePosts(p)    { localStorage.setItem('prism_teacher_posts', JSON.stringify(p)); }

var activeClassId = null;
var activeQmTargetSection = '__all__';
/** __all__ or quiz id — saved list filter (per class in sessionStorage) */
var qmQuizViewFilter = '__all__';
var CLASSES = [];
var questions = [];
var editingQuizId = null;

function qmUniqueSections(classId) {
  try {
    var raw = localStorage.getItem('prism_students_' + classId) || '[]';
    var studs = JSON.parse(raw);
    var set = {};
    (studs || []).forEach(function(s) {
      var sec = (s.section || '').trim();
      if (sec) set[sec] = true;
    });
    return Object.keys(set).sort();
  } catch (e) { return []; }
}
function qmLoadTargetSection(classId) {
  try {
    var v = sessionStorage.getItem('prism_qm_target_section_' + classId);
    var secs = qmUniqueSections(classId);
    if (v == null || v === '' || v === '__all__') { activeQmTargetSection = '__all__'; return; }
    if (secs.indexOf(v) >= 0) { activeQmTargetSection = v; return; }
  } catch (e) { /* ignore */ }
  activeQmTargetSection = '__all__';
}
function qmGetTargetSectionForApi() {
  if (activeQmTargetSection === '__all__') return null;
  return activeQmTargetSection;
}
function qmItemMatchesSection(it) {
  var t = (it && it.target_section != null) ? String(it.target_section).trim() : '';
  if (activeQmTargetSection === '__all__') return true;
  if (!t) return true;
  return t === activeQmTargetSection;
}
function renderQmSectionPills() {
  var wrap = document.getElementById('qm-section-pills-wrap');
  if (!wrap || !activeClassId) return;
  var secs = qmUniqueSections(activeClassId);
  if (activeQmTargetSection !== '__all__' && secs.indexOf(activeQmTargetSection) < 0) {
    secs = secs.concat([activeQmTargetSection]).sort();
  }
  wrap.style.display = 'block';
  var html = '<div style="font-size:.72rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.45rem;">Filter by section</div><div class="section-pills">';
  html += '<button type="button" class="section-pill' + (activeQmTargetSection === '__all__' ? ' active' : '') + '" data-sec="__all__">All Sections</button>';
  secs.forEach(function(sec) {
    var esc = String(sec).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    html += '<button type="button" class="section-pill' + (activeQmTargetSection === sec ? ' active' : '') + '" data-sec="' + esc + '">' + esc + '</button>';
  });
  html += '</div><p style="font-size:.74rem;color:#6b7280;margin:.5rem 0 0;line-height:1.45;">Published quizzes use the section you select here (or all sections).</p>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.section-pill').forEach(function(btn) {
    btn.onclick = function() {
      activeQmTargetSection = btn.getAttribute('data-sec') || '__all__';
      try { sessionStorage.setItem('prism_qm_target_section_' + activeClassId, activeQmTargetSection); } catch (e) {}
      renderQmSectionPills();
      renderSavedQuizzes();
    };
  });
}

function updateQuizScopeBanner() {
  var el = document.getElementById('quizmaker-class-scope-banner');
  if (!el) return;
  if (!activeClassId || !CLASSES.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  var cls = CLASSES.find(function(c) { return c.id === activeClassId; });
  var subj = cls ? (typeof prismTeacherClassLabel === 'function' ? prismTeacherClassLabel(cls) : (cls.subject || 'This class')) : 'This class';
  var safe = String(subj).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  el.style.display = 'block';
  el.innerHTML = '<strong style="font-family:DM Sans,sans-serif;font-size:.92rem;">Quizzes for: ' + safe + '</strong>'
    + '<span style="display:block;margin-top:.4rem;opacity:.95;font-weight:500;">Published quizzes and drafts you save here belong only to this class. Students in other subjects will not see them. Switch class above to work on a different subject.</span>';
}

async function onClassChange(id) {
  activeClassId = id;
  try { sessionStorage.setItem('prism_teacher_active_class_id', id); } catch (e) {}
  CLASSES = getClasses();
  qmLoadTargetSection(id);
  loadQmQuizViewFilter();
  await syncQuizzesFromApiForClass(id);
  updateQuizScopeBanner();
  renderQmSectionPills();
  renderSavedQuizzes();
}

function qmLetter(i){ return String.fromCharCode(65 + i); }
function qmFind(id){ return questions.find(function(x){ return String(x.id)===String(id); }); }
function qmRefreshOpts(id){
  var q = qmFind(id);
  var box = document.getElementById('qo-' + id);
  if (q && box) {
    box.innerHTML = renderOpts(q);
    qmBindTeacherMatches(box);
  }
}
function ensureQuestionShape(q){
  if (q.type==='mc' && (!q.options || !q.options.length)) {
    q.options=[{text:'',correct:true},{text:'',correct:false},{text:'',correct:false},{text:'',correct:false}];
  }
  if (q.type==='tf') q.tfAnswer=q.tfAnswer||'true';
  if (q.type==='match') qmEnsureBank(q);
  if (q.type==='id' && (!q.answers || !q.answers.length)) q.answers=[''];
  if (q.type==='mtf') {
    q.mtfMode = q.mtfMode==='fix' ? 'fix' : 'true';
    if (q.mtfMode==='true') q.mtfAnswer='True';
    else if (q.mtfAnswer==null) q.mtfAnswer='';
  }
}
function addQuestion(pre) {
  const q=pre||{id:Date.now().toString(),type:'mc',question:'',points:5,options:[{text:'',correct:true},{text:'',correct:false},{text:'',correct:false},{text:'',correct:false}],tfAnswer:'true',image:''};
  ensureQuestionShape(q);
  questions.push(q); renderQMQuestions();
}
function removeQuestion(id){questions=questions.filter(q=>String(q.id)!==String(id));renderQMQuestions();}
function renderQMQuestions(){
  const list=document.getElementById('questions-list');list.innerHTML='';
  questions.forEach((q,i)=>{
    ensureQuestionShape(q);
    const card=document.createElement('div');card.className='q-card';
    card.innerHTML=`<div class="q-header"><div class="q-num">${i+1}</div>
      <select class="q-type-sel" onchange="changeQType('${q.id}',this.value)">
        <option value="mc" ${q.type==='mc'?'selected':''}>Multiple choice</option>
        <option value="tf" ${q.type==='tf'?'selected':''}>True / False</option>
        <option value="mtf" ${q.type==='mtf'?'selected':''}>Modified true or false</option>
        <option value="id" ${q.type==='id'?'selected':''}>Identification</option>
        <option value="match" ${q.type==='match'?'selected':''}>Matching</option>
        <option value="sa" ${q.type==='sa'?'selected':''}>Short answer</option>
        <option value="essay" ${q.type==='essay'?'selected':''}>Essay</option>
      </select>
      <input class="q-pts" type="number" min="1" value="${q.points}" onchange="updateQ('${q.id}','points',this.value)" title="Points"/>
      <span style="font-size:.72rem;color:#9ca3af;">pts</span>
      <button type="button" class="q-del" onclick="removeQuestion('${q.id}')" title="Remove question" aria-label="Remove question">&times;</button></div>
      <input class="q-text" placeholder="${q.type==='mtf'?'Type the statement…':'Type your question…'}" value="${esc(q.question)}" oninput="updateQ('${q.id}','question',this.value)"/>
      <div id="qo-${q.id}">${renderOpts(q)}</div>`;
    list.appendChild(card);
  });
  qmBindTeacherMatches(list);
}
function qmImageBlock(q){
  var src = q.image ? (typeof prismResolveUploadUrl==='function' ? prismResolveUploadUrl(q.image) : q.image) : '';
  var preview = src ? `<img class="q-image-preview" src="${esc(src)}" alt="">` : '';
  var status = q._uploading ? `<div class="q-note">Uploading image…</div>` : '';
  return `<div class="q-image-row">
    ${preview}
    ${status}
    <label class="q-image-btn">${q.image ? 'Change image' : 'Add image'}
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,.png,.jpg,.jpeg,.gif,.webp,.bmp" hidden onchange="onQuestionImage('${q.id}',this)"/>
    </label>
    ${q.image ? `<button type="button" class="q-image-clear" onclick="removeQuestionImage('${q.id}')">Remove image</button>` : ''}
  </div>`;
}
function renderOpts(q){
  var body = '';
  if(q.type==='mc'){
    body = `<div class="mc-opts">${(q.options||[]).map((o,i)=>`
      <div class="choice-box">
        <span class="choice-letter">${qmLetter(i)}</span>
        <input type="text" value="${esc(o.text)}" placeholder="Choice ${qmLetter(i)}" oninput="updateOpt('${q.id}',${i},this.value)"/>
        <label class="choice-key"><input type="radio" name="cr-${q.id}" ${o.correct?'checked':''} onchange="setCorrect('${q.id}',${i})"/> Correct</label>
        ${q.options.length>2?`<button type="button" class="mc-rm" onclick="removeOpt('${q.id}',${i})" aria-label="Remove choice">&times;</button>`:''}
      </div>`).join('')}
      ${q.options.length<6?`<button type="button" class="mc-add" onclick="addOpt('${q.id}')">+ Add a choice</button>`:''}
    </div>`;
  } else if(q.type==='tf'){
    body = `<div class="tf-row">
      <button type="button" class="tf-btn ${q.tfAnswer==='true'?'sel-true':''}" onclick="setTF('${q.id}','true')">True</button>
      <button type="button" class="tf-btn ${q.tfAnswer==='false'?'sel-false':''}" onclick="setTF('${q.id}','false')">False</button>
    </div>`;
  } else if(q.type==='mtf'){
    body = `<div class="mtf-sample" aria-hidden="true"><span class="mtf-sample-blank"></span><span class="mtf-sample-no">1.</span><span class="mtf-sample-text">Statement</span></div>
      <div class="q-note">Students write in the blank before the number. Use True when the statement is correct, or the word that fixes it.</div>
      <div class="tf-row">
        <button type="button" class="tf-btn ${q.mtfMode!=='fix'?'sel-true':''}" onclick="setMtfMode('${q.id}','true')">Statement is true</button>
        <button type="button" class="tf-btn ${q.mtfMode==='fix'?'sel-false':''}" onclick="setMtfMode('${q.id}','fix')">Students write a correction</button>
      </div>
      ${q.mtfMode==='fix'
        ? `<div class="choice-box"><span class="choice-letter">Ans</span><input type="text" value="${esc(q.mtfAnswer)}" placeholder="Word or phrase they should write" oninput="updateQ('${q.id}','mtfAnswer',this.value)"/></div>`
        : `<div class="q-note">Accepted answer: True</div>`}`;
  } else if(q.type==='id'){
    body = `<div class="q-note">Students type one answer. Any box below is accepted.</div>
      <div class="mc-opts">${(q.answers||[]).map((a,i)=>`
        <div class="choice-box">
          <span class="choice-letter">${i+1}</span>
          <input type="text" value="${esc(a)}" placeholder="Accepted answer" oninput="updateAnswer('${q.id}',${i},this.value)"/>
          ${(q.answers||[]).length>1?`<button type="button" class="mc-rm" onclick="removeAnswer('${q.id}',${i})" aria-label="Remove answer">&times;</button>`:''}
        </div>`).join('')}
        ${(q.answers||[]).length<6?`<button type="button" class="mc-add" onclick="addAnswer('${q.id}')">+ Add another accepted answer</button>`:''}
      </div>`;
  } else if(q.type==='match'){
    qmEnsureBank(q);
    var leftCol = (q.pairs||[]).map(function(p,i){
      return `<div class="match-item a">
        <input type="text" value="${esc(p.left)}" placeholder="Item ${i+1}" oninput="updatePair('${q.id}',${i},'left',this.value)"/>
        <button type="button" class="match-dot" data-from="${i}" aria-label="Connect item ${i+1}"></button>
        ${(q.pairs||[]).length>2?`<button type="button" class="mc-rm" onclick="removePair('${q.id}',${i})" aria-label="Remove match">&times;</button>`:''}
      </div>`;
    }).join('');
    var rightCol = (q.columnB||[]).map(function(text,slot){
      return `<div class="match-item b qm-match-b" data-slot="${slot}">
        <button type="button" class="match-dot" data-to="${slot}" aria-label="Answer ${slot+1}"></button>
        <input type="text" value="${esc(text)}" placeholder="Answer" oninput="updateColumnB('${q.id}',${slot},this.value)"/>
      </div>`;
    }).join('');
    body = `<div class="q-note">Type the items and the answers. Drag a dot in column A to the matching dot in column B. Nothing is connected until you do that. Tap a connected dot to undo it.</div>
      <div class="qm-match" id="qm-match-${q.id}" data-qid="${q.id}">
        <div class="match-col"><h4>Column A</h4>${leftCol}</div>
        <div class="match-col"><h4>Column B</h4>${rightCol}</div>
        <svg class="match-lines"></svg>
      </div>
      ${(q.pairs||[]).length<8?`<button type="button" class="mc-add" onclick="addPair('${q.id}')">+ Add a match</button>`:''}`;
  } else if(q.type==='sa'){
    body = `<div class="q-note">Students type a short answer. You review it after they submit.</div>`;
  } else if(q.type==='essay'){
    body = `<div class="q-note">Students write a longer response. You review it after they submit.</div>`;
  }
  return body + qmImageBlock(q);
}
function changeQType(id,type){
  var q=qmFind(id); if(!q) return;
  q.type=type;
  ensureQuestionShape(q);
  qmRefreshOpts(id);
}
function updateQ(id,f,v){var q=qmFind(id); if(q) q[f]=f==='points'?parseInt(v,10)||1:v;}
function updateOpt(id,i,v){var q=qmFind(id); if(q&&q.options[i]) q.options[i].text=v;}
function setCorrect(id,i){var q=qmFind(id); if(!q) return; q.options.forEach(function(o,j){ o.correct=j===i; });}
function addOpt(id){var q=qmFind(id); if(!q||q.options.length>=6) return; q.options.push({text:'',correct:false}); qmRefreshOpts(id);}
function removeOpt(id,i){var q=qmFind(id); if(!q||q.options.length<=2) return; q.options.splice(i,1); if(!q.options.some(function(o){return o.correct;})) q.options[0].correct=true; qmRefreshOpts(id);}
function setTF(id,v){var q=qmFind(id); if(!q) return; q.tfAnswer=v; qmRefreshOpts(id);}
function setMtfMode(id, mode){
  var q=qmFind(id); if(!q) return;
  q.mtfMode = mode==='fix' ? 'fix' : 'true';
  if (q.mtfMode==='true') q.mtfAnswer='True';
  else if (!q.mtfAnswer || /^true$/i.test(String(q.mtfAnswer))) q.mtfAnswer='';
  qmRefreshOpts(id);
}
function updateAnswer(id,i,v){var q=qmFind(id); if(q&&q.answers) q.answers[i]=v;}
function addAnswer(id){var q=qmFind(id); if(!q||q.answers.length>=6) return; q.answers.push(''); qmRefreshOpts(id);}
function removeAnswer(id,i){var q=qmFind(id); if(!q||q.answers.length<=1) return; q.answers.splice(i,1); qmRefreshOpts(id);}
function updatePair(id,i,side,v){var q=qmFind(id); if(q&&q.pairs[i]) q.pairs[i][side]=v;}
function updateColumnB(id,slot,value){
  var q=qmFind(id); if(!q||!q.columnB) return;
  q.columnB[slot]=value;
  (q.links||[]).forEach(function(link,i){ if(link===slot && q.pairs[i]) q.pairs[i].right=value; });
}
function qmUnalign(order){
  var a = order.slice();
  var n = a.length;
  if (n < 2) return a;
  var guard = 0;
  for (var i = 0; i < n; i++) {
    if (a[i] !== i) continue;
    var j = (i + 1) % n;
    var tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
    if (++guard > n * 3) break;
    i = -1;
  }
  return a;
}
function qmEnsureBank(q){
  if (!q.pairs || q.pairs.length < 2) q.pairs = [{left:'',right:''},{left:'',right:''}];
  var n = q.pairs.length;
  var ready = Array.isArray(q.columnB) && q.columnB.length === n && Array.isArray(q.links) && q.links.length === n;
  if (!ready) {
    var order = Array.isArray(q.bankOrder) ? q.bankOrder.map(function(k){ return parseInt(k, 10); }) : [];
    var seen = {};
    var saved = order.length === n && q.pairs.some(function(p){ return String(p.right || '').trim(); });
    order.forEach(function(k){ if (!(k >= 0) || k >= n || seen[k]) saved = false; seen[k] = true; });
    if (saved) {
      q.columnB = order.map(function(k){ return (q.pairs[k] && q.pairs[k].right) || ''; });
      q.links = [];
      for (var i = 0; i < n; i++) q.links.push(order.indexOf(i));
    } else {
      q.columnB = q.pairs.map(function(p){ return p.right || ''; });
      q.links = q.pairs.map(function(){ return null; });
    }
  }
  q.links = q.links.map(function(v){
    var nlink = parseInt(v, 10);
    if (v === null || v === undefined || v === '' || isNaN(nlink) || nlink < 0 || nlink >= n) return null;
    return nlink;
  });
}
function qmPackMatch(q){
  qmEnsureBank(q);
  var next = [];
  q.pairs.forEach(function(p, i){
    var slot = q.links[i];
    var right = slot === null ? '' : String(q.columnB[slot] || '').trim();
    var left = String(p.left || '').trim();
    if (!left || !right) return;
    next.push({ left: left, right: right });
  });
  var order = [];
  for (var i = 0; i < next.length; i++) order.push(i);
  if (next.length >= 2) order = qmUnalign(order);
  return { pairs: next, bankOrder: order, columnB: q.columnB.slice(), links: q.links.slice() };
}
function addPair(id){
  var q=qmFind(id); if(!q||q.pairs.length>=8) return;
  qmEnsureBank(q);
  q.pairs.push({left:'',right:''});
  q.columnB.push('');
  q.links.push(null);
  qmRefreshOpts(id);
}
function removePair(id,i){
  var q=qmFind(id); if(!q||q.pairs.length<=2) return;
  qmEnsureBank(q);
  q.pairs.splice(i,1);
  q.columnB.splice(i,1);
  q.links.splice(i,1);
  q.links = q.links.map(function(slot){
    if (slot === null || slot === undefined) return null;
    if (slot === i) return null;
    return slot > i ? slot - 1 : slot;
  });
  qmRefreshOpts(id);
}
function qmSetLink(id, from, to){
  var q = qmFind(id);
  if (!q) return;
  qmEnsureBank(q);
  if (to === null || to === undefined || isNaN(to)) {
    q.links[from] = null;
    if (q.pairs[from]) q.pairs[from].right = '';
  } else {
    q.links.forEach(function(v, i){
      if (i !== from && v === to) {
        q.links[i] = null;
        if (q.pairs[i]) q.pairs[i].right = '';
      }
    });
    q.links[from] = to;
    if (q.pairs[from]) q.pairs[from].right = q.columnB[to] || '';
  }
  var board = document.getElementById('qm-match-' + id);
  if (board) qmDrawTeacherMatch(board);
}
var QM_MATCH_COLORS = ['#7c3aed','#0d9488','#d97706','#2563eb','#be123c','#15803d','#0284c7','#9333ea'];
function qmDrawTeacherMatch(board, fromDot, pointer){
  if (!board) return;
  var svg = board.querySelector('.match-lines');
  var q = qmFind(board.getAttribute('data-qid'));
  if (!svg || !q || !q.links) return;
  var rect = board.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  svg.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
  function center(el){
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - rect.left, y: r.top + r.height / 2 - rect.top };
  }
  board.querySelectorAll('.match-dot').forEach(function(dot){
    dot.classList.remove('used');
    dot.style.removeProperty('--dot');
  });
  var lines = '';
  q.links.forEach(function(slot, i){
    if (slot === null || slot === undefined) return;
    var a = board.querySelector('.match-dot[data-from="' + i + '"]');
    var b = board.querySelector('.match-dot[data-to="' + slot + '"]');
    if (!a || !b) return;
    var color = QM_MATCH_COLORS[i % QM_MATCH_COLORS.length];
    var p1 = center(a);
    var p2 = center(b);
    a.style.setProperty('--dot', color);
    b.style.setProperty('--dot', color);
    a.classList.add('used');
    b.classList.add('used');
    lines += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="' + color + '" stroke-width="3" stroke-linecap="round"/>';
  });
  if (fromDot && pointer) {
    var start = center(fromDot);
    lines += '<line x1="' + start.x + '" y1="' + start.y + '" x2="' + pointer.x + '" y2="' + pointer.y + '" stroke="#34d399" stroke-width="3.5" stroke-linecap="round"/>';
  }
  svg.innerHTML = lines;
}
function qmBindTeacherMatches(root){
  if (!window.__qmMatchResize) {
    window.__qmMatchResize = true;
    window.addEventListener('resize', function(){
      document.querySelectorAll('.qm-match').forEach(qmDrawTeacherMatch);
    });
  }
  (root || document).querySelectorAll('.qm-match').forEach(function(board){
    requestAnimationFrame(function(){ qmDrawTeacherMatch(board); });
    if (board.dataset.bound === '1') return;
    board.dataset.bound = '1';
    var drag = null;
    function point(e){
      var r = board.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function markDrop(e){
      board.querySelectorAll('.qm-match-b').forEach(function(row){ row.classList.remove('is-drop'); });
      if (!e) return;
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var row = hit && hit.closest ? hit.closest('.qm-match-b') : null;
      if (row && board.contains(row)) row.classList.add('is-drop');
    }
    function onMove(e){
      if (!drag || e.pointerId !== drag.id) return;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      markDrop(e);
      qmDrawTeacherMatch(board, drag.dot, point(e));
    }
    function finish(e){
      if (!drag || e.pointerId !== drag.id) return;
      var from = drag.from;
      var moved = drag.moved;
      var q = qmFind(board.getAttribute('data-qid'));
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var row = hit && hit.closest ? hit.closest('.qm-match-b') : null;
      drag = null;
      markDrop(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (moved && row && board.contains(row)) qmSetLink(board.getAttribute('data-qid'), from, parseInt(row.getAttribute('data-slot'), 10));
      else if (!moved && q && q.links && q.links[from] !== null && q.links[from] !== undefined) qmSetLink(board.getAttribute('data-qid'), from, null);
      else qmDrawTeacherMatch(board);
    }
    board.addEventListener('pointerdown', function(e){
      var dot = e.target.closest('.match-dot[data-from]');
      if (!dot || !board.contains(dot)) return;
      e.preventDefault();
      drag = { id: e.pointerId, from: parseInt(dot.getAttribute('data-from'), 10), x: e.clientX, y: e.clientY, moved: false, dot: dot };
      try { dot.setPointerCapture(e.pointerId); } catch (err) {}
      qmDrawTeacherMatch(board, dot, point(e));
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    });
  });
}
function removeQuestionImage(id){var q=qmFind(id); if(!q) return; q.image=''; qmRefreshOpts(id);}
async function onQuestionImage(id, input){
  var file = input.files && input.files[0];
  input.value = '';
  var q = qmFind(id);
  if (!file || !q) return;
  if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) {
    showQMsg('Use a PNG, JPG, GIF, or WebP image.', 'err');
    return;
  }
  q._uploading = true;
  qmRefreshOpts(id);
  try {
    var saved = await PrismQuizzes.uploadImage(file);
    q.image = saved.path || '';
    showQMsg('Image added.', 'ok');
  } catch (e) {
    showQMsg(e.message || 'Could not upload the image.', 'err');
  }
  q._uploading = false;
  qmRefreshOpts(id);
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function qmCleanQuestion(q){
  var copy = JSON.parse(JSON.stringify(q));
  delete copy._uploading;
  if (copy.type==='mc') copy.options = (copy.options||[]).filter(function(o){ return String(o.text||'').trim(); });
  if (copy.type==='match') {
    var packed = qmPackMatch(copy);
    copy.pairs = packed.pairs;
    copy.bankOrder = packed.bankOrder;
    copy.columnB = packed.columnB;
    copy.links = packed.links;
  }
  if (copy.type==='id') copy.answers = (copy.answers||[]).map(function(a){ return String(a||'').trim(); }).filter(Boolean);
  if (copy.type==='mtf' && copy.mtfMode!=='fix') { copy.mtfMode='true'; copy.mtfAnswer='True'; }
  return copy;
}
function qmQuestionProblem(q, n){
  var label = 'Question ' + n;
  if (!String(q.question||'').trim()) return label + ' needs text.';
  if (q.type==='mc') {
    if ((q.options||[]).length < 2) return label + ' needs at least two choices.';
    if (!(q.options||[]).some(function(o){ return o.correct && String(o.text||'').trim(); })) return label + ' needs a correct choice.';
  }
  if (q.type==='match' && Array.isArray(q.links) && q.links.some(function(v){ return v === null || v === undefined; })) return label + ' needs every item connected to an answer.';
  if (q.type==='match' && Array.isArray(q.columnB) && q.columnB.some(function(t){ return !String(t || '').trim(); })) return label + ' needs an answer in every row of column B.';
  if (q.type==='match' && (q.pairs||[]).some(function(p){ return !String(p.left || '').trim(); })) return label + ' needs an item in every row of column A.';
  if (q.type==='match' && (q.pairs||[]).length < 2) return label + ' needs at least two matches.';
  if (q.type==='id' && !(q.answers||[]).length) return label + ' needs an accepted answer.';
  if (q.type==='mtf' && q.mtfMode==='fix' && !String(q.mtfAnswer||'').trim()) return label + ' needs the correction students should write.';
  return '';
}

function getQMData(){
  const cls=CLASSES.find(c=>c.id===activeClassId)||{};
  return{
    id:Date.now().toString(),classId:activeClassId,teacherId:TEACHER_ID,
    subjectName:cls.subject||'', subjectColor:cls.color||'#7c3aed',
    title:document.getElementById('qm-title').value.trim(),
    type:document.getElementById('qm-type').value,
    time:parseInt(document.getElementById('qm-time').value)||0,
    instructions:document.getElementById('qm-instructions').value.trim(),
    due:document.getElementById('qm-due').value,
    due_time:document.getElementById('qm-due-time').value.trim(),
    attempts:document.getElementById('qm-attempts').value,
    shuffle:document.getElementById('qm-shuffle').value,
    reveal:document.getElementById('qm-reveal').value,
    allowSkip:!!(document.getElementById('qm-skip')&&document.getElementById('qm-skip').checked),
    questions:questions.map(qmCleanQuestion),
    totalPoints:questions.reduce((s,q)=>s+(parseInt(q.points)||0),0),
  };
}

async function publishQuiz(){
  const d=getQMData();
  if(editingQuizId) d.id=editingQuizId;
  if(!d.title){showQMsg('Enter a title.','err');return;}
  if(!d.questions.length){showQMsg('Add at least one question.','err');return;}
  if(!activeClassId){showQMsg('Select a class first.','err');return;}
  if(questions.some(function(q){ return q._uploading; })){showQMsg('Wait for the image to finish uploading.','err');return;}
  var problem='';
  d.questions.some(function(q,i){ problem=qmQuestionProblem(q,i+1); return !!problem; });
  if(problem){showQMsg(problem,'err');return;}
  var publishBtn=document.querySelector('.publish-btn');
  if(typeof prismSetBusy==='function') prismSetBusy(publishBtn,true,'Publishing…');
  try{
    const payload={
      id:d.id,
      class_id:activeClassId,
      target_section:qmGetTargetSectionForApi(),
      title:d.title,
      type:d.type||'quiz',
      instructions:d.instructions||'',
      time:d.time||0,
      due:d.due||'',
      due_time:d.due_time||'',
      attempts:parseInt(d.attempts,10)||1,
      shuffle:d.shuffle==='yes'?'yes':'no',
      reveal:d.reveal||'submit',
      allow_skip:d.allowSkip?1:0,
      questions:d.questions,
      totalPoints:d.totalPoints||0,
      published:true,
    };
    const saved=await PrismQuizzes.save(payload);
    const quizId=saved.id||d.id;
    const author=sessionStorage.getItem('prism_user_name')||'Teacher';
    await PrismPosts.add({
      class_id:activeClassId,
      type:'quiz',
      body:`New quiz: "${d.title}" — ${d.questions.length} questions, ${d.totalPoints} pts${d.due?' · Due '+(typeof prismFormatDueLine==='function'?prismFormatDueLine(d.due,d.due_time):d.due):''}`,
      quiz_id:quizId,
      author,
      target_section:qmGetTargetSectionForApi(),
    });
    d.published=true; d.publishedAt=new Date().toISOString(); d.id=quizId;
    d.target_section = qmGetTargetSectionForApi() || '';
    const quizzes=getQuizzes().filter(function(q){ return String(q.id)!==String(editingQuizId) || String(editingQuizId)===String(quizId); });
    const existing=quizzes.findIndex(function(q){ return String(q.id)===String(quizId); });
    if(existing>=0) quizzes[existing]=d;
    else quizzes.push(d);
    saveQuizzes(quizzes);
    await syncQuizzesFromApiForClass(activeClassId);
    showQMsg(' Published!','ok'); resetQM(); renderSavedQuizzes();
  }catch(e){ showQMsg(e.message||'Publish failed.','err'); }
  finally { if(typeof prismSetBusy==='function') prismSetBusy(publishBtn,false); }
}
function saveDraft(){
  const d=getQMData();if(!d.title){showQMsg('Enter a title.','err');return;}
  d.published=false;
  d.target_section=qmGetTargetSectionForApi()||'';
  const quizzes=getQuizzes();
  if(editingQuizId){
    const i=quizzes.findIndex(function(q){ return String(q.id)===String(editingQuizId); });
    if(i>=0){
      d.id=quizzes[i].id;
      quizzes[i]=Object.assign({}, quizzes[i], d);
      saveQuizzes(quizzes);
      showQMsg('Draft updated.','ok');
      syncDraftButton();
      saveQmQuizViewFilter('__all__');
      renderSavedQuizzes();
      var savedList=document.getElementById('saved-quizzes');
      if(savedList&&savedList.scrollIntoView) savedList.scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }
  }
  quizzes.push(d);
  editingQuizId=d.id;
  saveQuizzes(quizzes);
  showQMsg('Draft saved.','ok');
  syncDraftButton();
  saveQmQuizViewFilter('__all__');
  renderSavedQuizzes();
  var savedList=document.getElementById('saved-quizzes');
  if(savedList&&savedList.scrollIntoView) savedList.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function syncDraftButton(){
  var btn=document.querySelector('.draft-btn');
  if(btn) btn.textContent=editingQuizId?'Update draft':'Save Draft';
}
function openDraft(id){
  var quiz=getQuizzes().find(function(q){ return String(q.id)===String(id); });
  if(!quiz) return;
  if(quiz.published){ viewQuizLog(quiz.id); return; }
  editingQuizId=quiz.id;
  document.getElementById('qm-title').value=quiz.title||'';
  document.getElementById('qm-instructions').value=quiz.instructions||'';
  document.getElementById('qm-time').value=quiz.time?String(quiz.time):'';
  document.getElementById('qm-due').value=quiz.due||'';
  document.getElementById('qm-due-time').value=quiz.due_time||'';
  setQmSelect('qm-type', quiz.type||'quiz');
  setQmSelect('qm-attempts', quiz.attempts!=null?String(quiz.attempts):'1');
  setQmSelect('qm-shuffle', quiz.shuffle||'yes');
  setQmSelect('qm-reveal', quiz.reveal||'submit');
  var skipBox=document.getElementById('qm-skip');
  if(skipBox) skipBox.checked=!!(quiz.allowSkip||quiz.allow_skip);
  questions=(quiz.questions||[]).map(function(q,i){
    var copy=JSON.parse(JSON.stringify(q));
    if(!copy.id) copy.id=String(Date.now())+'-'+i;
    ensureQuestionShape(copy);
    return copy;
  });
  activeQmTargetSection=(quiz.target_section&&String(quiz.target_section).trim())||'__all__';
  try{ sessionStorage.setItem('prism_qm_target_section_'+activeClassId, activeQmTargetSection); }catch(e){}
  renderQmSectionPills();
  renderQMQuestions();
  syncDraftButton();
  showQMsg('Draft loaded. Save again to keep your changes.','ok');
  var title=document.getElementById('qm-title');
  if(title&&title.scrollIntoView) title.scrollIntoView({behavior:'smooth',block:'center'});
}
function setQmSelect(id, value){
  var el=document.getElementById(id);
  if(!el) return;
  var wanted=String(value);
  var has=[].some.call(el.options, function(o){ return o.value===wanted; });
  if(has) el.value=wanted;
}
function showQMsg(m,t){const el=document.getElementById('qm-msg');el.textContent=m;el.className='form-msg '+t;setTimeout(()=>el.textContent='',2500);}
function resetQM(){editingQuizId=null;document.getElementById('qm-title').value='';document.getElementById('qm-instructions').value='';document.getElementById('qm-time').value='';document.getElementById('qm-due').value='';document.getElementById('qm-due-time').value='';var skipBox=document.getElementById('qm-skip');if(skipBox)skipBox.checked=false;questions=[];syncDraftButton();renderQMQuestions();}

function loadQmQuizViewFilter(){
  if(!activeClassId){ qmQuizViewFilter='__all__'; return; }
  try{
    var v=sessionStorage.getItem('prism_qm_quiz_view_filter_'+activeClassId);
    qmQuizViewFilter=(v!=null&&v!=='')?v:'__all__';
  }catch(e){ qmQuizViewFilter='__all__'; }
}
function saveQmQuizViewFilter(id){
  qmQuizViewFilter=id;
  try{ if(activeClassId) sessionStorage.setItem('prism_qm_quiz_view_filter_'+activeClassId,id); }catch(e){}
}
function populateQmQuizFilterSelect(quizzes){
  var wrap=document.getElementById('qm-quiz-filter-wrap');
  var sel=document.getElementById('qm-quiz-filter-select');
  if(!wrap||!sel) return;
  var sorted=quizzes.slice().sort(function(a,b){
    return String(a.title||'').localeCompare(String(b.title||''),undefined,{sensitivity:'base'});
  });
  sel.innerHTML='';
  var o0=document.createElement('option');
  o0.value='__all__';
  o0.textContent='All quizzes';
  sel.appendChild(o0);
  sorted.forEach(function(it){
    var o=document.createElement('option');
    o.value=String(it.id);
    o.textContent=it.title||'Untitled';
    sel.appendChild(o);
  });
  var ids=new Set(sorted.map(function(it){ return String(it.id); }));
  if(qmQuizViewFilter!=='__all__'&&!ids.has(qmQuizViewFilter)){
    qmQuizViewFilter='__all__';
    saveQmQuizViewFilter('__all__');
  }
  sel.value=qmQuizViewFilter;
  sel.onchange=function(){
    saveQmQuizViewFilter(sel.value);
    renderSavedQuizzes();
  };
  wrap.style.display=sorted.length?'flex':'none';
}

function renderSavedQuizzes(){
  loadQmQuizViewFilter();
  const list=document.getElementById('saved-quizzes');
  const filterWrap=document.getElementById('qm-quiz-filter-wrap');
  if(!activeClassId){
    if(filterWrap) filterWrap.style.display='none';
    list.innerHTML='<p style="font-size:.82rem;color:#9ca3af;text-align:center;padding:.5rem 0;">Select a class above.</p>';
    return;
  }
  const quizzes=getQuizzes().filter(function(q){
    var classOk = String(q.classId || q.class_id || '') === String(activeClassId);
    var owner = String(q.teacherId || q.teacher_id || '');
    var ownerOk = owner === String(TEACHER_ID) || owner === '' || owner === 'teacher';
    return classOk && ownerOk && qmItemMatchesSection(q);
  });
  populateQmQuizFilterSelect(quizzes);
  if(qmQuizViewFilter!=='__all__' && !quizzes.some(function(q){ return String(q.id)===String(qmQuizViewFilter); })){
    qmQuizViewFilter='__all__';
    saveQmQuizViewFilter('__all__');
    populateQmQuizFilterSelect(quizzes);
  }
  if(!quizzes.length){
    list.innerHTML='<p style="font-size:.82rem;color:#9ca3af;text-align:center;padding:.5rem 0;">No quizzes for this class.</p>';
    return;
  }
  const displayQuizzes=qmQuizViewFilter==='__all__'?quizzes:quizzes.filter(function(q){ return String(q.id)===qmQuizViewFilter; });
  if(!displayQuizzes.length){
    list.innerHTML='<p style="font-size:.82rem;color:#9ca3af;text-align:center;padding:.5rem 0;">No quiz matches this filter. Choose <strong>All quizzes</strong> above.</p>';
    return;
  }
  list.innerHTML=displayQuizzes.slice().reverse().map(q=>{
    const logKey='prism_quiz_log_'+q.classId+'_'+q.id;
    const log=JSON.parse(localStorage.getItem(logKey)||'[]');
    const alerts=log.filter(e=>e.type==='tab-switch'||e.type==='abandon').length;
    const alertBadge=alerts?`<span style="background:#fee2e2;color:#dc2626;font-size:.68rem;font-weight:700;padding:2px 7px;border-radius:20px;margin-left:.4rem;"> ${alerts}</span>`:'';
    var secLab = (q.target_section && String(q.target_section).trim()) ? ' · <span style="color:#059669;font-weight:700;">'+String(q.target_section).trim()+'</span>' : '';
    var qid = "'" + String(q.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    return `<div class="saved-q-item">
      <div class="sq-top">
        <div class="sq-icon">${q.type==='exam'?'Exam':q.type==='activity'?'Activity':'Quiz'}</div>
        <div class="sq-copy"><div class="sq-title">${q.title}${alertBadge}</div><div class="sq-meta">${(q.questions||[]).length}Q · ${q.totalPoints||0}pts${secLab} · ${q.published?'<span style="color:#10b981;">Published</span>':'<span style="color:#9ca3af;">Draft</span>'}</div></div>
      </div>
      <div class="sq-actions">
        ${q.published
          ? `<button type="button" class="sq-log-btn" onclick="viewQuizLog(${qid})" title="Activity log">Log</button>`
          : `<button type="button" class="sq-log-btn" onclick="openDraft(${qid})" title="Open this draft">Edit</button>`}
        <button type="button" class="sq-del-btn" onclick="deleteQuiz(${qid})" title="Remove this quiz">Delete</button>
      </div>
    </div>`;
  }).join('');
  if (typeof qmFitEmbed === 'function') setTimeout(qmFitEmbed, 40);
}

async function deleteQuiz(id){
  if(!confirm('Delete this quiz? Students will no longer see it.'))return;
  try{
    await PrismQuizzes.delete(id);
  }catch(e){
    showQMsg(e.message||'Could not delete quiz.','err');
    return;
  }
  saveQuizzes(getQuizzes().filter(function(q){ return String(q.id)!==String(id); }));
  await syncQuizzesFromApiForClass(activeClassId);
  renderSavedQuizzes();
}

async function viewQuizGrades(quizId){
  const quiz=getQuizzes().find(q=>String(q.id)===String(quizId)); if(!quiz)return;
  const existing=document.getElementById('quiz-grades-modal'); if(existing)existing.remove();
  const modal=document.createElement('div');
  modal.id='quiz-grades-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
  modal.innerHTML='<div class="grade-sheet"><h3>Grades</h3><div class="sub">'+String(quiz.title||'Quiz').replace(/</g,'&lt;')+'</div><p class="sub">Loading scores…</p></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click',function(e){if(e.target===modal)modal.remove();});
  var rows='<p class="sub">No one has submitted this quiz yet.</p>';
  try {
    var scores=await PrismQuizzes.getScores(quizId);
    if(!Array.isArray(scores)) scores=[];
    if(scores.length){
      var total=quiz.totalPoints||0;
      rows=scores.map(function(row){
        var name=String(row.student_name||row.student_id||'Student').replace(/</g,'&lt;');
        var when=row.taken_at?new Date(String(row.taken_at).replace(' ','T')).toLocaleString():'';
        return '<div class="grade-row"><div><b>'+name+'</b><div class="sub">'+when+'</div></div><div class="grade-score">'+row.score+' / '+total+'</div></div>';
      }).join('');
    }
  } catch(e) {
    rows='<p class="sub">'+(e&&e.message?String(e.message).replace(/</g,'&lt;'):'Could not load scores.')+'</p>';
  }
  var sheet=modal.querySelector('.grade-sheet');
  if(!sheet) return;
  sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:.8rem;"><div><h3>Grades</h3><div class="sub">'+String(quiz.title||'Quiz').replace(/</g,'&lt;')+'</div></div><button type="button" id="grades-close" aria-label="Close" style="width:32px;height:32px;border-radius:50%;border:none;background:#f0ecff;cursor:pointer;font-weight:800;">&times;</button></div>'+rows;
  var closeBtn=document.getElementById('grades-close');
  if(closeBtn) closeBtn.onclick=function(){modal.remove();};
}

function qmModalOffset(){
  var top = 16;
  try {
    if (window.parent !== window && window.frameElement) {
      var frameTop = window.frameElement.getBoundingClientRect().top;
      if (frameTop < 0) top = Math.max(16, Math.round(-frameTop + 16));
    }
  } catch (e) {}
  return top;
}
function qmEsc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
async function viewQuizLog(quizId){
  var quiz = getQuizzes().find(function(q){ return String(q.id) === String(quizId); });
  if (quiz && !quiz.published) { openDraft(quiz.id); return; }
  var existing = document.getElementById('quiz-log-modal');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'quiz-log-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:1rem;overflow:auto;';
  var title = quiz && quiz.title ? quiz.title : 'Quiz';
  modal.innerHTML = '<div class="grade-sheet" style="margin-top:' + qmModalOffset() + 'px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:.8rem;"><div><h3>Activity log</h3><div class="sub">' + qmEsc(title) + '</div></div><button type="button" id="log-close-btn" aria-label="Close" style="width:32px;height:32px;border-radius:50%;border:none;background:#f0ecff;cursor:pointer;font-weight:800;">\u00d7</button></div><p class="sub">Loading activity\u2026</p></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
  var closeBtn = document.getElementById('log-close-btn');
  if (closeBtn) closeBtn.onclick = function(){ modal.remove(); };
  var sheet = modal.querySelector('.grade-sheet');
  var log = [];
  var error = '';
  try {
    log = await PrismQuizzes.getLog(quizId);
    if (!Array.isArray(log)) log = [];
  } catch (e) {
    error = (e && e.message) ? e.message : 'Could not load the activity log.';
  }
  var typeLabels = { start: 'Start', submit: 'Submit', 'tab-switch': 'Tab', abandon: 'Left' };
  var rows = error
    ? '<p class="sub">' + qmEsc(error) + '</p>'
    : (log.length ? log.map(function(entry){
        var when = entry.logged_at || entry.time || '';
        var shown = when ? new Date(String(when).replace(' ', 'T')).toLocaleString() : '';
        var who = entry.student_name || entry.student || entry.student_id || 'Student';
        return '<div class="grade-row"><div><b>' + qmEsc(who) + '</b><div class="sub">' + qmEsc(typeLabels[entry.type] || entry.type || 'Activity') + ' \u00b7 ' + qmEsc(entry.detail || '') + '</div><div class="sub">' + qmEsc(shown) + '</div></div></div>';
      }).join('') : '<p class="sub">No activity yet. Starts, submits, and tab switches show up here after a student takes this quiz.</p>');
  if (!sheet) return;
  sheet.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:.8rem;"><div><h3>Activity log</h3><div class="sub">' + qmEsc(title) + '</div></div><button type="button" id="log-close-btn" aria-label="Close" style="width:32px;height:32px;border-radius:50%;border:none;background:#f0ecff;cursor:pointer;font-weight:800;">\u00d7</button></div>' + rows;
  var closeAgain = document.getElementById('log-close-btn');
  if (closeAgain) closeAgain.onclick = function(){ modal.remove(); };
}

function qmFitEmbed() {
  var embedded = document.documentElement.classList.contains('qm-embed') || (document.body && document.body.classList.contains('qm-embed'));
  if (!embedded || window.parent === window) return;
  var main = document.querySelector('.main-content');
  var h = main ? main.offsetHeight : 0;
  if (h < 80 && document.body) h = document.body.scrollHeight;
  window.parent.postMessage({ type: 'prism-quiz-height', height: Math.ceil(h) + 16 }, location.origin);
}

window.addEventListener('DOMContentLoaded', async function(){
  var early = new URLSearchParams(window.location.search);
  if (early.get('embed') === '1') {
    document.body.classList.add('qm-embed');
    qmFitEmbed();
    if (window.ResizeObserver && !window.__qmFitObs) {
      var fitMain = document.querySelector('.main-content');
      if (fitMain) {
        window.__qmFitObs = new ResizeObserver(function () { qmFitEmbed(); });
        window.__qmFitObs.observe(fitMain);
      }
    }
  } else {
    var jump = early.get('class') || sessionStorage.getItem('prism_teacher_active_class_id') || '';
    window.location.replace(jump ? ('teacher-class.html?class=' + encodeURIComponent(jump) + '&tab=quizzes') : 'teacher.html');
    return;
  }
  try {
    var user = typeof prismAuthGuard === 'function' ? await prismAuthGuard(['teacher']) : null;
    if (!user) return;
    TEACHER_ID = user.id;
  } catch(e) {
    window.location.replace('login.html');
    return;
  }
  initSidebar('quizmaker');
  try {
    var apiClasses = await PrismClasses.getMyClasses();
    var normalized = apiClasses.map(function(c){
      return { id:c.id, subject:c.subject, color:c.color||'#7c3aed', code:c.code, teacher_id:c.teacher_id||TEACHER_ID };
    });
    localStorage.setItem('prism_classes_'+TEACHER_ID, JSON.stringify(normalized));
    await Promise.all(normalized.map(function(cls) {
      return PrismClasses.getStudents(cls.id).then(function(studs) {
        localStorage.setItem('prism_students_'+cls.id, JSON.stringify(
          (studs||[]).map(function(s){ return typeof prismMapStudentRow==='function'?prismMapStudentRow(s):{ id:s.id, name:s.name, section:s.section||'', avatar:s.avatar||'' }; })
        ));
      }).catch(function() {});
    }));
  } catch(e) { console.warn('quizmaker class sync', e); }
  CLASSES = getClasses();
  const sel = document.getElementById('class-select');
  if(!CLASSES.length){
    sel.innerHTML='<option>No classes yet — create one in My Classes</option>';
    document.getElementById('saved-quizzes').innerHTML='<p style="font-size:.82rem;color:#9ca3af;text-align:center;padding:.5rem 0;">Create a class in My Classes first.</p>';
    document.getElementById('qm-section-pills-wrap').style.display='none';
    var qf=document.getElementById('qm-quiz-filter-wrap');
    if(qf) qf.style.display='none';
    updateQuizScopeBanner();
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const urlClass = params.get('class');
  const savedClass = sessionStorage.getItem('prism_teacher_active_class_id');
  CLASSES.forEach(function(cls){
    const opt=document.createElement('option');
    opt.value=cls.id;
    opt.textContent=typeof prismTeacherClassLabel==='function'?prismTeacherClassLabel(cls):(cls.subject||'Class');
    if(cls.id===urlClass) opt.selected=true;
    sel.appendChild(opt);
  });
  if (urlClass && CLASSES.find(function(c){ return c.id===urlClass; })) activeClassId = urlClass;
  else if (savedClass && CLASSES.find(function(c){ return c.id===savedClass; })) activeClassId = savedClass;
  else activeClassId = CLASSES[0].id;
  sel.value = activeClassId;
  try { sessionStorage.setItem('prism_teacher_active_class_id', activeClassId); } catch (e) {}
  qmLoadTargetSection(activeClassId);
  loadQmQuizViewFilter();
  await syncQuizzesFromApiForClass(activeClassId);
  updateQuizScopeBanner();
  renderQmSectionPills();
  renderSavedQuizzes();
  renderQMQuestions();
  setTimeout(qmFitEmbed, 60);
  window.addEventListener('resize', qmFitEmbed);
});
