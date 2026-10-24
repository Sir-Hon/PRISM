/** Page script for records.html — keep HTML in the .html file. */
var TEACHER_ID = sessionStorage.getItem('prism_user_id') || 'teacher';

// ── DATA HELPERS ──
function getClasses()   { return JSON.parse(localStorage.getItem('prism_classes_'+TEACHER_ID)||'[]'); }
function getStudents(cid){ return JSON.parse(localStorage.getItem('prism_students_'+cid)||'[]'); }

// New date-keyed records: prism_records_v2  →  { classId: { date: { studentId: {attendance,quiz,activity,midterm,final,remarks} } } }
function getRecordsV2() { return JSON.parse(localStorage.getItem('prism_records_v2')||'{}'); }
function saveRecordsV2(r){ localStorage.setItem('prism_records_v2',JSON.stringify(r)); }

// Also keep prism_student_records for backwards compat (grading.html reads it)
function syncLegacy(classId) {
  var v2 = getRecordsV2()[classId] || {};
  var students = getStudents(classId);
  var legacy = JSON.parse(localStorage.getItem('prism_student_records')||'{}');
  students.forEach(function(s) {
    var key = classId + ':' + s.id;
    // Aggregate: best scores across all sessions
    var best = { attendance:'Present', quiz:0, activity:0, midterm:0, final:0, remarks:'' };
    Object.values(v2).forEach(function(day) {
      var d = day[s.id] || {};
      if(parseFloat(d.quiz)    > best.quiz)     best.quiz     = parseFloat(d.quiz)||0;
      if(parseFloat(d.activity)> best.activity) best.activity = parseFloat(d.activity)||0;
      if(parseFloat(d.midterm) > best.midterm)  best.midterm  = parseFloat(d.midterm)||0;
      if(parseFloat(d.final)   > best.final)    best.final    = parseFloat(d.final)||0;
      if(d.remarks) best.remarks = d.remarks;
    });
    legacy[key] = { attendance: best.attendance, quiz: best.quiz||'', activity: best.activity||'', midterm: best.midterm||'', final: best.final||'', remarks: best.remarks };
  });
  localStorage.setItem('prism_student_records', JSON.stringify(legacy));
}

// ── STATE ──
var activeClassId  = null;
var activeDate     = todayStr();
var activeView     = 'session';
var activeSectionSession = 'all';
var activeSectionHistory = 'all';
var activeSectionSummary = 'all';

