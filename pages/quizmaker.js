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

function addQuestion(pre) {
  const q=pre||{id:Date.now().toString(),type:'mc',question:'',points:5,options:[{text:'',correct:true},{text:'',correct:false},{text:'',correct:false},{text:'',correct:false}],tfAnswer:'true'};
  questions.push(q); renderQMQuestions();
}
function removeQuestion(id){questions=questions.filter(q=>q.id!==id);renderQMQuestions();}
function renderQMQuestions(){
  const list=document.getElementById('questions-list');list.innerHTML='';
  questions.forEach((q,i)=>{
    const card=document.createElement('div');card.className='q-card';
    card.innerHTML=`<div class="q-header"><div class="q-num">${i+1}</div>
      <select class="q-type-sel" onchange="changeQType('${q.id}',this.value)">
        <option value="mc" ${q.type==='mc'?'selected':''}>Multiple Choice</option>
        <option value="tf" ${q.type==='tf'?'selected':''}>True / False</option>
        <option value="sa" ${q.type==='sa'?'selected':''}>Short Answer</option>
        <option value="essay" ${q.type==='essay'?'selected':''}>Essay</option>
      </select>
      <input class="q-pts" type="number" min="1" value="${q.points}" onchange="updateQ('${q.id}','points',this.value)" title="Points"/>
      <span style="font-size:.72rem;color:#9ca3af;">pts</span>
      <button class="q-del" onclick="removeQuestion('${q.id}')" title="Remove question" aria-label="Remove question">&times;</button></div>
      <input class="q-text" placeholder="Type your question…" value="${esc(q.question)}" oninput="updateQ('${q.id}','question',this.value)"/>
      <div id="qo-${q.id}">${renderOpts(q)}</div>`;
    list.appendChild(card);
  });
}
function renderOpts(q){
  if(q.type==='mc')return`<div class="mc-opts">${q.options.map((o,i)=>`
    <div class="mc-opt-row">
      <input type="radio" class="mc-radio" name="cr-${q.id}" ${o.correct?'checked':''} onchange="setCorrect('${q.id}',${i})"/>
      <input class="mc-opt-inp" type="text" value="${esc(o.text)}" placeholder="Option ${['A','B','C','D'][i]||i+1}…" oninput="updateOpt('${q.id}',${i},this.value)"/>
      ${q.options.length>2?`<button class="mc-rm" onclick="removeOpt('${q.id}',${i})" title="Remove option" aria-label="Remove option">&times;</button>`:''}
    </div>`).join('')}
    ${q.options.length<6?`<button class="mc-add" onclick="addOpt('${q.id}')">＋ Add Option</button>`:''}
  </div>`;
  if(q.type==='tf')return`<div class="tf-row">
    <button class="tf-btn ${q.tfAnswer==='true'?'sel-true':''}" onclick="setTF('${q.id}','true')"> True</button>
    <button class="tf-btn ${q.tfAnswer==='false'?'sel-false':''}" onclick="setTF('${q.id}','false')"> False</button>
  </div>`;
  if(q.type==='sa')return`<div class="sa-ph">Students will type a short answer.</div>`;
  if(q.type==='essay')return`<div class="sa-ph" style="min-height:50px;">Students will write a long response.</div>`;
  return '';
}
function changeQType(id,type){const q=questions.find(x=>x.id===id);if(!q)return;q.type=type;if(type==='mc'&&(!q.options||!q.options.length))q.options=[{text:'',correct:true},{text:'',correct:false},{text:'',correct:false},{text:'',correct:false}];if(type==='tf')q.tfAnswer=q.tfAnswer||'true';document.getElementById('qo-'+id).innerHTML=renderOpts(q);}
function updateQ(id,f,v){const q=questions.find(x=>x.id===id);if(q)q[f]=f==='points'?parseInt(v)||1:v;}
function updateOpt(id,i,v){const q=questions.find(x=>x.id===id);if(q&&q.options[i])q.options[i].text=v;}
function setCorrect(id,i){const q=questions.find(x=>x.id===id);if(!q)return;q.options.forEach((o,j)=>o.correct=j===i);}
function addOpt(id){const q=questions.find(x=>x.id===id);if(!q||q.options.length>=6)return;q.options.push({text:'',correct:false});document.getElementById('qo-'+id).innerHTML=renderOpts(q);}
function removeOpt(id,i){const q=questions.find(x=>x.id===id);if(!q||q.options.length<=2)return;q.options.splice(i,1);if(!q.options.some(o=>o.correct))q.options[0].correct=true;document.getElementById('qo-'+id).innerHTML=renderOpts(q);}
function setTF(id,v){const q=questions.find(x=>x.id===id);if(!q)return;q.tfAnswer=v;document.getElementById('qo-'+id).innerHTML=renderOpts(q);}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

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
    questions:JSON.parse(JSON.stringify(questions)),
    totalPoints:questions.reduce((s,q)=>s+(parseInt(q.points)||0),0),
  };
}

