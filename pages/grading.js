/** Page script for grading.html — keep HTML in the .html file. */
const TEACHER_ID = sessionStorage.getItem('prism_user_id') || 'teacher';
function getClasses()     { return JSON.parse(localStorage.getItem('prism_classes_'+TEACHER_ID)||'[]'); }
function getStudents(cid) { return JSON.parse(localStorage.getItem('prism_students_'+cid)||'[]'); }
function getQuizzes()     { return JSON.parse(localStorage.getItem('prism_teacher_quizzes')||'[]'); }
function getAssignments() { return JSON.parse(localStorage.getItem('prism_teacher_assignments')||'{}'); }

/** Align cached quizzes with MySQL so DB deletes disappear on Grading (same cache as Quiz Maker). */
function graderQuizBelongsToClass(q, classId) {
  return String(q.classId || q.class_id || '') === String(classId);
}
function mapApiQuizRowForGrading(q, classId) {
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
async function syncQuizzesFromApiForGrading(classId) {
  if (!classId || !TEACHER_ID) return;
  try {
    var list = await PrismQuizzes.get(classId);
    var apiIds = new Set((list || []).map(function (r) { return String(r.id); }));
    var mapped = (list || []).map(function (q) { return mapApiQuizRowForGrading(q, classId); });
    var all = getQuizzes();
    var otherClasses = all.filter(function (q) { return !graderQuizBelongsToClass(q, classId); });
    var localSame = all.filter(function (q) { return graderQuizBelongsToClass(q, classId); });
    var keepLocal = localSame.filter(function (q) {
      if (apiIds.has(String(q.id))) return false;
      if (!q.published) return true;
      return false;
    });
    localStorage.setItem('prism_teacher_quizzes', JSON.stringify(otherClasses.concat(mapped).concat(keepLocal)));
  } catch (e) {
    console.warn('syncQuizzesFromApiForGrading', e);
  }
}

/** quizId -> { studentId: API row } so Grading shows scores submitted from student browsers. */
var GRADE_quizApiScores = {};
async function hydrateQuizScoresFromApi(quizzes) {
  GRADE_quizApiScores = {};
  await Promise.all((quizzes || []).map(async function (q) {
    try {
      var rows = await PrismQuizzes.getScores(q.id);
      var map = {};
      (Array.isArray(rows) ? rows : []).forEach(function (r) {
        var sid = String(r.student_id || r.studentId || '');
        if (!sid) return;
        map[sid] = r;
        var scores = JSON.parse(localStorage.getItem('prism_quiz_scores_' + sid) || '{}');
        scores[q.id] = parseInt(r.score, 10);
        localStorage.setItem('prism_quiz_scores_' + sid, JSON.stringify(scores));
        var atts = JSON.parse(localStorage.getItem('prism_quiz_attempts_' + sid) || '{}');
        if (!atts[q.id]) {
          atts[q.id] = 1;
          localStorage.setItem('prism_quiz_attempts_' + sid, JSON.stringify(atts));
        }
        var answers = r.answers;
        if (typeof answers === 'string') {
          try { answers = JSON.parse(answers || '[]'); } catch (e) { answers = []; }
        }
        if (Array.isArray(answers)) {
          var sa = {};
          answers.forEach(function (a, i) {
            if (typeof a === 'string' && a) sa[i] = a;
          });
          if (Object.keys(sa).length) {
            localStorage.setItem('prism_quiz_sa_' + sid + '_' + q.id, JSON.stringify(sa));
          }
        }
      });
      GRADE_quizApiScores[String(q.id)] = map;
    } catch (e) {
      console.warn('hydrateQuizScoresFromApi', q && q.id, e);
    }
  }));
}

var activeClassId = null;
var activeType    = 'quiz';
var activeSectionGrading = 'all';
/** __all__ or assignment id — which assignment grading table to show */
var activeAssignmentGradingFilter = '__all__';
/** __all__ or quiz id — filter quiz/activity cards on Grading (per class + tab in sessionStorage) */
var activeGradingQuizActivityFilter = '__all__';
window.currentSAScores = {};

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function gradingAsgnFilterStorageKey(){
  return 'prism_grading_asgn_filter_' + activeClassId;
}
function loadGradingAssignmentFilter(){
  if(!activeClassId){ activeAssignmentGradingFilter='__all__'; return; }
  try{
    var v=sessionStorage.getItem(gradingAsgnFilterStorageKey());
    activeAssignmentGradingFilter=(v!=null&&v!=='')?v:'__all__';
  }catch(e){ activeAssignmentGradingFilter='__all__'; }
}
function saveGradingAssignmentFilter(id){
  activeAssignmentGradingFilter=id;
  try{ if(activeClassId) sessionStorage.setItem(gradingAsgnFilterStorageKey(),id); }catch(e){}
}
function gradingQAFilterStorageKey(){
  return 'prism_grading_qa_filter_' + activeClassId + '_' + activeType;
}
function loadGradingQAFilter(){
  if(!activeClassId || (activeType !== 'quiz' && activeType !== 'activity')) {
    activeGradingQuizActivityFilter = '__all__';
    return;
  }
  try{
    var v = sessionStorage.getItem(gradingQAFilterStorageKey());
    activeGradingQuizActivityFilter = (v != null && v !== '') ? v : '__all__';
  } catch(e) { activeGradingQuizActivityFilter = '__all__'; }
}
function saveGradingQAFilter(id){
  activeGradingQuizActivityFilter = id;
  try { if(activeClassId) sessionStorage.setItem(gradingQAFilterStorageKey(), id); } catch(e) {}
}
function populateGradingQAFilterSelect(quizzes, labelText){
  var wrap = document.getElementById('grading-qa-filter-wrap');
  var sel = document.getElementById('grading-qa-filter-select');
  var lab = document.getElementById('grading-qa-filter-label');
  if(!wrap || !sel) return;
  if(lab) lab.textContent = labelText || 'Filter';
  var sorted = (quizzes || []).slice().sort(function(a, b){
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  });
  sel.innerHTML = '';
  var o0 = document.createElement('option');
  o0.value = '__all__';
  o0.textContent = activeType === 'activity' ? 'All activities' : 'All quizzes';
  sel.appendChild(o0);
  sorted.forEach(function(it){
    var o = document.createElement('option');
    o.value = String(it.id);
    o.textContent = it.title || 'Untitled';
    sel.appendChild(o);
  });
  var ids = new Set(sorted.map(function(it){ return String(it.id); }));
  if(activeGradingQuizActivityFilter !== '__all__' && !ids.has(activeGradingQuizActivityFilter)){
    activeGradingQuizActivityFilter = '__all__';
    saveGradingQAFilter('__all__');
  }
  sel.value = activeGradingQuizActivityFilter;
  sel.onchange = function(){
    saveGradingQAFilter(sel.value);
    renderGrading().catch(function(e){ console.error(e); });
  };
  wrap.style.display = sorted.length ? 'block' : 'none';
}

function populateGradingAssignmentFilterSelect(assignments){
  var wrap=document.getElementById('grading-asgn-filter-wrap');
  var sel=document.getElementById('grading-asgn-filter-select');
  if(!wrap||!sel) return;
  var sorted=(assignments||[]).slice().sort(function(a,b){
    return String(a.title||'').localeCompare(String(b.title||''),undefined,{sensitivity:'base'});
  });
  sel.innerHTML='';
  var o0=document.createElement('option');
  o0.value='__all__';
  o0.textContent='All assignments';
  sel.appendChild(o0);
  sorted.forEach(function(it){
    var o=document.createElement('option');
    o.value=String(it.id);
    o.textContent=it.title||'Untitled';
    sel.appendChild(o);
  });
  var ids=new Set(sorted.map(function(it){ return String(it.id); }));
  if(activeAssignmentGradingFilter!=='__all__'&&!ids.has(activeAssignmentGradingFilter)){
    activeAssignmentGradingFilter='__all__';
    saveGradingAssignmentFilter('__all__');
  }
  sel.value=activeAssignmentGradingFilter;
  sel.onchange=function(){
    saveGradingAssignmentFilter(sel.value);
    renderGrading().catch(function(e){ console.error(e); });
  };
  wrap.style.display=sorted.length?'block':'none';
}

function onClassChange(id){
  activeClassId=id;
  activeSectionGrading='all';
  try { sessionStorage.setItem('prism_teacher_active_class_id', id); } catch (e) {}
  loadGradingAssignmentFilter();
  renderGradingSectionPills();
  renderGrading().catch(function(e){ console.error(e); });
}

function getGradingSections(){
  var students=getStudents(activeClassId);
  var set=new Set();
  students.forEach(function(s){
    var sec=(s.section||'').trim();
    if(sec) set.add(sec);
  });
  return ['all'].concat(Array.from(set).sort());
}

function renderGradingSectionPills(){
  var wrap=document.getElementById('grading-section-wrap');
  var cont=document.getElementById('section-pills-grading');
  if(!wrap||!cont) return;
  if(!activeClassId){ wrap.style.display='none'; return; }
  var secs=getGradingSections();
  if(secs.length<=1){ wrap.style.display='none'; return; }
  wrap.style.display='block';
  cont.innerHTML='';
  secs.forEach(function(sec){
    var btn=document.createElement('button');
    btn.type='button';
    btn.className='section-pill'+(sec===activeSectionGrading?' active':'');
    btn.textContent=sec==='all'?'All Sections':sec;
    btn.onclick=function(){
      activeSectionGrading=sec;
      renderGradingSectionPills();
      renderGrading().catch(function(e){ console.error(e); });
    };
    cont.appendChild(btn);
  });
}

function studentsFilteredForGrading(){
  var students=getStudents(activeClassId);
  if(!activeSectionGrading||activeSectionGrading==='all') return students;
  return students.filter(function(s){ return (String(s.section||'').trim()||'General')===activeSectionGrading; });
}

function switchType(type,btn){
  activeType=type;
  document.querySelectorAll('.type-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderGrading().catch(function(e){ console.error(e); });
}

async function renderGrading(){
  var cont=document.getElementById('grading-content');
  var asgWrap=document.getElementById('grading-asgn-filter-wrap');
  var qaWrap=document.getElementById('grading-qa-filter-wrap');
  if(!activeClassId){
    if(asgWrap) asgWrap.style.display='none';
    if(qaWrap) qaWrap.style.display='none';
    cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;">Select a class above.</div>';
    return;
  }
  renderGradingSectionPills();
  if(activeType!=='assignment'&&asgWrap) asgWrap.style.display='none';
  if((activeType!=='quiz'&&activeType!=='activity')&&qaWrap) qaWrap.style.display='none';
  if(activeType==='quiz') {
    cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;"><span style="font-size:1.5rem;display:block;margin-bottom:.5rem;"></span>Loading quizzes…</div>';
    await renderGradingQuizzes(cont);
  } else if(activeType==='activity') {
    cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;"><span style="font-size:1.5rem;display:block;margin-bottom:.5rem;"></span>Loading activities…</div>';
    await renderGradingActivities(cont);
  } else {
    try {
      await renderGradingAssignments(cont);
    } catch(e) {
      console.error(e);
      cont.innerHTML='<div style="padding:2rem;text-align:center;color:#ef4444;">Could not load assignment submissions. Check your connection and try again.</div>';
    }
  }
}

function GRADER_assignmentAttachMeta(row){
  if(!row||typeof row!=='object') return {url:'',path:'',name:'',mime:''};
  return {
    url:String(row.attach_url!=null?row.attach_url:row.attachUrl||'').trim(),
    path:String(row.attach_file_path!=null?row.attach_file_path:row.attachFilePath||'').trim(),
    name:String(row.attach_file_name!=null?row.attach_file_name:row.attachFileName||'file'),
    mime:String(row.attach_mime!=null?row.attach_mime:row.attachMime||'')
  };
}

function GRADER_assignmentRefHtml(asgn){
  var m=GRADER_assignmentAttachMeta(asgn);
  var bits=[];
  if(m.url){
    var hrefAu=/^https?:\/\//i.test(m.url)?m.url:('https://'+m.url);
    var vidEmb=typeof prismVideoEmbedFromUrl==='function'?prismVideoEmbedFromUrl(hrefAu):null;
    if(vidEmb&&vidEmb.embed){
      bits.push('<div style="margin:.35rem 0 0;"><div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;background:#0f172a;margin-bottom:.45rem;"><iframe src="'+esc(vidEmb.embed)+'" title="Reference video" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div><a href="'+esc(hrefAu)+'" target="_blank" rel="noopener" style="font-size:.8rem;font-weight:700;color:#4f46e5;"> Open video in new tab</a></div>');
    }else{
      bits.push('<div style="margin:.35rem 0 0;"><a href="'+esc(hrefAu)+'" target="_blank" rel="noopener" style="font-size:.8rem;font-weight:700;color:#4f46e5;word-break:break-all;"> '+esc(m.url.length>96?m.url.slice(0,96)+'…':m.url)+'</a></div>');
    }
  }
  if(m.path){
    var prev=typeof prismCanPreviewInBrowser==='function'&&prismCanPreviewInBrowser(m.mime,m.name);
    var kind=typeof prismMaterialKind==='function'?prismMaterialKind(m.mime,m.name,'file'):'';
    var abs=typeof GRADER_absUploadUrl==='function'?GRADER_absUploadUrl(m.path):m.path;
    if(kind==='image'||GRADER_isImageMime(m.mime,m.name)){
      bits.push('<div style="margin:.35rem 0 0;"><img src="'+esc(abs)+'" alt="" style="max-width:100%;max-height:180px;border-radius:10px;border:1px solid #e4dffa;"/></div>');
    }else if(kind==='video-file'){
      bits.push('<video src="'+esc(abs)+'" controls style="width:100%;max-height:220px;border-radius:10px;margin-top:.35rem;background:#0f172a;"></video>');
    }
    bits.push('<div style="display:flex;flex-wrap:wrap;gap:.5rem;margin:.35rem 0 0;align-items:center;"><span style="font-size:.75rem;color:#9ca3af;">Reference file:</span>'
      +'<button type="button" onclick=\'prismOpenMaterialUrl('+JSON.stringify(m.path)+','+JSON.stringify(m.mime)+','+JSON.stringify(m.name)+')\' style="padding:.3rem .75rem;border-radius:8px;background:#ede9fe;color:#5b21b6;font-size:.76rem;font-weight:700;border:1.5px solid #c4b5fd;cursor:pointer;">'+(prev?' View':' Open')+'</button>'
      +'<a href="'+esc(m.path)+'" download="'+esc(m.name)+'" style="font-size:.72rem;color:#7c3aed;font-weight:700;"> Save</a></div>');
  }
  if(!bits.length) return '';
  return '<div style="margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid #f0ecff;"><div style="font-size:.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:.35rem;">Attached to this assignment</div>'+bits.join('')+'</div>';
}

function GRADER_absUploadUrl(path){
  if(typeof prismResolveUploadUrl==='function') return prismResolveUploadUrl(path);
  if(!path) return '';
  var s=String(path);
  if(/^https?:\/\//i.test(s)) return s;
  if(s.charAt(0)==='/') return (window.location.origin||'')+s;
  try{ return new URL(s,window.location.href).href; }catch(e){ return s; }
}
function GRADER_isImageMime(mime,name){
  var m=String(mime||'').toLowerCase();
  if(m.indexOf('image/')===0) return true;
  var ext=(String(name||'').split('.').pop()||'').toLowerCase();
  return ['jpg','jpeg','png','gif','webp','bmp','svg'].indexOf(ext)>=0;
}

/** Google Classroom–style: “Files attached” panel with thumbnails / doc icons + Open & Download. */
function GRADER_submissionFilesHtml(sub){
  if(!sub) return '';
  var parts=[];
  if(sub.link_url&&String(sub.link_url).trim()){
    var lu=esc(String(sub.link_url).trim());
    parts.push('<div class="gc-files-section"><div class="gc-files-label">Link attached</div>'
      +'<div class="gc-link-row"><div class="gc-attach-bar"></div><div class="gc-link-body"><a href="'+lu+'" target="_blank" rel="noopener">'+lu+'</a></div></div></div>');
  }
  var items=[];
  var parsed=null;
  try{
    if(sub.attachments_json!=null&&sub.attachments_json!==''){
      var raw=sub.attachments_json;
      if(typeof raw==='string'){
        var t=raw.trim();
        parsed=t?JSON.parse(t):[];
      } else if(Array.isArray(raw)){
        parsed=raw;
      }
    }
  }catch(e){ parsed=null; }
  var hasList=Array.isArray(parsed)&&parsed.length>0;
  if(hasList){
    parsed.forEach(function(a){
      if(a&&a.path) items.push({path:a.path,mime:a.mime||'',name:a.name||'file'});
    });
  }
  if(!items.length&&sub.file_path){
    items.push({path:sub.file_path,mime:sub.mime_type||'',name:sub.file_name||'file'});
  }
  var inlineCount=0;
  if(hasList) parsed.forEach(function(a){ if(a&&a.inline) inlineCount++; });

  var fileCards=[];
  items.forEach(function(it){
    var path=it.path,mime=it.mime,name=it.name||'file';
    var urlAbs=GRADER_absUploadUrl(path);
    var isImg=GRADER_isImageMime(mime,name);
    var oj='onclick=\'prismOpenMaterialUrl('+JSON.stringify(path)+','+JSON.stringify(mime)+','+JSON.stringify(name)+')\'';
    var thumb;
    var kind=typeof prismMaterialKind==='function'?prismMaterialKind(mime,name,'file'):'';
    var extraPreview='';
    if(isImg&&urlAbs){
      thumb='<div class="gc-attach-preview" '+oj+' title="Open preview"><img src="'+esc(urlAbs)+'" alt=""/></div>';
    }else if(kind==='video-file'&&urlAbs){
      thumb='<div class="gc-attach-preview gc-doc" '+oj+' title="Open"></div>';
      extraPreview='<video src="'+esc(urlAbs)+'" controls style="width:100%;max-height:220px;border-radius:8px;margin-top:.4rem;background:#0f172a;"></video>';
    }else{
      var ext=(name.split('.').pop()||'').toLowerCase();
      var em='';
      if(ext==='pdf') em='';
      else if(['png','jpg','jpeg','gif','webp'].indexOf(ext)>=0) em='';
      else if(['doc','docx'].indexOf(ext)>=0) em='';
      else if(['ppt','pptx'].indexOf(ext)>=0) em='';
      else if(['xls','xlsx','csv'].indexOf(ext)>=0) em='';
      else if(['zip','rar','7z'].indexOf(ext)>=0) em='';
      thumb='<div class="gc-attach-preview gc-doc" '+oj+' title="Open">'+em+'</div>';
    }
    fileCards.push('<div class="gc-attach-card"><div class="gc-attach-bar"></div>'+thumb
      +'<div class="gc-attach-body"><div class="gc-attach-name">'+esc(name)+'</div>'
      +extraPreview
      +'<div class="gc-attach-actions"><button type="button" class="gc-attach-open" '+oj+'>Open</button>'
      +'<a class="gc-attach-dl" href="'+esc(GRADER_absUploadUrl(path))+'" download="'+esc(name)+'">Download</a></div></div></div>');
  });
  if(sub.file_data&&!items.length){
    var fn=esc(sub.file_name||'Submitted file');
    fileCards.push('<div class="gc-attach-card"><div class="gc-attach-bar"></div><div class="gc-attach-preview gc-doc"></div>'
      +'<div class="gc-attach-body"><div class="gc-attach-name">'+fn+'</div>'
      +'<div class="gc-attach-actions"><button type="button" class="gc-attach-open grader-sub-dl-btn">Download</button></div></div></div>');
  }else if(inlineCount>0&&!items.length&&!sub.file_data){
    parsed.forEach(function(a){
      if(a&&a.inline){
        fileCards.push('<div class="gc-attach-card"><div class="gc-attach-bar"></div><div class="gc-attach-preview gc-doc"></div>'
          +'<div class="gc-attach-body"><div class="gc-attach-name">'+esc(a.name||'file')+'</div>'
          +'<div class="gc-attach-actions"><span style="font-size:.72rem;color:#5f6368;">No separate file on server</span></div></div></div>');
      }
    });
  }
  if(fileCards.length){
    var n=fileCards.length;
    parts.push('<div class="gc-files-section"><div class="gc-files-label">Files attached'+(n>1?' · '+n:'')+'</div>'+fileCards.join('')+'</div>');
  }
  return parts.join('');
}

function GRADER_collectSubFiles(sub){
  var items=[];
  if(!sub) return items;
  var parsed=null;
  try{
    if(sub.attachments_json!=null&&sub.attachments_json!==''){
      var raw=sub.attachments_json;
      parsed=typeof raw==='string'?(raw.trim()?JSON.parse(raw.trim()):[]):(Array.isArray(raw)?raw:null);
    }
  }catch(e){ parsed=null; }
  if(Array.isArray(parsed)){
    parsed.forEach(function(a){ if(a&&a.path) items.push({path:a.path,mime:a.mime||'',name:a.name||'file'}); });
  }
  if(!items.length&&sub.file_path){
    items.push({path:sub.file_path,mime:sub.mime_type||'',name:sub.file_name||'file'});
  }
  return items;
}

function GRADER_teacherSourceThumbs(asgn){
  var m=GRADER_assignmentAttachMeta(asgn);
  var bits=[];
  if(m.path&&GRADER_isImageMime(m.mime,m.name)){
    bits.push('<img class="roster-thumb roster-thumb-lg" src="'+esc(GRADER_absUploadUrl(m.path))+'" alt="Teacher source" title="Image sent by teacher" onclick=\'prismOpenMaterialUrl('+JSON.stringify(m.path)+','+JSON.stringify(m.mime)+','+JSON.stringify(m.name)+')\'/>');
  } else if(m.path){
    var kind=typeof prismMaterialKind==='function'?prismMaterialKind(m.mime,m.name,'file'):'';
    var ic=kind==='video-file'?'':(kind==='pdf'?'':'');
    bits.push('<button type="button" class="roster-file-chip" onclick=\'prismOpenMaterialUrl('+JSON.stringify(m.path)+','+JSON.stringify(m.mime)+','+JSON.stringify(m.name)+')\'>'+ic+' Teacher source</button>');
  }
  if(m.url){
    var href=/^https?:\/\//i.test(m.url)?m.url:('https://'+m.url);
    bits.push('<a class="roster-file-chip" href="'+esc(href)+'" target="_blank" rel="noopener"> Teacher link</a>');
  }
  return bits.join('');
}

function GRADER_studentWorkThumbs(sub){
  var items=GRADER_collectSubFiles(sub);
  if(!items.length){
    if(sub&&sub.link_url) return '<a class="roster-file-chip" href="'+esc(sub.link_url)+'" target="_blank" rel="noopener"></a>';
    return '<span style="color:#d1d5db;">—</span>';
  }
  return '<div class="roster-thumbs">'+items.map(function(it){
    var abs=GRADER_absUploadUrl(it.path);
    var oj='prismOpenMaterialUrl('+JSON.stringify(it.path)+','+JSON.stringify(it.mime)+','+JSON.stringify(it.name)+')';
    if(GRADER_isImageMime(it.mime,it.name)&&abs){
      return '<img class="roster-thumb" src="'+esc(abs)+'" alt="'+esc(it.name)+'" title="Submitted by student" onclick=\''+oj+'\'/>';
    }
    var kind=typeof prismMaterialKind==='function'?prismMaterialKind(it.mime,it.name,'file'):'';
    var ic=kind==='video-file'?'':(kind==='pdf'?'':'');
    return '<button type="button" class="roster-file-chip" onclick=\''+oj+'\'>'+ic+'</button>';
  }).join('')+'</div>';
}

function gradeDownloadSubBlob(fileData, fileName){
  if(!fileData) return;
  var a=document.createElement('a');
  a.href=fileData;
  a.download=fileName||'submission';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function gradeOpenAsgnWork(aid, sid, maxPts){
  var cache=window.__gradeSubsCache||{};
  var subs=cache[aid]||[];
  var sub=subs.find(function(x){ return String(x.student_id)===String(sid); });
  var students=getStudents(activeClassId);
  var st=students.find(function(s){ return String(s.id)===String(sid); });
  var stName=st?st.name:String(sid);
  var title=(window.__gradeAsgnTitles&&window.__gradeAsgnTitles[aid])||'Assignment';
  var asgnMeta=(window.__gradeAsgnById&&window.__gradeAsgnById[aid])||null;
  var refHtml=GRADER_assignmentRefHtml(asgnMeta);
  var old=document.getElementById('asgn-subgrade-modal');
  if(old) old.remove();
  var modal=document.createElement('div');
  modal.id='asgn-subgrade-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(10,10,20,.72);backdrop-filter:blur(8px);z-index:10002;display:flex;align-items:center;justify-content:center;padding:1.2rem;overflow-y:auto;';
  var hasWork=sub&&(sub.file_path||sub.file_data||sub.note||sub.link_url||sub.attachments_json);
  var asnKey='prism_asn_grades_'+activeClassId;
  var asnGrades=JSON.parse(localStorage.getItem(asnKey)||'{}');
  var grade=(asnGrades[aid]&&asnGrades[aid][sid])||{};
  var scoreVal=grade.score!==undefined&&grade.score!==''?String(grade.score):'';
  var remarksVal=grade.remarks||'';
  var bodyInner='';
  if(!hasWork){
    bodyInner=refHtml+'<p style="color:#9ca3af;font-size:.9rem;margin:0;">No submission yet for this student.</p>';
  } else {
    bodyInner=refHtml
      +GRADER_submissionFilesHtml(sub)
      +(sub.note?'<div style="margin-bottom:.75rem;margin-top:.65rem;"><div style="font-size:.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:.25rem;">Written response</div><div style="background:#f9fafb;border:1.5px solid #e4dffa;border-radius:10px;padding:.75rem 1rem;font-size:.88rem;color:#374151;white-space:pre-wrap;line-height:1.55;">'+esc(sub.note)+'</div></div>':'')
      +(sub.submitted_at?'<div style="font-size:.75rem;color:#9ca3af;margin-top:.75rem;">Submitted '+new Date(sub.submitted_at).toLocaleString()+'</div>':'');
  }
  modal.innerHTML='<div style="background:#fff;border-radius:18px;width:620px;max-width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);">'+
    '<div style="padding:1.2rem 1.35rem;border-bottom:1px solid #f0ecff;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;">'+
    '<div><div style="font-family:DM Sans,sans-serif;font-size:1.05rem;font-weight:800;color:#16132b;">'+esc(title)+'</div>'+
    '<div style="font-size:.82rem;color:#9ca3af;margin-top:.2rem;">'+esc(stName)+(st&&st.section?' · '+esc(st.section):'')+'</div></div>'+
    '<button type="button" id="asgn-subgrade-close" style="background:#f3f4f6;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem;flex-shrink:0;">×</button></div>'+
    '<div style="padding:1.1rem 1.35rem 1.25rem;">'+bodyInner+
    '<div style="margin-top:1.1rem;padding-top:1rem;border-top:1px solid #f0ecff;display:grid;grid-template-columns:1fr 1fr;gap:.75rem;align-items:end;">'+
    '<div><label style="font-size:.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;display:block;margin-bottom:.25rem;">Score (max '+esc(String(maxPts||'—'))+')</label>'+
    '<input type="number" id="asgn-grade-score" min="0" max="'+(maxPts||100)+'" placeholder="—" value="'+esc(scoreVal)+'" style="width:100%;border:1.5px solid #e4dffa;border-radius:8px;padding:.45rem .6rem;font-size:.9rem;"/></div>'+
    '<div style="grid-column:1/-1;"><label style="font-size:.68rem;font-weight:700;color:#9ca3af;text-transform:uppercase;display:block;margin-bottom:.25rem;">Remarks</label>'+
    '<input type="text" id="asgn-grade-remarks" placeholder="Optional feedback…" value="'+esc(remarksVal)+'" style="width:100%;border:1.5px solid #e4dffa;border-radius:8px;padding:.45rem .6rem;font-size:.85rem;"/></div>'+
    '<button type="button" id="asgn-grade-save" style="grid-column:1/-1;padding:.55rem 1rem;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:.88rem;cursor:pointer;font-family:DM Sans,sans-serif;">Save score &amp; remarks</button></div></div></div>';
  document.body.appendChild(modal);
  if(sub&&sub.file_data){
    modal.querySelectorAll('.grader-sub-dl-btn').forEach(function(db){
      db.onclick=function(){ gradeDownloadSubBlob(sub.file_data, sub.file_name||'submission'); };
    });
  }
  document.getElementById('asgn-subgrade-close').onclick=function(){ modal.remove(); };
  modal.addEventListener('click',function(e){ if(e.target===modal) modal.remove(); });
  document.getElementById('asgn-grade-save').onclick=function(){
    var sc=document.getElementById('asgn-grade-score').value;
    var rm=document.getElementById('asgn-grade-remarks').value;
    gradeAssignment(aid,sid,sc);
    gradeAssignmentRemarks(aid,sid,rm);
    modal.remove();
    renderGrading().catch(function(e){ console.error(e); });
  };
}
window.gradeOpenAsgnWork=gradeOpenAsgnWork;

function GRADE_normalizeQ(raw){
  var out={q:raw.q||raw.question||'(no text)',type:raw.type||'mc',points:parseInt(raw.points)||1};
  if(raw.type==='sa'||raw.type==='essay'){out.choices=undefined;}
  else if(raw.type==='tf'){out.choices=['True','False'];out.answer=(raw.tfAnswer==='true'||raw.tfAnswer===true)?0:1;}
  else if(raw.options&&raw.options.length){
    out.choices=raw.options.map(o=>o.text||'');
    out.answer=raw.options.findIndex(o=>o.correct);
    if(out.answer<0)out.answer=0;
  } else {out.choices=raw.choices;out.answer=raw.answer||0;}
  return out;
}

function buildStudentRow(q,s){
  var apiRow=(GRADE_quizApiScores[String(q.id)]||{})[String(s.id)];
  var scores=JSON.parse(localStorage.getItem('prism_quiz_scores_'+s.id)||'{}'  );
  var atts=JSON.parse(localStorage.getItem('prism_quiz_attempts_'+s.id)||'{}'  );
  var ip=JSON.parse(localStorage.getItem('prism_quiz_inprogress_'+s.id)||'{}'  );
  var log=JSON.parse(localStorage.getItem('prism_quiz_log_'+q.classId+'_'+q.id)||'[]');
  var scoreVal=apiRow&&apiRow.score!=null?apiRow.score:(scores[q.id]!==undefined?scores[q.id]:scores[String(q.id)]);
  var scored=scoreVal!==undefined&&scoreVal!==null;
  var attCount=atts[q.id]||atts[String(q.id)]||0;
  if(scored&&!attCount) attCount=1;
  var inProgress=!!(ip[q.id]||ip[String(q.id)]);
  var warnings=log.filter(e=>String(e.studentId)===String(s.id)&&(e.type==='tab-switch'||e.type==='abandon')).length;
  var statusHtml=scored
    ?'<span style="background:#d1fae5;color:#065f46;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px;"> '+scoreVal+'/'+q.totalPoints+'</span>'
    :(inProgress||attCount)
    ?'<span style="background:#fef3c7;color:#92400e;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px;"> Incomplete</span>'
    :'<span style="background:#f3f4f6;color:#9ca3af;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px;">Not taken</span>';
  var warnHtml=warnings?'<span style="background:#fee2e2;color:#dc2626;font-size:.7rem;font-weight:700;padding:2px 7px;border-radius:20px;margin-left:.4rem;"> '+warnings+'</span>':'';
  var sid=esc(s.id),qid=esc(q.id);
  var viewBtn=(scored||attCount||inProgress)
    ?'<button onclick="openQuizReview(\''+sid+'\',\''+qid+'\')" style="padding:.32rem .9rem;background:none;border:1.5px solid #7c3aed;color:#7c3aed;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;">Review →</button>'
    :'<span style="font-size:.78rem;color:#d1d5db;">—</span>';
  return '<tr><td><strong style="color:#16132b;">'+esc(s.name)+'</strong></td><td style="font-size:.8rem;color:#6b7280;">'+( s.section||'\u2014')+'</td><td>'+statusHtml+warnHtml+'</td><td style="font-size:.8rem;color:#6b7280;">'+attCount+'</td><td>'+viewBtn+'</td></tr>';
}

function buildQuizCard(q){
  var students=studentsFilteredForGrading();
  var icon=q.type==='exam'?'Exam':q.type==='activity'?'Activity':'Quiz';
  if(!students.length) return '<div class="t-card" style="text-align:center;color:#9ca3af;padding:2rem;">No students enrolled yet.</div>';
  var rows=students.map(s=>buildStudentRow(q,s)).join('');
  return '<div class="t-card" style="margin-bottom:1.4rem;">'+
    '<div style="display:flex;align-items:center;gap:.7rem;margin-bottom:1rem;flex-wrap:wrap;">'+
    '<span style="font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#059669;background:#ecfdf5;padding:3px 8px;border-radius:6px;">'+icon+'</span>'+
    '<div><div style="font-family:DM Sans,sans-serif;font-weight:800;color:#16132b;">'+esc(q.title||'Untitled')+'</div>'+
    '<div style="font-size:.75rem;color:#9ca3af;">'+((q.questions&&q.questions.length)||0)+' questions \u00b7 '+q.totalPoints+' pts'+((q.due||q.due_date)?' \u00b7 Due '+(typeof prismFormatDueLine==='function'?prismFormatDueLine(q.due||q.due_date,q.due_time):(q.due||q.due_date)):'')+'</div></div></div>'+
    '<div class="prism-table-scroll"><table>'+
    '<thead><tr><th>Student</th><th>Section</th><th>Status</th><th>Attempts</th><th>Actions</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div></div>';
}

async function renderGradingQuizzes(cont){
  await syncQuizzesFromApiForGrading(activeClassId);
  loadGradingQAFilter();
  var quizzes=getQuizzes().filter(q=>graderQuizBelongsToClass(q,activeClassId)&&String(q.teacherId||q.teacher_id)===String(TEACHER_ID)&&q.published&&q.type!=='activity');
  populateGradingQAFilterSelect(quizzes,'Filter by quiz');
  if(!quizzes.length){
    cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;">No published quizzes or exams yet.</div>';
    return;
  }
  var filtered=activeGradingQuizActivityFilter==='__all__'?quizzes:quizzes.filter(function(q){ return String(q.id)===activeGradingQuizActivityFilter; });
  if(!filtered.length){
    cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;">No quiz matches this filter. Choose <strong>All quizzes</strong> above.</div>';
    return;
  }
  await hydrateQuizScoresFromApi(filtered);
  cont.innerHTML=filtered.map(buildQuizCard).join('');
}
async function renderGradingActivities(cont){
  await syncQuizzesFromApiForGrading(activeClassId);
  loadGradingQAFilter();
  var quizzes=getQuizzes().filter(q=>graderQuizBelongsToClass(q,activeClassId)&&String(q.teacherId||q.teacher_id)===String(TEACHER_ID)&&q.published&&q.type==='activity');
  populateGradingQAFilterSelect(quizzes,'Filter by activity');
  if(!quizzes.length){
    cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;">No activities published yet.</div>';
    return;
  }
  var filtered=activeGradingQuizActivityFilter==='__all__'?quizzes:quizzes.filter(function(q){ return String(q.id)===activeGradingQuizActivityFilter; });
  if(!filtered.length){
    cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;">No activity matches this filter. Choose <strong>All activities</strong> above.</div>';
    return;
  }
  await hydrateQuizScoresFromApi(filtered);
  cont.innerHTML=filtered.map(buildQuizCard).join('');
}
async function renderGradingAssignments(cont){
  cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;"><span style="font-size:1.5rem;display:block;margin-bottom:.5rem;"></span>Loading submissions…</div>';
  var assignments=(getAssignments()[activeClassId]||[]);
  try{
    var live=await PrismAssignments.get(activeClassId);
    if(Array.isArray(live)){
      assignments=live;
      try{
        var allA=JSON.parse(localStorage.getItem('prism_teacher_assignments')||'{}');
        allA[activeClassId]=live;
        localStorage.setItem('prism_teacher_assignments',JSON.stringify(allA));
      }catch(e2){}
    }
  }catch(e){ console.warn('grading assignments refresh',e); }
  loadGradingAssignmentFilter();
  populateGradingAssignmentFilterSelect(assignments);
  if(!assignments.length){ cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;">No assignments created yet.</div>'; return; }
  var filteredAsgns=activeAssignmentGradingFilter==='__all__'
    ? assignments
    : assignments.filter(function(a){ return String(a.id)===activeAssignmentGradingFilter; });
  if(!filteredAsgns.length){
    cont.innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;">No assignment matches this filter. Choose <strong>All assignments</strong> above.</div>';
    return;
  }
  var students=studentsFilteredForGrading();
  var subsByAsgn={};
  try {
    await Promise.all(filteredAsgns.map(async function(asgn){
      try { subsByAsgn[asgn.id]=await PrismSubmissions.getAll(asgn.id); } catch(e){ subsByAsgn[asgn.id]=[]; }
    }));
  } catch(e){ console.warn('submissions load', e); }
  window.__gradeSubsCache=subsByAsgn;
  window.__gradeAsgnTitles={};
  window.__gradeAsgnById={};
  filteredAsgns.forEach(function(a){
    window.__gradeAsgnTitles[a.id]=a.title||'Assignment';
    window.__gradeAsgnById[a.id]=a;
  });
  var asnKey='prism_asn_grades_'+activeClassId;
  var asnGrades=JSON.parse(localStorage.getItem(asnKey)||'{}');
  var icons={written:'Written',project:'Project',lab:'Lab',oral:'Oral'};
  var html=filteredAsgns.slice().reverse().map(function(asgn){
    var aidRaw=asgn.id;
    var aid=esc(aidRaw);
    var ptsMax=asgn.pts!=null?asgn.pts:(asgn.points!=null?asgn.points:100);
    var rows=students.map(function(s){
      var sidRaw=s.id;
      var sid=esc(sidRaw);
      var sub=(subsByAsgn[aidRaw]||[]).find(function(x){ return String(x.student_id)===String(sidRaw); });
      var hasSub=sub&&(sub.file_path||sub.file_data||sub.note||sub.link_url||sub.attachments_json);
      var turnInHtml=hasSub
        ?'<span style="font-size:.72rem;color:#059669;font-weight:700;"></span>'
        :'<span style="font-size:.72rem;color:#d1d5db;">—</span>';
      var avHtml=typeof prismRosterAvatarHtml==='function'?prismRosterAvatarHtml(s,28):'';
      var viewBtn='<button type="button" onclick=\'gradeOpenAsgnWork('+JSON.stringify(aidRaw)+','+JSON.stringify(sidRaw)+','+JSON.stringify(ptsMax)+')\' style="padding:.28rem .65rem;background:none;border:1.5px solid #7c3aed;color:#7c3aed;border-radius:8px;font-size:.74rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;">View work</button>';
      var grade=(asnGrades[asgn.id]&&asnGrades[asgn.id][s.id])||{};
      var scored=grade.score!==undefined&&grade.score!=='';
      var statusHtml=scored
        ?'<span style="background:#d1fae5;color:#065f46;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px;"> '+grade.score+'\/'+ptsMax+'</span>'
        :'<span style="background:#f3f4f6;color:#9ca3af;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px;">Not graded</span>';
      return '<tr><td><div style="display:flex;align-items:center;gap:.5rem;">'+avHtml+'<strong style="color:#16132b;">'+esc(s.name)+'</strong></div></td><td style="font-size:.8rem;color:#6b7280;">'+(s.section||'\u2014')+'</td><td style="text-align:center;">'+turnInHtml+'</td><td>'+GRADER_studentWorkThumbs(sub)+'</td><td>'+viewBtn+'</td><td>'+statusHtml+'</td>'+
        '<td><input type="number" min="0" max="'+ptsMax+'" placeholder="\u2014" value="'+(scored?esc(String(grade.score)):'')+'" style="width:65px;border:1.5px solid #e4dffa;border-radius:8px;padding:.3rem .5rem;font-size:.83rem;text-align:center;font-family:DM Sans,sans-serif;" onchange="gradeAssignment(\''+aid+'\',\''+sid+'\',this.value)"/></td>'+
        '<td><input type="text" placeholder="Remarks\u2026" value="'+esc(grade.remarks||'')+'" style="width:120px;border:1.5px solid #e4dffa;border-radius:8px;padding:.3rem .6rem;font-size:.8rem;font-family:DM Sans,sans-serif;color:#374151;" onchange="gradeAssignmentRemarks(\''+aid+'\',\''+sid+'\',this.value)"/></td></tr>';
    }).join('');
    var teacherSrc=GRADER_teacherSourceThumbs(asgn);
    return '<div class="t-card" style="margin-bottom:1.2rem;">'+
      '<div style="display:flex;align-items:center;gap:.7rem;margin-bottom:1rem;flex-wrap:wrap;">'+
      '<span style="font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#059669;background:#ecfdf5;padding:3px 8px;border-radius:6px;">'+(icons[asgn.type]||'Written')+'</span>'+
      '<div style="flex:1;min-width:0;"><div style="font-family:DM Sans,sans-serif;font-weight:800;color:#16132b;">'+esc(asgn.title)+'</div>'+
      '<div style="font-size:.75rem;color:#9ca3af;">'+(asgn.pts||asgn.points?(asgn.pts||asgn.points)+' pts \u00b7 ':'')+((asgn.due||asgn.due_date)?'Due '+(typeof prismFormatAssignmentDue==='function'?prismFormatAssignmentDue(asgn.due||asgn.due_date):(asgn.due||asgn.due_date)):'')+'</div>'+
      (teacherSrc?'<div class="roster-thumbs" style="margin-top:.45rem;">'+teacherSrc+'</div>':'')+'</div></div>'+
      '<div class="prism-table-scroll"><table>'+
      '<thead><tr><th>Student</th><th>Section</th><th style="text-align:center;">In</th><th>Work</th><th>Submission</th><th>Grade status</th><th>Score</th><th>Remarks</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div></div>';
  }).join('');
  cont.innerHTML=html;
}
function gradeAssignment(aid,sid,val){
  var asnKey='prism_asn_grades_'+activeClassId;
  var g=JSON.parse(localStorage.getItem(asnKey)||'{}'  );
  if(!g[aid])g[aid]={};if(!g[aid][sid])g[aid][sid]={};
  g[aid][sid].score=val;localStorage.setItem(asnKey,JSON.stringify(g));
}
function gradeAssignmentRemarks(aid,sid,val){
  var asnKey='prism_asn_grades_'+activeClassId;
  var g=JSON.parse(localStorage.getItem(asnKey)||'{}'  );
  if(!g[aid])g[aid]={};if(!g[aid][sid])g[aid][sid]={};
  g[aid][sid].remarks=val;localStorage.setItem(asnKey,JSON.stringify(g));
}

function openQuizReview(studentId, quizId){
  var quiz=getQuizzes().find(q=>String(q.id)===String(quizId)); if(!quiz)return;
  if (typeof quiz.questions === 'string') { try { quiz.questions = JSON.parse(quiz.questions || '[]'); } catch (e) { quiz.questions = []; } }
  if (!quiz.questions || !quiz.questions.length) { alert('This quiz has no questions to review.'); return; }
  var questions=quiz.questions.map(GRADE_normalizeQ);
  var scores=JSON.parse(localStorage.getItem('prism_quiz_scores_'+studentId)||'{}'  );
  var saAnswers=JSON.parse(localStorage.getItem('prism_quiz_sa_'+studentId+'_'+quizId)||'{}'  );
  var apiRow=(GRADE_quizApiScores[String(quizId)]||{})[String(studentId)];
  var apiAnswers=[];
  if (apiRow && apiRow.answers != null) {
    try { apiAnswers = typeof apiRow.answers === 'string' ? JSON.parse(apiRow.answers) : apiRow.answers; } catch (e) { apiAnswers = []; }
  }
  if (Array.isArray(apiAnswers)) {
    apiAnswers.forEach(function(a,i){ if (typeof a === 'string' && a && !saAnswers[i]) saAnswers[i]=a; });
  }
  var saScoreKey='prism_quiz_sa_scores_'+studentId+'_'+quizId;
  var student=getStudents(activeClassId).find(s=>String(s.id)===String(studentId))||{name:studentId};
  var currentScore=apiRow&&apiRow.score!=null?apiRow.score:(scores[quizId]!==undefined?scores[quizId]:(scores[String(quizId)]!==undefined?scores[String(quizId)]:null));
  var total=questions.reduce((s,q)=>s+q.points,0);
  var saTotal=questions.reduce((s,q)=>s+(q.choices===undefined?q.points:0),0);
  window.currentSAScores=JSON.parse(localStorage.getItem(saScoreKey)||'{}'  );
  window._reviewStudentId=studentId; window._reviewQuizId=quizId; window._reviewTotal=total; window._reviewSATotal=saTotal;

  var qsHtml=questions.map((q,i)=>{
    var isSA=q.choices===undefined;
    var saAns=saAnswers[i]||'';
    var content='';
    if(!isSA){
      var studentPick=apiAnswers[i];
      content='<div style="display:flex;flex-direction:column;gap:.5rem;">';
      q.choices.forEach((ch,ci)=>{
        var isCorrect=ci===q.answer;
        var isPicked=studentPick===ci||studentPick===String(ci);
        var bg=isCorrect?'#d1fae5':(isPicked?'#fee2e2':'#f9fafb');
        var bdr=isCorrect?'#10b981':(isPicked?'#ef4444':'#e4dffa');
        var col=isCorrect?'#065f46':(isPicked?'#991b1b':'#374151');
        var lBg=isCorrect?'#10b981':(isPicked?'#ef4444':'#e4dffa');
        var lCol=(isCorrect||isPicked)?'#fff':'#7c3aed';
        var letter=['A','B','C','D','E','F'][ci]||(ci+1);
        var mark=isCorrect?' Correct':(isPicked?' Chosen':'');
        var markCol=isCorrect?'#10b981':'#dc2626';
        content+='<div style="display:flex;align-items:center;gap:.8rem;padding:.7rem 1rem;background:'+bg+';border:2px solid '+bdr+';border-radius:11px;">'+
          '<div style="width:26px;height:26px;border-radius:50%;background:'+lBg+';display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:800;color:'+lCol+';flex-shrink:0;">'+letter+'</div>'+
          '<span style="font-size:.9rem;color:'+col+';font-weight:'+( isCorrect||isPicked?'700':'400')+';">'+esc(ch)+'</span>'+
          (mark?'<span style="margin-left:auto;font-size:.72rem;font-weight:700;color:'+markCol+';">'+mark+'</span>':'')
          +'</div>';
      });
      content+='</div>';
    } else {
      var savedPts=window.currentSAScores[i]!==undefined?window.currentSAScores[i]:'';
      content='<div style="margin-bottom:.7rem;">'+
        '<div style="font-size:.72rem;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:.35rem;">Student\u2019s Answer</div>'+
        '<div style="background:#f9fafb;border:1.5px solid #e4dffa;border-radius:10px;padding:.8rem 1rem;font-size:.88rem;color:#374151;line-height:1.65;white-space:pre-wrap;min-height:55px;">'+
        (saAns?esc(saAns):'<span style="color:#d1d5db;font-style:italic;">No response recorded.</span>')+
        '</div></div>'+
        '<div style="display:flex;align-items:center;gap:.6rem;">'+
        '<label style="font-size:.78rem;font-weight:700;color:#6b7280;white-space:nowrap;">Award points:</label>'+
        '<input id="sa-score-'+i+'" type="number" min="0" max="'+q.points+'" placeholder="0\u2013'+q.points+'" value="'+savedPts+'" style="width:75px;border:1.5px solid #a78bfa;border-radius:8px;padding:.38rem .55rem;font-size:.9rem;font-weight:700;text-align:center;color:#5b21b6;font-family:DM Sans,sans-serif;outline:none;" oninput="GRADE_updateSAScore('+i+',this.value,'+q.points+')" />'+
        '<span style="font-size:.8rem;color:#9ca3af;">/ '+q.points+' pts</span>'+
        '</div>';
    }
    return '<div style="background:#fff;border-radius:14px;padding:1.2rem 1.4rem;margin-bottom:.9rem;border:1.5px solid #f0ecff;">'+
      '<div style="font-size:.7rem;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">Q'+( i+1)+' \u00b7 '+q.points+' pt'+(q.points>1?'s':'')+( isSA?' \u00b7 <span style=\"color:#d97706;\">SA/Essay</span>':'')+'</div>'+
      '<div style="font-size:.97rem;font-weight:700;color:#16132b;margin-bottom:.9rem;line-height:1.5;">'+esc(q.q)+'</div>'+
      content+'</div>';
  }).join('');

  var modal=document.getElementById('review-modal');
  var inner=document.getElementById('review-inner');
  inner.innerHTML=
    '<div style="background:#fff;border-radius:22px 22px 0 0;padding:1.3rem 1.7rem;border-bottom:1px solid #f0ecff;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-shrink:0;">'+
    '<div><div style="font-family:DM Sans,sans-serif;font-size:1.1rem;font-weight:800;color:#16132b;">'+esc(quiz.title||'Quiz Review')+'</div>'+
    '<div style="font-size:.8rem;color:#9ca3af;margin-top:.15rem;">'+esc(student.name)+' \u00b7 '+(student.section||studentId)+'</div></div>'+
    '<div style="display:flex;align-items:center;gap:.7rem;flex-shrink:0;">'+
    '<div style="text-align:right;"><div style="font-size:.65rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.1rem;">Score</div>'+
    '<div id="score-display" style="font-family:DM Sans,sans-serif;font-size:1.1rem;font-weight:800;color:#7c3aed;">'+(currentScore!==null?currentScore+' / '+total:'\u2014')+'</div></div>'+
    '<button onclick="GRADE_saveReview()" style="padding:.48rem 1.1rem;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-family:DM Sans,sans-serif;font-size:.85rem;font-weight:700;cursor:pointer;" id="save-btn">Save Grades</button>'+
    '<button onclick="closeReview()" style="background:#f0ecff;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem;color:#555;">\u2715</button>'+
    '</div></div>'+
    '<div style="overflow-y:auto;padding:1.3rem 1.7rem;flex:1;">'+
    (saTotal>0?'<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:.6rem 1rem;font-size:.82rem;color:#92400e;margin-bottom:1rem;">Award points for essay and short-answer questions below, then click <strong>Save Grades</strong>.</div>':'')+
    qsHtml+'</div>';
  modal.classList.add('active');
  modal.addEventListener('click',function(e){if(e.target===modal)closeReview();},{once:true});
}

function closeReview(){
  document.getElementById('review-modal').classList.remove('active');
  document.getElementById('review-inner').innerHTML='';
  renderGrading().catch(function(e){ console.error(e); });
}

function GRADE_updateSAScore(idx,val,maxPts){
  var v=parseFloat(val);
  if(!isNaN(v)&&v>=0&&v<=maxPts) window.currentSAScores[idx]=v;
  else delete window.currentSAScores[idx];
}

function GRADE_saveReview(){
  var studentId=window._reviewStudentId, quizId=window._reviewQuizId;
  var totalPts=window._reviewTotal;
  var saScoreKey='prism_quiz_sa_scores_'+studentId+'_'+quizId;
  localStorage.setItem(saScoreKey, JSON.stringify(window.currentSAScores));
  var mcKey='prism_quiz_mc_'+studentId+'_'+quizId;
  var mcScore=parseFloat(localStorage.getItem(mcKey)||'0')||0;
  var saAwarded=Object.values(window.currentSAScores).reduce((s,v)=>s+(parseFloat(v)||0),0);
  var newTotal=Math.min(totalPts, mcScore+saAwarded);
  var scoreKey='prism_quiz_scores_'+studentId;
  var scores=JSON.parse(localStorage.getItem(scoreKey)||'{}'  );
  scores[quizId]=newTotal; localStorage.setItem(scoreKey,JSON.stringify(scores));
  var el=document.getElementById('score-display');
  if(el) el.textContent=newTotal+' / '+totalPts;
  var btn=document.getElementById('save-btn');
  if(btn){var o=btn.textContent;btn.textContent='Saved';btn.style.background='#10b981';
    setTimeout(()=>{btn.textContent=o;btn.style.background='#7c3aed';},1400);}
}

window.addEventListener('DOMContentLoaded',function(){
  initSidebar('grading');
  var sel=document.getElementById('class-select');
  var TEACHER_ID = sessionStorage.getItem('prism_user_id') || 'teacher';
  if (typeof getClasses === 'function' && getClasses().length) {
    fillClassSelect(getClasses());
  }

  function fillClassSelect(classes){
    sel.innerHTML='';
    if(!classes.length){
      sel.innerHTML='<option>No classes yet \u2014 create one in My Classes</option>';
      document.getElementById('grading-content').innerHTML='<div style="padding:2rem;text-align:center;color:#9ca3af;">Create a class in My Classes first.</div>';
      return;
    }
    var params=new URLSearchParams(window.location.search);
    var urlClass=params.get('class');
    var savedClass=sessionStorage.getItem('prism_teacher_active_class_id');
    classes.forEach(function(cls){
      var opt=document.createElement('option');
      opt.value=cls.id;
      opt.textContent=typeof prismTeacherClassLabel==='function'?prismTeacherClassLabel(cls):(cls.subject||'Class');
      if(cls.id===urlClass) opt.selected=true;
      sel.appendChild(opt);
    });
    if(urlClass&&classes.find(function(c){return c.id===urlClass;})) activeClassId=urlClass;
    else if(savedClass&&classes.find(function(c){return c.id===savedClass;})) activeClassId=savedClass;
    else activeClassId=classes[0].id;
    sel.value=activeClassId;
    try { sessionStorage.setItem('prism_teacher_active_class_id', activeClassId); } catch(e){}
    loadGradingAssignmentFilter();
    renderGrading().catch(function(e){ console.error(e); });
  }

  (async function(){
    try {
      var apiClasses = await PrismClasses.getMyClasses();
      var normalized = apiClasses.map(function(c){
        return { id:c.id, subject:c.subject, color:c.color||'#7c3aed', code:c.code, teacher_id:c.teacher_id||TEACHER_ID };
      });
      localStorage.setItem('prism_classes_'+TEACHER_ID, JSON.stringify(normalized));
      fillClassSelect(normalized);
      var allA = JSON.parse(localStorage.getItem('prism_teacher_assignments')||'{}');
      await Promise.all(normalized.map(function(cls) {
        return Promise.all([
          PrismClasses.getStudents(cls.id, { avatars: 1 }).catch(function(){ return []; }),
          PrismAssignments.get(cls.id).catch(function(){ return []; }),
        ]).then(function(pair) {
          localStorage.setItem('prism_students_'+cls.id, JSON.stringify(
            (pair[0]||[]).map(function(s){ return typeof prismMapStudentRow==='function'?prismMapStudentRow(s):{ id:s.id, name:s.name, section:s.section||'', avatar:s.avatar||'' }; })
          ));
          allA[cls.id] = pair[1]||[];
        });
      }));
      localStorage.setItem('prism_teacher_assignments', JSON.stringify(allA));
    } catch(e) { console.warn('grading class sync', e); }
    fillClassSelect(getClasses());
  })();
});