function todayStr() {
  var d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function formatDateNice(str) {
  if (!str) return '';
  var d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
}

// ── GWA MATH ──
function calcGWA(rec){
  var q=parseFloat(rec.quiz)||0,a=parseFloat(rec.activity)||0,m=parseFloat(rec.midterm)||0,f=parseFloat(rec.final)||0;
  if(!q&&!a&&!m&&!f)return null;
  return((q*.2)+(a*.2)+(m*.3)+(f*.3)).toFixed(1);
}
function gradeInfo(gwa){
  if(gwa===null)return{l:'—',c:'gF'};
  var s=parseFloat(gwa);
  if(s>=90)return{l:'A',c:'gA'};if(s>=80)return{l:'B',c:'gB'};
  if(s>=75)return{l:'C',c:'gC'};if(s>=60)return{l:'D',c:'gD'};
  return{l:'F',c:'gF'};
}
function avgArr(arr){
  var nums=arr.map(x=>parseFloat(x)).filter(x=>!isNaN(x)&&x>0);
  if(!nums.length)return null;
  return(nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1);
}

// ── INIT ──
window.addEventListener('DOMContentLoaded', async function(){
  try {
    var user = typeof prismAuthGuard === 'function' ? await prismAuthGuard(['teacher']) : null;
    if (!user) return;
    TEACHER_ID = user.id;
  } catch(e) {
    window.location.replace('login.html');
    return;
  }
  initSidebar('records');
  try {
    var apiClasses = await PrismClasses.getMyClasses();
    var normalized = apiClasses.map(function(c){
      return { id:c.id, subject:c.subject, color:c.color||'#7c3aed', code:c.code, teacher_id:c.teacher_id||TEACHER_ID };
    });
    localStorage.setItem('prism_classes_'+TEACHER_ID, JSON.stringify(normalized));
    await Promise.all(normalized.map(function(cls) {
      return PrismClasses.getStudents(cls.id, { avatars: 1 }).then(function(studs) {
        localStorage.setItem('prism_students_'+cls.id, JSON.stringify(
          (studs||[]).map(function(s){ return typeof prismMapStudentRow==='function'?prismMapStudentRow(s):{ id:s.id, name:s.name, section:s.section||'', avatar:s.avatar||'' }; })
        ));
      }).catch(function() {});
    }));
  } catch(e) { console.warn('records class sync', e); }
  var classes = getClasses();
  var sel = document.getElementById('class-select');
  if (!classes.length) {
    sel.innerHTML = '<option>No classes yet — create one in My Classes</option>';
    document.getElementById('rec-tbody').innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:#9ca3af;">No classes found.</td></tr>';
    return;
  }
  var params = new URLSearchParams(window.location.search);
  var urlClass = params.get('class');
  classes.forEach(function(cls){
    var opt = document.createElement('option');
    opt.value = cls.id; opt.textContent = cls.subject;
    if (cls.id === urlClass) opt.selected = true;
    sel.appendChild(opt);
  });
  activeClassId = urlClass && classes.find(c=>c.id===urlClass) ? urlClass : classes[0].id;
  sel.value = activeClassId;

  document.getElementById('session-date').value = activeDate;
  onClassChange(activeClassId);
});

function onClassChange(id){
  activeClassId = id;
  activeSectionSession = 'all';
  activeSectionHistory = 'all';
  activeSectionSummary = 'all';
  renderSectionPills();
  renderSessionChips();
  renderSession();
  renderHistory();
  renderSummary();
  populateBulkSections();
}

function onDateChange(val){
  activeDate = val;
  renderSessionChips();
  renderSession();
}

function setToday(){
  activeDate = todayStr();
  document.getElementById('session-date').value = activeDate;
  renderSessionChips();
  renderSession();
}

function shiftDate(delta){
  var d = new Date(activeDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  activeDate = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  document.getElementById('session-date').value = activeDate;
  renderSessionChips();
  renderSession();
}

// ── VIEW SWITCHER ──
function switchView(view, btn){
  activeView = view;
  ['session','history','summary'].forEach(function(v){
    document.getElementById('view-'+v).style.display = v===view ? 'block' : 'none';
  });
  document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));
  if(btn) btn.classList.add('active');
  var hints = {session:'Enter grades for the selected date below', history:'View all recorded sessions', summary:'Aggregated performance per student across all sessions'};
  document.getElementById('view-hint').textContent = hints[view]||'';
  if(view==='history') renderHistory();
  if(view==='summary') renderSummary();
}

// ── SECTION PILLS ──
function getSections(){
  var students = getStudents(activeClassId);
  return ['all', ...new Set(students.map(s=>s.section||'General').filter(Boolean))];
}

function renderSectionPills(){
  ['session','history','summary'].forEach(function(view){
    var cont = document.getElementById('section-pills-'+view);
    if(!cont) return;
    cont.innerHTML = '';
    getSections().forEach(function(s){
      var active = view==='session'?activeSectionSession:view==='history'?activeSectionHistory:activeSectionSummary;
      var btn = document.createElement('button');
      btn.className = 'section-pill'+(s===active?' active':'');
      btn.textContent = s==='all'?'All Sections':s;
      btn.onclick = (function(sec,v){ return function(){
        if(v==='session')  activeSectionSession=sec;
        if(v==='history')  activeSectionHistory=sec;
        if(v==='summary')  activeSectionSummary=sec;
        renderSectionPills();
        if(v==='session') renderSession();
        if(v==='history') renderHistory();
        if(v==='summary') renderSummary();
      };})(s, view);
      cont.appendChild(btn);
    });
  });
}