async function publishQuiz(){
  const d=getQMData();
  if(!d.title){showQMsg('Enter a title.','err');return;}
  if(!d.questions.length){showQMsg('Add at least one question.','err');return;}
  if(!activeClassId){showQMsg('Select a class first.','err');return;}
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
    const quizzes=getQuizzes(); quizzes.push(d); saveQuizzes(quizzes);
    await syncQuizzesFromApiForClass(activeClassId);
    showQMsg(' Published!','ok'); resetQM(); renderSavedQuizzes();
  }catch(e){ showQMsg(e.message||'Publish failed.','err'); }
}
function saveDraft(){
  const d=getQMData();if(!d.title){showQMsg('Enter a title.','err');return;}
  d.published=false; const quizzes=getQuizzes(); quizzes.push(d); saveQuizzes(quizzes);
  showQMsg(' Draft saved.','ok'); renderSavedQuizzes();
}
function showQMsg(m,t){const el=document.getElementById('qm-msg');el.textContent=m;el.className='form-msg '+t;setTimeout(()=>el.textContent='',2500);}
function resetQM(){document.getElementById('qm-title').value='';document.getElementById('qm-instructions').value='';document.getElementById('qm-time').value='';document.getElementById('qm-due').value='';document.getElementById('qm-due-time').value='';questions=[];renderQMQuestions();}

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
    return q.classId===activeClassId&&q.teacherId===TEACHER_ID&&qmItemMatchesSection(q);
  });
  populateQmQuizFilterSelect(quizzes);
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
    var qid = JSON.stringify(q.id);
    return `<div class="saved-q-item">
      <div class="sq-icon">${q.type==='exam'?'Exam':q.type==='activity'?'Activity':'Quiz'}</div>
      <div style="flex:1;min-width:0;"><div class="sq-title">${q.title}${alertBadge}</div><div class="sq-meta">${q.questions.length}Q · ${q.totalPoints}pts${secLab} · ${q.published?'<span style="color:#10b981;">Published</span>':'<span style="color:#9ca3af;">Draft</span>'}</div></div>
      <div class="sq-actions">
        <button type="button" class="sq-log-btn" onclick="viewQuizLog(${qid})" title="Activity log">Log</button>
        <button type="button" class="sq-del-btn" onclick="deleteQuiz(${qid})" title="Remove this quiz">Delete</button>
      </div>
    </div>`;
  }).join('');
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

function viewQuizLog(quizId){
  const quiz=getQuizzes().find(q=>q.id===quizId); if(!quiz)return;
  const key='prism_quiz_log_'+quiz.classId+'_'+quiz.id;
  const log=JSON.parse(localStorage.getItem(key)||'[]');
  const existing=document.getElementById('quiz-log-modal'); if(existing)existing.remove();
  const modal=document.createElement('div');
  modal.id='quiz-log-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const typeColors={'start':'#d1fae5','submit':'#dbeafe','tab-switch':'#fef3c7','abandon':'#fee2e2'};
  const typeIcons={'start':'Start','submit':'Submit','tab-switch':'Tab','abandon':'Left'};
  const rows=log.length?log.slice().reverse().map(e=>{
    const t=new Date(e.time).toLocaleString();
    const bg=typeColors[e.type]||'#f9fafb';
    return `<div style="display:flex;gap:.8rem;align-items:flex-start;padding:.7rem .9rem;background:${bg};border-radius:10px;margin-bottom:.5rem;font-size:.83rem;">
      <span style="font-size:.65rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;flex-shrink:0;color:#374151;">${typeIcons[e.type]||e.type}</span>
      <div style="flex:1;"><div style="font-weight:700;color:#16132b;">${e.student} <span style="font-weight:400;color:#9ca3af;">(${e.studentId})</span></div>
      <div style="color:#374151;margin:.15rem 0;">${e.detail}</div>
      <div style="font-size:.75rem;color:#9ca3af;">${t}</div></div></div>`;
  }).join(''):'<div style="text-align:center;color:#9ca3af;padding:2rem;">No activity recorded yet.</div>';
  modal.innerHTML=`<div style="background:#fff;border-radius:20px;width:580px;max-width:94vw;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);padding:1.8rem 2rem;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;">
      <div><div style="font-family:DM Sans,sans-serif;font-size:1.15rem;font-weight:800;color:#16132b;"> Activity Log</div>
      <div style="font-size:.82rem;color:#9ca3af;">${quiz.title}</div></div>
      <button id="log-close-btn" style="background:#f0ecff;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem;"></button>
    </div>${rows}</div>`;
  document.body.appendChild(modal);
  document.getElementById('log-close-btn').onclick=function(){modal.remove();};
  modal.addEventListener('click',function(e){if(e.target===modal)modal.remove();});
}

window.addEventListener('DOMContentLoaded', async function(){
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
});
