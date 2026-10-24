/** Page script for call.html — keep HTML in the .html file. */
const ORGS = [
    { id:'ssg',  icon:'🏛️', name:'Supreme Student Government', desc:'The highest governing body of student affairs. Represents all students in policy-making and organizes campus-wide events.', color:'#7c3aed', tags:[{l:'Governance',c:'#ede9fe',t:'#7c3aed'}], members:['A','B','C','D','E'] },
    { id:'jpia', icon:'📊', name:'JPIA — Junior Phil. Inst. of Accountants', desc:'Organization for accountancy and business students. Hosts seminars, review sessions, and competitions.', color:'#2563eb', tags:[{l:'Accountancy',c:'#dbeafe',t:'#1d4ed8'}], members:['A','B','C'] },
    { id:'css',  icon:'💻', name:'Computer Students Society', desc:'For IT and CS students passionate about technology, programming, and digital innovation. Regular hackathons and workshops.', color:'#0d9488', tags:[{l:'IT / CS',c:'#d1fae5',t:'#065f46'}], members:['A','B','C','D'] },
    { id:'envi', icon:'🌱', name:'Environmental Awareness Club', desc:'Dedicated to promoting sustainability, environmental education, and campus beautification projects.', color:'#15803d', tags:[{l:'Environment',c:'#dcfce7',t:'#15803d'}], members:['A','B','C'] },
    { id:'arts', icon:'🎨', name:'Arts & Culture Guild', desc:'Celebrates Filipino arts, music, dance, and culture. Organizes cultural shows and represents the campus in competitions.', color:'#be123c', tags:[{l:'Arts',c:'#ffe4e6',t:'#be123c'}], members:['A','B','C','D','E'] },
    { id:'red',  icon:'❤️', name:'Red Cross Youth', desc:'CTU chapter of the Philippine Red Cross Youth. Trains in first aid, disaster preparedness, and community service.', color:'#dc2626', tags:[{l:'Humanitarian',c:'#fee2e2',t:'#dc2626'}], members:['A','B','C'] },
  ];

  const ARTICLES = [
    { type:'News', title:'CTU Daanbantayan Launches New PRISM Portal', teaser:'The campus unveils its new digital learning portal, PRISM, designed to streamline student access to academic resources.', date:'Mar 12, 2026' },
    { type:'Feature', title:'The Fishermen Who Code', teaser:'A look into how BSIT students are blending maritime heritage with modern technology skills.', date:'Mar 8, 2026' },
    { type:'Editorial', title:'Digital Literacy in Rural Campuses', teaser:'Why internet access and digital tools are as critical as textbooks in today\'s education landscape.', date:'Mar 5, 2026' },
    { type:'Sports', title:'CTU Wins Regional Volleyball Championship', teaser:'The CTU Daanbantayan women\'s volleyball team clinched the regional title in a thrilling five-set match.', date:'Feb 28, 2026' },
    { type:'Opinion', title:'Making the Most of Online Learning', teaser:'Students share their tips and strategies for staying productive and engaged in hybrid classes.', date:'Feb 22, 2026' },
    { type:'Campus Life', title:'Fiesta ni CTU: A Week of Celebration', teaser:'Highlights from the annual campus fiesta featuring cultural performances, food stalls, and talent shows.', date:'Feb 15, 2026' },
  ];

  /** Set true when org enrollment is implemented server-side */
  const ORG_JOIN_ENABLED = false;

  let membership = JSON.parse(localStorage.getItem('prism_org_membership') || '{}');

  function renderOrgs() {
    const grid = document.getElementById('orgs-grid');
    grid.className = ORG_JOIN_ENABLED ? 'orgs-grid' : 'orgs-grid orgs-grid--join-placeholder';
    grid.innerHTML = '';
    ORGS.forEach((org, i) => {
      const isMember = !!membership[org.id];
      const card = document.createElement('div');
      card.className = 'org-card';
      card.style.animationDelay = (i * 0.06) + 's';
      let joinHtml;
      if (ORG_JOIN_ENABLED) {
        joinHtml = `<button type="button" class="join-btn ${isMember ? 'member' : 'join'}" onclick="toggleMembership('${org.id}',this)">${isMember ? '✅ Joined' : 'Join Organization'}</button>`;
      } else {
        joinHtml = '<button type="button" class="join-btn join join--placeholder" disabled title="Organization sign-up is not available yet">Coming soon</button>';
      }
      card.innerHTML = `
        <div class="org-card-banner" style="background:${org.color}"></div>
        <div class="org-card-body">
          <div class="org-icon">${org.icon}</div>
          <div class="org-name">${org.name}</div>
          <div class="org-desc">${org.desc}</div>
          <div class="org-meta">${org.tags.map(t=>`<span class="org-tag" style="background:${t.c};color:${t.t}">${t.l}</span>`).join('')}</div>
          <div class="org-members">
            <div class="org-avatars">${org.members.map((m,j)=>`<div class="org-avatar" style="background:linear-gradient(135deg,${org.color},${shadeColor(org.color,40)})">${m}</div>`).join('')}</div>
            <span class="org-members-count">${org.members.length}${ORG_JOIN_ENABLED && isMember ? '+1' : ''} members</span>
          </div>
          ${joinHtml}
        </div>`;
      grid.appendChild(card);
    });
  }

  function toggleMembership(id, btn) {
    if (!ORG_JOIN_ENABLED) return;
    membership[id] = !membership[id];
    localStorage.setItem('prism_org_membership', JSON.stringify(membership));
    renderOrgs();
  }

  function renderArticles() {
    const grid = document.getElementById('articles-grid');
    const colors = { News:'#dbeafe', Feature:'#ede9fe', Editorial:'#fce7f3', Sports:'#d1fae5', Opinion:'#fef3c7', 'Campus Life':'#f0fdf4' };
    const tcolors= { News:'#1d4ed8', Feature:'#7c3aed', Editorial:'#9d174d', Sports:'#065f46', Opinion:'#92400e', 'Campus Life':'#15803d' };
    grid.innerHTML = ARTICLES.map(a => `
      <div class="article-card">
        <div class="article-type" style="color:${tcolors[a.type]||'#a78bfa'}">${a.type}</div>
        <div class="article-title">${a.title}</div>
        <div class="article-teaser">${a.teaser}</div>
        <div class="article-meta">📅 ${a.date}</div>
      </div>`).join('');
  }

  function shadeColor(hex, amount) {
    try { let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); r=Math.min(255,r+amount);g=Math.min(255,g+amount);b=Math.min(255,b+amount); return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`; } catch(e){return hex;}
  }

  renderOrgs();
  renderArticles();

window.addEventListener('DOMContentLoaded', function() {
    if (typeof initSidebar === 'function') initSidebar('call');
  });