// ── SESSION CHIPS (past dates that have data) ──
function renderSessionChips(){
  var v2 = getRecordsV2()[activeClassId] || {};
  var dates = Object.keys(v2).sort().reverse();
  var cont = document.getElementById('session-chips');
  if (!dates.length) { cont.innerHTML = '<span style="font-size:.75rem;color:#9ca3af;">No sessions recorded yet</span>'; return; }
  cont.innerHTML = '';
  dates.slice(0,10).forEach(function(d){
    var chip = document.createElement('button');
    chip.className = 'session-chip' + (d===activeDate?' active':'');
    chip.textContent = formatDateNice(d).replace(/\w+,\s/,''); // short format
    chip.onclick = (function(date){ return function(){
      activeDate = date;
      document.getElementById('session-date').value = date;
      renderSessionChips();
      renderSession();
    };})(d);
    cont.appendChild(chip);
  });
}

// ── SESSION TABLE ──
function renderSession(){
  var v2 = getRecordsV2();
  var dayRec = (v2[activeClassId]||{})[activeDate] || {};
  var students = getStudents(activeClassId);
  var q = (document.getElementById('rec-search').value||'').toLowerCase();
  var filter = document.getElementById('rec-filter').value;
  var tbody = document.getElementById('rec-tbody');
  tbody.innerHTML = '';

  if (!activeClassId){ tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:2rem;color:#9ca3af;">Select a class above.</td></tr>'; return; }
  if (!students.length){ tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:2rem;color:#9ca3af;">No students yet. Share the join code!</td></tr>'; return; }

  var filtered = students.filter(function(s){
    if(activeSectionSession!=='all'&&(s.section||'General')!==activeSectionSession) return false;
    if(q&&!s.name.toLowerCase().includes(q)) return false;
    return true;
  });

  var shown = 0;
  filtered.forEach(function(s){
    var rec = dayRec[s.id] || { attendance:'Present', quiz:'', activity:'', midterm:'', final:'', remarks:'' };
    var gwa = calcGWA(rec); var gi = gradeInfo(gwa);
    if(filter==='passing'  && (gwa===null||parseFloat(gwa)<75))  return;
    if(filter==='failing'  && (gwa===null||parseFloat(gwa)>=75)) return;
    shown++;

    var tr = document.createElement('tr');
    function td(html){ var c=document.createElement('td'); c.innerHTML=html; return c; }
    function tdEl(el){ var c=document.createElement('td'); c.appendChild(el); return c; }

    // Student name (clickable)
    var nameCell = document.createElement('td');
    var initial = s.name.charAt(0).toUpperCase();
    var avHtml = typeof prismRosterAvatarHtml==='function' ? prismRosterAvatarHtml(s, 30) : '<span class="student-avatar">'+initial+'</span>';
    nameCell.innerHTML = '<span class="student-link" onclick="openStudentModal(\''+String(s.id).replace(/'/g,'')+'\')">'+avHtml+(typeof prismEscHtml==='function'?prismEscHtml(s.name):s.name)+'</span>';
    tr.appendChild(nameCell);

    tr.appendChild(td('<span style="font-size:.78rem;background:#f0fdf4;color:#065f46;padding:2px 8px;border-radius:20px;font-weight:600;">'+(s.section||'—')+'</span>'));

    // Attendance
    var sel = document.createElement('select');
    sel.className = 'g-input'; sel.style.width = '95px';
    var attColors = {'Present':'#059669','Absent':'#ef4444','Late':'#f59e0b'};
    ['Present','Absent','Late'].forEach(function(o){
      var opt = document.createElement('option'); opt.value=o; opt.textContent=o;
      if((rec.attendance||'Present')===o) opt.selected=true;
      sel.appendChild(opt);
    });
    sel.style.color = attColors[rec.attendance||'Present'];
    sel.onchange = (function(sid){ return function(){
      saveField(activeClassId, activeDate, sid, 'attendance', this.value);
      this.style.color = attColors[this.value];
    };})(s.id);
    tr.appendChild(tdEl(sel));

    // Grade inputs
    ['quiz','activity','midterm','final'].forEach(function(field){
      var inp = document.createElement('input');
      inp.type='number'; inp.min='0'; inp.max='100'; inp.className='g-input';
      inp.value = rec[field]||''; inp.placeholder='—';
      inp.onchange = (function(sid,f){ return function(){ saveField(activeClassId, activeDate, sid, f, this.value); }; })(s.id, field);
      tr.appendChild(tdEl(inp));
    });

    tr.appendChild(td('<span style="font-weight:800;color:#16132b;">'+(gwa!==null?gwa:'—')+'</span>'));
    tr.appendChild(td('<span class="g-badge '+gi.c+'">'+gi.l+'</span>'));

    var rem = document.createElement('input');
    rem.type='text'; rem.className='g-input'; rem.style.width='110px';
    rem.value = rec.remarks||''; rem.placeholder='Notes…';
    rem.onchange = (function(sid){ return function(){ saveField(activeClassId, activeDate, sid, 'remarks', this.value); }; })(s.id);
    tr.appendChild(tdEl(rem));

    tbody.appendChild(tr);
  });

  if(!shown) tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:2rem;color:#9ca3af;">No students match this filter.</td></tr>';
  document.getElementById('rec-count').textContent = shown + ' student' + (shown!==1?'s':'');
}

function saveField(classId, date, studentId, field, value){
  var v2 = getRecordsV2();
  if(!v2[classId]) v2[classId] = {};
  if(!v2[classId][date]) v2[classId][date] = {};
  if(!v2[classId][date][studentId]) v2[classId][date][studentId] = {attendance:'Present'};
  v2[classId][date][studentId][field] = value;
  saveRecordsV2(v2);
  syncLegacy(classId);
  renderSessionChips();
}

// ── HISTORY VIEW ──
function renderHistory(){
  var v2 = getRecordsV2()[activeClassId] || {};
  var dates = Object.keys(v2).sort().reverse();
  var students = getStudents(activeClassId);
  var grid = document.getElementById('history-grid');

  if(!dates.length){
    grid.innerHTML = '<div style="text-align:center;padding:3rem;color:#9ca3af;grid-column:1/-1;">No sessions recorded yet. Start by entering grades in the Session Entry view.</div>';
    return;
  }

  grid.innerHTML = '';
  dates.forEach(function(date){
    var dayRec = v2[date] || {};
    var relevant = students.filter(function(s){
      if(activeSectionHistory!=='all'&&(s.section||'General')!==activeSectionHistory) return false;
      return true;
    });
    var present=0, absent=0, late=0, graded=0;
    relevant.forEach(function(s){
      var r = dayRec[s.id]||{};
      var att = r.attendance||'Present';
      if(att==='Present') present++;
      else if(att==='Absent') absent++;
      else late++;
      if(r.quiz||r.activity||r.midterm||r.final) graded++;
    });

    var card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = '<div class="hc-date">'+formatDateNice(date)+'<span class="hc-date-badge">'+relevant.length+' students</span></div>'
      +'<div class="hc-stats">'
      +'<div class="hc-stat"><div class="hcs-val">'+present+'</div><div class="hcs-lbl">Present</div></div>'
      +'<div class="hc-stat"><div class="hcs-val" style="color:#ef4444;">'+absent+'</div><div class="hcs-lbl">Absent</div></div>'
      +'<div class="hc-stat"><div class="hcs-val" style="color:#f59e0b;">'+late+'</div><div class="hcs-lbl">Late</div></div>'
      +'<div class="hc-stat"><div class="hcs-val" style="color:#6366f1;">'+graded+'</div><div class="hcs-lbl">Graded</div></div>'
      +'</div>';
    card.onclick = (function(d){ return function(){ openSessionModal(d); }; })(date);
    grid.appendChild(card);
  });
}

function openSessionModal(date){
  var v2 = getRecordsV2()[activeClassId] || {};
  var dayRec = v2[date] || {};
  var students = getStudents(activeClassId);
  document.getElementById('smod-title').textContent = ' ' + formatDateNice(date);
  document.getElementById('smod-meta').textContent = getClasses().find(c=>c.id===activeClassId)?.subject || '';
  var tbody = document.getElementById('smod-tbody');
  tbody.innerHTML = '';
  students.forEach(function(s){
    var r = dayRec[s.id]||{attendance:'Present'};
    var gwa = calcGWA(r); var gi = gradeInfo(gwa);
    var attClass = r.attendance==='Absent'?'att-absent':r.attendance==='Late'?'att-late':'att-present';
    var tr = document.createElement('tr');
    function td(h){var c=document.createElement('td');c.innerHTML=h;return c;}
    var avHtml = typeof prismRosterAvatarHtml==='function' ? prismRosterAvatarHtml(s, 28) : '';
    tr.appendChild(td('<div style="display:flex;align-items:center;gap:.5rem;">'+avHtml+'<strong>'+(typeof prismEscHtml==='function'?prismEscHtml(s.name):s.name)+'</strong></div>'));
    tr.appendChild(td('<span style="font-size:.78rem;color:#9ca3af;">'+(s.section||'—')+'</span>'));
    tr.appendChild(td('<span class="'+attClass+'">'+(r.attendance||'Present')+'</span>'));
    ['quiz','activity','midterm','final'].forEach(function(f){ tr.appendChild(td(r[f]||'—')); });
    tr.appendChild(td('<strong>'+(gwa||'—')+'</strong>'));
    tr.appendChild(td('<span class="g-badge '+gi.c+'">'+gi.l+'</span>'));
    tbody.appendChild(tr);
  });
  document.getElementById('session-modal').classList.add('active');
}

// ── SUMMARY VIEW ──
function renderSummary(){
  var v2 = getRecordsV2()[activeClassId] || {};
  var students = getStudents(activeClassId);
  var q = (document.getElementById('summary-search').value||'').toLowerCase();
  var filter = document.getElementById('summary-filter').value;
  var tbody = document.getElementById('summary-tbody');
  tbody.innerHTML = '';

  if(!students.length){
    tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:2rem;color:#9ca3af;">No students yet.</td></tr>';
    return;
  }

  var filtered = students.filter(function(s){
    if(activeSectionSummary!=='all'&&(s.section||'General')!==activeSectionSummary) return false;
    if(q&&!s.name.toLowerCase().includes(q)) return false;
    return true;
  });

  filtered.forEach(function(s){
    var sessions = Object.keys(v2);
    var allRec = sessions.map(function(d){ return v2[d][s.id]||{}; });
    var attended = allRec.filter(r=>r.attendance==='Present').length;
    var attRate = sessions.length ? Math.round((attended/sessions.length)*100) : null;
    var avgQuiz     = avgArr(allRec.map(r=>r.quiz));
    var avgActivity = avgArr(allRec.map(r=>r.activity));
    var bestMid     = allRec.map(r=>parseFloat(r.midterm)||0).sort((a,b)=>b-a)[0]||null;
    var bestFinal   = allRec.map(r=>parseFloat(r.final)||0).sort((a,b)=>b-a)[0]||null;

    // Overall GWA uses averages
    var synth = { quiz: avgQuiz||0, activity: avgActivity||0, midterm: bestMid||0, final: bestFinal||0 };
    var gwa = (synth.quiz||synth.activity||synth.midterm||synth.final) ? calcGWA(synth) : null;
    var gi = gradeInfo(gwa);

    if(filter==='passing'  && (gwa===null||parseFloat(gwa)<75))  return;
    if(filter==='failing'  && (gwa===null||parseFloat(gwa)>=75)) return;

    var tr = document.createElement('tr');
    function td(h){var c=document.createElement('td');c.innerHTML=h;return c;}

    var avHtml = typeof prismRosterAvatarHtml==='function' ? prismRosterAvatarHtml(s, 30) : '<span class="student-avatar">'+s.name.charAt(0).toUpperCase()+'</span>';
    tr.appendChild(td('<span class="student-link" onclick="openStudentModal(\''+String(s.id).replace(/'/g,'')+'\')">'+avHtml+(typeof prismEscHtml==='function'?prismEscHtml(s.name):s.name)+'</span>'));
    tr.appendChild(td('<span style="font-size:.78rem;background:#f0fdf4;color:#065f46;padding:2px 8px;border-radius:20px;font-weight:600;">'+(s.section||'—')+'</span>'));
    tr.appendChild(td('<strong>'+sessions.length+'</strong>'));

    // Attendance bar
    var attCell = document.createElement('td');
    attCell.innerHTML = (attRate!==null
      ? '<div style="display:flex;align-items:center;gap:.5rem;"><div class="progress-bar-wrap" style="width:80px;"><div class="progress-bar-fill" style="width:'+attRate+'%;"></div></div><span style="font-size:.8rem;font-weight:700;color:#16132b;">'+attRate+'%</span></div>'
      : '<span style="color:#9ca3af;">—</span>');
    tr.appendChild(attCell);

    tr.appendChild(td(avgQuiz!==null?'<strong>'+avgQuiz+'</strong>':'<span style="color:#9ca3af;">—</span>'));
    tr.appendChild(td(avgActivity!==null?'<strong>'+avgActivity+'</strong>':'<span style="color:#9ca3af;">—</span>'));
    tr.appendChild(td(bestMid?'<strong>'+bestMid+'</strong>':'<span style="color:#9ca3af;">—</span>'));
    tr.appendChild(td(bestFinal?'<strong>'+bestFinal+'</strong>':'<span style="color:#9ca3af;">—</span>'));
    tr.appendChild(td(gwa?'<strong style="font-size:1rem;">'+gwa+'</strong>':'<span style="color:#9ca3af;">—</span>'));
    tr.appendChild(td('<span class="g-badge '+gi.c+'">'+gi.l+'</span>'));

    tbody.appendChild(tr);
  });

  if(!tbody.children.length)
    tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:2rem;color:#9ca3af;">No students match this filter.</td></tr>';
}

// ── STUDENT DETAIL MODAL ──
function openStudentModal(studentId){
  var students = getStudents(activeClassId);
  var s = students.find(x=>x.id===studentId);
  if(!s) return;
  var v2 = getRecordsV2()[activeClassId] || {};
  var dates = Object.keys(v2).sort().reverse();

  document.getElementById('modal-student-name').textContent = s.name;
  document.getElementById('modal-student-meta').textContent = (s.section||'No section') + ' · ID: ' + s.id;

  // Quick stats
  var allRec = dates.map(function(d){ return v2[d][s.id]||{}; });
  var attended = allRec.filter(r=>r.attendance==='Present').length;
  var attRate  = dates.length ? Math.round((attended/dates.length)*100) : null;
  var avgQ = avgArr(allRec.map(r=>r.quiz));
  var avgA = avgArr(allRec.map(r=>r.activity));
  var synth = { quiz:avgQ||0, activity:avgA||0, midterm:allRec.map(r=>parseFloat(r.midterm)||0).sort((a,b)=>b-a)[0]||0, final:allRec.map(r=>parseFloat(r.final)||0).sort((a,b)=>b-a)[0]||0 };
  var gwa = (synth.quiz||synth.activity||synth.midterm||synth.final)?calcGWA(synth):null;
  var gi  = gradeInfo(gwa);

  document.getElementById('modal-stats-row').innerHTML = [
    { val: dates.length, lbl:'Sessions', color:'#16132b' },
    { val: attRate!==null?attRate+'%':'—', lbl:'Attendance', color:'#10b981' },
    { val: avgQ||'—', lbl:'Avg Quiz', color:'#6366f1' },
    { val: gwa||'—', lbl:'Overall GWA', color:'#f59e0b' },
  ].map(function(s){
    return '<div style="background:#f0fdf4;border-radius:12px;padding:.85rem;text-align:center;">'
      +'<div style="font-family:DM Sans,sans-serif;font-size:1.4rem;font-weight:800;color:'+s.color+';">'+s.val+'</div>'
      +'<div style="font-size:.72rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-top:2px;">'+s.lbl+'</div></div>';
  }).join('');

  // Timeline
  var timeline = document.getElementById('modal-timeline');
  if (!dates.length) {
    timeline.innerHTML = '<div style="text-align:center;padding:1.5rem;color:#9ca3af;">No sessions recorded yet.</div>';
  } else {
    timeline.innerHTML = dates.map(function(date){
      var r = v2[date][s.id]||{};
      var gw = calcGWA(r); var gi2 = gradeInfo(gw);
      var attColor = r.attendance==='Absent'?'#ef4444':r.attendance==='Late'?'#f59e0b':'#059669';
      return '<div class="timeline-entry">'
        +'<div class="te-date">'+formatDateNice(date)
        +'<span style="font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:.5rem;background:'+(r.attendance==='Absent'?'#fee2e2':r.attendance==='Late'?'#fef3c7':'#d1fae5')+';color:'+attColor+'">'+(r.attendance||'Present')+'</span></div>'
        +'<div class="te-grades">'
        +['quiz','activity','midterm','final'].map(function(f){
          return '<div class="te-grade-box"><div class="tgb-val">'+(r[f]||'—')+'</div><div class="tgb-lbl">'+f+'</div></div>';
        }).join('')
        +'<div class="te-grade-box"><div class="tgb-val" style="color:var(--t);">'+(gw||'—')+'</div><div class="tgb-lbl">GWA</div></div>'
        +'</div>'
        +(r.remarks?'<div style="font-size:.76rem;color:#9ca3af;margin-top:.35rem;"> '+r.remarks+'</div>':'')
        +'</div>';
    }).join('');
  }

  document.getElementById('student-modal').classList.add('active');
}
function closeStudentModal(){ document.getElementById('student-modal').classList.remove('active'); }

// ── BULK GRADE ──
function populateBulkSections(){
  var sel = document.getElementById('bulk-section');
  sel.innerHTML = '<option value="all">All Sections</option>';
  getSections().filter(s=>s!=='all').forEach(function(s){
    var opt=document.createElement('option'); opt.value=s; opt.textContent=s; sel.appendChild(opt);
  });
}
function openBulkModal(){ document.getElementById('bulk-overlay').classList.add('active'); }
function closeBulk(){ document.getElementById('bulk-overlay').classList.remove('active'); }
function saveBulk(){
  var comp  = document.getElementById('bulk-comp').value;
  var grade = document.getElementById('bulk-grade').value;
  var sec   = document.getElementById('bulk-section').value;
  if (!grade||!activeClassId) return;
  var students = getStudents(activeClassId).filter(function(s){
    return sec==='all'||(s.section||'General')===sec;
  });
  var v2 = getRecordsV2();
  if(!v2[activeClassId]) v2[activeClassId]={};
  if(!v2[activeClassId][activeDate]) v2[activeClassId][activeDate]={};
  students.forEach(function(s){
    if(!v2[activeClassId][activeDate][s.id]) v2[activeClassId][activeDate][s.id]={attendance:'Present'};
    v2[activeClassId][activeDate][s.id][comp]=grade;
  });
  saveRecordsV2(v2);
  syncLegacy(activeClassId);
  closeBulk();
  renderSessionChips();
  renderSession();
}

// ── EXPORT CSV ──
function exportCSV(){
  var v2 = getRecordsV2()[activeClassId]||{};
  var students = getStudents(activeClassId);
  var cls = getClasses().find(c=>c.id===activeClassId);
  var dates = Object.keys(v2).sort();
  var csv = 'Name,ID,Section';
  dates.forEach(function(d){ csv+=','+d+' Attendance,'+d+' Quiz,'+d+' Activity,'+d+' Midterm,'+d+' Final'; });
  csv+=',Overall GWA,Grade\n';
  students.forEach(function(s){
    var row='"'+s.name+'","'+s.id+'","'+(s.section||'')+'",';
    var allRec=dates.map(function(d){return v2[d][s.id]||{};});
    dates.forEach(function(d,i){
      var r=allRec[i];
      row+='"'+(r.attendance||'')+'","'+(r.quiz||'')+'","'+(r.activity||'')+'","'+(r.midterm||'')+'","'+(r.final||'')+'",';
    });
    var avgQ=avgArr(allRec.map(r=>r.quiz)), avgA=avgArr(allRec.map(r=>r.activity));
    var bestM=allRec.map(r=>parseFloat(r.midterm)||0).sort((a,b)=>b-a)[0]||0;
    var bestF=allRec.map(r=>parseFloat(r.final)||0).sort((a,b)=>b-a)[0]||0;
    var synth={quiz:avgQ||0,activity:avgA||0,midterm:bestM,final:bestF};
    var gwa=calcGWA(synth)||'';
    var gr=gradeInfo(gwa?parseFloat(gwa):null).l;
    row+='"'+gwa+'","'+gr+'"';
    csv+=row+'\n';
  });
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=(cls?cls.subject:'records').replace(/\s+/g,'-')+'-full-records.csv';
  a.click();
}

// Close modals on backdrop click
['student-modal','session-modal','bulk-overlay'].forEach(function(id){
  document.getElementById(id).addEventListener('click',function(e){
    if(e.target===this) this.classList.remove('active');
  });
});
