/** Page script for notes.html — keep HTML in the .html file. */
const NB_COLORS = ['#e74c3c','#6d28d9','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63','#607d8b','#795548'];

  let notebooks     = JSON.parse(localStorage.getItem('prism_notebooks')||'[]');
  let activeNbId    = null, activeNoteId = null, editingNbId = null;
  let selNbColor    = NB_COLORS[2];
  let autosaveTimer = null;

  const colorPicker = document.getElementById('nb-color-picker');
  if (colorPicker) {
    NB_COLORS.forEach(c => {
      const chip = document.createElement('div'); chip.className='nb-color-chip'; chip.style.background=c; chip.dataset.color=c; chip.onclick=()=>selNbClr(c); colorPicker.appendChild(chip);
    });
  }

  function nbInitial(name) { return String(name || 'N').charAt(0).toUpperCase(); }
  function selNbClr(c) { selNbColor=c; document.querySelectorAll('.nb-color-chip').forEach(ch=>ch.classList.toggle('selected',ch.dataset.color===c)); }
  selNbClr(NB_COLORS[2]);

  function saveData() { localStorage.setItem('prism_notebooks',JSON.stringify(notebooks)); }

  function darken(hex) {
    try { let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); r=Math.max(0,r-40);g=Math.max(0,g-40);b=Math.max(0,b-40); return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`; } catch(e){return hex;}
  }

  function renderNotebooks() {
    const grid = document.getElementById('notebooks-grid');
    if (!grid) return;
    grid.innerHTML='';
    if (!notebooks.length) { grid.innerHTML='<p style="color:#9ca3af;grid-column:1/-1;font-size:1rem;">No notebooks yet. Create your first one!</p>'; return; }
    notebooks.forEach(nb => {
      const cnt = (nb.notes||[]).length;
      const card = document.createElement('div');
      card.className='notebook-card'+(nb.id===activeNbId?' active-nb':'');
      card.style.background=`linear-gradient(135deg,${nb.color},${darken(nb.color)})`;
      card.innerHTML = '<div><div class="nb-icon">' + nbInitial(nb.name) + '</div>'
        + '<div class="nb-title">' + String(nb.name || '').replace(/</g,'&lt;') + '</div>'
        + '<div class="nb-count">' + cnt + ' note' + (cnt !== 1 ? 's' : '') + '</div></div>'
        + '<button type="button" class="nb-menu-btn" onclick="toggleNbMenu(event,\'' + nb.id + '\')">⋯</button>'
        + '<div class="nb-context-menu" id="nbmenu-' + nb.id + '">'
        + '<div class="nb-ctx-item" onclick="openEditor(\'' + nb.id + '\')">Open</div>'
        + '<div class="nb-ctx-item" onclick="openRenameNb(\'' + nb.id + '\')">Rename</div>'
        + '<div class="nb-ctx-item danger" onclick="deleteNotebook(\'' + nb.id + '\')">Delete</div>'
        + '</div>';
      card.addEventListener('click',e=>{ if(e.target.closest('.nb-menu-btn')||e.target.closest('.nb-context-menu'))return; openEditor(nb.id); });
      grid.appendChild(card);
    });
  }

  function toggleNbMenu(e,id) { e.stopPropagation(); document.querySelectorAll('.nb-context-menu').forEach(m=>{if(m.id!=='nbmenu-'+id)m.classList.remove('open');}); document.getElementById('nbmenu-'+id).classList.toggle('open'); }
  document.addEventListener('click',()=>document.querySelectorAll('.nb-context-menu').forEach(m=>m.classList.remove('open')));

  function openNewNotebookModal() { editingNbId=null; document.getElementById('nb-modal-title').textContent='New Notebook'; document.getElementById('nb-name-input').value=''; selNbClr(NB_COLORS[Math.floor(Math.random()*NB_COLORS.length)]); document.getElementById('nb-overlay').classList.add('active'); setTimeout(()=>document.getElementById('nb-name-input').focus(),200); }
  function openRenameNb(id) { const nb=notebooks.find(n=>n.id===id); if(!nb)return; editingNbId=id; document.getElementById('nb-modal-title').textContent='Rename Notebook'; document.getElementById('nb-name-input').value=nb.name; selNbClr(nb.color||NB_COLORS[2]); document.getElementById('nb-overlay').classList.add('active'); }
  function closeNbModal() { document.getElementById('nb-overlay').classList.remove('active'); }

  function saveNotebook() {
    const name=document.getElementById('nb-name-input').value.trim(); if(!name){alert('Please enter a name.');return;}
    if(editingNbId){const nb=notebooks.find(n=>n.id===editingNbId);nb.name=name;nb.color=selNbColor;nb.icon=nbInitial(name);}
    else{notebooks.push({id:Date.now().toString(),name,color:selNbColor,icon:nbInitial(name),notes:[]});}
    saveData();closeNbModal();renderNotebooks();
  }

  function deleteNotebook(id){if(!confirm('Delete this notebook and all its notes?'))return;notebooks=notebooks.filter(n=>n.id!==id);if(activeNbId===id)closeEditor();saveData();renderNotebooks();}

  function openEditor(nbId){activeNbId=nbId;const nb=notebooks.find(n=>n.id===nbId);document.getElementById('notes-editor-wrap').classList.add('visible');const badge=document.getElementById('editor-nb-badge');badge.textContent=nb.name;badge.style.background=nb.color;renderNoteList();renderNotebooks();if(nb.notes&&nb.notes.length)loadNote(nb.notes[0].id);else clearEditor();}
  function closeEditor(){activeNbId=null;activeNoteId=null;document.getElementById('notes-editor-wrap').classList.remove('visible');renderNotebooks();}

  function renderNoteList(){const nb=notebooks.find(n=>n.id===activeNbId);if(!nb)return;const c=document.getElementById('note-list-items');c.innerHTML='';(nb.notes||[]).forEach(note=>{const item=document.createElement('div');item.className='note-list-item'+(note.id===activeNoteId?' active':'');item.innerHTML=`<div class="note-list-title">${note.title||'Untitled'}</div><div class="note-list-date">${fmtDate(note.updated)}</div>`;item.onclick=()=>loadNote(note.id);c.appendChild(item);});}

  function loadNote(noteId){const nb=notebooks.find(n=>n.id===activeNbId);const note=(nb.notes||[]).find(n=>n.id===noteId);if(!note)return;activeNoteId=noteId;document.getElementById('empty-msg').style.display='none';const ed=document.getElementById('active-note-editor');ed.style.display='flex';document.getElementById('note-title').value=note.title||'';document.getElementById('note-body').innerHTML=note.body||'';document.getElementById('note-meta').textContent='Last edited: '+fmtDate(note.updated);renderNoteList();}
  function clearEditor(){activeNoteId=null;document.getElementById('empty-msg').style.display='flex';document.getElementById('active-note-editor').style.display='none';}

  function addNote(){const nb=notebooks.find(n=>n.id===activeNbId);if(!nb)return;if(!nb.notes)nb.notes=[];const note={id:Date.now().toString(),title:'',body:'',updated:Date.now()};nb.notes.unshift(note);saveData();renderNoteList();loadNote(note.id);document.getElementById('note-title').focus();}
  function deleteNote(){if(!confirm('Delete this note?'))return;const nb=notebooks.find(n=>n.id===activeNbId);nb.notes=(nb.notes||[]).filter(n=>n.id!==activeNoteId);saveData();renderNoteList();if(nb.notes.length)loadNote(nb.notes[0].id);else clearEditor();renderNotebooks();}

  function autosave(){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>{const nb=notebooks.find(n=>n.id===activeNbId);const note=(nb.notes||[]).find(n=>n.id===activeNoteId);if(!note)return;note.title=document.getElementById('note-title').value;note.body=document.getElementById('note-body').innerHTML;note.updated=Date.now();saveData();document.getElementById('note-meta').textContent='Last edited: '+fmtDate(note.updated);document.getElementById('autosave-label').textContent='Saved ';setTimeout(()=>{document.getElementById('autosave-label').textContent='';},1500);renderNoteList();renderNotebooks();},600);}

  function execFmt(cmd){document.execCommand(cmd,false,null);document.getElementById('note-body').focus();autosave();}
  function execFmtArg(cmd,val){document.execCommand(cmd,false,val);document.getElementById('note-body').focus();autosave();}
  function fmtDate(ts){if(!ts)return'';return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}

  var nbOverlay = document.getElementById('nb-overlay');
  if (nbOverlay) nbOverlay.addEventListener('click', function(e){ if (e.target === this) closeNbModal(); });

  function bootNotesPage() {
    if (typeof initSidebar === 'function') initSidebar('notes');
    renderNotebooks();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNotesPage);
  } else {
    bootNotesPage();
  }
