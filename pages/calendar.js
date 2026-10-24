/** Page script for calendar.html — keep HTML in the .html file. */
if (typeof initSidebar === 'function') initSidebar('calendar');

 const COLORS = ['#e74c3c','#6d28d9','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63','#607d8b'];
 const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
 const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

 let today = new Date();
 let viewYear = today.getFullYear();
 let viewMonth = today.getMonth();
 let events = JSON.parse(localStorage.getItem('prism_events') || '[]');
 let editingId = null;
 let selColor = COLORS[2];

 // Load events from API on startup
 (async function() {
   try {
     const apiEvents = await PrismEvents.get();
     events = apiEvents.map(e => ({
       id: e.id, title: e.title, date: e.event_date,
       time: e.event_time||'', notes: e.notes||'',
       alarm: e.alarm!==null ? e.alarm : '',
       color: e.color||COLORS[2]
     }));
     localStorage.setItem('prism_events', JSON.stringify(events));
     renderCalendar();
     events.forEach(scheduleAlarm);
   } catch(ex) {
     console.warn('Could not load events from API:', ex.message);
     events.forEach(scheduleAlarm);
   }
 })();

 // Color chips
 const colorRow = document.getElementById('color-row');
 COLORS.forEach(c => {
 const chip = document.createElement('div');
 chip.className = 'color-chip'; chip.style.background = c; chip.dataset.color = c;
 chip.onclick = () => selectColor(c);
 colorRow.appendChild(chip);
 });
 selectColor(COLORS[2]);

 function selectColor(c) {
 selColor = c;
 document.querySelectorAll('.color-chip').forEach(ch => ch.classList.toggle('selected', ch.dataset.color === c));
 }

 function saveEvents() {
   localStorage.setItem('prism_events', JSON.stringify(events));
 }


 function renderCalendar() {
 const grid = document.getElementById('cal-grid');
 grid.innerHTML = '';
 document.getElementById('month-label').textContent = MONTHS[viewMonth] + ' ' + viewYear; 

 DAYS.forEach(d => {
 const el = document.createElement('div');
 el.className = 'cal-day-name'; el.textContent = d; grid.appendChild(el);
 });

 const firstDay = new Date(viewYear, viewMonth, 1).getDay();
 const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
 const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

 for (let i = firstDay-1; i >= 0; i--) addCell(grid, daysInPrev-i, viewMonth-1, viewYear, true);
 for (let d = 1; d <= daysInMonth; d++) addCell(grid, d, viewMonth, viewYear, false);
 const total = firstDay + daysInMonth;
 const rem = total % 7 === 0 ? 0 : 7-(total%7);
 for (let d = 1; d <= rem; d++) addCell(grid, d, viewMonth+1, viewYear, true);

 renderEventsList();
 }

 function addCell(grid, day, month, year, otherMonth) {
 const rm = ((month%12)+12)%12;
 const ry = year + Math.floor(month/12);
 const ds = `${ry}-${String(rm+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 const devs = events.filter(e => e.date === ds);
 const isTd = day===today.getDate() && rm===today.getMonth() && ry===today.getFullYear();

 const cell = document.createElement('div');
 cell.className = 'cal-cell' + (otherMonth?' other-month':'') + (isTd?' today':'') + (devs.length?' has-events':'');

 const num = document.createElement('div');
 num.className = 'cell-num'; num.textContent = day; cell.appendChild(num);

 devs.slice(0,3).forEach(ev => {
 const dot = document.createElement('span');
 dot.className = 'event-dot'; dot.textContent = ev.title; dot.style.background = ev.color || '#6d28d9';
 cell.appendChild(dot);
 });

 if (!otherMonth) cell.onclick = () => openAddEvent(ds);
 grid.appendChild(cell);
 }

 function renderEventsList() {
 const list = document.getElementById('events-list');
 const sorted = [...events].sort((a,b)=>a.date.localeCompare(b.date));
 const upcoming = sorted.filter(e => e.date >= today.toISOString().split('T')[0]);

 if (!upcoming.length) { list.innerHTML = '<div class="no-events">No upcoming events. Click a date or + Add Event to create one.</div>'; return; }
 list.innerHTML = '';
 upcoming.forEach(ev => {
 const item = document.createElement('div');
 item.className = 'ev-item'; item.onclick = () => openEditEvent(ev.id);
 const dl = new Date(ev.date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
 const bar = `<div class="ev-color-bar" style="background:${ev.color||'#6d28d9'}"></div>`;
 const info = `<div class="ev-info"><div class="ev-title">${ev.title}</div><div class="ev-meta">${dl}${ev.time?' · '+fmtTime(ev.time):''}${ev.notes?' · '+ev.notes.substring(0,40):''}</div></div>`;
 const alarm = (ev.alarm!==''&&ev.alarm!==undefined) ? '<span class="ev-alarm-badge"></span>' : '';
 item.innerHTML = bar + info + alarm;
 list.appendChild(item);
 });
 }

 function fmtTime(t) {
 if (!t) return '';
 const [h,m] = t.split(':'); const hr = parseInt(h);
 return ((hr%12)||12)+':'+m+(hr>=12?' PM':' AM');
 }

 function openAddEvent(ds) {
 editingId = null;
 document.getElementById('ev-modal-title').textContent = 'Add Event';
 document.getElementById('ev-title').value = '';
 document.getElementById('ev-date').value = ds || today.toISOString().split('T')[0];
 document.getElementById('ev-time').value = '';
 document.getElementById('ev-notes').value = '';
 document.getElementById('ev-alarm').value = '';
 selectColor(COLORS[2]);
 document.getElementById('ev-actions').innerHTML = `<button class="ev-btn cancel" onclick="closeEvModal()">Cancel</button><button class="ev-btn save" onclick="saveEvent()">Save Event</button>`;
 document.getElementById('ev-overlay').classList.add('active');
 }

 function openEditEvent(id) {
 const ev = events.find(e=>e.id===id); if (!ev) return;
 editingId = id;
 document.getElementById('ev-modal-title').textContent = 'Edit Event';
 document.getElementById('ev-title').value = ev.title;
 document.getElementById('ev-date').value = ev.date;
 document.getElementById('ev-time').value = ev.time||'';
 document.getElementById('ev-notes').value = ev.notes||'';
 document.getElementById('ev-alarm').value = ev.alarm!==undefined?ev.alarm:'';
 selectColor(ev.color||COLORS[2]);
 document.getElementById('ev-actions').innerHTML = `<button class="ev-btn delete" onclick="deleteEvent('${id}')">Delete</button><button class="ev-btn cancel" onclick="closeEvModal()">Cancel</button><button class="ev-btn save" onclick="saveEvent()">Update</button>`;
 document.getElementById('ev-overlay').classList.add('active');
 }

 function closeEvModal() { document.getElementById('ev-overlay').classList.remove('active'); }

 async function saveEvent() {
   const title = document.getElementById('ev-title').value.trim();
   const date  = document.getElementById('ev-date').value;
   if (!title) { alert('Please enter an event title.'); return; }
   if (!date)  { alert('Please select a date.'); return; }
   const ev = {
     id: editingId||Date.now().toString(), title, date,
     time:  document.getElementById('ev-time').value,
     notes: document.getElementById('ev-notes').value.trim(),
     alarm: document.getElementById('ev-alarm').value,
     color: selColor
   };
   try {
     const saved = await PrismEvents.save({
       id: ev.id, title: ev.title, date: ev.date,
       time: ev.time||null, notes: ev.notes,
       alarm: ev.alarm!==''?parseInt(ev.alarm):null,
       color: ev.color
     });
     if (saved.id) ev.id = saved.id;
   } catch(e) { console.warn('API save failed:', e.message); }
   if (editingId) { events[events.findIndex(e=>e.id===editingId)] = ev; } else { events.push(ev); }
   saveEvents(); scheduleAlarm(ev); closeEvModal(); renderCalendar();
 }

 async function deleteEvent(id) {
   if (!confirm('Delete this event?')) return;
   try { await PrismEvents.delete(id); } catch(e) { console.warn('API delete failed:', e.message); }
   events = events.filter(e=>e.id!==id); saveEvents(); closeEvModal(); renderCalendar();
 }

 function changeMonth(dir) {
 viewMonth += dir;
 if (viewMonth>11){viewMonth=0;viewYear++;} if (viewMonth<0){viewMonth=11;viewYear--;}
 renderCalendar();
 }

 /** Short chime using Web Audio (works after a user gesture on most browsers). */
 function playPrismAlarmSound() {
 try {
   const AC = window.AudioContext || window.webkitAudioContext;
   if (!AC) return;
   const ctx = new AC();
   function beep(freq, t0) {
     const o = ctx.createOscillator();
     const g = ctx.createGain();
     o.connect(g);
     g.connect(ctx.destination);
     o.frequency.value = freq;
     o.type = 'sine';
     const t = ctx.currentTime + t0;
     g.gain.setValueAtTime(0.0001, t);
     g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
     g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
     o.start(t);
     o.stop(t + 0.23);
   }
   beep(880, 0);
   beep(660, 0.28);
   beep(880, 0.56);
   setTimeout(function() { ctx.close().catch(function() {}); }, 1200);
 } catch (e) { /* ignore */ }
 }

 function scheduleAlarm(ev) {
 if (!ev.time) return;
 if (ev.alarm === '' || ev.alarm === null || ev.alarm === undefined) return;
 const mins = parseInt(ev.alarm, 10);
 if (isNaN(mins)) return;
 const [y,m,d]=ev.date.split('-').map(Number), [h,min]=ev.time.split(':').map(Number);
 const diff = new Date(y,m-1,d,h,min,0).getTime() - mins*60000 - Date.now();
 if (diff>0) setTimeout(function(){
   playPrismAlarmSound();
   if (Notification.permission==='granted') new Notification('PRISM Reminder', { body: ev.title });
   else alert('Reminder: '+ev.title);
 }, diff);
 }

 if ('Notification' in window && Notification.permission==='default') Notification.requestPermission();
 document.getElementById('ev-overlay').addEventListener('click',function(e){if(e.target===this)closeEvModal();});
 renderCalendar();
