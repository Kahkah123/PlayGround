(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const STAGES = ['Youth League', 'High School', 'College', 'Pro League'];
  const POSITIONS = ['Quarterback', 'Running Back', 'Wide Receiver', 'Linebacker', 'Safety', 'Return Specialist'];
  const SHORT = {'Quarterback':'QB','Running Back':'RB','Wide Receiver':'WR','Linebacker':'LB','Safety':'S','Return Specialist':'RS'};
  const DEFAULT = {first:'Jordan',last:'Carter',position:'Quarterback',stage:0,practices:0,stagePractices:0,plays:0,stagePlays:0,yards:0,touchdowns:0,bigPlays:0,tackles:0,clutch:0,work:0,boosts:[0,0,0,0],nickname:'',home:0,away:0,down:1,toGo:10,yard:25,quarter:1,drivePlays:0,feed:'Every great story starts with a first snap. Let’s see what you’ve got.'};
  let state;
  try { state = {...DEFAULT, ...JSON.parse(localStorage.getItem('gridiron-glory-save') || '{}')}; } catch { state = {...DEFAULT}; }
  state.boosts = Array.isArray(state.boosts) ? state.boosts : [0,0,0,0];
  let chosenPlay = 'Inside Run';
  let inPlay = false;
  let toastTimer;
  const save = () => { try { localStorage.setItem('gridiron-glory-save', JSON.stringify(state)); } catch {} };
  const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function hashName(name) { let h = 2166136261; for (const c of name.trim().toLowerCase().replace(/\s+/g,' ')) { h ^= c.charCodeAt(0); h = Math.imul(h,16777619); } return h >>> 0; }
  function attributes() { let h = hashName(state.first + ' ' + state.last); return [0,1,2,3].map((_,i) => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + i) >>> 0; return Math.min(99, 58 + h % 17 + (state.boosts[i] || 0)); }); }
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000); }
  const ordinal = n => ['1ST','2ND','3RD','4TH'][n-1] || `${n}TH`;
  function updateNickname() {
    if (state.nickname) return;
    if (state.clutch >= 2) state.nickname = 'The Closer';
    else if (state.bigPlays >= 3) state.nickname = 'Human Highlight';
    else if (state.work >= 4) state.nickname = 'First In, Last Out';
    else if (state.tackles >= 5) state.nickname = 'The Enforcer';
    if (state.nickname) { state.feed = `${state.first} “${state.nickname}” ${state.last}. Remember the name. The locker room already does.`; toast(`NICKNAME EARNED: ${state.nickname.toUpperCase()}`); }
  }
  function render() {
    const attrs = attributes(), name = `${state.first} ${state.last}`, initials = (state.first[0] + state.last[0]).toUpperCase();
    $('#profile-initials').textContent = initials; $('#top-initials').textContent = initials;
    $('#side-name').textContent = name; $('#side-position').textContent = `${SHORT[state.position] || 'QB'} · ${STAGES[state.stage].toUpperCase()}`;
    $('#player-name').innerHTML = `${escapeHTML(state.first.toUpperCase())}<br>${escapeHTML(state.last.toUpperCase())}`;
    $('#player-sub').textContent = `#12  /  ${state.position.toUpperCase()}`;
    $('#overall').textContent = Math.round(attrs.reduce((a,b) => a+b,0)/4);
    $('#stage-name').textContent = STAGES[state.stage].toUpperCase();
    $('#depth-name').textContent = state.stagePractices >= 3 && state.stagePlays >= 3 ? 'STARTER' : '2ND STRING';
    $('#side-progress').textContent = `0${state.stage+1} / 04`;
    $('.progress-line span').style.width = `${(state.stage+1)*25}%`;
    $('#attribute-grid').innerHTML = ['SPEED','STRENGTH','AWARENESS','AGILITY'].map((label,i)=>`<div class="attribute">${label}<b>${attrs[i]}</b><div class="stat-line"><i style="width:${attrs[i]}%"></i></div></div>`).join('');
    $('#nickname').textContent = state.nickname ? state.nickname.toUpperCase() : 'NOT EARNED YET';
    $('#nickname-desc').textContent = state.nickname ? 'Earned on the field. Yours for the journey.' : 'Your game will do the talking.';
    $('#feed-text').textContent = `“${state.feed}”`;
    $('#home-score').textContent = String(state.home).padStart(2,'0'); $('#away-score').textContent = String(state.away).padStart(2,'0');
    $('#quarter-label').textContent = `${ordinal(state.quarter)} QUARTER`;
    $('#situation').innerHTML = `${ordinal(state.down)} &amp; ${state.toGo} <span>·</span> BALL ON ${state.yard}`;
    if (field) field.setSituation({yard:state.yard,down:state.down,toGo:state.toGo});
    save();
  }
  function endPlay(result) {
    inPlay = false; $('#snap-btn').disabled = false; $('#snap-btn').innerHTML = 'RUN THE PLAY <svg><use href="#i-arrow"/></svg>';
    const yards = Math.max(-5, Math.round(result.yards || 0));
    state.plays++; state.stagePlays++; state.drivePlays++; state.yards += yards;
    if (yards >= 15) state.bigPlays++;
    if (yards <= 2) state.tackles++;
    let message = result.message || `${yards >= 0 ? '+' : ''}${yards} YARDS`;
    if (result.touchdown || state.yard + yards >= 100) {
      state.home += 7; state.touchdowns++; if (state.quarter === 4) state.clutch++;
      message = 'TOUCHDOWN! +7 POINTS'; state.yard = 25; state.down = 1; state.toGo = 10;
      state.feed = `${state.first} ${state.last} finds the end zone! That's the kind of play that gets noticed.`;
      if (state.drivePlays >= 4) { state.away += 3; state.drivePlays = 0; }
    } else if (result.turnover) {
      state.away += 3; state.yard = 25; state.down = 1; state.toGo = 10; message = 'TURNOVER — NEW DRIVE';
    } else {
      state.yard = Math.max(1, Math.min(99, state.yard + yards));
      if (yards >= state.toGo) { state.down = 1; state.toGo = Math.min(10,100-state.yard); message += ' · FIRST DOWN!'; }
      else { state.toGo = Math.max(1, state.toGo - yards); state.down++; if (state.down > 4) { state.away += 3; state.yard = 25; state.down = 1; state.toGo = 10; message = 'TURNOVER ON DOWNS · NEW DRIVE'; } }
      state.feed = yards >= 10 ? `${state.first} ${state.last} breaks free for ${yards} yards. The coaches are taking notice.` : `${state.first} ${state.last} is putting in the reps. Every snap is a chance to get better.`;
    }
    if (state.plays % 5 === 0) state.quarter = Math.min(4, state.quarter+1);
    updateNickname(); render(); $('#field-status').textContent = 'PRE-SNAP'; toast(message);
  }
  let field = new FootballField($('#field'), {onPlayEnd:endPlay, onStatus:text => { $('#field-status').textContent = text.toUpperCase(); }});
  function snap() {
    if (inPlay) return;
    inPlay = true; $('#field-overlay').classList.add('hidden'); $('#snap-btn').disabled = true; $('#snap-btn').textContent = 'PLAY IN PROGRESS';
    field.startPlay(chosenPlay);
  }
  $('#snap-btn').addEventListener('click',snap);
  $$('.play-option').forEach(button => button.addEventListener('click', () => { if(inPlay) return; chosenPlay=button.dataset.play; $$('.play-option').forEach(b=>b.classList.toggle('active',b===button)); field.reset(); }));
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat && $('#modal-backdrop').classList.contains('hidden') && !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); snap(); } });
  $$('[data-dir]').forEach(button => { const dir = button.dataset.dir; button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); field.setInput(dir,true); }); ['pointerup','pointercancel','lostpointercapture'].forEach(event => button.addEventListener(event,() => field.setInput(dir,false))); });
  function openModal(html) { $('#modal-content').innerHTML = html; $('#modal-backdrop').classList.remove('hidden'); }
  function closeModal() { $('#modal-backdrop').classList.add('hidden'); }
  $('#modal-close').onclick=closeModal; $('#modal-backdrop').addEventListener('click', e => { if(e.target.id==='modal-backdrop') closeModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });
  function playerModal() {
    const a=attributes();
    openModal(`<div class="eyebrow"><span></span> YOUR STORY, YOUR PLAYER</div><h2 id="modal-title">CREATE YOUR LEGACY.</h2><p>Your name seeds your starting attributes. Switch positions any time; your career progress stays with you.</p><form id="player-form"><div class="form-grid"><div><label for="first">FIRST NAME</label><input id="first" maxlength="20" required value="${escapeHTML(state.first)}"></div><div><label for="last">LAST NAME</label><input id="last" maxlength="20" required value="${escapeHTML(state.last)}"></div></div><div class="modal-section"><label for="position">PRIMARY POSITION</label><select id="position">${POSITIONS.map(p=>`<option ${p===state.position?'selected':''}>${p}</option>`).join('')}</select></div><div class="modal-section"><span class="tiny-label">CURRENT PROFILE &nbsp; · &nbsp; SPD ${a[0]} &nbsp; STR ${a[1]} &nbsp; AWR ${a[2]} &nbsp; AGI ${a[3]}</span></div><button class="primary-btn" type="submit">SAVE PLAYER <span>→</span></button></form>`);
    $('#player-form').onsubmit = e => { e.preventDefault(); const first=$('#first').value.trim(),last=$('#last').value.trim(); if(!first || !last) return; state.first=first;state.last=last;state.position=$('#position').value;state.feed=`${first} ${last} is ready to make a name in ${STAGES[state.stage]}.`;render();closeModal();toast('PLAYER PROFILE SAVED'); };
  }
  function practiceModal() {
    openModal(`<div class="eyebrow"><span></span> EARN YOUR SPOT</div><h2 id="modal-title">PUT IN THE WORK.</h2><p>Every rep builds your attributes and work ethic. Three practices and three plays earn the starting job at your current level.</p><div class="modal-list"><div class="modal-row"><div><strong>FULL TEAM SCRIMMAGE</strong><small>11-on-11 field reps · + awareness</small></div><button data-drill="2">TRAIN +1</button></div><div class="modal-row"><div><strong>7-ON-7 ROUTE TIMING</strong><small>Sharpen your cuts · + agility</small></div><button data-drill="3">TRAIN +1</button></div><div class="modal-row"><div><strong>BLOCKING ASSIGNMENTS</strong><small>Win at the line · + strength</small></div><button data-drill="1">TRAIN +1</button></div><div class="modal-row"><div><strong>POCKET & SPEED DRILLS</strong><small>Quick feet, quick decisions · + speed</small></div><button data-drill="0">TRAIN +1</button></div></div><p style="margin-top:16px">THIS STAGE: ${state.stagePractices} PRACTICES / ${state.stagePlays} PLAYS &nbsp; · &nbsp; WORK ETHIC ${state.work}</p>`);
    $$('[data-drill]').forEach(b=>b.onclick=()=>{ let i=Number(b.dataset.drill); state.boosts[i]++;state.practices++;state.stagePractices++;state.work++;state.feed=`${state.first} ${state.last} stayed late after practice. Coaches love the work ethic.`;updateNickname();render();practiceModal();toast('REP COMPLETE · ATTRIBUTE +1'); });
  }
  function careerModal() {
    const ready=state.stagePractices>=3&&state.stagePlays>=3;
    openModal(`<div class="eyebrow"><span></span> THE ROAD TO STARDOM</div><h2 id="modal-title">EVERY LEGEND STARTS HERE.</h2><p>Earn the starting job with 3 practices and 3 plays at each level, then take your next step.</p><div class="modal-list">${STAGES.map((stage,i)=>`<div class="modal-row"><div><strong>0${i+1} &nbsp; ${stage.toUpperCase()}</strong><small>${['Learn the game and earn your first start','Compete for a spot under the lights','Get noticed by the next level','Make your mark on the league'][i]}</small></div><span class="stage-badge">${i<state.stage?'COMPLETE':i===state.stage?'CURRENT':'LOCKED'}</span></div>`).join('')}</div><p style="margin-top:16px">CURRENT PROGRESS: ${Math.min(3,state.stagePractices)}/3 PRACTICES &nbsp; · &nbsp; ${Math.min(3,state.stagePlays)}/3 PLAYS</p>${state.stage<3?`<button id="advance" class="primary-btn" ${ready?'':'disabled'} style="opacity:${ready?1:.45}">${state.stage===2?'ENTER THE PRO DRAFT':'ADVANCE TO '+STAGES[state.stage+1].toUpperCase()} <span>→</span></button>`:'<p style="margin-top:15px;color:#f3955c">YOU MADE IT. NOW KEEP BUILDING YOUR LEGACY.</p>'}`);
    const advance=$('#advance'); if(advance) advance.onclick=()=>{ if(!ready)return;state.stage++;state.stagePractices=0;state.stagePlays=0;state.quarter=1;state.home=0;state.away=0;state.yard=25;state.down=1;state.toGo=10;state.feed=state.stage===3?`${state.first} ${state.last} has been drafted by Chicago. The pro journey starts now.`:`${state.first} ${state.last} has advanced to ${STAGES[state.stage]}. A new chapter begins.`;render();careerModal();toast(state.stage===3?'DRAFTED BY CHICAGO!':'NEW CHAPTER UNLOCKED'); };
  }
  function standingsModal() { openModal(`<div class="eyebrow"><span></span> CAREER SCRIMMAGE</div><h2 id="modal-title">THE SCOREBOARD.</h2><p>Your current scrimmage results and career production.</p><div class="modal-list"><div class="modal-row"><div><strong>CHICAGO BEARS</strong><small>YOUR TEAM</small></div><span class="stage-badge">${state.home} PTS</span></div><div class="modal-row"><div><strong>GREEN BAY PACKERS</strong><small>OPPONENT</small></div><span class="stage-badge">${state.away} PTS</span></div><div class="modal-row"><div><strong>YOUR CAREER</strong><small>${state.plays} PLAYS · ${state.yards} YARDS · ${state.touchdowns} TOUCHDOWNS</small></div><span class="stage-badge">${STAGES[state.stage].toUpperCase()}</span></div></div>`); }
  function helpModal() { openModal(`<div class="eyebrow"><span></span> KNOW THE GAME</div><h2 id="modal-title">TIME TO BALL.</h2><p>Pick a play and hit RUN THE PLAY or press Space. Move your highlighted player with WASD or the arrow keys; hold Shift to sprint. On touchscreens, use the on-screen controls.</p><div class="modal-list"><div class="modal-row"><div><strong>MOVE THE CHAINS</strong><small>Gain 10 yards in four downs for a first down. Reach the end zone for a touchdown.</small></div></div><div class="modal-row"><div><strong>BUILD YOUR PLAYER</strong><small>Train in Practice, earn your starting spot, and advance through four career stages.</small></div></div><div class="modal-row"><div><strong>EARN YOUR NAME</strong><small>Consistent training and standout plays can earn a permanent nickname.</small></div></div></div><p style="margin-top:16px">This is a fictional career simulation using team references. Players and rosters are simulated, not current licensed rosters.</p>`); }
  function settingsModal() { openModal(`<div class="eyebrow"><span></span> YOUR GAME</div><h2 id="modal-title">SETTINGS.</h2><p>Your career saves automatically on this device.</p><div class="modal-list"><div class="modal-row"><div><strong>HOW TO PLAY</strong><small>Controls, rules, and career tips</small></div><button id="settings-help">VIEW</button></div><div class="modal-row"><div><strong>RESET CAREER</strong><small>Erase this device's career progress</small></div><button id="reset-career">RESET</button></div></div>`); $('#settings-help').onclick=helpModal;$('#reset-career').onclick=()=>{if(confirm('Reset your entire career? This cannot be undone.')){state={...DEFAULT,boosts:[0,0,0,0]};render();field.reset();closeModal();toast('CAREER RESET');}}; }
  function navigate(view) { if(view==='player') playerModal(); else if(view==='practice') practiceModal(); else if(view==='career') careerModal(); else if(view==='standings') standingsModal(); else if(view==='settings') settingsModal(); else { closeModal(); if(view==='game') $('#field').scrollIntoView({behavior:'smooth',block:'center'}); else window.scrollTo({top:0,behavior:'smooth'}); } }
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
  $$('[data-open]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.open)));
  $('#edit-profile').onclick=playerModal;$('#player-edit-btn').onclick=playerModal;$('#spotlight-edit').onclick=playerModal;$('#help-btn').onclick=helpModal;
  render();
})();
